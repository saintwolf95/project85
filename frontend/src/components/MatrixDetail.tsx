import React from 'react';
import type { ProductMetrics } from '../services/api';
import { formatEUR } from '../utils/formatters';
import { Download } from 'lucide-react';
import * as XLSX from 'xlsx';

interface MatrixDetailProps {
  cellId: string;
  products: ProductMetrics[];
}

export const MatrixDetail: React.FC<MatrixDetailProps> = ({ cellId, products }) => {
  const [sortConfig, setSortConfig] = React.useState<{ key: keyof ProductMetrics | null, direction: 'asc' | 'desc' }>({ key: null, direction: 'asc' });

  const totalVentas = products.reduce((acc, p) => acc + p.ventas_60d, 0);
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

  const SortIcon = ({ columnKey }: { columnKey: keyof ProductMetrics }) => {
    if (sortConfig.key !== columnKey) return <span className="ml-1 opacity-20">↕</span>;
    return sortConfig.direction === 'asc' ? <span className="ml-1">↑</span> : <span className="ml-1">↓</span>;
  };

  const exportToExcel = () => {
    const ws = XLSX.utils.json_to_sheet(products.map(p => ({
      'CodArt': p.cod_art,
      'Nombre': p.nombre_art,
      'Familia': p.familia,
      'Marca': p.marca,
      'Precio Unitario': p.precio_unit,
      'Unidades': p.unidades,
      'Valor Inventario': p.valor_inv,
      'Ventas 60D': p.ventas_60d,
      'Clase ABC': p.matriz_abc
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Productos");
    XLSX.writeFile(wb, `Matriz_${cellId}_data.xlsx`);
  };

  if (!cellId) {
    return (
      <div className="bg-white dark:bg-brand-surface rounded-xl border border-slate-200 dark:border-slate-800 p-8 h-full flex flex-col items-center justify-center text-center">
        <h3 className="title-corporate mb-2">Detalle de Cuadrante</h3>
        <p className="text-slate-500 dark:text-slate-400">Haz clic en cualquier cuadrante de la matriz para ver sus productos correspondientes.</p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-brand-surface rounded-xl border border-slate-200 dark:border-slate-800 h-full flex flex-col shadow-sm">
      <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
        <div>
          <h3 className="title-corporate text-lg">Cuadrante {cellId}</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">{products.length} productos listados</p>
        </div>
        <button 
          onClick={exportToExcel}
          disabled={products.length === 0}
          className="flex items-center gap-2 px-3 py-1.5 bg-brand-blue/10 dark:bg-brand-cyan/10 text-brand-blue dark:text-brand-cyan rounded-lg hover:bg-brand-blue/20 dark:hover:bg-brand-cyan/20 transition-colors text-sm font-medium disabled:opacity-50"
        >
          <Download size={16} />
          Exportar Excel
        </button>
      </div>
      <div className="flex-1 overflow-y-auto custom-scrollbar p-0">
        <table className="w-full text-left border-collapse">
          <thead className="bg-slate-50 dark:bg-slate-900 sticky top-0 z-10 border-b border-slate-200 dark:border-slate-800">
            <tr>
              <th className="px-4 py-3 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider w-10">#</th>
              <th className="px-4 py-3 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider cursor-pointer hover:text-brand-cyan" onClick={() => handleSort('cod_art')}>CodArt <SortIcon columnKey="cod_art" /></th>
              <th className="px-4 py-3 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider cursor-pointer hover:text-brand-cyan" onClick={() => handleSort('nombre_art')}>Nombre <SortIcon columnKey="nombre_art" /></th>
              <th className="px-4 py-3 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider cursor-pointer hover:text-brand-cyan" onClick={() => handleSort('familia')}>Categoría <SortIcon columnKey="familia" /></th>
              <th className="px-4 py-3 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right cursor-pointer hover:text-brand-cyan" onClick={() => handleSort('ventas_60d')}>Ventas 60D <SortIcon columnKey="ventas_60d" /></th>
              <th className="px-4 py-3 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right cursor-pointer hover:text-brand-cyan" onClick={() => handleSort('valor_inv')}>Inv. (€) <SortIcon columnKey="valor_inv" /></th>
              <th className="px-4 py-3 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right cursor-pointer hover:text-brand-cyan" onClick={() => handleSort('unidades')}>Unidades <SortIcon columnKey="unidades" /></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
            {sortedProducts.map((p, index) => (
              <tr key={p.cod_art} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                <td className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400 font-medium">{index + 1}</td>
                <td className="px-4 py-3 text-sm text-slate-800 dark:text-slate-300 font-medium">{p.cod_art}</td>
                <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400 max-w-[150px] truncate" title={p.nombre_art}>{p.nombre_art}</td>
                <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">{p.familia}</td>
                <td className="px-4 py-3 text-sm text-brand-blue dark:text-brand-cyan text-right font-medium">{formatEUR(p.ventas_60d)}</td>
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
      <div className="bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 p-4 rounded-b-xl flex justify-between items-center font-bold">
        <span className="text-slate-700 dark:text-white">TOTALES</span>
        <div className="flex gap-8">
          <span className="text-brand-blue dark:text-brand-cyan">Ventas: {formatEUR(totalVentas)}</span>
          <span className="text-emerald-600 dark:text-emerald-500">Inv: {formatEUR(totalInventario)}</span>
          <span className="text-slate-900 dark:text-white">Unidades: {totalUnidades.toLocaleString('es-ES')}</span>
        </div>
      </div>
    </div>
  );
};
