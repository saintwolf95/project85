"""Registro mínimo de consumo LLM; nunca persiste contenido de las conversaciones."""
import logging

from sqlalchemy.orm import Session

from .models import LlmUsageEvent

logger = logging.getLogger(__name__)


def record_llm_usage(bind, response, *, empresa_id: int, feature: str, model: str,
                     usuario_id: int | None = None, run_id: str | None = None,
                     agent_name: str | None = None) -> None:
    usage = getattr(response, "usage", None)
    if usage is None:
        return
    input_tokens = int(getattr(usage, "prompt_tokens", 0) or 0)
    output_tokens = int(getattr(usage, "completion_tokens", 0) or 0)
    total_tokens = int(getattr(usage, "total_tokens", input_tokens + output_tokens) or 0)
    try:
        with Session(bind) as session:
            session.add(LlmUsageEvent(
                empresa_id=empresa_id, usuario_id=usuario_id, run_id=run_id,
                agent_name=agent_name, feature=feature[:80], model=model[:80],
                input_tokens=input_tokens, output_tokens=output_tokens, total_tokens=total_tokens,
            ))
            session.commit()
    except Exception:
        logger.exception("No se pudo registrar telemetría de consumo LLM")
