import type { LucideIcon } from 'lucide-react';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';

interface ExecutiveKpiCardProps {
  title: string;
  value: string;
  description: string;
  icon: LucideIcon;
  accent: 'blue' | 'cyan' | 'emerald' | 'amber';
  change?: number | null;
  changeLabel?: string;
  detail: string;
  inverse?: boolean;
}

const accents = {
  blue: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
  cyan: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20',
  emerald: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
  amber: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
};

export const ExecutiveKpiCard = ({
  title, value, description, icon: Icon, accent, change, changeLabel, detail, inverse = false,
}: ExecutiveKpiCardProps) => {
  const positive = change != null && (inverse ? change <= 0 : change >= 0);
  const ChangeIcon = change == null || change === 0 ? Minus : change > 0 ? ArrowUpRight : ArrowDownRight;

  return (
    <article className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg dark:border-slate-800 dark:bg-brand-surface">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">{title}</p>
          <p className="mt-2 truncate text-2xl font-bold tracking-tight text-slate-950 dark:text-white" title={value}>{value}</p>
        </div>
        <div className={`rounded-xl border p-2.5 ${accents[accent]}`}><Icon size={21} /></div>
      </div>
      <p className="mt-2 min-h-10 text-xs leading-5 text-slate-500 dark:text-slate-400">{description}</p>
      <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-100 pt-3 dark:border-slate-800">
        <div className={`flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold ${
          change == null ? 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400' :
          positive ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-red-500/10 text-red-600 dark:text-red-400'
        }`}>
          <ChangeIcon size={13} />
          {change == null ? 'Sin comparable' : `${change > 0 ? '+' : ''}${change.toLocaleString('es-ES', { maximumFractionDigits: 1 })}%`}
        </div>
        <span className="text-right text-[11px] text-slate-400">{changeLabel}</span>
      </div>
      <p className="mt-3 text-xs font-medium text-slate-700 dark:text-slate-300">{detail}</p>
    </article>
  );
};
