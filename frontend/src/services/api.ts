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
  unidades_venta_60d: number;
  ventas_60d: number;
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

export interface ProductHistoryDaily {
  fecha: string;
  ventas_eur: number;
  inventario_eur: number;
}

export interface ProductHistoryResponse {
  producto_id: number;
  nombre: string;
  historico: ProductHistoryDaily[];
}

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8080/api/v1',
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

export const runAgentAnalysis = async (): Promise<AgentInsight> => {
  const response = await api.post('/agents/run');
  return response.data;
};
