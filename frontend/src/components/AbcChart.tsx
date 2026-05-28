import React, { useMemo } from 'react';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import type { ProductMetrics } from '../services/api';

interface Props {
  data: ProductMetrics[];
}

export const AbcChart: React.FC<Props> = ({ data }) => {
  const chartData = useMemo(() => {
    if (!data.length) return [];

    const counts = { A: 0, B: 0, C: 0 };
    data.forEach(item => {
      if (item.abc_ventas === 'A') counts.A++;
      else if (item.abc_ventas === 'B') counts.B++;
      else counts.C++;
    });

    return [
      { name: 'Clase A', value: counts.A, color: '#00F5FF' }, // brand-cyan
      { name: 'Clase B', value: counts.B, color: '#2563EB' }, // brand-blue
      { name: 'Clase C', value: counts.C, color: '#94A3B8' }, // slate
    ];
  }, [data]);

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-brand-surface p-3 border border-slate-700 shadow-lg rounded">
          <p className="font-semibold text-white">{data.name}</p>
          <p className="text-sm text-slate-400">
            Cantidad: <span className="font-bold text-white">{data.value} productos</span>
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="bg-brand-surface rounded-xl border border-slate-800 p-6 flex flex-col items-center">
      <h3 className="text-lg font-semibold text-white self-start mb-4">Distribución ABC</h3>
      <div className="w-full h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={80}
              outerRadius={110}
              paddingAngle={5}
              dataKey="value"
              stroke="none"
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
            <Legend verticalAlign="bottom" height={36}/>
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
