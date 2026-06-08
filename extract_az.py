from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
import pandas as pd
import app.services as services

engine = create_engine('sqlite:///supplychain.db')
Session = sessionmaker(bind=engine)
db = Session()

# Calculate metrics
metrics = services.calculate_inventory_metrics(db, 1)

# Filter AZ
df = pd.DataFrame(metrics)
az_df = df[df['matriz_abc'] == 'AZ'][['cod_art', 'familia', 'valor_inv', 'cv', 'matriz_abc']]

print("**Caza Autónoma de SKUs Problemáticos (Clase AZ)**")
print(az_df.to_string(index=False))
