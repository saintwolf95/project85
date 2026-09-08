import { useState, useRef, useEffect, useCallback } from 'react';
import { api, getCopilotChats, getCopilotChatHistory, deleteCopilotChat, renameCopilotChat, getBusinessContext, updateBusinessContext, uploadBusinessDocument, getLibreriaDocuments, getCopilotCapabilities } from '../services/api';
import type { CopilotCapabilities, CopilotChat, LibreriaDocument } from '../services/api';
import { Send, Bot, User, Zap, Brain, Plus, MessageSquare, Trash2, Pencil, Loader2, Menu, X, BookOpen, Save, Paperclip, Download, Copy, Check, Library, ChevronDown, RotateCcw, AlertCircle, ArrowRight } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid, Legend } from 'recharts';

const COLORS = ['#0071e3', '#5ac8fa', '#a7c7ed', '#c7ddf4', '#86868b'];
const MAX_SELECTED_LIB_DOCS = 10;

const THINKING_MESSAGES = [
  'Entendiendo tu pregunta...',
  'Calculando las métricas...',
  'Consultando tus datos...',
  'Buscando patrones relevantes...',
  'Preparando una respuesta clara...',
];

const SALES_SUGGESTIONS = [
  { label: 'Ventas año fiscal', prompt: '¿Cuáles son las ventas acumuladas del año fiscal?' },
  { label: 'Cómo va la empresa', prompt: '¿Cómo va la empresa?' },
  { label: 'Caídas del mes', prompt: 'Compara las ventas de este mes con el mes anterior y muestra los 5 SKU que más explican la caída' },
  { label: 'Margen y MGD', prompt: 'Compara ventas, margen y MGD de este mes con el mes anterior por familia' },
  { label: 'Productos A en caída', prompt: 'Identifica los productos clase A que más han caído en los últimos 30 días' },
  { label: 'Ventas por PM', prompt: 'Compara las ventas del año fiscal por Product Manager' },
];

const INVENTORY_SUGGESTIONS = [
  { label: 'Riesgo de rotura', prompt: '¿Qué productos tienen riesgo de rotura de stock inmediato?' },
  { label: 'Inventario por familia', prompt: 'Dame un resumen del inventario agrupado por familia de producto' },
  { label: 'Artículos AZ críticos', prompt: 'Muéstrame los artículos AZ con más ventas y menos inventario disponible' },
  { label: 'Capital clase C', prompt: '¿Cuánto inventario en euros tenemos en productos clase C?' },
  { label: 'Días cobertura A', prompt: 'Listado de productos clase A con menos de 15 días de cobertura' },
];

const SQL_EXPORT_PATTERN = /<!-- sql_export: [\s\S]*? -->/g;
const METRICS_MARKER_PATTERN = /<!-- copilot_metrics: ([A-Za-z0-9+/=]+) -->/;
const FOLLOWUPS_MARKER_PATTERN = /<!-- copilot_followups: ([A-Za-z0-9+/=]+) -->/;
const decodeBase64Utf8 = (encoded: string) => {
  try {
    const bytes = Uint8Array.from(atob(encoded), character => character.charCodeAt(0));
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
};
const cleanCopilotContent = (content: string) => content.replace(SQL_EXPORT_PATTERN, '').replace(METRICS_MARKER_PATTERN, '').replace(FOLLOWUPS_MARKER_PATTERN, '').trim();
const hasCopilotExport = (content: string) => /<!-- sql_export: [\s\S]*? -->/.test(content);

type CopilotMetricPayload = { data: Record<string, number>; formato?: 'eur' | 'unidades' | 'porcentaje' };

const parseCopilotMetrics = (content: string): CopilotMetricPayload | null => {
  const match = METRICS_MARKER_PATTERN.exec(content);
  if (!match) return null;
  try {
    const decoded = decodeBase64Utf8(match[1]);
    if (!decoded) return null;
    const parsed = JSON.parse(decoded) as CopilotMetricPayload;
    return parsed?.data ? parsed : null;
  } catch {
    return null;
  }
};

const METRIC_LABELS: Record<string, string> = {
  ventas_eur: 'Ventas',
  ventas_unidades: 'Unidades vendidas',
  inventario_eur: 'Inventario',
  inventario_unidades: 'Unidades en stock',
  beneficio_eur: 'Beneficio',
  margen_eur: 'Margen',
  margen_pct: 'Margen %',
  mgd_eur: 'Margen en destino',
  mgd_pct: 'Margen en destino %',
  periodo_actual: 'Periodo actual',
  periodo_anterior: 'Periodo anterior',
  variacion_absoluta: 'Variación',
  variacion_pct: 'Variación %',
  variacion_pp: 'Variación p.p.',
  variacion_ventas_eur: 'Variación ventas',
  variacion_ventas_pct: 'Variación ventas %',
  variacion_margen_pct: 'Variación margen %',
  sku_con_venta: 'SKU con venta',
  productos: 'Productos',
  clientes: 'Clientes',
  productos_alerta: 'Productos en alerta',
  productos_sobrestock: 'Productos con sobrestock',
};

const formatMetricValue = (key: string, value: number, formato?: CopilotMetricPayload['formato']) => {
  const isPercent = key.includes('pct') || key.includes('_pp') || formato === 'porcentaje' && key.includes('periodo');
  if (isPercent) return `${value.toLocaleString('es-ES', { maximumFractionDigits: 2 })}%`;
  if (key === 'productos' || key === 'sku_con_venta' || key.includes('unidades') || formato === 'unidades') {
    return value.toLocaleString('es-ES', { maximumFractionDigits: 0 });
  }
  if (formato === 'eur' || /(eur|ventas|beneficio|margen|inventario|variacion)/.test(key)) {
    return value.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 });
  }
  return value.toLocaleString('es-ES', { maximumFractionDigits: 2 });
};

const CopilotMetricCards = ({ content }: { content: string }) => {
  const payload = parseCopilotMetrics(content);
  if (!payload) return null;
  const entries = Object.entries(payload.data).filter(([, value]) => typeof value === 'number').slice(0, 6);
  if (!entries.length) return null;
  return (
    <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3">
      {entries.map(([key, value]) => {
        const isVariation = key.startsWith('variacion');
        const positive = value >= 0;
        return (
          <div key={key} className="rounded-[12px] border border-black/[0.08] bg-white px-3.5 py-3 dark:border-slate-700 dark:bg-slate-900/50">
            <p className="text-[11px] font-medium text-[#6e6e73] dark:text-slate-400">{METRIC_LABELS[key] || key.replaceAll('_', ' ')}</p>
            <p className={`ai-tnum mt-1 text-[15px] font-semibold ${isVariation ? (positive ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400') : 'text-[#1d1d1f] dark:text-white'}`}>
              {formatMetricValue(key, value, payload.formato)}
            </p>
          </div>
        );
      })}
    </div>
  );
};

type CopilotFollowup = { label: string; prompt: string };

const parseCopilotFollowups = (content: string): CopilotFollowup[] => {
  const match = FOLLOWUPS_MARKER_PATTERN.exec(content);
  if (!match) return [];
  try {
    const decoded = decodeBase64Utf8(match[1]);
    if (!decoded) return [];
    const parsed = JSON.parse(decoded) as { actions?: CopilotFollowup[] };
    return Array.isArray(parsed?.actions) ? parsed.actions.filter(action => action?.label && action?.prompt).slice(0, 4) : [];
  } catch {
    return [];
  }
};

const CopilotFollowups = ({ content, onSelect, disabled }: { content: string; onSelect: (prompt: string) => void; disabled: boolean }) => {
  const actions = parseCopilotFollowups(content);
  if (!actions.length) return null;
  return (
    <div className="mt-4 flex flex-wrap gap-2" aria-label="Siguientes análisis">
      {actions.map(action => (
        <button
          key={action.label}
          onClick={() => onSelect(action.prompt)}
          disabled={disabled}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-[10px] bg-[#0071e3]/10 px-3 py-1.5 text-[12px] font-medium text-[#0071e3] transition-colors hover:bg-[#0071e3]/15 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-brand-cyan/10 dark:text-brand-cyan"
        >
          {action.label}
          <ArrowRight size={12} />
        </button>
      ))}
    </div>
  );
};

const getCopilotErrorMessage = (error: unknown) => {
  const apiError = error as ChatApiError;
  if (apiError.response?.status === 429) return 'Has alcanzado el límite temporal de consultas. Espera un momento y vuelve a intentarlo.';
  if (apiError.response?.status === 401) return 'Tu sesión ha caducado. Inicia sesión de nuevo para continuar.';
  if (apiError.response?.data?.detail) return apiError.response.data.detail;
  return 'No he podido completar la consulta. Comprueba la conexión e inténtalo de nuevo.';
};

const MODEL_OPTIONS = [
  { value: 'fast' as const, label: 'Fast', sublabel: 'GPT-4o', icon: <Zap size={14} />, desc: 'Rápido y eficiente' },
  { value: 'thinking' as const, label: 'Thinking', sublabel: 'o3-mini', icon: <Brain size={14} />, desc: 'Razonamiento avanzado' },
  { value: 'ultra_thinking' as const, label: 'Ultra', sublabel: 'o1', icon: <Brain size={14} />, desc: 'Máxima profundidad' },
];

interface CopilotChartConfig {
  type?: string;
  title?: string;
  data?: Array<Record<string, string | number>>;
  xKey?: string;
  yKey?: string;
  color?: string;
}

const CopilotChartRenderer = ({ config }: { config: CopilotChartConfig }) => {
  if (!config || !config.type || !config.data) return null;
  const { type, title, data, xKey, yKey, color } = config;
  const baseColor = color || COLORS[0];

  return (
    <div className="my-6 w-full rounded-[16px] border border-black/[0.08] bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
      {title && <h4 className="mb-4 text-[16px] font-semibold text-[#1d1d1f] dark:text-white">{title}</h4>}
      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          {type === 'bar' ? (
            <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
              <CartesianGrid vertical={false} stroke="#d2d2d7" strokeDasharray="4 4" />
              <XAxis dataKey={xKey} tickLine={false} axisLine={false} tick={{ fill: '#86868b', fontSize: 12 }} />
              <YAxis tickLine={false} axisLine={false} tick={{ fill: '#86868b', fontSize: 12 }} />
              <Tooltip contentStyle={{ backgroundColor: 'var(--ai-surface)', border: '1px solid var(--ai-separator)', borderRadius: '12px', color: 'var(--ai-text)', boxShadow: '0 8px 24px rgba(0,0,0,0.08)' }} />
              <Bar dataKey={yKey} fill={baseColor} radius={[6, 6, 0, 0]} maxBarSize={40} isAnimationActive={false} />
            </BarChart>
          ) : type === 'line' ? (
            <LineChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
              <CartesianGrid vertical={false} stroke="#d2d2d7" strokeDasharray="4 4" />
              <XAxis dataKey={xKey} tickLine={false} axisLine={false} tick={{ fill: '#86868b', fontSize: 12 }} />
              <YAxis tickLine={false} axisLine={false} tick={{ fill: '#86868b', fontSize: 12 }} />
              <Tooltip contentStyle={{ backgroundColor: 'var(--ai-surface)', border: '1px solid var(--ai-separator)', borderRadius: '12px', color: 'var(--ai-text)', boxShadow: '0 8px 24px rgba(0,0,0,0.08)' }} />
              <Line type="monotone" dataKey={yKey} stroke={baseColor} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: '#ffffff' }} isAnimationActive={false} />
            </LineChart>
          ) : type === 'pie' ? (
            <PieChart>
              <Tooltip contentStyle={{ backgroundColor: 'var(--ai-surface)', border: '1px solid var(--ai-separator)', borderRadius: '12px', color: 'var(--ai-text)', boxShadow: '0 8px 24px rgba(0,0,0,0.08)' }} />
              <Legend />
              <Pie data={data} dataKey={yKey} nameKey={xKey} cx="50%" cy="50%" outerRadius={80} fill={baseColor} label isAnimationActive={false}>
                {data.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
            </PieChart>
          ) : (
            <div className="flex items-center justify-center h-full text-slate-500">Tipo no soportado ({type})</div>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
};

interface Message {
  id: string;
  role: 'user' | 'ai';
  content: string;
  timestamp: string;
}

const formatMessageTimestamp = (value: Date | string = new Date()) => {
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '';
  const pad = (number: number) => number.toString().padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())} ${pad(date.getDate())}-${pad(date.getMonth() + 1)}-${date.getFullYear()}`;
};

const now = () => formatMessageTimestamp();

const createGreetingMessage = (capabilities: CopilotCapabilities | null): Message => {
  const intro = capabilities?.inventario_disponible
    ? 'También tengo inventario disponible para analizar cobertura, roturas y capital inmovilizado.'
    : 'Actualmente trabajaré con ventas, rentabilidad y ABC comercial. Las funciones de stock, cobertura y ABCXYZ se activarán cuando cargues inventario.';
  return {
    id: 'greeting',
    role: 'ai',
    content: `¡Hola! Soy tu **AI Copilot** de Supply Chain. Estoy conectado a tus datos en tiempo real.\n\n${intro}\n\n- [¿Cómo va la empresa este mes?](#prompt:${encodeURIComponent('¿Cómo va la empresa este mes?')})\n- [¿Qué familias y SKU explican las mayores caídas?](#prompt:${encodeURIComponent('Compara las ventas de este mes con el mes anterior y muestra qué familias y SKU explican las mayores caídas')})\n- [¿Qué productos clase A necesitan revisión comercial?](#prompt:${encodeURIComponent('Identifica los productos clase A que más han caído en los últimos 30 días')})`,
    timestamp: now(),
  };
};

interface ChatApiError {
  response?: {
    status?: number;
    data?: { detail?: string };
  };
}

const CopyButton = ({ text }: { text: string }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(cleanCopilotContent(text));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('No se pudo copiar la respuesta', error);
      setCopied(false);
    }
  };
  return (
    <button
      onClick={handleCopy}
      className="absolute right-2 top-2 rounded-[8px] bg-[#f5f5f7] p-1.5 text-[#6e6e73] opacity-100 transition-opacity hover:text-[#0071e3] md:opacity-0 md:group-hover:opacity-100 dark:bg-slate-700 dark:text-slate-400"
      title="Copiar respuesta"
    >
      {copied ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}
    </button>
  );
};

const ThinkingIndicator = ({ modelPreference }: { modelPreference: string }) => {
  const [msgIdx, setMsgIdx] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setMsgIdx(i => (i + 1) % THINKING_MESSAGES.length), 1800);
    return () => clearInterval(interval);
  }, []);
  const isAdvanced = modelPreference !== 'fast';
  return (
    <div className="flex justify-start">
      <div className="flex gap-4 max-w-[80%]">
        <div className="flex-shrink-0 mt-1 hidden md:block">
          <div className="rounded-[10px] bg-[#0071e3]/10 p-2 text-[#0071e3] dark:bg-brand-cyan/10 dark:text-brand-cyan">
            <Bot size={20} />
          </div>
        </div>
        <div className="flex min-w-[200px] flex-col gap-2 rounded-[16px] rounded-tl-sm border border-black/[0.08] bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-brand-blue dark:bg-brand-cyan rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
            <div className="w-2 h-2 bg-brand-blue dark:bg-brand-cyan rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
            <div className="w-2 h-2 bg-brand-blue dark:bg-brand-cyan rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
          <span className="text-brand-blue dark:text-brand-cyan text-xs font-medium transition-all duration-500">
            {THINKING_MESSAGES[msgIdx]}
          </span>
          {isAdvanced && (
            <span className="text-[10px] text-slate-400 dark:text-slate-500">Modo razonamiento avanzado activado</span>
          )}
        </div>
      </div>
    </div>
  );
};

export const AiCopilot = () => {
  const [chats, setChats] = useState<CopilotChat[]>([]);
  const [currentChatId, setCurrentChatId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingChats, setIsLoadingChats] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [lastFailedQuestion, setLastFailedQuestion] = useState<string | null>(null);
  const [exportingMessage, setExportingMessage] = useState<string | null>(null);
  const [exportingChat, setExportingChat] = useState<'csv' | 'xlsx' | 'pdf' | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isContextModalOpen, setIsContextModalOpen] = useState(false);
  const [businessContext, setBusinessContext] = useState('');
  const [isSavingContext, setIsSavingContext] = useState(false);
  const [contextSaveError, setContextSaveError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [modelPreference, setModelPreference] = useState<'fast' | 'thinking' | 'ultra_thinking'>('fast');
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [capabilities, setCapabilities] = useState<CopilotCapabilities | null>(null);
  // LibrerIA docs
  const [libDocs, setLibDocs] = useState<LibreriaDocument[]>([]);
  const [selectedLibDocIds, setSelectedLibDocIds] = useState<number[]>([]);
  const [showLibPanel, setShowLibPanel] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const suggestions = capabilities?.inventario_disponible
    ? [...SALES_SUGGESTIONS, ...INVENTORY_SUGGESTIONS]
    : SALES_SUGGESTIONS;

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, isLoading, scrollToBottom]);

  // Cargar documentos LibrerIA disponibles
  useEffect(() => {
    getLibreriaDocuments().then(setLibDocs).catch(console.error);
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getCopilotChats(), getBusinessContext(), getCopilotCapabilities()])
      .then(async ([chatList, context, capabilityData]) => {
        if (cancelled) return;
        setChats(chatList);
        setBusinessContext(context);
        setCapabilities(capabilityData);
        if (chatList.length === 0) {
          setMessages([createGreetingMessage(capabilityData)]);
          setShowSuggestions(true);
          return;
        }
        const firstChat = chatList[0];
        setCurrentChatId(firstChat.id);
        const history = await getCopilotChatHistory(firstChat.id);
        if (cancelled) return;
        setMessages(history.length === 0
          ? [createGreetingMessage(capabilityData)]
          : history.map(item => ({
              id: item.id.toString(),
              role: item.role === 'assistant' ? 'ai' : 'user',
              content: item.content,
              timestamp: formatMessageTimestamp(item.creado_en),
            })));
        setShowSuggestions(history.length === 0);
      })
      .catch(error => {
        if (!cancelled) {
          console.error('Error cargando chats', error);
          setChatError(getCopilotErrorMessage(error));
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoadingChats(false);
      });
    return () => { cancelled = true; };
  }, []);

  const selectChat = async (chatId: number) => {
    if (isLoading || chatId === currentChatId) return;
    setCurrentChatId(chatId);
    setShowSuggestions(false);
    setChatError(null);
    setIsLoadingMessages(true);
    if (window.innerWidth < 1024) setIsSidebarOpen(false);
    try {
      const history = await getCopilotChatHistory(chatId);
      if (history.length === 0) {
        setMessages([createGreetingMessage(capabilities)]);
        setShowSuggestions(true);
      } else {
        const formatted: Message[] = history.map(h => ({
          id: h.id.toString(),
          role: h.role === 'assistant' ? 'ai' : 'user',
          content: h.content,
          timestamp: formatMessageTimestamp(h.creado_en),
        }));
        setMessages(formatted);
      }
    } catch (error) {
      console.error('Error cargando historial de chat', error);
      setChatError('No se pudo cargar este chat. Inténtalo de nuevo.');
    } finally {
      setIsLoadingMessages(false);
    }
  };

  const startNewChat = () => {
    if (isLoading) return;
    setCurrentChatId(null);
    setMessages([createGreetingMessage(capabilities)]);
    setShowSuggestions(true);
    setSelectedLibDocIds([]);
    setChatError(null);
    setLastFailedQuestion(null);
    if (window.innerWidth < 1024) setIsSidebarOpen(false);
  };

  const handleDeleteChat = async (e: React.MouseEvent, chatId: number) => {
    e.stopPropagation();
    if (!window.confirm('¿Seguro que quieres eliminar este chat?')) return;
    try {
      await deleteCopilotChat(chatId);
      const remaining = chats.filter(c => c.id !== chatId);
      setChats(remaining);
      if (currentChatId === chatId) {
        if (remaining.length > 0) selectChat(remaining[0].id);
        else startNewChat();
      }
    } catch (error) {
      console.error('Error eliminando chat', error);
    }
  };

  const handleRenameChat = async (e: React.MouseEvent, chat: CopilotChat) => {
    e.stopPropagation();
    const titulo = window.prompt('Nombre del chat', chat.titulo)?.trim();
    if (!titulo || titulo === chat.titulo) return;
    try {
      const renamed = await renameCopilotChat(chat.id, titulo);
      setChats(prev => prev.map(item => item.id === chat.id ? renamed : item));
    } catch (error) {
      console.error('Error renombrando chat', error);
      setChatError(getCopilotErrorMessage(error));
    }
  };

  const handleSend = async (textOverride?: string) => {
    const userText = (typeof textOverride === 'string' ? textOverride : input).trim();
    if (!userText || isLoading) return;
    if (typeof textOverride !== 'string') setInput('');
    setShowSuggestions(false);
    setChatError(null);
    setLastFailedQuestion(null);

    const newUserMsg: Message = { id: crypto.randomUUID(), role: 'user', content: userText, timestamp: now() };
    setMessages(prev => [...prev, newUserMsg]);
    setIsLoading(true);

    try {
      const historyPayload = [{ role: 'user', content: userText }];
      const response = await api.post('/copilot/chat', {
        chat_id: currentChatId,
        history: historyPayload,
        model_preference: modelPreference,
        libreria_doc_ids: selectedLibDocIds.length > 0 ? selectedLibDocIds : undefined,
      });

      const aiMsg: Message = {
        id: response.data.message_id ? response.data.message_id.toString() : crypto.randomUUID(),
        role: 'ai',
        content: response.data.reply,
        timestamp: now(),
      };
      setMessages(prev => [...prev, aiMsg]);
      setChatError(null);

      if (!currentChatId && response.data.chat_id) {
        setCurrentChatId(response.data.chat_id);
        getCopilotChats().then(setChats).catch(console.error);
      } else {
        setChats(prev => {
          const chat = prev.find(c => c.id === currentChatId);
          if (chat) {
            const filtered = prev.filter(c => c.id !== currentChatId);
            return [{ ...chat, actualizado_en: new Date().toISOString() }, ...filtered];
          }
          return prev;
        });
      }
    } catch (error) {
      console.error('Error calling copilot API:', error);
      setMessages(prev => prev.filter(message => message.id !== newUserMsg.id));
      setChatError(getCopilotErrorMessage(error));
      setLastFailedQuestion(userText);
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  };

  const downloadExport = async (messageId: string, format: 'csv' | 'xlsx') => {
    try {
      setExportingMessage(`${messageId}-${format}`);
      const response = await api.get(`/copilot/chat/message/${messageId}/export?format=${format}`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `exportacion_ia_${messageId}.${format}`);
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
    } catch (error) {
      console.error('Error descargando archivo', error);
      setChatError(getCopilotErrorMessage(error));
    } finally {
      setExportingMessage(null);
    }
  };

  const downloadChatExport = async (format: 'csv' | 'xlsx' | 'pdf') => {
    if (!currentChatId) return;
    try {
      setExportingChat(format);
      const response = await api.get(`/copilot/chats/${currentChatId}/export?format=${format}`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `conversacion_copilot_${currentChatId}.${format}`);
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error exportando conversación', error);
      setChatError(getCopilotErrorMessage(error));
    } finally {
      setExportingChat(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && input.trim()) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSaveContext = async () => {
    try {
      setIsSavingContext(true);
      setContextSaveError(null);
      await updateBusinessContext(businessContext);
      setIsContextModalOpen(false);
    } catch (error) {
      console.error('Error guardando contexto');
      setContextSaveError(getCopilotErrorMessage(error));
    } finally {
      setIsSavingContext(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    if (file.size > 1048576) { setUploadError('El archivo excede el límite máximo de 1MB.'); return; }
    try {
      setIsUploading(true);
      const response = await uploadBusinessDocument(file);
      if (response.success) {
        setBusinessContext(response.full_context);
        setUploadError(null);
      }
    } catch (error: unknown) {
      console.error('Error subiendo archivo:', error);
      setUploadError(getCopilotErrorMessage(error));
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const toggleLibDoc = (docId: number) => {
    setSelectedLibDocIds(prev =>
      prev.includes(docId)
        ? prev.filter(id => id !== docId)
        : prev.length >= MAX_SELECTED_LIB_DOCS
          ? prev
          : [...prev, docId]
    );
    if (!selectedLibDocIds.includes(docId) && selectedLibDocIds.length >= MAX_SELECTED_LIB_DOCS) {
      setChatError(`Puedes seleccionar como máximo ${MAX_SELECTED_LIB_DOCS} documentos de LibrerIA.`);
    }
  };

  const activeModel = MODEL_OPTIONS.find(m => m.value === modelPreference)!;

  return (
    <div className="copilot-apple relative mx-auto flex h-[calc(100vh-6rem)] w-full max-w-[1600px] flex-col gap-5 md:flex-row animate-in fade-in duration-500">

      {/* Botón Móvil Sidebar */}
      <div className="lg:hidden mb-2 flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-[20px] font-semibold tracking-[-0.01em] text-[#1d1d1f] dark:text-white">
          <Bot className="text-brand-blue dark:text-brand-cyan" size={24} /> AI Copilot
        </h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setContextSaveError(null); setIsContextModalOpen(true); }}
            className="rounded-[10px] border border-black/[0.08] bg-white p-2 text-[#0071e3] dark:border-slate-700 dark:bg-slate-800 dark:text-brand-cyan"
            title="Abrir Cerebro del Negocio"
            aria-label="Abrir Cerebro del Negocio"
          >
            <BookOpen size={20} />
          </button>
          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="rounded-[10px] border border-black/[0.08] bg-white p-2 dark:border-slate-700 dark:bg-slate-800"
            title="Abrir historial"
            aria-label="Abrir historial"
          >
            <Menu size={20} className="text-slate-700 dark:text-slate-300" />
          </button>
        </div>
      </div>

      {/* Backdrop para móvil */}
      {isSidebarOpen && (
        <button
          type="button"
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-10 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
          aria-label="Cerrar historial"
        />
      )}

      {/* Sidebar Historial */}
      <div className={`absolute z-20 flex h-full w-72 flex-col rounded-[20px] border border-black/[0.08] bg-white transition-transform duration-300 dark:border-slate-800 dark:bg-brand-surface lg:relative ${isSidebarOpen ? 'translate-x-0' : '-translate-x-[110%] lg:translate-x-0'}`} aria-label="Historial de chats">
        <div className="flex items-center justify-between border-b border-black/[0.08] p-4 dark:border-slate-800">
          <button onClick={startNewChat} disabled={isLoading} className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-[12px] bg-[#0071e3] py-2.5 text-[13px] font-medium text-white transition-colors hover:bg-[#0077ed] disabled:cursor-not-allowed disabled:opacity-50 dark:bg-brand-cyan dark:text-brand-dark">
            <Plus size={16} /> Nuevo Chat
          </button>
          <button onClick={() => setIsSidebarOpen(false)} className="lg:hidden ml-2 p-2 text-slate-500 hover:text-slate-800 dark:hover:text-white">
            <X size={20} />
          </button>
        </div>

        {currentChatId && (
          <div className="border-b border-black/[0.08] px-4 py-3 dark:border-slate-800">
            <p className="mb-2 text-[11px] font-medium text-[#6e6e73] dark:text-slate-400">Exportar conversación</p>
            <div className="grid grid-cols-3 gap-1.5">
              {(['pdf', 'xlsx', 'csv'] as const).map(format => (
                <button
                  key={format}
                  type="button"
                  onClick={() => downloadChatExport(format)}
                  disabled={Boolean(exportingChat) || isLoading}
                  className="inline-flex min-h-9 items-center justify-center gap-1 rounded-[9px] bg-[#f5f5f7] px-2 py-1.5 text-[11px] font-medium text-[#424245] transition-colors hover:text-[#0071e3] disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-800 dark:text-slate-300 dark:hover:text-brand-cyan"
                >
                  {exportingChat === format ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                  {format.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-1">
          {isLoadingChats ? (
            <div className="flex justify-center py-8"><Loader2 className="animate-spin text-brand-blue dark:text-brand-cyan" size={24} /></div>
          ) : chats.length === 0 ? (
            <p className="text-center text-slate-500 text-sm py-8">No hay chats recientes</p>
          ) : (
            chats.map(chat => (
              <div
                key={chat.id}
                onClick={() => selectChat(chat.id)}
                onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectChat(chat.id); } }}
                role="button"
                tabIndex={isLoading ? -1 : 0}
                aria-current={currentChatId === chat.id ? 'page' : undefined}
                className={`group flex min-h-11 items-center justify-between rounded-[10px] p-3 cursor-pointer transition-colors ${currentChatId === chat.id ? 'bg-[#0071e3]/10 text-[#0071e3] dark:bg-brand-cyan/10 dark:text-brand-cyan' : 'text-[#424245] hover:bg-black/[0.03] dark:text-slate-300 dark:hover:bg-slate-800/50'} ${isLoading ? 'cursor-not-allowed opacity-60' : ''}`}
              >
                <div className="flex items-center gap-3 overflow-hidden">
                  <MessageSquare size={16} className={currentChatId === chat.id ? 'text-brand-blue dark:text-brand-cyan' : 'text-slate-400 dark:text-slate-500'} />
                  <span className={`text-sm truncate ${currentChatId === chat.id ? 'text-brand-blue dark:text-brand-cyan font-medium' : 'text-slate-700 dark:text-slate-300'}`}>
                    {chat.titulo}
                  </span>
                </div>
                <div className="flex items-center opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
                  <button onClick={(e) => handleRenameChat(e, chat)} className="p-1.5 text-slate-400 hover:text-brand-blue dark:hover:text-brand-cyan hover:bg-brand-blue/10 dark:hover:bg-brand-cyan/10 rounded-md transition-all" title="Renombrar chat" aria-label="Renombrar chat">
                    <Pencil size={14} />
                  </button>
                  <button onClick={(e) => handleDeleteChat(e, chat.id)} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-md transition-all" title="Eliminar chat" aria-label="Eliminar chat">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* LibrerIA Panel en sidebar */}
        {libDocs.length > 0 && (
          <div className="border-t border-slate-200 dark:border-slate-800">
            <button
              onClick={() => setShowLibPanel(!showLibPanel)}
              className="flex min-h-11 w-full items-center justify-between px-4 py-3 text-[12px] font-medium text-[#6e6e73] transition-colors hover:bg-black/[0.03] dark:text-slate-400 dark:hover:bg-slate-800/50"
            >
              <span className="flex items-center gap-2">
                <Library size={14} />
                Docs LibrerIA
                {selectedLibDocIds.length > 0 && (
                  <span className="bg-brand-cyan text-brand-dark rounded-full px-1.5 py-0.5 text-[10px] font-bold">{selectedLibDocIds.length}</span>
                )}
              </span>
              <ChevronDown size={14} className={`transition-transform ${showLibPanel ? 'rotate-180' : ''}`} />
            </button>
            {showLibPanel && (
              <div className="p-3 space-y-1 max-h-48 overflow-y-auto custom-scrollbar">
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mb-2">Selecciona documentos que la IA usará como referencia</p>
                {libDocs.map(doc => (
                  <label htmlFor={`libreria-document-${doc.id}`} key={doc.id} className="flex items-center gap-2 p-2 rounded-lg cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                    <input
                      id={`libreria-document-${doc.id}`}
                      type="checkbox"
                      aria-label={`Usar ${doc.filename} como referencia`}
                      checked={selectedLibDocIds.includes(doc.id)}
                      onChange={() => toggleLibDoc(doc.id)}
                      className="rounded text-brand-blue dark:text-brand-cyan accent-cyan-500"
                    />
                    <div className="overflow-hidden">
                      <p className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate">{doc.filename}</p>
                      <p className="text-[10px] text-slate-400">{doc.department}</p>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Main Chat Area */}
      <div className="flex flex-1 flex-col overflow-hidden rounded-[20px] border border-black/[0.08] bg-white dark:border-slate-800 dark:bg-brand-surface">

        {/* Cabecera Desktop */}
        <div className="hidden items-center justify-between border-b border-black/[0.08] bg-[#fbfbfd] p-5 dark:border-slate-800 dark:bg-brand-dark/30 lg:flex">
          <div>
            <h1 className="flex items-center gap-3 text-[20px] font-semibold tracking-[-0.01em] text-[#1d1d1f] dark:text-white">
              <Bot className="text-brand-blue dark:text-brand-cyan" size={24} />
              AI Copilot
              <span className="flex items-center gap-1 rounded-full bg-[#0071e3]/10 px-2.5 py-1 text-[11px] font-medium text-[#0071e3] dark:bg-brand-cyan/10 dark:text-brand-cyan">
                {activeModel.icon} {activeModel.label} ({activeModel.sublabel})
              </span>
              {selectedLibDocIds.length > 0 && (
                <span className="flex items-center gap-1 text-xs font-normal px-2 py-0.5 rounded-full border bg-cyan-50 dark:bg-cyan-500/10 border-cyan-200 dark:border-cyan-500/30 text-cyan-600 dark:text-cyan-400">
                  <Library size={11} /> {selectedLibDocIds.length} doc{selectedLibDocIds.length > 1 ? 's' : ''} activo{selectedLibDocIds.length > 1 ? 's' : ''}
                </span>
              )}
            </h1>
            <p className="mt-1 text-[12px] text-[#6e6e73] dark:text-slate-400">Historial persistente de los últimos 30 días</p>
          </div>
          <button
            onClick={() => { setContextSaveError(null); setIsContextModalOpen(true); }}
            className="flex min-h-9 items-center gap-2 rounded-[10px] bg-[#f5f5f7] px-3 py-2 text-[12px] font-medium text-[#0071e3] transition-colors hover:bg-[#0071e3]/10 dark:bg-slate-800 dark:text-brand-cyan"
          >
            <BookOpen size={16} /> Cerebro del Negocio
          </button>
        </div>

        {/* Feed de mensajes */}
        <div className="flex-1 space-y-6 overflow-y-auto p-5 md:p-7 custom-scrollbar">
          {isLoadingChats || isLoadingMessages ? (
            <div className="h-full flex items-center justify-center text-slate-500 dark:text-slate-400">
              <div className="flex items-center gap-3 text-sm">
                <Loader2 size={18} className="animate-spin text-brand-blue dark:text-brand-cyan" />
                Cargando conversación...
              </div>
            </div>
          ) : (
          messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`flex gap-4 max-w-[96%] ${msg.role === 'user' ? 'md:max-w-[80%] flex-row-reverse' : 'md:max-w-[94%] flex-row'}`}>

                {/* Avatar */}
                <div className="flex-shrink-0 mt-1 hidden md:block">
                  {msg.role === 'user' ? (
                    <div className="rounded-[10px] bg-[#0071e3]/10 p-2 text-[#0071e3] dark:bg-brand-cyan/10 dark:text-brand-cyan">
                      <User size={20} />
                    </div>
                  ) : (
                    <div className="rounded-[10px] bg-[#0071e3]/10 p-2 text-[#0071e3] dark:bg-brand-cyan/10 dark:text-brand-cyan">
                      <Bot size={20} />
                    </div>
                  )}
                </div>

                {/* Burbuja */}
                <div className="flex flex-col gap-1">
                  <div className={`relative group rounded-[16px] p-5 leading-relaxed text-[15px] ${
                    msg.role === 'user'
                      ? 'whitespace-pre-wrap rounded-tr-sm bg-[#0071e3] text-white'
                      : 'whitespace-normal rounded-tl-sm border border-black/[0.08] bg-white text-[#424245] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
                  }`}>
                    {msg.role === 'user' ? (
                      msg.content
                    ) : (
                      <>
                        <CopyButton text={msg.content} />
                        <CopilotMetricCards content={msg.content} />
                        <div className="copilot-markdown max-w-none">
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            rehypePlugins={[rehypeSanitize]}
                            components={{
                              a({ children, href, ...props }) {
                                if (href?.startsWith('#prompt:')) {
                                  const promptText = decodeURIComponent(href.replace('#prompt:', ''));
                                  return (
                                    <button
                                      onClick={(e) => { e.preventDefault(); handleSend(promptText); }}
                                      disabled={isLoading}
                                      className="mr-2 mt-2 inline-flex min-h-9 items-center rounded-[10px] bg-[#0071e3]/10 px-3 py-2 text-left text-[13px] font-medium text-[#0071e3] transition-colors hover:bg-[#0071e3]/15 disabled:opacity-50 dark:bg-brand-cyan/10 dark:text-brand-cyan"
                                    >
                                      {children}
                                    </button>
                                  );
                                }
                                return <a {...props} href={href} target="_blank" rel="noopener noreferrer" className="text-brand-blue dark:text-brand-cyan hover:underline">{children}</a>;
                              },
                              code(props) {
                                const { children, className, ...rest } = props;
                                const match = /language-(\w+)/.exec(className || '');
                                const isInline = !match;
                                if (!isInline && match && match[1] === 'json') {
                                  try {
                                    const parsed = JSON.parse(String(children));
                                    if (parsed?.chartConfig) return <CopilotChartRenderer config={parsed.chartConfig} />;
                                  } catch (error) {
                                    console.debug('Configuración de gráfico no válida', error);
                                  }
                                }
                                return isInline
                                  ? <code className={className} {...rest}>{children}</code>
                                  : <pre className={className}><code {...rest}>{children}</code></pre>;
                              }
                            }}
                          >
                            {cleanCopilotContent(msg.content)}
                          </ReactMarkdown>
                          <CopilotFollowups content={msg.content} onSelect={handleSend} disabled={isLoading} />
                          {hasCopilotExport(msg.content) && (
                            <div className="mt-4 flex flex-wrap gap-3 border-t border-black/[0.08] pt-4 dark:border-slate-700/50">
                              <button onClick={() => downloadExport(msg.id, 'csv')} disabled={Boolean(exportingMessage)} className="inline-flex min-h-10 items-center gap-2 rounded-[10px] bg-[#f5f5f7] px-4 py-2 text-[13px] font-medium text-[#424245] transition-colors hover:text-[#0071e3] disabled:opacity-50 dark:bg-slate-700 dark:text-slate-300">
                                {exportingMessage === `${msg.id}-csv` ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />} Descargar CSV
                              </button>
                              <button onClick={() => downloadExport(msg.id, 'xlsx')} disabled={Boolean(exportingMessage)} className="inline-flex min-h-10 items-center gap-2 rounded-[10px] bg-[#0071e3] px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-[#0077ed] disabled:opacity-50">
                                {exportingMessage === `${msg.id}-xlsx` ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />} Descargar Excel (.xlsx)
                              </button>
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                  {msg.timestamp && (
                    <span className={`text-[10px] text-slate-400 dark:text-slate-600 px-1 ${msg.role === 'user' ? 'text-right' : 'text-left'}`}>
                      {msg.timestamp}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )))}

          {isLoading && <ThinkingIndicator modelPreference={modelPreference} />}

          {/* Chips de sugerencias */}
          {showSuggestions && !isLoading && (
            <div className="flex flex-wrap gap-2 py-2">
              {suggestions.map((s) => (
                <button
                  key={s.label}
                  onClick={() => handleSend(s.prompt)}
                  className="min-h-9 rounded-[10px] bg-[#f5f5f7] px-3 py-1.5 text-[12px] font-medium text-[#424245] transition-colors hover:bg-[#0071e3]/10 hover:text-[#0071e3] dark:bg-slate-800/60 dark:text-slate-300 dark:hover:bg-brand-cyan/10 dark:hover:text-brand-cyan"
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Controles y Caja de Input */}
        <div className="border-t border-black/[0.08] bg-[#fbfbfd] p-5 dark:border-slate-800 dark:bg-brand-dark/50">

          {chatError && (
            <div className="mb-3 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300" role="alert">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <div className="min-w-0 flex-1">
                <p>{chatError}</p>
                {lastFailedQuestion && (
                  <button onClick={() => handleSend(lastFailedQuestion)} disabled={isLoading} className="mt-2 inline-flex items-center gap-1.5 font-semibold hover:underline disabled:opacity-50">
                    <RotateCcw size={13} /> Reintentar consulta
                  </button>
                )}
              </div>
              <button onClick={() => setChatError(null)} className="shrink-0 rounded p-1 hover:bg-red-100 dark:hover:bg-red-500/20" title="Cerrar aviso" aria-label="Cerrar aviso">
                <X size={14} />
              </button>
            </div>
          )}

          {/* Selector de modelo */}
          <div className="mb-3 flex flex-wrap items-center gap-3 px-1">
            <span className="shrink-0 text-[12px] font-medium text-[#6e6e73] dark:text-slate-400">Motor IA</span>
            <div className="flex max-w-full gap-1 overflow-x-auto rounded-[10px] bg-[#e8e8ed] p-1 dark:bg-slate-800">
              {MODEL_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setModelPreference(opt.value)}
                  aria-pressed={modelPreference === opt.value}
                  title={opt.desc}
                  className={`flex min-h-8 items-center gap-1.5 rounded-[8px] px-3 py-1.5 text-[12px] font-medium transition-all ${
                    modelPreference === opt.value
                      ? 'bg-white text-[#0071e3] shadow-[0_1px_2px_rgba(0,0,0,0.1)] dark:bg-slate-700 dark:text-brand-cyan'
                      : 'text-[#6e6e73] hover:text-[#1d1d1f] dark:text-slate-400 dark:hover:text-slate-300'
                  }`}
                >
                  {opt.icon} {opt.label}
                  <span className="hidden sm:inline text-[10px] opacity-60">({opt.sublabel})</span>
                </button>
              ))}
            </div>
          </div>

          <div className="relative flex items-end">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              aria-busy={isLoading}
              placeholder="Pregunta por ventas, inventario, alertas o ABCXYZ..."
              aria-label="Pregunta al AI Copilot"
              maxLength={2000}
              rows={2}
              className="min-h-[76px] w-full max-h-40 resize-none overflow-y-auto rounded-[12px] border border-black/[0.12] bg-white py-3 pl-4 pr-14 text-[15px] text-[#1d1d1f] placeholder:text-[#86868b] transition-colors focus:border-[#0071e3] dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:border-brand-cyan"
            />
            <button
              onClick={() => handleSend()}
              disabled={isLoading || !input.trim()}
              title="Enviar pregunta"
              aria-label="Enviar pregunta"
              className="absolute bottom-3 right-3 rounded-[10px] bg-[#0071e3] p-2.5 text-white transition-colors hover:bg-[#0077ed] disabled:cursor-not-allowed disabled:opacity-50 dark:bg-brand-cyan dark:text-brand-dark"
            >
              {isLoading ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />}
            </button>
          </div>
          <p className="text-center text-slate-500 text-[10px] md:text-xs mt-2">
            Enter para enviar · Shift + Enter para una nueva línea · Respuestas en español
          </p>
        </div>
      </div>

      {/* Modal de Cerebro del Negocio */}
      {isContextModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="flex w-full max-w-2xl flex-col overflow-hidden rounded-[24px] bg-white shadow-[0_16px_48px_rgba(0,0,0,0.18)] dark:bg-[#1c1c1e]">
            <div className="flex items-center justify-between border-b border-black/[0.08] bg-[#fbfbfd] p-6 dark:border-white/[0.1] dark:bg-[#2c2c2e]">
              <div className="flex items-center gap-3">
                <div className="rounded-[10px] bg-[#0071e3]/10 p-2 text-[#0071e3] dark:bg-[#0a84ff]/15 dark:text-[#64d2ff]">
                  <BookOpen size={20} />
                </div>
                <div>
                  <h2 className="text-[20px] font-semibold tracking-[-0.02em] text-[#1d1d1f] dark:text-white">Cerebro del negocio</h2>
                  <p className="text-[13px] text-[#6e6e73] dark:text-slate-400">Contexto e instrucciones globales para la IA</p>
                </div>
              </div>
              <button onClick={() => setIsContextModalOpen(false)} aria-label="Cerrar contexto" className="rounded-full bg-[#e8e8ed] p-2 text-[#6e6e73] transition-colors hover:text-[#1d1d1f] dark:bg-slate-700 dark:text-slate-300 dark:hover:text-white">
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 p-6">
              <div className="flex justify-between items-end mb-4">
                <div>
                  <p className="text-[15px] text-[#424245] dark:text-slate-200">Redacta las reglas de tu empresa o adjunta un documento.</p>
                  <p className="mt-1 text-[12px] text-[#86868b]">
                    {businessContext.length} caracteres · El Copilot leerá este texto en cada consulta
                  </p>
                </div>
                <div>
                  <input type="file" ref={fileInputRef} className="hidden" accept=".txt,.csv,.pdf,.docx" onChange={handleFileUpload} />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading || isSavingContext}
                    className="flex min-h-9 items-center gap-2 rounded-[10px] bg-[#f5f5f7] px-3 py-1.5 text-[13px] font-medium text-[#424245] transition-colors hover:text-[#0071e3] disabled:opacity-50 dark:bg-slate-700 dark:text-slate-200"
                  >
                    {isUploading ? <Loader2 size={14} className="animate-spin" /> : <Paperclip size={14} />}
                    {isUploading ? 'Procesando...' : 'Adjuntar Documento'}
                  </button>
                </div>
              </div>
              {uploadError && (
                <div className="mb-3 flex items-center gap-2 rounded-[10px] border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-600 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">
                  <AlertCircle size={14} /> {uploadError}
                </div>
              )}
              {contextSaveError && (
                <div className="mb-3 px-3 py-2 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 text-red-600 dark:text-red-400 text-xs rounded-lg flex items-center gap-2" role="alert">
                  <AlertCircle size={14} /> {contextSaveError}
                </div>
              )}
              <textarea
                value={businessContext}
                onChange={(e) => setBusinessContext(e.target.value)}
                placeholder="Ejemplo: Nuestro objetivo es no tener más de 15 días de cobertura global. Los productos de la familia 'Portátiles' son estratégicos..."
                className="h-64 w-full resize-none rounded-[12px] border border-black/[0.12] bg-[#fbfbfd] p-4 text-[14px] text-[#1d1d1f] placeholder:text-[#86868b] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              />
            </div>

            <div className="flex justify-end gap-3 border-t border-black/[0.08] bg-[#fbfbfd] p-5 dark:border-white/[0.1] dark:bg-[#2c2c2e]">
              <button onClick={() => setIsContextModalOpen(false)} className="min-h-10 rounded-[10px] px-4 text-[14px] font-medium text-[#424245] transition-colors hover:bg-[#e8e8ed] dark:text-slate-300 dark:hover:bg-slate-700" disabled={isSavingContext}>
                Cancelar
              </button>
              <button
                onClick={handleSaveContext}
                disabled={isSavingContext}
                className="flex min-h-10 items-center gap-2 rounded-[10px] bg-[#0071e3] px-5 text-[14px] font-medium text-white transition-colors hover:bg-[#0077ed] disabled:opacity-70 dark:bg-[#0a84ff]"
              >
                {isSavingContext ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                {isSavingContext ? 'Guardando...' : 'Guardar Contexto'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
