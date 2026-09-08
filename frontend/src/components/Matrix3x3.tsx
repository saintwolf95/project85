import type { ProductMetrics } from '../services/api';
import { Info } from 'lucide-react';

interface MatrixProps {
  data: ProductMetrics[];
  onCellClick?: (cell: string) => void;
  activeCell?: string;
}

export const Matrix3x3 = ({ data, onCellClick, activeCell }: MatrixProps) => {
  const metrics = {
    AX: { count: 0, inv: 0, sales: 0 }, AY: { count: 0, inv: 0, sales: 0 }, AZ: { count: 0, inv: 0, sales: 0 },
    BX: { count: 0, inv: 0, sales: 0 }, BY: { count: 0, inv: 0, sales: 0 }, BZ: { count: 0, inv: 0, sales: 0 },
    CX: { count: 0, inv: 0, sales: 0 }, CY: { count: 0, inv: 0, sales: 0 }, CZ: { count: 0, inv: 0, sales: 0 },
  };

  data.forEach(item => {
    const key = item.matriz_abc as keyof typeof metrics;
    if (metrics[key]) {
      metrics[key].count++;
      metrics[key].inv += (item.valor_inv || 0);
      metrics[key].sales += (item.ventas_90d || 0);
    }
  });

  const maxInventory = Math.max(...Object.values(metrics).map(metric => metric.inv), 1);

  const formatEuro = (value: number) => {
    if (value >= 1000000) return `€${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `€${(value / 1000).toFixed(0)}k`;
    return `€${value.toFixed(0)}`;
  };

  if (!data.some(item => item.inventario_disponible)) {
    const abcOnly = {
      A: data.filter(item => item.abc === 'A'),
      B: data.filter(item => item.abc === 'B'),
      C: data.filter(item => item.abc === 'C'),
    };
    return (
      <div className="bg-white dark:bg-slate-900 border border-black/[0.08] dark:border-slate-800 rounded-[20px] p-6 shadow-[0_1px_2px_rgba(0,0,0,.04),0_2px_8px_rgba(0,0,0,.04)]">
        <h3 className="text-[20px] font-semibold tracking-[-0.01em] text-[#1d1d1f] dark:text-white">Clasificación ABC por ventas EUR 90D</h3>
        <p className="mt-1.5 text-[13px] text-slate-500 dark:text-slate-400">
          XYZ se activará cuando exista una carga real de inventario.
        </p>
        <div className="mt-6 grid grid-cols-3 divide-x divide-black/[0.08] dark:divide-slate-800">
          {(['A', 'B', 'C'] as const).map(abcClass => (
            <div key={abcClass} className="px-3 text-center">
              <p className="intelligence-tnum text-[24px] font-semibold tracking-[-0.01em] text-[#1d1d1f] dark:text-white">{abcOnly[abcClass].length.toLocaleString('es-ES')}</p>
              <p className="mt-1 text-[13px] font-medium text-[#0071E3] dark:text-brand-cyan">Clase {abcClass}</p>
              <p className="intelligence-tnum mt-2 text-[12px] text-slate-500">
                {formatEuro(abcOnly[abcClass].reduce((total, item) => total + (item.ventas_90d || 0), 0))}
              </p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const getCellDescription = (matriz: string) => {
    switch(matriz) {
      case 'AX': return 'Core Business (AX): Mayor contribución de ventas y mayor concentración de inventario. Requieren máxima disponibilidad y control financiero.';
      case 'AY': return 'Atención Moderada (AY): Alta contribución de ventas y concentración media de inventario. Equilibrar servicio y capital.';
      case 'AZ': return 'CRÍTICO (AZ): Alta contribución de ventas y bajo inventario relativo. Vigilar la disponibilidad y el riesgo de rotura.';
      case 'BX': return 'Flujo Seguro (BX): Contribución media de ventas y alta concentración de inventario. Mantener rotación y cobertura.';
      case 'BY': return 'Vigilancia Estándar (BY): Contribución e inventario medios. Revisar máximos, mínimos y cobertura.';
      case 'BZ': return 'Riesgo Alto (BZ): Contribución media de ventas y bajo inventario. Puede requerir reposición según cobertura.';
      case 'CX': return 'Automatizable (CX): Baja contribución de ventas y alta concentración de inventario. Revisar capital inmovilizado.';
      case 'CY': return 'Baja Prioridad (CY): Baja contribución e inventario medio. Monitoreo y compra ajustada.';
      case 'CZ': return 'Cola del Catálogo (CZ): Baja contribución de ventas y bajo valor de inventario. Comprar solo bajo pedido o revisar continuidad.';
      default: return 'Detalle de Cuadrante';
    }
  };

  const cells = ['AX', 'AY', 'AZ', 'BX', 'BY', 'BZ', 'CX', 'CY', 'CZ'];

  return (
    <div className="bg-white dark:bg-slate-900 border border-black/[0.08] dark:border-slate-800 rounded-[20px] p-5 sm:p-6 shadow-[0_1px_2px_rgba(0,0,0,.04),0_2px_8px_rgba(0,0,0,.04)] overflow-x-auto overflow-y-hidden scrollbar-thin">
      <h3 className="text-[20px] font-semibold tracking-[-0.01em] text-[#1d1d1f] dark:text-white whitespace-nowrap">Matriz ABCXYZ</h3>
      <p className="mt-1.5 text-[13px] text-slate-500 dark:text-slate-400">Selecciona un cuadrante para revisar su composición y las acciones de inventario.</p>
      
      {/* Eje X label */}
      <div className="mt-5 text-center text-[11px] font-medium text-slate-500 mb-2 whitespace-nowrap">
        ABC · Ventas EUR en 90 días →
      </div>

      {/* Contenedor Matriz + Eje Y */}
      <div className="flex gap-1 items-stretch min-w-[280px]">
        {/* Eje Y label (vertical) */}
        <div className="flex items-center justify-center shrink-0" style={{ width: 16 }}>
          <span
            className="text-[10px] font-medium text-slate-500 whitespace-nowrap"
            style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
          >
            XYZ Inventario EUR →
          </span>
        </div>

        {/* Grid 3x3 — sin altura fija, las celdas se dimensionan por contenido */}
        <div className="flex-1 grid grid-cols-3 gap-2 sm:gap-3">
          {cells.map(cell => {
            const m = metrics[cell as keyof typeof metrics];
            const intensity = Math.max(0.04, Math.min(0.28, (m.inv / maxInventory) * 0.28));
            return (
            <button
              key={cell}
              type="button"
              disabled={!onCellClick}
              onClick={() => onCellClick?.(cell)}
              className={`relative flex min-h-28 flex-col items-center justify-center rounded-[14px] border border-black/[0.08] px-1 py-2 text-[#1d1d1f] transition-all duration-150 dark:border-slate-700 dark:text-slate-100 sm:min-h-32 sm:px-2 sm:py-3
                ${onCellClick ? 'cursor-pointer hover:border-black/[0.18] hover:shadow-[0_4px_12px_rgba(0,0,0,.06)]' : ''}
                ${activeCell === cell ? 'ring-2 ring-[#0071E3] dark:ring-brand-cyan' : ''}
              `}
              style={{ background: `color-mix(in srgb, var(--intelligence-accent) ${Math.round(intensity * 100)}%, var(--intelligence-surface))` }}>
              <div 
                className="absolute top-1 right-1 cursor-help"
                title={getCellDescription(cell)}
              >
              <Info className="h-3.5 w-3.5 text-slate-400 opacity-70 transition-opacity hover:opacity-100" strokeWidth={1.75} />
            </div>
              <span className="intelligence-tnum text-[22px] font-semibold leading-none tracking-[-0.01em] mt-1">{m.count.toLocaleString('es-ES')}</span>
              <span className="mt-1 text-[12px] font-medium text-[#0071E3] dark:text-brand-cyan">{cell}</span>
              <div className="intelligence-tnum flex w-full flex-col border-t border-black/[0.08] pt-2 text-center text-[10px] text-slate-600 dark:border-white/10 dark:text-slate-300 sm:text-[11px]">
                <span className="truncate w-full px-0.5">Inv: {formatEuro(m.inv)}</span>
                <span className="truncate w-full px-0.5">Vtas: {formatEuro(m.sales)}</span>
              </div>
            </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
