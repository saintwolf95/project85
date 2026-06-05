import React, { useEffect, useState } from 'react';
import { X, LineChart as LineChartIcon } from 'lucide-react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { formatEUR } from '../utils/formatters';
import { api } from '../services/api';
import type { ProductHistoryResponse } from '../services/api';

interface ProductHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  productoId: string;
  productoNombre: string;
}

export const ProductHistoryModal: React.FC<ProductHistoryModalProps> = ({ isOpen, onClose, productoId, productoNombre }) => {
  const [data, setData] = useState<ProductHistoryResponse | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && productoId) {
      const fetchData = async () => {
        setLoading(true);
        try {
          const res = await api.get(`/analytics/product-history/${productoId}`);
          setData(res.data);
        } catch (err) {
          console.error("Error fetching product history:", err);
        } finally {
          setLoading(false);
        }
      };
      fetchData();
    }
  }, [isOpen, productoId]);

  if (!isOpen) return null;

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-slate-900 border border-slate-700 p-3 rounded-lg shadow-xl">
          <p className="font-bold text-white mb-2">{label}</p>
          {payload.map((entry: any, index: number) => (
            <div key={index} className="flex items-center gap-2 text-sm mb-1">
              <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: entry.color }} />
              <span className="text-slate-300">{entry.name}:</span>
              <span className="font-medium text-white font-mono">
                {formatEUR(entry.value)}
              </span>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-brand-surface w-full max-w-4xl rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 md:p-6 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-brand-cyan/20 rounded-lg text-brand-cyan">
              <LineChartIcon size={24} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white leading-none mb-1">Evolución Histórica (60 Días)</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 font-mono truncate max-w-lg">{productoNombre}</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 md:p-6 bg-white dark:bg-transparent min-h-[400px] flex flex-col justify-center">
          {loading ? (
            <div className="flex flex-col items-center justify-center">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand-cyan mb-3"></div>
              <p className="text-slate-500">Cargando evolución...</p>
            </div>
          ) : data?.historico && data.historico.length > 0 ? (
            <div className="w-full h-[400px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.historico} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} opacity={0.3} />
                  <XAxis 
                    dataKey="fecha" 
                    stroke="#94a3b8" 
                    fontSize={12} 
                    tickFormatter={(val) => {
                      const d = new Date(val);
                      return `${d.getDate()}/${d.getMonth()+1}`;
                    }}
                  />
                  <YAxis yAxisId="left" stroke="#10b981" fontSize={12} tickFormatter={(val) => `€${(val/1000).toFixed(0)}k`} />
                  <YAxis yAxisId="right" orientation="right" stroke="#06b6d4" fontSize={12} tickFormatter={(val) => `€${(val/1000).toFixed(0)}k`} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend verticalAlign="top" height={36} />
                  <Line 
                    yAxisId="left"
                    type="monotone" 
                    dataKey="ventas_eur" 
                    name="Ventas (€)" 
                    stroke="#10b981" 
                    strokeWidth={3}
                    dot={false}
                    activeDot={{ r: 6 }}
                  />
                  <Line 
                    yAxisId="right"
                    type="monotone" 
                    dataKey="inventario_eur" 
                    name="Inventario (€)" 
                    stroke="#06b6d4" 
                    strokeWidth={3}
                    dot={false}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="text-center text-slate-500">
              No hay datos históricos para este producto.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
