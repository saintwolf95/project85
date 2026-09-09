"""Resolución única de reglas de negocio para detectores deterministas."""
from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import date
from typing import Any

from sqlalchemy.orm import Session

from .models import EmpresaReglaNegocio


RULE_KEYS = {
    "lead_time_dias", "margen_objetivo_pct", "cliente_estrategico", "sku_discontinuado",
    "familia_estacional", "umbral_detector",
}
SCOPE_TYPES = {"empresa", "familia", "sku", "cliente", "comercial"}


@dataclass(frozen=True)
class ResolvedRule:
    value: Any
    source: str
    rule_id: int | None = None

    def evidence(self) -> dict:
        return {"valor": self.value, "origen": self.source, "regla_id": self.rule_id}


def _active(query, target: date):
    return query.filter(
        EmpresaReglaNegocio.vigente_desde <= target,
        (EmpresaReglaNegocio.vigente_hasta.is_(None) | (EmpresaReglaNegocio.vigente_hasta >= target)),
    ).order_by(EmpresaReglaNegocio.vigente_desde.desc(), EmpresaReglaNegocio.updated_at.desc())


def _value(rule: EmpresaReglaNegocio) -> Any:
    if rule.valor_num is not None:
        return rule.valor_num
    if rule.valor_json:
        try:
            return json.loads(rule.valor_json)
        except json.JSONDecodeError:
            return None
    return rule.valor_texto


def resolve_rule(
    db: Session,
    empresa_id: int,
    clave: str,
    *,
    sku: str | None = None,
    familia: str | None = None,
    cliente: str | None = None,
    comercial: str | None = None,
    default: Any = None,
    on_date: date | None = None,
) -> ResolvedRule:
    """Resuelve SKU → familia → ámbito específico → empresa → constante."""
    if clave not in RULE_KEYS:
        raise ValueError("Clave de regla no permitida")
    target = on_date or date.today()
    candidates = [
        ("sku", sku), ("familia", familia), ("cliente", cliente), ("comercial", comercial), ("empresa", None),
    ]
    for scope, scope_id in candidates:
        if scope != "empresa" and not scope_id:
            continue
        rule = _active(db.query(EmpresaReglaNegocio).filter(
            EmpresaReglaNegocio.empresa_id == empresa_id,
            EmpresaReglaNegocio.clave == clave,
            EmpresaReglaNegocio.ambito_tipo == scope,
            EmpresaReglaNegocio.ambito_id.is_(None) if scope == "empresa" else EmpresaReglaNegocio.ambito_id == str(scope_id),
        ), target).first()
        if rule:
            return ResolvedRule(_value(rule), scope, rule.id)
    return ResolvedRule(default, "constante", None)


def resolve_detector_threshold(
    db: Session,
    empresa_id: int,
    detector: str,
    *,
    default: float,
    on_date: date | None = None,
) -> ResolvedRule:
    """Obtiene una excepción explícita para un detector o su umbral global."""
    target = on_date or date.today()
    base = db.query(EmpresaReglaNegocio).filter(
        EmpresaReglaNegocio.empresa_id == empresa_id,
        EmpresaReglaNegocio.clave == "umbral_detector",
        EmpresaReglaNegocio.ambito_tipo == "empresa",
    )
    for scope_id in (detector, None):
        query = base.filter(
            EmpresaReglaNegocio.ambito_id == scope_id
            if scope_id is not None
            else EmpresaReglaNegocio.ambito_id.is_(None)
        )
        rule = _active(query, target).first()
        if rule:
            return ResolvedRule(_value(rule), f"empresa:{detector}" if scope_id else "empresa", rule.id)
    return ResolvedRule(default, "constante", None)


def rule_evidence(**rules: ResolvedRule) -> dict:
    return {name: resolved.evidence() for name, resolved in rules.items()}


def truthy(rule: ResolvedRule) -> bool:
    return str(rule.value).strip().lower() in {"1", "true", "si", "sí", "yes"}


def validate_rule_payload(clave: str, ambito_tipo: str | None, ambito_id: str | None, valor_num: float | None, valor_texto: str | None, valor_json: str | None) -> None:
    if clave not in RULE_KEYS:
        raise ValueError("Clave de regla no permitida")
    if ambito_tipo not in SCOPE_TYPES:
        raise ValueError("Ámbito de regla no permitido")
    if ambito_tipo == "empresa" and ambito_id and clave != "umbral_detector":
        raise ValueError("El ámbito empresa no admite identificador")
    if ambito_tipo != "empresa" and not (ambito_id or "").strip():
        raise ValueError("El ámbito requiere identificador")
    if clave == "lead_time_dias" and (valor_num is None or not 1 <= valor_num <= 365):
        raise ValueError("lead_time_dias debe estar entre 1 y 365")
    if clave == "margen_objetivo_pct" and (valor_num is None or not -100 <= valor_num <= 100):
        raise ValueError("margen_objetivo_pct debe estar entre -100 y 100")
    if clave == "umbral_detector" and (valor_num is None or valor_num < 0):
        raise ValueError("umbral_detector debe ser no negativo")
    if clave == "umbral_detector" and ambito_tipo != "empresa":
        raise ValueError("umbral_detector se configura en el ámbito empresa")
    if clave in {"cliente_estrategico", "sku_discontinuado"} and str(valor_texto or "").lower() not in {"true", "false", "1", "0", "si", "sí", "no"}:
        raise ValueError("La regla booleana debe indicar true o false")
    if clave == "familia_estacional":
        if ambito_tipo != "familia":
            raise ValueError("familia_estacional requiere ámbito familia")
        try:
            months = json.loads(valor_json or "[]")
        except json.JSONDecodeError as error:
            raise ValueError("familia_estacional debe ser JSON válido") from error
        if not isinstance(months, list) or any(not isinstance(month, int) or month < 1 or month > 12 for month in months):
            raise ValueError("familia_estacional debe contener meses entre 1 y 12")


def ensure_no_overlap(db: Session, candidate: EmpresaReglaNegocio, exclude_id: int | None = None) -> None:
    query = db.query(EmpresaReglaNegocio).filter(
        EmpresaReglaNegocio.empresa_id == candidate.empresa_id,
        EmpresaReglaNegocio.clave == candidate.clave,
        EmpresaReglaNegocio.ambito_tipo == candidate.ambito_tipo,
        EmpresaReglaNegocio.ambito_id == candidate.ambito_id,
        EmpresaReglaNegocio.vigente_desde <= (candidate.vigente_hasta or date.max),
        (EmpresaReglaNegocio.vigente_hasta.is_(None) | (EmpresaReglaNegocio.vigente_hasta >= candidate.vigente_desde)),
    )
    if exclude_id:
        query = query.filter(EmpresaReglaNegocio.id != exclude_id)
    if query.first():
        raise ValueError("La vigencia se solapa con otra regla del mismo ámbito")
