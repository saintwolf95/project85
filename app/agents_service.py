"""Orquestación de Control IA: detectores deterministas y narración de evidencia."""
import json
import logging
import threading
from datetime import date, datetime, time as datetime_time, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session

from .agent_signals import build_evidence_bundle, get_active_signals, refresh_agent_signals
from .copilot_service import get_openai_client
from .models import AgentInsights, AgentSettings, EmpresaConfiguracion, EmpresaEstadisticas


logger = logging.getLogger(__name__)
MADRID_TZ = ZoneInfo("Europe/Madrid")
_daily_report_lock = threading.Lock()


def get_business_context(db: Session, empresa_id: int) -> str:
    config = db.query(EmpresaConfiguracion).filter(EmpresaConfiguracion.empresa_id == empresa_id).first()
    return (config.contexto_negocio or "").strip()[:8000] if config else ""


def daily_utc_window(target_date: date | None = None) -> tuple[datetime, datetime]:
    report_date = target_date or datetime.now(MADRID_TZ).date()
    start_local = datetime.combine(report_date, datetime_time.min, tzinfo=MADRID_TZ)
    return start_local.astimezone(timezone.utc).replace(tzinfo=None), (start_local + timedelta(days=1)).astimezone(timezone.utc).replace(tzinfo=None)


def get_daily_agent_insight(db: Session, empresa_id: int, target_date: date | None = None):
    start_utc, end_utc = daily_utc_window(target_date)
    query = db.query(AgentInsights).filter(
        AgentInsights.empresa_id == empresa_id, AgentInsights.fecha >= start_utc, AgentInsights.fecha < end_utc,
        AgentInsights.fase1_maria_md.isnot(None), AgentInsights.fase1_lucia_md.isnot(None), AgentInsights.fase1_mattia_md.isnot(None),
    )
    metrics_updated_at = db.query(EmpresaEstadisticas.actualizado_en).filter(EmpresaEstadisticas.empresa_id == empresa_id).scalar()
    if metrics_updated_at:
        query = query.filter(AgentInsights.fecha >= metrics_updated_at)
    return query.order_by(AgentInsights.fecha.desc()).first()


def ensure_daily_agent_insight(db: Session, empresa_id: int):
    existing = get_daily_agent_insight(db, empresa_id)
    if existing:
        return existing
    with _daily_report_lock:
        existing = get_daily_agent_insight(db, empresa_id)
        if existing:
            return existing
        settings = db.query(AgentSettings).filter(AgentSettings.empresa_id == empresa_id).first()
        return execute_agents_workflow(db, empresa_id, run_fase1=True, run_fase2=bool(settings and settings.fase2_active))


def _narrate(db: Session, empresa_id: int, agent: str, system_prompt: str) -> str:
    client = get_openai_client()
    if not client:
        return "Error: API Key de OpenAI no configurada."
    evidence = build_evidence_bundle(db, empresa_id, agent, limit=7)
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": (
            "Narra solo el EVIDENCE BUNDLE. No ejecutes SQL ni calcules cifras. Cada conclusión debe citar "
            "importe, período y confianza. Declara límites cuando falte evidencia.\n\n"
            f"EVIDENCE BUNDLE:\n{json.dumps(evidence, ensure_ascii=False, default=str)}\n\n"
            f"CONTEXTO:\n{get_business_context(db, empresa_id) or 'No configurado.'}"
        )},
    ]
    try:
        return client.chat.completions.create(model="gpt-4o", messages=messages, temperature=0.2).choices[0].message.content
    except Exception as error:
        logger.error("Error narrando señales de %s: %s", agent, error)
        return f"Error al generar informe de {agent}."


def narrate_agent_signals(db: Session, empresa_id: int, agent: str) -> str:
    roles = {
        "maria": "Eres María, responsable de inventario. Explica nivel, cobertura y capital inmovilizado.",
        "lucia": "Eres Lucía, responsable de ventas. Explica variación comercial y concentración.",
        "mattia": "Eres Mattia, responsable financiero. Explica rentabilidad y erosión de MGD.",
    }
    return _narrate(db, empresa_id, agent, roles[agent] + " Responde sin saludo: hallazgos, lectura, decisiones y límites.")


def run_ceo_from_signals(db: Session, empresa_id: int) -> str:
    return _narrate(
        db, empresa_id, "ceo",
        "Eres CEO IA. Consolida solo las 5-7 señales verificadas de mayor impacto. Identifica tensiones entre ventas, margen e inventario solo si ambas evidencias las sustentan. Da hasta tres decisiones con responsable, métrica y horizonte.",
    )


def execute_agents_workflow(db: Session, empresa_id: int, run_fase1: bool, run_fase2: bool):
    alertas_fase1, maria_md, lucia_md, mattia_md = [], None, None, None
    if run_fase1:
        refresh_agent_signals(db, empresa_id)
        maria_md = narrate_agent_signals(db, empresa_id, "maria")
        lucia_md = narrate_agent_signals(db, empresa_id, "lucia")
        mattia_md = narrate_agent_signals(db, empresa_id, "mattia")
        alertas_fase1 = [{"agente": item.agente, "detector": item.detector, "entidad": item.entidad_id, "impacto_eur": item.impacto_eur, "confianza": item.confianza, "estado": item.estado} for item in get_active_signals(db, empresa_id, limit=100)]
    ceo_summary = run_ceo_from_signals(db, empresa_id) if run_fase2 and (run_fase1 or get_daily_agent_insight(db, empresa_id)) else None
    insight = AgentInsights(empresa_id=empresa_id, fase1_raw_json=json.dumps(alertas_fase1) if alertas_fase1 else None, fase1_maria_md=maria_md, fase1_lucia_md=lucia_md, fase1_mattia_md=mattia_md, fase2_ceo_markdown=ceo_summary)
    db.add(insight)
    db.commit()
    db.refresh(insight)
    return insight


def process_agent_chat(db: Session, empresa_id: int, agent_name: str, history: list, dossier: dict | None = None) -> str:
    normalized_agent = agent_name.lower().replace("í", "i")
    client = get_openai_client()
    if not client:
        return "Error: API Key de OpenAI no configurada."
    evidence = build_evidence_bundle(db, empresa_id, normalized_agent, limit=7)
    prompt = (
        f"Eres el agente {normalized_agent}. Responde la pregunta usando exclusivamente el EVIDENCE BUNDLE. "
        "No ejecutas SQL ni recalculas. Si falta el dato, dilo y pide un detector o investigación. "
        "No inventes causalidad.\n\n"
        f"EVIDENCE BUNDLE:\n{json.dumps(evidence, ensure_ascii=False, default=str)}\n\n"
        f"CONTEXTO:\n{get_business_context(db, empresa_id) or 'No configurado.'}"
    )
    messages = [{"role": "system", "content": prompt}, *[{"role": item["role"], "content": item["content"]} for item in history[-20:]]]
    try:
        return client.chat.completions.create(model="gpt-4o", messages=messages, temperature=0.2).choices[0].message.content
    except Exception as error:
        logger.error("Error en chat de agente %s: %s", normalized_agent, error)
        return "No se pudo generar la respuesta del agente."
