export const GLOSARIO = {
  senal: { termino: 'Señal', definicion: 'Un hallazgo concreto de un analista. Siempre nace de un cálculo sobre tus datos, nunca de una impresión.' },
  episodio: { termino: 'Episodio', definicion: 'Un hecho de negocio que agrupa varias señales relacionadas. Es la unidad sobre la que decides.' },
  severidad: { termino: 'Severidad', definicion: 'De 1 a 5, cuánto pesa el hallazgo. El 5 es lo que no puede esperar.' },
  impacto_realizado: { termino: 'Impacto realizado', definicion: 'Dinero ya perdido en el período analizado.' },
  impacto_en_riesgo: { termino: 'Impacto en riesgo', definicion: 'Dinero que se perderá si no se actúa. Todavía evitable.' },
  impacto_capital: { termino: 'Impacto capital', definicion: 'Dinero inmovilizado en existencias. Ni perdido ni disponible.' },
  naturaleza: { termino: 'Naturaleza', definicion: 'Si el hallazgo es un riesgo o una oportunidad. Las oportunidades van en su propia sección.' },
  relacion: { termino: 'Explica / agrava / duplica', definicion: 'Cómo se relacionan dos señales dentro de un episodio: una es la causa de otra, una empeora a otra, o las dos cuentan lo mismo desde ángulos distintos.' },
  evidencia: { termino: 'Evidencia', definicion: 'Las filas de datos exactas sobre las que se sostiene un hallazgo. Puedes verlas todas.' },
  evidencia_degradada: { termino: 'Evidencia degradada', definicion: 'El análisis se apoya en datos con problemas de calidad conocidos. Léelo con reservas.' },
  investigacion: { termino: 'Investigación', definicion: 'Un expediente que responde por qué ocurrió algo, descartando explícitamente las explicaciones alternativas.' },
  decision: { termino: 'Decisión', definicion: 'Qué se va a hacer, quién lo lleva, qué métrica debe moverse y para cuándo.' },
  supresion: { termino: 'Supresión', definicion: 'Cuando descartas algo como falso, no vuelve a aparecer en 30 días.' },
  preparacion_datos: { termino: 'Preparación de datos', definicion: 'Qué fuentes hay disponibles hoy y, por tanto, qué análisis se pueden creer y cuáles no.' },
  factor_ponderacion: { termino: 'Factor de ponderación', definicion: 'Criterio usado solo para ordenar los episodios según impacto, confianza, severidad y persistencia. No representa una pérdida.' },
} as const;

export type GlossaryKey = keyof typeof GLOSARIO;
