"""Orquestación de Control IA: detectores deterministas y narración de evidencia."""
import json
import logging
import os
import re
import threading
from datetime import date, datetime, time as datetime_time, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session

from .agent_signals import build_evidence_bundle, get_active_signals, refresh_agent_signals
from .agent_correlation import build_episode_bundle, refresh_agent_episodes
from .copilot_service import get_openai_client
from .agent_execution import ExecutionProgress
from .llm_usage import record_llm_usage
from .models import AgentDecision, AgentEpisode, AgentInsights, AgentSettings, EmpresaConfiguracion, EmpresaEstadisticas


logger = logging.getLogger(__name__)
MADRID_TZ = ZoneInfo("Europe/Madrid")
_daily_report_lock = threading.Lock()

# Los analistas conservan GPT-4o. El CEO usa una ruta independiente porque su
# consolidación es el único informe que reúne impactos de varias áreas.
DEFAULT_AGENT_MODEL = "gpt-4o"
DEFAULT_CEO_CHAT_MODEL = "gpt-5.6-terra"
DEFAULT_CEO_REPORT_MODEL = "gpt-6.1-sol"
DEFAULT_CEO_FALLBACK_MODEL = "gpt-4o"
DEFAULT_CEO_CHAT_REASONING_EFFORT = "medium"
DEFAULT_CEO_REPORT_REASONING_EFFORT = "high"


def _configured_model(variable: str, default: str) -> str:
    """Devuelve el modelo configurado, evitando valores de entorno vacíos."""
    return os.getenv(variable, default).strip() or default


def _is_model_availability_error(error: Exception) -> bool:
    """Detecta fallos de acceso/modelo para poder conservar el informe ejecutivo.

    No se reintentan cortes de red ni límites de tasa: repetir una petición en
    esos casos puede duplicar coste y ocultar un incidente operativo.
    """
    status_code = getattr(error, "status_code", None)
    message = str(error).lower()
    return status_code in {400, 401, 403, 404} and any(token in message for token in (
        "model", "not found", "does not exist", "access", "permission", "not available",
    ))


def _create_ceo_completion(client, messages: list[dict], model: str, reasoning_effort: str):
    """Ejecuta una llamada del CEO y vuelve a GPT-4o solo si falta acceso al modelo.

    La decisión y sus fórmulas siguen siendo deterministas; este selector cambia
    exclusivamente la capa de redacción. Devolvemos el modelo efectivo para que
    la telemetría no atribuya uso de Sol/Terra cuando hubo fallback.
    """
    try:
        # Los modelos de razonamiento no necesitan temperatura para esta tarea.
        return client.chat.completions.create(
            model=model, messages=messages, reasoning_effort=reasoning_effort,
        ), model
    except Exception as error:
        fallback = _configured_model("CEO_MODEL_FALLBACK", DEFAULT_CEO_FALLBACK_MODEL)
        if model == fallback or not _is_model_availability_error(error):
            raise
        logger.warning("El modelo CEO %s no está disponible; se usa %s: %s", model, fallback, error)
        return client.chat.completions.create(model=fallback, messages=messages, temperature=0.2), fallback


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


def _narrate(db: Session, empresa_id: int, agent: str, system_prompt: str, run_id: str | None = None) -> str:
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
        response = client.chat.completions.create(model=DEFAULT_AGENT_MODEL, messages=messages, temperature=0.2)
        record_llm_usage(db.get_bind(), response, empresa_id=empresa_id, feature="agent_report", model=DEFAULT_AGENT_MODEL, run_id=run_id, agent_name=agent)
        return response.choices[0].message.content
    except Exception as error:
        logger.error("Error narrando señales de %s: %s", agent, error)
        return f"Error al generar informe de {agent}."


def narrate_agent_signals(db: Session, empresa_id: int, agent: str, run_id: str | None = None) -> str:
    roles = {
        "maria": "Eres María, responsable de inventario. Explica nivel, cobertura y capital inmovilizado.",
        "lucia": "Eres Lucía, responsable de ventas. Explica variación comercial y concentración.",
        "mattia": "Eres Mattia, responsable financiero. Explica rentabilidad y erosión de MGD.",
    }
    return _narrate(db, empresa_id, agent, roles[agent] + " Responde sin saludo: hallazgos, lectura, decisiones y límites.", run_id)


def run_ceo_from_signals(db: Session, empresa_id: int, run_id: str | None = None) -> str:
    client = get_openai_client()
    if not client:
        return "Error: API Key de OpenAI no configurada."
    evidence = build_episode_bundle(db, empresa_id, limit=7)
    messages = [
        {"role": "system", "content": "Eres CEO IA. Consolida solo los episodios del evidence bundle. No ejecutes SQL ni calcules cifras. Separa riesgos y oportunidades; ordénalos por impacto ponderado dentro de su naturaleza y nunca dejes que una oportunidad desplace un riesgo de severidad 5. Cita siempre el subtotal y su tipo de impacto; nunca sumes realizado, en_riesgo y capital en una sola cifra. Cuando exista un enlace explica, descríbelo como correlación estructural, no como prueba causal. Da hasta tres decisiones con responsable, métrica, horizonte y el id de episodio de origen. Al final añade exactamente un comentario HTML <!--DECISIONS_JSON:[...]--> con una lista JSON. Cada objeto debe contener episodio_id, titulo, descripcion, responsable, metrica_objetivo y horizonte_fecha ISO. No incluyas una decisión si no puedes enlazarla a un episodio existente."},
        {"role": "user", "content": f"EVIDENCE BUNDLE:\n{json.dumps(evidence, ensure_ascii=False, default=str)}\n\nCONTEXTO:\n{get_business_context(db, empresa_id) or 'No configurado.'}"},
    ]
    try:
        selected_model = _configured_model("CEO_REPORT_MODEL", DEFAULT_CEO_REPORT_MODEL)
        reasoning_effort = _configured_model("CEO_REPORT_REASONING_EFFORT", DEFAULT_CEO_REPORT_REASONING_EFFORT)
        response, effective_model = _create_ceo_completion(client, messages, selected_model, reasoning_effort)
        record_llm_usage(db.get_bind(), response, empresa_id=empresa_id, feature="ceo_report", model=effective_model, run_id=run_id, agent_name="ceo")
        return response.choices[0].message.content
    except Exception as error:
        logger.error("Error narrando episodios CEO: %s", error)
        return "Error al generar informe del CEO."


_DECISIONS_MARKER = re.compile(r"<!--DECISIONS_JSON\s*:\s*(\[.*?\])\s*-->", re.DOTALL)


def persist_ceo_decisions(db: Session, empresa_id: int, report: str) -> str:
    """Guarda solo decisiones con vínculo explícito a un episodio existente."""
    marker = _DECISIONS_MARKER.search(report or "")
    if not marker:
        logger.warning("El CEO no devolvió decisiones estructuradas; no se persiste ninguna decisión.")
        return report
    cleaned_report = _DECISIONS_MARKER.sub("", report).strip()
    try:
        decisions = json.loads(marker.group(1))
    except json.JSONDecodeError:
        logger.warning("El bloque de decisiones del CEO no contiene JSON válido.")
        return cleaned_report
    if not isinstance(decisions, list):
        return cleaned_report
    valid_episode_ids = {
        row[0] for row in db.query(AgentEpisode.id).filter(AgentEpisode.empresa_id == empresa_id, AgentEpisode.estado == "abierto").all()
    }
    for item in decisions[:3]:
        if not isinstance(item, dict):
            continue
        episode_id = item.get("episodio_id")
        if episode_id not in valid_episode_ids:
            logger.warning("Decisión CEO sin episodio válido: %s", episode_id)
            continue
        try:
            horizon = date.fromisoformat(str(item.get("horizonte_fecha")))
        except (TypeError, ValueError):
            logger.warning("Decisión CEO sin horizonte válido para episodio %s", episode_id)
            continue
        title = str(item.get("titulo") or "").strip()
        metric = str(item.get("metrica_objetivo") or "").strip()
        if not title or not metric:
            logger.warning("Decisión CEO incompleta para episodio %s", episode_id)
            continue
        existing = db.query(AgentDecision.id).filter(
            AgentDecision.empresa_id == empresa_id,
            AgentDecision.episodio_id == episode_id,
            AgentDecision.origen == "ceo",
            AgentDecision.titulo == title,
            AgentDecision.estado.in_(("propuesta", "aceptada", "en_curso")),
        ).first()
        if existing:
            continue
        db.add(AgentDecision(
            empresa_id=empresa_id,
            episodio_id=episode_id,
            titulo=title[:500],
            descripcion=str(item.get("descripcion") or "").strip()[:5000],
            responsable=str(item.get("responsable") or "Sin asignar").strip()[:255] or "Sin asignar",
            metrica_objetivo=metric[:500],
            valor_objetivo=item.get("valor_objetivo"),
            horizonte_fecha=horizon,
            origen="ceo",
            estado="propuesta",
        ))
    return cleaned_report


def execute_agents_workflow(db: Session, empresa_id: int, run_fase1: bool, run_fase2: bool):
    if not run_fase1 and not run_fase2:
        raise ValueError("Activa al menos una fase del análisis.")
    progress = ExecutionProgress(db.get_bind(), empresa_id, run_fase1, run_fase2)
    try:
        result = _execute_agents_workflow(db, empresa_id, run_fase1, run_fase2, progress)
        progress.publish("Informe guardado", status="completada", report_id=result.id)
        return result
    except Exception as error:
        db.rollback()
        try:
            code = "model_error" if "openai" in error.__class__.__module__.lower() else "workflow_error"
            progress.publish("No se pudo completar el análisis. Revisa la configuración y vuelve a intentarlo.", status="error", error_code=code)
        except Exception:
            logger.exception("No se pudo registrar el fallo de ejecución")
        raise


def _checked_report(report: str | None) -> str:
    if not report or report.lstrip().lower().startswith("error"):
        raise RuntimeError("No se pudo generar un informe del agente.")
    return report


def _execute_agents_workflow(db: Session, empresa_id: int, run_fase1: bool, run_fase2: bool, progress):
    alertas_fase1, maria_md, lucia_md, mattia_md = [], None, None, None
    if run_fase1:
        progress.publish("Calculando señales y correlaciones verificadas")
        refresh_agent_signals(db, empresa_id)
        episodes = refresh_agent_episodes(db, empresa_id)
        episode_impact = {episode.id: episode.impacto_ponderado_eur for episode in episodes}
        # Las señales deterministas quedan disponibles aunque falle la narración.
        # Libera además el bloqueo de escritura SQLite antes de publicar progreso.
        db.commit()
        reports = {}
        for agent, label in (("maria", "María"), ("lucia", "Lucía"), ("mattia", "Mattia")):
            progress.publish(f"{label} redactando su análisis", agent)
            reports[agent] = _checked_report(narrate_agent_signals(db, empresa_id, agent, progress.run_id))
            progress.publish(f"Análisis de {label} preparado", agent, "preparado")
        maria_md, lucia_md, mattia_md = (reports[name] for name in ("maria", "lucia", "mattia"))
        alertas_fase1 = [{"agente": item.agente, "detector": item.detector, "entidad": item.entidad_id, "impacto_eur": item.impacto_eur, "impacto_tipo": item.impacto_tipo, "impacto_ponderado_eur": item.impacto_ponderado_eur, "naturaleza": item.naturaleza or "riesgo", "episodio_id": item.episodio_id, "episodio_impacto_ponderado_eur": episode_impact.get(item.episodio_id), "confianza": item.confianza, "estado": item.estado} for item in get_active_signals(db, empresa_id, limit=100)]
    ceo_summary = None
    if run_fase2 and (run_fase1 or get_daily_agent_insight(db, empresa_id)):
        progress.publish("CEO consolidando episodios y decisiones", "ceo")
        ceo_summary = _checked_report(run_ceo_from_signals(db, empresa_id, progress.run_id))
        progress.publish("Consolidación preparada", "ceo", "preparado")
    elif run_fase2:
        raise ValueError("El CEO necesita un informe de los analistas. Activa la fase 1.")
    progress.publish("Guardando informe y decisiones")
    if ceo_summary:
        ceo_summary = persist_ceo_decisions(db, empresa_id, ceo_summary)
    insight = AgentInsights(empresa_id=empresa_id, fase1_raw_json=json.dumps(alertas_fase1) if alertas_fase1 else None, fase1_maria_md=maria_md, fase1_lucia_md=lucia_md, fase1_mattia_md=mattia_md, fase2_ceo_markdown=ceo_summary)
    db.add(insight)
    db.commit()
    db.refresh(insight)
    return insight


def process_agent_chat(db: Session, empresa_id: int, agent_name: str, history: list, dossier: dict | None = None, signal_id: int | None = None) -> str:
    normalized_agent = agent_name.lower().replace("í", "i")
    client = get_openai_client()
    if not client:
        return "Error: API Key de OpenAI no configurada."
    evidence = build_evidence_bundle(db, empresa_id, normalized_agent, limit=7, signal_id=signal_id)
    prompt = (
        f"Eres el agente {normalized_agent}. Responde la pregunta usando exclusivamente el EVIDENCE BUNDLE. "
        "No ejecutas SQL ni recalculas. Si falta el dato, dilo y pide un detector o investigación. "
        "No inventes causalidad.\n\n"
        f"EVIDENCE BUNDLE:\n{json.dumps(evidence, ensure_ascii=False, default=str)}\n\n"
        f"CONTEXTO:\n{get_business_context(db, empresa_id) or 'No configurado.'}"
    )
    messages = [{"role": "system", "content": prompt}, *[{"role": item["role"], "content": item["content"]} for item in history[-20:]]]
    try:
        if normalized_agent == "ceo":
            selected_model = _configured_model("CEO_CHAT_MODEL", DEFAULT_CEO_CHAT_MODEL)
            reasoning_effort = _configured_model("CEO_CHAT_REASONING_EFFORT", DEFAULT_CEO_CHAT_REASONING_EFFORT)
            response, effective_model = _create_ceo_completion(client, messages, selected_model, reasoning_effort)
        else:
            response = client.chat.completions.create(model=DEFAULT_AGENT_MODEL, messages=messages, temperature=0.2)
            effective_model = DEFAULT_AGENT_MODEL
        record_llm_usage(db.get_bind(), response, empresa_id=empresa_id, feature="agent_chat", model=effective_model, agent_name=normalized_agent)
        return response.choices[0].message.content
    except Exception as error:
        logger.error("Error en chat de agente %s: %s", normalized_agent, error)
        return "No se pudo generar la respuesta del agente."
