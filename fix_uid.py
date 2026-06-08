from sqlalchemy import create_engine
from sqlalchemy import text

engine = create_engine('sqlite:///supplychain.db')
with engine.connect() as conn:
    conn.execute(text("UPDATE usuarios SET supabase_uid='34cf496c-0ca3-41db-bb63-b39078963a24' WHERE email='admin@demo.com'"))
    conn.commit()
