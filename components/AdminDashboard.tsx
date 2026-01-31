import React, { useState, useEffect, useMemo } from 'react';
import { 
  LayoutDashboard, 
  CalendarDays, 
  Settings, 
  LogOut, 
  CheckCircle, 
  XCircle, 
  Clock, 
  Users,
  Search,
  Filter,
  Copy,
  Database,
  AlertTriangle,
  Server,
  Megaphone,
  Trash2,
  Power,
  UtensilsCrossed,
  Save,
  Edit2,
  X,
  RefreshCw
} from 'lucide-react';
import { Reservation, Announcement } from '../types';
import { fetchAnnouncements, createAnnouncement, toggleAnnouncement, DEFAULT_MENU_ITEMS, resetMenuToDefaults } from '../services/supabase';

interface AdminDashboardProps {
  reservations: Reservation[];
  menuItems: any[];
  onUpdateStatus: (id: string, status: 'confirmed' | 'cancelled') => void;
  onUpdateMenuPrice: (id: string, newPrice: number) => void;
  onLogout: () => void;
  isDbConnected: boolean;
}

const AdminDashboard: React.FC<AdminDashboardProps> = ({ reservations, menuItems, onUpdateStatus, onUpdateMenuPrice, onLogout, isDbConnected }) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'reservations' | 'menu' | 'settings'>('overview');
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'confirmed' | 'cancelled'>('all');
  
  // Announcement State
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [newAnnouncementText, setNewAnnouncementText] = useState('');
  const [isPostingAnnouncement, setIsPostingAnnouncement] = useState(false);

  // Menu Edit State
  const [editingPriceId, setEditingPriceId] = useState<string | null>(null);
  const [tempPrice, setTempPrice] = useState<string>('');
  
  // System Tools
  const [isResettingMenu, setIsResettingMenu] = useState(false);

  // SAFE DATA ACCESSORS (Prevent Crashes if props are null/undefined)
  const safeReservations = Array.isArray(reservations) ? reservations : [];
  const safeMenuItems = Array.isArray(menuItems) ? menuItems : [];

  // Generate SQL dynamically inside component to avoid module-level crashes
  const sqlCommand = useMemo(() => {
    const safeDefaults = Array.isArray(DEFAULT_MENU_ITEMS) ? DEFAULT_MENU_ITEMS : [];
    
    const generateMenuInserts = () => {
      if (safeDefaults.length === 0) return '';
      return safeDefaults.map(item => 
        `('${item.id}', '${(item.name || '').replace(/'/g, "''")}', '${(item.description || '').replace(/'/g, "''")}', ${Number(item.price) || 0}, '${item.category || 'outros'}', ${item.highlight ? 'true' : 'false'}, '${item.image || ''}')`
      ).join(',\n  ');
    };

    return `-- RESET TOTAL (Nuclear Option para corrigir Tabelas)
DROP TABLE IF EXISTS menu_items;
DROP TABLE IF EXISTS reservations;
DROP TABLE IF EXISTS announcements;

-- Tabela de Reservas
create table reservations (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  client_name text,
  phone text,
  pax int,
  date text,
  time text,
  table_type text,
  status text default 'confirmed'
);

-- Tabela de Avisos (Announcements)
create table announcements (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  message text,
  is_active boolean default true
);

-- Tabela de Cardápio (Menu Items)
create table menu_items (
  id text primary key,
  name text,
  description text,
  price numeric,
  category text,
  highlight boolean,
  image text
);

alter table reservations enable row level security;
alter table announcements enable row level security;
alter table menu_items enable row level security;

create policy "Public Access" on reservations for all using (true) with check (true);
create policy "Public Access" on announcements for all using (true) with check (true);
create policy "Public Access" on menu_items for all using (true) with check (true);

-- POVOAR CARDÁPIO INICIAL (Seeds)
INSERT INTO menu_items (id, name, description, price, category, highlight, image)
VALUES
  ${generateMenuInserts()};
`;
  }, []); // Empty dependency array = calculate once on mount

  // Load Announcements when entering Settings tab
  useEffect(() => {
    if (activeTab === 'settings') {
      fetchAnnouncements().then(setAnnouncements);
    }
  }, [activeTab]);

  // Stats Calculation with Safety Checks
  const stats = {
    total: safeReservations.length,
    pending: safeReservations.filter(r => r?.status === 'pending').length,
    confirmed: safeReservations.filter(r => r?.status === 'confirmed').length,
    today: safeReservations.filter(r => {
      if (!r?.date) return false;
      try {
        return r.date === new Date().toISOString().split('T')[0];
      } catch (e) { return false; }
    }).length
  };

  const filteredReservations = safeReservations
    .filter(r => {
      if (!r) return false;
      return filterStatus === 'all' || r.status === filterStatus;
    })
    .sort((a, b) => (b?.createdAt || 0) - (a?.createdAt || 0));

  const copySql = () => {
    navigator.clipboard.writeText(sqlCommand);
    alert("Comando SQL copiado! Rode isso no Supabase.");
  };

  const handlePostAnnouncement = async () => {
    if (!newAnnouncementText.trim()) return;
    setIsPostingAnnouncement(true);
    const newItem = await createAnnouncement(newAnnouncementText);
    if (newItem) {
      setAnnouncements(prev => [newItem, ...prev]); 
      setNewAnnouncementText('');
    }
    setIsPostingAnnouncement(false);
  };

  const handleToggleAnnouncement = async (id: string, currentStatus: boolean) => {
    setAnnouncements(prev => prev.map(a => a.id === id ? { ...a, isActive: !currentStatus } : a));
    await toggleAnnouncement(id, !currentStatus);
    const fresh = await fetchAnnouncements();
    setAnnouncements(fresh);
  };

  const startEditingPrice = (item: any) => {
    if (!item) return;
    setEditingPriceId(item.id);
    const val = item.price !== undefined && item.price !== null ? item.price : 0;
    setTempPrice(val.toString());
  };

  const savePrice = (id: string) => {
    const newPrice = parseFloat(tempPrice);
    if (!isNaN(newPrice) && newPrice >= 0) {
      onUpdateMenuPrice(id, newPrice);
      setEditingPriceId(null);
    }
  };

  const formatPrice = (p: any) => {
    const num = parseFloat(p);
    return isNaN(num) ? '0.00' : num.toFixed(2);
  };

  const handleResetMenu = async () => {
    if (confirm("ATENÇÃO: Isso irá usar os valores padrão. Se estiver conectado ao DB, tentará resetar a tabela. Continuar?")) {
      setIsResettingMenu(true);
      try {
        await resetMenuToDefaults();
        alert("Cardápio restaurado com sucesso! Atualize a página.");
        window.location.reload();
      } catch (e) {
        alert("Erro. Verifique console.");
      } finally {
        setIsResettingMenu(false);
      }
    }
  };

  return (
    <div className="min-h-screen bg-stone-950 text-stone-200 font-sans flex animate-in fade-in duration-500">
      
      {/* Sidebar */}
      <aside className="w-64 bg-stone-900 border-r border-stone-800 flex flex-col fixed h-full z-20 shadow-2xl">
        <div className="p-6 border-b border-stone-800">
          <h1 className="font-serif text-2xl font-bold text-white tracking-widest">FUEGO<span className="text-orange-600">.OS</span></h1>
          <p className="text-xs text-stone-500 uppercase tracking-widest mt-1">Manager Dashboard</p>
        </div>
        
        <nav className="flex-1 p-4 space-y-2">
          <button 
            onClick={() => setActiveTab('overview')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'overview' ? 'bg-orange-600 text-white shadow-lg shadow-orange-900/20' : 'text-stone-400 hover:bg-stone-800 hover:text-white'}`}
          >
            <LayoutDashboard size={20} />
            <span className="font-medium">Visão Geral</span>
          </button>
          <button 
            onClick={() => setActiveTab('reservations')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'reservations' ? 'bg-orange-600 text-white shadow-lg shadow-orange-900/20' : 'text-stone-400 hover:bg-stone-800 hover:text-white'}`}
          >
            <CalendarDays size={20} />
            <span className="font-medium">Reservas</span>
            {stats.pending > 0 && (
              <span className="ml-auto bg-orange-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                {stats.pending}
              </span>
            )}
          </button>
          
          <button 
            onClick={() => setActiveTab('menu')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'menu' ? 'bg-orange-600 text-white shadow-lg shadow-orange-900/20' : 'text-stone-400 hover:bg-stone-800 hover:text-white'}`}
          >
            <UtensilsCrossed size={20} />
            <span className="font-medium">Cardápio</span>
          </button>
          
          <button 
            onClick={() => setActiveTab('settings')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'settings' ? 'bg-stone-700 text-white shadow-lg' : 'text-stone-400 hover:bg-stone-800 hover:text-white'}`}
          >
            <Settings size={20} />
            <span className="font-medium">Configurações</span>
          </button>
        </nav>

        <div className="p-4 border-t border-stone-800 space-y-4">
           {/* System Health Indicator */}
           <div className={`rounded-xl p-3 border ${isDbConnected ? 'bg-emerald-900/20 border-emerald-800' : 'bg-red-900/20 border-red-800'}`}>
              <div className="flex items-center gap-2 mb-1">
                 <div className={`w-2 h-2 rounded-full ${isDbConnected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`}></div>
                 <span className={`text-xs font-bold ${isDbConnected ? 'text-emerald-400' : 'text-red-400'}`}>
                   {isDbConnected ? 'Sistema Online' : 'Sistema Offline'}
                 </span>
              </div>
              {!isDbConnected && (
                <button onClick={() => setActiveTab('settings')} className="text-[10px] text-red-300 hover:text-white underline decoration-dashed">
                  Configurar Banco de Dados
                </button>
              )}
           </div>

          <button onClick={onLogout} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-stone-400 hover:bg-red-900/20 hover:text-red-400 transition-all">
            <LogOut size={20} />
            <span className="font-medium">Sair do Sistema</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 ml-64 p-8 overflow-y-auto">
        
        {/* Header */}
        <header className="flex justify-between items-center mb-8">
          <div>
            <h2 className="text-3xl font-serif font-bold text-white">
              {activeTab === 'overview' ? 'Dashboard' : activeTab === 'settings' ? 'Configurações' : activeTab === 'menu' ? 'Gestão de Cardápio' : 'Gerenciar Reservas'}
            </h2>
            <p className="text-stone-500 mt-1">Bem-vindo de volta, Gerente.</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex flex-col items-end">
                <span className="text-sm font-bold text-white">Fuego Admin</span>
                <span className="text-xs text-stone-500">Unidade Jardins</span>
            </div>
            <div className="w-10 h-10 rounded-full bg-stone-800 border border-stone-700 flex items-center justify-center">
              <Users size={20} className="text-stone-400" />
            </div>
          </div>
        </header>

        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="space-y-8 animate-in slide-in-from-bottom-5 duration-500">
            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="bg-stone-900 p-6 rounded-2xl border border-stone-800 hover:border-orange-900/30 transition-all">
                <div className="flex justify-between items-start mb-4">
                  <div className="p-3 bg-blue-500/10 rounded-xl text-blue-500">
                    <CalendarDays size={24} />
                  </div>
                  <span className="text-xs font-bold text-stone-500 bg-stone-800 px-2 py-1 rounded">HOJE</span>
                </div>
                <h3 className="text-3xl font-bold text-white mb-1">{stats.today}</h3>
                <p className="text-stone-500 text-sm">Reservas para hoje</p>
              </div>

              <div className="bg-stone-900 p-6 rounded-2xl border border-stone-800 hover:border-orange-900/30 transition-all">
                <div className="flex justify-between items-start mb-4">
                  <div className="p-3 bg-amber-500/10 rounded-xl text-amber-500">
                    <Clock size={24} />
                  </div>
                </div>
                <h3 className="text-3xl font-bold text-white mb-1">{stats.pending}</h3>
                <p className="text-stone-500 text-sm">Aguardando aprovação</p>
              </div>

              <div className="bg-stone-900 p-6 rounded-2xl border border-stone-800 hover:border-orange-900/30 transition-all">
                <div className="flex justify-between items-start mb-4">
                  <div className="p-3 bg-emerald-500/10 rounded-xl text-emerald-500">
                    <CheckCircle size={24} />
                  </div>
                </div>
                <h3 className="text-3xl font-bold text-white mb-1">{stats.confirmed}</h3>
                <p className="text-stone-500 text-sm">Reservas confirmadas</p>
              </div>

              <div className="bg-stone-900 p-6 rounded-2xl border border-stone-800 hover:border-orange-900/30 transition-all">
                <div className="flex justify-between items-start mb-4">
                  <div className="p-3 bg-purple-500/10 rounded-xl text-purple-500">
                    <Users size={24} />
                  </div>
                </div>
                <h3 className="text-3xl font-bold text-white mb-1">{stats.total}</h3>
                <p className="text-stone-500 text-sm">Total histórico</p>
              </div>
            </div>

            {/* Quick Actions / Recent */}
            <div className="bg-stone-900 rounded-2xl border border-stone-800 overflow-hidden">
              <div className="p-6 border-b border-stone-800 flex justify-between items-center">
                <h3 className="font-bold text-white text-lg">Solicitações Recentes</h3>
                <button onClick={() => setActiveTab('reservations')} className="text-orange-500 text-sm font-bold hover:underline">Ver todas</button>
              </div>
              <div>
                {filteredReservations.slice(0, 5).map(res => (
                  <div key={res.id} className="p-4 border-b border-stone-800 last:border-0 hover:bg-stone-800/50 transition-colors flex items-center justify-between">
                    <div className="flex items-center gap-4">
                       <div className={`w-2 h-2 rounded-full ${res.status === 'confirmed' ? 'bg-emerald-500' : res.status === 'pending' ? 'bg-amber-500' : 'bg-red-500'}`}></div>
                       <div>
                         <p className="font-bold text-white">{res.clientName}</p>
                         <p className="text-xs text-stone-500">{res.date} às {res.time} • {res.pax}</p>
                       </div>
                    </div>
                    {res.status === 'pending' && (
                       <div className="flex gap-2">
                         <button onClick={() => onUpdateStatus(res.id, 'confirmed')} className="p-2 bg-emerald-500/10 text-emerald-500 rounded-lg hover:bg-emerald-500 hover:text-white transition-colors">
                           <CheckCircle size={16} />
                         </button>
                         <button onClick={() => onUpdateStatus(res.id, 'cancelled')} className="p-2 bg-red-500/10 text-red-500 rounded-lg hover:bg-red-500 hover:text-white transition-colors">
                           <XCircle size={16} />
                         </button>
                       </div>
                    )}
                  </div>
                ))}
                {filteredReservations.length === 0 && (
                  <div className="p-8 text-center text-stone-500">
                    Nenhuma reserva encontrada. 
                    {!isDbConnected && <span className="text-red-500 block mt-2 text-xs">Atenção: Você está visualizando dados locais offline.</span>}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Menu Management Tab */}
        {activeTab === 'menu' && (
          <div className="bg-stone-900 rounded-2xl border border-stone-800 overflow-hidden animate-in slide-in-from-bottom-5 duration-500">
             <div className="p-6 border-b border-stone-800">
                <h3 className="text-xl font-bold text-white">Gerenciar Preços do Cardápio</h3>
                <p className="text-stone-500 text-sm">Atualize os preços em tempo real para o site.</p>
             </div>
             
             <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                {safeMenuItems.length === 0 && (
                  <div className="col-span-full p-8 text-center text-stone-500 bg-stone-950 rounded-xl border border-stone-800">
                    <p>Nenhum item encontrado no cardápio.</p>
                    <button onClick={handleResetMenu} className="mt-4 text-orange-500 underline text-sm hover:text-white">
                      Restaurar Itens Padrão
                    </button>
                  </div>
                )}
                {safeMenuItems.map((item) => (
                  <div key={item.id} className="flex items-center gap-4 bg-stone-950 p-4 rounded-xl border border-stone-800 hover:border-orange-900/50 transition-colors">
                    <img src={item.image} alt={item.name} className="w-16 h-16 rounded-lg object-cover bg-stone-900" />
                    <div className="flex-1">
                      <p className="font-bold text-white text-sm">{item.name}</p>
                      <p className="text-xs text-stone-500 capitalize">{item.category}</p>
                    </div>
                    
                    <div className="flex flex-col items-end gap-2">
                       {editingPriceId === item.id ? (
                         <div className="flex items-center gap-2">
                           <span className="text-orange-500 font-bold text-sm">R$</span>
                           <input 
                              type="number"
                              step="0.01"
                              value={tempPrice}
                              onChange={(e) => setTempPrice(e.target.value)}
                              className="w-20 bg-stone-800 border border-stone-600 rounded px-2 py-1 text-white text-sm focus:border-orange-500 outline-none"
                              autoFocus
                           />
                           <button 
                              onClick={() => savePrice(item.id)}
                              className="p-1.5 bg-emerald-600 text-white rounded hover:bg-emerald-700 transition-colors"
                           >
                              <Save size={14} />
                           </button>
                           <button 
                              onClick={() => setEditingPriceId(null)}
                              className="p-1.5 bg-stone-700 text-white rounded hover:bg-stone-600 transition-colors"
                           >
                              <X size={14} />
                           </button>
                         </div>
                       ) : (
                         <div className="flex items-center gap-3">
                           <span className="font-bold text-emerald-400">R$ {formatPrice(item.price)}</span>
                           <button 
                              onClick={() => startEditingPrice(item)}
                              className="p-1.5 bg-stone-800 text-stone-400 rounded hover:bg-stone-700 hover:text-white transition-colors"
                              title="Editar Preço"
                           >
                              <Edit2 size={14} />
                           </button>
                         </div>
                       )}
                    </div>
                  </div>
                ))}
             </div>
          </div>
        )}

        {/* Settings Tab */}
        {activeTab === 'settings' && (
           <div className="space-y-6 animate-in slide-in-from-bottom-5 duration-500">
              
              {/* Announcement Manager */}
              <div className="bg-stone-900 rounded-2xl border border-stone-800 p-8">
                 <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                    <Megaphone className="text-orange-500" />
                    Avisos Globais no Site
                 </h3>
                 
                 <div className="flex gap-4 mb-6">
                    <input 
                      type="text" 
                      placeholder="Ex: Estamos fechados neste feriado. Retornamos dia 02." 
                      className="flex-1 bg-stone-950 border border-stone-700 rounded-lg p-3 text-white focus:border-orange-500 outline-none"
                      value={newAnnouncementText}
                      onChange={(e) => setNewAnnouncementText(e.target.value)}
                    />
                    <button 
                      onClick={handlePostAnnouncement}
                      disabled={isPostingAnnouncement || !newAnnouncementText.trim()}
                      className="bg-orange-600 text-white font-bold px-6 rounded-lg hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                      {isPostingAnnouncement ? 'Postando...' : 'Criar Aviso'}
                    </button>
                 </div>

                 {/* List of Announcements */}
                 <div className="space-y-3">
                    {announcements.length === 0 && (
                      <p className="text-stone-500 text-sm italic">Nenhum aviso criado recentemente.</p>
                    )}
                    {announcements.map(ann => (
                      <div key={ann.id} className={`flex items-center justify-between p-4 rounded-xl border transition-all ${ann.isActive ? 'bg-orange-900/20 border-orange-800' : 'bg-stone-950 border-stone-800 opacity-60'}`}>
                         <div className="flex items-center gap-3">
                            <div className={`w-2 h-2 rounded-full ${ann.isActive ? 'bg-orange-500 animate-pulse' : 'bg-stone-600'}`}></div>
                            <span className="text-white font-medium">{ann.message}</span>
                            <span className="text-xs text-stone-500 ml-2">{new Date(ann.createdAt).toLocaleDateString()}</span>
                         </div>
                         <div className="flex items-center gap-2">
                            <button 
                              onClick={() => handleToggleAnnouncement(ann.id, ann.isActive)}
                              className={`p-2 rounded-lg font-bold text-xs uppercase tracking-wider ${ann.isActive ? 'bg-orange-600 text-white' : 'bg-stone-800 text-stone-400 hover:bg-stone-700'}`}
                            >
                              {ann.isActive ? 'Ativo' : 'Ativar'}
                            </button>
                         </div>
                      </div>
                    ))}
                 </div>
              </div>

              {/* Status Card */}
              <div className="bg-stone-900 rounded-2xl border border-stone-800 p-8">
                 <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                    <Server className={isDbConnected ? "text-emerald-500" : "text-red-500"} />
                    Status do Sistema
                 </h3>
                 
                 <div className="flex flex-col md:flex-row gap-6">
                    <div className={`flex-1 p-6 rounded-xl border ${isDbConnected ? 'bg-emerald-900/10 border-emerald-900/30' : 'bg-red-900/10 border-red-900/30'}`}>
                       <p className="text-sm font-bold uppercase text-stone-500 mb-2">Conectividade</p>
                       <div className="flex items-center gap-3">
                          <div className={`w-3 h-3 rounded-full ${isDbConnected ? 'bg-emerald-500' : 'bg-red-500'}`}></div>
                          <span className={`text-xl font-bold ${isDbConnected ? 'text-emerald-400' : 'text-red-400'}`}>
                             {isDbConnected ? 'Banco de Dados Conectado' : 'Modo Offline / Local'}
                          </span>
                       </div>
                       {!isDbConnected && (
                          <p className="mt-2 text-sm text-red-300">
                             Os dados estão sendo salvos apenas neste navegador. Para sincronizar entre dispositivos, configure o banco de dados abaixo.
                          </p>
                       )}
                    </div>

                    <div className="flex-1 p-6 rounded-xl border bg-stone-950 border-stone-800">
                       <p className="text-sm font-bold uppercase text-stone-500 mb-2">Versão do Sistema</p>
                       <p className="text-xl font-bold text-white">v2.4.0 (GastroOS)</p>
                       <p className="mt-2 text-sm text-stone-500">Atualizado em Fev 2024</p>
                    </div>
                 </div>
              </div>

              {/* Database Config Card */}
              <div className="bg-stone-900 rounded-2xl border border-stone-800 p-8">
                 <div className="flex justify-between items-center mb-6">
                    <h3 className="text-xl font-bold text-white flex items-center gap-2">
                       <Database className="text-orange-500" />
                       Configuração do Banco de Dados
                    </h3>
                    <button 
                      onClick={handleResetMenu}
                      disabled={isResettingMenu}
                      className="bg-red-900/30 hover:bg-red-900/50 border border-red-800/50 text-red-400 px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all"
                    >
                      <RefreshCw size={16} className={isResettingMenu ? 'animate-spin' : ''} />
                      {isResettingMenu ? 'Restaurando...' : 'Resetar Cardápio (Corrigir Erros)'}
                    </button>
                 </div>

                 <div className="bg-amber-900/20 border border-amber-700/50 rounded-lg p-4 mb-6 flex gap-3">
                    <AlertTriangle className="text-amber-500 shrink-0" />
                    <p className="text-sm text-amber-200">
                      Para ativar a sincronização em tempo real e o <strong>Sistema de Avisos</strong>, execute o código SQL abaixo no <strong>SQL Editor</strong> do seu painel Supabase. 
                      Isso criará as tabelas necessárias. Se o cardápio sumir, clique no botão "Resetar Cardápio" acima.
                    </p>
                 </div>

                 <div className="bg-black rounded-lg border border-stone-800 p-6 relative group">
                    <pre className="text-sm font-mono text-emerald-400 whitespace-pre-wrap overflow-x-auto">
                      {sqlCommand}
                    </pre>
                    <button 
                      onClick={copySql}
                      className="absolute top-4 right-4 bg-stone-800 hover:bg-stone-700 text-white px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition-all shadow-lg"
                    >
                      <Copy size={14} /> Copiar SQL
                    </button>
                 </div>
              </div>
           </div>
        )}

      </main>
    </div>
  );
};

export default AdminDashboard;