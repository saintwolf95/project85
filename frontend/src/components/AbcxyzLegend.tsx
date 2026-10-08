import { quadrantGuide } from '../content/abcxyz';

export const AbcxyzLegend = ({ inventoryAvailable = true }: { inventoryAvailable?: boolean }) => (
  <div className="mt-4 text-[12px] leading-5 text-slate-600 dark:text-slate-300">
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="rounded-xl bg-[#f5f5f7] p-3 dark:bg-slate-800/70">
        <p className="font-semibold text-[#1d1d1f] dark:text-white">ABC · contribución a ventas de los últimos 90 días</p>
        <p className="mt-1">A: primer 80 % · B: siguiente 15 % · C: 5 % restante.</p>
      </div>
      <div className="rounded-xl bg-[#f5f5f7] p-3 dark:bg-slate-800/70">
        <p className="font-semibold text-[#1d1d1f] dark:text-white">XYZ · concentración del valor de inventario actual</p>
        <p className="mt-1">{inventoryAvailable ? 'X: primer 80 % · Y: siguiente 15 % · Z: 5 % restante.' : 'Sin inventario real: XYZ no disponible.'}</p>
      </div>
    </div>
    <p className="mt-2">Son tramos acumulados del total, ordenados de mayor a menor valor; no porcentajes de cada artículo ni del número de SKU. Los cortes pueden dar repartos aproximados.</p>
    <details className="mt-3 rounded-xl border border-black/[0.08] p-3 dark:border-slate-700">
      <summary className="cursor-pointer font-medium text-[#0071e3] focus-visible:outline-2 focus-visible:outline-offset-4 dark:text-brand-cyan">Cómo leer las letras y los colores</summary>
      <div className="mt-3 space-y-3">
        <p>B e Y abarcan del 80 % al 95 % acumulado; C y Z, el resto. Los artículos sin ventas son C; sin snapshot de inventario, XYZ es N/D.</p>
        <p>X significa mayor concentración de dinero en stock. En esta app XYZ no mide estabilidad de demanda. AX requiere atención estratégica, pero no indica por sí mismo un resultado bueno o malo.</p>
        <p>El color identifica el foco de gestión y se mantiene al cambiar entre euros y SKU. No representa una alerta de rotura o exceso confirmada.</p>
        <dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(quadrantGuide).map(([code, guide]) => (
            <div key={code} className={`rounded-lg p-3 ${guide.tone}`}>
              <dt className="font-semibold text-[#1d1d1f] dark:text-white">{code} · {guide.label}</dt>
              <dd className="mt-1">{guide.description}</dd>
            </div>
          ))}
        </dl>
      </div>
    </details>
  </div>
);
