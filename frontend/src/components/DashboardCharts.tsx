import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { formatEUR } from '../utils/formatters';
interface ChartDataProps {
  abcData: { name: string; value: number }[];
  familyData: { name: string; value: number }[];
  onAbcClick: (data: any) => void;
  onFamilyClick: (data: any) => void;
}

const COLORS = {
  A: '#00F5FF', // brand-cyan
  B: '#2563EB', // brand-blue
  C: '#475569', // slate-600
};

export const DashboardCharts = ({ abcData, familyData, onAbcClick, onFamilyClick }: ChartDataProps) => {

  const CustomTooltipPie = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white/95 dark:bg-brand-dark/95 border border-slate-200 dark:border-slate-700 p-3 rounded-lg shadow-xl backdrop-blur-md">
          <p className="text-slate-900 dark:text-slate-200 font-bold mb-1">Clase {payload[0].name}</p>
          <p className="text-brand-blue dark:text-brand-cyan text-lg">{payload[0].value} Productos</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Clic para ver detalle</p>
        </div>
      );
    }
    return null;
  };

  const CustomTooltipBar = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white/95 dark:bg-brand-dark/95 border border-slate-200 dark:border-slate-700 p-3 rounded-lg shadow-xl backdrop-blur-md">
          <p className="text-slate-900 dark:text-slate-200 font-bold mb-1">{label}</p>
          <p className="text-emerald-600 dark:text-emerald-400 text-lg">{formatEUR(payload[0].value)}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Capital inmovilizado (Clic para detalle)</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      
      {/* Dona ABC */}
      <div className="bg-white dark:bg-brand-surface border border-slate-200 dark:border-slate-800 rounded-xl p-6 flex flex-col shadow-sm dark:shadow-none">
        <div className="mb-4">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">Distribución de Catálogo (ABC)</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">Cantidad de SKUs por clasificación. (Interactivo)</p>
        </div>
        <div className="flex-1 min-h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={abcData}
                cx="50%"
                cy="50%"
                innerRadius={80}
                outerRadius={110}
                paddingAngle={5}
                dataKey="value"
                onClick={onAbcClick}
                className="cursor-pointer focus:outline-none"
              >
                {abcData.map((entry, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={COLORS[entry.name as keyof typeof COLORS] || COLORS.C} 
                    className="hover:opacity-80 transition-opacity"
                    style={{ filter: `drop-shadow(0 0 8px ${COLORS[entry.name as keyof typeof COLORS] || COLORS.C}80)` }}
                  />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltipPie />} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Barras Familias */}
      <div className="bg-white dark:bg-brand-surface border border-slate-200 dark:border-slate-800 rounded-xl p-6 flex flex-col shadow-sm dark:shadow-none">
        <div className="mb-4">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">Valor Inventario por Familia</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">Capital inmovilizado (€) por categoría tecnológica. (Interactivo)</p>
        </div>
        <div className="flex-1 min-h-[300px]">
          <ResponsiveContainer width="100%" height={350}>
            <BarChart
              data={familyData}
              margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
              <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(val) => `${(val/1000).toFixed(0)}k €`} />
              <Tooltip content={<CustomTooltipBar />} cursor={{ fill: '#1e293b' }} />
              <Bar 
                dataKey="value" 
                fill="#10b981" 
                radius={[4, 4, 0, 0]} 
                onClick={onFamilyClick}
                className="cursor-pointer hover:opacity-80 transition-opacity"
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

    </div>
  );
};
