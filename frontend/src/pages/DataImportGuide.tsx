import { Upload, FileSpreadsheet, Database, Server, CheckCircle2, AlertCircle, FileUp, Zap, History } from 'lucide-react';

export const DataImportGuide = () => {
  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-500 pb-10">
      {/* Header */}
      <div className="flex justify-between items-center shrink-0">
        <div>
          <h1 className="title-corporate text-3xl mb-1">Guía de Importación de Datos</h1>
          <p className="text-slate-500 dark:text-slate-400">Manual para la carga de catálogos, inventario e históricos de ventas.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Main Guide */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          
          {/* Métodos de Carga */}
          <div className="bg-white dark:bg-brand-surface rounded-xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
              <Upload className="text-brand-blue dark:text-brand-cyan" size={24} />
              Métodos de Carga de Datos
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg">
                    <FileUp size={20} />
                  </div>
                  <h3 className="font-semibold text-slate-800 dark:text-slate-200">Carga Manual (CSV/Excel)</h3>
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
                  Ideal para actualizaciones periódicas o catálogos estáticos. Sube archivos directamente desde la interfaz.
                </p>
                <ul className="text-sm text-slate-600 dark:text-slate-400 space-y-1">
                  <li className="flex items-center gap-2"><CheckCircle2 size={14} className="text-emerald-500" /> Formatos: .csv, .xlsx</li>
                  <li className="flex items-center gap-2"><CheckCircle2 size={14} className="text-emerald-500" /> Tamaño máx: 50MB por archivo</li>
                </ul>
              </div>

              <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded-lg">
                    <Zap size={20} />
                  </div>
                  <h3 className="font-semibold text-slate-800 dark:text-slate-200">Carga Automática (API/ERP)</h3>
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
                  Conexión directa con tu ERP (SAP, Dynamics, Odoo) o base de datos vía API REST para sincronización en tiempo real.
                </p>
                <ul className="text-sm text-slate-600 dark:text-slate-400 space-y-1">
                  <li className="flex items-center gap-2"><CheckCircle2 size={14} className="text-emerald-500" /> Sincronización programada (ej. nocturna)</li>
                  <li className="flex items-center gap-2"><CheckCircle2 size={14} className="text-emerald-500" /> Endpoints seguros vía tokens</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Estructura de Datos */}
          <div className="bg-white dark:bg-brand-surface rounded-xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
              <FileSpreadsheet className="text-brand-blue dark:text-brand-cyan" size={24} />
              Estructura de Archivos Requerida
            </h2>
            
            <div className="space-y-6">
              {/* Formato Unificado */}
              <div>
                <h3 className="font-semibold text-slate-800 dark:text-slate-200 mb-2 border-b border-slate-200 dark:border-slate-700 pb-2">Estructura Unificada (CSV/Excel)</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                      <tr>
                        <th className="px-4 py-2 font-medium rounded-tl-lg">Columna</th>
                        <th className="px-4 py-2 font-medium">Origen</th>
                        <th className="px-4 py-2 font-medium">Obligatorio</th>
                        <th className="px-4 py-2 font-medium rounded-tr-lg">Descripción</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                      <tr><td className="px-4 py-2 font-mono text-xs">fecha</td><td className="px-4 py-2">Cliente (CSV)</td><td className="px-4 py-2 text-red-500">Sí</td><td className="px-4 py-2">Fecha de la transacción (YYYY-MM-DD).</td></tr>
                      <tr><td className="px-4 py-2 font-mono text-xs">cantidad</td><td className="px-4 py-2">Cliente (CSV)</td><td className="px-4 py-2 text-red-500">Sí</td><td className="px-4 py-2">Unidades vendidas.</td></tr>
                      <tr><td className="px-4 py-2 font-mono text-xs">sku</td><td className="px-4 py-2">Cliente (CSV)</td><td className="px-4 py-2 text-red-500">Sí</td><td className="px-4 py-2">Código único del artículo.</td></tr>
                      <tr><td className="px-4 py-2 font-mono text-xs">nombre</td><td className="px-4 py-2">Cliente (CSV)</td><td className="px-4 py-2 text-red-500">Sí</td><td className="px-4 py-2">Descripción del producto.</td></tr>
                      <tr><td className="px-4 py-2 font-mono text-xs">costo_unitario</td><td className="px-4 py-2">Cliente (CSV)</td><td className="px-4 py-2 text-red-500">Sí</td><td className="px-4 py-2">Costo de compra en Euros (€).</td></tr>
                      <tr><td className="px-4 py-2 font-mono text-xs">precio_venta</td><td className="px-4 py-2">Cliente (CSV)</td><td className="px-4 py-2 text-red-500">Sí</td><td className="px-4 py-2">Precio de venta público.</td></tr>
                      <tr><td className="px-4 py-2 font-mono text-xs">stock_disponible</td><td className="px-4 py-2">Cliente (CSV)</td><td className="px-4 py-2 text-red-500">Sí</td><td className="px-4 py-2">Unidades físicas actuales.</td></tr>
                      <tr><td className="px-4 py-2 font-mono text-xs">familia</td><td className="px-4 py-2">Cliente (CSV)</td><td className="px-4 py-2 text-slate-400">No</td><td className="px-4 py-2">Categoría del producto.</td></tr>
                      <tr><td className="px-4 py-2 font-mono text-xs">marca</td><td className="px-4 py-2">Cliente (CSV)</td><td className="px-4 py-2 text-slate-400">No</td><td className="px-4 py-2">Marca del fabricante.</td></tr>
                      <tr><td className="px-4 py-2 font-mono text-xs">product_manager</td><td className="px-4 py-2">Cliente (CSV)</td><td className="px-4 py-2 text-slate-400">No</td><td className="px-4 py-2">Responsable de compras (ej: JAC).</td></tr>
                      <tr><td className="px-4 py-2 font-mono text-xs">ean</td><td className="px-4 py-2">Cliente (CSV)</td><td className="px-4 py-2 text-slate-400">No</td><td className="px-4 py-2">Código de barras EAN.</td></tr>
                      <tr><td className="px-4 py-2 font-mono text-xs">seccion</td><td className="px-4 py-2">Cliente (CSV)</td><td className="px-4 py-2 text-slate-400">No</td><td className="px-4 py-2">Sección madre (ej: Informática).</td></tr>
                      <tr className="bg-brand-blue/5 dark:bg-brand-cyan/5"><td className="px-4 py-2 font-mono text-xs font-bold text-brand-blue dark:text-brand-cyan">cobertura</td><td className="px-4 py-2 font-medium">Calculado Web</td><td className="px-4 py-2">-</td><td className="px-4 py-2">Stock disponible / ADS calculado con ventas de los últimos 90 días. No incluir en CSV.</td></tr>
                      <tr className="bg-brand-blue/5 dark:bg-brand-cyan/5"><td className="px-4 py-2 font-mono text-xs font-bold text-brand-blue dark:text-brand-cyan">abc_doble</td><td className="px-4 py-2 font-medium">Calculado Web</td><td className="px-4 py-2">-</td><td className="px-4 py-2">Matriz ABCXYZ: ventas EUR de los últimos 90 días frente a inventario EUR actual. No incluir en CSV.</td></tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column - FAQs & Capacity */}
        <div className="flex flex-col gap-6">
          <div className="bg-gradient-to-br from-brand-blue to-blue-700 dark:from-brand-cyan/20 dark:to-blue-900/20 rounded-xl p-6 text-white dark:text-slate-200 shadow-lg border border-transparent dark:border-brand-cyan/30 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10">
              <Database size={100} />
            </div>
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2 relative z-10">
              <Server size={24} />
              Capacidad y Rendimiento
            </h2>
            <div className="space-y-4 relative z-10">
              <div>
                <h3 className="font-semibold text-blue-100 dark:text-brand-cyan mb-1">¿Es viable manejar grandes cantidades de datos?</h3>
                <p className="text-sm text-blue-50/90 dark:text-slate-300">
                  Totalmente. La plataforma está diseñada con una arquitectura escalable. El motor de análisis procesa millones de filas de forma eficiente utilizando bases de datos relacionales optimizadas para cargas de lectura analítica.
                </p>
              </div>
              <div className="bg-white/10 dark:bg-black/20 rounded-lg p-3 backdrop-blur-sm border border-white/10">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs font-semibold uppercase tracking-wider text-blue-200 dark:text-brand-cyan/80">Límite por carga manual</span>
                  <span className="font-bold">500,000 registros</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs font-semibold uppercase tracking-wider text-blue-200 dark:text-brand-cyan/80">Capacidad Total Base de Datos</span>
                  <span className="font-bold">Ilimitada*</span>
                </div>
                <p className="text-[10px] text-blue-200/70 mt-2">* Dependiendo del plan de infraestructura desplegado (PostgreSQL / Snowflake en entornos Enterprise).</p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-brand-surface rounded-xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
              <History className="text-brand-blue dark:text-brand-cyan" size={20} />
              Preguntas Frecuentes
            </h2>
            
            <div className="space-y-4">
              <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-100 dark:border-slate-700">
                <h3 className="font-semibold text-sm text-slate-800 dark:text-slate-200 mb-1 flex gap-2">
                  <AlertCircle size={16} className="text-brand-blue dark:text-brand-cyan shrink-0 mt-0.5" />
                  ¿Se puede subir histórico de inventario de los últimos 90 días?
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-400 pl-6">
                  Sí. Puedes subir instantáneas diarias de inventario o históricos de 90 días. Nuestro motor analizará la evolución del stock para detectar tendencias de acumulación o quiebres pasados.
                </p>
              </div>

              <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-100 dark:border-slate-700">
                <h3 className="font-semibold text-sm text-slate-800 dark:text-slate-200 mb-1 flex gap-2">
                  <AlertCircle size={16} className="text-brand-blue dark:text-brand-cyan shrink-0 mt-0.5" />
                  ¿Se pueden subir las ventas de los últimos 90 días?
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-400 pl-6">
                  Sí, de hecho es <span className="font-semibold">altamente recomendado</span>. Recomendamos subir los últimos 90 días de histórico de ventas por artículo para que los algoritmos de Inteligencia ABC y Predicción de Demanda funcionen con máxima precisión.
                </p>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
