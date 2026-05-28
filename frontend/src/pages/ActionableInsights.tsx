export const ActionableInsights = () => {
  return (
    <div className="animate-in fade-in duration-500 flex flex-col items-center justify-center h-[80vh] text-center">
      <div className="bg-brand-cyan/10 p-6 rounded-full border border-brand-cyan/20 shadow-[0_0_20px_var(--color-brand-cyan)] mb-6">
        <svg className="w-12 h-12 text-brand-cyan" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
      </div>
      <h1 className="text-3xl font-bold text-white mb-4">Actionable Insights</h1>
      <p className="text-slate-400 max-w-lg mx-auto text-lg">
        Módulo en construcción: Feed de notificaciones prioritarias, detección de riesgo de rotura de stock, oportunidades de reducción de capital inmovilizado y desviaciones de proveedores.
      </p>
    </div>
  );
};
