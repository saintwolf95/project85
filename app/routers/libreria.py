from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel
import logging
from pypdf import PdfReader
from docx import Document
import io

from ..database import get_db
from ..models import LibreriaDocumento
from ..schemas import LibreriaDocumentoResponse, LibreriaChatRequest, LibreriaChatResponse
from ..api.deps import get_current_user_empresa
from ..copilot_service import get_openai_client

router = APIRouter()
logger = logging.getLogger(__name__)

async def extract_text_from_upload(file: UploadFile) -> str:
    content = await file.read()
    filename = file.filename.lower()
    
    text = ""
    try:
        if filename.endswith('.pdf'):
            reader = PdfReader(io.BytesIO(content))
            for page in reader.pages:
                text += page.extract_text() + "\n"
        elif filename.endswith('.docx'):
            doc = Document(io.BytesIO(content))
            for para in doc.paragraphs:
                text += para.text + "\n"
        else:
            # Assume it's text (txt, csv)
            text = content.decode('utf-8')
    except Exception as e:
        logger.error(f"Error extrayendo texto del archivo {filename}: {e}")
        text = "No se pudo extraer texto. Error: " + str(e)
        
    return text.strip()

@router.post("/upload", response_model=LibreriaDocumentoResponse)
async def upload_document(
    file: UploadFile = File(...),
    department: str = Form(...),
    empresa_id: int = Depends(get_current_user_empresa),
    db: Session = Depends(get_db)
):
    try:
        # Extraer texto
        text_content = await extract_text_from_upload(file)
        
        # Guardar en BD
        doc = LibreriaDocumento(
            empresa_id=empresa_id,
            filename=file.filename,
            department=department,
            content_text=text_content
        )
        db.add(doc)
        db.commit()
        db.refresh(doc)
        
        return doc
    except Exception as e:
        logger.error(f"Error subiendo documento a LibrerIA: {e}")
        raise HTTPException(status_code=500, detail="Error al subir el documento")

@router.get("/documents", response_model=List[LibreriaDocumentoResponse])
async def get_documents(
    empresa_id: int = Depends(get_current_user_empresa),
    db: Session = Depends(get_db)
):
    return db.query(LibreriaDocumento).filter(LibreriaDocumento.empresa_id == empresa_id).order_by(LibreriaDocumento.upload_date.desc()).all()

@router.delete("/documents/{doc_id}")
async def delete_document(
    doc_id: int,
    empresa_id: int = Depends(get_current_user_empresa),
    db: Session = Depends(get_db)
):
    doc = db.query(LibreriaDocumento).filter(LibreriaDocumento.id == doc_id, LibreriaDocumento.empresa_id == empresa_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Documento no encontrado")
    
    db.delete(doc)
    db.commit()
    return {"status": "success"}

@router.post("/ask", response_model=LibreriaChatResponse)
async def ask_libreria(
    request: LibreriaChatRequest,
    empresa_id: int = Depends(get_current_user_empresa),
    db: Session = Depends(get_db)
):
    query = db.query(LibreriaDocumento).filter(LibreriaDocumento.empresa_id == empresa_id)
    
    if request.department_filter and request.department_filter != "all":
        query = query.filter(LibreriaDocumento.department == request.department_filter)
        
    docs = query.all()
    
    if not docs:
        return LibreriaChatResponse(answer="No hay documentos subidos para este departamento. Sube algunos archivos primero para que pueda leerlos.", context_docs=0)
        
    # Construir el contexto
    context = ""
    for doc in docs:
        context += f"\n--- INICIO DEL DOCUMENTO: {doc.filename} (Departamento: {doc.department}) ---\n"
        context += doc.content_text
        context += f"\n--- FIN DEL DOCUMENTO: {doc.filename} ---\n"
        
    # Limitar el contexto groseramente si es absurdamente gigante (ej: más de 200k caracteres)
    if len(context) > 200000:
        context = context[:200000] + "\n...[Texto truncado por límite de memoria]..."
        
    client = get_openai_client()
    if not client:
        return LibreriaChatResponse(answer="Error: API Key de OpenAI no configurada.", context_docs=len(docs))
        
    sys_prompt = "Eres un asistente experto corporativo de la empresa. Tu tarea es responder a las preguntas del usuario BASÁNDOTE ÚNICAMENTE en los documentos adjuntos en el contexto.\n"
    sys_prompt += "Si la respuesta no está en los documentos, dí claramente que no tienes esa información en tu base de datos.\n"
    sys_prompt += "Al citar información, menciona el nombre del documento (filename) del que sacaste la información.\n\n"
    sys_prompt += "CONTEXTO DE DOCUMENTOS:\n" + context
    
    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": sys_prompt},
                {"role": "user", "content": request.question}
            ],
            temperature=0.2,
            max_tokens=800
        )
        answer = response.choices[0].message.content
        return LibreriaChatResponse(answer=answer, context_docs=len(docs))
    except Exception as e:
        logger.error(f"Error en Libreria Ask: {e}")
        raise HTTPException(status_code=500, detail="Error consultando a la IA de LibrerIA.")
