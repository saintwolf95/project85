import { useEffect, useState, useMemo } from 'react';
import { getInventoryAbc, getDashboardKpis } from '../services/api';
import type { ProductMetrics, DashboardKPIsResponse } from '../services/api';
import { KpiCards } from '../components/KpiCards';
import { Matrix3x3 } from '../components/Matrix3x3';
import { InventoryTable } from '../components/InventoryTable';
import { ChevronLeft, ChevronRight, Search, Filter, AlertTriangle, Download, ArrowRight } from 'lucide-react';
import { MatrixDetail } from '../components/MatrixDetail';
import { MatrixDetailDashboard } from '../components/MatrixDetailDashboard';
import * as XLSX from 'xlsx';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell } from 'recharts';
import { ProductModal } from '../components/ProductModal';

export const Intelligence = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Data
  const [inventoryData, setInventoryData] = useState<ProductMetrics[]>([]);
  const [filteredData, setFilteredData] = useState<ProductMetrics[]>([]);
  const [kpiData, setKpiData] = useState<DashboardKPIsResponse | null>(null);
  
  // KPI Modal State
  const [kpiModalOpen, setKpiModalOpen] = useState(false);
  const [kpiModalType, setKpiModalType] = useState<'criticas' | 'claseA' | null>(null);

  // Tabs
  const [activeTab, setActiveTab] = useState<'general' | 'catalog' | 'risks'>('general');
  
  // Matrix State
  const [activeCell, setActiveCell] = useState<string>('');
  const [cellProducts, setCellProducts] = useState<ProductMetrics[]>([]);
  
  // Risks State
  const [riskFamilyFilter, setRiskFamilyFilter] = useState<string>('all');

  // Pagination & Filters
  const [currentPage, setCurrentPage] = useState(1);
  const limit = 50;
  const totalRecords = filteredData.length;
  const totalPages = Math.max(1, Math.ceil(totalRecords / limit));
  
  // Data slicing for current page
  const paginatedData = useMemo(() => {
    const startIdx = (currentPage - 1) * limit;
    return filteredData.slice(startIdx, startIdx + limit);
  }, [filteredData, currentPage, limit]);

  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [claseAbc, setClaseAbc] = useState<string>('');
  const [selectedPM, setSelectedPM] = useState<string>('');
  const [selectedSection, setSelectedSection] = useState<string>('');
  const [selectedRisk, setSelectedRisk] = useState<string>('');

  // Debounce logic
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setCurrentPage(1); // Reset page on search
    }, 300);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  // Apply filters locally whenever search, abc class, or risks change
  useEffect(() => {
    let result = inventoryData;

    if (debouncedSearch) {
      const s = debouncedSearch.toLowerCase();
      result = result.filter(p => 
        p.nombre_art.toLowerCase().includes(s) || 
        p.cod_art.toLowerCase().includes(s) || 
        p.familia.toLowerCase().includes(s)
      );
    }

    if (claseAbc) {
      result = result.filter(item => item.abc_ventas === claseAbc);
    }

    if (selectedPM) {
      result = result.filter(item => item.product_manager === selectedPM);
    }

    if (selectedSection) {
      result = result.filter(item => item.seccion === selectedSection);
    }

    if (activeTab === 'risks') {
      result = result.filter(p => p.riesgos_categorizados?.includes('Riesgo Rotura'));
    }

    if (selectedRisk) {
      if (selectedRisk === 'Sano') {
        result = result.filter(item => !item.riesgos_categorizados || item.riesgos_categorizados.length === 0);
      } else {
        result = result.filter(item => item.riesgos_categorizados?.includes(selectedRisk));
      }
    }

    setFilteredData(result);
  }, [inventoryData, debouncedSearch, claseAbc, selectedPM, selectedSection, selectedRisk, activeTab]);

  const fetchKpis = async () => {
    try {
      const kpisRes = await getDashboardKpis();
      setKpiData(kpisRes);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    const fetchInventory = async () => {
      try {
        setLoading(true);
        // Fetch all data for client-side interactions
        const res = await getInventoryAbc(1, 10000, '', '', undefined);
        setInventoryData(res.data);
        setError(null);
      } catch (err) {
        console.error("Error fetching data:", err);
        setError("Error al cargar los datos de Inteligencia.");
      } finally {
        setLoading(false);
      }
    };

    fetchInventory();
  }, []);

  const handleCellClick = (cell: string) => {
    setActiveCell(cell);
    setCellProducts(inventoryData.filter(p => p.matriz_abc === cell));
  };

  const exportCatalogToExcel = () => {
    const ws = XLSX.utils.json_to_sheet(inventoryData.map(p => ({
      'CodArt': p.cod_art,
      'Nombre': p.nombre_art,
      'Familia': p.familia,
      'Marca': p.marca,
      'Precio Unitario': p.precio_unit,
      'Unidades': p.unidades,
      'Valor Inventario': p.valor_inv,
      'Ventas 60D': p.ventas_60d,
      'Clase ABC': p.matriz_abc,
      'Riesgos': p.riesgos_categorizados?.join(', ') || 'Sano'
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Catalogo");
    XLSX.writeFile(wb, `Catalogo_Inventario.xlsx`);
  };

  useEffect(() => {
    fetchKpis();
  }, []);

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-500 gap-4">
      {/* Header */}
      <div className="flex justify-between items-center shrink-0">
        <div>
          <h1 className="title-corporate text-3xl mb-1">Inteligencia ABC</h1>
          <p className="text-slate-500 dark:text-slate-400">Análisis predictivo de inventario.</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 p-1 bg-slate-100 dark:bg-slate-900/50 rounded-xl w-fit border border-slate-200 dark:border-slate-800 shrink-0">
        <button
          onClick={() => { setActiveTab('general'); setCurrentPage(1); }}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'general' ? 'bg-brand-blue text-white shadow-md' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}
        >
          Vista General
        </button>
        <button
          onClick={() => { setActiveTab('catalog'); setCurrentPage(1); }}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'catalog' ? 'bg-brand-blue text-white shadow-md' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}
        >
          Catálogo Interactivo
        </button>
        <button
          onClick={() => { setActiveTab('risks'); setCurrentPage(1); }}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'risks' ? 'bg-red-500 text-white shadow-md' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}
        >
          Alertas de Riesgo
        </button>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500 text-red-500 px-6 py-4 rounded-lg shrink-0">
          <p className="font-medium">{error}</p>
        </div>
      )}

      {/* TAB 1: General */}
      {activeTab === 'general' && (
        <div className="flex flex-col gap-3 flex-1 min-h-0 animate-in fade-in">
          {/* KPI Cards — compactas arriba */}
          <div className="shrink-0">
            <KpiCards 
              kpis={kpiData} 
              onCardClick={(type) => {
                setKpiModalType(type);
                setKpiModalOpen(true);
              }}
            />
          </div>

          {/* Grid 2 columnas: Izq (Matriz + Mini Dashboard) / Der (Tabla cuadrante) */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 flex-1 min-h-0">
            
            {/* Columna izquierda — scroll interno para matriz + mini dashboard */}
            <div className="flex flex-col gap-3 min-h-0 overflow-y-auto custom-scrollbar pb-1">
              <div className="shrink-0">
                <Matrix3x3 data={inventoryData} onCellClick={handleCellClick} activeCell={activeCell} />
              </div>

              {activeCell && (
                <div className="shrink-0">
                  <MatrixDetailDashboard
                    activeCell={activeCell}
                    data={cellProducts}
                    onClear={() => handleCellClick('')}
                  />
                </div>
              )}
            </div>

            {/* Columna derecha — tabla de productos del cuadrante */}
            <div className="min-h-0">
              <MatrixDetail cellId={activeCell} products={cellProducts} />
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Catálogo Interactivo — tabla ocupa todo el espacio restante */}
      {activeTab === 'catalog' && (
        <div className="flex flex-col flex-1 min-h-0 gap-4 animate-in fade-in">
          {/* Barra de filtros */}
          <div className="flex flex-col md:flex-row gap-4 justify-between items-center bg-slate-100 dark:bg-slate-900/50 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shrink-0">
            <div className="flex gap-4 w-full md:w-auto">
              <div className="relative w-full md:w-96">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="h-5 w-5 text-slate-400 dark:text-slate-500" />
                </div>
                <input
                  type="text"
                  placeholder="Buscar por Nombre, SKU..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white focus:ring-1 focus:ring-brand-blue dark:focus:ring-brand-cyan focus:border-brand-blue dark:focus:border-brand-cyan outline-none"
                />
              </div>
              <div className="relative w-full md:w-48">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Filter className="h-4 w-4 text-slate-500" />
                </div>
                <select
                  value={claseAbc}
                  onChange={(e) => { setClaseAbc(e.target.value); setCurrentPage(1); }}
                  className="w-full pl-9 pr-4 py-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white appearance-none focus:ring-1 focus:ring-brand-blue dark:focus:ring-brand-cyan outline-none"
                >
                  <option value="">Todas las clases</option>
                  <option value="A">Clase A (Alta)</option>
                  <option value="B">Clase B (Media)</option>
                  <option value="C">Clase C (Baja)</option>
                </select>
              </div>
              <div className="relative w-full md:w-48">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Filter className="h-4 w-4 text-slate-500" />
                </div>
                <select
                  value={selectedPM}
                  onChange={(e) => { setSelectedPM(e.target.value); setCurrentPage(1); }}
                  className="w-full pl-9 pr-4 py-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white appearance-none focus:ring-1 focus:ring-brand-blue dark:focus:ring-brand-cyan outline-none"
                >
                  <option value="">Todos los PMs</option>
                  <option value="JAC">JAC</option>
                  <option value="AMI">AMI</option>
                  <option value="LKT">LKT</option>
                  <option value="UCR">UCR</option>
                  <option value="TDS">TDS</option>
                </select>
              </div>
              <div className="relative w-full md:w-48">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Filter className="h-4 w-4 text-slate-500" />
                </div>
                <select
                  value={selectedSection}
                  onChange={(e) => { setSelectedSection(e.target.value); setCurrentPage(1); }}
                  className="w-full pl-9 pr-4 py-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white appearance-none focus:ring-1 focus:ring-brand-blue dark:focus:ring-brand-cyan outline-none"
                >
                  <option value="">Todas las Secciones</option>
                  <option value="Informática">Informática</option>
                  <option value="Telefonía">Telefonía</option>
                  <option value="Componentes">Componentes</option>
                  <option value="Audio">Audio</option>
                  <option value="Accesorios">Accesorios</option>
                  <option value="General">General</option>
                </select>
              </div>
              <div className="relative w-full md:w-48">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Filter className="h-4 w-4 text-slate-500" />
                </div>
                <select
                  value={selectedRisk}
                  onChange={(e) => { setSelectedRisk(e.target.value); setCurrentPage(1); }}
                  className="w-full pl-9 pr-4 py-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white appearance-none focus:ring-1 focus:ring-brand-blue dark:focus:ring-brand-cyan outline-none"
                >
                  <option value="">Todos los Riesgos</option>
                  <option value="Sano">Sano</option>
                  <option value="Riesgo Rotura">Riesgo Rotura</option>
                  <option value="Riesgo Financiero">Riesgo Financiero</option>
                  <option value="Riesgo Comercial">Riesgo Comercial</option>
                </select>
              </div>
            </div>
            <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-end">
              <span className="text-sm font-medium text-slate-600 dark:text-slate-400">Total Artículos: {totalRecords}</span>
              <button
                onClick={exportCatalogToExcel}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30 rounded-lg text-sm font-medium hover:bg-emerald-200 dark:hover:bg-emerald-500/30 transition-colors"
              >
                <Download size={16} />
                Exportar Excel
              </button>
            </div>
          </div>

          {/* Tabla — flex-1 para que ocupe el espacio restante */}
          <div className="flex-1 min-h-0 bg-white dark:bg-brand-surface rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col shadow-sm">
            {loading ? (
              <div className="flex justify-center items-center flex-1">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-blue dark:border-brand-cyan"></div>
              </div>
            ) : (
              <div className="flex-1 min-h-0 overflow-auto">
                <InventoryTable data={paginatedData} />
              </div>
            )}
            {/* Paginación fija abajo */}
            <div className="shrink-0 flex items-center justify-between p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 rounded-b-xl">
              <div className="text-slate-500 dark:text-slate-400 text-sm">
                Página <span className="font-medium text-slate-900 dark:text-white">{currentPage}</span> de <span className="font-medium text-slate-900 dark:text-white">{totalPages}</span> ({totalRecords} registros)
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1 || loading}
                  className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-brand-blue dark:hover:text-brand-cyan disabled:opacity-50 transition-colors"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage >= totalPages || loading}
                  className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-brand-blue dark:hover:text-brand-cyan disabled:opacity-50 transition-colors"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: Risks */}
      {activeTab === 'risks' && (
        <div className="space-y-6 animate-in fade-in">
          {loading ? (
            <div className="flex justify-center items-center h-64">
               <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-500"></div>
            </div>
          ) : inventoryData.length === 0 ? (
            <div className="bg-green-500/10 border border-green-500/30 text-green-400 p-8 rounded-xl text-center">
              <p className="text-lg font-medium">¡Todo en orden! No hay productos en riesgo de ruptura de stock.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
              
              {/* Triage Center Chart */}
              <div className="xl:col-span-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm flex flex-col">
                <h3 className="title-corporate text-lg mb-1">Triaje por Categoría</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">Volumen de artículos en riesgo inminente.</p>
                <div className="flex-1 min-h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={Object.values(inventoryData.reduce((acc: any, curr) => {
                        acc[curr.familia] = acc[curr.familia] || { name: curr.familia, value: 0 };
                        acc[curr.familia].value += 1;
                        return acc;
                      }, {})).sort((a: any, b: any) => b.value - a.value)}
                      layout="vertical"
                      margin={{ top: 0, right: 30, left: 20, bottom: 0 }}
                    >
                      <XAxis type="number" hide />
                      <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} width={100} tick={{ fill: '#64748b', fontSize: 12 }} />
                      <Tooltip cursor={{ fill: 'rgba(239, 68, 68, 0.05)' }} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                      <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                        {Object.values(inventoryData.reduce((acc: any, curr) => {
                          acc[curr.familia] = acc[curr.familia] || { name: curr.familia, value: 0 };
                          acc[curr.familia].value += 1;
                          return acc;
                        }, {})).map((entry: any, index) => (
                          <Cell 
                            key={`cell-${index}`} 
                            fill={riskFamilyFilter === entry.name || riskFamilyFilter === 'all' ? '#ef4444' : '#fca5a5'} 
                            className="cursor-pointer transition-colors"
                            onClick={() => setRiskFamilyFilter(riskFamilyFilter === entry.name ? 'all' : entry.name)}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                {riskFamilyFilter !== 'all' && (
                  <button onClick={() => setRiskFamilyFilter('all')} className="mt-4 text-xs text-brand-blue dark:text-brand-cyan hover:underline self-end">
                    Limpiar filtro
                  </button>
                )}
              </div>

              {/* Risks Grid */}
              <div className="xl:col-span-2">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {paginatedData
                    .filter(item => riskFamilyFilter === 'all' || item.familia === riskFamilyFilter)
                    .map((item) => (
                    <div key={item.cod_art} className="bg-white dark:bg-slate-900 border border-red-200 dark:border-red-500/30 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow group flex flex-col justify-between">
                      <div>
                        <div className="flex justify-between items-start mb-3">
                          <div className="flex items-center gap-2">
                            <div className="bg-red-500/10 p-1.5 rounded-md">
                              <AlertTriangle className="w-5 h-5 text-red-500" />
                            </div>
                            <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded text-xs font-mono">
                              {item.cod_art}
                            </span>
                          </div>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${item.abc_ventas === 'A' ? 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400 border border-red-200 dark:border-red-500/30' : 'bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-400 border border-orange-200 dark:border-orange-500/30'}`}>
                            Prioridad {item.abc_ventas === 'A' ? 'Alta' : item.abc_ventas === 'B' ? 'Media' : 'Baja'}
                          </span>
                        </div>
                        <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1 line-clamp-1">{item.nombre_art}</h3>
                        <p className="text-slate-500 dark:text-slate-400 text-xs mb-4">{item.marca} • {item.familia}</p>
                        
                        <div className="flex items-center justify-between mb-4 bg-slate-50 dark:bg-slate-950/50 p-3 rounded-lg border border-slate-100 dark:border-slate-800">
                          <div>
                            <div className="text-[10px] text-slate-500 uppercase font-medium">Stock</div>
                            <div className="text-lg font-bold text-red-600 dark:text-red-400">{item.unidades} u.</div>
                          </div>
                          <ArrowRight className="w-4 h-4 text-slate-300 dark:text-slate-600" />
                          <div className="text-right">
                            <div className="text-[10px] text-slate-500 uppercase font-medium">Cobertura</div>
                            <div className="text-lg font-bold text-slate-900 dark:text-white">{item.dias_cobertura.toFixed(1)} d.</div>
                          </div>
                        </div>
                      </div>
                      
                      <button className="w-full bg-red-50 dark:bg-red-500/10 hover:bg-red-500 text-red-600 hover:text-white dark:text-red-400 dark:hover:text-white border border-red-200 dark:border-red-500/20 font-medium py-2 rounded-lg transition-colors text-sm flex items-center justify-center gap-2">
                        Gestionar Reabastecimiento
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
          
          {/* Paginación Risks */}
          {totalRecords > 0 && (
            <div className="flex justify-center gap-2 mt-6">
              <button 
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1 || loading}
                className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 disabled:opacity-50 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors shadow-sm"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button 
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages || loading}
                className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 disabled:opacity-50 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors shadow-sm"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* KPI Modal */}
      {kpiModalOpen && kpiModalType && (
        <ProductModal 
          isOpen={kpiModalOpen}
          onClose={() => setKpiModalOpen(false)}
          title={kpiModalType === 'criticas' ? 'Alertas Críticas' : 'Alertas Clase A'}
          description={kpiModalType === 'criticas' 
            ? 'Estos productos están marcados con "Riesgo Rotura" o "Alerta Rotura". Tienen riesgo de quedarse sin stock antes del próximo reabastecimiento.' 
            : 'Productos catalogados como "Clase A" (alto volumen de ventas) que actualmente presentan un riesgo de rotura.'}
          products={inventoryData.filter(p => {
            const hasRotura = p.riesgos_categorizados?.includes('Riesgo Rotura') || p.riesgos_categorizados?.includes('Alerta Rotura');
            if (kpiModalType === 'criticas') return hasRotura;
            return hasRotura && p.abc_ventas === 'A';
          })}
        />
      )}
    </div>
  );
};
