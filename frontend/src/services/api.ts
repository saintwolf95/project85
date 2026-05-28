import axios from 'axios';

export interface ProductMetrics {
  fecha: string;
  nombre_art: string;
  cod_art: string;
  pn: string;
  ean: string;
  costo_unit: number;
  peso: number;
  familia: string;
  marca: string;
  precio_unit: number;
  unidades: number;
  valor_inv: number;
  unidades_venta_60d: number;
  ventas_60d: number;
  abc_ventas: string;
  abc_inventario: string;
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
  valor_total_inventario: number;
  total_alertas_criticas: number;
  salud_stock_clase_a: number;
}

export interface AIInsight {
  icono: string;
  titulo: string;
  sugerencia: string;
  tipo: string;
}

export const api = axios.create({
  baseURL: 'http://localhost:8080/api/v1',
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

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
