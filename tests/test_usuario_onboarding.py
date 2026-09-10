import unittest

from sqlalchemy import create_engine
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import sessionmaker

from app.models import Empresa, Usuario, UsuarioOnboarding, UsuarioOnboardingEvento


class UsuarioOnboardingTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        Empresa.__table__.create(self.engine)
        Usuario.__table__.create(self.engine)
        UsuarioOnboarding.__table__.create(self.engine)
        UsuarioOnboardingEvento.__table__.create(self.engine)
        self.session = sessionmaker(bind=self.engine)()
        self.session.add(Empresa(id=1, nombre="Empresa de prueba"))
        self.session.add(Usuario(id=1, empresa_id=1, email="user@example.com", supabase_uid="test-user", nombre="Usuario"))
        self.session.commit()

    def tearDown(self):
        self.session.close()
        self.engine.dispose()

    def test_progress_is_unique_per_user_company_and_flow_and_keeps_events(self):
        progress = UsuarioOnboarding(usuario_id=1, empresa_id=1, flujo="control_ia_tour", estado="completado", paso_ultimo=6)
        self.session.add(progress)
        self.session.commit()
        self.session.add(UsuarioOnboardingEvento(onboarding_id=progress.id, evento="finalizacion", paso=6))
        self.session.commit()

        stored = self.session.query(UsuarioOnboarding).one()
        self.assertEqual(stored.estado, "completado")
        self.assertEqual(stored.paso_ultimo, 6)
        self.assertEqual(self.session.query(UsuarioOnboardingEvento).one().evento, "finalizacion")

        self.session.add(UsuarioOnboarding(usuario_id=1, empresa_id=1, flujo="control_ia_tour"))
        with self.assertRaises(IntegrityError):
            self.session.commit()
        self.session.rollback()


if __name__ == "__main__":
    unittest.main()
