import { useEffect, useState, useMemo } from 'react';
import { getInventoryAbc, getDashboardKpis } from '../services/api';
import type { ProductMetrics, DashboardKPIsResponse } from '../services/api';
import { KpiCards } from '../components/KpiCards';
import { Matrix3x3 } from '../components/Matrix3x3';
import { MatrixBarChart } from '../components/MatrixBarChart';
import { InventoryTable } from '../components/InventoryTable';
import { ChevronLeft, ChevronRight, Search, Filter, AlertTriangle, Download, ArrowRight } from 'lucide-react';
import { MatrixDetail } from '../components/MatrixDetail';
import { MatrixDetailDashboard } from '../components/MatrixDetailDashboard';
import * as XLSX from 'xlsx';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell } from 'recharts';
import { ProductModal } from '../components/ProductModal';

const EXPORT_COLUMNS: ReadonlyArray<{ id: keyof ProductMetrics; label: string }> = [
  { id: 'cod_art', label: 'CodArt' },
  { id: 'nombre_art', label: 'Nombre' },
  { id: 'familia', label: 'Familia' },
  { id: 'seccion', label: 'Sección' },
  { id: 'marca', label: 'Marca' },
  { id: 'product_manager', label: 'Product Manager' },
  { id: 'precio_unit', label: 'Precio Unitario' },
  { id: 'unidades', label: 'Unidades' },
  { id: 'valor_inv', label: 'Valor Inventario' },
  { id: 'ventas_90d', label: 'Ventas 90D' },
  { id: 'unidades_venta_90d', label: 'Unid. Venta 90D' },
  { id: 'ads', label: 'ADS' },
  { id: 'dias_cobertura', label: 'Días Cobertura' },
  { id: 'abc', label: 'Clase ABC' },
  { id: 'xyz', label: 'Clase XYZ' },
  { id: 'cv', label: 'CV' },
  { id: 'matriz_abc', label: 'Matriz ABCXYZ' },
  { id: 'riesgos_categorizados', label: 'Riesgos' }
];

export const Intelligence = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Data
  const [inventoryData, setInventoryData] = useState<ProductMetrics[]>([]);
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

  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [claseAbc, setClaseAbc] = useState<string>('');
  const [selectedPM, setSelectedPM] = useState<string>('');
  const [selectedSection, setSelectedSection] = useState<string>('');
  const [selectedRisk, setSelectedRisk] = useState<string>('');
  
  const [minDays, setMinDays] = useState<number | ''>('');
  const [maxDays, setMaxDays] = useState<number | ''>('');

  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [selectedColumns, setSelectedColumns] = useState<string[]>(EXPORT_COLUMNS.map(c => c.id));

  // Debounce logic
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setCurrentPage(1); // Reset page on search
    }, 300);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  // Apply filters locally without creating a second, synchronized copy of the inventory.
  const filteredData = useMemo(() => {
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
      result = result.filter(item => item.abc === claseAbc);
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

    if (minDays !== '') {
      result = result.filter(item => item.dias_cobertura >= Number(minDays));
    }
    if (maxDays !== '') {
      result = result.filter(item => item.dias_cobertura <= Number(maxDays));
    }

    return result;
  }, [inventoryData, debouncedSearch, claseAbc, selectedPM, selectedSection, selectedRisk, activeTab, minDays, maxDays]);

  const totalRecords = filteredData.length;
  const totalPages = Math.max(1, Math.ceil(totalRecords / limit));

  const paginatedData = useMemo(() => {
    const startIdx = (currentPage - 1) * limit;
    return filteredData.slice(startIdx, startIdx + limit);
  }, [filteredData, currentPage]);

  const riskFamilyData = useMemo(() => {
    const counts = inventoryData.reduce<Record<string, { name: string; value: number }>>((acc, product) => {
      const family = product.familia || 'Sin familia';
      const entry = acc[family] ?? { name: family, value: 0 };
      acc[family] = { ...entry, value: entry.value + 1 };
      return acc;
    }, {});
    return Object.values(counts).sort((a, b) => b.value - a.value);
  }, [inventoryData]);

  useEffect(() => {
    const fetchInventory = async () => {
      try {
        setLoading(true);
        // Fetch all data for client-side interactions
        const res = await getInventoryAbc(1, 20000, '', '', undefined);
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

  const toggleColumn = (colId: string) => {
    setSelectedColumns(prev => 
      prev.includes(colId) ? prev.filter(c => c !== colId) : [...prev, colId]
    );
  };

  const executeExport = () => {
    const dataToExport = inventoryData.map(p => {
      const row: Record<string, string | number | boolean> = {};
      EXPORT_COLUMNS.forEach(col => {
        if (selectedColumns.includes(col.id)) {
          if (col.id === 'riesgos_categorizados') {
            row[col.label] = p.riesgos_categorizados?.join(', ') || 'Sano';
          } else if (col.id === 'dias_cobertura') {
            row[col.label] = Math.round(p.dias_cobertura);
          } else {
            const value = p[col.id];
            row[col.label] = Array.isArray(value) ? value.join(', ') : (value ?? '');
          }
        }
      });
      return row;
    });

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Catalogo");
    XLSX.writeFile(wb, `Catalogo_Inventario.xlsx`);
    setExportModalOpen(false);
  };

  useEffect(() => {
    getDashboardKpis().then(setKpiData).catch(console.error);
  }, []);

  return (
    <div className="intelligence-apple mx-auto flex h-full w-full max-w-[1560px] flex-col gap-5 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-center justify-between rounded-[24px] border border-black/[0.08] bg-white px-6 py-6 shadow-[0_1px_2px_rgba(0,0,0,0.03),0_12px_32px_rgba(0,0,0,0.04)] dark:border-slate-800 dark:bg-slate-900">
        <div>
          <p className="mb-2 text-[12px] font-medium tracking-[0.08em] text-[#86868b] uppercase">Inventario y cobertura</p>
          <h1 className="title-corporate text-[32px] font-semibold tracking-[-0.035em] text-[#1d1d1f] dark:text-white">Inteligencia ABCXYZ</h1>
          <p className="mt-1 text-[15px] text-[#6e6e73] dark:text-slate-400">Prioriza el inventario según su impacto comercial y su estabilidad.</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex w-full gap-1 overflow-x-auto rounded-[12px] border border-black/[0.06] bg-[#f5f5f7] p-1 md:w-fit dark:border-slate-800 dark:bg-slate-900/50 shrink-0 custom-scrollbar">
        <button
          onClick={() => { setActiveTab('general'); setCurrentPage(1); }}
          className={`min-h-9 whitespace-nowrap rounded-[9px] px-4 py-2 text-[13px] font-medium transition-all ${activeTab === 'general' ? 'bg-white text-[#1d1d1f] shadow-[0_1px_2px_rgba(0,0,0,0.1)] dark:bg-brand-blue dark:text-white' : 'text-[#6e6e73] hover:text-[#1d1d1f] dark:text-slate-400 dark:hover:text-white'}`}
        >
          Vista General
        </button>
        <button
          onClick={() => { setActiveTab('catalog'); setCurrentPage(1); }}
          className={`min-h-9 whitespace-nowrap rounded-[9px] px-4 py-2 text-[13px] font-medium transition-all ${activeTab === 'catalog' ? 'bg-white text-[#1d1d1f] shadow-[0_1px_2px_rgba(0,0,0,0.1)] dark:bg-brand-blue dark:text-white' : 'text-[#6e6e73] hover:text-[#1d1d1f] dark:text-slate-400 dark:hover:text-white'}`}
        >
          Catálogo Interactivo
        </button>
        <button
          onClick={() => { setActiveTab('risks'); setCurrentPage(1); }}
          className={`min-h-9 whitespace-nowrap rounded-[9px] px-4 py-2 text-[13px] font-medium transition-all ${activeTab === 'risks' ? 'bg-white text-[#1d1d1f] shadow-[0_1px_2px_rgba(0,0,0,0.1)] dark:bg-brand-blue dark:text-white' : 'text-[#6e6e73] hover:text-[#1d1d1f] dark:text-slate-400 dark:hover:text-white'}`}
        >
          Alertas de Riesgo
        </button>
      </div>

      {error && (
        <div className="rounded-[16px] border border-red-200 bg-red-50 px-5 py-4 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400 shrink-0">
          <p className="font-medium">{error}</p>
        </div>
      )}

      {/* TAB 1: General */}
      {activeTab === 'general' && (
        <div className="flex flex-1 min-h-0 flex-col gap-5 animate-in fade-in">
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
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-5 xl:grid-cols-2">
            
            {/* Columna izquierda — scroll interno para matriz + mini dashboard */}
            <div className="flex min-h-0 flex-col gap-5 overflow-y-auto pb-1 custom-scrollbar">
              <div className="shrink-0">
                <Matrix3x3 data={inventoryData} onCellClick={handleCellClick} activeCell={activeCell} />
                <MatrixBarChart data={inventoryData} />
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
          <div className="flex flex-col items-start justify-between gap-5 rounded-[20px] border border-black/[0.08] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.03),0_12px_32px_rgba(0,0,0,0.04)] dark:border-slate-800 dark:bg-slate-900 md:items-center shrink-0">
            <div className="flex w-full flex-row flex-wrap gap-3">
              <div className="relative w-full md:w-96">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="h-5 w-5 text-slate-400 dark:text-slate-500" />
                </div>
                <input
                  type="text"
                  placeholder="Buscar por Nombre, SKU..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="min-h-11 w-full rounded-[10px] border border-black/[0.12] bg-white py-2 pl-10 pr-4 text-[13px] text-[#1d1d1f] placeholder:text-[#86868b] outline-none transition-colors hover:border-black/[0.2] dark:border-slate-800 dark:bg-slate-950 dark:text-white"
                />
              </div>
              <div className="relative w-full md:w-48">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Filter className="h-4 w-4 text-slate-500" />
                </div>
                <select
                  value={claseAbc}
                  onChange={(e) => { setClaseAbc(e.target.value); setCurrentPage(1); }}
                  className="min-h-11 w-full appearance-none rounded-[10px] border border-black/[0.12] bg-white py-2 pl-9 pr-4 text-[13px] text-[#1d1d1f] outline-none transition-colors hover:border-black/[0.2] dark:border-slate-800 dark:bg-slate-950 dark:text-white"
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
                  className="min-h-11 w-full appearance-none rounded-[10px] border border-black/[0.12] bg-white py-2 pl-9 pr-4 text-[13px] text-[#1d1d1f] outline-none transition-colors hover:border-black/[0.2] dark:border-slate-800 dark:bg-slate-950 dark:text-white"
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
                  className="min-h-11 w-full appearance-none rounded-[10px] border border-black/[0.12] bg-white py-2 pl-9 pr-4 text-[13px] text-[#1d1d1f] outline-none transition-colors hover:border-black/[0.2] dark:border-slate-800 dark:bg-slate-950 dark:text-white"
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
                  className="min-h-11 w-full appearance-none rounded-[10px] border border-black/[0.12] bg-white py-2 pl-9 pr-4 text-[13px] text-[#1d1d1f] outline-none transition-colors hover:border-black/[0.2] dark:border-slate-800 dark:bg-slate-950 dark:text-white"
                >
                  <option value="">Todos los Riesgos</option>
                  <option value="Sano">Sano</option>
                  <option value="Riesgo Rotura">Riesgo Rotura</option>
                  <option value="Riesgo Financiero">Riesgo Financiero</option>
                  <option value="Riesgo Comercial">Riesgo Comercial</option>
                </select>
              </div>
              <div className="flex items-center gap-2 w-full md:w-auto">
                <input
                  type="number"
                  placeholder="Mín. Días"
                  value={minDays}
                  onChange={(e) => { setMinDays(e.target.value === '' ? '' : Number(e.target.value)); setCurrentPage(1); }}
                  className="min-h-11 w-24 rounded-[10px] border border-black/[0.12] bg-white px-3 py-2 text-[13px] text-[#1d1d1f] outline-none transition-colors hover:border-black/[0.2] dark:border-slate-800 dark:bg-slate-950 dark:text-white"
                />
                <span className="text-slate-400">-</span>
                <input
                  type="number"
                  placeholder="Máx. Días"
                  value={maxDays}
                  onChange={(e) => { setMaxDays(e.target.value === '' ? '' : Number(e.target.value)); setCurrentPage(1); }}
                  className="min-h-11 w-24 rounded-[10px] border border-black/[0.12] bg-white px-3 py-2 text-[13px] text-[#1d1d1f] outline-none transition-colors hover:border-black/[0.2] dark:border-slate-800 dark:bg-slate-950 dark:text-white"
                />
              </div>
            </div>
            <div className="flex w-full items-center justify-between gap-4 md:w-auto md:justify-end">
              <span className="text-[13px] font-medium text-[#6e6e73] dark:text-slate-400">{totalRecords.toLocaleString('es-ES')} artículos</span>
              <button
                onClick={() => setExportModalOpen(true)}
                className="flex min-h-11 items-center gap-2 rounded-[10px] bg-[#0071e3] px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-[#0077ed]"
              >
                <Download size={16} />
                Exportar Excel
              </button>
            </div>
          </div>

          {/* Tabla — flex-1 para que ocupe el espacio restante */}
          <div className="flex min-h-0 flex-1 flex-col rounded-[20px] border border-black/[0.08] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.03),0_12px_32px_rgba(0,0,0,0.04)] dark:border-slate-800 dark:bg-brand-surface">
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
            <div className="flex shrink-0 items-center justify-between rounded-b-[20px] border-t border-black/[0.08] bg-[#fbfbfd] p-4 dark:border-slate-800 dark:bg-slate-950/50">
              <div className="text-[13px] text-[#6e6e73] dark:text-slate-400">
                Página <span className="font-medium text-slate-900 dark:text-white">{currentPage}</span> de <span className="font-medium text-slate-900 dark:text-white">{totalPages}</span> ({totalRecords} registros)
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1 || loading}
                  className="rounded-[9px] border border-black/[0.08] bg-white p-2 text-[#6e6e73] transition-colors hover:border-black/[0.16] hover:text-[#0071e3] disabled:opacity-40 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-300"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage >= totalPages || loading}
                  className="rounded-[9px] border border-black/[0.08] bg-white p-2 text-[#6e6e73] transition-colors hover:border-black/[0.16] hover:text-[#0071e3] disabled:opacity-40 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-300"
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
        <div className="space-y-5 animate-in fade-in">
          {loading ? (
            <div className="flex justify-center items-center h-64">
               <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-500"></div>
            </div>
          ) : inventoryData.length === 0 ? (
            <div className="bg-green-500/10 border border-green-500/30 text-green-400 p-8 rounded-xl text-center">
              <p className="text-lg font-medium">¡Todo en orden! No hay productos en riesgo de ruptura de stock.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
              
              {/* Triage Center Chart */}
              <div className="flex flex-col rounded-[20px] border border-black/[0.08] bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,0.03),0_12px_32px_rgba(0,0,0,0.04)] dark:border-slate-800 dark:bg-slate-900 xl:col-span-1">
                <h3 className="title-corporate mb-1 text-[20px] font-semibold tracking-[-0.02em]">Riesgo por familia</h3>
                <p className="mb-6 text-[13px] text-[#6e6e73] dark:text-slate-400">Artículos que requieren atención prioritaria.</p>
                <div className="flex-1 min-h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={riskFamilyData}
                      layout="vertical"
                      margin={{ top: 0, right: 30, left: 20, bottom: 0 }}
                    >
                      <XAxis type="number" hide />
                      <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} width={100} tick={{ fill: '#6e6e73', fontSize: 12 }} />
                      <Tooltip cursor={{ fill: 'rgba(0, 113, 227, 0.05)' }} contentStyle={{ borderRadius: '12px', border: '1px solid rgba(0,0,0,0.08)', boxShadow: '0 12px 32px rgba(0,0,0,0.10)' }} />
                      <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                        {riskFamilyData.map((entry, index) => (
                          <Cell 
                            key={`cell-${index}`} 
                            fill={riskFamilyFilter === entry.name || riskFamilyFilter === 'all' ? '#0071e3' : '#a7c7ed'}
                            className="cursor-pointer transition-colors"
                            onClick={() => setRiskFamilyFilter(riskFamilyFilter === entry.name ? 'all' : entry.name)}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                {riskFamilyFilter !== 'all' && (
                  <button onClick={() => setRiskFamilyFilter('all')} className="mt-4 self-end text-[12px] font-medium text-[#0071e3] hover:underline dark:text-brand-cyan">
                    Limpiar filtro
                  </button>
                )}
              </div>

              {/* Risks Grid */}
              <div className="xl:col-span-2">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {paginatedData
                    .filter(item => riskFamilyFilter === 'all' || item.familia === riskFamilyFilter)
                    .map((item) => (
                    <div key={item.cod_art} className="group flex flex-col justify-between rounded-[18px] border border-black/[0.08] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.03),0_12px_32px_rgba(0,0,0,0.04)] transition-shadow hover:shadow-[0_8px_24px_rgba(0,0,0,0.08)] dark:border-slate-800 dark:bg-slate-900">
                      <div>
                        <div className="flex justify-between items-start mb-3">
                          <div className="flex items-center gap-2">
                            <div className="rounded-[9px] bg-red-500/10 p-1.5">
                              <AlertTriangle className="h-4 w-4 text-red-500" />
                            </div>
                            <span className="rounded-full bg-[#f5f5f7] px-2 py-0.5 font-mono text-[11px] text-[#424245] dark:bg-slate-800 dark:text-slate-300">
                              {item.cod_art}
                            </span>
                          </div>
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${item.abc === 'A' ? 'bg-red-50 text-red-700 dark:bg-red-500/20 dark:text-red-400' : 'bg-amber-50 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400'}`}>
                            Prioridad {item.abc === 'A' ? 'Alta' : item.abc === 'B' ? 'Media' : 'Baja'}
                          </span>
                        </div>
                        <h3 className="mb-1 line-clamp-1 text-[15px] font-semibold text-[#1d1d1f] dark:text-white">{item.nombre_art}</h3>
                        <p className="mb-4 text-[12px] text-[#6e6e73] dark:text-slate-400">{item.marca} · {item.familia}</p>
                        
                        <div className="mb-4 flex items-center justify-between rounded-[12px] border border-black/[0.06] bg-[#fbfbfd] p-3 dark:border-slate-800 dark:bg-slate-950/50">
                          <div>
                            <div className="text-[10px] font-medium uppercase tracking-[0.06em] text-[#86868b]">Stock</div>
                            <div className="intelligence-tnum text-[18px] font-semibold text-red-600 dark:text-red-400">{item.unidades} u.</div>
                          </div>
                          <ArrowRight className="w-4 h-4 text-slate-300 dark:text-slate-600" />
                          <div className="text-right">
                            <div className="text-[10px] font-medium uppercase tracking-[0.06em] text-[#86868b]">Cobertura</div>
                            <div className="intelligence-tnum text-[18px] font-semibold text-[#1d1d1f] dark:text-white">{item.dias_cobertura.toFixed(1)} d.</div>
                          </div>
                        </div>
                      </div>
                      
                      <button className="flex min-h-10 w-full items-center justify-center gap-2 rounded-[10px] border border-black/[0.1] py-2 text-[13px] font-medium text-[#0071e3] transition-colors hover:border-[#0071e3]/40 hover:bg-[#0071e3]/[0.06] dark:border-slate-700 dark:text-brand-cyan">
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
                className="rounded-[9px] border border-black/[0.08] bg-white p-2 text-[#6e6e73] transition-colors hover:border-black/[0.16] hover:text-[#0071e3] disabled:opacity-40 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-300"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button 
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages || loading}
                className="rounded-[9px] border border-black/[0.08] bg-white p-2 text-[#6e6e73] transition-colors hover:border-black/[0.16] hover:text-[#0071e3] disabled:opacity-40 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-300"
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
            return hasRotura && p.abc === 'A';
          })}
        />
      )}

      {/* Export Modal */}
      {exportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white dark:bg-brand-surface border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Exportar a Excel</h3>
              <button 
                onClick={() => setExportModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                ✕
              </button>
            </div>
            
            <div className="p-4 overflow-y-auto custom-scrollbar flex-1">
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">Selecciona las columnas que deseas incluir en tu exportación:</p>
              
              <div className="flex flex-col gap-2">
                {EXPORT_COLUMNS.map(col => (
                  <label key={col.id} className="flex items-center gap-3 p-2 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-lg cursor-pointer transition-colors">
                    <input
                      type="checkbox"
                      checked={selectedColumns.includes(col.id)}
                      onChange={() => toggleColumn(col.id)}
                      className="w-4 h-4 text-brand-blue bg-slate-100 border-slate-300 rounded focus:ring-brand-blue dark:focus:ring-brand-cyan dark:ring-offset-slate-900 dark:bg-slate-800 dark:border-slate-700"
                    />
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{col.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex gap-3 justify-end bg-slate-50 dark:bg-slate-900/50">
              <button
                onClick={() => setExportModalOpen(false)}
                className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={executeExport}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors shadow-sm"
              >
                <Download size={16} />
                Descargar ({selectedColumns.length} columnas)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
