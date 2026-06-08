from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app import services

engine = create_engine('sqlite:///supplychain.db')
Session = sessionmaker(bind=engine)
db = Session()

metrics = services.calculate_inventory_metrics(db, 1)
from collections import Counter
c = Counter(m['matriz_abc'] for m in metrics)
print("Valores de matriz_abc en BD:")
for k, v in sorted(c.items()):
    print(f"  {k}: {v}")
print(f"\nTotal: {len(metrics)} productos")
db.close()
