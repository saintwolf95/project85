# Migraciones de producción

La aplicación no modifica automáticamente el esquema de PostgreSQL en producción.

## V2.10 - Ventas compartidas (pendiente de validación en PostgreSQL)

Antes de producción, probar `V2.10__ventas_compartidas.sql` en una base de ensayo con una copia representativa y verificar INSERT, UPDATE, DELETE, TRUNCATE, sincronización SQL y fallos de recalculo. La vista retorna ventas originales mientras la revisión esté pendiente. La migración concede SELECT sobre las tablas derivadas y la vista a `copilot_readonly` si existe; la cuenta del backend que ejecuta `DATABASE_URL` necesita SELECT, INSERT, UPDATE y DELETE en las tres tablas derivadas. Identificar ese rol y revisar su alcance antes de dar permisos. No se altera ni borra la tabla original de ventas. El proceso de la app reconstruye el histórico inicial en segundo plano; dimensionar y supervisar su carga en una copia antes del despliegue.

## V1.93 - Dashboard ejecutivo

El backend v1.93 verifica estas columnas al arrancar de forma idempotente. Si se
mantiene una política de migraciones manuales, ejecutar también
`V1.93__dashboard_schema.sql` antes del despliegue.

## V1.02 - fivemin_ventas

1. Abre el proyecto en Supabase.
2. Entra en **SQL Editor** y crea una consulta nueva.
3. Ejecuta el contenido completo de `V1.02__fivemin_ventas.sql`.
4. Comprueba que la consulta termina sin errores.
5. Despliega el backend actualizado en Render.
6. En **Data Engineering**, valida `fivemin_ventas.xlsx` antes de cargarlo.

La migración solo añade columnas. No elimina ni modifica las ventas existentes.

La primera carga real debe realizarse con **Sustituir los datos actuales** activado para retirar la demo. Las cargas posteriores deben dejar esa opción desactivada.
