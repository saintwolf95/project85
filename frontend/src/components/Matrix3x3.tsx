import type { ProductMetrics } from '../services/api';

interface MatrixProps {
  data: ProductMetrics[];
  onCellClick?: (cell: string) => void;
  activeCell?: string;
}

export const Matrix3x3 = ({ data, onCellClick, activeCell }: MatrixProps) => {
  const counts = {
    AA: 0, AB: 0, AC: 0,
    BA: 0, BB: 0, BC: 0,
    CA: 0, CB: 0, CC: 0,
  };

  data.forEach(item => {
    if (counts[item.matriz_abc as keyof typeof counts] !== undefined) {
      counts[item.matriz_abc as keyof typeof counts]++;
    }
  });

  const getCellColor = (matriz: string) => {
    if (matriz === 'CA') return 'bg-red-50 dark:bg-red-500/20 border-red-200 dark:border-red-500/50 text-red-600 dark:text-red-400';
    if (matriz === 'AC') return 'bg-orange-50 dark:bg-orange-500/20 border-orange-200 dark:border-orange-500/50 text-orange-600 dark:text-orange-400';
    if (matriz === 'AA') return 'bg-green-50 dark:bg-green-500/20 border-green-200 dark:border-green-500/50 text-green-600 dark:text-green-400';
    if (matriz === 'CC') return 'bg-slate-100 dark:bg-slate-700/50 border-slate-300 dark:border-slate-600 text-slate-500 dark:text-slate-400';
    return 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700';
  };

  const getCellLabel = (matriz: string) => {
    if (matriz === 'CA') return 'Riesgo Financiero';
    if (matriz === 'AC') return 'Riesgo Rotura';
    if (matriz === 'AA') return 'Estrella';
    if (matriz === 'CC') return 'Baja Prioridad';
    return 'Regular';
  };

  const cells = ['AA', 'AB', 'AC', 'BA', 'BB', 'BC', 'CA', 'CB', 'CC'];

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm overflow-hidden">
      <h3 className="title-corporate text-sm mb-2">Matriz de Doble Análisis (Ventas vs Inventario)</h3>
      
      {/* Eje X label */}
      <div className="text-center text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
        ABC Inventario (Inversión) →
      </div>

      {/* Contenedor Matriz + Eje Y */}
      <div className="flex gap-1 items-stretch">
        {/* Eje Y label (vertical) */}
        <div className="flex items-center justify-center shrink-0" style={{ width: 16 }}>
          <span
            className="text-[10px] font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap"
            style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
          >
            ABC Ventas (Demanda) →
          </span>
        </div>

        {/* Grid 3x3 — sin altura fija, las celdas se dimensionan por contenido */}
        <div className="flex-1 grid grid-cols-3 gap-1.5">
          {cells.map(cell => (
            <div 
              key={cell} 
              onClick={() => onCellClick && onCellClick(cell)}
              className={`flex flex-col items-center justify-center py-2.5 px-1 rounded-lg border-2 transition-all
                ${getCellColor(cell)} 
                ${onCellClick ? 'cursor-pointer hover:shadow-md' : ''}
                ${activeCell === cell ? 'ring-2 ring-brand-blue dark:ring-brand-cyan shadow-md' : ''}
              `}>
              <span className="text-lg font-bold leading-none">{counts[cell as keyof typeof counts]}</span>
              <span className="text-[10px] font-medium uppercase mt-0.5 opacity-80">{cell}</span>
              <span className="text-[9px] text-center opacity-60 leading-tight hidden sm:block">{getCellLabel(cell)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
