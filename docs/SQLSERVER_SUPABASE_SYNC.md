# Sincronización SQL Server a Supabase

El job `scripts/sync_sqlserver_to_supabase.py` carga íntegramente las vistas
`dbo.vw_ventas_supabase` y `dbo.vw_inventario_supabase`, valida sus totales en
staging y convierte el resultado en incremental dentro de Supabase.

## Despliegue

1. Ejecutar `migrations/V1.69__sqlserver_supabase_sync.sql` una vez en Supabase.
2. Instalar `requirements.txt` y Microsoft ODBC Driver 18 for SQL Server en un
   host con acceso a `DATA01` y a Supabase.
3. Configurar secretos en ese host, nunca en el repositorio:

```text
SQLSERVER_CONNECTION_STRING=Server=DATA01;Database=DMI_DATOS;Integrated Security=True;Encrypt=True;TrustServerCertificate=True;ApplicationIntent=ReadOnly
SUPABASE_SYNC_DATABASE_URL=postgresql://sync_writer:...@.../postgres
APP_DATABASE_RO_URL=postgresql://readonly_user:...@.../postgres
SYNC_EMPRESA_ID=1
```

El acceso SQL Server solo necesita `SELECT` en las dos vistas. En la carga
manual actual se autentica con el usuario de Windows que ya tiene acceso a
`DATA01`; `TrustServerCertificate=True` es necesario mientras DATA01 use su
certificado interno. El usuario
`sync_writer` necesita acceso a `sync`, `app_sync` y a las tablas operativas
que materializa la app; la cuenta de la aplicación solo requiere `SELECT` en
`app_sync` y su acceso habitual a las tablas de aplicación.

## Programación

Programar una ejecución diaria a las 08:15 hora de Madrid, nunca durante la
reconstrucción de ventas de las 07:30-07:33. Mantener el job de inventario a
partir de las 08:00 hasta confirmar formalmente su hora de cierre.

```powershell
python scripts/sync_sqlserver_to_supabase.py
```

El proceso aborta sin hacer merge si staging está vacío, los controles de
filas/totales no coinciden, hay claves duplicadas o las filas caen más de un
5 % frente a la última carga correcta. Los registros desaparecidos solo se
marcan como borrados dentro de los últimos 1.095 días, para no interpretar la
retención futura de FY2025 como un borrado de negocio.

## Validación inicial

Comparar `sync.load_log` con la consulta fuente. La referencia del 11/10/2026
es 571.103 filas de ventas y 625.393 filas de inventario. No habilitar la tarea
programada hasta que filas y totales coincidan y las dos consultas de duplicados
por clave natural devuelvan cero.

## Carga Manual SQL

Mientras se tramita la Conexión Oficial SQL, ejecutar
`scripts/export_sqlserver_manual_batches.ps1` en un equipo con acceso a
`DATA01`. Genera automáticamente CSV UTF-8: ventas por mes e inventario por
semana, listos para validar y cargar en Data Engineering. El script necesita el
módulo PowerShell `SqlServer` y usa `SQLSERVER_CONNECTION_STRING` como secreto.
