import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Mail, Plus, Trash2 } from 'lucide-react';
import { createAgentNotificationRecipient, deleteAgentNotificationRecipient, getAgentNotificationProductManagers, getAgentNotificationRecipients } from '../services/api';
import type { AgentNotificationRecipient } from '../services/api';

const empty = { product_manager: '', nombre: '', email: '', activo: true };

export const AiControlNotifications = () => {
  const [items, setItems] = useState<AgentNotificationRecipient[]>([]);
  const [managers, setManagers] = useState<string[]>([]);
  const [form, setForm] = useState(empty);
  const [error, setError] = useState('');
  const load = () => Promise.all([getAgentNotificationRecipients(), getAgentNotificationProductManagers()]).then(([recipients, options]) => { setItems(recipients.items); setManagers(options.items); }).catch(() => setError('No se pudo cargar la configuración de avisos.'));
  useEffect(() => { load(); }, []);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setError('');
    try { await createAgentNotificationRecipient({ ...form, product_manager: form.product_manager || null }); setForm(empty); load(); }
    catch { setError('No se pudo guardar el destinatario. Comprueba el correo y que no esté duplicado.'); }
  };
  return <div className="control-apple min-h-screen flex-1 overflow-auto bg-[#f5f5f7] p-4 dark:bg-brand-dark md:p-8"><div className="mx-auto max-w-5xl">
    <Link to="/ai-control/oficina" className="mb-5 inline-flex items-center gap-2 text-[13px] font-medium text-[#0071e3]"><ArrowLeft size={15} />Volver a Oficina Viva</Link>
    <header className="rounded-[20px] bg-white p-6 shadow-sm dark:bg-slate-900"><p className="text-[13px] font-medium text-[#0071e3]">Administración</p><h1 className="mt-2 text-[30px] font-semibold tracking-[-0.03em] text-[#1d1d1f] dark:text-white">Avisos a Product Manager</h1><p className="mt-2 text-[14px] text-[#6e6e73]">Define quién recibe los avisos manuales desde Oficina Viva. Un destinatario sin cartera recibe los avisos de todos los PM.</p></header>
    <section className="mt-5 rounded-[20px] bg-white p-6 shadow-sm dark:bg-slate-900"><h2 className="text-[17px] font-semibold text-[#1d1d1f] dark:text-white">Nuevo destinatario</h2><form onSubmit={submit} className="mt-4 grid gap-3 md:grid-cols-2"><input list="notification-pms" value={form.product_manager} onChange={event => setForm(current => ({ ...current, product_manager: event.target.value }))} placeholder="Cartera PM (vacío = todos)" className="rounded-[10px] border border-black/[0.12] p-2.5 text-[13px] dark:bg-slate-800" /><datalist id="notification-pms">{managers.map(manager => <option key={manager} value={manager} />)}</datalist><input value={form.nombre} onChange={event => setForm(current => ({ ...current, nombre: event.target.value }))} placeholder="Nombre" required className="rounded-[10px] border border-black/[0.12] p-2.5 text-[13px] dark:bg-slate-800" /><input type="email" value={form.email} onChange={event => setForm(current => ({ ...current, email: event.target.value }))} placeholder="correo@empresa.com" required className="rounded-[10px] border border-black/[0.12] p-2.5 text-[13px] dark:bg-slate-800" /><button className="inline-flex items-center justify-center gap-2 rounded-[10px] bg-[#0071e3] px-3 py-2.5 text-[13px] font-medium text-white"><Plus size={15} />Guardar destinatario</button></form>{error && <p className="mt-3 text-[13px] text-red-600">{error}</p>}</section>
    <section className="mt-5 overflow-x-auto rounded-[20px] bg-white shadow-sm dark:bg-slate-900"><table className="w-full text-left text-[13px]"><thead className="border-b border-black/[0.08] text-[#6e6e73]"><tr><th className="p-4">Cartera</th><th className="p-4">Destinatario</th><th className="p-4">Correo</th><th className="p-4" /></tr></thead><tbody>{items.map(item => <tr key={item.id} className="border-b border-black/[0.06] dark:border-slate-800"><td className="p-4">{item.product_manager || 'Todos los PM'}</td><td className="p-4 font-medium">{item.nombre}</td><td className="p-4"><span className="inline-flex items-center gap-2"><Mail size={14} />{item.email}</span></td><td className="p-4"><button onClick={() => deleteAgentNotificationRecipient(item.id).then(load).catch(() => setError('No se pudo eliminar el destinatario.'))} className="rounded-[8px] p-2 text-red-600 hover:bg-red-50" aria-label="Eliminar destinatario"><Trash2 size={15} /></button></td></tr>)}{!items.length && <tr><td className="p-5 text-[#6e6e73]" colSpan={4}>Aún no hay destinatarios configurados.</td></tr>}</tbody></table></section>
  </div></div>;
};
