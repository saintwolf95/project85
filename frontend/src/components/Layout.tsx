import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { UserCircle } from 'lucide-react';

export const Layout = () => {
  return (
    <div className="h-screen flex bg-slate-50 dark:bg-brand-dark transition-colors overflow-hidden">
      <Sidebar />
      
      <div className="flex-1 ml-64 flex flex-col overflow-hidden">
        <header className="h-20 shrink-0 bg-white/70 dark:bg-brand-surface/50 backdrop-blur-sm border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-8 sticky top-0 z-50 transition-colors">
          <div>
            <h2 className="text-slate-500 dark:text-slate-400 text-sm">Empresa Activa</h2>
            <p className="text-slate-900 dark:text-white font-semibold">Logística Global Solutions (DEMO)</p>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-sm font-medium text-slate-900 dark:text-white">Admin</p>
              <p className="text-xs text-brand-blue dark:text-brand-cyan">admin@supplychain.ai</p>
            </div>
            <UserCircle size={36} className="text-slate-400" />
          </div>
        </header>

        <main className="flex-1 min-h-0 p-8 overflow-x-hidden overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
