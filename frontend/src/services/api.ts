import axios from 'axios';
import { supabase } from '../lib/supabase';

export interface ProductMetrics {
  producto_id: number;
  fecha: string;
  nombre_art: string;
  cod_art: string;
  pn: string;
  ean: string;
  costo_unit: number;
  peso: number;
  familia: string;
  marca: string;
  product_manager?: string;
  seccion?: string;
  precio_unit: number;
  unidades: number;
  valor_inv: number;
  inventario_disponible: boolean;
  unidades_venta_60d: number;
  ventas_60d: number;
  unidades_venta_90d: number;
  ventas_90d: number;
  abc: string;
  xyz: string;
  cv: number;
  matriz_abc: string;
  ads: number;
  dias_cobertura: number;
  riesgos_categorizados: string[];
}

export interface InventoryAnalyticsResponse {
  data: ProductMetrics[];
  total_records: number;
  total_pages: number;
  current_page: number;
}

export interface DashboardKPIsResponse {
  total_skus: number;
  volumen_total: number;
  costo_promedio: number;
  familia_top: string;
  valor_total_inventario: number;
  total_alertas_criticas: number;
  salud_stock_clase_a: number;
  abc_data: {name: string, value: number}[];
  family_data: {name: string, value: number}[];
}

export type DashboardPeriod = 'fytd' | '90d' | '30d';
export type DashboardBreakdownDimension = 'comercial' | 'cliente' | 'familia' | 'marca' | 'seccion';
export interface DashboardFilters {
  familia?: string;
  marca?: string;
  familia_marca?: string;
  seccion?: string;
}

export interface DashboardExecutiveResponse {
  ready: boolean;
  message?: string;
  period: DashboardPeriod;
  familia: string | null;
  filtros: {
    seleccion: Record<'familia' | 'marca' | 'familia_marca' | 'seccion', string | null>;
    opciones: { familias: string[]; marcas: string[]; familias_marca: string[]; secciones: string[] };
  };
  periodo_actual: { inicio: string; fin: string };
  periodo_comparable: { inicio: string; fin: string };
  cobertura: {
    ventas_desde: string;
    ventas_hasta: string;
    inventario_desde: string | null;
    inventario_hasta: string | null;
  };
  calidad: {
    comparable_completo: boolean;
    aviso_comparable: string | null;
  };
  actual: {
    ventas_eur: number;
    unidades: number;
    margen_eur: number;
    margen_pct: number | null;
    mgd_eur: number;
    mgd_pct: number | null;
    skus_con_venta: number;
    clientes_con_venta: number;
  };
  anterior: DashboardExecutiveResponse['actual'];
  variacion: {
    ventas_pct: number | null;
    ventas_eur: number;
    unidades_pct: number | null;
    margen_pct: number | null;
    mgd_pct: number | null;
    mgd_eur: number;
  };
  inventario: {
    fecha: string | null;
    valor_eur: number;
    unidades: number;
    skus: number;
    clase_a_total: number;
    clase_a_sin_stock: number;
    capital_sin_ventas_90d_eur: number;
    capital_clase_c_eur: number;
  };
  serie_mensual: {
    mes: string;
    mes_anterior: string;
    ventas_eur: number;
    ventas_anterior_eur: number;
    variacion_eur: number;
    variacion_pct: number | null;
    mgd_eur: number;
    mgd_anterior_eur: number;
  }[];
  impulsores_familia: {
    familia: string;
    actual_eur: number;
    anterior_eur: number;
    variacion_eur: number;
    variacion_pct: number | null;
  }[];
  cuadrantes: { cuadrante: string; skus: number; inventario_eur: number; ventas_90d_eur: number }[];
  desglose: {
    dimension: DashboardBreakdownDimension;
    etiqueta: string;
    resumen: {
      mayor_facturacion: DashboardBreakdownRow | null;
      mayor_crecimiento: DashboardBreakdownRow | null;
      mayor_caida: DashboardBreakdownRow | null;
    };
    filas: DashboardBreakdownRow[];
  };
  familias: string[];
}

export interface DashboardBreakdownRow {
  entidad_id: string;
  entidad: string;
  ventas_eur: number;
  ventas_anterior_eur: number;
  variacion_eur: number;
  variacion_pct: number | null;
  peso_pct: number;
  unidades: number;
  margen_eur: number;
  margen_pct: number | null;
  mgd_eur: number;
  skus: number;
}

export interface AIInsight {
  icono: string;
  titulo: string;
  sugerencia: string;
  tipo: string;
}

export interface LibreriaDocument {
  id: number;
  filename: string;
  department: string;
  upload_date: string;
}

export interface LibreriaChatResponse {
  answer: string;
  context_docs: number;
}

export interface ProductHistoryDaily {
  fecha: string;
  ventas_eur: number;
  inventario_eur: number | null;
}

export interface ProductHistoryResponse {
  producto_id: number;
  nombre: string;
  historico: ProductHistoryDaily[];
}

export type DataImportDataset = 'products' | 'inventory' | 'sales';

export interface DataImportError {
  line: number;
  message: string;
}

export interface DataImportValidation {
  dataset: DataImportDataset;
  valid: boolean;
  rows_total: number;
  rows_valid: number;
  rows_invalid: number;
  encoding: string;
  delimiter: string;
  columns: string[];
  unknown_columns: string[];
  ignored_powerbi_rows?: number;
  errors: DataImportError[];
  warnings: DataImportError[];
  date_min?: string;
  date_max?: string;
}

export interface DataImportStatus {
  products: number;
  clients: number;
  inventory_records: number;
  inventory_history_records: number;
  inventory_date_min: string | null;
  inventory_date_max: string | null;
  sales_records: number;
  sales_date_min: string | null;
  sales_date_max: string | null;
}

export interface DataImportResult {
  success: boolean;
  dataset: DataImportDataset;
  rows_received: number;
  records_affected: number;
  created: number;
  updated: number;
  products_created: number;
  products_updated: number;
  clients_created: number;
  clients_updated: number;
  replace_existing: boolean;
}

type UploadProgressHandler = (percentage: number) => void;

const reportUploadProgress = (loaded: number, total: number | undefined, onProgress?: UploadProgressHandler) => {
  if (!onProgress || !total) return;
  onProgress(Math.min(100, Math.round((loaded / total) * 100)));
};

export const getDataImportStatus = async (): Promise<DataImportStatus> => {
  const response = await api.get('/data-import/status');
  return response.data;
};

export const validateDataImport = async (
  dataset: DataImportDataset,
  file: File,
  onProgress?: UploadProgressHandler,
): Promise<DataImportValidation> => {
  const formData = new FormData();
  formData.append('dataset', dataset);
  formData.append('file', file);
  const response = await api.post('/data-import/validate', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: event => reportUploadProgress(event.loaded, event.total, onProgress),
  });
  return response.data;
};

export const loadDataImport = async (
  dataset: DataImportDataset,
  file: File,
  replaceExisting: boolean,
  onProgress?: UploadProgressHandler,
): Promise<DataImportResult> => {
  const formData = new FormData();
  formData.append('dataset', dataset);
  formData.append('file', file);
  formData.append('replace_existing', String(replaceExisting));
  formData.append('sales_mode', 'upsert_keys');
  const response = await api.post('/data-import/load', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: event => reportUploadProgress(event.loaded, event.total, onProgress),
  });
  return response.data;
};

export const downloadDataImportTemplate = async (dataset: DataImportDataset): Promise<void> => {
  const response = await api.get(`/data-import/template/${dataset}`, { responseType: 'blob' });
  const url = window.URL.createObjectURL(new Blob([response.data], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = dataset === 'sales'
    ? 'fivemin_ventas.csv'
    : dataset === 'inventory'
      ? 'fivemin_inventario.csv'
      : `plantilla_${dataset}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
};

export const uploadLibreriaDocument = async (file: File, department: string) => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('department', department);
  const response = await api.post<LibreriaDocument>('/libreria/upload', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    }
  });
  return response.data;
};

export const getLibreriaDocuments = async () => {
  const response = await api.get<LibreriaDocument[]>('/libreria/documents');
  return response.data;
};

export const deleteLibreriaDocument = async (docId: number) => {
  const response = await api.delete(`/libreria/documents/${docId}`);
  return response.data;
};

export const askLibreria = async (question: string, department_filter?: string) => {
  const response = await api.post<LibreriaChatResponse>('/libreria/ask', {
    question,
    department_filter: department_filter || 'all'
  });
  return response.data;
};

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || (import.meta.env.PROD ? 'https://fivemin-7hq5.onrender.com/api/v1' : 'http://localhost:8080/api/v1'),
});

api.interceptors.request.use(async (config) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.access_token) {
    config.headers.Authorization = `Bearer ${session.access_token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response && error.response.status === 401) {
      await supabase.auth.signOut();
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export const getInventoryAbc = async (
  page: number = 1, 
  limit: number = 50,
  search?: string,
  matriz_abc?: string,
  stock_out_risk?: boolean
): Promise<InventoryAnalyticsResponse> => {
  const params: Record<string, string | number | boolean> = { page, limit };
  if (search) params.search = search;
  if (matriz_abc) params.matriz_abc = matriz_abc;
  if (stock_out_risk !== undefined) params.stock_out_risk = stock_out_risk;

  const response = await api.get('/analytics/inventory-abc', { params });
  return response.data;
};

export const getDashboardKpis = async (abcClass: string = 'all', familia: string = 'all'): Promise<DashboardKPIsResponse> => {
  const params: Record<string, string> = {};
  if (abcClass !== 'all') params.abc_class = abcClass;
  if (familia !== 'all') params.familia = familia;
  const response = await api.get('/analytics/dashboard-kpis', { params });
  return response.data;
};

export const getAiInsights = async (abcClass: string = 'all', familia: string = 'all'): Promise<AIInsight[]> => {
  const params: Record<string, string> = {};
  if (abcClass !== 'all') params.abc_class = abcClass;
  if (familia !== 'all') params.familia = familia;
  const response = await api.get('/analytics/insights', { params });
  return response.data;
};

// --- Copilot API ---

export interface CopilotChat {
  id: number;
  titulo: string;
  actualizado_en: string;
}

export interface CopilotMessage {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  creado_en: string;
}

export interface CopilotCapabilities {
  inventario_disponible: boolean;
  ventas_disponibles: boolean;
  abc_ventas_disponible: boolean;
}

export const getCopilotChats = async (): Promise<CopilotChat[]> => {
  const response = await api.get('/copilot/chats');
  return response.data;
};

export const getCopilotCapabilities = async (): Promise<CopilotCapabilities> => {
  const response = await api.get('/copilot/capabilities');
  return response.data;
};

export const createCopilotChat = async (): Promise<CopilotChat> => {
  const response = await api.post('/copilot/chats');
  return response.data;
};

export const getCopilotChatHistory = async (chatId: number): Promise<CopilotMessage[]> => {
  const response = await api.get(`/copilot/chats/${chatId}`);
  return response.data;
};

export const deleteCopilotChat = async (chatId: number): Promise<{ success: boolean }> => {
  const response = await api.delete(`/copilot/chats/${chatId}`);
  return response.data;
};

export const getExecutiveDashboard = async (
  period: DashboardPeriod = 'fytd',
  filters: DashboardFilters = {},
  breakdown: DashboardBreakdownDimension = 'comercial',
): Promise<DashboardExecutiveResponse> => {
  const params: Record<string, string> = { period, breakdown };
  Object.entries(filters).forEach(([key, value]) => { if (value) params[key] = value; });
  const response = await api.get('/analytics/dashboard-executive', { params });
  return response.data;
};

export const renameCopilotChat = async (chatId: number, titulo: string): Promise<CopilotChat> => {
  const response = await api.put(`/copilot/chats/${chatId}`, { titulo });
  return response.data;
};

export const getBusinessContext = async (): Promise<string> => {
  const response = await api.get('/copilot/context');
  return response.data.contexto_negocio;
};

export const updateBusinessContext = async (contexto_negocio: string): Promise<{ success: boolean }> => {
  const response = await api.put('/copilot/context', { contexto_negocio });
  return response.data;
};

export const uploadBusinessDocument = async (file: File): Promise<{ success: boolean, extracted_text: string, full_context: string }> => {
  const formData = new FormData();
  formData.append('file', file);
  
  const response = await api.post('/copilot/context/upload', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
  return response.data;
};

// --- Agent Settings ---
export interface AgentSettings {
  fase1_active: boolean;
  fase2_active: boolean;
}

export const getAgentSettings = async (): Promise<AgentSettings> => {
  const response = await api.get('/agent-settings');
  return response.data;
};

export const updateAgentSettings = async (settings: AgentSettings): Promise<AgentSettings> => {
  const response = await api.post('/agent-settings', settings);
  return response.data;
};

export interface AgentInsight {
  id: number;
  fecha: string;
  fase1_raw_json?: string;
  fase1_maria_md?: string;
  fase1_lucia_md?: string;
  fase1_mattia_md?: string;
  fase2_ceo_markdown?: string;
}

export const getLatestAgentInsight = async (): Promise<AgentInsight | null> => {
  try {
    const response = await api.get('/agents/insights');
    return response.data;
  } catch (error: unknown) {
    if (axios.isAxiosError(error) && error.response?.status === 404) return null;
    throw error;
  }
};

export const getAllAgentInsights = async (): Promise<AgentInsight[]> => {
  const response = await api.get('/agents/insights/history');
  return response.data;
};

export const runAgentAnalysis = async (): Promise<AgentInsight> => {
  const response = await api.post('/agents/run');
  return response.data;
};

export const ensureDailyAgentReport = async (): Promise<AgentInsight> => {
  const response = await api.post('/agents/daily/ensure');
  return response.data;
};

export interface AgentStudySection {
  title: string;
  summary: string;
  rows?: Array<Record<string, string | number | null>>;
  metrics?: Record<string, number | null>;
  methodology?: string | string[];
  regression?: Record<string, string | number | boolean | null>;
  distribution?: Record<string, number | null>;
  weekday_seasonality?: Array<Record<string, string | number | null>>;
  series?: Array<Record<string, string | number | null>>;
}

export interface AgentStudies {
  agent: string;
  generated_at: string;
  source_date?: string;
  period?: { start: string; end: string };
  focus?: string;
  tabs: Record<string, AgentStudySection>;
  data_quality?: Record<string, string | number | boolean | null>;
  limitations: string[];
}

export const getAgentStudies = async (agentName: string): Promise<AgentStudies> => {
  const response = await api.get(`/agents/${agentName}/studies`);
  return response.data;
};

export interface AgentInvestigation {
  report: string | null;
  mode: 'verified' | 'fallback' | 'blocked';
  verification: { valid: boolean; orphan_numbers: string[]; uncited_claims?: Array<{ line: number; numbers: string[] }> };
}

export const runAgentInvestigation = async (agentName: string, question: string): Promise<AgentInvestigation> => {
  const response = await api.post(`/agents/${agentName}/investigations`, { question });
  return response.data;
};

export interface AgentDataReadiness {
  registros_ventas: number;
  productos_con_ventas: number;
  clientes_con_ventas: number;
  fecha_minima?: string;
  fecha_maxima?: string;
  ventas_sin_cliente: number;
  ventas_sin_familia: number;
  ventas_negativas: number;
  productos_con_inventario: number;
  unidades_stock: number;
  inventario_eur: number;
  productos_catalogo: number;
  ventas_disponibles: boolean;
  clientes_disponibles: boolean;
  inventario_disponible: boolean;
  compras_disponibles: boolean;
  nota_compras: string;
  completitud_dimensiones_pct: number;
}

export const getAgentDataReadiness = async (): Promise<AgentDataReadiness> => {
  const response = await api.get('/agents/readiness');
  return response.data;
};

// --- Agent Chat ---
export interface AgentChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export const getAgentChat = async (agentName: string): Promise<AgentChatMessage[]> => {
  const response = await api.get(`/agents/${agentName}/chat`);
  return response.data;
};

export const sendAgentMessage = async (agentName: string, history: AgentChatMessage[]): Promise<{ reply: string; suggestions?: string[] }> => {
  const response = await api.post(`/agents/${agentName}/chat`, { history });
  return response.data;
};
