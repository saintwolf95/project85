"""Perfiles permitidos y tolerancia de acceso para los modelos del AI Copilot."""
import logging
import os
from typing import Any


logger = logging.getLogger(__name__)

COPILOT_MODEL_PROFILES = {
    "luna": {"model": "gpt-5.6-luna", "reasoning_effort": "none", "advanced": False},
    "terra": {"model": "gpt-5.6-terra", "reasoning_effort": "medium", "advanced": True},
    "sol": {"model": "gpt-5.6-sol", "reasoning_effort": "high", "advanced": True},
}
LEGACY_COPILOT_PREFERENCES = {
    "fast": "luna",
    "thinking": "terra",
    "ultra_thinking": "sol",
}


def get_copilot_model_profile(model_preference: str) -> dict[str, str | bool]:
    """Normaliza preferencias heredadas y devuelve un perfil permitido."""
    profile_name = LEGACY_COPILOT_PREFERENCES.get(model_preference, model_preference)
    return COPILOT_MODEL_PROFILES.get(profile_name, COPILOT_MODEL_PROFILES["terra"])


def _is_model_availability_error(error: Exception) -> bool:
    """Distingue una falta de acceso del resto de errores de la petición."""
    status_code = getattr(error, "status_code", None)
    message = str(error).lower()
    return status_code in {400, 401, 403, 404} and any(token in message for token in (
        "model", "not found", "does not exist", "access", "permission", "not available",
    ))


def create_copilot_completion(client: Any, messages: list[dict[str, str]], model_preference: str):
    """Ejecuta una completación únicamente con perfiles autorizados del Copilot."""
    profile = get_copilot_model_profile(model_preference)
    model_name = str(profile["model"])
    try:
        response = client.chat.completions.create(
            model=model_name,
            messages=messages,
            reasoning_effort=str(profile["reasoning_effort"]),
        )
        return response, model_name
    except Exception as error:
        fallback = os.getenv("COPILOT_MODEL_FALLBACK", "gpt-4o").strip() or "gpt-4o"
        if model_name == fallback or not _is_model_availability_error(error):
            raise
        logger.warning("El modelo %s no está disponible; se usa %s: %s", model_name, fallback, error)
        response = client.chat.completions.create(model=fallback, messages=messages, temperature=0.0)
        return response, fallback
