import { useMemo, useState } from 'react';
import { ArrowDown, ArrowDownRight, ArrowUp, ArrowUpRight, Search, SlidersHorizontal, TrendingDown, TrendingUp, Trophy } from 'lucide-react';
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
}) => <button onClick={() => onClick(column)} className="inline-flex items-center gap-1 whitespace-nowrap transition-colors hover:text-[#0071E3] dark:hover:text-cyan-400">{children}{active && (ascending ? <ArrowUp size={12} strokeWidth={1.75} /> : <ArrowDown size={12} strokeWidth={1.75} />)}</button>;

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
    <section className="space-y-6">
      <div className="rounded-[20px] border border-black/[0.08] bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,.04),0_2px_8px_rgba(0,0,0,.04)] dark:border-slate-800 dark:bg-brand-surface">
        <div className="flex flex-col justify-between gap-5 xl:flex-row xl:items-center">
          <div>
            <div className="flex items-center gap-2 text-[#0071E3] dark:text-cyan-400"><SlidersHorizontal size={18} strokeWidth={1.75} /><h2 className="text-[20px] font-semibold tracking-[-0.01em] text-[#1d1d1f] dark:text-white">Detalle comercial interactivo</h2></div>
            <p className="mt-1.5 text-[13px] text-slate-500 dark:text-slate-400">Compara cada segmento con el período equivalente del Dashboard. Ordena cualquier indicador y localiza concentraciones o caídas.</p>
          </div>
          <div className="flex flex-wrap rounded-xl bg-[#f5f5f7] p-1 dark:bg-slate-900">
            {dimensions.map(([key, label]) => <button key={key} onClick={() => onDimensionChange(key)} className={`min-h-9 rounded-[9px] px-3.5 text-[13px] font-medium transition-all duration-150 active:scale-[.97] ${dimension === key ? 'bg-white text-[#1d1d1f] shadow-[0_1px_2px_rgba(0,0,0,.08)] dark:bg-slate-800 dark:text-white' : 'text-slate-500 hover:text-[#1d1d1f] dark:hover:text-white'}`}>{label}</button>)}
          </div>
        </div>
        {loading && <div className="mt-5 h-0.5 overflow-hidden rounded bg-slate-100 dark:bg-slate-800"><div className="h-full w-1/2 animate-pulse bg-[#0071E3]" /></div>}
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
        {[
          { title: 'Mayor facturación', row: leader, value: leader ? formatEUR(leader.ventas_eur) : '—', icon: Trophy, tone: 'text-blue-600 bg-blue-500/10' },
          { title: 'Mayor crecimiento', row: growth, value: growth ? `+${formatEUR(growth.variacion_eur)}` : 'Sin crecimiento', icon: TrendingUp, tone: 'text-emerald-600 bg-emerald-500/10' },
          { title: 'Mayor caída', row: decline, value: decline ? `−${formatEUR(Math.abs(decline.variacion_eur))}` : 'Sin caídas', icon: TrendingDown, tone: 'text-red-600 bg-red-500/10' },
        ].map(item => <article key={item.title} className="rounded-[20px] border border-black/[0.08] bg-white p-5 dark:border-slate-800 dark:bg-brand-surface"><div className="flex items-center gap-3"><div className={`rounded-xl p-2.5 ${item.tone}`}><item.icon size={18} strokeWidth={1.75} /></div><div className="min-w-0"><p className="text-[12px] text-slate-500">{item.title}</p><p className="truncate text-[15px] font-semibold tracking-[-0.01em] text-[#1d1d1f] dark:text-white" title={item.row?.entidad}>{item.row?.entidad || 'Sin datos'}</p></div></div><p className="dashboard-tnum mt-5 text-[20px] font-semibold tracking-[-0.01em] text-[#1d1d1f] dark:text-white">{item.value}</p></article>)}
      </div>

      <div className="overflow-hidden rounded-[20px] border border-black/[0.08] bg-white shadow-[0_1px_2px_rgba(0,0,0,.04),0_2px_8px_rgba(0,0,0,.04)] dark:border-slate-800 dark:bg-brand-surface">
        <div className="flex flex-col justify-between gap-4 border-b border-black/[0.08] p-6 dark:border-slate-800 sm:flex-row sm:items-center">
          <div><h3 className="text-[20px] font-semibold tracking-[-0.01em] text-[#1d1d1f] dark:text-white">Desglose por {data.desglose.etiqueta.toLocaleLowerCase('es')}</h3><p className="mt-1.5 text-[13px] text-slate-500">Hasta 100 segmentos ordenables · {rows.length.toLocaleString('es-ES')} visibles con la búsqueda actual</p></div>
          <label className="relative block sm:w-80"><Search className="absolute left-3.5 top-3 text-slate-400" size={16} strokeWidth={1.75} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder={`Buscar ${data.desglose.etiqueta.toLocaleLowerCase('es')}…`} className="min-h-11 w-full rounded-[10px] border border-black/[0.12] bg-white py-2 pl-10 pr-3.5 text-[13px] text-[#1d1d1f] outline-none transition-colors focus:border-[#0071E3] dark:border-slate-700 dark:bg-slate-900 dark:text-white" /></label>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] border-collapse text-left text-[13px]">
            <thead className="sticky top-0 z-10 border-b border-black/[0.08] bg-white text-[12px] font-medium text-slate-500 dark:border-slate-800 dark:bg-slate-900"><tr>
              <th className="px-5 py-3.5 font-medium">{data.desglose.etiqueta}</th><th className="px-4 py-3.5 text-right font-medium"><SortButton column="ventas_eur" active={sort === 'ventas_eur'} ascending={ascending} onClick={changeSort}>Ventas actuales</SortButton></th><th className="px-4 py-3.5 text-right font-medium">Período anterior</th><th className="px-4 py-3.5 text-right font-medium"><SortButton column="variacion_eur" active={sort === 'variacion_eur'} ascending={ascending} onClick={changeSort}>Variación</SortButton></th><th className="px-4 py-3.5 text-right font-medium"><SortButton column="peso_pct" active={sort === 'peso_pct'} ascending={ascending} onClick={changeSort}>Peso</SortButton></th><th className="px-4 py-3.5 text-right font-medium">Unidades</th><th className="px-4 py-3.5 text-right font-medium"><SortButton column="margen_pct" active={sort === 'margen_pct'} ascending={ascending} onClick={changeSort}>Margen %</SortButton></th><th className="px-5 py-3.5 text-right font-medium"><SortButton column="mgd_eur" active={sort === 'mgd_eur'} ascending={ascending} onClick={changeSort}>MGD</SortButton></th>
            </tr></thead>
            <tbody className="divide-y divide-black/[0.08] dark:divide-slate-800">{visibleRows.map((row: Row) => {
              const positive = row.variacion_eur >= 0;
              const DeltaIcon = positive ? ArrowUpRight : ArrowDownRight;
              return <tr key={row.entidad_id} className="transition-colors duration-150 hover:bg-black/[0.025] dark:hover:bg-cyan-950/10"><td className="max-w-xs px-5 py-3.5 font-medium text-[#1d1d1f] dark:text-slate-200"><span className="line-clamp-2" title={row.entidad}>{row.entidad}</span><span className="dashboard-tnum mt-1 block text-[11px] font-normal text-slate-400">{row.skus.toLocaleString('es-ES')} SKU</span></td><td className="dashboard-tnum relative px-4 py-3.5 text-right font-medium text-[#1d1d1f] dark:text-white"><span className="absolute inset-y-2 right-0 rounded-l bg-[#0071E3]/10" style={{ width: `${Math.min(Math.abs(row.ventas_eur) / maxSales * 100, 100)}%` }} /><span className="relative">{formatEUR(row.ventas_eur)}</span></td><td className="dashboard-tnum px-4 py-3.5 text-right text-slate-500">{formatEUR(row.ventas_anterior_eur)}</td><td className={`dashboard-tnum px-4 py-3.5 text-right font-medium ${positive ? 'text-emerald-600' : 'text-red-600'}`}><span className="inline-flex items-center gap-1"><DeltaIcon size={14} strokeWidth={2} />{positive ? '+' : '−'}{formatEUR(Math.abs(row.variacion_eur))}</span><span className="block text-[11px] font-normal">{pct(row.variacion_pct)}</span></td><td className="dashboard-tnum px-4 py-3.5 text-right text-[#1d1d1f] dark:text-white">{row.peso_pct.toLocaleString('es-ES', { maximumFractionDigits: 1 })}%</td><td className="dashboard-tnum px-4 py-3.5 text-right text-slate-600 dark:text-slate-300">{row.unidades.toLocaleString('es-ES')}</td><td className={`dashboard-tnum px-4 py-3.5 text-right font-medium ${(row.margen_pct ?? 0) < 0 ? 'text-red-600' : 'text-slate-700 dark:text-slate-200'}`}>{row.margen_pct == null ? '—' : `${row.margen_pct.toLocaleString('es-ES', { maximumFractionDigits: 1 })}%`}</td><td className={`dashboard-tnum px-5 py-3.5 text-right font-medium ${row.mgd_eur < 0 ? 'text-red-600' : 'text-slate-700 dark:text-slate-200'}`}>{formatEUR(row.mgd_eur)}</td></tr>;
            })}</tbody>
          </table>
        </div>
        {rows.length > 25 && <button onClick={() => setShowAll(value => !value)} className="min-h-11 w-full border-t border-black/[0.08] text-[13px] font-medium text-[#0071E3] transition-colors hover:bg-[#0071E3]/5 dark:border-slate-800 dark:text-cyan-400 dark:hover:bg-cyan-950/10">{showAll ? 'Mostrar solo los 25 principales' : `Mostrar los ${rows.length} segmentos`}</button>}
      </div>
    </section>
  );
};
