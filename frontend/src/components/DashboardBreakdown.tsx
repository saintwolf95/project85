import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Search, SlidersHorizontal, TrendingDown, TrendingUp, Trophy } from 'lucide-react';
import type { DashboardBreakdownDimension, DashboardExecutiveResponse } from '../services/api';
import { formatEUR } from '../utils/formatters';

interface Props {
  data: DashboardExecutiveResponse;
  dimension: DashboardBreakdownDimension;
  loading: boolean;
  onDimensionChange: (dimension: DashboardBreakdownDimension) => void;
}

type Row = DashboardExecutiveResponse['desglose']['filas'][number];
type SortKey = 'ventas_eur' | 'variacion_eur' | 'peso_pct' | 'margen_pct' | 'mgd_eur';

const SortButton = ({ column, active, ascending, onClick, children }: {
  column: SortKey; active: boolean; ascending: boolean; onClick: (column: SortKey) => void; children: string;
}) => <button onClick={() => onClick(column)} className="inline-flex items-center gap-1 whitespace-nowrap hover:text-blue-600 dark:hover:text-cyan-400">{children}{active && (ascending ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}</button>;

const dimensions: [DashboardBreakdownDimension, string][] = [
  ['comercial', 'Comerciales'], ['cliente', 'Clientes'], ['familia', 'Familias'],
  ['marca', 'Marcas'], ['seccion', 'Secciones'],
];

const pct = (value: number | null) => value == null ? 'Sin base' : `${value > 0 ? '+' : ''}${value.toLocaleString('es-ES', { maximumFractionDigits: 1 })}%`;

export const DashboardBreakdown = ({ data, dimension, loading, onDimensionChange }: Props) => {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortKey>('ventas_eur');
  const [ascending, setAscending] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const rows = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('es');
    return data.desglose.filas
      .filter(row => !term || row.entidad.toLocaleLowerCase('es').includes(term))
      .sort((a, b) => ((Number(a[sort]) || 0) - (Number(b[sort]) || 0)) * (ascending ? 1 : -1));
  }, [data.desglose.filas, search, sort, ascending]);
  const visibleRows = showAll ? rows : rows.slice(0, 25);
  const maxSales = Math.max(...rows.map(row => Math.abs(row.ventas_eur)), 1);
  const { mayor_facturacion: leader, mayor_crecimiento: growth, mayor_caida: decline } = data.desglose.resumen;

  const changeSort = (next: SortKey) => {
    if (sort === next) setAscending(value => !value);
    else { setSort(next); setAscending(false); }
  };
  return (
    <section className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-brand-surface">
        <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-center">
          <div>
            <div className="flex items-center gap-2 text-blue-600 dark:text-cyan-400"><SlidersHorizontal size={17} /><h2 className="font-bold">Detalle comercial interactivo</h2></div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Compara cada segmento con el período equivalente del Dashboard. Ordena cualquier indicador y localiza concentraciones o caídas.</p>
          </div>
          <div className="flex flex-wrap rounded-xl bg-slate-100 p-1 dark:bg-slate-900">
            {dimensions.map(([key, label]) => <button key={key} onClick={() => onDimensionChange(key)} className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${dimension === key ? 'bg-white text-blue-600 shadow-sm dark:bg-slate-800 dark:text-cyan-400' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'}`}>{label}</button>)}
          </div>
        </div>
        {loading && <div className="mt-4 h-0.5 overflow-hidden rounded bg-slate-100 dark:bg-slate-800"><div className="h-full w-1/2 animate-pulse bg-blue-500" /></div>}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {[
          { title: 'Mayor facturación', row: leader, value: leader ? formatEUR(leader.ventas_eur) : '—', icon: Trophy, tone: 'text-blue-600 bg-blue-500/10' },
          { title: 'Mayor crecimiento', row: growth, value: growth ? `+${formatEUR(growth.variacion_eur)}` : 'Sin crecimiento', icon: TrendingUp, tone: 'text-emerald-600 bg-emerald-500/10' },
          { title: 'Mayor caída', row: decline, value: decline ? `−${formatEUR(Math.abs(decline.variacion_eur))}` : 'Sin caídas', icon: TrendingDown, tone: 'text-red-600 bg-red-500/10' },
        ].map(item => <article key={item.title} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-brand-surface"><div className="flex items-center gap-3"><div className={`rounded-xl p-2 ${item.tone}`}><item.icon size={18} /></div><div className="min-w-0"><p className="text-[11px] uppercase tracking-wide text-slate-500">{item.title}</p><p className="truncate text-sm font-bold text-slate-900 dark:text-white" title={item.row?.entidad}>{item.row?.entidad || 'Sin datos'}</p></div></div><p className="mt-3 text-lg font-bold text-slate-950 dark:text-white">{item.value}</p></article>)}
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-brand-surface">
        <div className="flex flex-col justify-between gap-3 border-b border-slate-100 p-4 dark:border-slate-800 sm:flex-row sm:items-center">
          <div><h3 className="text-sm font-bold text-slate-900 dark:text-white">Desglose por {data.desglose.etiqueta.toLocaleLowerCase('es')}</h3><p className="mt-1 text-[11px] text-slate-500">Hasta 100 segmentos ordenables · {rows.length.toLocaleString('es-ES')} visibles con la búsqueda actual</p></div>
          <label className="relative block sm:w-72"><Search className="absolute left-3 top-2.5 text-slate-400" size={15} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder={`Buscar ${data.desglose.etiqueta.toLocaleLowerCase('es')}…`} className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-xs outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900" /></label>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] text-left text-xs">
            <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500 dark:bg-slate-900/70"><tr>
              <th className="px-4 py-3">{data.desglose.etiqueta}</th><th className="px-3 py-3 text-right"><SortButton column="ventas_eur" active={sort === 'ventas_eur'} ascending={ascending} onClick={changeSort}>Ventas actuales</SortButton></th><th className="px-3 py-3 text-right">Período anterior</th><th className="px-3 py-3 text-right"><SortButton column="variacion_eur" active={sort === 'variacion_eur'} ascending={ascending} onClick={changeSort}>Variación</SortButton></th><th className="px-3 py-3 text-right"><SortButton column="peso_pct" active={sort === 'peso_pct'} ascending={ascending} onClick={changeSort}>Peso</SortButton></th><th className="px-3 py-3 text-right">Unidades</th><th className="px-3 py-3 text-right"><SortButton column="margen_pct" active={sort === 'margen_pct'} ascending={ascending} onClick={changeSort}>Margen %</SortButton></th><th className="px-4 py-3 text-right"><SortButton column="mgd_eur" active={sort === 'mgd_eur'} ascending={ascending} onClick={changeSort}>MGD</SortButton></th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">{visibleRows.map((row: Row) => {
              const positive = row.variacion_eur >= 0;
              return <tr key={row.entidad_id} className="transition hover:bg-blue-50/50 dark:hover:bg-cyan-950/10"><td className="max-w-xs px-4 py-3 font-semibold text-slate-800 dark:text-slate-200"><span className="line-clamp-2" title={row.entidad}>{row.entidad}</span><span className="mt-1 block text-[10px] font-normal text-slate-400">{row.skus.toLocaleString('es-ES')} SKU</span></td><td className="relative px-3 py-3 text-right font-bold text-slate-900 dark:text-white"><span className="absolute inset-y-1 right-0 rounded-l bg-blue-500/8" style={{ width: `${Math.min(Math.abs(row.ventas_eur) / maxSales * 100, 100)}%` }} /><span className="relative">{formatEUR(row.ventas_eur)}</span></td><td className="px-3 py-3 text-right text-slate-500">{formatEUR(row.ventas_anterior_eur)}</td><td className={`px-3 py-3 text-right font-bold ${positive ? 'text-emerald-600' : 'text-red-600'}`}><span>{positive ? '+' : '−'}{formatEUR(Math.abs(row.variacion_eur))}</span><span className="block text-[10px] font-medium">{pct(row.variacion_pct)}</span></td><td className="px-3 py-3 text-right"><span className="rounded-full bg-slate-100 px-2 py-1 font-semibold dark:bg-slate-800">{row.peso_pct.toLocaleString('es-ES', { maximumFractionDigits: 1 })}%</span></td><td className="px-3 py-3 text-right text-slate-600 dark:text-slate-300">{row.unidades.toLocaleString('es-ES')}</td><td className={`px-3 py-3 text-right font-semibold ${(row.margen_pct ?? 0) < 0 ? 'text-red-600' : 'text-slate-700 dark:text-slate-200'}`}>{row.margen_pct == null ? '—' : `${row.margen_pct.toLocaleString('es-ES', { maximumFractionDigits: 1 })}%`}</td><td className={`px-4 py-3 text-right font-semibold ${row.mgd_eur < 0 ? 'text-red-600' : 'text-slate-700 dark:text-slate-200'}`}>{formatEUR(row.mgd_eur)}</td></tr>;
            })}</tbody>
          </table>
        </div>
        {rows.length > 25 && <button onClick={() => setShowAll(value => !value)} className="w-full border-t border-slate-100 py-3 text-xs font-bold text-blue-600 hover:bg-blue-50 dark:border-slate-800 dark:text-cyan-400 dark:hover:bg-cyan-950/10">{showAll ? 'Mostrar solo los 25 principales' : `Mostrar los ${rows.length} segmentos`}</button>}
      </div>
    </section>
  );
};
