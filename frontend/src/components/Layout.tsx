import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { UserCircle, Menu } from 'lucide-react';
import { useState } from 'react';

export const Layout = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  return (
    <div className="h-screen flex bg-slate-50 dark:bg-brand-dark transition-colors overflow-hidden">
      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
      
      <div className="flex-1 md:ml-64 flex flex-col overflow-hidden w-full">
        <header className="h-20 shrink-0 bg-white/70 dark:bg-brand-surface/50 backdrop-blur-sm border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-4 md:px-8 sticky top-0 z-30 transition-colors">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setIsSidebarOpen(true)}
              className="md:hidden p-2 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <Menu size={24} />
            </button>
            <div>
              <h2 className="text-slate-500 dark:text-slate-400 text-xs md:text-sm">Empresa Activa</h2>
              <p className="text-slate-900 dark:text-white font-semibold text-sm md:text-base">Logística Global Solutions (DEMO)</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-sm font-medium text-slate-900 dark:text-white">Admin</p>
              <p className="text-xs text-brand-blue dark:text-brand-cyan">admin@supplychain.ai</p>
            </div>
            <UserCircle size={36} className="text-slate-400" />
          </div>
        </header>

        <main className="flex-1 min-h-0 p-4 md:p-8 overflow-x-hidden overflow-y-auto w-full">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
