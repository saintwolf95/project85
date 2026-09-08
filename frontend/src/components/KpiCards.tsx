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
    <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
      {/* Valor Total del Inventario */}
      <div className="bg-white dark:bg-brand-surface rounded-[20px] p-6 border border-black/[0.08] dark:border-slate-800 flex items-center justify-between shadow-[0_1px_2px_rgba(0,0,0,.04),0_2px_8px_rgba(0,0,0,.04)] dark:shadow-none">
        <div>
          <p className="text-[13px] font-medium text-slate-500 dark:text-slate-400 mb-2">Valor total del inventario</p>
          <h3 className="intelligence-tnum text-[30px] font-semibold leading-none tracking-[-0.02em] text-[#1d1d1f] dark:text-white">
            {formatEUR(kpis.valor_total_inventario)}
          </h3>
        </div>
        <div className="h-11 w-11 bg-[#0071E3]/10 dark:bg-brand-cyan/10 text-[#0071E3] dark:text-brand-cyan rounded-xl flex items-center justify-center">
          <DollarSign size={20} strokeWidth={1.75} />
        </div>
      </div>

      {/* Alertas Críticas */}
      <button
        type="button"
        disabled={!onCardClick}
        onClick={() => onCardClick?.('criticas')}
        className={`bg-white dark:bg-brand-surface rounded-[20px] p-6 border border-black/[0.08] dark:border-slate-800 flex items-center justify-between shadow-[0_1px_2px_rgba(0,0,0,.04),0_2px_8px_rgba(0,0,0,.04)] dark:shadow-none ${onCardClick ? 'cursor-pointer hover:border-red-500/40 transition-colors duration-150' : ''}`}
      >
        <div>
          <p className="text-[13px] font-medium text-slate-500 dark:text-slate-400 mb-2">Alertas críticas</p>
          <h3 className={`intelligence-tnum text-[30px] font-semibold leading-none tracking-[-0.02em] ${kpis.total_alertas_criticas > 0 ? 'text-red-600 dark:text-red-500' : 'text-[#1d1d1f] dark:text-white'}`}>
            {kpis.total_alertas_criticas}
          </h3>
        </div>
        <div className="h-11 w-11 bg-red-500/10 text-red-600 dark:text-red-500 rounded-xl flex items-center justify-center">
          <AlertTriangle size={20} strokeWidth={1.75} />
        </div>
      </button>

      {/* Salud Stock Clase A */}
      <button
        type="button"
        disabled={!onCardClick}
        onClick={() => onCardClick?.('claseA')}
        className={`bg-white dark:bg-brand-surface rounded-[20px] p-6 border border-black/[0.08] dark:border-slate-800 flex items-center justify-between shadow-[0_1px_2px_rgba(0,0,0,.04),0_2px_8px_rgba(0,0,0,.04)] dark:shadow-none ${onCardClick ? 'cursor-pointer hover:border-amber-500/40 transition-colors duration-150' : ''}`}
      >
        <div>
          <p className="text-[13px] font-medium text-slate-500 dark:text-slate-400 mb-2">Alertas de clase A</p>
          <h3 className={`intelligence-tnum text-[30px] font-semibold leading-none tracking-[-0.02em] ${kpis.salud_stock_clase_a > 0 ? 'text-amber-600 dark:text-amber-500' : 'text-[#1d1d1f] dark:text-white'}`}>
            {kpis.salud_stock_clase_a}
          </h3>
        </div>
        <div className={`h-11 w-11 rounded-xl flex items-center justify-center ${kpis.salud_stock_clase_a === 0 ? 'bg-[#0071E3]/10 dark:bg-brand-cyan/10 text-[#0071E3] dark:text-brand-cyan' : 'bg-amber-500/10 text-amber-600 dark:text-amber-500'}`}>
          <ShieldCheck size={20} strokeWidth={1.75} />
        </div>
      </button>
    </div>
  );
};
