import { useState, useRef, useEffect } from 'react';
import { api } from '../services/api';
import { Send, Bot, User, Zap, Brain } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';


interface Message {
  id: string;
  role: 'user' | 'ai';
  content: string;
}

export const AiCopilot = () => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'ai',
      content: '¡Hola! Soy tu AI Copilot. Estoy conectado a tu base de datos de inventario. Puedes preguntarme cosas como:\n- ¿Cuántos iPhones tenemos en stock?\n- ¿Cuál es la familia de productos con mayor valor inmovilizado?\n- ¿Qué productos de clase A tienen menos de 10 días de cobertura?'
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [modelPreference, setModelPreference] = useState<'fast' | 'thinking'>('fast');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userText = input.trim();
    setInput('');
    
    // Añadir mensaje del usuario
    const newUserMsg: Message = { id: Date.now().toString(), role: 'user', content: userText };
    const newMessages = [...messages, newUserMsg];
    setMessages(newMessages);
    setIsLoading(true);

    try {
      const historyPayload = newMessages.map(m => ({
        role: m.role === 'ai' ? 'assistant' : 'user',
        content: m.content
      }));

      const response = await api.post('/copilot/chat', {
        history: historyPayload,
        model_preference: modelPreference
      });

      const aiMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'ai',
        content: response.data.reply
      };
      
      setMessages(prev => [...prev, aiMsg]);
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

  return (
    <div className="animate-in fade-in duration-500 h-[calc(100vh-6rem)] flex flex-col">
      <div className="mb-4">
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
          <Bot className="text-brand-blue dark:text-brand-cyan" size={32} /> AI Copilot
        </h1>
        <p className="text-slate-500 dark:text-slate-400">Asistente logístico avanzado (Text-to-SQL).</p>
      </div>

      <div className="flex-1 bg-white dark:bg-brand-surface border border-slate-200 dark:border-slate-800 rounded-xl flex flex-col overflow-hidden shadow-lg dark:shadow-[0_0_20px_rgba(0,245,255,0.02)]">
        
        {/* Feed de mensajes */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
          {messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`flex gap-4 max-w-[80%] ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                
                {/* Avatar */}
                <div className="flex-shrink-0 mt-1">
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
                    ? 'bg-brand-blue text-white rounded-tr-sm' 
                    : 'bg-slate-100 dark:bg-slate-800/80 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-brand-cyan/30 rounded-tl-sm'
                }`}>
                  {msg.role === 'user' ? (
                    msg.content
                  ) : (
                    <div className="prose dark:prose-invert max-w-none prose-p:leading-relaxed prose-pre:bg-slate-100 dark:prose-pre:bg-slate-900 prose-pre:border prose-pre:border-slate-200 dark:prose-pre:border-slate-700 prose-a:text-brand-blue dark:prose-a:text-brand-cyan">
                      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
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
                <div className="flex-shrink-0 mt-1">
                  <div className="bg-brand-cyan/20 p-2 rounded-lg border border-brand-cyan/50 text-brand-cyan shadow-[0_0_10px_var(--color-brand-cyan)]">
                    <Bot size={20} />
                  </div>
                </div>
                <div className="p-4 rounded-2xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-brand-cyan/30 rounded-tl-sm flex items-center gap-2">
                  <div className="w-2 h-2 bg-brand-blue dark:bg-brand-cyan rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                  <div className="w-2 h-2 bg-brand-blue dark:bg-brand-cyan rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                  <div className="w-2 h-2 bg-brand-blue dark:bg-brand-cyan rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                  <span className="text-brand-blue dark:text-brand-cyan text-xs font-medium ml-2">Ejecutando SQL...</span>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Controles y Caja de Input */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-brand-dark/50">
          
          <div className="flex items-center gap-4 mb-3 px-1">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Modo Analítico:</span>
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
                <Brain size={14} /> Thinking (o1)
              </button>
            </div>
          </div>
          <div className="relative flex items-center">
            <input 
              type="text" 
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ej: ¿Qué productos de la clase A corren riesgo de rotura de stock?"
              className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 rounded-xl pl-4 pr-12 py-4 focus:outline-none focus:border-brand-blue dark:focus:border-brand-cyan focus:ring-1 focus:ring-brand-blue dark:focus:ring-brand-cyan transition-colors"
              disabled={isLoading}
            />
            <button 
              onClick={handleSend}
              disabled={isLoading || !input.trim()}
              className="absolute right-3 p-2 bg-brand-blue dark:bg-brand-cyan text-white dark:text-brand-dark rounded-lg hover:bg-brand-blue/90 dark:hover:bg-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-md dark:shadow-[0_0_10px_var(--color-brand-cyan)]"
            >
              <Send size={20} />
            </button>
          </div>
          <p className="text-center text-slate-500 text-xs mt-2">
            La IA genera SQL en tiempo real. Puede cometer errores. Verifica siempre los datos sensibles.
          </p>
        </div>

      </div>
    </div>
  );
};
