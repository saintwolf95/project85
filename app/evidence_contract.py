"""Validación estándar de evidencia para informes analíticos."""
import re
from typing import Any


NUMBER = re.compile(r"(?<![\w\[])\-?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d+)?%?")


def numeric_forms(value: Any) -> set[str]:
    if isinstance(value, bool) or value is None:
        return set()
    if isinstance(value, (int, float)):
        number = float(value)
        forms = {str(int(number)) if number.is_integer() else str(number)}
        for digits in (0, 1, 2):
            forms.add(f"{number:.{digits}f}")
            forms.add(f"{number:,.{digits}f}".replace(",", "_").replace(".", ",").replace("_", "."))
        return forms
    if isinstance(value, dict):
        return set().union(*(numeric_forms(item) for item in value.values()))
    if isinstance(value, list):
        return set().union(*(numeric_forms(item) for item in value))
    return set(NUMBER.findall(str(value)))


def verify_report(report: str, evidence: dict[str, dict]) -> dict:
    cited = set(re.findall(r"\[(e\d+)\]", report))
    valid_keys = set(evidence)
    orphan_numbers, uncited_claims = [], []
    for line_number, line in enumerate(report.splitlines(), start=1):
        numbers = NUMBER.findall(line)
        if not numbers:
            continue
        line_citations = set(re.findall(r"\[(e\d+)\]", line))
        if not line_citations:
            uncited_claims.append({"line": line_number, "numbers": numbers})
            continue
        allowed = set().union(*(numeric_forms(evidence[key]) for key in line_citations if key in evidence))
        orphan_numbers.extend(number for number in numbers if number.rstrip("%") not in allowed and number not in allowed)
    invalid_citations = sorted(cited - valid_keys)
    return {"valid": not (orphan_numbers or uncited_claims or not cited or invalid_citations), "citations": sorted(cited), "orphan_numbers": sorted(set(orphan_numbers)), "uncited_claims": uncited_claims, "missing_or_invalid_citations": invalid_citations}
