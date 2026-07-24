import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Database,
  Download,
  FileCheck2,
  FileSpreadsheet,
  Loader2,
  RefreshCw,
  UploadCloud,
  X,
} from 'lucide-react';

import {
  downloadDataImportTemplate,
  getDataImportStatus,
  loadDataImport,
  validateDataImport,
} from '../services/api';
import type {
  DataImportDataset,
  DataImportResult,
  DataImportStatus,
  DataImportValidation,
} from '../services/api';


const DATASETS: Array<{
  id: DataImportDataset;
  step: number;
  title: string;
  description: string;
  required: string[];
  optional: string[];
}> = [
  {
    id: 'sales',
    step: 1,
    title: 'fivemin_ventas',
    description: 'Fuente principal. Crea el catálogo y carga las ventas por SKU y fecha.',
    required: ['Fecha', 'Ventas', 'Unidades Venta', '% MG', 'Margen', '% MGD', 'MGD', 'Nombre Articulo', 'ArticuloPK', 'Nombre Marca', 'Familia/Marca', 'Nombre Familia', 'Nombre Seccion', 'EAN', 'Product Manager'],
    optional: [],
  },
  {
    id: 'products',
    step: 2,
    title: 'Catálogo independiente',
    description: 'Opcional. No es necesario cuando utilizas fivemin_ventas.',
    required: ['sku', 'nombre', 'costo_unitario', 'precio_venta'],
    optional: ['lead_time_dias', 'part_number', 'ean', 'peso', 'familia', 'marca', 'product_manager', 'seccion'],
  },
  {
    id: 'inventory',
    step: 3,
    title: 'Inventario futuro',
    description: 'Disponible cuando exista una fuente real de stock.',
    required: ['sku', 'stock_disponible'],
    optional: [],
  },
];

const formatNumber = (value?: number | null) => (value || 0).toLocaleString('es-ES');

const apiErrorMessage = (error: unknown) => {
  const candidate = error as {
    response?: {
      data?: {
        detail?: string | { errors?: Array<{ line: number; message: string }> };
      };
    };
  };
  const detail = candidate.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (detail?.errors?.length) return `La carga contiene ${detail.errors.length} errores. Revisa el archivo antes de continuar.`;
  return 'No se pudo procesar el archivo. Comprueba el formato e inténtalo de nuevo.';
};

export const DataEngineering = () => {
  const [dataset, setDataset] = useState<DataImportDataset>('sales');
  const [salesImportScope, setSalesImportScope] = useState<'operativa' | 'fiscal_anterior'>('operativa');
  const [status, setStatus] = useState<DataImportStatus | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [validation, setValidation] = useState<DataImportValidation | null>(null);
  const [result, setResult] = useState<DataImportResult | null>(null);
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingStatus, setIsLoadingStatus] = useState(true);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadStage, setUploadStage] = useState<'validation' | 'load' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeDataset = useMemo(
    () => DATASETS.find(item => item.id === dataset)!,
    [dataset],
  );

  const refreshStatus = async () => {
    try {
      setIsLoadingStatus(true);
      setStatus(await getDataImportStatus());
    } catch (statusError) {
      setError(apiErrorMessage(statusError));
    } finally {
      setIsLoadingStatus(false);
    }
  };

  useEffect(() => {
    let isActive = true;

    getDataImportStatus()
      .then(data => {
        if (isActive) setStatus(data);
      })
      .catch(statusError => {
        if (isActive) setError(apiErrorMessage(statusError));
      })
      .finally(() => {
        if (isActive) setIsLoadingStatus(false);
      });

    return () => {
      isActive = false;
    };
  }, []);

  const resetFile = () => {
    setFile(null);
    setValidation(null);
    setResult(null);
    setError(null);
    setUploadProgress(null);
    setUploadStage(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const changeDataset = (nextDataset: DataImportDataset) => {
    setDataset(nextDataset);
    setSalesImportScope('operativa');
    setReplaceExisting(false);
    resetFile();
  };

  const selectFile = (selectedFile?: File) => {
    if (!selectedFile) return;
    if (!/\.(csv|xlsx)$/i.test(selectedFile.name)) {
      setError('Selecciona un archivo CSV o XLSX.');
      return;
    }
    if (selectedFile.size > 20 * 1024 * 1024) {
      setError('El archivo supera el límite de 20 MB.');
      return;
    }
    setFile(selectedFile);
    setValidation(null);
    setResult(null);
    setError(null);
  };

  const validateFile = async () => {
    if (!file) return;
    try {
      setIsValidating(true);
      setUploadStage('validation');
      setUploadProgress(0);
      setError(null);
      setResult(null);
      setValidation(await validateDataImport(dataset, file, setUploadProgress));
    } catch (validationError) {
      setValidation(null);
      setError(apiErrorMessage(validationError));
    } finally {
      setIsValidating(false);
      setUploadProgress(null);
      setUploadStage(null);
    }
  };

  const importFile = async () => {
    if (!file || !validation?.valid) return;
    try {
      setIsLoading(true);
      setUploadStage('load');
      setUploadProgress(0);
      setError(null);
      const importResult = await loadDataImport(
        dataset,
        file,
        (dataset === 'products' || dataset === 'sales') && replaceExisting,
        setUploadProgress,
      );
      setResult(importResult);
      await refreshStatus();
    } catch (loadError) {
      setError(apiErrorMessage(loadError));
    } finally {
      setIsLoading(false);
      setUploadProgress(null);
      setUploadStage(null);
    }
  };

  return (
    <div className="flex flex-col gap-5 pb-10 animate-in fade-in duration-300">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="title-corporate text-3xl mb-1">Carga de datos reales</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Carga fivemin_ventas en CSV o XLSX. El catálogo se crea automáticamente desde las ventas.
          </p>
        </div>
        <button
          onClick={refreshStatus}
          disabled={isLoadingStatus}
          className="inline-flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
        >
          <RefreshCw size={16} className={isLoadingStatus ? 'animate-spin' : ''} />
          Actualizar estado
        </button>
      </div>

      <section className="border-y border-slate-200 dark:border-slate-800 py-4">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400">Productos</p>
            <p className="mt-1 text-xl font-semibold text-slate-900 dark:text-white">{formatNumber(status?.products)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400">SKUs con inventario</p>
            <p className="mt-1 text-xl font-semibold text-slate-900 dark:text-white">{formatNumber(status?.inventory_records)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400">Registros diarios de venta</p>
            <p className="mt-1 text-xl font-semibold text-slate-900 dark:text-white">{formatNumber(status?.sales_records)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400">Periodo de ventas</p>
            <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">
              {status?.sales_date_min && status?.sales_date_max
                ? `${status.sales_date_min} · ${status.sales_date_max}`
                : 'Sin datos'}
            </p>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        <nav className="space-y-1" aria-label="Orden de carga">
          <p className="mb-3 text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">Orden recomendado</p>
          {DATASETS.map(item => (
            <button
              key={item.id}
              onClick={() => changeDataset(item.id)}
              className={`w-full flex items-start gap-3 px-3 py-3 text-left border-l-2 transition-colors ${
                dataset === item.id
                  ? 'border-brand-blue dark:border-brand-cyan bg-brand-blue/5 dark:bg-brand-cyan/5 text-slate-900 dark:text-white'
                  : 'border-transparent text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/50'
              }`}
              aria-current={dataset === item.id ? 'step' : undefined}
            >
              <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                dataset === item.id
                  ? 'bg-brand-blue dark:bg-brand-cyan text-white dark:text-brand-dark'
                  : 'bg-slate-200 dark:bg-slate-700'
              }`}>
                {item.step}
              </span>
              <span>
                <span className="block text-sm font-medium">{item.title}</span>
                <span className="mt-0.5 block text-xs opacity-75">{item.description}</span>
              </span>
            </button>
          ))}
        </nav>

        <main className="min-w-0">
          <div className="flex flex-col gap-4 border-b border-slate-200 dark:border-slate-800 pb-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-slate-900 dark:text-white">{activeDataset.title}</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{activeDataset.description}</p>
            </div>
            <button
              onClick={() => downloadDataImportTemplate(dataset).catch(templateError => setError(apiErrorMessage(templateError)))}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm font-medium text-brand-blue dark:text-brand-cyan hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <Download size={16} />
              Descargar plantilla
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 py-5 md:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">Obligatorias</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {activeDataset.required.map(column => (
                  <code key={column} className="rounded bg-red-50 dark:bg-red-500/10 px-2 py-1 text-xs text-red-700 dark:text-red-300">{column}</code>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">Opcionales</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {activeDataset.optional.length ? activeDataset.optional.map(column => (
                  <code key={column} className="rounded bg-slate-100 dark:bg-slate-800 px-2 py-1 text-xs text-slate-600 dark:text-slate-300">{column}</code>
                )) : <span className="text-sm text-slate-400">Ninguna</span>}
              </div>
            </div>
          </div>

          {dataset === 'sales' && (
            <section className="mb-5 border border-brand-blue/20 bg-brand-blue/5 p-4 dark:border-brand-cyan/25 dark:bg-brand-cyan/5" aria-label="Alcance de la carga de ventas">
              <p className="text-sm font-semibold text-slate-900 dark:text-white">¿Qué ventas vas a incorporar?</p>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">Ambas cargas usan <code>fivemin_ventas</code> y se guardan por SKU y fecha. No hace falta crear otra fuente ni otra tabla.</p>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setSalesImportScope('operativa')}
                  aria-pressed={salesImportScope === 'operativa'}
                  className={`border p-3 text-left transition-colors ${salesImportScope === 'operativa' ? 'border-brand-blue bg-white dark:border-brand-cyan dark:bg-slate-900' : 'border-slate-200 bg-white/50 dark:border-slate-700 dark:bg-slate-900/40'}`}
                >
                  <span className="block text-sm font-medium text-slate-900 dark:text-white">Ventas operativas actuales</span>
                  <span className="mt-1 block text-xs text-slate-600 dark:text-slate-300">Carga habitual de datos del ejercicio vigente.</span>
                </button>
                <button
                  type="button"
                  onClick={() => { setSalesImportScope('fiscal_anterior'); setReplaceExisting(false); }}
                  aria-pressed={salesImportScope === 'fiscal_anterior'}
                  className={`border p-3 text-left transition-colors ${salesImportScope === 'fiscal_anterior' ? 'border-brand-blue bg-white dark:border-brand-cyan dark:bg-slate-900' : 'border-slate-200 bg-white/50 dark:border-slate-700 dark:bg-slate-900/40'}`}
                >
                  <span className="block text-sm font-medium text-slate-900 dark:text-white">Histórico del año fiscal anterior</span>
                  <span className="mt-1 block text-xs text-slate-600 dark:text-slate-300">Permite comparativas interanuales de ventas, margen, MGD, familias, marcas y SKU.</span>
                </button>
              </div>
              {salesImportScope === 'fiscal_anterior' && (
                <p className="mt-3 border-l-2 border-emerald-500 pl-3 text-xs text-emerald-800 dark:text-emerald-300">
                  Carga el archivo del FY anterior con sus fechas reales. Se añadirá al histórico sin eliminar el ejercicio actual; no actives la sustitución de datos.
                </p>
              )}
            </section>
          )}

          <div
            className="border border-dashed border-slate-300 dark:border-slate-700 px-5 py-8 text-center"
            onDragOver={event => event.preventDefault()}
            onDrop={event => {
              event.preventDefault();
              selectFile(event.dataTransfer.files?.[0]);
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={event => selectFile(event.target.files?.[0])}
            />
            {file ? (
              <div className="flex items-center justify-center gap-3">
                <FileSpreadsheet size={28} className="text-brand-blue dark:text-brand-cyan" />
                <div className="text-left">
                  <p className="text-sm font-medium text-slate-900 dark:text-white">{file.name}</p>
                  <p className="text-xs text-slate-500">{(file.size / 1024).toLocaleString('es-ES', { maximumFractionDigits: 1 })} KB</p>
                </div>
                <button onClick={resetFile} className="p-1.5 text-slate-400 hover:text-red-500" title="Quitar archivo" aria-label="Quitar archivo">
                  <X size={18} />
                </button>
              </div>
            ) : (
              <>
                <UploadCloud size={32} className="mx-auto text-slate-400" />
                <p className="mt-3 text-sm font-medium text-slate-800 dark:text-slate-200">Arrastra aquí tu CSV o XLSX</p>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-3 rounded-lg bg-brand-blue dark:bg-brand-cyan px-4 py-2 text-sm font-medium text-white dark:text-brand-dark"
                >
                  Seleccionar archivo
                </button>
                <p className="mt-2 text-xs text-slate-400">Excel .xlsx o CSV UTF-8 · máximo 20 MB / 100.000 filas</p>
              </>
            )}
          </div>

          {(dataset === 'products' || (dataset === 'sales' && salesImportScope === 'operativa')) && (
            <div className="mt-4 flex items-start gap-3 border-l-2 border-amber-400 bg-amber-50/60 dark:bg-amber-500/5 px-3 py-3">
              <input
                id="replace-existing-catalog"
                type="checkbox"
                checked={replaceExisting}
                onChange={event => setReplaceExisting(event.target.checked)}
                aria-describedby="replace-existing-description"
                className="mt-0.5 accent-amber-500"
              />
              <span>
                <label
                  htmlFor="replace-existing-catalog"
                  className="block cursor-pointer text-sm font-medium text-amber-900 dark:text-amber-300"
                >
                  Sustituir los datos actuales
                </label>
                <span id="replace-existing-description" className="block text-xs text-amber-700 dark:text-amber-400">
                  Elimina productos, stock, ventas y métricas de esta empresa. Actívalo solo en la primera carga real para retirar la demo.
                </span>
              </span>
            </div>
          )}

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              onClick={validateFile}
              disabled={!file || isValidating || isLoading}
              className="inline-flex items-center gap-2 rounded-lg border border-brand-blue/30 dark:border-brand-cyan/30 px-4 py-2 text-sm font-medium text-brand-blue dark:text-brand-cyan disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isValidating ? <Loader2 size={17} className="animate-spin" /> : <FileCheck2 size={17} />}
              Validar archivo
            </button>
            <button
              onClick={importFile}
              disabled={!validation?.valid || isLoading || Boolean(result)}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-blue dark:bg-brand-cyan px-4 py-2 text-sm font-medium text-white dark:text-brand-dark disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isLoading ? <Loader2 size={17} className="animate-spin" /> : <Database size={17} />}
              {dataset === 'sales' && salesImportScope === 'fiscal_anterior' ? 'Incorporar histórico FY anterior' : 'Cargar en producción'}
            </button>
          </div>

          {uploadProgress !== null && uploadStage && (
            <div className="mt-4" role="status" aria-live="polite">
              <div className="flex items-center justify-between text-xs font-medium text-slate-600 dark:text-slate-300">
                <span>
                  {uploadProgress < 100
                    ? uploadStage === 'validation' ? 'Subiendo archivo para validar' : 'Subiendo archivo para cargar'
                    : uploadStage === 'validation' ? 'Validando archivo en el servidor' : 'Procesando la carga en el servidor'}
                </span>
                <span>{uploadProgress}%</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden bg-slate-200 dark:bg-slate-800" aria-hidden="true">
                <div
                  className="h-full bg-brand-blue transition-[width] duration-200 dark:bg-brand-cyan"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}

          {error && (
            <div className="mt-4 flex items-start gap-2 border-l-2 border-red-500 bg-red-50 dark:bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300" role="alert">
              <AlertCircle size={17} className="mt-0.5 shrink-0" />
              {error}
            </div>
          )}

          {validation && (
            <div className={`mt-5 border-l-2 px-4 py-3 ${validation.valid ? 'border-emerald-500 bg-emerald-50/60 dark:bg-emerald-500/5' : 'border-red-500 bg-red-50/60 dark:bg-red-500/5'}`}>
              <div className="flex items-center gap-2">
                {validation.valid
                  ? <CheckCircle2 size={19} className="text-emerald-600" />
                  : <AlertCircle size={19} className="text-red-600" />}
                <p className="text-sm font-semibold text-slate-900 dark:text-white">
                  {validation.valid ? 'Archivo válido y listo para cargar' : 'El archivo contiene errores'}
                </p>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <span>Total: <strong>{formatNumber(validation.rows_total)}</strong></span>
                <span>Válidas: <strong>{formatNumber(validation.rows_valid)}</strong></span>
                <span>Inválidas: <strong>{formatNumber(validation.rows_invalid)}</strong></span>
                <span>Codificación: <strong>{validation.encoding}</strong></span>
              </div>
              {validation.date_min && validation.date_max && (
                <p className="mt-2 text-sm">Periodo detectado: <strong>{validation.date_min}</strong> a <strong>{validation.date_max}</strong></p>
              )}
              {validation.unknown_columns.length > 0 && (
                <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                  Columnas ignoradas: {validation.unknown_columns.join(', ')}
                </p>
              )}
              {validation.errors.length > 0 && (
                <div className="mt-3 max-h-52 overflow-y-auto border-t border-red-200 dark:border-red-500/20 pt-2">
                  {validation.errors.map((item, index) => (
                    <p key={`${item.line}-${index}`} className="py-1 text-xs text-red-700 dark:text-red-300">
                      Fila {item.line}: {item.message}
                    </p>
                  ))}
                </div>
              )}
              {validation.warnings.length > 0 && (
                <div className="mt-3 max-h-52 overflow-y-auto border-t border-amber-200 dark:border-amber-500/20 pt-2">
                  <p className="mb-1 text-xs font-medium text-amber-700 dark:text-amber-300">
                    Advertencias de calidad: estos valores se omitirán, pero el archivo se puede cargar.
                  </p>
                  {validation.warnings.map((item, index) => (
                    <p key={`${item.line}-${index}`} className="py-1 text-xs text-amber-700 dark:text-amber-300">
                      Fila {item.line}: {item.message}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}

          {result && (
            <div className="mt-5 border-l-2 border-emerald-500 bg-emerald-50/60 dark:bg-emerald-500/5 px-4 py-3">
              <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 size={19} />
                <p className="text-sm font-semibold">Carga completada</p>
              </div>
              <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">
                {formatNumber(result.records_affected)} registros procesados · {formatNumber(result.created)} creados · {formatNumber(result.updated)} actualizados.
              </p>
              {dataset === 'sales' && (
                <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">
                  Catálogo: {formatNumber(result.products_created)} SKU creados · {formatNumber(result.products_updated)} actualizados.
                </p>
              )}
              {dataset === 'sales' && salesImportScope === 'fiscal_anterior' && (
                <p className="mt-1 text-sm text-emerald-800 dark:text-emerald-300">
                  Histórico fiscal incorporado: ya está disponible para comparativas interanuales del Copilot.
                </p>
              )}
              <button onClick={resetFile} className="mt-3 text-sm font-medium text-brand-blue dark:text-brand-cyan hover:underline">
                Preparar otra carga
              </button>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};
