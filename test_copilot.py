import logging
import sys
from dotenv import load_dotenv
load_dotenv()
from app.database import SessionLocalRO
from app.copilot_service import process_copilot_chat

logging.basicConfig(level=logging.INFO, stream=sys.stdout)

db_ro = SessionLocalRO()

try:
    history = [
        {"role": "user", "content": "Compara el stock actual del SKU-10047 frente a sus ventas de los últimos 7 días"}
    ]
    empresa_id = 1
    
    print("--- INICIANDO PRUEBA COPILOT ---")
    respuesta = process_copilot_chat(db_ro, history, empresa_id)
    print("\n--- RESPUESTA FINAL DEL AGENTE ---")
    print(respuesta)
    print("--- FIN ---")
finally:
    db_ro.close()
