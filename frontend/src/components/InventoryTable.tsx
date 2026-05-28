import React from 'react';
import type { ProductMetrics } from '../services/api';
import { formatEUR } from '../utils/formatters';

interface Props {
  data: ProductMetrics[];
}

export const InventoryTable: React.FC<Props> = ({ data }) => {
  const totalStock = data.reduce((acc, curr) => acc + curr.unidades, 0);
  const totalValue = data.reduce((acc, curr) => acc + curr.valor_inv, 0);

  const getRiskBadge = (risk: string, i: number) => {
    let colorClasses = "bg-slate-500/10 text-slate-500 border-slate-500/30";
    if (risk === "Riesgo Rotura") colorClasses = "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/30";
    if (risk === "Riesgo Financiero") colorClasses = "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30";
    if (risk === "Riesgo Comercial") colorClasses = "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/30";

    return (
      <span key={i} className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium border ${colorClasses} whitespace-nowrap`}>
        {risk}
      </span>
    );
  };

  return (
    <div className="bg-white dark:bg-brand-surface rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
      <div className="p-5 border-b border-slate-200 dark:border-slate-800">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Inventario Inteligente</h3>
      </div>
      <div className="overflow-x-auto max-h-[500px]">
        <table className="w-full text-left border-collapse">
          <thead className="bg-slate-50 dark:bg-slate-900 sticky top-0 z-10 border-b border-slate-200 dark:border-slate-800">
            <tr>
              <th className="px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider whitespace-nowrap">CodArt</th>
              <th className="px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider whitespace-nowrap">NombreArt</th>
              <th className="px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider whitespace-nowrap">Familia</th>
              <th className="px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider whitespace-nowrap">Marca</th>
              <th className="px-4 py-3 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap">EAN</th>
              <th className="px-4 py-3 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap text-right">PrecioUnit</th>
              <th className="px-4 py-3 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap text-right">Unidades</th>
              <th className="px-4 py-3 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap text-right">ValorInv</th>
              <th className="px-4 py-3 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap text-right">U. Venta (60D)</th>
              <th className="px-4 py-3 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap text-right">Ventas (60D)</th>
              <th className="px-4 py-3 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap text-right">ADS</th>
              <th className="px-4 py-3 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap text-right">Días Cob.</th>
              <th className="px-4 py-3 text-xs font-medium text-brand-blue dark:text-brand-cyan uppercase tracking-wider whitespace-nowrap text-center">Matriz ABC</th>
              <th className="px-4 py-3 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap text-center">Estado / Riesgos</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50 bg-white dark:bg-transparent">
            {data.map((item) => (
              <tr 
                key={item.cod_art} 
                className={`hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors ${item.matriz_abc?.includes('A') ? 'border-l-4 border-l-brand-blue dark:border-l-brand-cyan bg-brand-blue/5 dark:bg-brand-cyan/5' : 'border-l-4 border-transparent'}`}
              >
                <td className="px-4 py-4 text-sm font-medium text-slate-800 dark:text-slate-200 whitespace-nowrap">{item.cod_art}</td>
                <td className="px-4 py-4 text-sm text-slate-600 dark:text-slate-400 whitespace-nowrap max-w-[200px] truncate" title={item.nombre_art}>{item.nombre_art}</td>
                <td className="px-4 py-4 text-sm text-slate-600 dark:text-slate-400 whitespace-nowrap">{item.familia}</td>
                <td className="px-4 py-4 text-sm text-slate-600 dark:text-slate-400 whitespace-nowrap">{item.marca}</td>
                <td className="px-4 py-4 text-xs font-mono text-slate-500 whitespace-nowrap">{item.ean}</td>
                <td className="px-4 py-4 text-sm text-slate-600 dark:text-slate-400 whitespace-nowrap text-right">
                  {formatEUR(item.precio_unit)}
                </td>
                <td className="px-4 py-4 text-sm text-slate-800 dark:text-slate-200 whitespace-nowrap text-right font-medium">
                  {item.unidades}
                </td>
                <td className="px-4 py-4 text-sm text-slate-600 dark:text-slate-400 whitespace-nowrap text-right">
                  {formatEUR(item.valor_inv)}
                </td>
                <td className="px-4 py-4 text-sm text-slate-600 dark:text-slate-400 whitespace-nowrap text-right">
                  {item.unidades_venta_60d}
                </td>
                <td className="px-4 py-4 text-sm text-slate-600 dark:text-slate-400 whitespace-nowrap text-right">
                  {formatEUR(item.ventas_60d)}
                </td>
                <td className="px-4 py-4 text-sm text-slate-600 dark:text-slate-400 whitespace-nowrap text-right">
                  {item.ads.toFixed(1)}
                </td>
                <td className="px-4 py-4 text-sm text-slate-600 dark:text-slate-400 whitespace-nowrap text-right">
                  {item.dias_cobertura >= 999 ? '>999' : item.dias_cobertura.toFixed(0)}
                </td>
                <td className="px-4 py-4 text-sm text-center whitespace-nowrap">
                  <span className={`font-bold px-2.5 py-1 rounded-md text-xs shadow-sm ${
                    item.matriz_abc === 'AA' ? 'bg-emerald-100 text-emerald-800 border border-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-400 dark:border-emerald-500/30' :
                    item.matriz_abc === 'CA' ? 'bg-red-100 text-red-800 border border-red-200 dark:bg-red-500/20 dark:text-red-400 dark:border-red-500/30' :
                    item.matriz_abc === 'AC' ? 'bg-orange-100 text-orange-800 border border-orange-200 dark:bg-orange-500/20 dark:text-orange-400 dark:border-orange-500/30' :
                    item.matriz_abc === 'CC' ? 'bg-slate-200 text-slate-800 border border-slate-300 dark:bg-slate-700 dark:text-slate-300 dark:border-slate-600' :
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
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 sticky bottom-0 z-10 font-bold">
            <tr>
              <td colSpan={6} className="px-4 py-4 text-right text-slate-700 dark:text-white">TOTALES (Página)</td>
              <td className="px-4 py-4 text-right text-slate-900 dark:text-white">{totalStock}</td>
              <td className="px-4 py-4 text-right text-slate-900 dark:text-white">{formatEUR(totalValue)}</td>
              <td colSpan={6}></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
};
