"""Progreso persistente, aislado por empresa y publicado desde pasos reales."""
import json
from datetime import datetime, timedelta
from uuid import uuid4

from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .models import AgentExecution

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


class ExecutionProgress:
    def __init__(self, bind, empresa_id: int, fase1: bool, fase2: bool):
        self.bind, self.empresa_id, self.run_id = bind, empresa_id, str(uuid4())
        self.agents = {name: "pendiente" if (fase2 if name == "ceo" else fase1) else "omitido" for name in AGENTS}
        now = datetime.utcnow()
        values = dict(run_id=self.run_id, estado="ejecutando", etapa="Preparando análisis",
                      agentes_json=json.dumps(self.agents), inicio=now, actualizado_en=now, informe_id=None)
        with Session(bind) as db:
            if db.get(AgentExecution, empresa_id) is None:
                db.add(AgentExecution(empresa_id=empresa_id, **values))
                try:
                    db.commit()
                    return
                except IntegrityError:
                    db.rollback()  # Otra petición puede haber creado la fila.
            changed = db.query(AgentExecution).filter(
                AgentExecution.empresa_id == empresa_id,
                or_(AgentExecution.estado != "ejecutando", AgentExecution.actualizado_en < now - MAX_SILENCE),
            ).update(values, synchronize_session=False)
            db.commit()
            if changed != 1:
                raise ExecutionBusy("Ya hay una ejecución en curso para esta empresa.")

    def publish(self, stage: str, agent: str | None = None, state: str = "trabajando", *, status="ejecutando", report_id=None):
        if agent:
            self.agents[agent] = state
        if status == "completada":
            self.agents = {name: "completado" if value == "preparado" else value for name, value in self.agents.items()}
        elif status == "error":
            self.agents = {name: "error" if value == "trabajando" else "interrumpido" if value in ("pendiente", "preparado") else value for name, value in self.agents.items()}
        with Session(self.bind) as db:
            changed = db.query(AgentExecution).filter(
                AgentExecution.empresa_id == self.empresa_id, AgentExecution.run_id == self.run_id,
            ).update(dict(etapa=stage, estado=status, agentes_json=json.dumps(self.agents),
                          actualizado_en=datetime.utcnow(), informe_id=report_id), synchronize_session=False)
            db.commit()
            if changed != 1:
                raise ExecutionBusy("Esta ejecución ha sido sustituida por otra.")
