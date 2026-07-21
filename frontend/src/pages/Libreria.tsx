import { useState, useEffect, useRef } from 'react';
import { uploadLibreriaDocument, getLibreriaDocuments, deleteLibreriaDocument, askLibreria } from '../services/api';
import type { LibreriaDocument } from '../services/api';
import { BookOpen, Upload, Trash2, Send, Bot, FileText, Loader2, Filter } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const DEPARTMENTS = ['Ventas', 'Compras', 'Inventario', 'Finanzas', 'RRHH', 'General'];

export const Libreria = () => {
  const [documents, setDocuments] = useState<LibreriaDocument[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(true);
  
  // Upload state
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedDept, setSelectedDept] = useState(DEPARTMENTS[0]);
  
  // Chat state
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [question, setQuestion] = useState('');
  const [chatFilter, setChatFilter] = useState('all');
  const [chatLoading, setChatLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fetchDocuments = async () => {
    try {
      setLoadingDocs(true);
      const docs = await getLibreriaDocuments();
      setDocuments(docs);
    } catch (error) {
      console.error("Error fetching documents", error);
    } finally {
      setLoadingDocs(false);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setSelectedFile(e.target.files[0]);
      setUploadError(null);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;
    setUploadError(null);
    
    try {
      setUploading(true);
      await uploadLibreriaDocument(selectedFile, selectedDept);
      setSelectedFile(null);
      // Reset input file
      const fileInput = document.getElementById('file-upload') as HTMLInputElement;
      if (fileInput) fileInput.value = '';
      
      await fetchDocuments();
    } catch (error) {
      console.error("Error uploading", error);
      setUploadError("Hubo un error subiendo el documento. Asegúrate de que el formato sea soportado y no exceda 5MB.");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('¿Estás seguro de que deseas eliminar este documento? La IA ya no podrá leerlo.')) return;
    try {
      await deleteLibreriaDocument(id);
      await fetchDocuments();
    } catch (error) {
      console.error("Error deleting", error);
    }
  };

  const handleAsk = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim() || chatLoading) return;

    const userQ = question.trim();
    setQuestion('');
    setChatHistory(prev => [...prev, { role: 'user', content: userQ }]);
    setChatLoading(true);

    try {
      const response = await askLibreria(userQ, chatFilter);
      setChatHistory(prev => [...prev, { 
        role: 'assistant', 
        content: response.answer + `\n\n*(Leídos ${response.context_docs} documentos de ${chatFilter === 'all' ? 'todos los departamentos' : chatFilter})*` 
      }]);
    } catch (error) {
      console.error("Error asking Libreria", error);
      setChatHistory(prev => [...prev, { role: 'assistant', content: "Lo siento, hubo un error al consultar la biblioteca. Intenta de nuevo." }]);
    } finally {
      setChatLoading(false);
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-[1600px] mx-auto h-[calc(100vh-64px)] flex flex-col">
      <div className="mb-6">
        <h1 className="title-corporate flex items-center gap-3">
          <BookOpen className="w-8 h-8 text-brand-blue dark:text-brand-cyan" />
          LibrerIA Corporativa
        </h1>
        <p className="text-slate-500 dark:text-slate-400 mt-2 max-w-3xl">
          Sube documentos de la cultura de la empresa, manuales o procedimientos y hazle preguntas a la IA sobre ellos. 
          Puedes clasificar los documentos por departamento para que la IA sea más precisa en sus respuestas.
        </p>
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6 min-h-0">
        
        {/* Panel de Gestión de Archivos */}
        <div className="lg:col-span-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl flex flex-col overflow-hidden">
          <div className="p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50">
            <h2 className="font-semibold text-slate-800 dark:text-white flex items-center gap-2">
              <Upload className="w-4 h-4" /> Subir Documento
            </h2>
          </div>
          
          <div className="p-4 border-b border-slate-100 dark:border-slate-800">
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Archivo (.pdf, .docx, .txt, .csv)</label>
                <input 
                  type="file" 
                  id="file-upload"
                  onChange={handleFileChange}
                  accept=".pdf,.docx,.txt,.csv"
                  className="hidden"
                />
                <label htmlFor="file-upload" className="cursor-pointer bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-4 py-2 rounded-xl text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors inline-block w-full text-center">
                  {selectedFile ? selectedFile.name : 'Seleccionar archivo'}
                </label>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Departamento (Etiqueta)</label>
                <select 
                  value={selectedDept} 
                  onChange={(e) => setSelectedDept(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-cyan"
                >
                  {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              
              {uploadError && (
                <div className="px-3 py-2 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 text-red-600 dark:text-red-400 text-xs rounded-lg flex items-center gap-2">
                  <span>⚠️</span> {uploadError}
                </div>
              )}

              <button 
                onClick={handleUpload}
                disabled={!selectedFile || uploading}
                className="w-full bg-brand-blue hover:bg-brand-blue/90 text-white font-medium py-2 rounded-lg text-sm flex items-center justify-center gap-2 disabled:opacity-50 transition-colors"
              >
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {uploading ? 'Subiendo y Analizando...' : 'Subir Documento'}
              </button>
            </div>
          </div>

          <div className="p-4 bg-slate-50/50 dark:bg-slate-800/50 flex-1 overflow-y-auto">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Documentos en Biblioteca ({documents.length})</h3>
            
            {loadingDocs ? (
              <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-brand-cyan" /></div>
            ) : documents.length === 0 ? (
              <div className="text-center py-8 text-sm text-slate-500">No hay documentos subidos aún.</div>
            ) : (
              <div className="space-y-2">
                {documents.map(doc => (
                  <div key={doc.id} className="bg-white dark:bg-slate-800 p-3 rounded-lg border border-slate-200 dark:border-slate-700 flex items-start justify-between group">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="p-2 bg-brand-cyan/10 rounded-lg shrink-0">
                        <FileText className="w-4 h-4 text-brand-cyan" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate" title={doc.filename}>{doc.filename}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] px-2 py-0.5 bg-slate-100 dark:bg-slate-700 rounded-full font-medium text-slate-600 dark:text-slate-300">
                            {doc.department}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            {new Date(doc.upload_date).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    </div>
                    <button 
                      onClick={() => handleDelete(doc.id)}
                      className="text-slate-400 hover:text-red-500 p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Eliminar documento"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Panel de Chat */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl flex flex-col overflow-hidden">
          
          <div className="p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 flex items-center justify-between">
            <h2 className="font-semibold text-slate-800 dark:text-white flex items-center gap-2">
              <Bot className="w-5 h-5 text-brand-cyan" /> Consultar Biblioteca
            </h2>
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-slate-400" />
              <select 
                value={chatFilter}
                onChange={(e) => setChatFilter(e.target.value)}
                className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-xs focus:outline-none"
              >
                <option value="all">Todos los departamentos</option>
                {DEPARTMENTS.map(d => <option key={d} value={d}>Solo {d}</option>)}
              </select>
            </div>
          </div>

          <div className="flex-1 p-4 overflow-y-auto space-y-4 bg-slate-50/30 dark:bg-slate-900">
            {chatHistory.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center px-4">
                <div className="w-16 h-16 bg-brand-cyan/10 rounded-full flex items-center justify-center mb-4">
                  <BookOpen className="w-8 h-8 text-brand-cyan" />
                </div>
                <h3 className="font-semibold text-lg text-slate-800 dark:text-slate-200">Pregúntale a tus documentos</h3>
                <p className="text-slate-500 dark:text-slate-400 mt-2 max-w-md text-sm">
                  Sube manuales, políticas de recursos humanos, o especificaciones técnicas. Luego pregunta cualquier cosa y la IA buscará la respuesta exacta dentro de tus archivos.
                </p>
              </div>
            ) : (
              chatHistory.map((msg, idx) => (
                <div key={idx} className={`flex gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                    msg.role === 'user' ? 'bg-brand-blue text-white' : 'bg-brand-cyan/20 text-brand-cyan'
                  }`}>
                    {msg.role === 'user' ? 'U' : <Bot className="w-5 h-5" />}
                  </div>
                  <div className={`max-w-[80%] rounded-2xl p-4 ${
                    msg.role === 'user' 
                      ? 'bg-brand-blue text-white' 
                      : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm'
                  }`}>
                    {msg.role === 'user' ? (
                      <p className="text-sm">{msg.content}</p>
                    ) : (
                      <div className="prose prose-sm dark:prose-invert max-w-none">
                        <ReactMarkdown>{msg.content}</ReactMarkdown>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
            
            {chatLoading && (
              <div className="flex gap-4">
                <div className="w-8 h-8 rounded-full bg-brand-cyan/20 flex items-center justify-center shrink-0">
                  <Bot className="w-5 h-5 text-brand-cyan" />
                </div>
                <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 shadow-sm flex items-center gap-2 text-sm text-slate-500">
                  <Loader2 className="w-4 h-4 animate-spin text-brand-cyan" />
                  Leyendo documentos de la biblioteca...
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="p-4 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800">
            <form onSubmit={handleAsk} className="relative flex items-center">
              <input 
                type="text"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder={documents.length === 0 ? "Sube al menos un documento para preguntar..." : "Pregunta sobre políticas, manuales, procesos..."}
                disabled={documents.length === 0 || chatLoading}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full pl-6 pr-12 py-3 text-sm focus:outline-none focus:border-brand-cyan disabled:opacity-50"
              />
              <button 
                type="submit"
                disabled={!question.trim() || documents.length === 0 || chatLoading}
                className="absolute right-2 p-2 bg-brand-blue hover:bg-brand-blue/90 text-white rounded-full disabled:opacity-50 transition-colors"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};
