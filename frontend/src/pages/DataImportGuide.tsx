import { AlertTriangle, Calculator, CheckCircle2, FileSpreadsheet, Info, UploadCloud } from 'lucide-react';
import { Link } from 'react-router-dom';


type ColumnDefinition = {
  name: string;
  type: string;
  required: boolean;
  destination: string;
  description: string;
};

const SALES_COLUMNS: ColumnDefinition[] = [
  { name: 'Fecha', type: 'fecha', required: true, destination: 'fecha_venta', description: 'Fecha de la venta.' },
  { name: 'Ventas', type: 'EUR', required: true, destination: 'ingreso_total', description: 'Fuente oficial de ventas en euros.' },
  { name: 'Unidades Venta', type: 'entero', required: true, destination: 'cantidad_vendida', description: 'Unidades vendidas.' },
  { name: '% MG', type: 'porcentaje', required: true, destination: 'margen_bruto_pct', description: 'Porcentaje de margen bruto.' },
  { name: 'Margen', type: 'EUR', required: true, destination: 'margen_bruto_eur', description: 'Margen bruto en euros.' },
  { name: '% MGD', type: 'porcentaje', required: true, destination: 'margen_destino_pct', description: 'Porcentaje de margen puesto en destino.' },
  { name: 'MGD', type: 'EUR', required: true, destination: 'margen_destino_eur', description: 'Margen puesto en destino en euros.' },
  { name: 'Nombre Articulo', type: 'texto', required: true, destination: 'nombre', description: 'Nombre del producto.' },
  { name: 'ArticuloPK', type: 'texto', required: true, destination: 'sku', description: 'Referencia interna estable del artículo.' },
  { name: 'Nombre Marca', type: 'texto', required: true, destination: 'marca', description: 'Marca del producto.' },
  { name: 'Familia/Marca', type: 'texto', required: true, destination: 'familia_marca', description: 'Agrupación combinada, por ejemplo Moviles/Apple.' },
  { name: 'Nombre Familia', type: 'texto', required: true, destination: 'familia', description: 'Familia del producto.' },
  { name: 'Nombre Seccion', type: 'texto', required: true, destination: 'seccion', description: 'Sección corporativa del producto.' },
  { name: 'EAN', type: 'texto', required: true, destination: 'ean', description: 'EAN conservado como texto.' },
  { name: 'Product Manager', type: 'texto', required: true, destination: 'product_manager', description: 'PM responsable del artículo.' },
];

const ColumnTable = () => (
  <div className="overflow-x-auto border-y border-slate-200 dark:border-slate-800">
    <table className="w-full min-w-[900px] text-left text-sm">
      <thead className="bg-slate-50 dark:bg-slate-900/60 text-xs uppercase text-slate-500 dark:text-slate-400">
        <tr>
          <th className="px-3 py-2.5 font-semibold">Columna del archivo</th>
          <th className="px-3 py-2.5 font-semibold">Tipo</th>
          <th className="px-3 py-2.5 font-semibold">Obligatoria</th>
          <th className="px-3 py-2.5 font-semibold">Campo interno</th>
          <th className="px-3 py-2.5 font-semibold">Uso</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
        {SALES_COLUMNS.map(column => (
          <tr key={column.name}>
            <td className="px-3 py-2.5 font-medium text-slate-900 dark:text-white">{column.name}</td>
            <td className="px-3 py-2.5 text-slate-600 dark:text-slate-300">{column.type}</td>
            <td className={column.required ? 'px-3 py-2.5 text-red-600 dark:text-red-400' : 'px-3 py-2.5 text-slate-400'}>
              {column.required ? 'Sí' : 'No'}
            </td>
            <td className="px-3 py-2.5"><code className="text-xs text-brand-blue dark:text-brand-cyan">{column.destination}</code></td>
            <td className="px-3 py-2.5 text-slate-600 dark:text-slate-300">{column.description}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

export const DataImportGuide = () => (
  <div className="flex flex-col gap-7 pb-10 animate-in fade-in duration-300">
    <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div>
        <h1 className="title-corporate text-3xl mb-1">Guía de fivemin_ventas</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Contrato operativo para cargar las ventas reales desde el 01/05/2026 y actualizarlas cada día.
        </p>
      </div>
      <Link
        to="/integrations"
        className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-blue dark:bg-brand-cyan px-4 py-2 text-sm font-medium text-white dark:text-brand-dark"
      >
        <UploadCloud size={17} />
        Cargar archivo
      </Link>
    </div>

    <section className="border-y border-slate-200 dark:border-slate-800 py-5">
      <div className="grid gap-5 md:grid-cols-3">
        <div className="flex gap-3">
          <FileSpreadsheet size={20} className="mt-0.5 shrink-0 text-brand-blue dark:text-brand-cyan" />
          <div>
            <p className="text-sm font-semibold text-slate-900 dark:text-white">Un único archivo principal</p>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Se admite fivemin_ventas.xlsx o .csv.</p>
          </div>
        </div>
        <div className="flex gap-3">
          <Calculator size={20} className="mt-0.5 shrink-0 text-emerald-500" />
          <div>
            <p className="text-sm font-semibold text-slate-900 dark:text-white">Precio y coste estimados</p>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Precio = Ventas / Unidades. Coste = (Ventas - Margen) / Unidades.</p>
          </div>
        </div>
        <div className="flex gap-3">
          <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-emerald-500" />
          <div>
            <p className="text-sm font-semibold text-slate-900 dark:text-white">Actualización idempotente</p>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Repetir un SKU y fecha actualiza esa combinación sin duplicarla.</p>
          </div>
        </div>
      </div>
    </section>

    <section>
      <div className="mb-3 flex items-center gap-2">
        <FileSpreadsheet size={20} className="text-brand-blue dark:text-brand-cyan" />
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Columnas reconocidas</h2>
      </div>
      <ColumnTable />
      <div className="mt-3 flex items-start gap-2 border-l-2 border-brand-blue dark:border-brand-cyan bg-brand-blue/5 dark:bg-brand-cyan/5 px-3 py-2 text-sm text-slate-700 dark:text-slate-300">
        <Info size={17} className="mt-0.5 shrink-0 text-brand-blue dark:text-brand-cyan" />
        El catálogo se crea y actualiza automáticamente usando ArticuloPK como SKU. No necesitas cargar costes, precios ni inventario para comenzar.
      </div>
    </section>

    <section className="grid gap-6 border-t border-slate-200 dark:border-slate-800 pt-6 lg:grid-cols-2">
      <div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Formato aceptado</h2>
        <ul className="mt-3 space-y-2 text-sm text-slate-600 dark:text-slate-300">
          <li className="flex gap-2"><CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-500" />Excel <code>.xlsx</code> o CSV UTF-8.</li>
          <li className="flex gap-2"><CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-500" />Fechas Excel o formatos YYYY-MM-DD y DD/MM/YYYY.</li>
          <li className="flex gap-2"><CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-500" />Importes con coma o punto decimal y porcentajes como 24,5%, 24,5 o 0,245.</li>
          <li className="flex gap-2"><CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-500" />Máximo: 20 MB, 100.000 filas y 64 columnas.</li>
          <li className="flex gap-2"><CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-500" />EAN y ArticuloPK deben mantenerse como texto cuando puedan contener ceros iniciales.</li>
        </ul>
      </div>
      <div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Primera carga y cargas diarias</h2>
        <ul className="mt-3 space-y-2 text-sm text-slate-600 dark:text-slate-300">
          <li className="flex gap-2"><AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-500" />En la primera carga, activa “Sustituir los datos actuales” para retirar la demo.</li>
          <li className="flex gap-2"><AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-500" />Valida siempre el archivo antes de habilitar la carga.</li>
          <li className="flex gap-2"><AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-500" />Puedes subir todo el periodo fiscal o solo las fechas actualizadas.</li>
          <li className="flex gap-2"><AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-500" />Solo se sustituyen las combinaciones ArticuloPK + Fecha incluidas en el archivo.</li>
        </ul>
      </div>
    </section>

    <section className="border-t border-slate-200 dark:border-slate-800 pt-5">
      <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Inventario pendiente</h2>
      <p className="mt-2 max-w-4xl text-sm text-slate-600 dark:text-slate-300">
        Mientras no exista una fuente de inventario, la aplicación calcula ABC con las ventas en euros y muestra XYZ como no disponible. No genera stock, valor de inventario, cobertura ni alertas ficticias. Cuando llegue el archivo de inventario podrá vincularse por ArticuloPK/SKU.
      </p>
    </section>
  </div>
);
