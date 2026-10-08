// Cortes vigentes en app/semantic_metrics.py: 0,80 / 0,95.
// XYZ representa valor de inventario, no variabilidad de demanda.
export const quadrantGuide: Record<string, { label: string; description: string; tone: string }> = {
  AX: { label: 'Prioridad estratégica', description: 'Alta contribución a ventas y alta concentración de capital en inventario. Equilibrar disponibilidad, rotación y cobertura.', tone: 'bg-[#0071e3]/10 dark:bg-blue-500/15' },
  AY: { label: 'Proteger disponibilidad', description: 'Alta contribución a ventas y concentración intermedia de inventario. Revisar cobertura y servicio.', tone: 'bg-cyan-500/10 dark:bg-cyan-500/15' },
  AZ: { label: 'Vigilar cobertura', description: 'Alta contribución a ventas y baja concentración de inventario. Comprobar cobertura antes de concluir que existe riesgo de rotura.', tone: 'bg-cyan-500/10 dark:bg-cyan-500/15' },
  BX: { label: 'Revisar capital', description: 'Contribución intermedia a ventas y alta concentración de inventario. Revisar si el stock se ajusta a la demanda.', tone: 'bg-amber-500/10 dark:bg-amber-500/15' },
  BY: { label: 'Seguimiento habitual', description: 'Contribución intermedia a ventas e inventario. Revisar rotación, mínimos y máximos.', tone: 'bg-slate-100 dark:bg-slate-800' },
  BZ: { label: 'Seguimiento habitual', description: 'Contribución intermedia a ventas y baja concentración de inventario. Ajustar reposición según cobertura.', tone: 'bg-slate-100 dark:bg-slate-800' },
  CX: { label: 'Revisar exceso potencial', description: 'Baja contribución a ventas y alta concentración de capital en inventario. Investigar sobrestock u obsolescencia; la clasificación por sí sola no los demuestra.', tone: 'bg-red-500/10 dark:bg-red-500/15' },
  CY: { label: 'Revisar rotación', description: 'Baja contribución a ventas y concentración intermedia de inventario. Revisar compras y continuidad del surtido.', tone: 'bg-orange-500/10 dark:bg-orange-500/15' },
  CZ: { label: 'Larga cola del catálogo', description: 'Baja contribución a ventas y bajo valor de inventario. Gestionar con reglas de surtido y revisar de forma agregada.', tone: 'bg-[#f5f5f7] dark:bg-slate-800/60' },
};
