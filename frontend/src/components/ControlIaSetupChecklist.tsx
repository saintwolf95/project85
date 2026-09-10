import { useEffect, useState } from 'react';
import { ChevronDown, CheckCircle2, Circle, ExternalLink, LockKeyhole } from 'lucide-react';
import { Link } from 'react-router-dom';
import { getControlIaSetup, updateOnboardingProgress } from '../services/api';
import type { ControlIaSetupItem } from '../services/api';

export const ControlIaSetupChecklist = () => {
  const [open, setOpen] = useState(true);
  const [items, setItems] = useState<ControlIaSetupItem[]>([]);
  const [blockingComplete, setBlockingComplete] = useState(true);
  useEffect(() => {
    getControlIaSetup().then((data) => { setItems(data.items); setBlockingComplete(data.bloqueantes_completados); }).catch(() => undefined);
  }, []);
  const completed = items.filter((item) => item.completado).length;
  useEffect(() => {
    if (items.length && items.filter((item) => item.id !== 'weekly_summary').every((item) => item.completado)) {
      void updateOnboardingProgress('control_ia_setup', { estado: 'completado', paso_ultimo: 8, evento: 'elemento_completado', detalle: 'puesta_en_marcha_completada' });
    }
  }, [items]);
  if (!items.length) return null;
  return <section id="puesta-en-marcha" className="mb-6 rounded-[20px] border border-black/[0.08] bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
    <button type="button" onClick={() => setOpen((current) => !current)} aria-expanded={open} className="flex w-full items-center justify-between gap-4 p-5 text-left focus-visible:ring-2 focus-visible:ring-[#0071e3]"><div><p className="text-[13px] font-medium text-[#0071e3]">Puesta en marcha</p><h2 className="mt-1 text-[18px] font-semibold text-[#1d1d1f] dark:text-white">Prepara el sistema para que pueda fiarse de tus datos</h2><p className="mt-1 text-[13px] text-[#6e6e73]">{completed} de {items.length} pasos completados.</p></div><ChevronDown className={`text-[#0071e3] transition-transform ${open ? 'rotate-180' : ''}`} size={20} /></button>
    {!blockingComplete && <div className="mx-5 mb-4 flex gap-3 rounded-[12px] border border-amber-200 bg-amber-50 p-4 text-[13px] text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200"><LockKeyhole className="mt-0.5 shrink-0" size={16} />Parte de los análisis no se puede fiar todavía. Completa los tres pasos bloqueantes antes de interpretar coberturas y objetivos como definitivos.</div>}
    {open && <ol className="border-t border-black/[0.08] px-5 py-2 dark:border-slate-800">{items.map((item, index) => <li key={item.id} className="flex gap-3 border-b border-black/[0.06] py-4 last:border-0 dark:border-slate-800"><div className="pt-0.5">{item.completado ? <CheckCircle2 className="text-emerald-600 dark:text-emerald-400" size={19} /> : <Circle className="text-[#86868b]" size={19} />}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="text-[14px] font-medium text-[#1d1d1f] dark:text-white">{index + 1}. {item.texto}</p>{item.bloqueante && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-500/15 dark:text-amber-200">Bloqueante</span>}{item.disponible === false && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">Aún no disponible</span>}</div>{item.disponible === false ? <p className="mt-2 text-[12px] text-[#6e6e73]">Esta automatización no está disponible todavía; no se marca como completada de forma manual.</p> : !item.completado && <Link to={item.destino} className="mt-2 inline-flex items-center gap-1 text-[13px] font-medium text-[#0071e3] hover:underline dark:text-brand-cyan">Ir a configurarlo <ExternalLink size={13} /></Link>}</div></li>)}</ol>}
  </section>;
};
