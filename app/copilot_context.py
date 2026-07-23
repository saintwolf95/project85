"""Resumen operativo compacto que se inyecta en el contexto privado del Copilot."""

import json
import logging
from datetime import date, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from cachetools import TTLCache
from sqlalchemy import text
from sqlalchemy.orm import Session


logger = logging.getLogger(__name__)
ZONA_NEGOCIO = ZoneInfo("Europe/Madrid")
RESUMENES_CACHE = TTLCache(maxsize=128, ttl=60)


def _fechas_negocio() -> dict[str, date]:
    hoy = datetime.now(ZONA_NEGOCIO).date()
    return {
        "hoy": hoy,
        "ayer": hoy - timedelta(days=1),
        "inicio_30d": hoy - timedelta(days=29),
        "inicio_90d": hoy - timedelta(days=89),
        "inicio_30d_anterior": hoy - timedelta(days=59),
        "fin_30d_anterior": hoy - timedelta(days=30),
        "inicio_mes": hoy.replace(day=1),
    }


def _fila_a_dict(fila: Any) -> dict[str, Any]:
    if fila is None:
        return {}
    try:
        return dict(fila._mapping)
    except AttributeError:
        return dict(fila)


def construir_resumen_operativo(db: Session, empresa_id: int) -> str:
    """Calcula una fotografia de negocio sin mezclar datos entre empresas."""
    cache_key = int(empresa_id)
    if cache_key in RESUMENES_CACHE:
        return RESUMENES_CACHE[cache_key]

    fechas = _fechas_negocio()
    parametros = {"empresa_id": cache_key, **fechas}
    resumen_sql = text(
        """
        WITH ventas AS (
            SELECT
                COALESCE(SUM(CASE WHEN vh.fecha_venta BETWEEN :inicio_90d AND :hoy THEN vh.ingreso_total ELSE 0 END), 0) AS ventas_90d,
                COALESCE(SUM(CASE WHEN vh.fecha_venta BETWEEN :inicio_30d AND :hoy THEN vh.ingreso_total ELSE 0 END), 0) AS ventas_30d,
                COALESCE(SUM(CASE WHEN vh.fecha_venta BETWEEN :inicio_30d_anterior AND :fin_30d_anterior THEN vh.ingreso_total ELSE 0 END), 0) AS ventas_30d_anterior,
                COALESCE(SUM(CASE WHEN vh.fecha_venta BETWEEN :inicio_mes AND :hoy THEN vh.ingreso_total ELSE 0 END), 0) AS ventas_mes,
                COALESCE(SUM(CASE WHEN vh.fecha_venta = :ayer THEN vh.ingreso_total ELSE 0 END), 0) AS ventas_ayer,
                COALESCE(SUM(CASE WHEN vh.fecha_venta BETWEEN :inicio_90d AND :hoy THEN vh.cantidad_vendida ELSE 0 END), 0) AS unidades_90d,
                COALESCE(SUM(CASE WHEN vh.fecha_venta BETWEEN :inicio_90d AND :hoy THEN vh.margen_bruto_eur ELSE 0 END), 0) AS margen_90d,
                COALESCE(SUM(CASE WHEN vh.fecha_venta BETWEEN :inicio_90d AND :hoy THEN vh.margen_destino_eur ELSE 0 END), 0) AS margen_destino_90d
            FROM ventas_historicas vh
            JOIN productos p ON p.id = vh.producto_id
            WHERE p.empresa_id = :empresa_id
        ), inventario AS (
            SELECT
                COUNT(DISTINCT p.id) AS productos,
                COUNT(DISTINCT inv.producto_id) AS productos_con_inventario,
                COALESCE(SUM(p.costo_unitario * inv.stock_disponible), 0) AS inventario_eur,
                COALESCE(SUM(inv.stock_disponible), 0) AS inventario_unidades,
                COALESCE(SUM(CASE WHEN pm.riesgo_rotura THEN 1 ELSE 0 END), 0) AS productos_en_alerta,
                COALESCE(SUM(CASE WHEN pm.abc IN ('A', 'B') AND pm.riesgo_rotura THEN 1 ELSE 0 END), 0) AS alertas_abc_ab,
                COALESCE(SUM(CASE WHEN pm.dias_cobertura > 120 THEN 1 ELSE 0 END), 0) AS productos_sobrestock,
                COALESCE(SUM(CASE WHEN pm.dias_cobertura > 120 THEN p.costo_unitario * inv.stock_disponible ELSE 0 END), 0) AS valor_sobrestock,
                COALESCE(SUM(CASE WHEN pm.dias_cobertura >= 999 AND inv.stock_disponible > 0 THEN 1 ELSE 0 END), 0) AS productos_sin_venta_con_stock
            FROM productos p
            LEFT JOIN inventario_snapshot inv ON inv.producto_id = p.id
            LEFT JOIN producto_metricas pm ON pm.producto_id = p.id
            WHERE p.empresa_id = :empresa_id
        )
        SELECT ventas.*, inventario.*
        FROM ventas CROSS JOIN inventario
        """
    )
    matriz_sql = text(
        """
        WITH ventas_producto AS (
            SELECT vh.producto_id,
                   COALESCE(SUM(vh.ingreso_total), 0) AS ventas_90d
            FROM ventas_historicas vh
            JOIN productos p ON p.id = vh.producto_id
            WHERE p.empresa_id = :empresa_id
              AND vh.fecha_venta BETWEEN :inicio_90d AND :hoy
            GROUP BY vh.producto_id
        )
        SELECT COALESCE(pm.matriz_abc, 'Sin clasificar') AS cuadrante,
               COUNT(DISTINCT p.id) AS productos,
               COALESCE(SUM(p.costo_unitario * inv.stock_disponible), 0) AS inventario_eur,
               COALESCE(SUM(vp.ventas_90d), 0) AS ventas_90d
        FROM productos p
        LEFT JOIN inventario_snapshot inv ON inv.producto_id = p.id
        LEFT JOIN producto_metricas pm ON pm.producto_id = p.id
        LEFT JOIN ventas_producto vp ON vp.producto_id = p.id
        WHERE p.empresa_id = :empresa_id
        GROUP BY COALESCE(pm.matriz_abc, 'Sin clasificar')
        ORDER BY inventario_eur DESC
        """
    )

    try:
        resumen = _fila_a_dict(db.execute(resumen_sql, parametros).first())
        ventas_90d = float(resumen.get("ventas_90d") or 0)
        margen_90d = float(resumen.get("margen_90d") or 0)
        margen_destino_90d = float(resumen.get("margen_destino_90d") or 0)
        ventas_30d = float(resumen.get("ventas_30d") or 0)
        ventas_30d_anterior = float(resumen.get("ventas_30d_anterior") or 0)
        resumen["margen_pct_90d"] = (margen_90d / ventas_90d * 100) if ventas_90d else 0
        resumen["margen_destino_pct_90d"] = (margen_destino_90d / ventas_90d * 100) if ventas_90d else 0
        resumen["variacion_ventas_30d_pct"] = (
            (ventas_30d - ventas_30d_anterior) / abs(ventas_30d_anterior) * 100
            if ventas_30d_anterior
            else 0
        )
        matriz = [_fila_a_dict(fila) for fila in db.execute(matriz_sql, parametros).fetchall()]
        payload = {
            "fecha_calculo": fechas["hoy"].isoformat(),
            "periodos": {
                "ayer": fechas["ayer"].isoformat(),
                "ultimos_30_dias": f"{fechas['inicio_30d'].isoformat()} a {fechas['hoy'].isoformat()}",
                "30_dias_anteriores": f"{fechas['inicio_30d_anterior'].isoformat()} a {fechas['fin_30d_anterior'].isoformat()}",
                "ultimos_90_dias": f"{fechas['inicio_90d'].isoformat()} a {fechas['hoy'].isoformat()}",
                "mes_actual": f"{fechas['inicio_mes'].isoformat()} a {fechas['hoy'].isoformat()}",
            },
            "totales": resumen,
            "matriz_abcxyz": matriz,
        }
        resultado = (
            "=== RESUMEN OPERATIVO PRIVADO ===\n"
            "Usa estos valores agregados como referencia exacta. Las ventas son euros facturados; "
            "MG es el margen bruto y MGD es el margen en destino. El inventario solo está disponible "
            "cuando existen snapshots cargados. No muestres nombres tecnicos de tablas.\n"
            + json.dumps(payload, ensure_ascii=False, default=str)
        )
        RESUMENES_CACHE[cache_key] = resultado
        return resultado
    except Exception:
        logger.warning("No se pudo construir el resumen operativo del Copilot", exc_info=True)
        return ""


def invalidar_resumen_operativo(empresa_id: int) -> None:
    RESUMENES_CACHE.pop(int(empresa_id), None)
