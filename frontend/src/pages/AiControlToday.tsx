import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, CheckCircle2, ClipboardList, Lightbulb, Loader2, MessageSquare, ShieldAlert, TrendingDown, XCircle } from 'lucide-react';
import {
  createAgentFeedback,
  createAgentDecision,
  discardAgentSignal,
  getAgentDecisions,
  getAgentEpisode,
  getAgentEpisodes,
  getAgentQuality,
  getAgentSignal,
  updateAgentDecision,
} from '../services/api';
import type { AgentDecisionRecord, AgentEpisodeRecord, AgentQualityMetric, AgentSignalRecord, ImpactType } from '../services/api';
import { GlossaryTooltip } from '../components/GlossaryTooltip';

const currency = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const dateTime = new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium', timeStyle: 'short' });

const impactLabel: Record<ImpactType, string> = { realizado: 'Realizado', en_riesgo: 'En riesgo', capital: 'Capital inmovilizado' };
const impactClass: Record<ImpactType, string> = {
  realizado: 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300',
  en_riesgo: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300',
  capital: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
};

const AppShell = ({ children }: { children: React.ReactNode }) => (
  <div className="control-apple min-h-screen flex-1 overflow-auto bg-[#f5f5f7] p-4 dark:bg-brand-dark md:p-8">
    <div className="mx-auto max-w-[1440px]">{children}</div>
  </div>
);

const Navigation = ({ current }: { current: 'today' | 'decisions' }) => (
  <nav className="mb-6 flex flex-wrap items-center gap-2 rounded-[14px] bg-white p-2 dark:bg-slate-900" aria-label="Navegación de Control IA">
    <Link to="/ai-control" className={`min-h-9 rounded-[10px] px-3 py-2 text-[13px] font-medium ${current === 'today' ? 'bg-[#0071e3] text-white' : 'text-[#6e6e73] hover:bg-[#f5f5f7] dark:text-slate-300 dark:hover:bg-slate-800'}`}>Hoy</Link>
    <Link to="/ai-control/decisiones" className={`min-h-9 rounded-[10px] px-3 py-2 text-[13px] font-medium ${current === 'decisions' ? 'bg-[#0071e3] text-white' : 'text-[#6e6e73] hover:bg-[#f5f5f7] dark:text-slate-300 dark:hover:bg-slate-800'}`}>Decisiones</Link>
    <Link to="/ai-control/reglas" className="min-h-9 rounded-[10px] px-3 py-2 text-[13px] font-medium text-[#0071e3] hover:bg-[#0071e3]/10 dark:text-brand-cyan">Reglas</Link><Link to="/ai-control/analistas" className="ml-auto min-h-9 rounded-[10px] bg-[#f5f5f7] px-3 py-2 text-[13px] font-medium text-[#0071e3] transition-colors hover:bg-[#0071e3]/10 dark:bg-slate-800 dark:text-brand-cyan">Gabinete de analistas <ArrowRight className="ml-1 inline" size={14} /></Link>
  </nav>
);

const Metric = ({ label, value, tone = 'neutral', glossary }: { label: string; value: number; tone?: 'neutral' | 'warning' | 'danger'; glossary?: 'impacto_realizado' | 'impacto_en_riesgo' | 'impacto_capital' }) => (
  <div className="rounded-[16px] border border-black/[0.08] bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
    <p className="flex items-center text-[12px] font-medium text-[#6e6e73] dark:text-slate-400">{label}{glossary && <GlossaryTooltip term={glossary} />}</p>
    <p className={`ai-tnum mt-2 text-[28px] font-semibold tracking-[-0.03em] ${tone === 'danger' ? 'text-red-600 dark:text-red-400' : tone === 'warning' ? 'text-amber-600 dark:text-amber-400' : 'text-[#1d1d1f] dark:text-white'}`}>{currency.format(value)}</p>
  </div>
);

export const AiControlToday = () => {
  const [episodes, setEpisodes] = useState<AgentEpisodeRecord[]>([]);
  const [quality, setQuality] = useState<AgentQualityMetric[]>([]);
  const [diff, setDiff] = useState<{ nuevos: number; empeoran: number; resueltos: number; disponible: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getAgentEpisodes(), getAgentQuality()])
      .then(([episodeResponse, qualityResponse]) => {
        setEpisodes(episodeResponse.items);
        setDiff(episodeResponse.diff_diario ?? null);
        setQuality(qualityResponse.por_detector);
      })
      .catch(() => setError('No se pudo cargar la bandeja de episodios.'))
      .finally(() => setLoading(false));
  }, []);

  const impacts = useMemo(() => episodes.reduce((total, episode) => ({
    realizado: total.realizado + episode.impactos.realizado_eur,
    riesgo: total.riesgo + episode.impactos.en_riesgo_eur,
    capital: total.capital + episode.impactos.capital_eur,
  }), { realizado: 0, riesgo: 0, capital: 0 }), [episodes]);
  const riskEpisodes = useMemo(() => episodes.filter((episode) => episode.senales.some((signal) => signal.naturaleza !== 'oportunidad')), [episodes]);
  const opportunityEpisodes = useMemo(() => episodes.filter((episode) => episode.senales.length > 0 && episode.senales.every((signal) => signal.naturaleza === 'oportunidad')), [episodes]);

  return <AppShell>
    <Navigation current="today" />
    <header className="mb-6 rounded-[24px] border border-black/[0.08] bg-white p-6 dark:border-slate-800 dark:bg-slate-900 md:p-8">
      <p className="text-[13px] font-medium text-[#0071e3] dark:text-brand-cyan">Control IA</p>
      <h1 className="mt-2 text-[32px] font-semibold tracking-[-0.03em] text-[#1d1d1f] dark:text-white">Prioridades de hoy</h1>
      <p className="mt-2 max-w-2xl text-[15px] text-[#6e6e73] dark:text-slate-400">Incidentes conectados por evidencia. Los importes realizados, en riesgo y de capital se mantienen separados.</p>
    </header>

    {loading ? <div className="flex min-h-64 items-center justify-center text-[#6e6e73]"><Loader2 className="mr-3 animate-spin" size={20} />Cargando episodios…</div> : error ? <div className="rounded-[14px] border border-red-200 bg-red-50 p-4 text-[14px] text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">{error}</div> : <>
      <section className="grid gap-4 md:grid-cols-3">
        <Metric label="Impacto realizado" value={impacts.realizado} tone="danger" glossary="impacto_realizado" />
        <Metric label="Ventas o margen en riesgo" value={impacts.riesgo} tone="warning" glossary="impacto_en_riesgo" />
        <Metric label="Capital inmovilizado" value={impacts.capital} glossary="impacto_capital" />
      </section>
      <section className="my-6 grid gap-3 md:grid-cols-3">
        {([
          ['Nuevos', diff?.nuevos ?? 0, Lightbulb],
          ['Empeoran', diff?.empeoran ?? 0, TrendingDown],
          ['Resueltos', diff?.resueltos ?? 0, CheckCircle2],
        ] as const).map(([label, value, Icon]) => <div key={label} className="flex items-center gap-3 rounded-[14px] bg-white px-5 py-4 dark:bg-slate-900"><Icon className="text-[#0071e3] dark:text-brand-cyan" size={18} /><div><p className="text-[12px] text-[#6e6e73]">{label} vs. ejecución anterior</p><p className="ai-tnum text-[20px] font-semibold text-[#1d1d1f] dark:text-white">{diff?.disponible ? value : '—'}</p></div></div>)}
      </section>

      <section className="rounded-[20px] border border-black/[0.08] bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-black/[0.08] p-5 dark:border-slate-800"><div><h2 className="flex items-center text-[18px] font-semibold text-[#1d1d1f] dark:text-white">Episodios abiertos<GlossaryTooltip term="episodio" /></h2><p className="mt-1 flex items-center text-[13px] text-[#6e6e73]">Ordenados por impacto ponderado, severidad y persistencia.<GlossaryTooltip term="factor_ponderacion" /></p></div><ShieldAlert className="text-[#0071e3] dark:text-brand-cyan" size={20} /></div>
        {episodes.length ? <div className="divide-y divide-black/[0.06] dark:divide-slate-800">{riskEpisodes.map((episode) => <Link key={episode.id} to={`/ai-control/episodio/${episode.id}`} className="block p-5 transition-colors hover:bg-[#f5f5f7] dark:hover:bg-slate-800/50"><div className="flex flex-col gap-3 md:flex-row md:items-center"><div className="min-w-0 flex-1"><p className="text-[15px] font-medium text-[#1d1d1f] dark:text-white">{episode.titulo}</p><p className="mt-1 flex items-center text-[12px] text-[#6e6e73]">Riesgo<GlossaryTooltip term="naturaleza" /> · Severidad {episode.severidad_max}<GlossaryTooltip term="severidad" /> · {episode.senales.length} señales · desde {dateTime.format(new Date(episode.primera_deteccion))}</p></div><div className="flex flex-wrap gap-2">{(['realizado', 'en_riesgo', 'capital'] as const).filter((type) => episode.impactos[`${type === 'en_riesgo' ? 'en_riesgo' : type}_eur` as keyof typeof episode.impactos] > 0).map((type) => <span key={type} className={`ai-tnum rounded-full px-2.5 py-1 text-[11px] font-medium ${impactClass[type]}`}>{impactLabel[type]} {currency.format(episode.impactos[`${type === 'en_riesgo' ? 'en_riesgo' : type}_eur` as keyof typeof episode.impactos])}</span>)}</div><ArrowRight className="hidden text-[#0071e3] md:block dark:text-brand-cyan" size={18} /></div></Link>)}{opportunityEpisodes.length > 0 && <><div className="border-y border-emerald-100 bg-emerald-50/60 px-5 py-3 text-[13px] font-medium text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">Oportunidades verificadas</div>{opportunityEpisodes.map((episode) => <Link key={episode.id} to={`/ai-control/episodio/${episode.id}`} className="block p-5 transition-colors hover:bg-emerald-50/40 dark:hover:bg-emerald-500/5"><p className="text-[15px] font-medium text-[#1d1d1f] dark:text-white">{episode.titulo}</p><p className="mt-1 text-[12px] text-emerald-700 dark:text-emerald-300">Oportunidad · {currency.format(episode.impactos.ponderado_eur)} priorizada</p></Link>)}</>}</div> : <div className="p-10 text-center text-[14px] text-[#6e6e73]">No hay episodios abiertos con la evidencia actual.</div>}
      </section>

      <section className="mt-6 rounded-[20px] bg-white p-5 dark:bg-slate-900"><h2 className="text-[16px] font-semibold text-[#1d1d1f] dark:text-white">Calidad de detectores</h2><div className="mt-4 overflow-x-auto"><table className="w-full text-left text-[12px]"><thead className="border-b border-black/[0.08] text-[#6e6e73] dark:border-slate-700"><tr><th className="px-2 py-3 font-medium">Detector</th><th className="px-2 py-3 font-medium">Emitidas</th><th className="px-2 py-3 font-medium">Feedback</th><th className="px-2 py-3 font-medium">Falsos positivos</th><th className="px-2 py-3 font-medium">Cobertura</th></tr></thead><tbody>{quality.map((item) => <tr key={item.detector} className="border-b border-black/[0.06] dark:border-slate-800"><td className="px-2 py-3 text-[#424245] dark:text-slate-300">{item.detector}</td><td className="ai-tnum px-2 py-3">{item.senales_emitidas}</td><td className="ai-tnum px-2 py-3">{item.feedback_registros}</td><td className="px-2 py-3">{item.conclusivo && typeof item.tasa_falso_positivo === 'number' ? `${(item.tasa_falso_positivo * 100).toFixed(1)} %` : 'No concluyente'}</td><td className="ai-tnum px-2 py-3">{currency.format(item.euros_cubiertos_decision)}</td></tr>)}</tbody></table></div></section>
    </>}
  </AppShell>;
};

export const AiControlEpisodeDetail = () => {
  const { id } = useParams(); const [episode, setEpisode] = useState<AgentEpisodeRecord | null>(null); const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (id) getAgentEpisode(Number(id)).then(setEpisode).catch(() => setError('No se encontró el episodio solicitado.')); }, [id]);
  return <AppShell><Link to="/ai-control" className="mb-5 inline-flex items-center gap-2 text-[13px] font-medium text-[#0071e3] dark:text-brand-cyan"><ArrowLeft size={15} />Volver a Hoy</Link>{error ? <p>{error}</p> : !episode ? <Loader2 className="animate-spin" /> : <><header className="rounded-[20px] bg-white p-6 dark:bg-slate-900"><p className="text-[12px] text-[#6e6e73]">Episodio #{episode.id}</p><h1 className="mt-2 text-[28px] font-semibold tracking-[-0.03em] text-[#1d1d1f] dark:text-white">{episode.titulo}</h1><div className="mt-4 flex flex-wrap gap-2">{(['realizado', 'en_riesgo', 'capital'] as const).map((type) => <span key={type} className={`rounded-full px-3 py-1 text-[12px] font-medium ${impactClass[type]}`}>{impactLabel[type]}: {currency.format(episode.impactos[`${type === 'en_riesgo' ? 'en_riesgo' : type}_eur` as keyof typeof episode.impactos])}</span>)}</div></header><section className="mt-5 rounded-[20px] bg-white p-6 dark:bg-slate-900"><h2 className="text-[17px] font-semibold text-[#1d1d1f] dark:text-white">Cadena de evidencia</h2><div className="mt-4 space-y-3">{episode.senales.map((signal) => <Link key={signal.id} to={`/ai-control/senal/${signal.id}`} className="flex items-center justify-between rounded-[12px] bg-[#f5f5f7] p-4 dark:bg-slate-800"><div><p className="font-medium text-[#1d1d1f] dark:text-white">{signal.detector} · {signal.entidad.id}</p><p className="mt-1 text-[12px] text-[#6e6e73]">{signal.agente} · confianza {(signal.confianza * 100).toFixed(0)} %</p></div><span className={`rounded-full px-2 py-1 text-[11px] ${impactClass[signal.impacto_tipo]}`}>{impactLabel[signal.impacto_tipo]} {currency.format(signal.impacto_eur)}</span></Link>)}</div>{episode.enlaces.length > 0 && <p className="mt-5 text-[13px] text-[#6e6e73]">Relaciones: {episode.enlaces.map((link) => `${link.tipo_relacion} (${link.regla})`).join(' · ')}. Son correlaciones estructurales, no una prueba causal.</p>}</section></>}</AppShell>;
};

export const AiControlSignalDetail = () => {
  const { id } = useParams(); const navigate = useNavigate(); const [signal, setSignal] = useState<(AgentSignalRecord & { episodio?: AgentEpisodeRecord }) | null>(null); const [reason, setReason] = useState(''); const [decisionTitle, setDecisionTitle] = useState(''); const [decisionOwner, setDecisionOwner] = useState(''); const [decisionDate, setDecisionDate] = useState(''); const [error, setError] = useState<string | null>(null);
  const reload = () => { if (id) getAgentSignal(Number(id)).then(setSignal).catch(() => setError('No se encontró la señal solicitada.')); }; useEffect(() => { if (id) getAgentSignal(Number(id)).then(setSignal).catch(() => setError('No se encontró la señal solicitada.')); }, [id]);
  const discard = async () => { if (!signal || !reason.trim()) { setError('Indica un motivo para descartar la señal.'); return; } await discardAgentSignal(signal.id, reason.trim()); reload(); };
  const createDecision = async () => { if (!signal || !decisionTitle.trim() || !decisionDate) { setError('Indica título y horizonte para crear la decisión.'); return; } await createAgentDecision({ signal_id: signal.id, episodio_id: signal.episodio_id ?? undefined, titulo: decisionTitle.trim(), responsable: decisionOwner.trim() || 'Sin asignar', metrica_objetivo: 'Pendiente de definir', horizonte_fecha: decisionDate }); setDecisionTitle(''); setDecisionOwner(''); setDecisionDate(''); };
  return <AppShell><button onClick={() => navigate(-1)} className="mb-5 inline-flex items-center gap-2 text-[13px] font-medium text-[#0071e3] dark:text-brand-cyan"><ArrowLeft size={15} />Volver</button>{error && <p className="mb-4 text-red-600">{error}</p>}{!signal ? <Loader2 className="animate-spin" /> : <><header className="rounded-[20px] bg-white p-6 dark:bg-slate-900"><p className="text-[12px] text-[#6e6e73]">Señal #{signal.id} · {signal.agente}</p><h1 className="mt-2 text-[25px] font-semibold tracking-[-0.03em] text-[#1d1d1f] dark:text-white">{signal.detector}</h1><p className="mt-2 text-[14px] text-[#6e6e73]">{signal.entidad_tipo}: {signal.entidad_id} · {signal.periodo_inicio} a {signal.periodo_fin}</p><div className="mt-4 flex flex-wrap gap-2"><span className={`rounded-full px-3 py-1 text-[12px] ${impactClass[signal.impacto_tipo]}`}>{impactLabel[signal.impacto_tipo]}: {currency.format(signal.impacto_eur)}</span><span className="rounded-full bg-[#0071e3]/10 px-3 py-1 text-[12px] text-[#0071e3] dark:text-brand-cyan">Confianza {(signal.confianza * 100).toFixed(0)} %</span></div></header><section className="mt-5 grid gap-5 lg:grid-cols-[1fr_360px]"><div className="rounded-[20px] bg-white p-6 dark:bg-slate-900"><h2 className="text-[17px] font-semibold text-[#1d1d1f] dark:text-white">Evidencia</h2><pre className="mt-4 overflow-x-auto rounded-[12px] bg-[#f5f5f7] p-4 text-[12px] text-[#424245] dark:bg-slate-800 dark:text-slate-200">{JSON.stringify(signal.evidencia ? JSON.parse(signal.evidencia) : {}, null, 2)}</pre>{signal.episodio && <Link to={`/ai-control/episodio/${signal.episodio.id}`} className="mt-4 inline-flex items-center gap-2 text-[13px] font-medium text-[#0071e3]">Ver episodio relacionado <ArrowRight size={14} /></Link>}</div><aside className="rounded-[20px] bg-white p-6 dark:bg-slate-900"><h2 className="text-[17px] font-semibold text-[#1d1d1f] dark:text-white">Acciones</h2><button onClick={() => createAgentFeedback(signal.id, 'util').then(reload)} className="mt-4 flex w-full items-center justify-center gap-2 rounded-[10px] bg-[#0071e3] px-3 py-2.5 text-[13px] font-medium text-white"><CheckCircle2 size={15} />Marcar útil</button><Link to={`/ai-control/analistas?agent=${encodeURIComponent(signal.agente)}&signal=${signal.id}`} className="mt-2 flex w-full items-center justify-center gap-2 rounded-[10px] bg-[#f5f5f7] px-3 py-2.5 text-[13px] font-medium text-[#0071e3] dark:bg-slate-800 dark:text-brand-cyan"><MessageSquare size={15} />Abrir expediente</Link><div className="mt-5 border-t border-black/[0.08] pt-4 dark:border-slate-700"><p className="text-[12px] font-medium text-[#6e6e73]">Crear decisión</p><input value={decisionTitle} onChange={(event) => setDecisionTitle(event.target.value)} placeholder="Decisión" className="mt-2 w-full rounded-[10px] border border-black/[0.12] p-2.5 text-[13px] dark:bg-slate-900" /><input value={decisionOwner} onChange={(event) => setDecisionOwner(event.target.value)} placeholder="Responsable" className="mt-2 w-full rounded-[10px] border border-black/[0.12] p-2.5 text-[13px] dark:bg-slate-900" /><input type="date" value={decisionDate} onChange={(event) => setDecisionDate(event.target.value)} className="mt-2 w-full rounded-[10px] border border-black/[0.12] p-2.5 text-[13px] dark:bg-slate-900" /><button onClick={createDecision} className="mt-2 flex w-full items-center justify-center gap-2 rounded-[10px] bg-[#f5f5f7] px-3 py-2.5 text-[13px] font-medium text-[#0071e3] dark:bg-slate-800 dark:text-brand-cyan"><ClipboardList size={15} />Guardar decisión</button></div><label className="mt-5 block text-[12px] font-medium text-[#6e6e73]">Motivo de descarte<textarea value={reason} onChange={(event) => setReason(event.target.value)} className="mt-2 w-full rounded-[10px] border border-black/[0.12] p-3 text-[13px] dark:bg-slate-900" rows={3} /></label><button onClick={discard} className="mt-2 flex w-full items-center justify-center gap-2 rounded-[10px] bg-red-50 px-3 py-2.5 text-[13px] font-medium text-red-700 dark:bg-red-500/10 dark:text-red-300"><XCircle size={15} />Descartar señal</button></aside></section></>}</AppShell>;
};

export const AiControlDecisions = () => {
  const [decisions, setDecisions] = useState<AgentDecisionRecord[]>([]); const [loading, setLoading] = useState(true);
  const reload = () => getAgentDecisions().then((response) => setDecisions(response.items)).finally(() => setLoading(false)); useEffect(() => { getAgentDecisions().then((response) => setDecisions(response.items)).finally(() => setLoading(false)); }, []);
  return <AppShell><Navigation current="decisions" /><header className="mb-6 rounded-[24px] bg-white p-6 dark:bg-slate-900"><p className="text-[13px] font-medium text-[#0071e3]">Control IA</p><h1 className="mt-2 text-[30px] font-semibold tracking-[-0.03em] text-[#1d1d1f] dark:text-white">Decisiones y seguimiento</h1></header>{loading ? <Loader2 className="animate-spin" /> : <section className="overflow-x-auto rounded-[20px] bg-white dark:bg-slate-900"><table className="w-full text-left text-[13px]"><thead className="border-b border-black/[0.08] text-[#6e6e73] dark:border-slate-700"><tr><th className="p-4 font-medium">Decisión</th><th className="p-4 font-medium">Responsable</th><th className="p-4 font-medium">Métrica</th><th className="p-4 font-medium">Horizonte</th><th className="p-4 font-medium">Estado</th></tr></thead><tbody>{decisions.map((decision) => <tr key={decision.id} className="border-b border-black/[0.06] dark:border-slate-800"><td className="p-4"><p className="font-medium text-[#1d1d1f] dark:text-white">{decision.titulo}</p><p className="mt-1 text-[12px] text-[#6e6e73]">{decision.origen === 'ceo' ? 'Propuesta CEO' : 'Creada por usuario'}</p></td><td className="p-4">{decision.responsable}</td><td className="p-4">{decision.metrica_objetivo}</td><td className="p-4">{decision.horizonte_fecha}</td><td className="p-4"><select value={decision.estado} onChange={(event) => updateAgentDecision(decision.id, { estado: event.target.value as AgentDecisionRecord['estado'] }).then(reload)} className="rounded-[8px] border border-black/[0.12] bg-white px-2 py-1.5 text-[12px] dark:bg-slate-800">{['propuesta', 'aceptada', 'en_curso', 'completada', 'descartada'].map((state) => <option key={state}>{state}</option>)}</select></td></tr>)}</tbody></table>{decisions.length === 0 && <div className="p-10 text-center text-[#6e6e73]"><ClipboardList className="mx-auto mb-3" />Aún no hay decisiones registradas.</div>}</section>}</AppShell>;
};
