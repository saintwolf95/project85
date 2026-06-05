import { X } from 'lucide-react';
import type { ProductMetrics } from '../services/api';
import { formatEUR } from '../utils/formatters';

interface ProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  products: ProductMetrics[];
}

export const ProductModal = ({ isOpen, onClose, title, description, products }: ProductModalProps) => {
  if (!isOpen) return null;

  const totalVentas = products.reduce((acc, p) => acc + p.ventas_60d, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/40 dark:bg-brand-dark/80 backdrop-blur-sm transition-opacity duration-300"
        onClick={onClose}
      ></div>

      {/* Modal Window */}
      <div className="relative bg-white dark:bg-brand-surface border border-slate-200 dark:border-brand-cyan/30 rounded-xl shadow-2xl dark:shadow-[0_0_30px_rgba(0,245,255,0.15)] w-full max-w-4xl max-h-[85vh] flex flex-col animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h2 className="title-corporate flex items-center gap-3">
              {title}
              <span className="bg-brand-blue/10 dark:bg-brand-cyan/20 text-brand-blue dark:text-brand-cyan text-sm py-1 px-3 rounded-full font-sans shadow-none dark:shadow-[0_0_10px_var(--color-brand-cyan)]">
                {products.length} ítems
              </span>
            </h2>
            <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm">
              {description || 'Detalle interactivo del segmento seleccionado.'}
            </p>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {/* Body (Scrollable Table) */}
        <div className="p-6 overflow-y-auto custom-scrollbar">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50 dark:bg-slate-900 sticky top-0 z-10">
              <tr>
                <th className="px-4 py-3 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider w-10">#</th>
                <th className="px-4 py-3 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">CodArt</th>
                <th className="px-4 py-3 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Nombre</th>
                <th className="px-4 py-3 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Marca</th>
                <th className="px-4 py-3 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">Precio</th>
                <th className="px-4 py-3 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">Ventas (60D)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
              {products.map((p, index) => (
                <tr key={p.cod_art} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                  <td className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400 font-medium">{index + 1}</td>
                  <td className="px-4 py-3 text-sm text-slate-800 dark:text-slate-300 font-medium">{p.cod_art}</td>
                  <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400 max-w-[250px] truncate" title={p.nombre_art}>{p.nombre_art}</td>
                  <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">{p.marca}</td>
                  <td className="px-4 py-3 text-sm text-slate-800 dark:text-slate-300 text-right">{formatEUR(p.precio_unit)}</td>
                  <td className="px-4 py-3 text-sm text-brand-blue dark:text-brand-cyan text-right font-medium">{formatEUR(p.ventas_60d)}</td>
                </tr>
              ))}
              {products.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">No hay productos en esta selección.</td>
                </tr>
              )}
            </tbody>
            <tfoot className="bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 sticky bottom-0 z-10 font-bold">
              <tr>
                <td colSpan={5} className="px-4 py-4 text-right text-slate-700 dark:text-white">TOTAL VENTAS (60D) - {products.length} SKUs</td>
                <td className="px-4 py-4 text-sm text-brand-blue dark:text-brand-cyan text-right">{formatEUR(totalVentas)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
};
