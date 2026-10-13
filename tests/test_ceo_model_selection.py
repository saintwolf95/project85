"""Regresiones de selección de modelo exclusiva de la consolidación CEO."""
from types import SimpleNamespace
from unittest import TestCase
from unittest.mock import Mock, patch

from app.agents_service import _create_reasoning_completion, _configured_model


class ModelAccessError(Exception):
    status_code = 403


class CeoModelSelectionTests(TestCase):
    def _client(self, completion):
        return SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=completion)))

    def test_uses_requested_ceo_model_without_touching_fallback(self):
        completion = Mock(return_value=SimpleNamespace(choices=[]))
        response, model = _create_reasoning_completion(self._client(completion), [{"role": "user", "content": "x"}], "gpt-6.1-sol", "high", fallback_variable="CEO_MODEL_FALLBACK")

        self.assertEqual(model, "gpt-6.1-sol")
        self.assertEqual(response.choices, [])
        completion.assert_called_once_with(model="gpt-6.1-sol", messages=[{"role": "user", "content": "x"}], reasoning_effort="high")

    def test_falls_back_only_when_primary_model_is_not_permitted(self):
        completion = Mock(side_effect=[ModelAccessError("The model is not available for this account"), SimpleNamespace(choices=[])])

        with patch.dict("os.environ", {"CEO_MODEL_FALLBACK": "gpt-4o"}, clear=False):
            _, model = _create_reasoning_completion(self._client(completion), [{"role": "user", "content": "x"}], "gpt-5.6-terra", "medium", fallback_variable="CEO_MODEL_FALLBACK")

        self.assertEqual(model, "gpt-4o")
        self.assertEqual(completion.call_args_list[0].kwargs["model"], "gpt-5.6-terra")
        self.assertEqual(completion.call_args_list[1].kwargs["model"], "gpt-4o")
        self.assertEqual(completion.call_args_list[1].kwargs["temperature"], 0.2)

    def test_uses_default_when_model_environment_variable_is_blank(self):
        with patch.dict("os.environ", {"CEO_REPORT_MODEL": "  "}, clear=False):
            self.assertEqual(_configured_model("CEO_REPORT_MODEL", "gpt-6.1-sol"), "gpt-6.1-sol")
