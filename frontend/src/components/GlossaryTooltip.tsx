import { useId, useState } from 'react';
import { Info } from 'lucide-react';
import { GLOSARIO } from '../content/glosario';
import type { GlossaryKey } from '../content/glosario';

export const GlossaryTooltip = ({ term }: { term: GlossaryKey }) => {
  const [open, setOpen] = useState(false);
  const tooltipId = useId();
  const item = GLOSARIO[term];
  return <span className="relative inline-flex align-middle">
    <button
      type="button"
      aria-label={`Definición de ${item.termino}`}
      aria-describedby={open ? tooltipId : undefined}
      aria-expanded={open}
      onClick={() => setOpen((current) => !current)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      className="ml-1 inline-flex rounded-full p-0.5 text-[#6e6e73] outline-none focus-visible:ring-2 focus-visible:ring-[#0071e3] dark:text-slate-400"
    ><Info size={13} aria-hidden="true" /></button>
    {open && <span id={tooltipId} role="tooltip" className="absolute left-0 top-full z-30 mt-2 w-64 rounded-[10px] bg-[#1d1d1f] px-3 py-2 text-left text-[12px] font-normal leading-5 text-white shadow-lg dark:bg-white dark:text-[#1d1d1f]">{item.definicion}</span>}
  </span>;
};
