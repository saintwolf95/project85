import React, { useMemo } from 'react';
import { X, Euro, Package, TrendingUp, AlertTriangle, TrendingDown, ShoppingCart } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell } from 'recharts';
import type { ProductMetrics } from '../services/api';
import { formatEUR } from '../utils/formatters';

interface MatrixDetailDashboardProps {
  activeCell: string;
  data: ProductMetrics[];
  onClear: () => void;
}

interface Strategy {
  title: string;
  desc: string;
  color: string;
  textColor: string;
  bg: string;
  borderColor: string;
  icon: React.ReactNode;
  actions: string[];
  kpiLabel: string;
}

const getStrategy = (activeCell: string): Strategy => {
  switch (activeCell) {
    case 'AX': return {
      title: 'Core Business (AX) ⭐',
      desc: 'Mayor contribución de ventas y mayor concentración de inventario. Estos artículos son el motor principal y requieren máxima disponibilidad.',
      color: 'blue',
      textColor: 'text-blue-600 dark:text-blue-400',
      bg: 'bg-blue-50 dark:bg-blue-900/20',
      borderColor: 'border-blue-200 dark:border-blue-800',
      icon: <TrendingUp className="w-5 h-5" />,
      actions: ['✅ Automatizar las compras (reposición automática)', '✅ Negociar grandes volúmenes con proveedores', '✅ Mantener niveles de servicio altos'],
      kpiLabel: 'ventas60'
    };
    case 'AY': return {
      title: 'Atención Moderada (AY)',
      desc: 'Alta contribución de ventas y concentración media de inventario. Controlar cobertura, servicio y capital comprometido.',
      color: 'amber',
      textColor: 'text-yellow-600 dark:text-yellow-400',
      bg: 'bg-yellow-50 dark:bg-yellow-900/20',
      borderColor: 'border-yellow-200 dark:border-yellow-800',
      icon: <TrendingUp className="w-5 h-5" />,
      actions: ['📈 Monitorear fluctuaciones semanales', '📊 Ajustar márgenes de seguridad dinámicamente'],
      kpiLabel: 'ventas60'
    };
    case 'AZ': return {
      title: 'CRÍTICO: Riesgo Máximo (AZ) 🚨',
      desc: 'Alta contribución de ventas y bajo inventario relativo. Vigilar el riesgo de rotura y la reposición de estos artículos.',
      color: 'red',
      textColor: 'text-red-600 dark:text-red-400',
      bg: 'bg-red-50 dark:bg-red-900/20',
      borderColor: 'border-red-200 dark:border-red-800',
      icon: <AlertTriangle className="w-5 h-5" />,
      actions: ['🔴 Limitar compras, trabajar bajo pedido si es posible', '🔴 Negociar acuerdos de devolución', '🔴 Bajar precios de inmediato para rotar'],
      kpiLabel: 'valor'
    };
    case 'BX': return {
      title: 'Flujo Seguro (BX)',
      desc: 'Contribución media de ventas y alta concentración de inventario. Mantener rotación y cobertura bajo control.',
      color: 'emerald',
      textColor: 'text-emerald-600 dark:text-emerald-400',
      bg: 'bg-emerald-50 dark:bg-emerald-900/20',
      borderColor: 'border-emerald-200 dark:border-emerald-800',
      icon: <ShoppingCart className="w-5 h-5" />,
      actions: ['✅ Programar compras mensuales/bimensuales', '✅ Relajación en controles diarios'],
      kpiLabel: 'ventas60'
    };
    case 'BY': return {
      title: 'Vigilancia Estándar (BY)',
      desc: 'Contribución e inventario medios. Cuadrante equilibrado que requiere controles normales de máximos, mínimos y cobertura.',
      color: 'amber',
      textColor: 'text-yellow-600 dark:text-yellow-400',
      bg: 'bg-yellow-50 dark:bg-yellow-900/20',
      borderColor: 'border-yellow-200 dark:border-yellow-800',
      icon: <ShoppingCart className="w-5 h-5" />,
      actions: ['⚠️ Utilizar alertas de máximos y mínimos', '📊 Revisar trimestralmente su evolución'],
      kpiLabel: 'valor'
    };
    case 'BZ': return {
      title: 'Riesgo Alto (BZ)',
      desc: 'Contribución media de ventas y bajo inventario relativo. Revisar cobertura y riesgo de reposición.',
      color: 'orange',
      textColor: 'text-orange-600 dark:text-orange-400',
      bg: 'bg-orange-50 dark:bg-orange-900/20',
      borderColor: 'border-orange-200 dark:border-orange-800',
      icon: <AlertTriangle className="w-5 h-5" />,
      actions: ['⚠️ Bajar el punto de pedido urgentemente', '📦 Intentar forzar ventas cruzadas (bundles)'],
      kpiLabel: 'valor'
    };
    case 'CX': return {
      title: 'Automatizable (CX)',
      desc: 'Baja contribución de ventas y alta concentración de inventario. Revisar capital inmovilizado y velocidad de salida.',
      color: 'emerald',
      textColor: 'text-emerald-600 dark:text-emerald-400',
      bg: 'bg-emerald-50 dark:bg-emerald-900/20',
      borderColor: 'border-emerald-200 dark:border-emerald-800',
      icon: <Package className="w-5 h-5" />,
      actions: ['⚙️ Automatización total de reposición', '⚙️ Trabajar con Kanban de 2 bins'],
      kpiLabel: 'valor'
    };
    case 'CY': return {
      title: 'Baja Prioridad (CY)',
      desc: 'Baja contribución de ventas y concentración media de inventario. Monitoreo y compras ajustadas.',
      color: 'lime',
      textColor: 'text-lime-600 dark:text-lime-400',
      bg: 'bg-lime-50 dark:bg-lime-900/20',
      borderColor: 'border-lime-200 dark:border-lime-800',
      icon: <Package className="w-5 h-5" />,
      actions: ['📉 Revisión esporádica', '📊 Compras por lotes para abaratar envío'],
      kpiLabel: 'valor'
    };
    case 'CZ': return {
      title: 'Ruido del Catálogo (CZ)',
      desc: 'Baja contribución de ventas y bajo valor de inventario. Comprar solo bajo pedido o revisar continuidad.',
      color: 'slate',
      textColor: 'text-slate-500 dark:text-slate-400',
      bg: 'bg-slate-100 dark:bg-slate-800',
      borderColor: 'border-slate-300 dark:border-slate-700',
      icon: <TrendingDown className="w-5 h-5" />,
      actions: ['⬇️ Mover a "sólo por pedido"', '🗑️ Evaluar discontinuar producto', '✂️ Simplificar catálogo retirándolos'],
      kpiLabel: 'valor'
    };
    default: return {
      title: 'Cuadrante Seleccionado',
      desc: 'Analiza los productos de este cuadrante para tomar decisiones estratégicas de inventario.',
      color: 'blue',
      textColor: 'text-brand-blue dark:text-brand-cyan',
      bg: 'bg-blue-50 dark:bg-blue-900/20',
      borderColor: 'border-blue-200 dark:border-blue-800',
      icon: <Package className="w-5 h-5" />,
      actions: [],
      kpiLabel: 'valor'
    };
  }
};

export const MatrixDetailDashboard: React.FC<MatrixDetailDashboardProps> = ({ activeCell, data, onClear }) => {
  const strategy = useMemo(() => getStrategy(activeCell), [activeCell]);

  const chartData = useMemo(() => {
    const familyMap: Record<string, number> = {};
    data.forEach(p => {
      familyMap[p.familia] = (familyMap[p.familia] || 0) + p.valor_inv;
    });
    return Object.entries(familyMap)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [data]);

  const totalValue = useMemo(() => data.reduce((sum, p) => sum + p.valor_inv, 0), [data]);
  const totalVentas = useMemo(() => data.reduce((sum, p) => sum + p.ventas_90d, 0), [data]);
  const avgCobertura = useMemo(() => {
    if (!data.length) return 0;
    const validCoverage = data.filter(p => p.dias_cobertura < 999);
    if (!validCoverage.length) return 0;
    return validCoverage.reduce((sum, p) => sum + p.dias_cobertura, 0) / validCoverage.length;
  }, [data]);
  const enRiesgo = useMemo(() => data.filter(p => p.riesgos_categorizados?.includes('Riesgo Rotura')).length, [data]);

  const COLORS = ['#0ea5e9', '#3b82f6', '#8b5cf6', '#a855f7', '#ec4899', '#f97316'];

  return (
    <div className={`border ${strategy.borderColor} rounded-xl overflow-hidden shadow-sm animate-in fade-in slide-in-from-top-2 duration-300`}>
      {/* Header con título y botón cerrar */}
      <div className={`${strategy.bg} border-b ${strategy.borderColor} px-5 py-3 flex justify-between items-center`}>
        <div className="flex items-center gap-3">
          <span className={`${strategy.textColor}`}>{strategy.icon}</span>
          <div>
            <div className="flex items-center gap-2">
              <span className={`text-xs font-bold uppercase tracking-wider text-slate-400`}>Cuadrante {activeCell}</span>
            </div>
            <h4 className={`text-base font-bold ${strategy.textColor}`}>{strategy.title}</h4>
          </div>
        </div>
        <button
          onClick={onClear}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors shadow-sm"
        >
          <X size={13} /> Limpiar
        </button>
      </div>

      {/* Cuerpo en 3 columnas */}
      <div className="bg-white dark:bg-brand-surface flex flex-col lg:flex-row">
        
        {/* Col 1: Descripción + Acciones */}
        <div className={`p-5 lg:w-2/5 border-b lg:border-b-0 lg:border-r ${strategy.borderColor}`}>
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed mb-4">{strategy.desc}</p>
          {strategy.actions.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Acciones Recomendadas</p>
              {strategy.actions.map((action, i) => (
                <p key={i} className="text-sm text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 rounded-lg px-3 py-2 border border-slate-100 dark:border-slate-700">
                  {action}
                </p>
              ))}
            </div>
          )}
        </div>

        {/* Col 2: KPIs */}
        <div className={`p-5 lg:w-1/5 border-b lg:border-b-0 lg:border-r ${strategy.borderColor} flex flex-col justify-center gap-4`}>
          <div className="flex items-center gap-3">
            <div className={`bg-brand-blue/10 dark:bg-brand-cyan/10 p-2.5 rounded-xl ${strategy.textColor}`}>
              <Package size={20} />
            </div>
            <div>
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Artículos</p>
              <p className="text-xl font-bold text-slate-900 dark:text-white">{data.length.toLocaleString('es-ES')}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="bg-emerald-100 dark:bg-emerald-500/10 p-2.5 rounded-xl text-emerald-600 dark:text-emerald-400">
              <Euro size={20} />
            </div>
            <div>
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Valor Stock</p>
              <p className="text-xl font-bold text-slate-900 dark:text-white">{formatEUR(totalValue)}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="bg-purple-100 dark:bg-purple-500/10 p-2.5 rounded-xl text-purple-600 dark:text-purple-400">
              <ShoppingCart size={20} />
            </div>
            <div>
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Ventas 90D</p>
              <p className="text-xl font-bold text-slate-900 dark:text-white">{formatEUR(totalVentas)}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl ${enRiesgo > 0 ? 'bg-red-100 dark:bg-red-500/10 text-red-600 dark:text-red-400' : 'bg-slate-100 dark:bg-slate-700 text-slate-500'}`}>
              <AlertTriangle size={20} />
            </div>
            <div>
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Cob. Prom.</p>
              <p className={`text-xl font-bold ${enRiesgo > 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-white'}`}>
                {avgCobertura.toFixed(0)} d
                {enRiesgo > 0 && <span className="text-xs ml-1">({enRiesgo} en riesgo)</span>}
              </p>
            </div>
          </div>
        </div>

        {/* Col 3: Gráfico Top Familias */}
        <div className="p-5 lg:w-2/5 flex flex-col">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Distribución por Familia (Inversión)</p>
          <div className="flex-1 min-h-[160px]">
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 16, left: -10, bottom: 0 }}>
                  <XAxis type="number" hide />
                  <YAxis
                    dataKey="name"
                    type="category"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#64748b', fontSize: 11 }}
                    width={90}
                  />
                  <Tooltip
                    cursor={{ fill: 'rgba(0,0,0,0.04)' }}
                    contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#fff', fontSize: 12 }}
                    formatter={(value: any) => [formatEUR(value as number), 'Valor']}
                  />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={14}>
                    {chartData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-sm text-slate-400">
                Sin datos para graficar
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
