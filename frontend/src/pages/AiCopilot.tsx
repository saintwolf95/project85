import { useState, useRef, useEffect, useCallback } from 'react';
import { api, getCopilotChats, getCopilotChatHistory, deleteCopilotChat, getBusinessContext, updateBusinessContext, uploadBusinessDocument, getLibreriaDocuments } from '../services/api';
import type { CopilotChat, LibreriaDocument } from '../services/api';
import { Send, Bot, User, Zap, Brain, Plus, MessageSquare, Trash2, Loader2, Menu, X, BookOpen, Save, Paperclip, Download, Copy, Check, Library, ChevronDown } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid, Legend } from 'recharts';

const COLORS = ['#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

const THINKING_MESSAGES = [
  'Analizando tu inventario...',
  'Generando consulta SQL...',
  'Consultando la base de datos...',
  'Interpretando resultados...',
  'Preparando respuesta...',
];

const QUICK_SUGGESTIONS = [
  { label: 'Top 10 por ventas 90D', prompt: '¿Cuáles son los 10 productos con más ventas en los últimos 90 días?' },
  { label: 'Riesgo de rotura', prompt: '¿Qué productos tienen riesgo de rotura de stock inmediato?' },
  { label: 'Artículos AZ críticos', prompt: 'Muéstrame los artículos AZ más peligrosos por capital inmovilizado' },
  { label: 'Resumen por familia', prompt: 'Dame un resumen del inventario agrupado por familia de producto' },
  { label: 'Capital clase C', prompt: '¿Cuánto capital tenemos inmovilizado en productos clase C?' },
  { label: 'Días cobertura A', prompt: 'Listado de productos clase A con menos de 15 días de cobertura' },
];

const SQL_EXPORT_PATTERN = /<!-- sql_export: .*? -->/g;
const cleanCopilotContent = (content: string) => content.replace(SQL_EXPORT_PATTERN, '').trim();
const hasCopilotExport = (content: string) => SQL_EXPORT_PATTERN.test(content);

const MODEL_OPTIONS = [
  { value: 'fast' as const, label: 'Fast', sublabel: 'GPT-4o', icon: <Zap size={14} />, color: 'text-brand-blue dark:text-brand-cyan', badge: '🟢', desc: 'Rápido y eficiente' },
  { value: 'thinking' as const, label: 'Thinking', sublabel: 'o3-mini', icon: <Brain size={14} />, color: 'text-purple-600 dark:text-purple-400', badge: '🟣', desc: 'Razonamiento avanzado' },
  { value: 'ultra_thinking' as const, label: 'Ultra', sublabel: 'o1', icon: <Brain size={14} />, color: 'text-rose-500 dark:text-rose-400', badge: '💎', desc: 'Máxima profundidad' },
];

const CopilotChartRenderer = ({ config }: { config: any }) => {
  if (!config || !config.type || !config.data) return null;
  const { type, title, data, xKey, yKey, color } = config;
  const baseColor = color || COLORS[0];

  return (
    <div className="my-6 p-4 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 shadow-sm w-full">
      {title && <h4 className="text-lg font-bold text-slate-900 dark:text-white mb-4 text-center">{title}</h4>}
      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          {type === 'bar' ? (
            <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.2} />
              <XAxis dataKey={xKey} stroke="#64748b" fontSize={12} angle={-45} textAnchor="end" height={60} />
              <YAxis stroke="#64748b" fontSize={12} />
              <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#fff' }} />
              <Bar dataKey={yKey} fill={baseColor} radius={[4, 4, 0, 0]} />
            </BarChart>
          ) : type === 'line' ? (
            <LineChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.2} />
              <XAxis dataKey={xKey} stroke="#64748b" fontSize={12} angle={-45} textAnchor="end" height={60} />
              <YAxis stroke="#64748b" fontSize={12} />
              <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#fff' }} />
              <Line type="monotone" dataKey={yKey} stroke={baseColor} strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
            </LineChart>
          ) : type === 'pie' ? (
            <PieChart>
              <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#fff' }} />
              <Legend />
              <Pie data={data} dataKey={yKey} nameKey={xKey} cx="50%" cy="50%" outerRadius={80} fill={baseColor} label>
                {data.map((_: any, index: number) => (
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

const CopyButton = ({ text }: { text: string }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(cleanCopilotContent(text));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };
  return (
    <button
      onClick={handleCopy}
      className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-md bg-slate-200/80 dark:bg-slate-700/80 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-500 dark:text-slate-400"
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
          <div className="bg-brand-cyan/20 p-2 rounded-lg border border-brand-cyan/50 text-brand-cyan shadow-[0_0_10px_var(--color-brand-cyan)]">
            <Bot size={20} />
          </div>
        </div>
        <div className="p-4 rounded-2xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-brand-cyan/30 rounded-tl-sm flex flex-col gap-2 min-w-[200px]">
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
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isContextModalOpen, setIsContextModalOpen] = useState(false);
  const [businessContext, setBusinessContext] = useState('');
  const [isSavingContext, setIsSavingContext] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [modelPreference, setModelPreference] = useState<'fast' | 'thinking' | 'ultra_thinking'>('fast');
  const [showSuggestions, setShowSuggestions] = useState(true);
  // LibrerIA docs
  const [libDocs, setLibDocs] = useState<LibreriaDocument[]>([]);
  const [selectedLibDocIds, setSelectedLibDocIds] = useState<number[]>([]);
  const [showLibPanel, setShowLibPanel] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const now = () => new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

  const defaultGreetingMessage: Message = {
    id: 'greeting',
    role: 'ai',
    content: `¡Hola! Soy tu **AI Copilot** de Supply Chain. Estoy conectado a tu base de datos en tiempo real.\n\nPuedes preguntarme sobre:\n\n- [¿Cuántas unidades tenemos en stock de los productos clase A?](#prompt:${encodeURIComponent('¿Cuántas unidades tenemos en stock de los productos clase A?')})\n- [¿Qué productos tienen riesgo de rotura inminente?](#prompt:${encodeURIComponent('¿Qué productos tienen riesgo de rotura inminente?')})\n- [¿Cuál es el valor total del inventario por familia?](#prompt:${encodeURIComponent('¿Cuál es el valor total del inventario por familia?')})\n- [Hazme un resumen ejecutivo del estado del inventario hoy](#prompt:${encodeURIComponent('Hazme un resumen ejecutivo del estado del inventario hoy')})`,
    timestamp: now(),
  };

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => { loadChats(); }, []);
  useEffect(() => { scrollToBottom(); }, [messages, isLoading, scrollToBottom]);

  // Cargar documentos LibrerIA disponibles
  useEffect(() => {
    getLibreriaDocuments().then(setLibDocs).catch(console.error);
  }, []);

  const loadChats = async () => {
    try {
      setIsLoadingChats(true);
      const data = await getCopilotChats();
      setChats(data);
      if (data.length > 0 && currentChatId === null) {
        selectChat(data[0].id);
      } else if (data.length === 0) {
        setMessages([defaultGreetingMessage]);
        setShowSuggestions(true);
      }
      const ctx = await getBusinessContext();
      setBusinessContext(ctx);
    } catch (error) {
      console.error('Error cargando chats', error);
    } finally {
      setIsLoadingChats(false);
    }
  };

  const selectChat = async (chatId: number) => {
    setCurrentChatId(chatId);
    setShowSuggestions(false);
    if (window.innerWidth < 1024) setIsSidebarOpen(false);
    try {
      const history = await getCopilotChatHistory(chatId);
      if (history.length === 0) {
        setMessages([defaultGreetingMessage]);
        setShowSuggestions(true);
      } else {
        const formatted: Message[] = history.map(h => ({
          id: h.id.toString(),
          role: h.role === 'assistant' ? 'ai' : 'user',
          content: h.content,
          timestamp: new Date(h.creado_en).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
        }));
        setMessages(formatted);
      }
    } catch (error) {
      console.error('Error cargando historial de chat', error);
    }
  };

  const startNewChat = () => {
    setCurrentChatId(null);
    setMessages([defaultGreetingMessage]);
    setShowSuggestions(true);
    setSelectedLibDocIds([]);
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

  const handleSend = async (textOverride?: string) => {
    const userText = (typeof textOverride === 'string' ? textOverride : input).trim();
    if (!userText || isLoading) return;
    if (typeof textOverride !== 'string') setInput('');
    setShowSuggestions(false);

    const newUserMsg: Message = { id: Date.now().toString(), role: 'user', content: userText, timestamp: now() };
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
        id: response.data.message_id ? response.data.message_id.toString() : (Date.now() + 1).toString(),
        role: 'ai',
        content: response.data.reply,
        timestamp: now(),
      };
      setMessages(prev => [...prev, aiMsg]);

      if (!currentChatId && response.data.chat_id) {
        setCurrentChatId(response.data.chat_id);
        loadChats().catch(console.error);
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
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'ai',
        content: '⚠️ Error de conexión con el motor analítico. Verifica que el backend y OpenAI estén configurados correctamente.',
        timestamp: now(),
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const downloadExport = async (messageId: string, format: 'csv' | 'xlsx') => {
    try {
      const response = await api.get(`/copilot/chat/message/${messageId}/export?format=${format}`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `exportacion_ia_${messageId}.${format}`);
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
    } catch {
      console.error('Error descargando archivo');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && input.trim()) handleSend();
  };

  const handleSaveContext = async () => {
    try {
      setIsSavingContext(true);
      await updateBusinessContext(businessContext);
      setIsContextModalOpen(false);
    } catch {
      console.error('Error guardando contexto');
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
    } catch (error: any) {
      console.error('Error subiendo archivo:', error);
      setUploadError(error.response?.data?.detail || 'Error subiendo el archivo.');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const toggleLibDoc = (docId: number) => {
    setSelectedLibDocIds(prev =>
      prev.includes(docId) ? prev.filter(id => id !== docId) : [...prev, docId]
    );
  };

  const activeModel = MODEL_OPTIONS.find(m => m.value === modelPreference)!;

  return (
    <div className="animate-in fade-in duration-500 h-[calc(100vh-6rem)] flex flex-col md:flex-row relative gap-4">

      {/* Botón Móvil Sidebar */}
      <div className="lg:hidden mb-2 flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <Bot className="text-brand-blue dark:text-brand-cyan" size={24} /> AI Copilot
        </h1>
        <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
          <Menu size={20} className="text-slate-700 dark:text-slate-300" />
        </button>
      </div>

      {/* Backdrop para móvil */}
      {isSidebarOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-10 lg:hidden" onClick={() => setIsSidebarOpen(false)} />
      )}

      {/* Sidebar Historial */}
      <div className={`absolute lg:relative z-20 h-full w-72 bg-white dark:bg-brand-surface border border-slate-200 dark:border-slate-800 rounded-xl flex flex-col shadow-2xl lg:shadow-lg transition-transform duration-300 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-[110%] lg:translate-x-0'}`}>
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
          <button onClick={startNewChat} className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-brand-blue dark:bg-brand-cyan text-white dark:text-brand-dark rounded-lg hover:bg-brand-blue/90 dark:hover:bg-white transition-colors font-medium text-sm">
            <Plus size={16} /> Nuevo Chat
          </button>
          <button onClick={() => setIsSidebarOpen(false)} className="lg:hidden ml-2 p-2 text-slate-500 hover:text-slate-800 dark:hover:text-white">
            <X size={20} />
          </button>
        </div>

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
                className={`group flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors ${currentChatId === chat.id ? 'bg-brand-blue/10 dark:bg-brand-cyan/10 border border-brand-blue/20 dark:border-brand-cyan/20' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50 border border-transparent'}`}
              >
                <div className="flex items-center gap-3 overflow-hidden">
                  <MessageSquare size={16} className={currentChatId === chat.id ? 'text-brand-blue dark:text-brand-cyan' : 'text-slate-400 dark:text-slate-500'} />
                  <span className={`text-sm truncate ${currentChatId === chat.id ? 'text-brand-blue dark:text-brand-cyan font-medium' : 'text-slate-700 dark:text-slate-300'}`}>
                    {chat.titulo}
                  </span>
                </div>
                <button onClick={(e) => handleDeleteChat(e, chat.id)} className="opacity-0 group-hover:opacity-100 p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-md transition-all" title="Eliminar chat">
                  <Trash2 size={14} />
                </button>
              </div>
            ))
          )}
        </div>

        {/* LibrerIA Panel en sidebar */}
        {libDocs.length > 0 && (
          <div className="border-t border-slate-200 dark:border-slate-800">
            <button
              onClick={() => setShowLibPanel(!showLibPanel)}
              className="w-full flex items-center justify-between px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
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
                  <label key={doc.id} className="flex items-center gap-2 p-2 rounded-lg cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                    <input
                      type="checkbox"
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
      <div className="flex-1 bg-white dark:bg-brand-surface border border-slate-200 dark:border-slate-800 rounded-xl flex flex-col overflow-hidden shadow-lg dark:shadow-[0_0_20px_rgba(0,245,255,0.02)]">

        {/* Cabecera Desktop */}
        <div className="hidden lg:flex p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-brand-dark/30 justify-between items-center">
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
              <Bot className="text-brand-blue dark:text-brand-cyan" size={24} />
              AI Copilot
              <span className={`flex items-center gap-1 text-xs font-normal px-2 py-0.5 rounded-full border ${
                activeModel.value === 'fast' ? 'bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/30 text-blue-600 dark:text-blue-400' :
                activeModel.value === 'thinking' ? 'bg-purple-50 dark:bg-purple-500/10 border-purple-200 dark:border-purple-500/30 text-purple-600 dark:text-purple-400' :
                'bg-rose-50 dark:bg-rose-500/10 border-rose-200 dark:border-rose-500/30 text-rose-600 dark:text-rose-400'
              }`}>
                {activeModel.badge} {activeModel.label} ({activeModel.sublabel})
              </span>
              {selectedLibDocIds.length > 0 && (
                <span className="flex items-center gap-1 text-xs font-normal px-2 py-0.5 rounded-full border bg-cyan-50 dark:bg-cyan-500/10 border-cyan-200 dark:border-cyan-500/30 text-cyan-600 dark:text-cyan-400">
                  <Library size={11} /> {selectedLibDocIds.length} doc{selectedLibDocIds.length > 1 ? 's' : ''} activo{selectedLibDocIds.length > 1 ? 's' : ''}
                </span>
              )}
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Historial persistente · 30 días de retención</p>
          </div>
          <button
            onClick={() => setIsContextModalOpen(true)}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-brand-blue dark:text-brand-cyan bg-brand-blue/10 dark:bg-brand-cyan/10 hover:bg-brand-blue/20 dark:hover:bg-brand-cyan/20 rounded-lg transition-colors border border-brand-blue/20 dark:border-brand-cyan/20 shadow-sm"
          >
            <BookOpen size={16} /> Cerebro del Negocio
          </button>
        </div>

        {/* Feed de mensajes */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 custom-scrollbar">
          {messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`flex gap-4 max-w-[90%] md:max-w-[80%] ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>

                {/* Avatar */}
                <div className="flex-shrink-0 mt-1 hidden md:block">
                  {msg.role === 'user' ? (
                    <div className="bg-brand-blue/10 dark:bg-brand-blue/20 p-2 rounded-lg border border-brand-blue/30 dark:border-brand-blue/50 text-brand-blue">
                      <User size={20} />
                    </div>
                  ) : (
                    <div className="bg-brand-blue/10 dark:bg-brand-cyan/20 p-2 rounded-lg border border-brand-blue/30 dark:border-brand-cyan/50 text-brand-blue dark:text-brand-cyan dark:shadow-[0_0_10px_var(--color-brand-cyan)]">
                      <Bot size={20} />
                    </div>
                  )}
                </div>

                {/* Burbuja */}
                <div className="flex flex-col gap-1">
                  <div className={`relative group p-4 rounded-2xl whitespace-pre-wrap leading-relaxed text-sm ${
                    msg.role === 'user'
                      ? 'bg-brand-blue text-white rounded-tr-sm shadow-sm'
                      : 'bg-slate-100 dark:bg-slate-800/80 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-brand-cyan/30 rounded-tl-sm shadow-sm'
                  }`}>
                    {msg.role === 'user' ? (
                      msg.content
                    ) : (
                      <>
                        <CopyButton text={msg.content} />
                        <div className="prose dark:prose-invert max-w-none prose-p:leading-relaxed prose-pre:bg-slate-100 dark:prose-pre:bg-slate-900 prose-pre:border prose-pre:border-slate-200 dark:prose-pre:border-slate-700 prose-a:text-brand-blue dark:prose-a:text-brand-cyan prose-table:text-sm prose-th:bg-slate-200 dark:prose-th:bg-slate-700 prose-td:border prose-th:border prose-td:border-slate-300 dark:prose-td:border-slate-600 prose-td:p-2 prose-th:p-2">
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            rehypePlugins={[rehypeSanitize]}
                            components={{
                              a({ className, children, href, ...props }) {
                                if (href?.startsWith('#prompt:')) {
                                  const promptText = decodeURIComponent(href.replace('#prompt:', ''));
                                  return (
                                    <button
                                      onClick={(e) => { e.preventDefault(); handleSend(promptText); }}
                                      disabled={isLoading}
                                      className="inline-flex items-center mt-2 mr-2 px-4 py-2 bg-brand-blue/10 dark:bg-brand-cyan/10 text-brand-blue dark:text-brand-cyan hover:bg-brand-blue/20 dark:hover:bg-brand-cyan/20 rounded-full text-sm font-medium transition-colors text-left border border-brand-blue/20 dark:border-brand-cyan/20 cursor-pointer disabled:opacity-50"
                                    >
                                      {children}
                                    </button>
                                  );
                                }
                                return <a href={href} target="_blank" rel="noopener noreferrer" className="text-brand-blue dark:text-brand-cyan hover:underline" {...props}>{children}</a>;
                              },
                              code(props) {
                                const { children, className, ...rest } = props;
                                const match = /language-(\w+)/.exec(className || '');
                                const isInline = !match;
                                if (!isInline && match && match[1] === 'json') {
                                  try {
                                    const parsed = JSON.parse(String(children));
                                    if (parsed?.chartConfig) return <CopilotChartRenderer config={parsed.chartConfig} />;
                                  } catch {}
                                }
                                return isInline
                                  ? <code className={className} {...rest}>{children}</code>
                                  : <pre className={className}><code {...rest}>{children}</code></pre>;
                              }
                            }}
                          >
                            {cleanCopilotContent(msg.content)}
                          </ReactMarkdown>
                          {hasCopilotExport(msg.content) && (
                            <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700/50 flex flex-wrap gap-3">
                              <button onClick={() => downloadExport(msg.id, 'csv')} className="inline-flex items-center gap-2 px-4 py-2 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-sm font-medium transition-colors border border-slate-300 dark:border-slate-600 shadow-sm">
                                <Download size={16} /> Descargar CSV
                              </button>
                              <button onClick={() => downloadExport(msg.id, 'xlsx')} className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-100 dark:bg-emerald-500/20 hover:bg-emerald-200 dark:hover:bg-emerald-500/30 text-emerald-700 dark:text-emerald-400 rounded-lg text-sm font-medium transition-colors border border-emerald-200 dark:border-emerald-500/30 shadow-sm">
                                <Download size={16} /> Descargar Excel (.xlsx)
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
          ))}

          {isLoading && <ThinkingIndicator modelPreference={modelPreference} />}

          {/* Chips de sugerencias */}
          {showSuggestions && !isLoading && (
            <div className="flex flex-wrap gap-2 py-2">
              {QUICK_SUGGESTIONS.map((s) => (
                <button
                  key={s.label}
                  onClick={() => handleSend(s.prompt)}
                  className="px-3 py-1.5 text-xs bg-slate-100 dark:bg-slate-800/60 hover:bg-brand-blue/10 dark:hover:bg-brand-cyan/10 text-slate-600 dark:text-slate-300 hover:text-brand-blue dark:hover:text-brand-cyan border border-slate-200 dark:border-slate-700 hover:border-brand-blue/30 dark:hover:border-brand-cyan/30 rounded-full transition-all font-medium"
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Controles y Caja de Input */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-brand-dark/50">

          {/* Selector de modelo */}
          <div className="flex items-center gap-3 mb-3 px-1">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider shrink-0">Motor AI:</span>
            <div className="flex bg-slate-200 dark:bg-slate-800 p-1 rounded-lg gap-1">
              {MODEL_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setModelPreference(opt.value)}
                  title={opt.desc}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                    modelPreference === opt.value
                      ? `bg-white dark:bg-slate-700 ${opt.color} shadow-sm`
                      : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                  }`}
                >
                  {opt.icon} {opt.label}
                  <span className="hidden sm:inline text-[10px] opacity-60">({opt.sublabel})</span>
                </button>
              ))}
            </div>
          </div>

          <div className="relative flex items-center">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Pregunta a la IA sobre tu inventario..."
              className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 rounded-xl pl-4 pr-12 py-4 focus:outline-none focus:border-brand-blue dark:focus:border-brand-cyan focus:ring-1 focus:ring-brand-blue dark:focus:ring-brand-cyan transition-colors"
              disabled={isLoading}
            />
            <button
              onClick={() => handleSend()}
              disabled={isLoading || !input.trim()}
              className="absolute right-3 p-2 bg-brand-blue dark:bg-brand-cyan text-white dark:text-brand-dark rounded-lg hover:bg-brand-blue/90 dark:hover:bg-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-md dark:shadow-[0_0_10px_var(--color-brand-cyan)]"
            >
              <Send size={20} />
            </button>
          </div>
          <p className="text-center text-slate-500 text-[10px] md:text-xs mt-2">
            SupplyChain Copilot genera consultas seguras limitadas a tu entorno · Responde siempre en español
          </p>
        </div>
      </div>

      {/* Modal de Cerebro del Negocio */}
      {isContextModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-brand-surface w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col border border-slate-200 dark:border-brand-cyan/20">
            <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-brand-dark/50">
              <div className="flex items-center gap-3">
                <div className="bg-brand-blue/10 dark:bg-brand-cyan/20 p-2 rounded-lg text-brand-blue dark:text-brand-cyan">
                  <BookOpen size={20} />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white">Cerebro del Negocio</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Contexto e instrucciones globales para la IA</p>
                </div>
              </div>
              <button onClick={() => setIsContextModalOpen(false)} className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-white bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors">
                <X size={20} />
              </button>
            </div>

            <div className="p-5 flex-1">
              <div className="flex justify-between items-end mb-4">
                <div>
                  <p className="text-sm text-slate-600 dark:text-slate-300">Redacta aquí las reglas de tu empresa, o adjunta un documento.</p>
                  <p className="text-xs text-slate-400 mt-1">
                    {businessContext.length} caracteres · El Copilot leerá este texto en cada consulta
                  </p>
                </div>
                <div>
                  <input type="file" ref={fileInputRef} className="hidden" accept=".txt,.csv,.pdf,.doc,.docx" onChange={handleFileUpload} />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading || isSavingContext}
                    className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors shadow-sm disabled:opacity-50"
                  >
                    {isUploading ? <Loader2 size={14} className="animate-spin" /> : <Paperclip size={14} />}
                    {isUploading ? 'Procesando...' : 'Adjuntar Documento'}
                  </button>
                </div>
              </div>
              {uploadError && (
                <div className="mb-3 px-3 py-2 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 text-red-600 dark:text-red-400 text-xs rounded-lg flex items-center gap-2">
                  <span>⚠️</span> {uploadError}
                </div>
              )}
              <textarea
                value={businessContext}
                onChange={(e) => setBusinessContext(e.target.value)}
                placeholder="Ejemplo: Nuestro objetivo es no tener más de 15 días de cobertura global. Los productos de la familia 'Portátiles' son estratégicos..."
                className="w-full h-64 p-4 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:border-brand-blue dark:focus:border-brand-cyan focus:ring-1 focus:ring-brand-blue dark:focus:ring-brand-cyan text-slate-800 dark:text-slate-200 resize-none custom-scrollbar"
              />
            </div>

            <div className="p-5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-brand-dark/50 flex justify-end gap-3">
              <button onClick={() => setIsContextModalOpen(false)} className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg transition-colors" disabled={isSavingContext}>
                Cancelar
              </button>
              <button
                onClick={handleSaveContext}
                disabled={isSavingContext}
                className="flex items-center gap-2 px-5 py-2 text-sm font-medium bg-brand-blue dark:bg-brand-cyan text-white dark:text-brand-dark rounded-lg hover:bg-brand-blue/90 dark:hover:bg-white transition-colors disabled:opacity-70 shadow-md dark:shadow-[0_0_10px_var(--color-brand-cyan)]"
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
