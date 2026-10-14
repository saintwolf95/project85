import OfficeViva from '../agent-office-viva/OfficeViva';
import './AgentOffice.css';

export default function OfficeDemo() {
  return <main className="office-demo-page">
    <div className="office-demo-heading"><span>Demo local · módulo cerrado</span><strong>Oficina Viva</strong></div>
    <section className="office-demo-stage" aria-label="Demostración de Oficina Viva">
      <OfficeViva demo theme="dark" />
    </section>
  </main>;
}
