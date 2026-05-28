import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';

interface GaugeChartProps {
  score: number;
}

export const GaugeChart: React.FC<GaugeChartProps> = ({ score }) => {
  const data = [
    { name: 'Score', value: score },
    { name: 'Rest', value: 100 - score },
  ];

  let color = '#34d399'; // Emerald
  if (score < 50) color = '#ef4444'; // Red
  else if (score < 80) color = '#f59e0b'; // Amber

  return (
    <div className="relative w-full h-40">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="100%"
            startAngle={180}
            endAngle={0}
            innerRadius={60}
            outerRadius={80}
            paddingAngle={0}
            dataKey="value"
            stroke="none"
          >
            <Cell fill={color} />
            <Cell fill="#334155" />
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute bottom-0 left-0 right-0 flex flex-col items-center justify-end pb-2">
        <span className="text-3xl font-bold text-slate-900 dark:text-white" style={{ color }}>{score}</span>
        <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">/ 100</span>
      </div>
    </div>
  );
};
