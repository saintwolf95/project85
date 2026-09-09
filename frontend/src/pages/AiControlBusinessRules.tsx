import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { createBusinessRule, deleteBusinessRule, getBusinessRules, updateBusinessRule } from '../services/api';
import type { BusinessRuleRecord } from '../services/api';

const today = new Date().toISOString().slice(0, 10);
const empty = { clave: 'lead_time_dias', ambito_tipo: 'familia', ambito_id: '', valor_num: '', valor_texto: '', valor_json: '', vigente_desde: today, vigente_hasta: '' };

export const AiControlBusinessRules = () => {
  const [rules, setRules] = useState<BusinessRuleRecord[]>([]);
  const [form, setForm] = useState(empty);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const load = () => getBusinessRules().then((response) => setRules(response.items)).catch(() => setError('No se pudieron cargar las reglas.')).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);
  const update = (key: keyof typeof empty, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const payload = () => ({
    clave: form.clave, ambito_tipo: form.ambito_tipo, ambito_id: form.ambito_id || null,
    valor_num: form.valor_num === '' ? null : Number(form.valor_num), valor_texto: form.valor_texto || null,
    valor_json: form.valor_json || null, vigente_desde: form.vigente_desde, vigente_hasta: form.vigente_hasta || null,
  });
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setError(null);
    try {
      if (editingId) await updateBusinessRule(editingId, payload()); else await createBusinessRule(payload());
      setForm(empty); setEditingId(null); load();
    } catch { setError('No se pudo guardar la regla. Revisa el valor, ámbito y vigencia.'); }
  };
  const edit = (rule: BusinessRuleRecord) => {
    setEditingId(rule.id);
    setForm({ clave: rule.clave, ambito_tipo: rule.ambito_tipo, ambito_id: rule.ambito_id || '', valor_num: rule.valor_num?.toString() || '', valor_texto: rule.valor_texto || '', valor_json: rule.valor_json || '', vigente_desde: rule.vigente_desde, vigente_hasta: rule.vigente_hasta || '' });
  };
  const isDetectorThreshold = form.clave === 'umbral_detector';
  return (
    <div className="control-apple min-h-screen flex-1 overflow-auto bg-[#f5f5f7] p-4 dark:bg-brand-dark md:p-8">
      <div className="mx-auto max-w-5xl">
        <Link to="/ai-control" className="mb-5 inline-flex items-center gap-2 text-[13px] font-medium text-[#0071e3]"><ArrowLeft size={15} />Volver a Control IA</Link>
        <header className="rounded-[20px] bg-white p-6 shadow-sm dark:bg-slate-900"><p className="text-[13px] font-medium text-[#0071e3]">Administración</p><h1 className="mt-2 text-[30px] font-semibold tracking-[-0.03em] text-[#1d1d1f] dark:text-white">Reglas de negocio</h1><p className="mt-2 text-[14px] text-[#6e6e73]">Los detectores aplican estas reglas con cascada SKU → familia → empresa y citan el origen en su evidencia.</p></header>
        <section className="mt-5 rounded-[20px] bg-white p-6 shadow-sm dark:bg-slate-900"><h2 className="text-[17px] font-semibold text-[#1d1d1f] dark:text-white">{editingId ? 'Editar regla' : 'Nueva regla'}</h2>
          <form onSubmit={submit} className="mt-4 grid gap-3 md:grid-cols-3">
            <select value={form.clave} onChange={(event) => setForm((current) => ({ ...current, clave: event.target.value, ambito_tipo: event.target.value === 'umbral_detector' ? 'empresa' : event.target.value === 'familia_estacional' ? 'familia' : current.ambito_tipo }))} className="rounded-[10px] border border-black/[0.12] bg-white p-2.5 text-[13px] dark:bg-slate-800"><option value="lead_time_dias">Lead time (días)</option><option value="margen_objetivo_pct">Margen objetivo (%)</option><option value="cliente_estrategico">Cliente estratégico</option><option value="sku_discontinuado">SKU discontinuado</option><option value="familia_estacional">Familia estacional</option><option value="umbral_detector">Umbral de detector</option></select>
            <select value={isDetectorThreshold ? 'empresa' : form.ambito_tipo} onChange={(event) => update('ambito_tipo', event.target.value)} disabled={isDetectorThreshold} className="rounded-[10px] border border-black/[0.12] bg-white p-2.5 text-[13px] disabled:opacity-60 dark:bg-slate-800"><option value="empresa">Empresa</option><option value="familia">Familia</option><option value="sku">SKU</option><option value="cliente">Cliente</option><option value="comercial">Comercial</option></select>
            <input value={form.ambito_id} onChange={(event) => update('ambito_id', event.target.value)} placeholder={isDetectorThreshold ? 'Detector (opcional)' : 'Identificador del ámbito'} disabled={form.ambito_tipo === 'empresa' && !isDetectorThreshold} className="rounded-[10px] border border-black/[0.12] p-2.5 text-[13px] dark:bg-slate-800" />
            <input type="number" value={form.valor_num} onChange={(event) => update('valor_num', event.target.value)} placeholder="Valor numérico" className="rounded-[10px] border border-black/[0.12] p-2.5 text-[13px] dark:bg-slate-800" /><input value={form.valor_texto} onChange={(event) => update('valor_texto', event.target.value)} placeholder="Valor texto (true / false)" className="rounded-[10px] border border-black/[0.12] p-2.5 text-[13px] dark:bg-slate-800" /><input value={form.valor_json} onChange={(event) => update('valor_json', event.target.value)} placeholder="JSON (p. ej. [1,2,3])" className="rounded-[10px] border border-black/[0.12] p-2.5 text-[13px] dark:bg-slate-800" />
            <input type="date" value={form.vigente_desde} onChange={(event) => update('vigente_desde', event.target.value)} className="rounded-[10px] border border-black/[0.12] p-2.5 text-[13px] dark:bg-slate-800" /><input type="date" value={form.vigente_hasta} onChange={(event) => update('vigente_hasta', event.target.value)} className="rounded-[10px] border border-black/[0.12] p-2.5 text-[13px] dark:bg-slate-800" />
            <div className="flex gap-2"><button className="inline-flex flex-1 items-center justify-center gap-2 rounded-[10px] bg-[#0071e3] px-3 py-2.5 text-[13px] font-medium text-white"><Plus size={15} />{editingId ? 'Actualizar' : 'Guardar regla'}</button>{editingId && <button type="button" onClick={() => { setForm(empty); setEditingId(null); }} className="rounded-[10px] border border-black/[0.12] px-3 text-[13px]">Cancelar</button>}</div>
          </form>{error && <p className="mt-3 text-[13px] text-red-600">{error}</p>}
        </section>
        <section className="mt-5 overflow-x-auto rounded-[20px] bg-white shadow-sm dark:bg-slate-900">{loading ? <Loader2 className="m-8 animate-spin" /> : <table className="w-full text-left text-[13px]"><thead className="border-b border-black/[0.08] text-[#6e6e73]"><tr><th className="p-4">Clave</th><th className="p-4">Ámbito</th><th className="p-4">Valor</th><th className="p-4">Vigencia</th><th className="p-4" /></tr></thead><tbody>{rules.map((rule) => <tr key={rule.id} className="border-b border-black/[0.06] dark:border-slate-800"><td className="p-4 font-medium">{rule.clave}</td><td className="p-4">{rule.ambito_tipo}{rule.ambito_id ? ` · ${rule.ambito_id}` : ''}</td><td className="p-4">{rule.valor_num ?? rule.valor_texto ?? rule.valor_json}</td><td className="p-4">{rule.vigente_desde}{rule.vigente_hasta ? ` — ${rule.vigente_hasta}` : ' — vigente'}</td><td className="flex gap-1 p-4"><button onClick={() => edit(rule)} className="rounded-[8px] p-2 text-[#0071e3] hover:bg-blue-50" aria-label="Editar regla"><Pencil size={15} /></button><button onClick={() => deleteBusinessRule(rule.id).then(load).catch(() => setError('No se pudo eliminar la regla.'))} className="rounded-[8px] p-2 text-red-600 hover:bg-red-50" aria-label="Eliminar regla"><Trash2 size={15} /></button></td></tr>)}</tbody></table>}</section>
      </div>
    </div>
  );
};
