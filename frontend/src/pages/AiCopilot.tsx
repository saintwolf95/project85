import { useState, useRef, useEffect } from 'react';
import { api, getCopilotChats, getCopilotChatHistory, deleteCopilotChat, getBusinessContext, updateBusinessContext, uploadBusinessDocument } from '../services/api';
import type { CopilotChat } from '../services/api';
import { Send, Bot, User, Zap, Brain, Plus, MessageSquare, Trash2, Loader2, Menu, X, BookOpen, Save, Paperclip } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';

interface Message {
  id: string;
  role: 'user' | 'ai';
  content: string;
}

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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [modelPreference, setModelPreference] = useState<'fast' | 'thinking' | 'ultra_thinking'>('fast');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const defaultGreeting: Message = {
    id: 'greeting',
    role: 'ai',
    content: '¡Hola! Soy tu AI Copilot. Estoy conectado a tu base de datos de inventario. Puedes preguntarme cosas como:\n\n- [¿Cuántos iPhones tenemos en stock?](#prompt:¿Cuántos%20iPhones%20tenemos%20en%20stock%3F)\n- [¿Cuál es la familia de productos con mayor valor inmovilizado?](#prompt:¿Cuál%20es%20la%20familia%20de%20productos%20con%20mayor%20valor%20inmovilizado%3F)\n- [¿Qué productos de clase A tienen menos de 10 días de cobertura?](#prompt:¿Qué%20productos%20de%20clase%20A%20tienen%20menos%20de%2010%20días%20de%20cobertura%3F)\n- [Actúa como un reportero y hazme un resumen general de lo que sucede hoy en el inventario](#prompt:Actúa%20como%20un%20reportero%20y%20hazme%20un%20resumen%20general%20de%20lo%20que%20sucede%20hoy%20en%20el%20inventario)'
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    loadChats();
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const loadChats = async () => {
    try {
      setIsLoadingChats(true);
      const data = await getCopilotChats();
      setChats(data);
      if (data.length > 0 && currentChatId === null) {
        selectChat(data[0].id);
      } else if (data.length === 0) {
        setMessages([defaultGreeting]);
      }
      // Cargar el contexto del negocio
      const ctx = await getBusinessContext();
      setBusinessContext(ctx);
    } catch (error) {
      console.error("Error cargando chats", error);
    } finally {
      setIsLoadingChats(false);
    }
  };

  const selectChat = async (chatId: number) => {
    setCurrentChatId(chatId);
    if (window.innerWidth < 1024) setIsSidebarOpen(false);
    try {
      const history = await getCopilotChatHistory(chatId);
      if (history.length === 0) {
        setMessages([defaultGreeting]);
      } else {
        const formatted: Message[] = history.map(h => ({
          id: h.id.toString(),
          role: h.role === 'assistant' ? 'ai' : 'user',
          content: h.content
        }));
        setMessages(formatted);
      }
    } catch (error) {
      console.error("Error cargando historial de chat", error);
    }
  };

  const startNewChat = () => {
    setCurrentChatId(null);
    setMessages([defaultGreeting]);
    if (window.innerWidth < 1024) setIsSidebarOpen(false);
  };

  const handleDeleteChat = async (e: React.MouseEvent, chatId: number) => {
    e.stopPropagation();
    if (!window.confirm("¿Seguro que quieres eliminar este chat?")) return;
    try {
      await deleteCopilotChat(chatId);
      const remaining = chats.filter(c => c.id !== chatId);
      setChats(remaining);
      if (currentChatId === chatId) {
        if (remaining.length > 0) {
          selectChat(remaining[0].id);
        } else {
          startNewChat();
        }
      }
    } catch (error) {
      console.error("Error eliminando chat", error);
    }
  };

  const handleSend = async (textOverride?: string) => {
    const userText = (typeof textOverride === 'string' ? textOverride : input).trim();
    if (!userText || isLoading) return;

    if (typeof textOverride !== 'string') setInput('');
    
    const newUserMsg: Message = { id: Date.now().toString(), role: 'user', content: userText };
    const newMessages = [...messages, newUserMsg];
    setMessages(newMessages);
    setIsLoading(true);

    try {
      // Mandamos solo el nuevo mensaje como historia (el backend reconstruye el resto)
      const historyPayload = [{ role: 'user', content: userText }];

      const response = await api.post('/copilot/chat', {
        chat_id: currentChatId,
        history: historyPayload,
        model_preference: modelPreference
      });

      const aiMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'ai',
        content: response.data.reply
      };
      
      setMessages(prev => [...prev, aiMsg]);
      
      // Si era un chat nuevo, el backend nos devuelve el nuevo ID asignado
      if (!currentChatId && response.data.chat_id) {
        setCurrentChatId(response.data.chat_id);
        loadChats(); // Recargar la lista de chats para que aparezca
      } else {
        // Actualizar el orden en la UI (poner de primero)
        setChats(prev => {
          const chat = prev.find(c => c.id === currentChatId);
          if (chat) {
            const filtered = prev.filter(c => c.id !== currentChatId);
            return [{...chat, actualizado_en: new Date().toISOString()}, ...filtered];
          }
          return prev;
        });
      }

    } catch (error) {
      console.error("Error calling copilot API:", error);
      const errorMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'ai',
        content: "Lo siento, hubo un error de conexión con mi motor analítico. Por favor verifica que el backend y OpenAI estén configurados correctamente."
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSend();
    }
  };

  const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);

  const handleSaveContext = async () => {
    try {
      setIsSavingContext(true);
      await updateBusinessContext(businessContext);
      setIsContextModalOpen(false);
    } catch (error) {
      console.error("Error guardando contexto:", error);
      alert("Hubo un error guardando el contexto del negocio.");
    } finally {
      setIsSavingContext(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 1048576) {
      alert("El archivo excede el límite máximo de 1MB.");
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    try {
      setIsUploading(true);
      const response = await uploadBusinessDocument(file);
      if (response.success) {
        setBusinessContext(response.full_context);
      }
    } catch (error: any) {
      console.error("Error subiendo archivo:", error);
      alert(error.response?.data?.detail || "Error subiendo el archivo. Asegúrate de que es un formato soportado (.txt, .pdf, .docx, .csv).");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="animate-in fade-in duration-500 h-[calc(100vh-6rem)] flex flex-col md:flex-row relative gap-4">
      
      {/* Botón Móvil Sidebar */}
      <div className="lg:hidden mb-2 flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <Bot className="text-brand-blue dark:text-brand-cyan" size={24} /> AI Copilot
        </h1>
        <button onClick={toggleSidebar} className="p-2 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
          <Menu size={20} className="text-slate-700 dark:text-slate-300" />
        </button>
      </div>

      {/* Sidebar Historial */}
      <div className={`absolute lg:relative z-20 h-full w-72 bg-white dark:bg-brand-surface border border-slate-200 dark:border-slate-800 rounded-xl flex flex-col shadow-lg transition-transform duration-300 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-[110%] lg:translate-x-0'}`}>
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
          <button 
            onClick={startNewChat}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-brand-blue dark:bg-brand-cyan text-white dark:text-brand-dark rounded-lg hover:bg-brand-blue/90 dark:hover:bg-white transition-colors font-medium text-sm"
          >
            <Plus size={16} /> Nuevo Chat
          </button>
          <button onClick={toggleSidebar} className="lg:hidden ml-2 p-2 text-slate-500 hover:text-slate-800 dark:hover:text-white">
            <X size={20} />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-1">
          {isLoadingChats ? (
            <div className="flex justify-center py-8">
              <Loader2 className="animate-spin text-brand-blue dark:text-brand-cyan" size={24} />
            </div>
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
                <button 
                  onClick={(e) => handleDeleteChat(e, chat.id)}
                  className="opacity-0 group-hover:opacity-100 p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-md transition-all"
                  title="Eliminar chat"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Overlay Móvil */}
      {isSidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-10 lg:hidden" onClick={toggleSidebar} />
      )}

      {/* Main Chat Area */}
      <div className="flex-1 bg-white dark:bg-brand-surface border border-slate-200 dark:border-slate-800 rounded-xl flex flex-col overflow-hidden shadow-lg dark:shadow-[0_0_20px_rgba(0,245,255,0.02)]">
        
        {/* Cabecera Desktop */}
        <div className="hidden lg:flex p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-brand-dark/30 justify-between items-center">
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Bot className="text-brand-blue dark:text-brand-cyan" size={24} /> AI Copilot
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Historial persistente (30 días de retención)</p>
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
                    <div className="bg-brand-blue/10 dark:bg-brand-cyan/20 p-2 rounded-lg border border-brand-blue/30 dark:border-brand-cyan/50 text-brand-blue dark:text-brand-cyan shadow-none dark:shadow-[0_0_10px_var(--color-brand-cyan)]">
                      <Bot size={20} />
                    </div>
                  )}
                </div>

                {/* Burbuja */}
                <div className={`p-4 rounded-2xl whitespace-pre-wrap leading-relaxed text-sm ${
                  msg.role === 'user' 
                    ? 'bg-brand-blue text-white rounded-tr-sm shadow-sm' 
                    : 'bg-slate-100 dark:bg-slate-800/80 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-brand-cyan/30 rounded-tl-sm shadow-sm'
                }`}>
                  {msg.role === 'user' ? (
                    msg.content
                  ) : (
                    <div className="prose dark:prose-invert max-w-none prose-p:leading-relaxed prose-pre:bg-slate-100 dark:prose-pre:bg-slate-900 prose-pre:border prose-pre:border-slate-200 dark:prose-pre:border-slate-700 prose-a:text-brand-blue dark:prose-a:text-brand-cyan">
                      <ReactMarkdown 
                        remarkPlugins={[remarkGfm]} 
                        rehypePlugins={[rehypeSanitize]}
                        components={{
                          a({ node, className, children, href, ...props }) {
                            if (href?.startsWith('#prompt:')) {
                              const promptText = decodeURIComponent(href.replace('#prompt:', ''));
                              return (
                                <button
                                  onClick={(e) => {
                                    e.preventDefault();
                                    handleSend(promptText);
                                  }}
                                  disabled={isLoading}
                                  className="inline-flex items-center mt-2 mr-2 px-4 py-2 bg-brand-blue/10 dark:bg-brand-cyan/10 text-brand-blue dark:text-brand-cyan hover:bg-brand-blue/20 dark:hover:bg-brand-cyan/20 rounded-full text-sm font-medium transition-colors text-left border border-brand-blue/20 dark:border-brand-cyan/20 cursor-pointer disabled:opacity-50"
                                >
                                  {children}
                                </button>
                              );
                            }
                            return (
                              <a 
                                href={href} 
                                target="_blank" 
                                rel="noopener noreferrer" 
                                className="text-brand-blue dark:text-brand-cyan hover:underline" 
                                {...props}
                              >
                                {children}
                              </a>
                            );
                          }
                        }}
                      >
                        {msg.content}
                      </ReactMarkdown>
                    </div>
                  )}
                </div>

              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex justify-start">
              <div className="flex gap-4 max-w-[80%]">
                <div className="flex-shrink-0 mt-1 hidden md:block">
                  <div className="bg-brand-cyan/20 p-2 rounded-lg border border-brand-cyan/50 text-brand-cyan shadow-[0_0_10px_var(--color-brand-cyan)]">
                    <Bot size={20} />
                  </div>
                </div>
                <div className="p-4 rounded-2xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-brand-cyan/30 rounded-tl-sm flex items-center gap-2">
                  <div className="w-2 h-2 bg-brand-blue dark:bg-brand-cyan rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                  <div className="w-2 h-2 bg-brand-blue dark:bg-brand-cyan rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                  <div className="w-2 h-2 bg-brand-blue dark:bg-brand-cyan rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                  <span className="text-brand-blue dark:text-brand-cyan text-xs font-medium ml-2">Analizando BD...</span>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Controles y Caja de Input */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-brand-dark/50">
          
          <div className="flex items-center gap-4 mb-3 px-1">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Motor AI:</span>
            <div className="flex bg-slate-200 dark:bg-slate-800 p-1 rounded-lg">
              <button 
                onClick={() => setModelPreference('fast')}
                className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${modelPreference === 'fast' ? 'bg-white dark:bg-slate-700 text-brand-blue dark:text-brand-cyan shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
              >
                <Zap size={14} /> Fast (gpt-4o)
              </button>
              <button 
                onClick={() => setModelPreference('thinking')}
                className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${modelPreference === 'thinking' ? 'bg-white dark:bg-slate-700 text-purple-600 dark:text-purple-400 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
              >
                <Brain size={14} /> Thinking (o3-mini)
              </button>
              <button 
                onClick={() => setModelPreference('ultra_thinking')}
                className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${modelPreference === 'ultra_thinking' ? 'bg-white dark:bg-slate-700 text-rose-500 dark:text-rose-400 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
              >
                <Brain size={14} /> Ultra Thinking (o1)
              </button>
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
            SupplyChain Copilot actúa como Analista Senior y genera consultas seguras limitadas a tu entorno.
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
              <button 
                onClick={() => setIsContextModalOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-white bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="p-5 flex-1">
              <div className="flex justify-between items-end mb-4">
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  Redacta aquí las reglas de tu empresa, o adjunta un documento. El Copilot siempre leerá este texto.
                </p>
                <div>
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    className="hidden" 
                    accept=".txt,.csv,.pdf,.doc,.docx"
                    onChange={handleFileUpload}
                  />
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
              <textarea
                value={businessContext}
                onChange={(e) => setBusinessContext(e.target.value)}
                placeholder="Ejemplo: Nuestro objetivo es no tener más de 15 días de cobertura global..."
                className="w-full h-64 p-4 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:border-brand-blue dark:focus:border-brand-cyan focus:ring-1 focus:ring-brand-blue dark:focus:ring-brand-cyan text-slate-800 dark:text-slate-200 resize-none custom-scrollbar"
              />
            </div>
            
            <div className="p-5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-brand-dark/50 flex justify-end gap-3">
              <button 
                onClick={() => setIsContextModalOpen(false)}
                className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg transition-colors"
                disabled={isSavingContext}
              >
                Cancelar
              </button>
              <button 
                onClick={handleSaveContext}
                disabled={isSavingContext}
                className="flex items-center gap-2 px-5 py-2 text-sm font-medium bg-brand-blue dark:bg-brand-cyan text-white dark:text-brand-dark rounded-lg hover:bg-brand-blue/90 dark:hover:bg-white transition-colors disabled:opacity-70 disabled:cursor-not-allowed shadow-md dark:shadow-[0_0_10px_var(--color-brand-cyan)]"
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
