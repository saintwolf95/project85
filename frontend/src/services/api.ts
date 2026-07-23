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
  errors: DataImportError[];
  warnings: DataImportError[];
  date_min?: string;
  date_max?: string;
}

export interface DataImportStatus {
  products: number;
  inventory_records: number;
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
  link.download = dataset === 'sales' ? 'fivemin_ventas.csv' : `plantilla_${dataset}.csv`;
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
  const params: any = { page, limit };
  if (search) params.search = search;
  if (matriz_abc) params.matriz_abc = matriz_abc;
  if (stock_out_risk !== undefined) params.stock_out_risk = stock_out_risk;

  const response = await api.get('/analytics/inventory-abc', { params });
  return response.data;
};

export const getDashboardKpis = async (abcClass: string = 'all', familia: string = 'all'): Promise<DashboardKPIsResponse> => {
  const params: any = {};
  if (abcClass !== 'all') params.abc_class = abcClass;
  if (familia !== 'all') params.familia = familia;
  const response = await api.get('/analytics/dashboard-kpis', { params });
  return response.data;
};

export const getAiInsights = async (abcClass: string = 'all', familia: string = 'all'): Promise<AIInsight[]> => {
  const params: any = {};
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

export const getCopilotChats = async (): Promise<CopilotChat[]> => {
  const response = await api.get('/copilot/chats');
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
  } catch (error: any) {
    if (error.response?.status === 404) return null;
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

// --- Agent Chat ---
export interface AgentChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export const getAgentChat = async (agentName: string): Promise<AgentChatMessage[]> => {
  const response = await api.get(`/agents/${agentName}/chat`);
  return response.data;
};

export const sendAgentMessage = async (agentName: string, history: AgentChatMessage[]): Promise<{ reply: string }> => {
  const response = await api.post(`/agents/${agentName}/chat`, { history });
  return response.data;
};
