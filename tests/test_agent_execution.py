import tempfile
import unittest
from datetime import datetime, timedelta
from pathlib import Path
from unittest.mock import patch

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.agent_execution import ExecutionBusy, ExecutionProgress, read_execution
from app.agents_service import execute_agents_workflow
from app.models import AgentExecution, AgentInsights, Empresa


class AgentExecutionTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.engine = create_engine(f"sqlite:///{Path(self.directory.name) / 'test.db'}")
        for model in (Empresa, AgentInsights, AgentExecution):
            model.__table__.create(self.engine)
        self.db = Session(self.engine)
        self.db.add_all([Empresa(id=1, nombre="Uno"), Empresa(id=2, nombre="Dos")])
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()
        self.directory.cleanup()

    def test_progress_survives_new_session_and_is_company_scoped(self):
        progress = ExecutionProgress(self.engine, 1, True, False)
        progress.publish("María redactando", "maria")
        with Session(self.engine) as observer:
            result = read_execution(observer, 1)
            self.assertEqual(result["agentes"]["maria"], "trabajando")
            self.assertEqual(result["agentes"]["ceo"], "omitido")
            self.assertTrue(result["actualizado_en"].endswith("Z"))
            self.assertIsNone(read_execution(observer, 2))

    def test_duplicate_runs_are_rejected_but_other_company_can_run(self):
        ExecutionProgress(self.engine, 1, True, True)
        with self.assertRaises(ExecutionBusy):
            ExecutionProgress(self.engine, 1, True, True)
        ExecutionProgress(self.engine, 2, True, True)

    def test_stale_worker_cannot_overwrite_replacement(self):
        old = ExecutionProgress(self.engine, 1, True, True)
        self.db.query(AgentExecution).update({"actualizado_en": datetime.utcnow() - timedelta(hours=1)})
        self.db.commit()
        self.assertEqual(read_execution(self.db, 1)["estado"], "interrumpida")
        new = ExecutionProgress(self.engine, 1, True, False)
        with self.assertRaises(ExecutionBusy):
            old.publish("Final antiguo", status="completada", report_id=99)
        self.db.expire_all()
        self.assertEqual(read_execution(self.db, 1)["run_id"], new.run_id)

    @patch("app.agents_service.get_active_signals", return_value=[])
    @patch("app.agents_service.refresh_agent_episodes", return_value=[])
    @patch("app.agents_service.refresh_agent_signals")
    def test_workflow_publishes_only_real_agent_transitions_and_saved_report(self, *_):
        observed = []

        def narrate(db, company, agent):
            with Session(self.engine) as observer:
                state = read_execution(observer, company)
                observed.append(agent)
                self.assertEqual(state["agentes"][agent], "trabajando")
                self.assertIsNone(state["informe_id"])
            return "Hallazgos basados en evidencia."

        with patch("app.agents_service.narrate_agent_signals", side_effect=narrate):
            report = execute_agents_workflow(self.db, 1, True, False)
        self.assertEqual(observed, ["maria", "lucia", "mattia"])
        self.db.expire_all()
        state = read_execution(self.db, 1)
        self.assertEqual(state["estado"], "completada")
        self.assertEqual(state["informe_id"], report.id)
        self.assertEqual(state["agentes"]["mattia"], "completado")

    @patch("app.agents_service.get_active_signals", return_value=[])
    @patch("app.agents_service.refresh_agent_episodes", return_value=[])
    @patch("app.agents_service.refresh_agent_signals")
    def test_llm_failure_is_error_and_not_a_published_report(self, *_):
        with patch("app.agents_service.narrate_agent_signals", return_value="Error: API Key de OpenAI no configurada."):
            with self.assertRaises(RuntimeError):
                execute_agents_workflow(self.db, 1, True, False)
        state = read_execution(self.db, 1)
        self.assertEqual(state["estado"], "error")
        self.assertEqual(state["agentes"]["maria"], "error")
        self.assertEqual(state["agentes"]["lucia"], "interrumpido")
        self.assertEqual(self.db.query(AgentInsights).count(), 0)

    def test_no_phases_does_not_create_execution(self):
        with self.assertRaises(ValueError):
            execute_agents_workflow(self.db, 1, False, False)
        self.assertIsNone(read_execution(self.db, 1))


if __name__ == "__main__":
    unittest.main()
