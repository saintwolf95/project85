"""Playbooks cerrados por detector para investigaciones con evidencia."""

FAMILY_DECLINE_PLAYBOOK = {
    "descarte": ["family_missing_days", "family_base_peak"],
    "cuantificacion": ["family_sales_comparison", "family_top_customers", "family_single_sku", "family_price_volume"],
    "alternativas": ["family_inventory_risk", "family_seasonality"],
}
GENERIC_PLAYBOOK = {
    "descarte": ["signal_summary"],
    "cuantificacion": ["family_sales_comparison", "family_top_customers", "family_price_volume"],
    "alternativas": ["family_inventory_risk"],
}
PLAYBOOKS = {
    "caida_facturacion_familia": FAMILY_DECLINE_PLAYBOOK,
    "precio_volumen_familia": FAMILY_DECLINE_PLAYBOOK,
    "erosion_mgd_familia": FAMILY_DECLINE_PLAYBOOK,
    "margen_bajo_objetivo": FAMILY_DECLINE_PLAYBOOK,
}


def get_playbook(detector: str) -> dict[str, list[str]]:
    return PLAYBOOKS.get(detector, GENERIC_PLAYBOOK)


def select_playbook_questions(detector: str, max_items: int = 8) -> list[str]:
    playbook = get_playbook(detector)
    return [item for phase in ("descarte", "cuantificacion", "alternativas") for item in playbook[phase]][:max_items]
