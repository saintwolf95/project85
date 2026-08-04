"""Planificador ligero de informes diarios para Control IA."""

import asyncio
import logging
from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import text

from .agents_service import ensure_daily_agent_insight
from .agent_studies import ensure_agent_study_snapshot
from .database import SessionLocal
from .models import Empresa


logger = logging.getLogger(__name__)
MADRID_TZ = ZoneInfo("Europe/Madrid")
REPORT_TIME = time(hour=6)


def run_daily_reports_once() -> None:
    db = SessionLocal()
    try:
        empresas = db.query(Empresa.id).all()
        for (empresa_id,) in empresas:
            has_sales = db.execute(text("""
                SELECT EXISTS (
                    SELECT 1
                    FROM ventas_historicas vh
                    JOIN productos p ON p.id = vh.producto_id
                    WHERE p.empresa_id = :empresa_id
                )
            """), {"empresa_id": empresa_id}).scalar()
            if has_sales:
                ensure_daily_agent_insight(db, empresa_id)
                for agent_name in ("maria", "lucia", "mattia"):
                    ensure_agent_study_snapshot(db, empresa_id, agent_name)
    except Exception:
        db.rollback()
        logger.exception("No se pudieron preparar los informes diarios")
    finally:
        db.close()


def seconds_until_next_report(now: datetime | None = None) -> float:
    current = now or datetime.now(MADRID_TZ)
    next_run = datetime.combine(current.date(), REPORT_TIME, tzinfo=MADRID_TZ)
    if next_run <= current:
        next_run += timedelta(days=1)
    return max(60.0, (next_run - current).total_seconds())


async def daily_reports_loop() -> None:
    while True:
        await asyncio.to_thread(run_daily_reports_once)
        await asyncio.sleep(seconds_until_next_report())
