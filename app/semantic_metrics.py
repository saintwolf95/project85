"""Definiciones comunes de las métricas de negocio del producto."""

DIAS_CLASIFICACION_ABC = 90
CORTE_PRINCIPAL = 0.80
CORTE_SECUNDARIO = 0.95

DEFINICIONES_METRICAS = {
    "ventas": "Suma de ingreso_total en euros.",
    "ventas_unidades": "Suma de cantidad_vendida.",
    "margen": "Suma de margen_bruto_eur; el porcentaje agregado se pondera sobre ventas.",
    "mgd": "Suma de margen_destino_eur; el porcentaje agregado se pondera sobre ventas.",
    "inventario": "Stock disponible multiplicado por costo_unitario en euros.",
    "abc": "Contribución acumulada de ventas en euros de los últimos 90 días: A 80%, B 15%, C 5%.",
    "xyz": "Contribución acumulada del inventario actual en euros: X 80%, Y 15%, Z 5%.",
}


def clasificar_por_contribucion(acumulado: float, clase_principal: str, clase_secundaria: str, clase_final: str) -> str:
    """Devuelve una clase 80/15/5 a partir de una contribución acumulada."""
    if acumulado <= 0:
        return clase_final
    if acumulado <= CORTE_PRINCIPAL:
        return clase_principal
    if acumulado <= CORTE_SECUNDARIO:
        return clase_secundaria
    return clase_final
