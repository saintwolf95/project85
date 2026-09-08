import { useMemo, useState } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell, CartesianGrid } from 'recharts';
import type { ProductMetrics } from '../services/api';

interface MatrixBarChartProps {
  data: ProductMetrics[];
}

interface MatrixDatum {
  name: string;
  count: number;
  inv: number;
  sales: number;
  risk: string;
}

const formatEuro = (value: number) => {
  if (value >= 1000000) return `€${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `€${(value / 1000).toFixed(0)}k`;
  return `€${value.toFixed(0)}`;
};

const MatrixTooltip = ({ active, payload }: { active?: boolean; payload?: { payload: MatrixDatum }[] }) => {
  if (!active || !payload?.length) return null;
  const datum = payload[0].payload;
  return (
    <div className="min-w-44 bg-white dark:bg-slate-800 border border-black/[0.08] dark:border-slate-700 px-3 py-2.5 rounded-xl shadow-[0_8px_24px_rgba(0,0,0,.08)]">
      <p className="font-medium text-[#1d1d1f] dark:text-white mb-2 text-[13px]">{datum.name} · Riesgo {datum.risk}</p>
      <div className="space-y-1 text-[12px] intelligence-tnum">
        <p className="text-slate-600 dark:text-slate-300"><span className="font-medium text-[#1d1d1f] dark:text-white">Artículos:</span> {datum.count.toLocaleString()}</p>
        <p className="text-slate-600 dark:text-slate-300"><span className="font-medium text-[#1d1d1f] dark:text-white">Inventario actual:</span> {formatEuro(datum.inv)}</p>
        <p className="text-slate-600 dark:text-slate-300"><span className="font-medium text-[#1d1d1f] dark:text-white">Ventas 90D:</span> {formatEuro(datum.sales)}</p>
      </div>
    </div>
  );
};

export const MatrixBarChart = ({ data }: MatrixBarChartProps) => {
  const [viewMode, setViewMode] = useState<'count' | 'inventory'>('count');
  const chartData = useMemo(() => {
    const metrics = {
      AX: { name: 'AX', count: 0, inv: 0, sales: 0, risk: 'Bajo' },
      AY: { name: 'AY', count: 0, inv: 0, sales: 0, risk: 'Medio' },
      AZ: { name: 'AZ', count: 0, inv: 0, sales: 0, risk: 'Crítico' },
      BX: { name: 'BX', count: 0, inv: 0, sales: 0, risk: 'Bajo' },
      BY: { name: 'BY', count: 0, inv: 0, sales: 0, risk: 'Medio' },
      BZ: { name: 'BZ', count: 0, inv: 0, sales: 0, risk: 'Alto' },
      CX: { name: 'CX', count: 0, inv: 0, sales: 0, risk: 'Bajo' },
      CY: { name: 'CY', count: 0, inv: 0, sales: 0, risk: 'Bajo' },
      CZ: { name: 'CZ', count: 0, inv: 0, sales: 0, risk: 'Irrelevante' },
    };

    data.forEach(item => {
      const key = item.matriz_abc as keyof typeof metrics;
      if (metrics[key]) {
        metrics[key].count++;
        metrics[key].inv += (item.valor_inv || 0);
        metrics[key].sales += (item.ventas_90d || 0);
      }
    });

    return Object.values(metrics).sort((a, b) => b[viewMode === 'count' ? 'count' : 'inv'] - a[viewMode === 'count' ? 'count' : 'inv']);
  }, [data, viewMode]);

  return (
    <div className="bg-white dark:bg-slate-900 border border-black/[0.08] dark:border-slate-800 rounded-[20px] p-6 shadow-[0_1px_2px_rgba(0,0,0,.04),0_2px_8px_rgba(0,0,0,.04)] w-full mt-5">
      <h3 className="text-[20px] font-semibold tracking-[-0.01em] text-[#1d1d1f] dark:text-white mb-1">Distribución por cuadrante</h3>
      <p className="text-[13px] text-slate-500 dark:text-slate-400 mb-5">
        Clasificación según ventas EUR 90D (A/B/C) e inventario EUR actual (X/Y/Z).
      </p>
      
      <div className="mb-5 inline-flex rounded-xl p-1 bg-[#f5f5f7] dark:bg-slate-800/70" aria-label="Métrica de distribución">
        <button
          type="button"
          onClick={() => setViewMode('count')}
          aria-pressed={viewMode === 'count'}
          className={`min-h-8 px-3 rounded-[9px] text-[12px] font-medium transition-all duration-150 active:scale-[.97] ${viewMode === 'count' ? 'bg-white text-[#1d1d1f] dark:bg-slate-700 dark:text-white shadow-[0_1px_2px_rgba(0,0,0,.08)]' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}
        >
          Artículos
        </button>
        <button
          type="button"
          onClick={() => setViewMode('inventory')}
          aria-pressed={viewMode === 'inventory'}
          className={`min-h-8 px-3 rounded-[9px] text-[12px] font-medium transition-all duration-150 active:scale-[.97] ${viewMode === 'inventory' ? 'bg-white text-[#1d1d1f] dark:bg-slate-700 dark:text-white shadow-[0_1px_2px_rgba(0,0,0,.08)]' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}
        >
          Inventario €
        </button>
      </div>

      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#1d1d1f" opacity={0.1} />
            <XAxis 
              dataKey="name" 
              axisLine={false} 
              tickLine={false} 
              tick={{ fill: '#86868b', fontSize: 12 }}
            />
            <YAxis 
              axisLine={false} 
              tickLine={false} 
              tick={{ fill: '#86868b', fontSize: 12 }}
              tickFormatter={viewMode === 'inventory' ? formatEuro : undefined}
            />
            <Tooltip content={<MatrixTooltip />} cursor={{ fill: 'transparent' }} />
            <Bar dataKey={viewMode === 'count' ? 'count' : 'inv'} radius={[6, 6, 0, 0]} maxBarSize={50}>
              {chartData.map((_, index) => (
                <Cell key={`cell-${index}`} fill="#0071E3" fillOpacity={Math.max(0.35, 1 - index * 0.06)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
