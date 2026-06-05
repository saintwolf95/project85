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
    case 'AA': return {
      title: 'Productos Estrella ⭐',
      desc: 'Alta rotación de ventas y alta inversión en inventario. Estos artículos son el motor de tu negocio. Nunca deben faltar en stock.',
      color: 'emerald',
      textColor: 'text-emerald-600 dark:text-emerald-400',
      bg: 'bg-emerald-50 dark:bg-emerald-900/20',
      borderColor: 'border-emerald-200 dark:border-emerald-800',
      icon: <TrendingUp className="w-5 h-5" />,
      actions: ['✅ Mantener stock de seguridad elevado', '✅ Negociar volumen con proveedores', '✅ Monitorear semanalmente'],
      kpiLabel: 'ventas60'
    };
    case 'AB': return {
      title: 'Alta Venta, Inversión Media',
      desc: 'Productos con muy buena demanda pero con nivel de inversión moderado. Tienen potencial para convertirse en Clase A completa.',
      color: 'blue',
      textColor: 'text-brand-blue dark:text-brand-cyan',
      bg: 'bg-blue-50 dark:bg-blue-900/20',
      borderColor: 'border-blue-200 dark:border-blue-800',
      icon: <TrendingUp className="w-5 h-5" />,
      actions: ['📈 Incrementar compras para aprovechar la demanda', '📊 Revisar si el stock sube de categoría'],
      kpiLabel: 'ventas60'
    };
    case 'AC': return {
      title: '🚨 Riesgo de Rotura Inminente',
      desc: 'Artículos con ventas muy altas pero inventario mínimo. Alta probabilidad de quedarse sin stock. Actuar con urgencia.',
      color: 'red',
      textColor: 'text-red-600 dark:text-red-400',
      bg: 'bg-red-50 dark:bg-red-900/20',
      borderColor: 'border-red-200 dark:border-red-800',
      icon: <AlertTriangle className="w-5 h-5" />,
      actions: ['🔴 Emitir Orden de Compra URGENTE', '🔴 Verificar stock físico inmediatamente', '🔴 Activar plan B con proveedores alternativos'],
      kpiLabel: 'rotura'
    };
    case 'BA': return {
      title: 'Inversión Alta, Ventas Medias',
      desc: 'Alto capital inmovilizado con demanda media. Evaluar si el stock está sobredimensionado respecto a la rotación real.',
      color: 'amber',
      textColor: 'text-amber-600 dark:text-amber-500',
      bg: 'bg-amber-50 dark:bg-amber-900/20',
      borderColor: 'border-amber-200 dark:border-amber-800',
      icon: <TrendingDown className="w-5 h-5" />,
      actions: ['⚠️ Reducir próximas órdenes de compra', '⚠️ Analizar si hay estacionalidad', '⚠️ Considerar promociones puntuales'],
      kpiLabel: 'valor'
    };
    case 'BB': return {
      title: 'Productos Equilibrados',
      desc: 'Venta e inversión medias. Son el grueso del catálogo. Mantener una política de stock estándar y reabastecimiento regular.',
      color: 'blue',
      textColor: 'text-brand-blue dark:text-brand-cyan',
      bg: 'bg-slate-50 dark:bg-slate-800/50',
      borderColor: 'border-slate-200 dark:border-slate-700',
      icon: <ShoppingCart className="w-5 h-5" />,
      actions: ['✅ Mantener ciclos de reposición estándar', '📊 Revisar trimestralmente su evolución'],
      kpiLabel: 'valor'
    };
    case 'BC': return {
      title: 'Venta Media, Stock Bajo',
      desc: 'Artículos con demanda media pero muy poco stock. Pueden entrar en rotura si la demanda sube levemente.',
      color: 'orange',
      textColor: 'text-orange-600 dark:text-orange-400',
      bg: 'bg-orange-50 dark:bg-orange-900/20',
      borderColor: 'border-orange-200 dark:border-orange-800',
      icon: <AlertTriangle className="w-5 h-5" />,
      actions: ['⚠️ Revisar punto de reorden', '📦 Aumentar frecuencia de pedidos'],
      kpiLabel: 'rotura'
    };
    case 'CA': return {
      title: '💰 Capital Inmovilizado',
      desc: 'Artículos con muy poca o nula rotación pero con alta inversión en stock. Riesgo de obsolescencia y pérdida financiera.',
      color: 'amber',
      textColor: 'text-amber-600 dark:text-amber-500',
      bg: 'bg-amber-50 dark:bg-amber-900/20',
      borderColor: 'border-amber-200 dark:border-amber-800',
      icon: <TrendingDown className="w-5 h-5" />,
      actions: ['🔶 Lanzar promociones o descuentos', '🔶 Proponer a comercial para bundle', '🔶 Evaluar devolución al proveedor', '🔶 Marcar para liquidación si >180 días'],
      kpiLabel: 'valor'
    };
    case 'CB': return {
      title: 'Stock Alto, Ventas Bajas',
      desc: 'Inventario medio-alto con poca demanda. Vigilar la cobertura; si supera los 90 días puede convertirse en problema financiero.',
      color: 'slate',
      textColor: 'text-slate-600 dark:text-slate-400',
      bg: 'bg-slate-50 dark:bg-slate-800/50',
      borderColor: 'border-slate-200 dark:border-slate-700',
      icon: <TrendingDown className="w-5 h-5" />,
      actions: ['📉 Reducir siguiente orden de compra', '📊 Monitorizar evolución mensual'],
      kpiLabel: 'valor'
    };
    case 'CC': return {
      title: 'Baja Prioridad',
      desc: 'Poca venta y poca inversión. No generan riesgo pero tampoco valor. Simplificar el catálogo eliminando o comprando sólo bajo pedido.',
      color: 'slate',
      textColor: 'text-slate-500',
      bg: 'bg-slate-50 dark:bg-slate-800',
      borderColor: 'border-slate-200 dark:border-slate-700',
      icon: <Package className="w-5 h-5" />,
      actions: ['⬇️ Comprar únicamente bajo pedido', '🗑️ Considerar discontinuar referencias', '✂️ Simplificar catálogo'],
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
  const totalVentas = useMemo(() => data.reduce((sum, p) => sum + p.ventas_60d, 0), [data]);
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
              <p className="text-xl font-bold text-slate-900 dark:text-white">{data.length}</p>
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
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Ventas 60D</p>
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
