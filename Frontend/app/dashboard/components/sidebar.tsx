"use client";

import { 
  Ruler, 
  X,
  LayoutDashboard, 
  Users, 
  FileText, 
  Wrench, 
  Package, 
  FlaskConical, 
  CheckSquare, 
  PenTool, 
  Truck, 
  BarChart3, 
  Settings, 
  ClipboardList, 
  LogOut 
} from "lucide-react";
import UscLabLogo from "./logo";
import { useSession } from "next-auth/react";
import { sidebar_permissions } from "@/app/server_component/controlle_permission";
export type ModuleKey =
  | "dashboard"
  | "clientes"
  | "cotizaciones"
  | "ordenes"
  | "importarOrden"
  | "recepcion"
  | "calibracion"
  | "revision"
  | "firma"
  | "entrega"
  | "reportes"
  | "administracion"
  | "configuracion"|"perfil_cliente";


interface SidebarItem {
  key: ModuleKey;
  label: string;
  icon: React.ReactNode;
  badge?: number;
}

interface SidebarSection {
  title: string;
  items: SidebarItem[];
}

interface SidebarProps {
  activeModule: ModuleKey;
  onNavigate: (module: ModuleKey) => void;
  onLogout: () => void;
  isOpen: boolean;      
  onClose: () => void;  
}

// 1. Diccionario para mapear las llaves del Sidebar con las llaves del objeto de permisos
const permisionMapping: Record<ModuleKey, string | boolean> = {
  dashboard: true, // Siempre visible
  clientes: "clientes",
  cotizaciones: "cotizaciones",
  recepcion: "recepcion_de_equipos",  
  importarOrden: "ordenesOt", // Comparte permiso con Órdenes
  ordenes: "ordenes_de_trabajo",
  calibracion: "calibracion_e_informes",
  revision: "revision",    // Ajustar si tiene un permiso propio
  firma: "firma_sello_y_certificacion",
  entrega: "entrega_y_envio",
  reportes: "reportes_y_consolidados",
  administracion: "administracion",         // Ajustar si tiene un permiso propio
  configuracion: true,      // Ajustar si tiene un permiso propio
  perfil_cliente:true
};

const sections: SidebarSection[] = [
  {
    title: "PANEL PRINCIPAL",
    items: [{ key: "dashboard", label: "Dashboard", icon: <LayoutDashboard size={16} /> }],
  },
  {
    title: "GESTIÓN",
    items: [
      { key: "clientes", label: "Clientes", icon: <Users size={16} /> },
      { key: "cotizaciones", label: "Cotizaciones", icon: <FileText size={16} /> },
      { key: "recepcion", label: "Recepción de Equipos", icon: <Package size={16} /> },
      { key: "importarOrden", label: "Importar OT", icon: <FileText size={16} /> },
      { key: "ordenes", label: "Órdenes de Trabajo", icon: <Wrench size={16} /> },
    ],
  },
  {
    title: "TÉCNICO",
    items: [
      { key: "calibracion", label: "Calibración e Informes", icon: <FlaskConical size={16} /> },
      { key: "revision", label: "Revisión de Certificados", icon: <CheckSquare size={16} />, badge: 12 },
      { key: "firma", label: "Firma y Sello", icon: <PenTool size={16} /> },
    ],
  },
  {
    title: "OPERACIONES",
    items: [
      { key: "entrega", label: "Entrega y Envío", icon: <Truck size={16} /> },
      { key: "reportes", label: "Reportes y Consolidados", icon: <BarChart3 size={16} /> },
    ],
  },
  {
    title: "SISTEMA",
    items: [
      { key: "administracion", label: "Administración", icon: <Settings size={16} /> },
      { key: "configuracion", label: "Configuración General", icon: <Settings size={16} /> },
    ],
  },
];

export function Sidebar({ activeModule, onNavigate, onLogout, isOpen, onClose }: SidebarProps) {
  const { data: session } = useSession();
  const permisos = session?.user?.permissions || {};
  const modulosVisibles = sidebar_permissions({ permisos }) || {};
  console.log("Permisos del usuario:",modulosVisibles);
  return (
    <>
      {isOpen && (
        <div 
          className="fixed inset-0 z-40 bg-black/50 lg:hidden" 
          onClick={onClose}
        />
      )}

      <aside 
        className={`fixed inset-y-0 left-0 z-50 flex h-full w-72 shrink-0 flex-col border-r border-white/10 bg-slate-950 text-slate-300 transition-all duration-300 ease-in-out lg:static ${
          isOpen 
            ? "translate-x-0 lg:ml-0" 
            : "-translate-x-full lg:-ml-72"
        }`}
      >
        <div className="flex items-center justify-between px-6 py-5">
          <UscLabLogo />
          <button 
            onClick={onClose} 
            className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
            title="Cerrar menú"
          >
            <X size={20} />
          </button>
        </div>

        <div className="mx-4 mt-1 flex-1 overflow-y-auto rounded-[28px] border border-white/10 bg-slate-950/85 p-3 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)] scrollbar-hide">
          {sections.map((section) => {
            // 2. Filtrar los ítems de esta sección basándonos en el mapeo y los permisos reales
            const visibleItems = section.items.filter((item) => {
              const permisoKey = permisionMapping[item.key];
              
              // Si el mapeo dice true, no requiere restricción (ej: dashboard)
              if (permisoKey === true) return true;
              
              // Si existe la propiedad en modulosVisibles, retornamos su valor booleano
              return !!modulosVisibles[permisoKey as string];
            });

            // 3. Si la sección no tiene ningún ítem visible, no renderizamos ni el título
            if (visibleItems.length === 0) return null;
            console.log(`Sección: ${section.title}, Ítems visibles:`, visibleItems.map(i => i.label));

            return (
              <div key={section.title} className="mb-4">
                <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.28em] text-slate-500">
                  {section.title}
                </div>
                {visibleItems.map((item) => {
                  const isActive = activeModule === item.key;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => onNavigate(item.key)}
                      className={`group flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-sm transition ${
                        isActive
                          ? "bg-slate-800 text-white shadow-[0_0_0_1px_rgba(255,255,255,0.06)]"
                          : "text-slate-400 hover:bg-slate-800 hover:text-white"
                      }`}
                      style={{ borderLeft: isActive ? "3px solid #818CF8" : "3px solid transparent" }}
                    >
                      <span
                        className={`inline-flex h-9 w-9 items-center justify-center rounded-2xl transition ${
                          isActive ? "bg-slate-900 text-indigo-200" : "bg-slate-900/60 text-slate-400"
                        }`}
                      >
                        {item.icon}
                      </span>
                      <span className="flex-1 text-left">{item.label}</span>
                      {item.badge && (
                        <span className="rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-semibold text-white">
                          {item.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>

        <div className="mt-auto border-t border-white/10 p-4">
          <button
            type="button"
            onClick={onLogout}
            className="flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 text-sm font-medium text-slate-200 transition hover:bg-slate-800 hover:text-rose-400"
          >
            <LogOut size={16} />
            Cerrar sesión
          </button>
          <div className="mt-3 text-center text-xs leading-5 text-slate-500">
            ISO/IEC 17025 · Lab. USC
          </div>
        </div>
      </aside>
    </>
  );
}