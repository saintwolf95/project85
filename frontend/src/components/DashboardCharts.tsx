import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { DashboardExecutiveResponse } from '../services/api';
import { formatEUR } from '../utils/formatters';
import { AbcxyzLegend } from './AbcxyzLegend';
import { quadrantGuide } from '../content/abcxyz';

interface DashboardChartsProps {
  data: DashboardExecutiveResponse;
  onFamilyClick: (family: string) => void;
}

const compactEUR = (value: number) => new Intl.NumberFormat('es-ES', {
  notation: 'compact', maximumFractionDigits: 1,
}).format(value) + ' €';

const monthLabel = (iso: string) => new Intl.DateTimeFormat('es-ES', {
  month: 'short', year: '2-digit', timeZone: 'UTC',
}).format(new Date(`${iso}T00:00:00Z`));

const dayMonthLabel = (iso: string) => new Intl.DateTimeFormat('es-ES', {
  day: '2-digit', month: '2-digit', timeZone: 'UTC',
}).format(new Date(`${iso}T00:00:00Z`));

interface TooltipEntry {
  dataKey?: string | number;
  color?: string;
  name?: ReactNode;
  value?: string | number;
}

interface TooltipBoxProps {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: ReactNode;
}

const TooltipBox = ({ active, payload, label }: TooltipBoxProps) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="min-w-40 rounded-xl border border-black/[0.08] bg-white px-3 py-2.5 text-[13px] shadow-[0_8px_24px_rgba(0,0,0,.08)] dark:border-slate-700 dark:bg-slate-950">
      <p className="mb-2 text-[12px] font-medium text-slate-500 dark:text-slate-400">{label}</p>
      <div className="space-y-1.5">
        {payload.map(item => (
          <div key={String(item.dataKey)} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />{item.name}</span>
            <span className="dashboard-tnum font-medium text-[#1d1d1f] dark:text-white">{formatEUR(Number(item.value))}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export const DashboardCharts = ({ data, onFamilyClick }: DashboardChartsProps) => {
  const [matrixMetric, setMatrixMetric] = useState<'inventario_eur' | 'ventas_90d_eur' | 'skus'>('inventario_eur');
  const [compareYoY, setCompareYoY] = useState(true);
  const monthly = useMemo(() => data.serie_mensual.map(item => ({ ...item, label: monthLabel(item.mes) })), [data.serie_mensual]);
  const partialMonths = useMemo(() => monthly.filter(item => item.parcial), [monthly]);
  const drivers = useMemo(() => data.impulsores_familia.slice(0, 7).reverse(), [data.impulsores_familia]);
  const matrix = useMemo(() => {
    const byCode = new Map(data.cuadrantes.map(item => [item.cuadrante, item]));
    return ['AX', 'AY', 'AZ', 'BX', 'BY', 'BZ', 'CX', 'CY', 'CZ'].map(code => byCode.get(code) || {
      cuadrante: code, skus: 0, inventario_eur: 0, ventas_90d_eur: 0,
    });
  }, [data.cuadrantes]);
  const selectFamily = (item: unknown) => {
    if (!item || typeof item !== 'object') return;
    const candidate = item as { familia?: string; payload?: { familia?: string } };
    const family = candidate.payload?.familia || candidate.familia;
    if (family) onFamilyClick(family);
  };

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
      <section className="min-w-0 rounded-[20px] border border-black/[0.08] bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,.04),0_2px_8px_rgba(0,0,0,.04)] dark:border-slate-800 dark:bg-brand-surface xl:col-span-7">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-[20px] font-semibold tracking-[-0.01em] text-[#1d1d1f] dark:text-white">Evolución comercial mensual</h2>
            <p className="mt-1.5 text-[13px] text-slate-500 dark:text-slate-400">
              Ventas netas y MGD.
              {partialMonths.length > 0 && ` Meses parciales: ${partialMonths.map(item => `${item.label} (${dayMonthLabel(item.cobertura_inicio)}–${dayMonthLabel(item.cobertura_fin)})`).join(', ')}.`}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-2 text-[12px] text-slate-500">
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#0071E3]" />Ventas</span>
            {compareYoY && <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#d2d2d7] dark:bg-slate-600" />Año anterior</span>}
            <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 bg-emerald-500" />MGD</span>
            <button onClick={() => setCompareYoY(value => !value)} className={`min-h-9 rounded-[10px] px-3 text-[13px] font-medium transition-all duration-150 active:scale-[.97] ${compareYoY ? 'bg-[#0071E3]/10 text-[#0071E3] dark:bg-cyan-950/40 dark:text-cyan-400' : 'bg-[#f5f5f7] text-slate-600 dark:bg-slate-900 dark:text-slate-300'}`}>Comparar año anterior: {compareYoY ? 'Sí' : 'No'}</button>
          </div>
        </div>
        <div className="h-[320px] w-full">
          <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 1, height: 320 }}>
            <ComposedChart data={monthly} margin={{ top: 10, right: 8, left: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#1d1d1f" opacity={0.1} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} stroke="#86868b" dy={8} />
              <YAxis tickFormatter={compactEUR} tickLine={false} axisLine={false} width={70} fontSize={12} stroke="#86868b" />
              <Tooltip content={<TooltipBox />} />
              {compareYoY && <Bar name="Ventas año anterior" dataKey="ventas_anterior_eur" fill="#D2D2D7" radius={[6, 6, 0, 0]} maxBarSize={30} />}
              <Bar name="Ventas netas" dataKey="ventas_eur" fill="#0071E3" radius={[6, 6, 0, 0]} maxBarSize={42} />
              <Line name="MGD" dataKey="mgd_eur" stroke="#34C759" strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: '#ffffff' }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        {compareYoY && <div className="mt-5 overflow-x-auto rounded-[16px] border border-black/[0.08] dark:border-slate-800"><table className="w-full min-w-[540px] border-collapse text-[13px]"><thead className="border-b border-black/[0.08] text-[12px] font-medium text-slate-500 dark:border-slate-800 dark:bg-slate-900"><tr><th className="px-4 py-3 text-left font-medium">Mes</th><th className="px-4 py-3 text-right font-medium">Ventas actuales</th><th className="px-4 py-3 text-right font-medium">Año anterior</th><th className="px-4 py-3 text-right font-medium">Variación</th></tr></thead><tbody className="divide-y divide-black/[0.08] dark:divide-slate-800">{monthly.map(item => { const positive = item.variacion_eur >= 0; const DeltaIcon = positive ? ArrowUpRight : ArrowDownRight; return <tr key={item.mes} className="transition-colors duration-150 hover:bg-black/[0.025] dark:hover:bg-slate-800/40"><td className="px-4 py-3.5 font-medium text-[#1d1d1f] dark:text-slate-200">{item.label}{item.parcial && <span className="ml-2 inline-flex rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">Parcial {dayMonthLabel(item.cobertura_inicio)}–{dayMonthLabel(item.cobertura_fin)}</span>}</td><td className="dashboard-tnum px-4 py-3.5 text-right text-[#1d1d1f] dark:text-white">{formatEUR(item.ventas_eur)}</td><td className="dashboard-tnum px-4 py-3.5 text-right text-slate-500">{formatEUR(item.ventas_anterior_eur)}</td><td className={`dashboard-tnum px-4 py-3.5 text-right font-medium ${positive ? 'text-emerald-600' : 'text-red-600'}`}><span className="inline-flex items-center gap-1"><DeltaIcon size={14} strokeWidth={2} />{positive ? '+' : '−'}{formatEUR(Math.abs(item.variacion_eur))}</span><span className="ml-1 text-[11px] font-normal">({item.variacion_pct == null ? 'sin base' : `${item.variacion_pct.toLocaleString('es-ES', { maximumFractionDigits: 1 })}%`})</span></td></tr>; })}</tbody></table></div>}
      </section>

      <section className="min-w-0 rounded-[20px] border border-black/[0.08] bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,.04),0_2px_8px_rgba(0,0,0,.04)] dark:border-slate-800 dark:bg-brand-surface xl:col-span-5">
        <div className="mb-6">
          <h2 className="text-[20px] font-semibold tracking-[-0.01em] text-[#1d1d1f] dark:text-white">Familias que explican el cambio</h2>
          <p className="mt-1.5 text-[13px] text-slate-500 dark:text-slate-400">Variación absoluta frente al período comparable. Haz clic para filtrar.</p>
        </div>
        <div className="h-[320px] w-full">
          <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 1, height: 320 }}>
            <BarChart data={drivers} layout="vertical" margin={{ top: 5, right: 18, left: 4, bottom: 5 }}>
              <CartesianGrid strokeDasharray="4 4" horizontal={false} stroke="#1d1d1f" opacity={0.1} />
              <XAxis type="number" tickFormatter={compactEUR} tickLine={false} axisLine={false} fontSize={12} stroke="#86868b" />
              <YAxis type="category" dataKey="familia" width={105} tickLine={false} axisLine={false} fontSize={12} stroke="#86868b" />
              <Tooltip content={<TooltipBox />} />
              <Bar name="Variación" dataKey="variacion_eur" radius={[0, 5, 5, 0]} onClick={selectFamily} className="cursor-pointer">
                {drivers.map(item => <Cell key={item.familia} fill={item.variacion_eur >= 0 ? '#34C759' : '#FF3B30'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="rounded-[20px] border border-black/[0.08] bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,.04),0_2px_8px_rgba(0,0,0,.04)] dark:border-slate-800 dark:bg-brand-surface xl:col-span-12">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-[20px] font-semibold tracking-[-0.01em] text-[#1d1d1f] dark:text-white">Mapa ABCXYZ del negocio</h2>
            <p className="mt-1.5 text-[13px] text-slate-500 dark:text-slate-400">A/B/C = contribución a ventas 90D · X/Y/Z = concentración de inventario actual.</p>
          </div>
          <div className="flex rounded-xl bg-[#f5f5f7] p-1 dark:bg-slate-900">
            {([['inventario_eur', 'Inventario €'], ['ventas_90d_eur', 'Ventas 90D'], ['skus', 'SKU']] as const).map(([key, label]) => (
              <button key={key} onClick={() => setMatrixMetric(key)} className={`min-h-8 rounded-[9px] px-3 text-[12px] font-medium transition-all duration-150 active:scale-[.97] ${matrixMetric === key ? 'bg-white text-[#1d1d1f] shadow-[0_1px_2px_rgba(0,0,0,.08)] dark:bg-slate-800 dark:text-white' : 'text-slate-500'}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 md:gap-3">
          {matrix.map(item => {
            const guide = quadrantGuide[item.cuadrante];
            const value = matrixMetric === 'skus' ? `${item.skus.toLocaleString('es-ES')} SKU` : compactEUR(Number(item[matrixMetric]));
            return (
              <div key={item.cuadrante} title={guide.description} className={`relative overflow-hidden rounded-[16px] border border-black/[0.08] p-4 dark:border-slate-700 md:p-5 ${guide.tone}`}>
                <div className="relative">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[20px] font-semibold tracking-[-0.01em] text-[#1d1d1f] dark:text-white">{item.cuadrante}</span>
                    <span className="dashboard-tnum text-[12px] text-slate-500 dark:text-slate-300">{item.skus.toLocaleString('es-ES')} SKU</span>
                  </div>
                  <p className="mt-2 text-[11px] font-medium text-slate-600 dark:text-slate-300">{guide.label}</p>
                  <p className="dashboard-tnum mt-5 text-[15px] font-medium text-[#1d1d1f] dark:text-white">{value}</p>
                </div>
              </div>
            );
          })}
        </div>
        <AbcxyzLegend />
      </section>
    </div>
  );
};
