import { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from 'recharts';
import { Download, RefreshCcw, Maximize2, Share2, ChevronDown, Check } from 'lucide-react';

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

const inventoryData = [
  { name: 'Monitores', value: 1.2 },
  { name: 'Portátiles', value: 2.1 },
  { name: 'Periféricos', value: 0.5 },
  { name: 'Componentes', value: 0.8 },
  { name: 'Audio', value: 0.3 },
];

const healthData = [
  { name: 'Sano', value: 65 },
  { name: 'Riesgo Rotura', value: 15 },
  { name: 'Capital Muerto', value: 10 },
  { name: 'Rotura', value: 10 },
];

const otifData = [
  { month: 'Ene', otif: 88 },
  { month: 'Feb', otif: 90 },
  { month: 'Mar', otif: 87 },
  { month: 'Abr', otif: 92 },
  { month: 'May', otif: 94 },
  { month: 'Jun', otif: 95 },
  { month: 'Jul', otif: 93 },
];

const supplierData = [
  { name: 'GlobalTech', otif: 98, leadTime: 7 },
  { name: 'TechSupply', otif: 92, leadTime: 14 },
  { name: 'Asus Dist.', otif: 89, leadTime: 21 },
  { name: 'Logitech', otif: 95, leadTime: 10 },
];

const COLORS = ['#118DFF', '#12239E', '#E66C37', '#6B007B', '#F2C811', '#00B8AA'];
const HEALTH_COLORS = ['#00B8AA', '#F2C811', '#E66C37', '#D64550'];

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
              
              {/* TAB 1: VENTAS */}
              {activeTab === 'Ventas' && (
                <>
                  {/* KPI Cards */}
                  <div className="col-span-1 md:col-span-3 grid grid-cols-2 md:grid-cols-4 gap-4 mb-2">
                    <div className="bg-white border border-gray-200 p-4 flex flex-col justify-center items-center shadow-sm relative group">
                      <span className="text-xs text-gray-500 mb-1">Ingresos Totales</span>
                      <span className="text-2xl md:text-3xl font-light text-gray-800">€ 14.5M</span>
                    </div>
                    <div className="bg-white border border-gray-200 p-4 flex flex-col justify-center items-center shadow-sm relative group">
                      <span className="text-xs text-gray-500 mb-1">Margen Bruto</span>
                      <span className="text-2xl md:text-3xl font-light text-gray-800">22.4%</span>
                    </div>
                    <div className="bg-white border border-gray-200 p-4 flex flex-col justify-center items-center shadow-sm relative group">
                      <span className="text-xs text-gray-500 mb-1">Unidades Vendidas</span>
                      <span className="text-2xl md:text-3xl font-light text-gray-800">124k</span>
                    </div>
                    <div className="bg-white border border-gray-200 p-4 flex flex-col justify-center items-center shadow-sm relative group">
                      <span className="text-xs text-gray-500 mb-1">Crecimiento YoY</span>
                      <span className="text-2xl md:text-3xl font-light text-[#118DFF]">+8.2%</span>
                    </div>
                  </div>

                  {/* Main Chart */}
                  <div className="col-span-1 md:col-span-2 bg-white border border-gray-200 p-4 shadow-sm flex flex-col relative group min-h-[300px]">
                    <h3 className="text-sm text-gray-600 mb-4 font-medium text-center">Ventas vs Plan por Mes</h3>
                    <div className="flex-1 min-h-[250px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={salesData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EAEAEA" />
                          <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#666'}} />
                          <YAxis axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#666'}} />
                          <Tooltip contentStyle={{ borderRadius: '0px', border: '1px solid #ccc' }}/>
                          <Line type="monotone" dataKey="real" name="Ventas Reales" stroke="#118DFF" strokeWidth={3} dot={{r: 4, fill: '#118DFF', strokeWidth: 0}} />
                          <Line type="monotone" dataKey="plan" name="Planificado" stroke="#E66C37" strokeWidth={2} strokeDasharray="5 5" dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Secondary Chart */}
                  <div className="col-span-1 bg-white border border-gray-200 p-4 shadow-sm flex flex-col relative group min-h-[300px]">
                    <h3 className="text-sm text-gray-600 mb-4 font-medium text-center">Ingresos por Categoría</h3>
                    <div className="flex-1 min-h-[200px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={categoryData} cx="50%" cy="50%" innerRadius={50} outerRadius={70} paddingAngle={2} dataKey="value">
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
                </>
              )}

              {/* TAB 2: INVENTARIO */}
              {activeTab === 'Inventario' && (
                <>
                  <div className="col-span-1 md:col-span-3 grid grid-cols-2 md:grid-cols-4 gap-4 mb-2">
                    <div className="bg-white border border-gray-200 p-4 flex flex-col justify-center items-center shadow-sm relative group">
                      <span className="text-xs text-gray-500 mb-1">Valor Stock</span>
                      <span className="text-2xl md:text-3xl font-light text-gray-800">€ 4.9M</span>
                    </div>
                    <div className="bg-white border border-gray-200 p-4 flex flex-col justify-center items-center shadow-sm relative group">
                      <span className="text-xs text-gray-500 mb-1">Días Cobertura</span>
                      <span className="text-2xl md:text-3xl font-light text-gray-800">45</span>
                    </div>
                    <div className="bg-white border border-gray-200 p-4 flex flex-col justify-center items-center shadow-sm relative group">
                      <span className="text-xs text-gray-500 mb-1">Roturas Activas</span>
                      <span className="text-2xl md:text-3xl font-light text-[#E66C37]">24</span>
                    </div>
                    <div className="bg-white border border-gray-200 p-4 flex flex-col justify-center items-center shadow-sm relative group">
                      <span className="text-xs text-gray-500 mb-1">Índice Rotación</span>
                      <span className="text-2xl md:text-3xl font-light text-[#118DFF]">6.8</span>
                    </div>
                  </div>

                  <div className="col-span-1 md:col-span-2 bg-white border border-gray-200 p-4 shadow-sm flex flex-col relative group min-h-[300px]">
                    <h3 className="text-sm text-gray-600 mb-4 font-medium text-center">Valor de Inventario por Familia (Millones €)</h3>
                    <div className="flex-1 min-h-[250px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={inventoryData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EAEAEA" />
                          <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#666'}} />
                          <YAxis axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#666'}} />
                          <Tooltip cursor={{fill: '#f5f5f5'}} contentStyle={{ borderRadius: '0px', border: '1px solid #ccc' }}/>
                          <Bar dataKey="value" name="Valor (€M)" fill="#118DFF" radius={[2, 2, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="col-span-1 bg-white border border-gray-200 p-4 shadow-sm flex flex-col relative group min-h-[300px]">
                    <h3 className="text-sm text-gray-600 mb-4 font-medium text-center">Salud del Stock (%)</h3>
                    <div className="flex-1 min-h-[200px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={healthData} cx="50%" cy="50%" innerRadius={0} outerRadius={70} dataKey="value">
                            {healthData.map((_entry, index) => (
                              <Cell key={`cell-${index}`} fill={HEALTH_COLORS[index % HEALTH_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip contentStyle={{ borderRadius: '0px', border: '1px solid #ccc' }}/>
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 mt-2">
                      {healthData.map((entry, index) => (
                        <div key={entry.name} className="flex items-center gap-1 text-[10px] text-gray-600">
                          <div className="w-2 h-2" style={{backgroundColor: HEALTH_COLORS[index]}}></div>
                          {entry.name}
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* TAB 3: PROVEEDORES */}
              {activeTab === 'Proveedores' && (
                <>
                  <div className="col-span-1 md:col-span-3 grid grid-cols-2 md:grid-cols-4 gap-4 mb-2">
                    <div className="bg-white border border-gray-200 p-4 flex flex-col justify-center items-center shadow-sm relative group">
                      <span className="text-xs text-gray-500 mb-1">OTIF Promedio</span>
                      <span className="text-2xl md:text-3xl font-light text-[#00B8AA]">93%</span>
                    </div>
                    <div className="bg-white border border-gray-200 p-4 flex flex-col justify-center items-center shadow-sm relative group">
                      <span className="text-xs text-gray-500 mb-1">Proveedores Activos</span>
                      <span className="text-2xl md:text-3xl font-light text-gray-800">34</span>
                    </div>
                    <div className="bg-white border border-gray-200 p-4 flex flex-col justify-center items-center shadow-sm relative group">
                      <span className="text-xs text-gray-500 mb-1">Lead Time Promedio</span>
                      <span className="text-2xl md:text-3xl font-light text-gray-800">14 días</span>
                    </div>
                    <div className="bg-white border border-gray-200 p-4 flex flex-col justify-center items-center shadow-sm relative group">
                      <span className="text-xs text-gray-500 mb-1">Pedidos Entregados</span>
                      <span className="text-2xl md:text-3xl font-light text-gray-800">1,452</span>
                    </div>
                  </div>

                  <div className="col-span-1 md:col-span-2 bg-white border border-gray-200 p-4 shadow-sm flex flex-col relative group min-h-[300px]">
                    <h3 className="text-sm text-gray-600 mb-4 font-medium text-center">Evolución OTIF (On-Time In-Full) %</h3>
                    <div className="flex-1 min-h-[250px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={otifData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EAEAEA" />
                          <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#666'}} />
                          <YAxis domain={[80, 100]} axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#666'}} />
                          <Tooltip contentStyle={{ borderRadius: '0px', border: '1px solid #ccc' }}/>
                          <Line type="monotone" dataKey="otif" name="OTIF %" stroke="#00B8AA" strokeWidth={3} dot={{r: 4, fill: '#00B8AA', strokeWidth: 0}} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="col-span-1 bg-white border border-gray-200 p-4 shadow-sm flex flex-col relative group min-h-[300px]">
                    <h3 className="text-sm text-gray-600 mb-4 font-medium text-center">Top Proveedores (OTIF %)</h3>
                    <div className="flex-1 min-h-[200px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart layout="vertical" data={supplierData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#EAEAEA" />
                          <XAxis type="number" domain={[0, 100]} hide />
                          <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{fontSize: 11, fill: '#666'}} width={70} />
                          <Tooltip cursor={{fill: '#f5f5f5'}} contentStyle={{ borderRadius: '0px', border: '1px solid #ccc' }}/>
                          <Bar dataKey="otif" name="OTIF %" fill="#12239E" radius={[0, 2, 2, 0]} barSize={20} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </>
              )}

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
