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
      <span key={i} className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium border ${colorClasses} whitespace-nowrap`}>
        {risk}
      </span>
    );
  };

  const getRowClasses = (item: ProductMetrics) => {
    const risks = item.riesgos_categorizados || [];
    if (risks.includes("Alerta Rotura")) {
      return "bg-red-50/80 hover:bg-red-100 dark:bg-red-900/10 dark:hover:bg-red-900/20 border-l-4 border-l-red-500";
    }
    if (risks.includes("Riesgo Rotura") || risks.includes("Riesgo Financiero")) {
      return "bg-orange-50/80 hover:bg-orange-100 dark:bg-orange-900/10 dark:hover:bg-orange-900/20 border-l-4 border-l-orange-500";
    }
    if (risks.includes("Riesgo Comercial")) {
      return "bg-yellow-50/80 hover:bg-yellow-100 dark:bg-yellow-900/10 dark:hover:bg-yellow-900/20 border-l-4 border-l-yellow-500";
    }
    // Sano
    return "bg-emerald-50/80 hover:bg-emerald-100 dark:bg-emerald-900/10 dark:hover:bg-emerald-900/20 border-l-4 border-l-emerald-500";
  };

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

  const SortIcon = ({ columnKey }: { columnKey: keyof ProductMetrics }) => {
    if (sortConfig.key !== columnKey) return <span className="ml-1 opacity-20">↕</span>;
    return sortConfig.direction === 'asc' ? <span className="ml-1">↑</span> : <span className="ml-1">↓</span>;
  };

  return (
    <div className="flex flex-col h-full">
      {/* Título de la sección */}
      <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 shrink-0">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Inventario Inteligente</h3>
      </div>
      {/* Scroll area que ocupa todo el espacio restante */}
      <div className="flex-1 min-h-0 overflow-auto">
        <table className="w-full text-left border-collapse">
          <thead className="bg-slate-50 dark:bg-slate-900 sticky top-0 z-10 border-b border-slate-200 dark:border-slate-800">
            <tr>
              <th className="px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider whitespace-nowrap cursor-pointer hover:text-brand-cyan" onClick={() => handleSort('cod_art')}>CodArt <SortIcon columnKey="cod_art" /></th>
              <th className="px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider whitespace-nowrap cursor-pointer hover:text-brand-cyan" onClick={() => handleSort('nombre_art')}>NombreArt <SortIcon columnKey="nombre_art" /></th>
              <th className="px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider whitespace-nowrap cursor-pointer hover:text-brand-cyan" onClick={() => handleSort('familia')}>Familia <SortIcon columnKey="familia" /></th>
              <th className="px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider whitespace-nowrap cursor-pointer hover:text-brand-cyan" onClick={() => handleSort('seccion')}>Sección <SortIcon columnKey="seccion" /></th>
              <th className="px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider whitespace-nowrap cursor-pointer hover:text-brand-cyan" onClick={() => handleSort('marca')}>Marca <SortIcon columnKey="marca" /></th>
              <th className="px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider whitespace-nowrap cursor-pointer hover:text-brand-cyan" onClick={() => handleSort('product_manager')}>PM <SortIcon columnKey="product_manager" /></th>
              <th className="px-4 py-3 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap text-right cursor-pointer hover:text-brand-cyan" onClick={() => handleSort('precio_unit')}>PrecioUnit <SortIcon columnKey="precio_unit" /></th>
              <th className="px-4 py-3 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap text-right cursor-pointer hover:text-brand-cyan" onClick={() => handleSort('unidades')}>Unidades <SortIcon columnKey="unidades" /></th>
              <th className="px-4 py-3 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap text-right cursor-pointer hover:text-brand-cyan" onClick={() => handleSort('valor_inv')}>ValorInv <SortIcon columnKey="valor_inv" /></th>
              <th className="px-4 py-3 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap text-right cursor-pointer hover:text-brand-cyan" onClick={() => handleSort('unidades_venta_90d')}>U. Venta (90D) <SortIcon columnKey="unidades_venta_90d" /></th>
              <th className="px-4 py-3 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap text-right cursor-pointer hover:text-brand-cyan" onClick={() => handleSort('ventas_90d')}>Ventas (90D) <SortIcon columnKey="ventas_90d" /></th>
              <th className="px-4 py-3 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap text-right cursor-pointer hover:text-brand-cyan" onClick={() => handleSort('ads')}>ADS <SortIcon columnKey="ads" /></th>
              <th className="px-4 py-3 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap text-right cursor-pointer hover:text-brand-cyan" onClick={() => handleSort('dias_cobertura')}>Días Cob. <SortIcon columnKey="dias_cobertura" /></th>
              <th className="px-4 py-3 text-xs font-medium text-brand-blue dark:text-brand-cyan uppercase tracking-wider whitespace-nowrap text-center cursor-pointer hover:text-brand-cyan" onClick={() => handleSort('matriz_abc')}>Matriz ABCXYZ <SortIcon columnKey="matriz_abc" /></th>
              <th className="px-4 py-3 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap text-center">Estado / Riesgos</th>
              <th className="px-4 py-3 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap text-center">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50 bg-white dark:bg-transparent">
            {sortedData.map((item) => (
              <tr 
                key={item.cod_art} 
                className={`transition-colors ${getRowClasses(item)}`}
              >
                <td className="px-4 py-4 text-sm font-medium text-slate-800 dark:text-slate-200 whitespace-nowrap">{item.cod_art}</td>
                <td className="px-4 py-4 text-sm text-slate-600 dark:text-slate-400 whitespace-nowrap max-w-[200px] truncate" title={item.nombre_art}>{item.nombre_art}</td>
                <td className="px-4 py-4 text-sm text-slate-600 dark:text-slate-400 whitespace-nowrap">{item.familia}</td>
                <td className="px-4 py-4 text-sm text-slate-600 dark:text-slate-400 whitespace-nowrap">{item.seccion || '-'}</td>
                <td className="px-4 py-4 text-sm text-slate-600 dark:text-slate-400 whitespace-nowrap">{item.marca}</td>
                <td className="px-4 py-4 text-sm font-bold text-brand-blue dark:text-brand-cyan whitespace-nowrap">{item.product_manager || '-'}</td>
                <td className="px-4 py-4 text-sm text-slate-600 dark:text-slate-400 whitespace-nowrap text-right">{formatEUR(item.precio_unit)}</td>
                <td className="px-4 py-4 text-sm text-slate-800 dark:text-slate-200 whitespace-nowrap text-right font-medium">{item.unidades}</td>
                <td className="px-4 py-4 text-sm text-slate-600 dark:text-slate-400 whitespace-nowrap text-right">{formatEUR(item.valor_inv)}</td>
                <td className="px-4 py-4 text-sm text-slate-600 dark:text-slate-400 whitespace-nowrap text-right">{item.unidades_venta_90d}</td>
                <td className="px-4 py-4 text-sm text-slate-600 dark:text-slate-400 whitespace-nowrap text-right">{formatEUR(item.ventas_90d)}</td>
                <td className="px-4 py-4 text-sm text-slate-600 dark:text-slate-400 whitespace-nowrap text-right">{item.ads.toFixed(1)}</td>
                <td className="px-4 py-4 text-sm text-slate-600 dark:text-slate-400 whitespace-nowrap text-right">{item.dias_cobertura >= 999 ? '>999' : item.dias_cobertura.toFixed(0)}</td>
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
          <tfoot className="bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 sticky bottom-0 z-10 font-bold">
            <tr>
              <td colSpan={8} className="px-4 py-4 text-right text-slate-700 dark:text-white">TOTALES (Página)</td>
              <td className="px-4 py-4 text-right text-slate-900 dark:text-white">{totalStock}</td>
              <td className="px-4 py-4 text-right text-slate-900 dark:text-white">{formatEUR(totalValue)}</td>
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
