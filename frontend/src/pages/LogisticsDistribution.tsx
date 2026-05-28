export const LogisticsDistribution = () => {
  return (
    <div className="animate-in fade-in duration-500 flex flex-col items-center justify-center h-[80vh] text-center">
      <div className="bg-brand-cyan/10 p-6 rounded-full border border-brand-cyan/20 shadow-[0_0_20px_var(--color-brand-cyan)] mb-6">
        <svg className="w-12 h-12 text-brand-cyan" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0" />
        </svg>
      </div>
      <h1 className="text-3xl font-bold text-white mb-4">Logistics & Distribution</h1>
      <p className="text-slate-400 max-w-lg mx-auto text-lg">
        Módulo en construcción: Análisis de Coste de Servir, rendimiento de transportistas (Carrier Performance) y mapa de calor de cumplimiento geográfico.
      </p>
    </div>
  );
};
