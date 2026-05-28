export const DemandForecasting = () => {
  return (
    <div className="animate-in fade-in duration-500 flex flex-col items-center justify-center h-[80vh] text-center">
      <div className="bg-brand-cyan/10 p-6 rounded-full border border-brand-cyan/20 shadow-[0_0_20px_var(--color-brand-cyan)] mb-6">
        <svg className="w-12 h-12 text-brand-cyan" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
        </svg>
      </div>
      <h1 className="text-3xl font-bold text-white mb-4">Demand Forecasting</h1>
      <p className="text-slate-400 max-w-lg mx-auto text-lg">
        Módulo en construcción: Predicción de Demanda mediante IA con proyecciones de ventas a 30/60/90 días, análisis de estacionalidad y monitor de precisión del modelo.
      </p>
    </div>
  );
};
