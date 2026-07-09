import os
from .database import SessionLocal, engine
from . import models

def reset_and_seed():
    models.Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        print("[reset] Eliminando datos antiguos...")
        db.query(models.Registro_PO).delete()
        db.query(models.InventarioSnapshot).delete()
        db.query(models.VentaHistorica).delete()
        db.query(models.Producto).delete()
        # No eliminamos la empresa ni el usuario para no romper el login
        db.commit()
        
        print("[reset] Regenerando datos...")
        from .seed_data import crear_datos_demo
        crear_datos_demo(db)
        print("[reset] ¡Datos regenerados con éxito!")
    finally:
        db.close()

if __name__ == "__main__":
    reset_and_seed()
