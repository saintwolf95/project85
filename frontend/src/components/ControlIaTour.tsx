import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { updateOnboardingProgress } from '../services/api';

type TourStep = { target: string; title: string; body: React.ReactNode };

const steps: TourStep[] = [
  { target: 'control-header', title: 'Un equipo de analistas que trabaja de noche', body: <><p>Cada madrugada, tres analistas revisan tus datos de ventas, inventario y finanzas, y un cuarto pone en común lo que encontraron.</p><p>No es un cuadro de mando. Un cuadro de mando te enseña números y tú buscas el problema. Aquí el problema te busca a ti.</p><p>Tu trabajo aquí son cinco minutos al día: decidir qué merece atención y qué no.</p></> },
  { target: 'today-episodes', title: 'Esto es un episodio, no una alerta', body: <><p>Un episodio es <strong>un hecho de negocio</strong>, aunque lo hayan detectado varios analistas por separado.</p><p>Si las ventas de una familia caen y a la vez uno de sus productos estrella estuvo sin stock, no son dos avisos: es uno solo, con la causa dentro.</p><p>Ábrelo y verás la cadena completa: qué pasó, qué lo explica y en qué se apoya cada afirmación.</p></> },
  { target: 'today-impactos', title: 'Los euros no son todos iguales', body: <><p>Verás tres etiquetas junto a cada importe:</p><p><strong>Realizado</strong> — dinero que ya se ha perdido o se ha dejado de ganar. Ya pasó.</p><p><strong>En riesgo</strong> — dinero que se perderá si no haces nada. Todavía se puede evitar.</p><p><strong>Capital</strong> — dinero que no está perdido, está inmovilizado en almacén.</p><p>No los sumes entre sí y no los compares directamente. Un euro en riesgo se puede salvar; uno realizado, no.</p></> },
  { target: 'today-episodes', title: 'Aquí decides tú', body: <><p>Cada episodio te pide una de tres cosas:</p><p><strong>Descartar</strong> cuando ya lo sabes, no es cierto o no se puede hacer nada. Te pedirá el motivo, y es importante: es así como el sistema deja de repetirte lo que no te sirve. Lo que descartas como falso no vuelve en 30 días.</p><p><strong>Investigar</strong> cuando quieres saber por qué. El analista abre un expediente con evidencia y descarta hipótesis alternativas. Cada cifra del informe está verificada contra los datos; si no cuadra, no se publica.</p><p><strong>Crear decisión</strong> cuando ya sabes qué hacer. Anotas responsable, qué métrica quieres mover y para cuándo.</p></> },
  { target: 'today-decisions', title: 'Sin esto, esto no sirve para nada', body: <><p>Una decisión registrada es lo único que convierte un aviso en un resultado.</p><p>Aquí ves qué se decidió, quién lo lleva, qué métrica debía moverse y si se movió.</p><p>Es también lo que permite responder a la única pregunta que importa: de todo lo que este sistema señaló, ¿cuánto se recuperó de verdad?</p></> },
  { target: 'today-quality', title: 'El sistema te dice cuándo no fiarte', body: <><p>Antes que nada, se comprueba la calidad de los datos. Si falta el coste de un producto, si hay ventas sin cliente asignado o si el inventario no está actualizado, lo verás marcado.</p><p>Cuando un análisis se apoya en datos flojos, aparece señalado como evidencia degradada.</p><p>Preferimos decirte que hoy no podemos responder algo antes que darte una cifra que no se sostiene.</p></> },
];

const rectFor = (target: string) => document.getElementById(target)?.getBoundingClientRect();

export const ControlIaTour = ({ onClose, onComplete }: { onClose: () => void; onComplete: () => void }) => {
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<DOMRect | undefined>(() => rectFor(steps[0].target));
  const dialogRef = useRef<HTMLDivElement>(null);
  const current = steps[step];
  const isLast = step === steps.length - 1;
  useEffect(() => {
    const update = () => setRect(rectFor(current.target));
    update(); window.addEventListener('resize', update); window.addEventListener('scroll', update, true);
    dialogRef.current?.focus();
    return () => { window.removeEventListener('resize', update); window.removeEventListener('scroll', update, true); };
  }, [current.target]);
  useEffect(() => { void updateOnboardingProgress('control_ia_tour', { estado: 'pendiente', paso_ultimo: 1, evento: 'inicio' }); }, []);
  const move = (next: number) => {
    setStep(next);
    void updateOnboardingProgress('control_ia_tour', { estado: 'pendiente', paso_ultimo: next + 1, evento: 'paso' });
  };
  const close = (state: 'saltado' | 'completado') => {
    void updateOnboardingProgress('control_ia_tour', { estado: state, paso_ultimo: state === 'completado' ? steps.length : step + 1, evento: state === 'completado' ? 'finalizacion' : 'abandono' });
    if (state === 'completado') onComplete(); else onClose();
  };
  useEffect(() => {
    const keyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { close('saltado'); return; }
      if (event.key !== 'Tab') return;
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled])');
      if (!focusable?.length) return;
      const first = focusable[0]; const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', keyDown);
    return () => document.removeEventListener('keydown', keyDown);
  });
  const spotlight = rect ? { top: Math.max(8, rect.top - 8), left: Math.max(8, rect.left - 8), width: rect.width + 16, height: rect.height + 16 } : undefined;
  return <div className="fixed inset-0 z-[70]" aria-hidden="false">
    <div className="hidden md:block fixed rounded-[16px] border-2 border-[#0071e3] transition-all duration-200 motion-reduce:transition-none" style={spotlight ? { ...spotlight, boxShadow: '0 0 0 9999px rgba(0,0,0,.52)' } : { inset: 0, background: 'rgba(0,0,0,.52)' }} />
    <div className="fixed inset-0 bg-black/55 md:hidden" />
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-live="polite" aria-label={`Paso ${step + 1} de ${steps.length}: ${current.title}`} tabIndex={-1} className="fixed inset-x-3 bottom-3 z-[71] rounded-[20px] bg-white p-5 shadow-2xl outline-none dark:bg-slate-900 md:inset-x-auto md:bottom-8 md:right-8 md:w-[420px]">
      <div className="flex items-start justify-between gap-4"><div><p className="text-[12px] font-medium text-[#0071e3]">Paso {step + 1} de {steps.length}</p><h2 className="mt-1 text-[21px] font-semibold tracking-[-.02em] text-[#1d1d1f] dark:text-white">{current.title}</h2></div><button type="button" onClick={() => close('saltado')} className="rounded-full p-2 text-[#6e6e73] hover:bg-[#f5f5f7] focus-visible:ring-2 focus-visible:ring-[#0071e3] dark:hover:bg-slate-800" aria-label="Saltar recorrido"><X size={18} /></button></div>
      <div className="mt-4 space-y-3 text-[14px] leading-6 text-[#424245] dark:text-slate-300">{current.body}</div>
      <div className="mt-6 flex items-center justify-between gap-3"><button type="button" onClick={() => close('saltado')} className="text-[13px] font-medium text-[#6e6e73] hover:text-[#1d1d1f] focus-visible:ring-2 focus-visible:ring-[#0071e3] dark:hover:text-white">Saltar</button><div className="flex gap-2"><button type="button" disabled={step === 0} onClick={() => move(step - 1)} className="rounded-[10px] px-3 py-2 text-[13px] font-medium text-[#424245] hover:bg-[#f5f5f7] disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-[#0071e3] dark:text-slate-200 dark:hover:bg-slate-800">Anterior</button><button type="button" onClick={() => isLast ? close('completado') : move(step + 1)} className="rounded-[10px] bg-[#0071e3] px-4 py-2 text-[13px] font-medium text-white hover:bg-[#0077ed] focus-visible:ring-2 focus-visible:ring-[#0071e3]">{isLast ? 'Empezar' : 'Siguiente'}</button></div></div>
    </div>
  </div>;
};
