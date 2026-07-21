from fastapi import APIRouter, Depends, Request, UploadFile, File, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field
from typing import List, Literal, Optional
from datetime import datetime
from ..database import get_db, get_db_ro
from ..copilot_service import process_copilot_chat, cleanup_old_chats
from ..models import Usuario, CopilotChat, CopilotMessage
from ..api.deps import get_current_user
from ..core.rate_limit import limiter
from .. import models

router = APIRouter(prefix="/copilot", tags=["copilot"])

class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(..., max_length=2000)

class ChatRequest(BaseModel):
    chat_id: Optional[int] = None
    history: List[ChatMessage] = Field(..., max_length=20)
    model_preference: Literal["fast", "thinking", "ultra_thinking"] = "fast"

class ChatResponse(BaseModel):
    reply: str
    chat_id: int
    message_id: int

class ContextoRequest(BaseModel):
    contexto_negocio: str

@router.get("/context")
def get_context(db: Session = Depends(get_db), current_user: Usuario = Depends(get_current_user)):
    empresa = db.query(models.Empresa).filter(models.Empresa.id == current_user.empresa_id).first()
    if not empresa:
        return {"contexto_negocio": ""}
    return {"contexto_negocio": empresa.contexto_negocio or ""}

@router.put("/context")
def update_context(payload: ContextoRequest, db: Session = Depends(get_db), current_user: Usuario = Depends(get_current_user)):
    empresa = db.query(models.Empresa).filter(models.Empresa.id == current_user.empresa_id).first()
    if not empresa:
        raise HTTPException(status_code=404, detail="Empresa no encontrada")
    empresa.contexto_negocio = payload.contexto_negocio
    db.commit()
    return {"success": True}

@router.post("/context/upload")
async def upload_context_document(file: UploadFile = File(...), db: Session = Depends(get_db), current_user: Usuario = Depends(get_current_user)):
    # 1MB limit check
    if file.size and file.size > 1048576:
        raise HTTPException(status_code=400, detail="El archivo excede el tamaño máximo permitido de 1MB.")
        
    content = await file.read()
    if len(content) > 1048576:
        raise HTTPException(status_code=400, detail="El archivo excede el tamaño máximo permitido de 1MB.")
        
    filename = file.filename.lower()
    text_content = ""
    
    try:
        if filename.endswith(".txt") or filename.endswith(".csv"):
            text_content = content.decode("utf-8")
        elif filename.endswith(".pdf"):
            from pypdf import PdfReader
            import io
            reader = PdfReader(io.BytesIO(content))
            for page in reader.pages:
                text_content += page.extract_text() + "\n"
        elif filename.endswith(".doc") or filename.endswith(".docx"):
            from docx import Document
            import io
            doc = Document(io.BytesIO(content))
            for para in doc.paragraphs:
                text_content += para.text + "\n"
        else:
            raise HTTPException(status_code=400, detail="Formato de archivo no soportado. Usa .txt, .csv, .pdf o .docx")
            
        new_context = ""
        empresa = db.query(models.Empresa).filter(models.Empresa.id == current_user.empresa_id).first()
        if empresa:
            current_context = empresa.contexto_negocio or ""
            new_context = current_context + f"\n\n--- Contenido de {file.filename} ---\n{text_content}"
            empresa.contexto_negocio = new_context
            db.commit()
            
        return {"success": True, "extracted_text": text_content, "full_context": new_context}
    except Exception as e:
        import logging
        logging.error(f"[COPILOT UPLOAD] Error processing file {file.filename}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Error procesando el archivo. Comprueba que el formato sea correcto.")

@router.get("/chats")
def get_chats(db: Session = Depends(get_db), current_user: Usuario = Depends(get_current_user)):
    cleanup_old_chats(db, current_user.id)
    chats = db.query(CopilotChat).filter(CopilotChat.usuario_id == current_user.id).order_by(CopilotChat.actualizado_en.desc()).all()
    return [{"id": c.id, "titulo": c.titulo, "actualizado_en": c.actualizado_en} for c in chats]

@router.post("/chats")
def create_chat(db: Session = Depends(get_db), current_user: Usuario = Depends(get_current_user)):
    new_chat = CopilotChat(usuario_id=current_user.id, titulo="Nuevo Chat")
    db.add(new_chat)
    db.commit()
    db.refresh(new_chat)
    return {"id": new_chat.id, "titulo": new_chat.titulo, "actualizado_en": new_chat.actualizado_en}

@router.get("/chats/{chat_id}")
def get_chat_history(chat_id: int, db: Session = Depends(get_db_ro), current_user: Usuario = Depends(get_current_user)):
    chat = db.query(CopilotChat).filter(CopilotChat.id == chat_id, CopilotChat.usuario_id == current_user.id).first()
    if not chat:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Chat no encontrado")
    mensajes = db.query(CopilotMessage).filter(CopilotMessage.chat_id == chat_id).order_by(CopilotMessage.creado_en.asc()).all()
    return [{"id": m.id, "role": m.rol, "content": m.contenido, "creado_en": m.creado_en} for m in mensajes]

@router.delete("/chats/{chat_id}")
def delete_chat(chat_id: int, db: Session = Depends(get_db), current_user: Usuario = Depends(get_current_user)):
    chat = db.query(CopilotChat).filter(CopilotChat.id == chat_id, CopilotChat.usuario_id == current_user.id).first()
    if chat:
        db.delete(chat)
        db.commit()
    return {"success": True}

@router.post("/chat")
@limiter.limit("5/minute")
def copilot_chat(request: Request, payload: ChatRequest, db: Session = Depends(get_db), current_user: Usuario = Depends(get_current_user)):
    try:
        # Si no hay chat_id, se crea uno
        if not payload.chat_id:
            chat = CopilotChat(usuario_id=current_user.id, titulo=payload.history[-1].content[:30] + "...")
            db.add(chat)
            db.commit()
            db.refresh(chat)
            chat_id = chat.id
        else:
            chat_id = payload.chat_id
            chat = db.query(CopilotChat).filter(CopilotChat.id == chat_id, CopilotChat.usuario_id == current_user.id).first()
            if chat and len(payload.history) == 1:
                chat.titulo = payload.history[-1].content[:30] + "..."
            if chat:
                chat.actualizado_en = datetime.utcnow()
                db.commit()

        # Extraer el historial para procesar (formato para process_copilot_chat)
        # Podríamos usar el de la BD, pero process_copilot_chat requiere history de dicts
        # Reconstruimos la historia completa desde la BBDD + el nuevo mensaje
        mensajes_previos = db.query(CopilotMessage).filter(CopilotMessage.chat_id == chat_id).order_by(CopilotMessage.creado_en.asc()).all()
        
        # El payload.history normalmente trae solo el nuevo mensaje si el frontend está bien diseñado, 
        # pero si envía todo el historial, guardamos solo el último para evitar duplicados.
        nuevo_mensaje = payload.history[-1]
        
        # Guardar la pregunta del usuario
        user_msg_db = CopilotMessage(chat_id=chat_id, rol=nuevo_mensaje.role, contenido=nuevo_mensaje.content)
        db.add(user_msg_db)
        db.commit()

        # Reconstruir history para la IA
        history_dicts = [{"role": m.rol, "content": m.contenido} for m in mensajes_previos]
        history_dicts.append({"role": nuevo_mensaje.role, "content": nuevo_mensaje.content})

        # Obtener contexto de negocio
        empresa = db.query(models.Empresa).filter(models.Empresa.id == current_user.empresa_id).first()
        contexto_negocio = empresa.contexto_negocio if empresa else ""

        # DB RO para queries analíticas de la IA
        from ..database import SessionLocal
        db_ro = SessionLocal()
        try:
            reply = process_copilot_chat(
                db=db_ro, 
                history=history_dicts, 
                empresa_id=current_user.empresa_id,
                model_preference=payload.model_preference,
                contexto=contexto_negocio
            )
        finally:
            db_ro.close()
            
        # Guardar respuesta IA
        assistant_msg_db = CopilotMessage(chat_id=chat_id, rol="assistant", contenido=reply)
        db.add(assistant_msg_db)
        db.commit()

        return {"reply": reply, "chat_id": chat_id, "message_id": assistant_msg_db.id}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/chat/message/{message_id}/export")
def download_message_export(
    message_id: int,
    format: str = "csv",
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    import re
    import base64
    import io
    import csv
    from fastapi.responses import StreamingResponse
    from ..database import SessionLocal
    from ..copilot_service import execute_sql
    
    # 1. Recuperar el mensaje asegurando que pertenece a un chat del usuario
    msg = db.query(CopilotMessage).join(CopilotChat).filter(
        CopilotMessage.id == message_id,
        CopilotChat.usuario_id == current_user.id
    ).first()
    
    if not msg:
        raise HTTPException(status_code=404, detail="Mensaje no encontrado")
        
    # 2. Extraer el SQL codificado
    match = re.search(r"<!-- sql_query_b64: (.*?) -->", msg.contenido)
    if not match:
        raise HTTPException(status_code=400, detail="Este mensaje no contiene datos exportables.")
        
    sql_b64 = match.group(1)
    try:
        sql_query = base64.b64decode(sql_b64).decode('utf-8')
    except Exception:
        raise HTTPException(status_code=400, detail="Error decodificando la consulta original.")
        
    # 3. Re-ejecutar SQL en read-only
    db_ro = SessionLocal()
    try:
        raw_data, error = execute_sql(db_ro, sql_query)
        if error or not raw_data:
            raise HTTPException(status_code=500, detail="Error ejecutando la consulta original o sin datos.")
            
        if format == "xlsx":
            import pandas as pd
            
            output = io.BytesIO()
            if len(raw_data) > 0:
                df = pd.DataFrame(raw_data)
                df.to_excel(output, index=False, engine='openpyxl')
            
            output.seek(0)
            return StreamingResponse(
                output, 
                media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", 
                headers={"Content-Disposition": f"attachment; filename=exportacion_ia_{message_id}.xlsx"}
            )
        else:
            # Default to CSV
            output = io.StringIO()
            output.write('\ufeff') # BOM (Byte Order Mark) para que Excel lea UTF-8 correctamente (tildes/ñ)
            if len(raw_data) > 0:
                writer = csv.DictWriter(output, fieldnames=raw_data[0].keys())
                writer.writeheader()
                for row in raw_data:
                    writer.writerow(row)
                    
            output.seek(0)
            return StreamingResponse(
                output, 
                media_type="text/csv", 
                headers={"Content-Disposition": f"attachment; filename=exportacion_ia_{message_id}.csv"}
            )
    finally:
        db_ro.close()
