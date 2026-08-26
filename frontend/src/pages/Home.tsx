import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle, ArrowRight, BarChart3, Box, CalendarDays, CircleDollarSign,
  Database, PackageCheck, RefreshCw, ShieldAlert, ShoppingCart, Users,
} from 'lucide-react';
import { DashboardCharts } from '../components/DashboardCharts';
import { ExecutiveKpiCard } from '../components/DashboardMetrics';
import { getExecutiveDashboard } from '../services/api';
import type { DashboardExecutiveResponse, DashboardPeriod } from '../services/api';
import { formatEUR } from '../utils/formatters';

const formatDate = (value?: string | null) => value ? new Intl.DateTimeFormat('es-ES', {
  day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC',
}).format(new Date(`${value}T00:00:00Z`)) : 'Sin datos';

const signedEUR = (value: number) => `${value >= 0 ? '+' : '−'}${formatEUR(Math.abs(value))}`;
const executiveEUR = (value: number) => new Intl.NumberFormat('es-ES', {
  style: 'currency', currency: 'EUR', notation: 'compact', maximumFractionDigits: 2,
}).format(value);

const periodLabels: Record<DashboardPeriod, string> = {
  fytd: 'Año fiscal',
  '90d': 'Últimos 90 días',
  '30d': 'Últimos 30 días',
};

export const Home = () => {
  const navigate = useNavigate();
  const [period, setPeriod] = useState<DashboardPeriod>('fytd');
  const [family, setFamily] = useState('');
  const [data, setData] = useState<DashboardExecutiveResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    getExecutiveDashboard(period, family || undefined)
      .then(result => { if (active) setData(result); })
      .catch(() => { if (active) setError('No se pudo preparar la vista ejecutiva. Inténtalo de nuevo.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [period, family]);

  const changePeriod = (next: DashboardPeriod) => {
    setLoading(true);
    setError('');
    setPeriod(next);
  };

  const changeFamily = (next: string) => {
    setLoading(true);
    setError('');
    setFamily(next);
  };

  const management = useMemo(() => {
    if (!data?.ready) return null;
    const decline = data.impulsores_familia.find(item => item.variacion_eur < 0);
    const growth = data.impulsores_familia.find(item => item.variacion_eur > 0);
    const inactivePct = data.inventario.valor_eur
      ? data.inventario.capital_sin_ventas_90d_eur / data.inventario.valor_eur * 100 : 0;
    const availabilityA = data.inventario.clase_a_total
      ? (data.inventario.clase_a_total - data.inventario.clase_a_sin_stock) / data.inventario.clase_a_total * 100 : 100;
    return { decline, growth, inactivePct, availabilityA };
  }, [data]);

  if (loading && !data) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-24 rounded-2xl bg-slate-200 dark:bg-slate-800" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map(item => <div key={item} className="h-48 rounded-2xl bg-slate-200 dark:bg-slate-800" />)}
        </div>
        <div className="h-80 rounded-2xl bg-slate-200 dark:bg-slate-800" />
      </div>
    );
  }

  if (error || !data?.ready || !management) {
    return (
      <div className="flex min-h-80 flex-col items-center justify-center rounded-2xl border border-red-200 bg-red-50 p-8 text-center dark:border-red-900/60 dark:bg-red-950/20">
        <AlertTriangle className="mb-3 text-red-500" size={34} />
        <h1 className="text-lg font-bold text-slate-950 dark:text-white">Dashboard no disponible</h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">{error || data?.message || 'No hay datos suficientes.'}</p>
      </div>
    );
  }

  const comparableLabel = `${formatDate(data.periodo_comparable.inicio)} – ${formatDate(data.periodo_comparable.fin)}`;
  const currentLabel = `${formatDate(data.periodo_actual.inicio)} – ${formatDate(data.periodo_actual.fin)}`;
  const coverageA = data.inventario.clase_a_total
    ? management.availabilityA : 0;

  return (
    <div className="space-y-6 pb-10 animate-in fade-in duration-500">
      <header className="relative overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-white to-blue-50 p-5 shadow-sm dark:border-slate-800 dark:from-brand-surface dark:via-brand-surface dark:to-blue-950/40 md:p-6">
        <div className="absolute -right-16 -top-20 h-56 w-56 rounded-full bg-cyan-400/10 blur-3xl" />
        <div className="relative flex flex-col justify-between gap-5 xl:flex-row xl:items-end">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-blue-600 dark:text-cyan-400">
              <BarChart3 size={15} /> Centro de decisión
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-950 dark:text-white md:text-3xl">Dashboard Ejecutivo</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-400">
              Rendimiento comercial, rentabilidad e inventario en una sola lectura. Las comparativas usan períodos de igual duración y las cifras se calculan sobre datos reales.
            </p>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-500 dark:text-slate-400">
              <span className="flex items-center gap-1.5"><CalendarDays size={14} />Actual: {currentLabel}</span>
              <span className="flex items-center gap-1.5"><Database size={14} />Ventas hasta {formatDate(data.cobertura.ventas_hasta)}</span>
              <span className="flex items-center gap-1.5"><Box size={14} />Inventario a {formatDate(data.cobertura.inventario_hasta)}</span>
            </div>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <select value={family} onChange={event => changeFamily(event.target.value)} className="min-w-56 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
              <option value="">Todas las familias</option>
              {data.familias.map(item => <option key={item} value={item}>{item}</option>)}
            </select>
            <div className="flex rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-900">
              {(Object.keys(periodLabels) as DashboardPeriod[]).map(key => (
                <button key={key} onClick={() => changePeriod(key)} className={`whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold transition ${period === key ? 'bg-blue-600 text-white shadow-sm dark:bg-cyan-500 dark:text-slate-950' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'}`}>
                  {periodLabels[key]}
                </button>
              ))}
            </div>
          </div>
        </div>
        {loading && <div className="absolute bottom-0 left-0 h-0.5 w-full overflow-hidden bg-blue-100 dark:bg-slate-800"><div className="h-full w-1/2 animate-pulse bg-blue-500" /></div>}
      </header>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <ExecutiveKpiCard
          title="Ventas netas"
          value={executiveEUR(data.actual.ventas_eur)}
          description="Facturación neta del período, incluyendo devoluciones y ajustes registrados."
          icon={ShoppingCart}
          accent="blue"
          change={data.variacion.ventas_pct}
          changeLabel="vs período comparable"
          detail={`${signedEUR(data.variacion.ventas_eur)} · ${data.actual.unidades.toLocaleString('es-ES')} uds.`}
        />
        <ExecutiveKpiCard
          title="Margen destino (MGD)"
          value={executiveEUR(data.actual.mgd_eur)}
          description="Contribución económica después del margen comercial informado."
          icon={CircleDollarSign}
          accent="emerald"
          change={data.variacion.mgd_pct}
          changeLabel="vs período comparable"
          detail={`${(data.actual.mgd_pct ?? 0).toLocaleString('es-ES', { maximumFractionDigits: 1 })}% sobre ventas · ${signedEUR(data.variacion.mgd_eur)}`}
        />
        <ExecutiveKpiCard
          title="Valor de inventario"
          value={executiveEUR(data.inventario.valor_eur)}
          description="Capital valorado en el último snapshot disponible de inventario."
          icon={Box}
          accent="cyan"
          change={null}
          changeLabel={`snapshot ${formatDate(data.inventario.fecha)}`}
          detail={`${data.inventario.skus.toLocaleString('es-ES')} SKU · ${data.inventario.unidades.toLocaleString('es-ES')} uds.`}
        />
        <ExecutiveKpiCard
          title="Disponibilidad Clase A"
          value={`${coverageA.toLocaleString('es-ES', { maximumFractionDigits: 1 })}%`}
          description="Porcentaje de los SKU que más venden con unidades disponibles."
          icon={PackageCheck}
          accent="amber"
          change={null}
          changeLabel="estado actual"
          detail={`${data.inventario.clase_a_sin_stock.toLocaleString('es-ES')} de ${data.inventario.clase_a_total.toLocaleString('es-ES')} SKU A sin stock`}
        />
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-red-200 bg-red-50/70 p-5 dark:border-red-900/50 dark:bg-red-950/20">
          <div className="flex items-center gap-2 text-red-600 dark:text-red-400"><ShieldAlert size={18} /><h2 className="text-sm font-bold">Principal caída comercial</h2></div>
          {management.decline ? (
            <>
              <p className="mt-3 text-xl font-bold text-slate-950 dark:text-white">{management.decline.familia}</p>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Explica una reducción de <strong className="text-red-600 dark:text-red-400">{formatEUR(Math.abs(management.decline.variacion_eur))}</strong> frente al comparable ({management.decline.variacion_pct?.toLocaleString('es-ES')}%).</p>
              <button onClick={() => changeFamily(management.decline!.familia)} className="mt-4 flex items-center gap-1 text-xs font-bold text-red-600 hover:underline dark:text-red-400">Aislar esta familia <ArrowRight size={13} /></button>
            </>
          ) : <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">No hay familias con descenso en el período.</p>}
        </div>

        <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-5 dark:border-amber-900/50 dark:bg-amber-950/20">
          <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400"><AlertTriangle size={18} /><h2 className="text-sm font-bold">Capital sin rotación 90D</h2></div>
          <p className="mt-3 text-xl font-bold text-slate-950 dark:text-white">{formatEUR(data.inventario.capital_sin_ventas_90d_eur)}</p>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Representa el <strong>{management.inactivePct.toLocaleString('es-ES', { maximumFractionDigits: 1 })}%</strong> del inventario actual sin ventas en los últimos 90 días.</p>
          <button onClick={() => navigate('/inventory')} className="mt-4 flex items-center gap-1 text-xs font-bold text-amber-700 hover:underline dark:text-amber-400">Revisar ABCXYZ <ArrowRight size={13} /></button>
        </div>

        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-5 dark:border-emerald-900/50 dark:bg-emerald-950/20">
          <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400"><RefreshCw size={18} /><h2 className="text-sm font-bold">Mayor impulso positivo</h2></div>
          {management.growth ? (
            <>
              <p className="mt-3 text-xl font-bold text-slate-950 dark:text-white">{management.growth.familia}</p>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Aporta <strong className="text-emerald-600 dark:text-emerald-400">{formatEUR(management.growth.variacion_eur)}</strong> adicionales frente al comparable ({management.growth.variacion_pct?.toLocaleString('es-ES')}%).</p>
              <button onClick={() => changeFamily(management.growth!.familia)} className="mt-4 flex items-center gap-1 text-xs font-bold text-emerald-700 hover:underline dark:text-emerald-400">Ver composición <ArrowRight size={13} /></button>
            </>
          ) : <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">Ninguna familia compensa todavía las caídas del período.</p>}
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: 'Clientes con venta', value: data.actual.clientes_con_venta.toLocaleString('es-ES'), icon: Users },
          { label: 'SKU con venta', value: data.actual.skus_con_venta.toLocaleString('es-ES'), icon: ShoppingCart },
          { label: 'Margen bruto', value: `${(data.actual.margen_pct ?? 0).toLocaleString('es-ES', { maximumFractionDigits: 1 })}%`, icon: CircleDollarSign },
          { label: 'Inventario Clase C', value: formatEUR(data.inventario.capital_clase_c_eur), icon: Box },
        ].map(item => (
          <div key={item.label} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-brand-surface">
            <item.icon size={18} className="shrink-0 text-blue-500 dark:text-cyan-400" />
            <div className="min-w-0"><p className="truncate text-[11px] text-slate-500">{item.label}</p><p className="truncate text-sm font-bold text-slate-900 dark:text-white">{item.value}</p></div>
          </div>
        ))}
      </section>

      <DashboardCharts data={data} onFamilyClick={changeFamily} />

      <footer className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-500 dark:border-slate-800 dark:bg-brand-surface dark:text-slate-400">
        <div className="flex flex-col justify-between gap-2 md:flex-row md:items-center">
          <span>Comparación actual: <strong className="text-slate-700 dark:text-slate-200">{currentLabel}</strong> frente a <strong className="text-slate-700 dark:text-slate-200">{comparableLabel}</strong>.</span>
          <span>Cobertura disponible: ventas {formatDate(data.cobertura.ventas_desde)}–{formatDate(data.cobertura.ventas_hasta)} · inventario {formatDate(data.cobertura.inventario_desde)}–{formatDate(data.cobertura.inventario_hasta)}.</span>
        </div>
        {!data.calidad.comparable_completo && <p className="mt-2 font-medium text-amber-600 dark:text-amber-400">Aviso de cobertura: {data.calidad.aviso_comparable}</p>}
      </footer>
    </div>
  );
};
