import { useMemo } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell, CartesianGrid } from 'recharts';
import type { ProductMetrics } from '../services/api';

interface MatrixBarChartProps {
  data: ProductMetrics[];
}

export const MatrixBarChart = ({ data }: MatrixBarChartProps) => {
  const chartData = useMemo(() => {
    const metrics = {
      AX: { name: 'AX', count: 0, inv: 0, sales: 0, color: '#3b82f6', risk: 'Bajo' },
      AY: { name: 'AY', count: 0, inv: 0, sales: 0, color: '#eab308', risk: 'Medio' },
      AZ: { name: 'AZ', count: 0, inv: 0, sales: 0, color: '#ef4444', risk: 'Crítico' },
      BX: { name: 'BX', count: 0, inv: 0, sales: 0, color: '#10b981', risk: 'Bajo' },
      BY: { name: 'BY', count: 0, inv: 0, sales: 0, color: '#eab308', risk: 'Medio' },
      BZ: { name: 'BZ', count: 0, inv: 0, sales: 0, color: '#f97316', risk: 'Alto' },
      CX: { name: 'CX', count: 0, inv: 0, sales: 0, color: '#10b981', risk: 'Bajo' },
      CY: { name: 'CY', count: 0, inv: 0, sales: 0, color: '#84cc16', risk: 'Bajo' },
      CZ: { name: 'CZ', count: 0, inv: 0, sales: 0, color: '#94a3b8', risk: 'Irrelevante' },
    };

    data.forEach(item => {
      const key = item.matriz_abc as keyof typeof metrics;
      if (metrics[key]) {
        metrics[key].count++;
        metrics[key].inv += (item.valor_inv || 0);
        metrics[key].sales += (item.ventas_90d || 0);
      }
    });

    return Object.values(metrics).sort((a, b) => b.count - a.count);
  }, [data]);

  const formatEuro = (value: number) => {
    if (value >= 1000000) return `€${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `€${(value / 1000).toFixed(0)}k`;
    return `€${value.toFixed(0)}`;
  };

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-3 rounded-lg shadow-lg">
          <p className="font-bold text-slate-900 dark:text-white mb-2 text-sm">{data.name} (Riesgo: {data.risk})</p>
          <div className="space-y-1 text-xs">
            <p className="text-slate-600 dark:text-slate-300">
              <span className="font-semibold text-slate-900 dark:text-white">Artículos:</span> {data.count.toLocaleString()}
            </p>
            <p className="text-slate-600 dark:text-slate-300">
              <span className="font-semibold text-slate-900 dark:text-white">Inventario Actual:</span> {formatEuro(data.inv)}
            </p>
            <p className="text-slate-600 dark:text-slate-300">
              <span className="font-semibold text-slate-900 dark:text-white">Ventas 90D:</span> {formatEuro(data.sales)}
            </p>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm w-full mt-4">
      <h3 className="title-corporate text-sm mb-1">Distribución de Artículos por Cuadrante</h3>
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
        Clasificación según ventas EUR 90D (A/B/C) e inventario EUR actual (X/Y/Z).
      </p>
      
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" opacity={0.2} />
            <XAxis 
              dataKey="name" 
              axisLine={false} 
              tickLine={false} 
              tick={{ fill: '#64748b', fontSize: 12, fontWeight: 600 }} 
            />
            <YAxis 
              axisLine={false} 
              tickLine={false} 
              tick={{ fill: '#64748b', fontSize: 11 }} 
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'transparent' }} />
            <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={50}>
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
