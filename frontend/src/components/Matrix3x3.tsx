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
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm">
        <h3 className="title-corporate text-sm">Clasificación ABC por ventas EUR 90D</h3>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          XYZ se activará cuando exista una carga real de inventario.
        </p>
        <div className="mt-4 grid grid-cols-3 divide-x divide-slate-200 dark:divide-slate-800">
          {(['A', 'B', 'C'] as const).map(abcClass => (
            <div key={abcClass} className="px-3 text-center">
              <p className="text-lg font-bold text-slate-900 dark:text-white">{abcOnly[abcClass].length.toLocaleString('es-ES')}</p>
              <p className="text-xs font-semibold text-brand-blue dark:text-brand-cyan">Clase {abcClass}</p>
              <p className="mt-1 text-xs text-slate-500">
                {formatEuro(abcOnly[abcClass].reduce((total, item) => total + (item.ventas_90d || 0), 0))}
              </p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const getCellColor = (matriz: string) => {
    switch(matriz) {
      case 'AX': return 'bg-blue-50 dark:bg-blue-500/20 border-blue-200 dark:border-blue-500/50 text-blue-600 dark:text-blue-400';
      case 'AY': return 'bg-yellow-50 dark:bg-yellow-500/20 border-yellow-200 dark:border-yellow-500/50 text-yellow-600 dark:text-yellow-400';
      case 'AZ': return 'bg-red-50 dark:bg-red-500/20 border-red-200 dark:border-red-500/50 text-red-600 dark:text-red-400';
      case 'BX': return 'bg-emerald-50 dark:bg-emerald-500/20 border-emerald-200 dark:border-emerald-500/50 text-emerald-600 dark:text-emerald-400';
      case 'BY': return 'bg-yellow-50 dark:bg-yellow-500/20 border-yellow-200 dark:border-yellow-500/50 text-yellow-600 dark:text-yellow-400';
      case 'BZ': return 'bg-orange-50 dark:bg-orange-500/20 border-orange-200 dark:border-orange-500/50 text-orange-600 dark:text-orange-400';
      case 'CX': return 'bg-emerald-50 dark:bg-emerald-500/20 border-emerald-200 dark:border-emerald-500/50 text-emerald-600 dark:text-emerald-400';
      case 'CY': return 'bg-lime-50 dark:bg-lime-500/20 border-lime-200 dark:border-lime-500/50 text-lime-600 dark:text-lime-400';
      case 'CZ': return 'bg-slate-100 dark:bg-slate-700/50 border-slate-300 dark:border-slate-600 text-slate-500 dark:text-slate-400';
      default: return 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700';
    }
  };

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
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 sm:p-4 shadow-sm overflow-x-auto overflow-y-hidden scrollbar-thin">
      <h3 className="title-corporate text-sm mb-2 whitespace-nowrap">Matriz de Doble Análisis (Ventas vs Inventario)</h3>
      
      {/* Eje X label */}
      <div className="text-center text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 whitespace-nowrap">
        ABC Ventas EUR 90D →
      </div>

      {/* Contenedor Matriz + Eje Y */}
      <div className="flex gap-1 items-stretch min-w-[280px]">
        {/* Eje Y label (vertical) */}
        <div className="flex items-center justify-center shrink-0" style={{ width: 16 }}>
          <span
            className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap"
            style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
          >
            XYZ Inventario EUR →
          </span>
        </div>

        {/* Grid 3x3 — sin altura fija, las celdas se dimensionan por contenido */}
        <div className="flex-1 grid grid-cols-3 gap-1 sm:gap-1.5">
          {cells.map(cell => {
            const m = metrics[cell as keyof typeof metrics];
            return (
            <button
              key={cell}
              type="button"
              disabled={!onCellClick}
              onClick={() => onCellClick?.(cell)}
              className={`relative flex flex-col items-center justify-center py-1.5 px-0.5 sm:py-2 sm:px-1 rounded-lg border-2 transition-all text-inherit
                ${getCellColor(cell)} 
                ${onCellClick ? 'cursor-pointer hover:shadow-md' : ''}
                ${activeCell === cell ? 'ring-2 ring-brand-blue dark:ring-brand-cyan shadow-md' : ''}
              `}>
              <div 
                className="absolute top-1 right-1 cursor-help"
                title={getCellDescription(cell)}
              >
                <Info className="w-3 h-3 opacity-40 hover:opacity-100 transition-opacity" />
              </div>
              <span className="text-base sm:text-lg font-bold leading-none mt-1">{m.count.toLocaleString('es-ES')}</span>
              <span className="text-[9px] sm:text-[10px] font-bold uppercase mt-0.5 opacity-90">{cell}</span>
              <div className="flex flex-col w-full text-[8px] sm:text-[9px] text-center mt-1 border-t border-black/10 dark:border-white/10 pt-1 opacity-80 font-medium">
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
