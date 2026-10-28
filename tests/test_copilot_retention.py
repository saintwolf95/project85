import unittest
from datetime import datetime, timedelta
from unittest.mock import patch

from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

from app.copilot_service import cleanup_old_chats


class CopilotRetentionTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        with self.engine.begin() as connection:
            connection.execute(text("PRAGMA foreign_keys=ON"))
            connection.execute(text("CREATE TABLE copilot_chats (id INTEGER PRIMARY KEY, usuario_id INTEGER NOT NULL, titulo TEXT NOT NULL, contexto_analitico TEXT NOT NULL, creado_en DATETIME, actualizado_en DATETIME)"))
            connection.execute(text("CREATE TABLE copilot_messages (id INTEGER PRIMARY KEY, chat_id INTEGER NOT NULL REFERENCES copilot_chats(id), rol TEXT NOT NULL, contenido TEXT NOT NULL, creado_en DATETIME)"))
            old = datetime.utcnow() - timedelta(days=31)
            recent = datetime.utcnow() - timedelta(days=1)
            for chat_id, user_id, updated in ((1, 10, old), (2, 10, recent), (3, 11, old)):
                connection.execute(text("INSERT INTO copilot_chats VALUES (:id, :uid, 'chat', '{}', :date, :date)"), {"id": chat_id, "uid": user_id, "date": updated})
                connection.execute(text("INSERT INTO copilot_messages VALUES (:id, :chat, 'user', 'contenido', :date)"), {"id": chat_id, "chat": chat_id, "date": updated})

    def test_elimina_solo_chats_caducados_del_usuario_y_sus_mensajes(self):
        with Session(self.engine) as session:
            cleanup_old_chats(session, 10)
            self.assertEqual(session.execute(text("SELECT id FROM copilot_chats ORDER BY id")).scalars().all(), [2, 3])
            self.assertEqual(session.execute(text("SELECT id FROM copilot_messages ORDER BY id")).scalars().all(), [2, 3])

    def test_error_revierte_sin_borrar_chats_ni_mensajes(self):
        with Session(self.engine) as session:
            original_delete = session.delete
            def marcar_y_fallar(chat):
                original_delete(chat)
                session.flush()
                raise RuntimeError("fallo simulado")
            with patch.object(session, "delete", side_effect=marcar_y_fallar):
                cleanup_old_chats(session, 10)
            self.assertEqual(session.execute(text("SELECT id FROM copilot_chats ORDER BY id")).scalars().all(), [1, 2, 3])
            self.assertEqual(session.execute(text("SELECT id FROM copilot_messages ORDER BY id")).scalars().all(), [1, 2, 3])


if __name__ == "__main__":
    unittest.main()
