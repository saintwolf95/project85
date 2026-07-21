import os
from dotenv import load_dotenv
load_dotenv()

from app.database import SessionLocal
from app.seed_data import crear_datos_demo
from app.services import sync_metrics_to_db
from app.models import Empresa

def main():
    print("Iniciando reseed...")
    db = SessionLocal()
    try:
        print("Borrando y creando datos mock...")
        crear_datos_demo(db)
        
        emp = db.query(Empresa).first()
        if emp:
            print(f"Sincronizando métricas para empresa {emp.id}...")
            sync_metrics_to_db(db, emp.id)
            print("Sincronización finalizada.")
        else:
            print("No se encontró la empresa demo.")
            
        print("¡Hecho!")
    finally:
        db.close()

if __name__ == "__main__":
    main()
