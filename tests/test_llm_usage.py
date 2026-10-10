import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.llm_usage import record_llm_usage
from app.models import Empresa, LlmUsageEvent


class LlmUsageTests(unittest.TestCase):
    def test_records_only_metadata_and_token_counts(self):
        with tempfile.TemporaryDirectory() as directory:
            engine = create_engine(f"sqlite:///{Path(directory) / 'usage.db'}")
            Empresa.__table__.create(engine)
            LlmUsageEvent.__table__.create(engine)
            with Session(engine) as db:
                db.add(Empresa(id=1, nombre="Uno"))
                db.commit()
            response = SimpleNamespace(usage=SimpleNamespace(prompt_tokens=12, completion_tokens=8, total_tokens=20))
            record_llm_usage(engine, response, empresa_id=1, feature="agent_report", model="gpt-4o", run_id="run-1", agent_name="maria")
            with Session(engine) as db:
                event = db.query(LlmUsageEvent).one()
                self.assertEqual((event.input_tokens, event.output_tokens, event.total_tokens), (12, 8, 20))
                self.assertEqual(event.run_id, "run-1")
                self.assertNotIn("prompt", event.__table__.columns.keys())
                self.assertNotIn("response", event.__table__.columns.keys())
            engine.dispose()


if __name__ == "__main__":
    unittest.main()
