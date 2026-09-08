import React from 'react';
import type { ProductMetrics } from '../services/api';
import { formatEUR } from '../utils/formatters';
import { ArrowDown, ArrowUp, ChevronsUpDown, Download } from 'lucide-react';
import * as XLSX from 'xlsx';

interface MatrixDetailProps {
  cellId: string;
  products: ProductMetrics[];
}

const SortIcon = ({ columnKey, activeKey, direction }: {
  columnKey: keyof ProductMetrics;
  activeKey: keyof ProductMetrics | null;
  direction: 'asc' | 'desc';
}) => {
  if (activeKey !== columnKey) return <ChevronsUpDown className="ml-1 inline-block h-3 w-3 opacity-30" />;
  return direction === 'asc'
    ? <ArrowUp className="ml-1 inline-block h-3 w-3" />
    : <ArrowDown className="ml-1 inline-block h-3 w-3" />;
};

export const MatrixDetail: React.FC<MatrixDetailProps> = ({ cellId, products }) => {
  const [sortConfig, setSortConfig] = React.useState<{ key: keyof ProductMetrics | null, direction: 'asc' | 'desc' }>({ key: null, direction: 'asc' });

  const totalVentas = products.reduce((acc, p) => acc + p.ventas_90d, 0);
  const totalInventario = products.reduce((acc, p) => acc + p.valor_inv, 0);
  const totalUnidades = products.reduce((acc, p) => acc + p.unidades, 0);

  const handleSort = (key: keyof ProductMetrics) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const sortedProducts = [...products].sort((a, b) => {
    if (!sortConfig.key) return 0;
    const aValue = a[sortConfig.key];
    const bValue = b[sortConfig.key];
    if (aValue === undefined || bValue === undefined) return 0;
    if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
    if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
    return 0;
  });

  const exportToExcel = () => {
    const ws = XLSX.utils.json_to_sheet(products.map(p => ({
      'CodArt': p.cod_art,
      'Nombre': p.nombre_art,
      'Familia': p.familia,
      'Marca': p.marca,
      'Precio Unitario': p.precio_unit,
      'Unidades': p.unidades,
      'Valor Inventario': p.valor_inv,
      'Ventas 90D': p.ventas_90d,
      'Clase ABC': p.matriz_abc
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Productos");
    XLSX.writeFile(wb, `Matriz_${cellId}_data.xlsx`);
  };

  if (!cellId) {
    return (
      <div className="flex h-full flex-col items-center justify-center rounded-[20px] border border-black/[0.08] bg-white p-8 text-center shadow-[0_1px_2px_rgba(0,0,0,0.03),0_12px_32px_rgba(0,0,0,0.04)] dark:border-slate-800 dark:bg-brand-surface">
        <h3 className="title-corporate mb-2 text-[20px] font-semibold tracking-[-0.02em]">Detalle de cuadrante</h3>
        <p className="max-w-sm text-[14px] text-[#6e6e73] dark:text-slate-400">Selecciona un cuadrante de la matriz para ver los artículos que lo componen.</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col rounded-[20px] border border-black/[0.08] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.03),0_12px_32px_rgba(0,0,0,0.04)] dark:border-slate-800 dark:bg-brand-surface">
      <div className="flex items-center justify-between border-b border-black/[0.08] p-5 dark:border-slate-800">
        <div>
          <h3 className="title-corporate text-[20px] font-semibold tracking-[-0.02em]">Cuadrante {cellId}</h3>
          <p className="mt-1 text-[13px] text-[#6e6e73] dark:text-slate-400">{products.length.toLocaleString('es-ES')} artículos</p>
        </div>
        <button 
          onClick={exportToExcel}
          disabled={products.length === 0}
          className="flex min-h-9 items-center gap-2 rounded-[9px] border border-black/[0.1] px-3 py-1.5 text-[12px] font-medium text-[#0071e3] transition-colors hover:border-[#0071e3]/40 hover:bg-[#0071e3]/[0.06] disabled:opacity-40 dark:border-slate-700 dark:text-brand-cyan"
        >
          <Download size={16} />
          Exportar Excel
        </button>
      </div>
      <div className="flex-1 overflow-y-auto custom-scrollbar p-0">
        <table className="w-full text-left border-collapse">
          <thead className="sticky top-0 z-10 border-b border-black/[0.08] bg-[#fbfbfd] dark:border-slate-800 dark:bg-slate-900">
            <tr>
              <th className="w-10 px-4 py-3 text-[11px] font-medium text-[#6e6e73]">#</th>
              {([
                ['cod_art', 'CodArt', false], ['nombre_art', 'Nombre', false], ['familia', 'Categoría', false],
                ['ventas_90d', 'Ventas 90D', true], ['valor_inv', 'Inv. (€)', true], ['unidades', 'Unidades', true],
              ] as [keyof ProductMetrics, string, boolean][]).map(([key, label, right]) => (
                <th key={key} className={`px-4 py-3 text-[11px] font-medium text-[#6e6e73] ${right ? 'text-right ' : ''}cursor-pointer hover:text-[#0071e3]`} onClick={() => handleSort(key)}>
                  {label} <SortIcon columnKey={key} activeKey={sortConfig.key} direction={sortConfig.direction} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-black/[0.06] dark:divide-slate-800/50">
            {sortedProducts.map((p, index) => (
              <tr key={p.cod_art} className="transition-colors hover:bg-black/[0.025] dark:hover:bg-slate-800/30">
                <td className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400 font-medium">{index + 1}</td>
                <td className="px-4 py-3 text-sm text-slate-800 dark:text-slate-300 font-medium">{p.cod_art}</td>
                <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400 max-w-[150px] truncate" title={p.nombre_art}>{p.nombre_art}</td>
                <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">{p.familia}</td>
                <td className="px-4 py-3 text-sm text-brand-blue dark:text-brand-cyan text-right font-medium">{formatEUR(p.ventas_90d)}</td>
                <td className="px-4 py-3 text-sm text-emerald-600 dark:text-emerald-500 text-right font-medium">{formatEUR(p.valor_inv)}</td>
                <td className="px-4 py-3 text-sm text-slate-800 dark:text-slate-300 text-right">{p.unidades.toLocaleString('es-ES')}</td>
              </tr>
            ))}
            {products.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-500">No hay productos en esta selección.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between rounded-b-[20px] border-t border-black/[0.08] bg-[#fbfbfd] p-4 text-[13px] font-semibold dark:border-slate-800 dark:bg-slate-900">
        <span className="text-[#424245] dark:text-white">Totales</span>
        <div className="intelligence-tnum flex gap-5">
          <span className="text-[#0071e3] dark:text-brand-cyan">Ventas: {formatEUR(totalVentas)}</span>
          <span className="text-[#1d1d1f] dark:text-white">Inventario: {formatEUR(totalInventario)}</span>
          <span className="text-[#1d1d1f] dark:text-white">Unidades: {totalUnidades.toLocaleString('es-ES')}</span>
        </div>
      </div>
    </div>
  );
};
