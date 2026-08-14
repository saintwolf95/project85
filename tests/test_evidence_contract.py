import unittest

from app.evidence_contract import verify_report


class EvidenceContractTests(unittest.TestCase):
    def setUp(self):
        self.evidence = {
            "e1": {"ventas_eur": 17041.78, "periodo": "2026-05-01"},
            "e2": {"variacion_pct": -8.2},
        }

    def test_accepts_number_with_its_own_evidence_key_and_rounding(self):
        result = verify_report("Las ventas fueron 17.041,78 € [e1].", self.evidence)
        self.assertTrue(result["valid"])

    def test_rejects_number_without_citation_on_same_line(self):
        result = verify_report("Las ventas fueron 17.041,78 €.", self.evidence)
        self.assertFalse(result["valid"])
        self.assertTrue(result["uncited_claims"])

    def test_rejects_number_cited_from_another_block(self):
        result = verify_report("Las ventas fueron 17.041,78 € [e2].", self.evidence)
        self.assertFalse(result["valid"])
        self.assertIn("17.041,78", result["orphan_numbers"])
