# Migraciones de producción

La aplicación no modifica automáticamente el esquema de PostgreSQL en producción.

## V1.02 - fivemin_ventas

1. Abre el proyecto en Supabase.
2. Entra en **SQL Editor** y crea una consulta nueva.
3. Ejecuta el contenido completo de `V1.02__fivemin_ventas.sql`.
4. Comprueba que la consulta termina sin errores.
5. Despliega el backend actualizado en Render.
6. En **Data Engineering**, valida `fivemin_ventas.xlsx` antes de cargarlo.

La migración solo añade columnas. No elimina ni modifica las ventas existentes.

La primera carga real debe realizarse con **Sustituir los datos actuales** activado para retirar la demo. Las cargas posteriores deben dejar esa opción desactivada.
