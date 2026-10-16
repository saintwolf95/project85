"""Regresiones para los perfiles permitidos del AI Copilot."""
from types import SimpleNamespace
from unittest import TestCase
from unittest.mock import Mock

from app.copilot_models import create_copilot_completion, get_copilot_model_profile


class CopilotModelProfilesTests(TestCase):
    def test_profiles_exponen_la_jerarquia_luna_terra_sol(self):
        self.assertEqual(get_copilot_model_profile("luna"), {
            "model": "gpt-5.6-luna", "reasoning_effort": "none", "advanced": False,
        })
        self.assertEqual(get_copilot_model_profile("terra"), {
            "model": "gpt-5.6-terra", "reasoning_effort": "medium", "advanced": True,
        })
        self.assertEqual(get_copilot_model_profile("sol"), {
            "model": "gpt-5.6-sol", "reasoning_effort": "high", "advanced": True,
        })

    def test_valores_heredados_y_desconocidos_tienen_un_destino_seguro(self):
        self.assertEqual(get_copilot_model_profile("fast")["model"], "gpt-5.6-luna")
        self.assertEqual(get_copilot_model_profile("thinking")["model"], "gpt-5.6-terra")
        self.assertEqual(get_copilot_model_profile("ultra_thinking")["model"], "gpt-5.6-sol")
        self.assertEqual(get_copilot_model_profile("no-permitido")["model"], "gpt-5.6-terra")

    def test_completacion_solo_usa_el_modelo_y_esfuerzo_del_perfil(self):
        completion = Mock(return_value=SimpleNamespace(choices=[]))
        client = SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=completion)))

        response, model_name = create_copilot_completion(
            client,
            [{"role": "developer", "content": "instrucción"}],
            "sol",
        )

        self.assertEqual(response.choices, [])
        self.assertEqual(model_name, "gpt-5.6-sol")
        completion.assert_called_once_with(
            model="gpt-5.6-sol",
            messages=[{"role": "developer", "content": "instrucción"}],
            reasoning_effort="high",
        )

    def test_fallback_solo_cubre_falta_de_acceso_al_modelo(self):
        class ModelAccessError(Exception):
            status_code = 403

        completion = Mock(side_effect=[
            ModelAccessError("model not available for this account"),
            SimpleNamespace(choices=[]),
        ])
        client = SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=completion)))

        _, model_name = create_copilot_completion(client, [{"role": "user", "content": "hola"}], "terra")

        self.assertEqual(model_name, "gpt-4o")
        self.assertEqual(completion.call_args_list[0].kwargs["model"], "gpt-5.6-terra")
        self.assertEqual(completion.call_args_list[1].kwargs["model"], "gpt-4o")
