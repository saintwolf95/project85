import React from 'react';
import { AlertTriangle, ShieldCheck, DollarSign } from 'lucide-react';
import { formatEUR } from '../utils/formatters';
import type { DashboardKPIsResponse } from '../services/api';

interface Props {
  kpis: DashboardKPIsResponse | null;
  onCardClick?: (type: 'criticas' | 'claseA') => void;
}

export const KpiCards: React.FC<Props> = ({ kpis, onCardClick }) => {
  if (!kpis) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {/* Valor Total del Inventario */}
      <div className="bg-white dark:bg-brand-surface rounded-xl p-6 border border-slate-200 dark:border-slate-800 flex items-center justify-between shadow-sm dark:shadow-none">
        <div>
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Valor Total del Inventario</p>
          <h3 className="text-2xl font-bold text-slate-900 dark:text-white">
            {formatEUR(kpis.valor_total_inventario)}
          </h3>
        </div>
        <div className="h-12 w-12 bg-brand-blue/10 dark:bg-brand-cyan/10 text-brand-blue dark:text-brand-cyan rounded-full flex items-center justify-center border border-brand-blue/20 dark:border-brand-cyan/20">
          <DollarSign size={24} />
        </div>
      </div>

      {/* Alertas Críticas */}
      <div 
        onClick={() => onCardClick && onCardClick('criticas')}
        className={`bg-white dark:bg-brand-surface rounded-xl p-6 border border-slate-200 dark:border-slate-800 flex items-center justify-between shadow-sm dark:shadow-none ${onCardClick ? 'cursor-pointer hover:border-red-500/50 transition-colors' : ''}`}
      >
        <div>
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Alertas Críticas</p>
          <h3 className={`text-2xl font-bold ${kpis.total_alertas_criticas > 0 ? 'text-red-600 dark:text-red-500' : 'text-slate-900 dark:text-white'}`}>
            {kpis.total_alertas_criticas}
          </h3>
        </div>
        <div className="h-12 w-12 bg-red-500/10 text-red-600 dark:text-red-500 rounded-full flex items-center justify-center border border-red-500/20">
          <AlertTriangle size={24} />
        </div>
      </div>

      {/* Salud Stock Clase A */}
      <div 
        onClick={() => onCardClick && onCardClick('claseA')}
        className={`bg-white dark:bg-brand-surface rounded-xl p-6 border border-slate-200 dark:border-slate-800 flex items-center justify-between shadow-sm dark:shadow-none ${onCardClick ? 'cursor-pointer hover:border-amber-500/50 transition-colors' : ''}`}
      >
        <div>
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Alertas Clase A</p>
          <h3 className={`text-2xl font-bold ${kpis.salud_stock_clase_a > 0 ? 'text-amber-600 dark:text-amber-500' : 'text-slate-900 dark:text-white'}`}>
            {kpis.salud_stock_clase_a}
          </h3>
        </div>
        <div className={`h-12 w-12 rounded-full flex items-center justify-center border ${kpis.salud_stock_clase_a === 0 ? 'bg-brand-blue/10 dark:bg-brand-cyan/10 text-brand-blue dark:text-brand-cyan border-brand-blue/20 dark:border-brand-cyan/20' : 'bg-amber-500/10 text-amber-600 dark:text-amber-500 border-amber-500/20'}`}>
          <ShieldCheck size={24} />
        </div>
      </div>
    </div>
  );
};
