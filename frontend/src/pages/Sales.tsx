import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Filter, RefreshCw, Search, ShoppingCart, Users, Package, BadgeEuro, CalendarDays, X } from 'lucide-react';
import { getSalesExplorer, getSalesExplorerOptions } from '../services/api';
import type { SalesExplorerFilters, SalesExplorerOptions, SalesExplorerResponse } from '../services/api';
import { formatEUR } from '../utils/formatters';
import './Sales.css';

const emptyOptions: SalesExplorerOptions = { familias: [], marcas: [], secciones: [], product_managers: [], tipos_cliente: [], kd: [], comerciales_cliente: [], comerciales_factura: [], fecha_min: null, fecha_max: null };
const emptyResult: SalesExplorerResponse = { rows: [], total_records: 0, page: 1, total_pages: 1, totals: { ventas_eur: 0, unidades: 0, margen_eur: 0, margen_pct: null, mgd_eur: 0, mgd_pct: 0, skus: 0, clientes: 0 } };

const formatDate = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString('es-ES');
const formatInt = (value: number) => value.toLocaleString('es-ES');

type SelectKey = keyof Pick<SalesExplorerOptions, 'familias' | 'marcas' | 'secciones' | 'product_managers' | 'tipos_cliente' | 'kd' | 'comerciales_cliente' | 'comerciales_factura'>;

export const Sales = () => {
  const [filters, setFilters] = useState<SalesExplorerFilters>({});
  const [draftSearch, setDraftSearch] = useState('');
  const [sort, setSort] = useState('fecha_desc');
  const [page, setPage] = useState(1);
  const [options, setOptions] = useState<SalesExplorerOptions>(emptyOptions);
  const [data, setData] = useState<SalesExplorerResponse>(emptyResult);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => { getSalesExplorerOptions().then(setOptions).catch(() => setError('No se pudieron cargar las opciones de filtro.')); }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => { setPage(1); setFilters(current => ({ ...current, busqueda: draftSearch.trim() || undefined })); }, 300);
    return () => window.clearTimeout(timer);
  }, [draftSearch]);
  useEffect(() => {
    let active = true;
    setLoading(true);
    getSalesExplorer(page, filters, sort).then(result => { if (active) { setData(result); setError(''); } }).catch(() => { if (active) setError('No se pudo cargar el detalle de ventas. Inténtalo de nuevo.'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [page, filters, sort, reloadKey]);

  const activeFilters = useMemo(() => Object.entries(filters).filter(([, value]) => Boolean(value)).length, [filters]);
  const setFilter = (key: keyof SalesExplorerFilters, value: string) => { setPage(1); setFilters(current => ({ ...current, [key]: value || undefined })); };
  const clearFilters = () => { setDraftSearch(''); setFilters({}); setPage(1); };
  const select = (key: keyof SalesExplorerFilters, optionsKey: SelectKey, label: string) => <label className="min-w-0"><span className="sr-only">{label}</span><select value={filters[key] || ''} onChange={event => setFilter(key, event.target.value)} className="sales-select"><option value="">{label}</option>{options[optionsKey].map(option => <option key={option} value={option}>{option}</option>)}</select></label>;
  const kpis: Array<{ icon: typeof ShoppingCart; label: string; value: string; detail: string }> = [
    { icon: ShoppingCart, label: 'Ventas netas', value: formatEUR(data.totals.ventas_eur), detail: `${formatInt(data.total_records)} líneas agrupadas` },
    { icon: Package, label: 'Unidades', value: formatInt(data.totals.unidades), detail: `${formatInt(data.totals.skus)} SKU con venta` },
    { icon: BadgeEuro, label: 'Margen bruto', value: formatEUR(data.totals.margen_eur), detail: `${data.totals.margen_pct?.toLocaleString('es-ES', { maximumFractionDigits: 1 }) ?? '—'}% sobre ventas` },
    { icon: Users, label: 'MGD y clientes', value: formatEUR(data.totals.mgd_eur), detail: `${data.totals.mgd_pct.toLocaleString('es-ES', { maximumFractionDigits: 1 })}% · ${formatInt(data.totals.clientes)} clientes` },
  ];

  return <main className="mx-auto flex h-full w-full max-w-[1600px] flex-col gap-5 animate-in fade-in duration-300">
    <header className="rounded-[20px] border border-black/[0.08] bg-white px-6 py-6 shadow-[0_1px_2px_rgba(0,0,0,0.03),0_12px_32px_rgba(0,0,0,0.04)] dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-start justify-between gap-5"><div><p className="text-[12px] font-medium uppercase tracking-[0.08em] text-[#86868b]">Exploración comercial</p><h1 className="mt-1 text-[32px] font-semibold tracking-[-0.035em] text-[#1d1d1f] dark:text-white">Ventas</h1><p className="mt-1 text-[14px] text-[#6e6e73] dark:text-slate-400">Detalle real por fecha, artículo, cliente, KD y responsables comerciales.</p></div><div className="flex items-center gap-2 text-[12px] text-[#6e6e73] dark:text-slate-400"><CalendarDays size={15} />{options.fecha_min && options.fecha_max ? `${formatDate(options.fecha_min)} — ${formatDate(options.fecha_max)}` : 'Cobertura pendiente'}</div></div>
      <div className="mt-6 border-t border-black/[0.08] pt-5 dark:border-slate-800"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><span className="flex items-center gap-2 text-[13px] font-medium text-slate-600 dark:text-slate-300"><Filter size={15} />Filtros de ventas {activeFilters > 0 && `(${activeFilters})`}</span>{activeFilters > 0 && <button type="button" onClick={clearFilters} className="inline-flex min-h-9 items-center gap-1 text-[13px] font-medium text-[#0071e3] hover:underline dark:text-cyan-400"><X size={14} />Limpiar filtros</button>}</div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"><label className="relative sm:col-span-2 xl:col-span-1"><Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/><input value={draftSearch} onChange={event => setDraftSearch(event.target.value)} placeholder="Artículo, SKU o cliente" className="sales-input pl-9" /></label><label><span className="sr-only">Fecha desde</span><input type="date" value={filters.fecha_desde || ''} min={options.fecha_min || undefined} max={filters.fecha_hasta || options.fecha_max || undefined} onChange={event => setFilter('fecha_desde', event.target.value)} className="sales-input" /></label><label><span className="sr-only">Fecha hasta</span><input type="date" value={filters.fecha_hasta || ''} min={filters.fecha_desde || options.fecha_min || undefined} max={options.fecha_max || undefined} onChange={event => setFilter('fecha_hasta', event.target.value)} className="sales-input" /></label>{select('familia', 'familias', 'Todas las familias')}{select('marca', 'marcas', 'Todas las marcas')}{select('seccion', 'secciones', 'Todas las secciones')}{select('product_manager', 'product_managers', 'Todos los PM')}{select('tipo_cliente', 'tipos_cliente', 'Todos los tipos de cliente')}{select('kd', 'kd', 'Todos los KD')}{select('comercial_cliente', 'comerciales_cliente', 'Comercial asignado')}{select('comercial_factura', 'comerciales_factura', 'Comercial de factura')}</div>
      </div>
    </header>

    {error && <div className="rounded-[14px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">{error}</div>}
    <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {kpis.map(({ icon: Icon, label, value, detail }) => <article key={label} className="rounded-[16px] border border-black/[0.08] bg-white p-4 dark:border-slate-800 dark:bg-slate-900"><div className="flex items-center gap-2 text-[#0071e3] dark:text-cyan-400"><Icon size={16} /><span className="text-[12px] font-medium text-[#6e6e73] dark:text-slate-400">{label}</span></div><p className="mt-3 sales-tnum text-[21px] font-semibold text-[#1d1d1f] dark:text-white">{value}</p><p className="mt-1 text-[11px] text-[#6e6e73] dark:text-slate-400">{detail}</p></article>)}
    </section>

    <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[20px] border border-black/[0.08] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.03),0_12px_32px_rgba(0,0,0,0.04)] dark:border-slate-800 dark:bg-slate-900"><header className="flex flex-wrap items-center justify-between gap-3 border-b border-black/[0.08] px-5 py-4 dark:border-slate-800"><div><h2 className="text-[16px] font-semibold text-[#1d1d1f] dark:text-white">Detalle de ventas</h2><p className="mt-0.5 text-[12px] text-[#6e6e73] dark:text-slate-400">Los totales corresponden a todos los registros filtrados.</p></div><div className="flex items-center gap-2"><select value={sort} onChange={event => { setSort(event.target.value); setPage(1); }} className="sales-select w-auto"><option value="fecha_desc">Fecha más reciente</option><option value="ventas_desc">Mayores ventas</option><option value="margen_desc">Mayor margen</option></select><button type="button" onClick={() => setReloadKey(current => current + 1)} title="Actualizar resultados" className="inline-flex h-10 w-10 items-center justify-center rounded-[10px] border border-black/[0.1] text-[#0071e3] hover:bg-[#0071e3]/[0.06] dark:border-slate-700 dark:text-cyan-400"><RefreshCw size={16} /></button></div></header>
      <div className="min-h-0 flex-1 overflow-auto">{loading ? <div className="flex h-64 items-center justify-center gap-3 text-sm text-slate-500"><RefreshCw size={18} className="animate-spin" />Cargando ventas...</div> : data.rows.length === 0 ? <div className="flex h-64 flex-col items-center justify-center text-sm text-slate-500"><ShoppingCart size={28} className="mb-3 opacity-40" />No hay ventas que coincidan con estos filtros.</div> : <table className="w-full min-w-[1540px] border-collapse text-left text-[12px]"><thead className="sticky top-0 z-10 border-b border-black/[0.08] bg-[#fbfbfd] text-[#6e6e73] dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400"><tr>{['Fecha', 'Artículo / SKU', 'Cliente', 'Familia / marca', 'Sección · PM', 'Tipo · KD', 'Comercial', 'Ventas', 'Unidades', 'Margen', 'MGD'].map(head => <th key={head} className="whitespace-nowrap px-4 py-3 font-medium">{head}</th>)}</tr></thead><tbody className="divide-y divide-black/[0.06] dark:divide-slate-800">{data.rows.map((row, index) => <tr key={`${row.fecha}-${row.sku}-${row.cliente_pk}-${row.kd}-${index}`} className="hover:bg-[#0071e3]/[0.025] dark:hover:bg-slate-800/40"><td className="whitespace-nowrap px-4 py-3 text-slate-600 dark:text-slate-300">{formatDate(row.fecha)}</td><td className="max-w-[240px] px-4 py-3"><strong className="block truncate text-[#1d1d1f] dark:text-white">{row.articulo}</strong><span className="font-mono text-[11px] text-slate-500">{row.sku}</span></td><td className="max-w-[220px] px-4 py-3"><strong className="block truncate text-[#1d1d1f] dark:text-white">{row.cliente}</strong><span className="font-mono text-[11px] text-slate-500">{row.cliente_pk}</span></td><td className="px-4 py-3 text-slate-600 dark:text-slate-300"><span className="block">{row.familia}</span><span className="text-[11px] text-slate-500">{row.marca}</span></td><td className="px-4 py-3 text-slate-600 dark:text-slate-300"><span className="block">{row.seccion}</span><span className="text-[11px] text-slate-500">{row.product_manager}</span></td><td className="px-4 py-3 text-slate-600 dark:text-slate-300"><span className="block">{row.tipo_cliente}</span><span className="text-[11px] text-slate-500">{row.kd}</span></td><td className="px-4 py-3 text-slate-600 dark:text-slate-300"><span className="block">Factura: {row.comercial_factura}</span><span className="text-[11px] text-slate-500">Asignado: {row.comercial_cliente}</span></td><td className="sales-tnum whitespace-nowrap px-4 py-3 text-right font-semibold text-[#1d1d1f] dark:text-white">{formatEUR(row.ventas_eur)}</td><td className="sales-tnum whitespace-nowrap px-4 py-3 text-right text-slate-700 dark:text-slate-300">{formatInt(row.unidades)}</td><td className="sales-tnum whitespace-nowrap px-4 py-3 text-right text-slate-700 dark:text-slate-300">{formatEUR(row.margen_eur)}</td><td className="sales-tnum whitespace-nowrap px-4 py-3 text-right text-slate-700 dark:text-slate-300">{formatEUR(row.mgd_eur)}</td></tr>)}</tbody></table>}</div>
      <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-black/[0.08] bg-[#fbfbfd] px-5 py-3 text-[12px] text-[#6e6e73] dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400"><span>Página {data.page} de {data.total_pages} · {formatInt(data.total_records)} registros</span><div className="flex gap-2"><button type="button" onClick={() => setPage(current => Math.max(1, current - 1))} disabled={page === 1 || loading} className="sales-page-button"><ChevronLeft size={16} /></button><button type="button" onClick={() => setPage(current => Math.min(data.total_pages, current + 1))} disabled={page >= data.total_pages || loading} className="sales-page-button"><ChevronRight size={16} /></button></div></footer>
    </section>
  </main>;
};
