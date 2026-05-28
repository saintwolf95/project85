export const DataEngineering = () => {
  return (
    <div className="animate-in fade-in duration-500 flex flex-col items-center justify-center h-[80vh] text-center">
      <div className="bg-brand-cyan/10 p-6 rounded-full border border-brand-cyan/20 shadow-[0_0_20px_var(--color-brand-cyan)] mb-6">
        <svg className="w-12 h-12 text-brand-cyan" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
        </svg>
      </div>
      <h1 className="text-3xl font-bold text-white mb-4">Data Engineering</h1>
      <p className="text-slate-400 max-w-lg mx-auto text-lg">
        Módulo en construcción: Hub de integraciones API (ERP/E-Commerce) y monitorización en tiempo real de pipelines e ingesta de datos.
      </p>
    </div>
  );
};
