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
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-xl">
      <h3 className="title-corporate mb-6">Matriz de Doble Análisis (Ventas vs Inventario)</h3>
      <div className="relative pt-6 pl-8">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 text-xs font-bold text-slate-500 uppercase tracking-wider">ABC Inventario (Inversión) &rarr;</div>
        <div className="absolute top-1/2 left-0 -translate-y-1/2 -rotate-90 text-xs font-bold text-slate-500 uppercase tracking-wider origin-left whitespace-nowrap">ABC Ventas (Demanda) &rarr;</div>
        
        <div className="grid grid-cols-3 gap-3 h-64">
          {cells.map(cell => (
            <div 
              key={cell} 
              onClick={() => onCellClick && onCellClick(cell)}
              className={`flex flex-col items-center justify-center p-2 sm:p-4 rounded-xl border-2 transition-all 
                ${getCellColor(cell)} 
                ${onCellClick ? 'cursor-pointer hover:scale-[1.02] hover:shadow-lg' : ''}
                ${activeCell === cell ? 'ring-2 ring-brand-blue dark:ring-brand-cyan scale-[1.02] shadow-lg' : ''}
              `}>
              <span className="text-xl sm:text-2xl font-bold">{counts[cell as keyof typeof counts]}</span>
              <span className="text-xs font-medium uppercase mt-1 opacity-80">{cell}</span>
              <span className="text-[10px] text-center mt-1 opacity-70 leading-tight hidden sm:block">{getCellLabel(cell)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
