import { 
  Database, Server, RefreshCw, CheckCircle2, XCircle, FileSpreadsheet, 
  ArrowRight, Filter, BrainCircuit, Activity, Clock, FileWarning, ArrowDownToLine, AlertCircle
} from 'lucide-react';

export const DataEngineering = () => {
  const activeDatasets = [
    { name: 'maestro_articulos_v4_final.xlsx', type: 'Catálogo e Inventario', rows: '12,450', lastUpdate: 'Hoy, 08:30 AM', status: 'active' },
    { name: 'hist_ventas_Q1_Q2_2024.csv', type: 'Ventas Históricas', rows: '458,912', lastUpdate: 'Ayer, 23:45 PM', status: 'active' },
    { name: 'proveedores_leadtime.xlsx', type: 'Tiempos de Entrega', rows: '340', lastUpdate: 'Hace 3 días', status: 'warning' },
  ];

  const recentImports = [
    { id: 'IMP-8492', file: 'stock_diario_bcn.csv', time: 'Hace 10 min', status: 'success', rows: 850, errors: 0 },
    { id: 'IMP-8491', file: 'ventas_ecommerce.csv', time: 'Hace 2 horas', status: 'success', rows: 14500, errors: 0 },
    { id: 'IMP-8490', file: 'update_precios_proveedor.xlsx', time: 'Hace 5 horas', status: 'error', rows: 1200, errors: 15 },
    { id: 'IMP-8489', file: 'maestro_articulos_v4_final.xlsx', time: 'Hoy, 08:30 AM', status: 'success', rows: 12450, errors: 0 },
  ];

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-500 pb-10">
      {/* Header */}
      <div className="flex justify-between items-center shrink-0">
        <div>
          <h1 className="title-corporate text-3xl mb-1">Data Engineering Console</h1>
          <p className="text-slate-500 dark:text-slate-400">Monitorización de flujos ETL, pipelines de datos y estado de integraciones.</p>
        </div>
        <div className="flex gap-3">
          <button className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 px-4 py-2 rounded-lg font-medium transition-colors text-sm border border-slate-200 dark:border-slate-700">
            <RefreshCw size={16} />
            Actualizar Estado
          </button>
          <button className="flex items-center gap-2 bg-brand-blue hover:bg-blue-700 dark:bg-brand-cyan/20 dark:hover:bg-brand-cyan/30 text-white dark:text-brand-cyan px-4 py-2 rounded-lg font-medium transition-colors text-sm border border-transparent dark:border-brand-cyan/50 shadow-lg shadow-brand-blue/20 dark:shadow-brand-cyan/10">
            <ArrowDownToLine size={16} />
            Nueva Importación
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column - Pipeline Visual & Active Datasets */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          
          {/* Data Pipeline Flow */}
          <div className="bg-white dark:bg-brand-surface rounded-xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-6 flex items-center gap-2">
              <Activity className="text-brand-blue dark:text-brand-cyan" size={24} />
              Flujo de Carga y Transformaciones (ETL)
            </h2>
            
            <div className="relative">
              {/* Línea conectora de fondo */}
              <div className="absolute top-1/2 left-10 right-10 h-1 bg-slate-200 dark:bg-slate-800 -translate-y-1/2 z-0 hidden md:block"></div>
              
              <div className="flex flex-col md:flex-row justify-between gap-4 relative z-10">
                
                {/* Step 1: Ingesta */}
                <div className="flex-1 bg-slate-50 dark:bg-slate-900/80 p-4 rounded-xl border border-slate-200 dark:border-slate-700 flex flex-col items-center text-center shadow-sm relative group hover:-translate-y-1 transition-transform">
                  <div className="w-12 h-12 bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 rounded-full flex items-center justify-center mb-3 shadow-[0_0_15px_rgba(59,130,246,0.15)] group-hover:shadow-[0_0_20px_rgba(59,130,246,0.3)] transition-shadow">
                    <FileSpreadsheet size={24} />
                  </div>
                  <h3 className="font-bold text-slate-800 dark:text-slate-200 text-sm">1. Ingesta</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Excel, CSV, ERP API</p>
                  <div className="mt-3 flex gap-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" style={{ animationDelay: '0.2s' }}></span>
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" style={{ animationDelay: '0.4s' }}></span>
                  </div>
                </div>

                <div className="hidden md:flex items-center justify-center text-slate-300 dark:text-slate-600">
                  <ArrowRight size={24} />
                </div>

                {/* Step 2: Transformación */}
                <div className="flex-1 bg-slate-50 dark:bg-slate-900/80 p-4 rounded-xl border border-slate-200 dark:border-slate-700 flex flex-col items-center text-center shadow-sm relative group hover:-translate-y-1 transition-transform">
                  <div className="w-12 h-12 bg-purple-100 dark:bg-purple-500/20 text-purple-600 dark:text-purple-400 rounded-full flex items-center justify-center mb-3 shadow-[0_0_15px_rgba(168,85,247,0.15)] group-hover:shadow-[0_0_20px_rgba(168,85,247,0.3)] transition-shadow">
                    <Filter size={24} />
                  </div>
                  <h3 className="font-bold text-slate-800 dark:text-slate-200 text-sm">2. Transformación</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Limpieza, Tipos de datos, Validaciones</p>
                </div>

                <div className="hidden md:flex items-center justify-center text-slate-300 dark:text-slate-600">
                  <ArrowRight size={24} />
                </div>

                {/* Step 3: AI Engine */}
                <div className="flex-1 bg-slate-50 dark:bg-slate-900/80 p-4 rounded-xl border border-brand-blue/30 dark:border-brand-cyan/30 flex flex-col items-center text-center shadow-[0_0_15px_rgba(6,182,212,0.05)] dark:shadow-[0_0_15px_rgba(6,182,212,0.1)] relative group hover:-translate-y-1 transition-transform">
                  <div className="absolute -top-2 -right-2 bg-emerald-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full animate-pulse shadow-lg">
                    ACTIVE
                  </div>
                  <div className="w-12 h-12 bg-brand-blue dark:bg-brand-cyan/20 text-white dark:text-brand-cyan rounded-full flex items-center justify-center mb-3 shadow-[0_0_20px_rgba(6,182,212,0.2)] dark:shadow-[0_0_20px_rgba(6,182,212,0.4)] group-hover:scale-110 transition-transform">
                    <BrainCircuit size={24} />
                  </div>
                  <h3 className="font-bold text-slate-800 dark:text-slate-200 text-sm">3. Motor de IA</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Cálculo ABC, Predicción, ADS</p>
                </div>

                <div className="hidden md:flex items-center justify-center text-slate-300 dark:text-slate-600">
                  <ArrowRight size={24} />
                </div>

                {/* Step 4: Storage */}
                <div className="flex-1 bg-slate-50 dark:bg-slate-900/80 p-4 rounded-xl border border-slate-200 dark:border-slate-700 flex flex-col items-center text-center shadow-sm relative group hover:-translate-y-1 transition-transform">
                  <div className="w-12 h-12 bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-full flex items-center justify-center mb-3">
                    <Database size={24} />
                  </div>
                  <h3 className="font-bold text-slate-800 dark:text-slate-200 text-sm">4. Data Warehouse</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">SQL SupplyChain DB</p>
                </div>

              </div>
            </div>
          </div>

          {/* Active Datasets */}
          <div className="bg-white dark:bg-brand-surface rounded-xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
              <Database className="text-brand-blue dark:text-brand-cyan" size={24} />
              Fuentes de Datos Activas
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
              Archivos y conexiones que actualmente alimentan el modelo de inteligencia.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {activeDatasets.map((dataset, i) => (
                <div key={i} className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 hover:border-brand-blue/30 dark:hover:border-brand-cyan/30 transition-colors group">
                  <div className="flex justify-between items-start mb-3">
                    <div className={`p-2 rounded-lg ${dataset.status === 'active' ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400' : 'bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400'}`}>
                      {dataset.status === 'active' ? <FileSpreadsheet size={20} /> : <FileWarning size={20} />}
                    </div>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                      {dataset.type}
                    </span>
                  </div>
                  <h3 className="font-medium text-sm text-slate-900 dark:text-white truncate mb-1" title={dataset.name}>{dataset.name}</h3>
                  <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400 mt-3">
                    <div className="flex items-center gap-1">
                      <Server size={14} /> {dataset.rows} fils
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock size={14} /> {dataset.lastUpdate}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* AI Copilot Configuration */}
          <div className="bg-white dark:bg-gradient-to-br dark:from-black/40 dark:to-slate-900/40 rounded-xl border border-slate-200 dark:border-slate-700/50 p-6 shadow-sm dark:shadow-lg relative overflow-hidden">
            <div className="absolute -right-6 -top-6 opacity-5 dark:opacity-10 text-brand-blue dark:text-white">
              <BrainCircuit size={150} />
            </div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2 relative z-10">
              <BrainCircuit className="text-brand-blue dark:text-brand-cyan" size={24} />
              Configuración del Motor AI Copilot
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 relative z-10">
              <div className="bg-slate-50 dark:bg-black/20 rounded-lg p-4 border border-slate-100 dark:border-slate-700/50">
                <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">Modelo Principal (Predicción)</h3>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-600 dark:text-slate-300">Arquitectura</span>
                    <span className="text-sm font-medium text-slate-700 dark:text-white bg-slate-200 dark:bg-slate-700 px-2 py-0.5 rounded">Transformer / Time-Series</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-600 dark:text-slate-300">Modelo Base</span>
                    <span className="text-sm font-medium text-brand-blue dark:text-brand-cyan">Gemini 1.5 Pro</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-600 dark:text-slate-300">Ventana Contexto</span>
                    <span className="text-sm font-medium text-slate-800 dark:text-white">2M Tokens</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-600 dark:text-slate-300">Temperatura (Creatividad)</span>
                    <span className="text-sm font-medium text-slate-800 dark:text-white">0.2 (Alta Precisión)</span>
                  </div>
                </div>
              </div>

              <div className="bg-slate-50 dark:bg-black/20 rounded-lg p-4 border border-slate-100 dark:border-slate-700/50">
                <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">Parámetros de Entrenamiento</h3>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-600 dark:text-slate-300">Frecuencia de Re-Train</span>
                    <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400">Semanal</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-600 dark:text-slate-300">Corte de Histórico</span>
                    <span className="text-sm font-medium text-slate-800 dark:text-white">Últimos 18 meses</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-600 dark:text-slate-300">Embeddings</span>
                    <span className="text-sm font-medium text-slate-800 dark:text-white">text-embedding-004</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-600 dark:text-slate-300">Estado de Inferencia</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400 animate-pulse"></span>
                      ONLINE
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* Right Column - Import Status Log */}
        <div className="bg-white dark:bg-brand-surface rounded-xl border border-slate-200 dark:border-slate-800 p-0 shadow-sm overflow-hidden flex flex-col h-[600px]">
          <div className="p-5 border-b border-slate-200 dark:border-slate-800 shrink-0 bg-slate-50 dark:bg-slate-900/50">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <RefreshCw className="text-brand-blue dark:text-brand-cyan" size={20} />
              Registro de Importaciones
            </h2>
          </div>
          
          <div className="flex-1 overflow-y-auto custom-scrollbar p-5">
            <div className="relative border-l-2 border-slate-200 dark:border-slate-700 ml-3 space-y-6">
              
              {recentImports.map((imp, i) => (
                <div key={i} className="relative pl-6">
                  {/* Timeline dot */}
                  <div className={`absolute -left-[9px] top-1 w-4 h-4 rounded-full border-2 border-white dark:border-brand-surface flex items-center justify-center
                    ${imp.status === 'success' ? 'bg-emerald-500' : 'bg-red-500'}
                  `}>
                    {imp.status === 'success' ? <CheckCircle2 size={10} className="text-white" /> : <XCircle size={10} className="text-white" />}
                  </div>
                  
                  {/* Content */}
                  <div className="bg-slate-50 dark:bg-slate-800/30 rounded-lg border border-slate-200 dark:border-slate-700 p-3 hover:shadow-md transition-shadow">
                    <div className="flex justify-between items-start mb-1">
                      <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">{imp.id}</span>
                      <span className="text-[10px] text-slate-400 dark:text-slate-500 flex items-center gap-1">
                        <Clock size={10} /> {imp.time}
                      </span>
                    </div>
                    <h4 className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate mb-2" title={imp.file}>
                      {imp.file}
                    </h4>
                    
                    {imp.status === 'success' ? (
                      <div className="flex items-center gap-2 text-xs">
                        <span className="px-2 py-0.5 bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 rounded font-medium">
                          Éxito
                        </span>
                        <span className="text-slate-500 dark:text-slate-400">{imp.rows.toLocaleString()} filas validadas</span>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2 text-xs">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 bg-red-100 dark:bg-red-500/10 text-red-700 dark:text-red-400 rounded font-medium">
                            Error Parcial
                          </span>
                          <span className="text-slate-500 dark:text-slate-400">{imp.rows.toLocaleString()} filas procesadas</span>
                        </div>
                        <div className="text-red-600 dark:text-red-400 flex items-center gap-1 bg-red-50 dark:bg-red-500/5 p-1.5 rounded">
                          <AlertCircle size={12} />
                          {imp.errors} errores de formato detectados. Revisar logs.
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {/* End marker */}
              <div className="relative pl-6">
                <div className="absolute -left-[5px] top-2 w-2 h-2 rounded-full bg-slate-300 dark:bg-slate-600"></div>
                <span className="text-xs text-slate-400 dark:text-slate-500">Fin del registro histórico (7 días)</span>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
