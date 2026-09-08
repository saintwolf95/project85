import React, { useState } from 'react';
import type { ProductMetrics } from '../services/api';
import { formatEUR } from '../utils/formatters';
import { LineChart as LineChartIcon } from 'lucide-react';
import { ProductHistoryModal } from './ProductHistoryModal';

interface Props {
  data: ProductMetrics[];
}

export const InventoryTable: React.FC<Props> = ({ data }) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<{id: string, nombre: string} | null>(null);
  const [sortConfig, setSortConfig] = useState<{ key: keyof ProductMetrics | null, direction: 'asc' | 'desc' }>({ key: null, direction: 'asc' });

  const totalStock = data.reduce((acc, curr) => acc + curr.unidades, 0);
  const totalValue = data.reduce((acc, curr) => acc + curr.valor_inv, 0);

  const getRiskBadge = (risk: string, i: number) => {
    let colorClasses = "bg-slate-500/10 text-slate-500 border-slate-500/30";
    if (risk === "Alerta Rotura") colorClasses = "bg-red-500/20 text-red-700 dark:text-red-400 border-red-500/50 font-bold animate-pulse";
    if (risk === "Riesgo Rotura") colorClasses = "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/30";
    if (risk === "Riesgo Financiero") colorClasses = "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30";
    if (risk === "Riesgo Comercial") colorClasses = "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/30";

    return (
      <span key={i} className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${colorClasses} whitespace-nowrap`}>
        {risk}
      </span>
    );
  };

  const getRowClasses = () => "transition-colors hover:bg-black/[0.025] dark:hover:bg-slate-800/30";

  const handleSort = (key: keyof ProductMetrics) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const sortedData = [...data].sort((a, b) => {
    if (!sortConfig.key) return 0;
    
    const aValue = a[sortConfig.key];
    const bValue = b[sortConfig.key];

    if (aValue === undefined || bValue === undefined) return 0;

    if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
    if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
    return 0;
  });

  const sortIcon = (columnKey: keyof ProductMetrics) => {
    if (sortConfig.key !== columnKey) return <span className="ml-1 opacity-20">↕</span>;
    return sortConfig.direction === 'asc' ? <span className="ml-1">↑</span> : <span className="ml-1">↓</span>;
  };

  return (
    <div className="flex flex-col h-full">
      {/* Título de la sección */}
      <div className="shrink-0 border-b border-black/[0.08] px-5 py-4 dark:border-slate-800">
        <h3 className="text-[20px] font-semibold tracking-[-0.02em] text-[#1d1d1f] dark:text-white">Catálogo de inventario</h3>
      </div>
      {/* Scroll area que ocupa todo el espacio restante */}
      <div className="flex-1 min-h-0 overflow-auto">
        <table className="w-full text-left border-collapse">
          <thead className="sticky top-0 z-10 border-b border-black/[0.08] bg-[#fbfbfd] dark:border-slate-800 dark:bg-slate-900">
            <tr>
              <th className="px-4 py-3 text-[11px] font-medium text-[#6e6e73] whitespace-nowrap cursor-pointer hover:text-[#0071e3]" onClick={() => handleSort('cod_art')}>SKU {sortIcon('cod_art')}</th>
              <th className="px-4 py-3 text-[11px] font-medium text-[#6e6e73] whitespace-nowrap cursor-pointer hover:text-[#0071e3]" onClick={() => handleSort('nombre_art')}>Artículo {sortIcon('nombre_art')}</th>
              <th className="px-4 py-3 text-[11px] font-medium text-[#6e6e73] whitespace-nowrap cursor-pointer hover:text-[#0071e3]" onClick={() => handleSort('familia')}>Familia {sortIcon('familia')}</th>
              <th className="px-4 py-3 text-[11px] font-medium text-[#6e6e73] whitespace-nowrap cursor-pointer hover:text-[#0071e3]" onClick={() => handleSort('seccion')}>Sección {sortIcon('seccion')}</th>
              <th className="px-4 py-3 text-[11px] font-medium text-[#6e6e73] whitespace-nowrap cursor-pointer hover:text-[#0071e3]" onClick={() => handleSort('marca')}>Marca {sortIcon('marca')}</th>
              <th className="px-4 py-3 text-[11px] font-medium text-[#6e6e73] whitespace-nowrap cursor-pointer hover:text-[#0071e3]" onClick={() => handleSort('product_manager')}>PM {sortIcon('product_manager')}</th>
              <th className="px-4 py-3 text-right text-[11px] font-medium text-[#6e6e73] whitespace-nowrap cursor-pointer hover:text-[#0071e3]" onClick={() => handleSort('precio_unit')}>Precio unit. {sortIcon('precio_unit')}</th>
              <th className="px-4 py-3 text-right text-[11px] font-medium text-[#6e6e73] whitespace-nowrap cursor-pointer hover:text-[#0071e3]" onClick={() => handleSort('unidades')}>Unidades {sortIcon('unidades')}</th>
              <th className="px-4 py-3 text-right text-[11px] font-medium text-[#6e6e73] whitespace-nowrap cursor-pointer hover:text-[#0071e3]" onClick={() => handleSort('valor_inv')}>Valor inventario {sortIcon('valor_inv')}</th>
              <th className="px-4 py-3 text-right text-[11px] font-medium text-[#6e6e73] whitespace-nowrap cursor-pointer hover:text-[#0071e3]" onClick={() => handleSort('unidades_venta_90d')}>U. venta 90D {sortIcon('unidades_venta_90d')}</th>
              <th className="px-4 py-3 text-right text-[11px] font-medium text-[#6e6e73] whitespace-nowrap cursor-pointer hover:text-[#0071e3]" onClick={() => handleSort('ventas_90d')}>Ventas 90D {sortIcon('ventas_90d')}</th>
              <th className="px-4 py-3 text-right text-[11px] font-medium text-[#6e6e73] whitespace-nowrap cursor-pointer hover:text-[#0071e3]" onClick={() => handleSort('ads')}>ADS {sortIcon('ads')}</th>
              <th className="px-4 py-3 text-right text-[11px] font-medium text-[#6e6e73] whitespace-nowrap cursor-pointer hover:text-[#0071e3]" onClick={() => handleSort('dias_cobertura')}>Cobertura {sortIcon('dias_cobertura')}</th>
              <th className="px-4 py-3 text-center text-[11px] font-medium text-[#0071e3] whitespace-nowrap cursor-pointer hover:text-[#0077ed]" onClick={() => handleSort('matriz_abc')}>Matriz {sortIcon('matriz_abc')}</th>
              <th className="px-4 py-3 text-center text-[11px] font-medium text-[#6e6e73] whitespace-nowrap">Estado</th>
              <th className="px-4 py-3 text-center text-[11px] font-medium text-[#6e6e73] whitespace-nowrap">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/[0.06] bg-white dark:divide-slate-800/50 dark:bg-transparent">
            {sortedData.map((item) => (
              <tr 
                key={item.cod_art} 
                className={getRowClasses()}
              >
                <td className="px-4 py-3.5 text-[13px] font-medium text-[#1d1d1f] dark:text-slate-200 whitespace-nowrap">{item.cod_art}</td>
                <td className="max-w-[200px] truncate px-4 py-3.5 text-[13px] text-[#424245] dark:text-slate-400 whitespace-nowrap" title={item.nombre_art}>{item.nombre_art}</td>
                <td className="px-4 py-4 text-sm text-slate-600 dark:text-slate-400 whitespace-nowrap">{item.familia}</td>
                <td className="px-4 py-4 text-sm text-slate-600 dark:text-slate-400 whitespace-nowrap">{item.seccion || '-'}</td>
                <td className="px-4 py-4 text-sm text-slate-600 dark:text-slate-400 whitespace-nowrap">{item.marca}</td>
                <td className="px-4 py-4 text-sm font-bold text-brand-blue dark:text-brand-cyan whitespace-nowrap">{item.product_manager || '-'}</td>
                <td className="px-4 py-4 text-sm text-slate-600 dark:text-slate-400 whitespace-nowrap text-right">{formatEUR(item.precio_unit)}</td>
                <td className="px-4 py-4 text-sm text-slate-800 dark:text-slate-200 whitespace-nowrap text-right font-medium">{item.inventario_disponible ? item.unidades : '—'}</td>
                <td className="px-4 py-4 text-sm text-slate-600 dark:text-slate-400 whitespace-nowrap text-right">{item.inventario_disponible ? formatEUR(item.valor_inv) : '—'}</td>
                <td className="px-4 py-4 text-sm text-slate-600 dark:text-slate-400 whitespace-nowrap text-right">{item.unidades_venta_90d}</td>
                <td className="px-4 py-4 text-sm text-slate-600 dark:text-slate-400 whitespace-nowrap text-right">{formatEUR(item.ventas_90d)}</td>
                <td className="px-4 py-4 text-sm text-slate-600 dark:text-slate-400 whitespace-nowrap text-right">{item.ads.toFixed(1)}</td>
                <td className="px-4 py-4 text-sm text-slate-600 dark:text-slate-400 whitespace-nowrap text-right">
                  {item.inventario_disponible ? (item.dias_cobertura >= 999 ? '>999' : item.dias_cobertura.toFixed(0)) : '—'}
                </td>
                <td className="px-4 py-4 text-sm text-center whitespace-nowrap">
                  <span className={`font-bold px-2.5 py-1 rounded-md text-xs shadow-sm ${
                    item.matriz_abc === 'AZ' ? 'bg-emerald-100 text-emerald-800 border border-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-400 dark:border-emerald-500/30' :
                    item.matriz_abc === 'CX' ? 'bg-red-100 text-red-800 border border-red-200 dark:bg-red-500/20 dark:text-red-400 dark:border-red-500/30' :
                    item.matriz_abc === 'AX' ? 'bg-orange-100 text-orange-800 border border-orange-200 dark:bg-orange-500/20 dark:text-orange-400 dark:border-orange-500/30' :
                    item.matriz_abc === 'CZ' ? 'bg-slate-200 text-slate-800 border border-slate-300 dark:bg-slate-700 dark:text-slate-300 dark:border-slate-600' :
                    'bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
                  }`}>
                    {item.matriz_abc}
                  </span>
                </td>
                <td className="px-4 py-4 whitespace-nowrap">
                  <div className="flex flex-wrap gap-1 items-center justify-center">
                    {item.riesgos_categorizados && item.riesgos_categorizados.length > 0 ? (
                      item.riesgos_categorizados.map((r, i) => getRiskBadge(r, i))
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-500 border border-emerald-200 dark:border-emerald-500/30">
                        Sano
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-4 whitespace-nowrap text-center">
                  <button
                    onClick={() => {
                      setSelectedProduct({ id: item.producto_id.toString(), nombre: item.nombre_art });
                      setModalOpen(true);
                    }}
                    className="p-1.5 text-slate-500 hover:text-brand-cyan hover:bg-brand-cyan/10 rounded-lg transition-colors inline-flex items-center gap-1 text-xs font-medium"
                    title="Ver Evolución Histórica"
                  >
                    <LineChartIcon size={16} />
                    <span>Evolución</span>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="sticky bottom-0 z-10 border-t border-black/[0.08] bg-[#fbfbfd] font-semibold dark:border-slate-800 dark:bg-slate-900">
            <tr>
              <td colSpan={8} className="px-4 py-4 text-right text-[13px] text-[#424245] dark:text-white">Totales de la página</td>
              <td className="intelligence-tnum px-4 py-4 text-right text-[13px] text-[#1d1d1f] dark:text-white">{totalStock}</td>
              <td className="intelligence-tnum px-4 py-4 text-right text-[13px] text-[#1d1d1f] dark:text-white">{formatEUR(totalValue)}</td>
              <td colSpan={6}></td>
            </tr>
          </tfoot>
        </table>
      </div>
      
      {selectedProduct && (
        <ProductHistoryModal 
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          productoId={selectedProduct.id}
          productoNombre={selectedProduct.nombre}
        />
      )}
    </div>
  );
};
