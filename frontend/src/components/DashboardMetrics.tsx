import type { LucideIcon } from 'lucide-react';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';

interface ExecutiveKpiCardProps {
  title: string;
  value: string;
  description: string;
  icon: LucideIcon;
  change?: number | null;
  changeLabel?: string;
  detail: string;
  inverse?: boolean;
}

export const ExecutiveKpiCard = ({
  title, value, description, icon: Icon, change, changeLabel, detail, inverse = false,
}: ExecutiveKpiCardProps) => {
  const positive = change != null && (inverse ? change <= 0 : change >= 0);
  const ChangeIcon = change == null || change === 0 ? Minus : change > 0 ? ArrowUpRight : ArrowDownRight;

  return (
    <article className="relative overflow-hidden rounded-[20px] border border-black/[0.08] bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,.04),0_2px_8px_rgba(0,0,0,.04)] transition-colors duration-150 hover:border-black/[0.14] dark:border-slate-800 dark:bg-brand-surface">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-slate-500 dark:text-slate-400">{title}</p>
          <p className="dashboard-tnum mt-2 truncate text-[32px] font-semibold leading-none tracking-[-0.02em] text-[#1d1d1f] dark:text-white" title={value}>{value}</p>
        </div>
        <div className="rounded-xl bg-[#0071E3]/10 p-2.5 text-[#0071E3] dark:bg-cyan-500/10 dark:text-cyan-400"><Icon size={20} strokeWidth={1.75} /></div>
      </div>
      <p className="mt-3 min-h-10 text-[13px] leading-5 text-slate-500 dark:text-slate-400">{description}</p>
      <div className="mt-5 flex items-center justify-between gap-3 border-t border-black/[0.08] pt-3.5 dark:border-slate-800">
        <div className={`flex items-center gap-1 text-[13px] font-medium ${
          change == null ? 'text-slate-500 dark:text-slate-400' :
          positive ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
        }`}>
          <ChangeIcon size={14} strokeWidth={2} />
          {change == null ? 'Sin comparable' : `${change > 0 ? '+' : ''}${change.toLocaleString('es-ES', { maximumFractionDigits: 1 })}%`}
        </div>
        <span className="text-right text-[12px] text-slate-400">{changeLabel}</span>
      </div>
      <p className="dashboard-tnum mt-3 text-[13px] text-slate-700 dark:text-slate-300">{detail}</p>
    </article>
  );
};
