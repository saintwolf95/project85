# Alertas internas

Hereda las normas de `CLAUDE.md` de la raíz, especialmente el versionado obligatorio.

- Ruta registrada: `/alerts`; componente: `frontend/src/pages/ActionableInsights.tsx`.
- No aparece en el menú lateral actual. Tratarla como ruta interna hasta que producto decida exponerla.
- Antes de añadirla al menú, validar que tiene datos reales, estados de carga/error, permisos y una relación clara con las alertas de ABCXYZ.
- No eliminarla ni exponerla por accidente como parte de cambios ajenos a navegación.
