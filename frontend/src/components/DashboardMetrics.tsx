import { Package, TrendingUp, DollarSign, Cpu } from 'lucide-react';
import { formatEUR } from '../utils/formatters';

interface DashboardMetricsProps {
  totalSkus: number;
  totalUnidades: number;
  promedioCosto: number;
  familiaTop: string;
}

export const DashboardMetrics = ({ totalSkus, totalUnidades, promedioCosto, familiaTop }: DashboardMetricsProps) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      
      <div className="bg-white dark:bg-brand-surface border border-slate-200 dark:border-slate-800 rounded-xl p-6 hover:border-brand-cyan/50 dark:hover:border-brand-cyan/50 transition-colors shadow-sm dark:shadow-none group">
        <div className="flex justify-between items-start mb-4">
          <div>
            <p className="text-slate-500 dark:text-slate-400 text-sm font-medium">SKUs Activos</p>
            <h3 className="text-3xl font-bold text-slate-900 dark:text-white mt-1 group-hover:text-brand-blue dark:group-hover:text-brand-cyan transition-colors">{totalSkus}</h3>
          </div>
          <div className="p-3 bg-brand-blue/10 dark:bg-slate-800 rounded-lg text-brand-blue dark:text-brand-cyan shadow-none dark:group-hover:shadow-[0_0_15px_var(--color-brand-cyan)] transition-shadow">
            <Package size={24} />
          </div>
        </div>
        <div className="flex items-center gap-2 mt-2">
          <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 px-2 py-0.5 rounded">▲ +5.2%</span>
          <span className="text-xs text-slate-400 dark:text-slate-500">vs Mes anterior</span>
        </div>
      </div>

      <div className="bg-white dark:bg-brand-surface border border-slate-200 dark:border-slate-800 rounded-xl p-6 hover:border-brand-blue/50 dark:hover:border-brand-blue/50 transition-colors shadow-sm dark:shadow-none group">
        <div className="flex justify-between items-start mb-4">
          <div>
            <p className="text-slate-500 dark:text-slate-400 text-sm font-medium">Volumen Total (Unidades)</p>
            <h3 className="text-3xl font-bold text-slate-900 dark:text-white mt-1 group-hover:text-brand-blue transition-colors">
              {totalUnidades.toLocaleString()}
            </h3>
          </div>
          <div className="p-3 bg-brand-blue/10 dark:bg-slate-800 rounded-lg text-brand-blue shadow-none dark:group-hover:shadow-[0_0_15px_var(--color-brand-blue)] transition-shadow">
            <TrendingUp size={24} />
          </div>
        </div>
        <div className="flex items-center gap-2 mt-2">
          <span className="text-xs font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 px-2 py-0.5 rounded">▼ -2.1%</span>
          <span className="text-xs text-slate-400 dark:text-slate-500">vs Mes anterior</span>
        </div>
      </div>

      <div className="bg-white dark:bg-brand-surface border border-slate-200 dark:border-slate-800 rounded-xl p-6 hover:border-emerald-500/50 transition-colors shadow-sm dark:shadow-none group">
        <div className="flex justify-between items-start mb-4">
          <div>
            <p className="text-slate-500 dark:text-slate-400 text-sm font-medium">Costo Promedio (Unit)</p>
            <h3 className="text-3xl font-bold text-slate-900 dark:text-white mt-1 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
              {formatEUR(promedioCosto)}
            </h3>
          </div>
          <div className="p-3 bg-emerald-500/10 dark:bg-slate-800 rounded-lg text-emerald-600 dark:text-emerald-400 shadow-none dark:group-hover:shadow-[0_0_15px_rgba(52,211,153,0.5)] transition-shadow">
            <DollarSign size={24} />
          </div>
        </div>
        <div className="flex items-center gap-2 mt-2">
          <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 px-2 py-0.5 rounded">▲ +1.8%</span>
          <span className="text-xs text-slate-400 dark:text-slate-500">vs Mes anterior</span>
        </div>
      </div>

      <div className="bg-white dark:bg-brand-surface border border-slate-200 dark:border-slate-800 rounded-xl p-6 hover:border-fuchsia-500/50 transition-colors shadow-sm dark:shadow-none group">
        <div className="flex justify-between items-start mb-4">
          <div>
            <p className="text-slate-500 dark:text-slate-400 text-sm font-medium">Familia Más Valiosa</p>
            <h3 className="text-2xl font-bold text-slate-900 dark:text-white mt-1 group-hover:text-fuchsia-600 dark:group-hover:text-fuchsia-400 transition-colors truncate" title={familiaTop}>
              {familiaTop || 'N/A'}
            </h3>
          </div>
          <div className="p-3 bg-fuchsia-500/10 dark:bg-slate-800 rounded-lg text-fuchsia-600 dark:text-fuchsia-400 shadow-none dark:group-hover:shadow-[0_0_15px_rgba(232,121,249,0.5)] transition-shadow">
            <Cpu size={24} />
          </div>
        </div>
        <div className="flex items-center gap-2 mt-2">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">Sin cambios</span>
          <span className="text-xs text-slate-400 dark:text-slate-500">vs Mes anterior</span>
        </div>
      </div>

    </div>
  );
};
