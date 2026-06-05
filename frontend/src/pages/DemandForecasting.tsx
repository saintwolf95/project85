import { useEffect, useState, useMemo } from 'react';
import { getInventoryAbc } from '../services/api';
import type { ProductMetrics } from '../services/api';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';
import { Filter, Info, TrendingUp, DollarSign, Package } from 'lucide-react';
import { formatEUR } from '../utils/formatters';

export const DemandForecasting = () => {
  const [loading, setLoading] = useState(true);
  const [inventory, setInventory] = useState<ProductMetrics[]>([]);
  const [groupBy, setGroupBy] = useState<'PM' | 'Familia' | 'Codart'>('PM');

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        // Fetch a large subset of data to aggregate locally
        const abc = await getInventoryAbc(1, 1000);
        setInventory(abc.data);
      } catch (err) {
        console.error("Error fetching forecasting data", err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const aggregatedData = useMemo(() => {
    if (!inventory.length) return [];

    const map = new Map<string, {
      name: string;
      ads: number;
      revenuePerDay: number;
    }>();

    inventory.forEach(item => {
      let key = '';
      if (groupBy === 'PM') key = item.product_manager || 'Sin PM';
      else if (groupBy === 'Familia') key = item.familia || 'Sin Familia';
      else if (groupBy === 'Codart') key = item.cod_art;

      const existing = map.get(key) || { name: key, ads: 0, revenuePerDay: 0 };
      existing.ads += item.ads || 0;
      existing.revenuePerDay += (item.ads || 0) * (item.precio_unit || 0);
      map.set(key, existing);
    });

    const result = Array.from(map.values()).map(item => ({
      name: item.name,
      'Proyección 30 Días (Uds)': Math.round(item.ads * 30),
      'Proyección 60 Días (Uds)': Math.round(item.ads * 60),
      'Proyección 90 Días (Uds)': Math.round(item.ads * 90),
      'Ingreso 30 Días': item.revenuePerDay * 30,
      'Ingreso 60 Días': item.revenuePerDay * 60,
      'Ingreso 90 Días': item.revenuePerDay * 90,
      adsTotal: item.ads,
      revenueTotal: item.revenuePerDay
    })).sort((a, b) => b['Proyección 90 Días (Uds)'] - a['Proyección 90 Días (Uds)']);

    return result.slice(0, 20); // Limit to top 20 for charts
  }, [inventory, groupBy]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-blue dark:border-brand-cyan mb-4 shadow-none dark:shadow-[0_0_15px_var(--color-brand-cyan)]"></div>
        <p className="text-brand-blue dark:text-brand-cyan font-medium">Calculando Proyecciones...</p>
      </div>
    );
  }

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
                {entry.name.includes('Ingreso') ? formatEUR(entry.value) : entry.value.toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  const totalProjected90 = aggregatedData.reduce((acc, curr) => acc + curr['Proyección 90 Días (Uds)'], 0);
  const totalRevenue90 = aggregatedData.reduce((acc, curr) => acc + curr['Ingreso 90 Días'], 0);

  return (
    <div className="animate-in fade-in duration-500 space-y-8 pb-10">
      
      {/* Header and Controls */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="title-corporate text-3xl mb-2 flex items-center gap-3">
            <TrendingUp className="text-brand-cyan" />
            Panel Analítico de Predicción
          </h1>
          <p className="text-slate-600 dark:text-slate-400 text-lg">Proyecciones de demanda a 30, 60 y 90 días basadas en el rendimiento histórico reciente.</p>
        </div>
        
        <div className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-sm">
          <Filter className="w-4 h-4 text-slate-500" />
          <span className="text-sm text-slate-500 font-medium">Agrupar por:</span>
          <select 
            className="bg-transparent text-sm font-bold text-brand-blue dark:text-brand-cyan focus:outline-none cursor-pointer"
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value as any)}
          >
            <option value="PM">Product Manager (PM)</option>
            <option value="Familia">Familia / Categoría</option>
            <option value="Codart">Código de Artículo (Codart)</option>
          </select>
        </div>
      </div>

      {/* Methodology Info Card */}
      <div className="bg-gradient-to-br from-brand-blue/5 to-brand-cyan/10 border border-brand-cyan/20 rounded-xl p-5 shadow-sm flex gap-4 items-start">
        <Info className="text-brand-cyan shrink-0 mt-0.5" />
        <div>
          <h3 className="font-bold text-slate-900 dark:text-white text-sm mb-1">¿Cómo se calculan estas proyecciones?</h3>
          <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
            Las proyecciones se basan en el <strong>Promedio Diario de Ventas (ADS - Average Daily Sales)</strong>. 
            El algoritmo analiza la velocidad histórica de los últimos 60-90 días para determinar cuántas unidades se consumen al día.
            <br/><br/>
            Fórmula utilizada: <code className="bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-brand-blue dark:text-brand-cyan font-mono text-xs">Proyección (X días) = ADS × X</code>
          </p>
        </div>
      </div>

      {/* Summary Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 flex items-center gap-4">
          <div className="p-3 bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 rounded-lg">
            <Package size={24} />
          </div>
          <div>
            <p className="text-sm text-slate-500 dark:text-slate-400 font-medium mb-1">Proyección Total (Unidades - 90 Días)</p>
            <p className="text-2xl font-bold text-slate-900 dark:text-white">{totalProjected90.toLocaleString()}</p>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 flex items-center gap-4">
          <div className="p-3 bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded-lg">
            <DollarSign size={24} />
          </div>
          <div>
            <p className="text-sm text-slate-500 dark:text-slate-400 font-medium mb-1">Ingreso Proyectado (90 Días)</p>
            <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{formatEUR(totalRevenue90)}</p>
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Unidades Proyectadas Chart */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm">
          <h3 className="font-bold text-slate-900 dark:text-white mb-6">Proyección de Unidades por {groupBy}</h3>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={aggregatedData} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} opacity={0.3} />
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} tickMargin={10} />
                <YAxis stroke="#94a3b8" fontSize={12} tickFormatter={(val) => `${val}`} />
                <Tooltip content={<CustomTooltip />} />
                <Legend verticalAlign="top" height={36} iconType="circle" />
                <Bar dataKey="Proyección 30 Días (Uds)" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Proyección 60 Días (Uds)" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Proyección 90 Días (Uds)" fill="#06b6d4" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Ingresos Proyectados Chart */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm">
          <h3 className="font-bold text-slate-900 dark:text-white mb-6">Ingresos Estimados por {groupBy}</h3>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={aggregatedData} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} opacity={0.3} />
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} tickMargin={10} />
                <YAxis stroke="#94a3b8" fontSize={12} tickFormatter={(val) => `${(val / 1000).toFixed(0)}k`} />
                <Tooltip content={<CustomTooltip />} />
                <Legend verticalAlign="top" height={36} iconType="circle" />
                <Bar dataKey="Ingreso 30 Días" fill="#10b981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Ingreso 60 Días" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Ingreso 90 Días" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>

      {/* Data Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
          <h3 className="font-bold text-slate-900 dark:text-white">Detalle de Proyecciones ({groupBy})</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
              <tr>
                <th className="px-6 py-3 font-medium">{groupBy}</th>
                <th className="px-6 py-3 font-medium text-right">Velocidad (ADS)</th>
                <th className="px-6 py-3 font-medium text-right">Proyección 30d</th>
                <th className="px-6 py-3 font-medium text-right">Proyección 60d</th>
                <th className="px-6 py-3 font-medium text-right">Proyección 90d</th>
                <th className="px-6 py-3 font-medium text-right">Ingreso Est. 90d</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {aggregatedData.map((row, idx) => (
                <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <td className="px-6 py-4 font-medium text-slate-900 dark:text-white">{row.name}</td>
                  <td className="px-6 py-4 text-right text-slate-600 dark:text-slate-400 font-mono">{row.adsTotal.toFixed(2)} ud/día</td>
                  <td className="px-6 py-4 text-right text-brand-blue dark:text-brand-cyan font-medium">{row['Proyección 30 Días (Uds)'].toLocaleString()}</td>
                  <td className="px-6 py-4 text-right text-purple-600 dark:text-purple-400 font-medium">{row['Proyección 60 Días (Uds)'].toLocaleString()}</td>
                  <td className="px-6 py-4 text-right text-emerald-600 dark:text-emerald-400 font-medium">{row['Proyección 90 Días (Uds)'].toLocaleString()}</td>
                  <td className="px-6 py-4 text-right font-bold text-emerald-700 dark:text-emerald-500">{formatEUR(row['Ingreso 90 Días'])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
};
