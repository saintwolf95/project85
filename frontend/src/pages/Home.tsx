import { useEffect, useState, useMemo } from 'react';
import { getDashboardKpis, getInventoryAbc, getAiInsights } from '../services/api';
import type { DashboardKPIsResponse, ProductMetrics, AIInsight } from '../services/api';
import { AlertTriangle, TrendingUp, PackageX, Sparkles, Filter } from 'lucide-react';
import { DashboardMetrics } from '../components/DashboardMetrics';
import { DashboardCharts } from '../components/DashboardCharts';
import { GaugeChart } from '../components/GaugeChart';
import { ProductModal } from '../components/ProductModal';

export const Home = () => {
  const [loading, setLoading] = useState(true);
  const [kpiData, setKpiData] = useState<DashboardKPIsResponse | null>(null);
  const [inventory, setInventory] = useState<ProductMetrics[]>([]);
  const [insights, setInsights] = useState<AIInsight[]>([]);

  // Filters
  const [abcFilter, setAbcFilter] = useState('all');
  const [familyFilter, setFamilyFilter] = useState('all');

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState('');
  const [modalProducts, setModalProducts] = useState<ProductMetrics[]>([]);

  useEffect(() => {
    const fetchAll = async () => {
      try {
        setLoading(true);
        const [kpis, abc, aiData] = await Promise.all([
          getDashboardKpis(abcFilter, familyFilter),
          getInventoryAbc(1, 1000, undefined, abcFilter === 'all' ? undefined : abcFilter),
          getAiInsights(abcFilter, familyFilter)
        ]);
        
        // If familyFilter is active, we also need to manually filter the abc data by familia
        let filteredInv = abc.data;
        if (familyFilter !== 'all') {
            filteredInv = filteredInv.filter(item => item.familia === familyFilter);
        }

        setKpiData(kpis);
        setInventory(filteredInv);
        setInsights(aiData);
      } catch (err) {
        console.error("Error fetching dashboard data", err);
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, [abcFilter, familyFilter]);

  // Compute Metrics
  const metrics = useMemo(() => {
    if (!inventory.length) return { totalSkus: 0, totalUnidades: 0, promedioCosto: 0, familiaTop: '' };

    const totalSkus = inventory.length;
    const totalUnidades = inventory.reduce((sum, item) => sum + item.unidades, 0);
    const promedioCosto = inventory.reduce((sum, item) => sum + item.costo_unit, 0) / totalSkus;

    // Familia Top (Por Valor de Inventario)
    const famMap: Record<string, number> = {};
    inventory.forEach(item => {
      famMap[item.familia] = (famMap[item.familia] || 0) + item.valor_inv;
    });
    const familiaTop = Object.keys(famMap).sort((a, b) => famMap[b] - famMap[a])[0];

    return { totalSkus, totalUnidades, promedioCosto, familiaTop };
  }, [inventory]);

  // Compute Chart Data
  const chartData = useMemo(() => {
    // ABC Data
    const abcMap = { A: 0, B: 0, C: 0 };
    inventory.forEach(item => {
      if (item.abc_ventas === 'A') abcMap.A++;
      else if (item.abc_ventas === 'B') abcMap.B++;
      else abcMap.C++;
    });
    const abcData = [
      { name: 'A', value: abcMap.A },
      { name: 'B', value: abcMap.B },
      { name: 'C', value: abcMap.C }
    ];

    // Family Data (Sum of ValorInv)
    const famMap: Record<string, number> = {};
    inventory.forEach(item => {
      famMap[item.familia] = (famMap[item.familia] || 0) + item.valor_inv;
    });
    const familyData = Object.keys(famMap).map(key => ({
      name: key,
      value: famMap[key]
    })).sort((a, b) => b.value - a.value); // Sort desc

    return { abcData, familyData };
  }, [inventory]);

  // Handlers for Interactivity
  const handleAbcClick = (data: any) => {
    if (!data || !data.name) return;
    const selectedClass = data.name;
    const filtered = inventory.filter(item => item.abc_ventas === selectedClass);
    setModalTitle(`Productos Clase ${selectedClass}`);
    setModalProducts(filtered);
    setModalOpen(true);
  };

  const handleFamilyClick = (data: any) => {
    if (!data || !data.name) return;
    const selectedFamily = data.name;
    const filtered = inventory.filter(item => item.familia === selectedFamily);
    setModalTitle(`Familia: ${selectedFamily}`);
    setModalProducts(filtered);
    setModalOpen(true);
  };

  const getHealthScore = () => {
    if (!kpiData) return { score: 100, label: 'Calculando...', color: 'text-slate-400', reasons: [] };
    let score = 100;
    const reasons = [];
    if (kpiData.total_alertas_criticas > 0) {
        const pts = kpiData.total_alertas_criticas * 5;
        score -= pts;
        reasons.push(`-${pts} pts por ${kpiData.total_alertas_criticas} riesgos de rotura detectados.`);
    }
    if (kpiData.salud_stock_clase_a > 0) {
        const pts = kpiData.salud_stock_clase_a * 15;
        score -= pts;
        reasons.push(`-${pts} pts por ${kpiData.salud_stock_clase_a} productos Clase A críticos.`);
    }
    
    // Evaluate frozen capital in C class
    const frozenC = inventory.filter(i => i.matriz_abc?.includes('C') && i.unidades_venta_60d === 0);
    if (frozenC.length > 0) {
        const valFrozen = frozenC.reduce((acc, i) => acc + i.valor_inv, 0);
        if (valFrozen > 1000) {
            const pts = 10;
            score -= pts;
            reasons.push(`-${pts} pts por exceso de capital inmovilizado en Clase C.`);
        }
    }

    if (reasons.length === 0) reasons.push("+100 pts por inventario sano y optimizado.");

    score = Math.max(0, score);
    
    if (score === 100) return { score, label: 'ÓPTIMO', color: 'text-brand-cyan', reasons };
    if (score >= 70) return { score, label: 'REGULAR', color: 'text-amber-500', reasons };
    return { score, label: 'CRÍTICO', color: 'text-red-500', reasons };
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-blue dark:border-brand-cyan mb-4 shadow-none dark:shadow-[0_0_15px_var(--color-brand-cyan)]"></div>
        <p className="text-brand-blue dark:text-brand-cyan font-medium">Iniciando Dashboard Ejecutivo...</p>
      </div>
    );
  }

  const healthInfo = getHealthScore();

  const getInsightIcon = (icono: string, tipo: string) => {
    const color = tipo === 'warning' ? 'text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-500/10' : 
                  tipo === 'success' ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-500/10' : 
                  'text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-500/10';
    if (icono === 'alert') return <AlertTriangle className={`w-8 h-8 p-1.5 rounded-lg ${color}`} />;
    if (icono === 'trending-up') return <TrendingUp className={`w-8 h-8 p-1.5 rounded-lg ${color}`} />;
    return <PackageX className={`w-8 h-8 p-1.5 rounded-lg ${color}`} />;
  };

  return (
    <div className="animate-in fade-in duration-500 space-y-8 pb-10">
      
      {/* Header with Filters */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="title-corporate text-3xl mb-2">Dashboard Ejecutivo</h1>
          <p className="text-slate-600 dark:text-slate-400 text-lg">Resumen global e inteligencia de inventario interactiva.</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-sm">
            <Filter className="w-4 h-4 text-slate-500" />
            <select 
              className="bg-transparent text-sm font-medium text-slate-700 dark:text-slate-300 focus:outline-none"
              value={abcFilter}
              onChange={(e) => setAbcFilter(e.target.value)}
            >
              <option value="all">Todas las Clases ABC</option>
              <option value="A">Solo Clase A (AA, AB, AC)</option>
              <option value="B">Solo Clase B (BA, BB, BC)</option>
              <option value="C">Solo Clase C (CA, CB, CC)</option>
            </select>
          </div>
          <div className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-sm">
            <Filter className="w-4 h-4 text-slate-500" />
            <select 
              className="bg-transparent text-sm font-medium text-slate-700 dark:text-slate-300 focus:outline-none"
              value={familyFilter}
              onChange={(e) => setFamilyFilter(e.target.value)}
            >
              <option value="all">Todas las Categorías</option>
              <option value="Portátiles">Portátiles</option>
              <option value="Móviles">Móviles</option>
              <option value="Ordenadores">Ordenadores</option>
              <option value="Tarjetas Gráficas">Tarjetas Gráficas</option>
              <option value="Reproductores">Reproductores</option>
              <option value="Periféricos">Periféricos</option>
              <option value="Monitores">Monitores</option>
            </select>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        
        {/* Left Column (2/3 width) */}
        <div className="xl:col-span-2 space-y-8">
          {/* Main Status Widget with Gauge */}
          <div className="bg-white dark:bg-brand-surface border border-slate-200 dark:border-slate-800 rounded-xl p-8 shadow-sm flex flex-col md:flex-row gap-8 items-center">
            <div className="flex-1 w-full text-center md:text-left">
              <h3 className="title-corporate text-lg mb-4">Salud General</h3>
              <GaugeChart score={healthInfo.score} />
              <p className={`text-xl font-bold mt-2 ${healthInfo.color} uppercase tracking-wider text-center`}>{healthInfo.label}</p>
            </div>
            <div className="flex-1 w-full border-t md:border-t-0 md:border-l border-slate-200 dark:border-slate-800 pt-4 md:pt-0 md:pl-8">
              <h4 className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-3 uppercase tracking-wider">Justificación del Score</h4>
              <ul className="space-y-2">
                {healthInfo.reasons.map((reason, idx) => (
                  <li key={idx} className="text-sm text-slate-700 dark:text-slate-300 flex items-start gap-2">
                    <span className="mt-1 block w-1.5 h-1.5 rounded-full bg-brand-blue dark:bg-brand-cyan shrink-0"></span>
                    {reason}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Mini KPIs Grid */}
          <DashboardMetrics {...metrics} />

          {/* Interactive Charts */}
          <DashboardCharts 
            abcData={chartData.abcData} 
            familyData={chartData.familyData} 
            onAbcClick={handleAbcClick} 
            onFamilyClick={handleFamilyClick} 
          />
        </div>

        {/* Right Column - AI Insights Feed */}
        <div className="xl:col-span-1">
          <div className="bg-gradient-to-b from-brand-blue/5 to-transparent dark:from-brand-cyan/10 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-xl h-full">
            <div className="flex items-center gap-3 mb-6 border-b border-slate-200 dark:border-slate-800 pb-4">
              <div className="p-2 bg-brand-blue dark:bg-brand-cyan/20 rounded-lg shadow-sm">
                <Sparkles className="w-6 h-6 text-white dark:text-brand-cyan" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">AI Insights</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">Recomendaciones proactivas en vivo</p>
              </div>
            </div>

            <div className="space-y-4">
              {insights.map((insight, idx) => (
                <div key={idx} className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl p-5 hover:border-brand-blue/30 dark:hover:border-brand-cyan/30 transition-colors shadow-sm cursor-pointer group">
                  <div className="flex items-start gap-4">
                    {getInsightIcon(insight.icono, insight.tipo)}
                    <div>
                      <h4 className="text-sm font-bold text-slate-900 dark:text-slate-200 mb-1 group-hover:text-brand-blue dark:group-hover:text-brand-cyan transition-colors">{insight.titulo}</h4>
                      <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">{insight.sugerencia}</p>
                    </div>
                  </div>
                </div>
              ))}
              
              {insights.length === 0 && !loading && (
                <div className="text-center py-10 text-slate-500">
                  Todo luce perfecto. Sin alertas nuevas.
                </div>
              )}
            </div>
          </div>
        </div>

      </div>

      {/* Pop-up Modal (Glassmorphism) */}
      <ProductModal 
        isOpen={modalOpen} 
        onClose={() => setModalOpen(false)} 
        title={modalTitle} 
        products={modalProducts} 
      />

    </div>
  );
};
