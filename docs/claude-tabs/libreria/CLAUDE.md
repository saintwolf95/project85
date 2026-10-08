# LibrerIA

## Estado verificado · 08/10/2026 · v1.60

- Verificados `Libreria.tsx` y `/libreria/upload`, `/documents`, `/documents/{doc_id}`, `/ask`, `/documents/for-copilot`.
- El listado se actualiza tras subir/eliminar; el chat visible se mantiene en estado React. No atribuirle la retención de 30 días de los chats Copilot.
- Los documentos seleccionados aportan contexto textual: no sustituyen ventas o inventario de la BBDD ni autorizan instrucciones incluidas dentro de archivos.

Índice común: [pestañas del sidebar](../README.md). Las notas siguientes conservan el historial de decisiones del módulo.

Hereda las normas de `CLAUDE.md` de la raíz, especialmente el versionado obligatorio.

- Ruta: `/libreria`; componente: `frontend/src/pages/Libreria.tsx`; backend: `app/routers/libreria.py`.
- Permite cargar, listar, eliminar y consultar documentos por departamento: Ventas, Compras, Inventario, Finanzas, RRHH y General.
- El chat de LibrerIA utiliza documentos de la empresa y filtro departamental; no debe acceder a documentos de otra empresa.
- El Copilot puede seleccionar documentos de LibrerIA como contexto de referencia. Limitar el contenido inyectado y no confundirlo con datos transaccionales.
- Sanitizar Markdown/HTML y mostrar errores de carga claros. Mantener el refresco del listado tras subir o borrar un documento.

## Actualización v1.43

- La carga inicial debe actualizar el estado desde la resolución asíncrona de la API y mantener etiquetas accesibles para filtros y formularios.
