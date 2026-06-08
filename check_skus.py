from sqlalchemy import create_engine, text
engine = create_engine('sqlite:///supplychain.db')
with engine.connect() as conn:
    total_p = conn.execute(text("SELECT COUNT(*) FROM productos WHERE empresa_id=1")).scalar()
    total_inv = conn.execute(text("SELECT COUNT(*) FROM inventario_snapshot")).scalar()
    orphan = conn.execute(text("""
        SELECT COUNT(*) FROM productos p 
        WHERE empresa_id=1 
        AND NOT EXISTS (SELECT 1 FROM inventario_snapshot i WHERE i.producto_id = p.id)
    """)).scalar()
    print(f"Productos totales: {total_p}")
    print(f"Inventario Snapshot registros: {total_inv}")
    print(f"Productos SIN snapshot (huerfanos): {orphan}")
