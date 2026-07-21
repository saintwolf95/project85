import React, { useState, useMemo } from 'react';
import { X, PieChart as PieIcon, List, Download } from 'lucide-react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import type { AIInsight, ProductMetrics } from '../services/api';
import { formatEUR } from '../utils/formatters';
import * as XLSX from 'xlsx';

interface InsightModalProps {
  insight: AIInsight | null;
  inventory: ProductMetrics[];
  onClose: () => void;
}

export const InsightModal: React.FC<InsightModalProps> = ({ insight, inventory, onClose }) => {
  const [viewMode, setViewMode] = useState<'chart' | 'table'>('chart');

  // Filter affected products based on insight type
  const affectedProducts = useMemo(() => {
    if (!insight) return [];
    const t = insight.titulo.toLowerCase();
    
    if (t.includes('rotura')) {
      return inventory.filter(p => p.riesgos_categorizados?.includes('Riesgo Rotura'));
    }
    if (t.includes('financiero') || t.includes('exceso') || t.includes('inmovilizado')) {
      return inventory.filter(p => p.riesgos_categorizados?.includes('Riesgo Financiero'));
    }
    if (t.includes('clase a') || insight.tipo === 'success') {
      return inventory.filter(p => p.abc === 'A');
    }
    return [];
  }, [insight, inventory]);

  const chartData = useMemo(() => {
    const familyCounts: Record<string, number> = {};
    affectedProducts.forEach(p => {
      familyCounts[p.familia] = (familyCounts[p.familia] || 0) + 1;
    });
    return Object.entries(familyCounts).map(([name, value]) => ({ name, value }));
  }, [affectedProducts]);

  const COLORS = ['#0ea5e9', '#3b82f6', '#8b5cf6', '#a855f7', '#ec4899', '#f43f5e', '#f97316'];

  if (!insight) return null;

  const handleExport = () => {
    const ws = XLSX.utils.json_to_sheet(affectedProducts.map(p => ({
      'CodArt': p.cod_art,
      'Nombre': p.nombre_art,
      'Familia': p.familia,
      'Valor Inventario': p.valor_inv,
      'Ventas 90D': p.ventas_90d,
      'Clase ABC': p.matriz_abc
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Productos_Afectados");
    XLSX.writeFile(wb, `Insight_${insight.tipo}_Data.xlsx`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
        onClick={onClose}
      ></div>
      
      {/* Modal */}
      <div className="relative bg-white dark:bg-slate-900 w-full max-w-4xl rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h2 className="title-corporate text-2xl text-slate-800 dark:text-white flex items-center gap-2">
              {insight.titulo}
            </h2>
            <p className="text-slate-500 dark:text-slate-400 mt-1">{insight.sugerencia}</p>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors text-slate-500"
          >
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6 flex flex-col gap-6">
          {/* Controls */}
          <div className="flex justify-between items-center">
            <div className="flex bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
              <button
                onClick={() => setViewMode('chart')}
                className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${viewMode === 'chart' ? 'bg-white dark:bg-slate-700 text-brand-blue dark:text-brand-cyan shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}
              >
                <PieIcon size={16} /> Gráfica
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${viewMode === 'table' ? 'bg-white dark:bg-slate-700 text-brand-blue dark:text-brand-cyan shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}
              >
                <List size={16} /> Tabla ({affectedProducts.length})
              </button>
            </div>
            <button 
              onClick={handleExport}
              className="flex items-center gap-2 px-4 py-2 bg-brand-blue/10 dark:bg-brand-cyan/10 text-brand-blue dark:text-brand-cyan rounded-lg hover:bg-brand-blue/20 dark:hover:bg-brand-cyan/20 transition-colors text-sm font-bold"
            >
              <Download size={16} />
              Exportar Afectados
            </button>
          </div>

          {/* View Container */}
          <div className="flex-1 min-h-[350px] bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-800 p-4">
            {viewMode === 'chart' ? (
              affectedProducts.length > 0 ? (
                <div className="h-full w-full flex flex-col items-center">
                  <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-2">Distribución por Categoría</h3>
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={chartData}
                        cx="50%"
                        cy="50%"
                        innerRadius={80}
                        outerRadius={120}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {chartData.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#fff' }}
                        itemStyle={{ color: '#fff' }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-full flex items-center justify-center text-slate-500">No hay datos gráficos para esta alerta.</div>
              )
            ) : (
              <div className="h-[350px] overflow-auto custom-scrollbar">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-slate-100 dark:bg-slate-800 sticky top-0 z-10">
                    <tr>
                      <th className="px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">CodArt</th>
                      <th className="px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Nombre</th>
                      <th className="px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Categoría</th>
                      <th className="px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider text-right">Valor Inv.</th>
                      <th className="px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider text-right">Matriz ABC</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-700/50">
                    {affectedProducts.map((p) => (
                      <tr key={p.cod_art} className="hover:bg-slate-100 dark:hover:bg-slate-800/80 transition-colors">
                        <td className="px-4 py-3 text-sm text-slate-800 dark:text-slate-300 font-medium">{p.cod_art}</td>
                        <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400 max-w-[200px] truncate" title={p.nombre_art}>{p.nombre_art}</td>
                        <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">{p.familia}</td>
                        <td className="px-4 py-3 text-sm text-brand-blue dark:text-brand-cyan text-right font-medium">{formatEUR(p.valor_inv)}</td>
                        <td className="px-4 py-3 text-sm text-slate-800 dark:text-slate-300 text-right">{p.matriz_abc}</td>
                      </tr>
                    ))}
                    {affectedProducts.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-slate-500">No se encontraron productos afectados directos.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 rounded-b-2xl flex justify-between items-center">
          <span className="text-sm text-slate-500 dark:text-slate-400">Total afectados: {affectedProducts.length} productos</span>
          <button 
            className="px-6 py-2 bg-brand-blue dark:bg-brand-cyan text-white dark:text-slate-900 rounded-lg hover:opacity-90 transition-opacity font-bold"
            onClick={onClose}
          >
            Entendido
          </button>
        </div>

      </div>
    </div>
  );
};
