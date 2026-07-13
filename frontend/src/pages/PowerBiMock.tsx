import { useState } from 'react';
import { BarChart, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from 'recharts';
import { Filter, Download, RefreshCcw, Maximize2, Share2, MoreHorizontal, ChevronDown, Check } from 'lucide-react';

const salesData = [
  { month: 'Ene', real: 4000, plan: 4400 },
  { month: 'Feb', real: 3000, plan: 3200 },
  { month: 'Mar', real: 2000, plan: 2400 },
  { month: 'Abr', real: 2780, plan: 2500 },
  { month: 'May', real: 1890, plan: 2100 },
  { month: 'Jun', real: 2390, plan: 2600 },
  { month: 'Jul', real: 3490, plan: 3300 },
];

const categoryData = [
  { name: 'Monitores', value: 400 },
  { name: 'Portátiles', value: 300 },
  { name: 'Periféricos', value: 300 },
  { name: 'Componentes', value: 200 },
];

const COLORS = ['#118DFF', '#12239E', '#E66C37', '#6B007B'];

export const PowerBiMock = () => {
  const [activeTab, setActiveTab] = useState('Ventas');
  const [filterOpen] = useState(true);

  return (
    <div className="h-full flex flex-col -m-4 md:-m-6 lg:-m-8 bg-[#EAEAEA]">
      {/* Fake Power BI Top Bar */}
      <div className="bg-white border-b border-gray-300 h-12 flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-[#F2C811] flex items-center justify-center rounded-sm">
              <BarChart className="w-4 h-4 text-black rotate-90" />
            </div>
            <span className="font-semibold text-gray-700 text-sm">Informes / Supply Chain Dashboard</span>
          </div>
        </div>
        <div className="flex items-center gap-3 text-gray-600">
          <button className="flex items-center gap-1 hover:bg-gray-100 p-1.5 rounded text-xs font-medium transition-colors">
            <RefreshCcw size={14} />
            Actualizar
          </button>
          <button className="flex items-center gap-1 hover:bg-gray-100 p-1.5 rounded text-xs font-medium transition-colors">
            <Share2 size={14} />
            Compartir
          </button>
          <button className="flex items-center gap-1 hover:bg-gray-100 p-1.5 rounded text-xs font-medium transition-colors">
            <Download size={14} />
            Exportar
          </button>
          <div className="w-px h-4 bg-gray-300 mx-1"></div>
          <button className="hover:bg-gray-100 p-1.5 rounded transition-colors">
            <Maximize2 size={14} />
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Pages Sidebar (Fake) */}
        <div className="w-48 bg-white border-r border-gray-300 flex flex-col shrink-0 hidden md:flex">
          <div className="p-3 border-b border-gray-200">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Páginas</span>
          </div>
          <div className="p-2 flex flex-col gap-1">
            <button 
              onClick={() => setActiveTab('Ventas')}
              className={`text-left px-3 py-2 text-sm rounded ${activeTab === 'Ventas' ? 'bg-[#E6F0FF] text-[#118DFF] font-medium border-l-4 border-[#118DFF]' : 'text-gray-600 hover:bg-gray-100 border-l-4 border-transparent'}`}
            >
              1. Resumen de Ventas
            </button>
            <button 
              onClick={() => setActiveTab('Inventario')}
              className={`text-left px-3 py-2 text-sm rounded ${activeTab === 'Inventario' ? 'bg-[#E6F0FF] text-[#118DFF] font-medium border-l-4 border-[#118DFF]' : 'text-gray-600 hover:bg-gray-100 border-l-4 border-transparent'}`}
            >
              2. Análisis de Inventario
            </button>
            <button 
              onClick={() => setActiveTab('Proveedores')}
              className={`text-left px-3 py-2 text-sm rounded ${activeTab === 'Proveedores' ? 'bg-[#E6F0FF] text-[#118DFF] font-medium border-l-4 border-[#118DFF]' : 'text-gray-600 hover:bg-gray-100 border-l-4 border-transparent'}`}
            >
              3. Desempeño Proveedores
            </button>
          </div>
        </div>

        {/* Dashboard Canvas */}
        <div className="flex-1 overflow-auto p-4 md:p-6 flex justify-center">
          <div className="w-full max-w-5xl bg-white shadow-sm border border-gray-200 aspect-auto md:aspect-[16/9] min-h-[600px] flex flex-col relative overflow-hidden">
            {/* Visual Canvas Header */}
            <div className="p-4 flex items-center justify-between border-b border-gray-100">
              <h1 className="text-xl md:text-2xl font-light text-gray-800">
                {activeTab === 'Ventas' ? 'Resumen Ejecutivo de Ventas (YTD)' : 
                 activeTab === 'Inventario' ? 'Estado de Inventario y Roturas' : 
                 'Evaluación de Proveedores (OTIF)'}
              </h1>
              <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/c/cf/Microsoft_Power_BI_Logo.svg/1024px-Microsoft_Power_BI_Logo.svg.png" alt="Power BI" className="h-6 opacity-30 grayscale hidden md:block" />
            </div>

            {/* Grid of Visualizations */}
            <div className="flex-1 p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
              
              {/* KPI Cards */}
              <div className="col-span-1 md:col-span-3 grid grid-cols-2 md:grid-cols-4 gap-4 mb-2">
                <div className="bg-white border border-gray-200 p-4 flex flex-col justify-center items-center shadow-sm relative group">
                  <span className="text-xs text-gray-500 mb-1">Ingresos Totales</span>
                  <span className="text-2xl md:text-3xl font-light text-gray-800">€ 14.5M</span>
                  <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100"><MoreHorizontal size={14} className="text-gray-400"/></div>
                </div>
                <div className="bg-white border border-gray-200 p-4 flex flex-col justify-center items-center shadow-sm relative group">
                  <span className="text-xs text-gray-500 mb-1">Margen Bruto</span>
                  <span className="text-2xl md:text-3xl font-light text-gray-800">22.4%</span>
                  <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100"><MoreHorizontal size={14} className="text-gray-400"/></div>
                </div>
                <div className="bg-white border border-gray-200 p-4 flex flex-col justify-center items-center shadow-sm relative group">
                  <span className="text-xs text-gray-500 mb-1">Unidades Vendidas</span>
                  <span className="text-2xl md:text-3xl font-light text-gray-800">124k</span>
                  <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100"><MoreHorizontal size={14} className="text-gray-400"/></div>
                </div>
                <div className="bg-white border border-gray-200 p-4 flex flex-col justify-center items-center shadow-sm relative group">
                  <span className="text-xs text-gray-500 mb-1">Crecimiento YoY</span>
                  <span className="text-2xl md:text-3xl font-light text-[#118DFF]">+8.2%</span>
                  <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100"><MoreHorizontal size={14} className="text-gray-400"/></div>
                </div>
              </div>

              {/* Main Chart */}
              <div className="col-span-1 md:col-span-2 bg-white border border-gray-200 p-4 shadow-sm flex flex-col relative group min-h-[300px]">
                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 flex gap-1 bg-white shadow-sm border p-1 z-10">
                  <Filter size={14} className="text-gray-500"/>
                  <Maximize2 size={14} className="text-gray-500"/>
                  <MoreHorizontal size={14} className="text-gray-500"/>
                </div>
                <h3 className="text-sm text-gray-600 mb-4 font-medium text-center">Ventas vs Plan por Mes</h3>
                <div className="flex-1 min-h-[250px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={salesData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EAEAEA" />
                      <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#666'}} />
                      <YAxis axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#666'}} />
                      <Tooltip contentStyle={{ borderRadius: '0px', border: '1px solid #ccc', boxShadow: '2px 2px 5px rgba(0,0,0,0.1)' }}/>
                      <Line type="monotone" dataKey="real" name="Ventas Reales" stroke="#118DFF" strokeWidth={3} dot={{r: 4, fill: '#118DFF', strokeWidth: 0}} />
                      <Line type="monotone" dataKey="plan" name="Planificado" stroke="#E66C37" strokeWidth={2} strokeDasharray="5 5" dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Secondary Chart */}
              <div className="col-span-1 bg-white border border-gray-200 p-4 shadow-sm flex flex-col relative group min-h-[300px]">
                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 flex gap-1 bg-white shadow-sm border p-1 z-10">
                  <Filter size={14} className="text-gray-500"/>
                  <Maximize2 size={14} className="text-gray-500"/>
                  <MoreHorizontal size={14} className="text-gray-500"/>
                </div>
                <h3 className="text-sm text-gray-600 mb-4 font-medium text-center">Ingresos por Categoría</h3>
                <div className="flex-1 min-h-[200px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={categoryData}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={70}
                        paddingAngle={2}
                        dataKey="value"
                      >
                        {categoryData.map((_entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ borderRadius: '0px', border: '1px solid #ccc' }}/>
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                {/* Legend */}
                <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 mt-2">
                  {categoryData.map((entry, index) => (
                    <div key={entry.name} className="flex items-center gap-1 text-[10px] text-gray-600">
                      <div className="w-2 h-2" style={{backgroundColor: COLORS[index]}}></div>
                      {entry.name}
                    </div>
                  ))}
                </div>
              </div>

            </div>
          </div>
        </div>

        {/* Filter Pane (Fake) */}
        {filterOpen && (
          <div className="w-64 bg-white border-l border-gray-300 flex flex-col shrink-0 hidden lg:flex">
            <div className="p-3 border-b border-gray-200 flex justify-between items-center">
              <span className="text-sm font-semibold text-gray-700">Filtros</span>
            </div>
            <div className="flex-1 overflow-auto p-4 space-y-4">
              
              {/* Filter card */}
              <div className="border border-gray-200 rounded-sm">
                <div className="bg-gray-50 p-2 border-b border-gray-200 flex justify-between items-center cursor-pointer">
                  <span className="text-xs font-semibold text-gray-700">Región (Todas)</span>
                  <ChevronDown size={14} className="text-gray-500"/>
                </div>
              </div>

              {/* Filter card open */}
              <div className="border border-gray-200 rounded-sm">
                <div className="bg-gray-50 p-2 border-b border-gray-200 flex justify-between items-center cursor-pointer">
                  <span className="text-xs font-semibold text-gray-700">Año</span>
                  <ChevronDown size={14} className="text-gray-500 rotate-180"/>
                </div>
                <div className="p-2 space-y-2 max-h-40 overflow-auto">
                  <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                    <div className="w-4 h-4 border border-gray-300 flex items-center justify-center bg-transparent">
                    </div>
                    <span>2024</span>
                  </label>
                  <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                    <div className="w-4 h-4 border border-gray-300 flex items-center justify-center bg-[#F2C811]">
                      <Check size={12} className="text-black"/>
                    </div>
                    <span>2025</span>
                  </label>
                  <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                    <div className="w-4 h-4 border border-gray-300 flex items-center justify-center bg-[#F2C811]">
                      <Check size={12} className="text-black"/>
                    </div>
                    <span>2026</span>
                  </label>
                </div>
              </div>

            </div>
          </div>
        )}
      </div>
    </div>
  );
};
