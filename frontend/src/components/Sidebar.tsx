import { NavLink } from 'react-router-dom';
import { LayoutDashboard, BarChart3, TrendingUp, Bot, Database, LogOut, Sun, Moon, FileSpreadsheet, X, Power, BookOpen } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export const Sidebar = ({ isOpen, onClose }: SidebarProps) => {
  const { logout, session } = useAuth();
  const rol = session?.user?.user_metadata?.rol || 'admin';
  const { theme, toggleTheme } = useTheme();

  const links = [
    { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/inventory', icon: BarChart3, label: 'Intelligence ABCXYZ' },
    { to: '/forecast', icon: TrendingUp, label: 'Predicción Demanda' },
    { to: '/copilot', icon: Bot, label: 'AI Copilot' },
    { to: '/ai-control', icon: Power, label: 'Control IA' },
    { to: '/integrations', icon: Database, label: 'Data Engineering' },
    { to: '/import-guide', icon: FileSpreadsheet, label: 'Guía de Importación' },
    { to: '/libreria', icon: BookOpen, label: 'LibrerIA' },
    { to: '/powerbi', icon: BarChart3, label: 'Power BI Services' },
  ];

  return (
    <>
      {/* Backdrop para móviles */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-40 md:hidden animate-in fade-in"
          onClick={onClose}
        />
      )}

      <aside className={`w-64 h-screen bg-white/90 dark:bg-brand-surface/90 backdrop-blur-md border-r border-slate-200 dark:border-slate-800 flex flex-col fixed left-0 top-0 transition-transform duration-300 z-50 shadow-2xl md:shadow-none md:translate-x-0 ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-6 flex items-center justify-between border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3 mb-4">
            <img src="/logo-fivemin.png" alt="five-minutes logo" className="h-16 md:h-20 w-auto object-contain" />
            <span className="mt-4 px-2 py-0.5 rounded text-[10px] font-bold bg-brand-cyan/20 text-brand-cyan border border-brand-cyan/30">
              V1.01
            </span>
          </div>
          <button onClick={onClose} className="md:hidden text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
            <X size={24} />
          </button>
        </div>
      
      <nav className="flex-1 py-6 px-4 space-y-2">
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            onClick={() => {
              if (window.innerWidth < 768) {
                onClose();
              }
            }}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 ${
                isActive
                  ? 'bg-brand-blue/10 dark:bg-brand-cyan/10 text-brand-blue dark:text-brand-cyan border border-brand-blue/20 dark:border-brand-cyan/20 shadow-none dark:shadow-[0_0_5px_var(--color-brand-cyan)]'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/50'
              }`
            }
          >
            <link.icon size={20} />
            <span className="font-medium text-sm">{link.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="p-4 border-t border-slate-200 dark:border-slate-800">
        <div className="mb-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">
          Sesión ({rol})
        </div>
        
        <button 
          onClick={toggleTheme}
          className="w-full mb-2 flex items-center justify-between px-4 py-3 rounded-lg transition-all duration-200 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/50"
        >
          <div className="flex items-center gap-3">
            {theme === 'dark' ? <Moon size={20} /> : <Sun size={20} />}
            <span className="font-medium text-sm">Tema Oscuro</span>
          </div>
          <div className={`w-8 h-4 rounded-full transition-colors flex items-center ${theme === 'dark' ? 'bg-brand-blue' : 'bg-slate-300'} px-0.5`}>
            <div className={`w-3 h-3 rounded-full bg-white transition-transform ${theme === 'dark' ? 'translate-x-4' : 'translate-x-0'}`} />
          </div>
        </button>

        <button 
          onClick={logout}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 text-slate-600 dark:text-slate-400 hover:text-red-600 dark:hover:text-white hover:bg-red-50 dark:hover:bg-red-500/10 hover:border-red-500/20 border border-transparent group"
        >
          <LogOut size={20} className="text-red-500 dark:text-red-400 group-hover:text-red-600 dark:group-hover:text-red-400" />
          <span className="font-medium text-sm text-red-500 dark:text-red-400/90 group-hover:text-red-600 dark:group-hover:text-red-400">Cerrar Sesión</span>
        </button>
      </div>
    </aside>
    </>
  );
};
