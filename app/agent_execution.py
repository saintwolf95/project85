"""Progreso persistente, aislado por empresa y publicado desde pasos reales."""
import json
from datetime import datetime, timedelta
from uuid import uuid4

from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .models import AgentExecution, AgentExecutionMember, AgentExecutionRun

MAX_SILENCE = timedelta(minutes=30)
AGENTS = ("maria", "lucia", "mattia", "ceo")


class ExecutionBusy(Exception):
    pass


def read_execution(db: Session, empresa_id: int) -> dict | None:
    row = db.get(AgentExecution, empresa_id)
    if row is None:
        return None
    stale = row.estado == "ejecutando" and row.actualizado_en < datetime.utcnow() - MAX_SILENCE
    agents = json.loads(row.agentes_json)
    if stale:
        agents = {name: "interrumpido" if state in ("pendiente", "trabajando", "preparado") else state for name, state in agents.items()}
    return {
        "run_id": row.run_id, "estado": "interrumpida" if stale else row.estado,
        "etapa": "Sin actualización reciente; revisa la ejecución antes de reintentar." if stale else row.etapa,
        "agentes": agents, "inicio": row.inicio.isoformat() + "Z",
        "actualizado_en": row.actualizado_en.isoformat() + "Z", "informe_id": row.informe_id,
    }


def read_execution_history(db: Session, empresa_id: int, limit: int = 20) -> list[dict]:
    runs = db.query(AgentExecutionRun).filter(
        AgentExecutionRun.empresa_id == empresa_id,
    ).order_by(AgentExecutionRun.inicio.desc()).limit(limit).all()
    if not runs:
        return []
    run_ids = [item.run_id for item in runs]
    members = db.query(AgentExecutionMember).filter(
        AgentExecutionMember.empresa_id == empresa_id,
        AgentExecutionMember.run_id.in_(run_ids),
    ).order_by(AgentExecutionMember.id).all()
    by_run: dict[str, list[dict]] = {run_id: [] for run_id in run_ids}
    for member in members:
        by_run[member.run_id].append({
            "agent_name": member.agent_name, "estado": member.estado,
            "etapa_final": member.etapa_final,
            "inicio": member.inicio.isoformat() + "Z" if member.inicio else None,
            "fin": member.fin.isoformat() + "Z" if member.fin else None,
            "duracion_ms": member.duracion_ms, "error_code": member.error_code,
        })
    return [{
        "run_id": item.run_id, "estado": item.estado, "etapa_final": item.etapa_final,
        "inicio": item.inicio.isoformat() + "Z", "fin": item.fin.isoformat() + "Z" if item.fin else None,
        "duracion_ms": item.duracion_ms, "informe_id": item.informe_id,
        "error_code": item.error_code, "agentes": by_run[item.run_id],
    } for item in runs]


class ExecutionProgress:
    def __init__(self, bind, empresa_id: int, fase1: bool, fase2: bool):
        self.bind, self.empresa_id, self.run_id = bind, empresa_id, str(uuid4())
        self.agents = {name: "pendiente" if (fase2 if name == "ceo" else fase1) else "omitido" for name in AGENTS}
        now = datetime.utcnow()
        values = dict(run_id=self.run_id, estado="ejecutando", etapa="Preparando análisis",
                      agentes_json=json.dumps(self.agents), inicio=now, actualizado_en=now, informe_id=None)
        with Session(bind) as db:
            acquired = False
            current = db.get(AgentExecution, empresa_id)
            previous_run_id = current.run_id if current and current.estado == "ejecutando" and current.actualizado_en < now - MAX_SILENCE else None
            if current is None:
                db.add(AgentExecution(empresa_id=empresa_id, **values))
                try:
                    db.commit()
                    acquired = True
                except IntegrityError:
                    db.rollback()  # Otra petición puede haber creado la fila.
            if not acquired:
                changed = db.query(AgentExecution).filter(
                    AgentExecution.empresa_id == empresa_id,
                    or_(AgentExecution.estado != "ejecutando", AgentExecution.actualizado_en < now - MAX_SILENCE),
                ).update(values, synchronize_session=False)
                db.commit()
                if changed != 1:
                    raise ExecutionBusy("Ya hay una ejecución en curso para esta empresa.")
                if previous_run_id:
                    previous = db.query(AgentExecutionRun).filter(
                        AgentExecutionRun.empresa_id == empresa_id,
                        AgentExecutionRun.run_id == previous_run_id,
                    ).first()
                    if previous and previous.fin is None:
                        previous.estado, previous.etapa_final = "interrumpida", "Ejecución sin actualización reciente"
                        previous.error_code, previous.fin = "stale_execution", now
                        previous.duracion_ms = max(0, int((now - previous.inicio).total_seconds() * 1000))
                    stale_members = db.query(AgentExecutionMember).filter(
                        AgentExecutionMember.empresa_id == empresa_id,
                        AgentExecutionMember.run_id == previous_run_id,
                        AgentExecutionMember.estado.in_(("pendiente", "trabajando", "preparado")),
                    ).all()
                    for member in stale_members:
                        member.estado, member.etapa_final = "interrumpido", "Ejecución sin actualización reciente"
                        member.error_code, member.fin = "stale_execution", now
                        member.duracion_ms = max(0, int((now - (member.inicio or (previous.inicio if previous else current.inicio))).total_seconds() * 1000))
            db.add(AgentExecutionRun(
                empresa_id=empresa_id, run_id=self.run_id, estado="ejecutando",
                etapa_final="Preparando análisis", inicio=now,
            ))
            db.add_all(AgentExecutionMember(
                empresa_id=empresa_id, run_id=self.run_id, agent_name=name,
                estado=state, etapa_final="Pendiente" if state == "pendiente" else "Omitido",
            ) for name, state in self.agents.items())
            try:
                db.commit()
            except Exception:
                db.rollback()
                db.query(AgentExecution).filter(
                    AgentExecution.empresa_id == empresa_id,
                    AgentExecution.run_id == self.run_id,
                ).update({
                    "estado": "error", "etapa": "No se pudo iniciar el historial de ejecución",
                    "actualizado_en": datetime.utcnow(),
                }, synchronize_session=False)
                db.commit()
                raise

    def publish(self, stage: str, agent: str | None = None, state: str = "trabajando", *, status="ejecutando", report_id=None, error_code=None):
        if agent:
            self.agents[agent] = state
        if status == "completada":
            self.agents = {name: "completado" if value == "preparado" else value for name, value in self.agents.items()}
        elif status == "error":
            self.agents = {name: "error" if value == "trabajando" else "interrumpido" if value in ("pendiente", "preparado") else value for name, value in self.agents.items()}
        with Session(self.bind) as db:
            now = datetime.utcnow()
            changed = db.query(AgentExecution).filter(
                AgentExecution.empresa_id == self.empresa_id, AgentExecution.run_id == self.run_id,
            ).update(dict(etapa=stage, estado=status, agentes_json=json.dumps(self.agents),
                          actualizado_en=now, informe_id=report_id), synchronize_session=False)
            run = db.query(AgentExecutionRun).filter(
                AgentExecutionRun.empresa_id == self.empresa_id, AgentExecutionRun.run_id == self.run_id,
            ).one()
            run.estado, run.etapa_final, run.informe_id, run.error_code = status, stage, report_id, error_code
            if status in ("completada", "error", "interrumpida"):
                run.fin = now
                run.duracion_ms = max(0, int((now - run.inicio).total_seconds() * 1000))
            rows = db.query(AgentExecutionMember).filter(
                AgentExecutionMember.empresa_id == self.empresa_id,
                AgentExecutionMember.run_id == self.run_id,
            ).all()
            for row in rows:
                previous = row.estado
                row.estado = self.agents[row.agent_name]
                if row.agent_name == agent or (status != "ejecutando" and row.estado != "omitido"):
                    row.etapa_final = stage
                if previous == "pendiente" and row.estado == "trabajando":
                    row.inicio = now
                if row.estado in ("preparado", "completado", "error", "interrumpido") and row.fin is None:
                    row.fin = now
                    row.duracion_ms = max(0, int((now - (row.inicio or run.inicio)).total_seconds() * 1000))
                if row.estado in ("error", "interrumpido"):
                    row.error_code = error_code
            db.commit()
            if changed != 1:
                raise ExecutionBusy("Esta ejecución ha sido sustituida por otra.")
