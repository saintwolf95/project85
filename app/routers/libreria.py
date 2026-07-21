from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Request
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel
import logging
from pypdf import PdfReader
from docx import Document
import io

from ..database import get_db
from ..api.deps import get_current_user
from ..models import LibreriaDocumento, Usuario
from ..schemas import LibreriaDocumentoResponse, LibreriaChatRequest, LibreriaChatResponse
from ..copilot_service import get_openai_client
from ..core.rate_limit import limiter

router = APIRouter()
logger = logging.getLogger(__name__)
MAX_LIBRERIA_FILE_SIZE = 1_048_576
MAX_LIBRERIA_TEXT_CHARS = 200_000
ALLOWED_LIBRERIA_EXTENSIONS = (".txt", ".csv", ".pdf", ".docx")

async def extract_text_from_upload(file: UploadFile) -> str:
    if file.size and file.size > MAX_LIBRERIA_FILE_SIZE:
        raise HTTPException(status_code=400, detail="El archivo excede el tamaño máximo permitido de 1MB.")

    content = await file.read(MAX_LIBRERIA_FILE_SIZE + 1)
    if len(content) > MAX_LIBRERIA_FILE_SIZE:
        raise HTTPException(status_code=400, detail="El archivo excede el tamaño máximo permitido de 1MB.")

    filename = (file.filename or "documento").lower()
    if not filename.endswith(ALLOWED_LIBRERIA_EXTENSIONS):
        raise HTTPException(status_code=400, detail="Formato de archivo no soportado. Usa .txt, .csv, .pdf o .docx")
    
    text = ""
    try:
        if filename.endswith('.pdf'):
            reader = PdfReader(io.BytesIO(content))
            for page in reader.pages:
                text += (page.extract_text() or "") + "\n"
        elif filename.endswith('.docx'):
            doc = Document(io.BytesIO(content))
            for para in doc.paragraphs:
                text += para.text + "\n"
        else:
            # Assume it's text (txt, csv)
            text = content.decode('utf-8')
    except Exception as e:
        logger.error(f"Error extrayendo texto del archivo {filename}: {e}")
        raise HTTPException(status_code=400, detail="No se pudo extraer texto del archivo.")
        
    text = text.strip()
    if len(text) > MAX_LIBRERIA_TEXT_CHARS:
        text = text[:MAX_LIBRERIA_TEXT_CHARS]
    return text

@router.post("/upload", response_model=LibreriaDocumentoResponse)
@limiter.limit("5/minute")
async def upload_document(
    request: Request,
    file: UploadFile = File(...),
    department: str = Form(...),
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    try:
        department = department.strip()[:80]
        if not department:
            raise HTTPException(status_code=400, detail="Departamento obligatorio.")

        text_content = await extract_text_from_upload(file)
        
        # Guardar en BD
        doc = LibreriaDocumento(
            empresa_id=current_user.empresa_id,
            filename=file.filename or "documento",
            department=department,
            content_text=text_content
        )
        db.add(doc)
        db.commit()
        db.refresh(doc)
        
        return doc
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error subiendo documento a LibrerIA: {e}")
        raise HTTPException(status_code=500, detail="Error al subir el documento")

@router.get("/documents", response_model=List[LibreriaDocumentoResponse])
async def get_documents(
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return db.query(LibreriaDocumento).filter(LibreriaDocumento.empresa_id == current_user.empresa_id).order_by(LibreriaDocumento.upload_date.desc()).all()

@router.delete("/documents/{doc_id}")
async def delete_document(
    doc_id: int,
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    doc = db.query(LibreriaDocumento).filter(LibreriaDocumento.id == doc_id, LibreriaDocumento.empresa_id == current_user.empresa_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Documento no encontrado")
    
    db.delete(doc)
    db.commit()
    return {"status": "success"}

@router.post("/ask", response_model=LibreriaChatResponse)
@limiter.limit("10/minute")
async def ask_libreria(
    request: Request,
    payload: LibreriaChatRequest,
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    query = db.query(LibreriaDocumento).filter(LibreriaDocumento.empresa_id == current_user.empresa_id)
    
    if payload.department_filter and payload.department_filter != "all":
        query = query.filter(LibreriaDocumento.department == payload.department_filter)
        
    docs = query.all()
    
    if not docs:
        return LibreriaChatResponse(answer="No hay documentos subidos para este departamento. Sube algunos archivos primero para que pueda leerlos.", context_docs=0)
        
    # Construir el contexto
    context = ""
    for doc in docs:
        context += f"\n--- INICIO DEL DOCUMENTO: {doc.filename} (Departamento: {doc.department}) ---\n"
        context += doc.content_text[:MAX_LIBRERIA_TEXT_CHARS]
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
                {"role": "user", "content": payload.question}
            ],
            temperature=0.2,
            max_tokens=800
        )
        answer = response.choices[0].message.content
        return LibreriaChatResponse(answer=answer, context_docs=len(docs))
    except Exception as e:
        logger.error(f"Error en Libreria Ask: {e}")
        raise HTTPException(status_code=500, detail="Error consultando a la IA de LibrerIA.")

@router.get("/documents/for-copilot")
async def get_documents_for_copilot(
    doc_ids: str,
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    try:
        ids = [int(i.strip()) for i in doc_ids.split(',') if i.strip().isdigit()]
        if not ids:
            return {"context": "", "count": 0}
        docs = db.query(LibreriaDocumento).filter(
            LibreriaDocumento.empresa_id == current_user.empresa_id,
            LibreriaDocumento.id.in_(ids)
        ).all()
        if not docs:
            return {"context": "", "count": 0}
        context_parts = []
        for doc in docs:
            context_parts.append(f"--- Documento: {doc.filename} ({doc.department}) ---\n{doc.content_text[:3000]}\n")
        return {"context": "\n\n".join(context_parts), "count": len(docs)}
    except Exception as e:
        logger.error(f"Error recuperando docs para Copilot: {e}")
        return {"context": "", "count": 0}
