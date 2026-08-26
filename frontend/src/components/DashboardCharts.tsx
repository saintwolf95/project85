import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { DashboardExecutiveResponse } from '../services/api';
import { formatEUR } from '../utils/formatters';

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
    <div className="rounded-xl border border-slate-200 bg-white/95 p-3 text-xs shadow-xl backdrop-blur dark:border-slate-700 dark:bg-slate-950/95">
      <p className="mb-2 font-semibold text-slate-900 dark:text-white">{label}</p>
      {payload.map(item => (
        <p key={String(item.dataKey)} className="mt-1" style={{ color: item.color }}>
          {item.name}: {formatEUR(Number(item.value))}
        </p>
      ))}
    </div>
  );
};

export const DashboardCharts = ({ data, onFamilyClick }: DashboardChartsProps) => {
  const [matrixMetric, setMatrixMetric] = useState<'inventario_eur' | 'ventas_90d_eur' | 'skus'>('inventario_eur');
  const [compareYoY, setCompareYoY] = useState(true);
  const monthly = useMemo(() => data.serie_mensual.map(item => ({ ...item, label: monthLabel(item.mes) })), [data.serie_mensual]);
  const drivers = useMemo(() => data.impulsores_familia.slice(0, 7).reverse(), [data.impulsores_familia]);
  const matrix = useMemo(() => {
    const byCode = new Map(data.cuadrantes.map(item => [item.cuadrante, item]));
    return ['AX', 'AY', 'AZ', 'BX', 'BY', 'BZ', 'CX', 'CY', 'CZ'].map(code => byCode.get(code) || {
      cuadrante: code, skus: 0, inventario_eur: 0, ventas_90d_eur: 0,
    });
  }, [data.cuadrantes]);
  const maxMatrix = Math.max(...matrix.map(item => Number(item[matrixMetric])), 1);
  const selectFamily = (item: unknown) => {
    if (!item || typeof item !== 'object') return;
    const candidate = item as { familia?: string; payload?: { familia?: string } };
    const family = candidate.payload?.familia || candidate.familia;
    if (family) onFamilyClick(family);
  };

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
      <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-brand-surface xl:col-span-7">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-950 dark:text-white">Evolución comercial mensual</h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Ventas netas y MGD; el último mes puede estar incompleto.</p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-3 text-[11px] text-slate-500">
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-blue-500" />Ventas</span>
            {compareYoY && <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-slate-300 dark:bg-slate-600" />Año anterior</span>}
            <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 bg-emerald-400" />MGD</span>
            <button onClick={() => setCompareYoY(value => !value)} className={`rounded-lg border px-2.5 py-1.5 font-semibold transition ${compareYoY ? 'border-blue-200 bg-blue-50 text-blue-600 dark:border-cyan-800 dark:bg-cyan-950/40 dark:text-cyan-400' : 'border-slate-200 text-slate-500 dark:border-slate-700'}`}>Comparar año anterior: {compareYoY ? 'Sí' : 'No'}</button>
          </div>
        </div>
        <div className="h-[320px] w-full">
          <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 1, height: 320 }}>
            <ComposedChart data={monthly} margin={{ top: 10, right: 8, left: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" opacity={0.18} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} stroke="#94a3b8" />
              <YAxis tickFormatter={compactEUR} tickLine={false} axisLine={false} width={70} fontSize={11} stroke="#94a3b8" />
              <Tooltip content={<TooltipBox />} />
              {compareYoY && <Bar name="Ventas año anterior" dataKey="ventas_anterior_eur" fill="#94A3B8" radius={[5, 5, 0, 0]} maxBarSize={30} opacity={0.55} />}
              <Bar name="Ventas netas" dataKey="ventas_eur" fill="#2563EB" radius={[5, 5, 0, 0]} maxBarSize={42} />
              <Line name="MGD" dataKey="mgd_eur" stroke="#34D399" strokeWidth={2.5} dot={{ r: 3, fill: '#34D399' }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        {compareYoY && <div className="mt-4 overflow-x-auto rounded-xl border border-slate-100 dark:border-slate-800"><table className="w-full min-w-[540px] text-xs"><thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500 dark:bg-slate-900"><tr><th className="px-3 py-2 text-left">Mes</th><th className="px-3 py-2 text-right">Ventas actuales</th><th className="px-3 py-2 text-right">Año anterior</th><th className="px-3 py-2 text-right">Variación</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{monthly.map(item => <tr key={item.mes}><td className="px-3 py-2 font-semibold text-slate-700 dark:text-slate-200">{item.label}</td><td className="px-3 py-2 text-right">{formatEUR(item.ventas_eur)}</td><td className="px-3 py-2 text-right text-slate-500">{formatEUR(item.ventas_anterior_eur)}</td><td className={`px-3 py-2 text-right font-bold ${item.variacion_eur >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{item.variacion_eur >= 0 ? '+' : '−'}{formatEUR(Math.abs(item.variacion_eur))}<span className="ml-1 text-[10px] font-medium">({item.variacion_pct == null ? 'sin base' : `${item.variacion_pct.toLocaleString('es-ES', { maximumFractionDigits: 1 })}%`})</span></td></tr>)}</tbody></table></div>}
      </section>

      <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-brand-surface xl:col-span-5">
        <div className="mb-5">
          <h2 className="text-base font-bold text-slate-950 dark:text-white">Familias que explican el cambio</h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Variación absoluta frente al período comparable. Haz clic para filtrar.</p>
        </div>
        <div className="h-[320px] w-full">
          <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 1, height: 320 }}>
            <BarChart data={drivers} layout="vertical" margin={{ top: 5, right: 18, left: 4, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#334155" opacity={0.18} />
              <XAxis type="number" tickFormatter={compactEUR} tickLine={false} axisLine={false} fontSize={10} stroke="#94a3b8" />
              <YAxis type="category" dataKey="familia" width={105} tickLine={false} axisLine={false} fontSize={11} stroke="#94a3b8" />
              <Tooltip content={<TooltipBox />} />
              <Bar name="Variación" dataKey="variacion_eur" radius={[0, 5, 5, 0]} onClick={selectFamily} className="cursor-pointer">
                {drivers.map(item => <Cell key={item.familia} fill={item.variacion_eur >= 0 ? '#10B981' : '#F43F5E'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-brand-surface xl:col-span-12">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-slate-950 dark:text-white">Mapa ABCXYZ del negocio</h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">A/B/C = contribución a ventas 90D · X/Y/Z = concentración de inventario actual.</p>
          </div>
          <div className="flex rounded-lg bg-slate-100 p-1 dark:bg-slate-900">
            {([['inventario_eur', 'Inventario €'], ['ventas_90d_eur', 'Ventas 90D'], ['skus', 'SKU']] as const).map(([key, label]) => (
              <button key={key} onClick={() => setMatrixMetric(key)} className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${matrixMetric === key ? 'bg-white text-blue-600 shadow-sm dark:bg-slate-800 dark:text-cyan-400' : 'text-slate-500'}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 md:gap-3">
          {matrix.map(item => {
            const intensity = Math.max(0.08, Number(item[matrixMetric]) / maxMatrix * 0.72);
            const value = matrixMetric === 'skus' ? `${item.skus.toLocaleString('es-ES')} SKU` : compactEUR(Number(item[matrixMetric]));
            return (
              <div key={item.cuadrante} className="relative overflow-hidden rounded-xl border border-slate-200 p-3 dark:border-slate-700 md:p-4">
                <div className="absolute inset-0 bg-blue-500" style={{ opacity: intensity }} />
                <div className="relative">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-lg font-black text-slate-950 dark:text-white">{item.cuadrante}</span>
                    <span className="text-[10px] font-medium text-slate-500 dark:text-slate-300">{item.skus.toLocaleString('es-ES')} SKU</span>
                  </div>
                  <p className="mt-3 text-xs font-bold text-slate-800 dark:text-white md:text-sm">{value}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
};
