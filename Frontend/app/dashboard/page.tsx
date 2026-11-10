"use client";

// 1. IMPORTS
import React, { useCallback, useState } from "react";
import { signOut } from "next-auth/react";
import dynamic from "next/dynamic";
import { Sidebar, ModuleKey } from "./components/sidebar";
import { usePermissions } from "@/app/lib/permissions/usePermissions";
import { permisionMapping } from "@/app/lib/permissions/mapping";
import { Header } from "./components/Header";
import Perfil from "./components/Perfil";

// Carga perezosa (code-splitting): evita que Next compile todos los módulos
// pesados (xlsx, @univerjs, pdfjs, recharts, etc.) en el primer render del
// dashboard tras el login. Cada módulo solo se compila cuando se navega a él.
const Administracion = dynamic(() => import("./module/Administracion").then((m) => m.Administracion), { ssr: false });
const ClientMainRenderer = dynamic(() => import("./module/gestion_clientes/page"), { ssr: false });
const ClienteDetailPage = dynamic(() => import("./module/gestion_clientes/perfil/[id]/page"), { ssr: false });
const Cotizaciones = dynamic(() => import("./module/cotizacion"), { ssr: false });
const SeguimientoComercial = dynamic(() => import("./module/seguimiento"), { ssr: false });
const Dashboard = dynamic(() => import("./dashboard"), { ssr: false });
const OrdenesTrabajo = dynamic(() => import("./module/ordenes_ot"), { ssr: false });
const MainRenderers = dynamic(() => import("./module/recepciones").then((m) => m.MainRenderers), { ssr: false });
const SocketDebugger = dynamic(() => import("../componets/debugges_webscoekt "), { ssr: false });
const RevisionCertificados = dynamic(() => import("./module/Revison_certifados"), { ssr: false });
const CalibracionInformesMockup = dynamic(() => import("./module/Calibracion_informes"), { ssr: false });
const MainRendererenv = dynamic(() => import("./module/Envio_entrega"), { ssr: false });
const MainRendererreport = dynamic(() => import("./module/reportes"), { ssr: false });
const MainRenderer2 = dynamic(() => import("./module/import_ot"), { ssr: false });
// Tipado formal para las funciones de navegación
export interface Perfil {
  change_id_cliente: (n: number) => void;
  change_module: () => void;
  change_cliente: () => void;
}

// Títulos estáticos para la barra superior
const MODULE_TITLES: Record<ModuleKey, string> = {
  dashboard: "Director Técnico",
  clientes: "Gestión de Clientes",
  cotizaciones: "Cotizaciones",
  seguimiento: "Seguimiento Comercial",
  ordenes: "Órdenes de Trabajo",
  importarOrden: "Importar OT",
  recepcion: "Recepción de Equipos",
  calibracion: "Calibración e Informes",
  revision: "Revisión de Certificados",
  firma: "Firma y Sello",
  entrega: "Entrega y Envío",
  reportes: "Reportes y Consolidados",
  administracion: "Administración del Sistema",
  configuracion: "Configuración General",
  perfil_cliente: "Perfil Cliente",
};

// 2. COMPONENTES HIJOS (EXTRAÍDOS)

/**
 * Muestra el fondo oscuro con degradado
 */
const FondoDecorativo = () => {
  return (
    <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(99,102,241,0.18),_transparent_10%),radial-gradient(circle_at_bottom_right,_rgba(56,189,248,0.14),_transparent_16%)] pointer-events-none" />
  );
};

/**
 * Decide qué pantalla/módulo mostrar según lo que seleccionó el usuario
 */

import { useEffect } from "react";

interface ModuloActivoProps {
  modulo: ModuleKey;
  clienteId: number | null;                 // ← el ID del cliente seleccionado
  onSelectCliente: (id: number) => void;   // ← navega a perfil
  onVolver: () => void;     
  onNavigarte: (modulo: ModuleKey) =>void;               // ← vuelve a lista
  otToOpen: number | null;                 // ← OT a preseleccionar en Órdenes
  onOpenOt: (id: number) => void;          // ← abre una OT desde importación
}

const ModuloActivo = ({
    modulo, 
  clienteId, 
  onSelectCliente, 
  onVolver ,
  onNavigarte,
  otToOpen,
  onOpenOt,
}: ModuloActivoProps)=> {
  switch (modulo) {
    case "administracion":
      return <Administracion/>;

    case "clientes":
      return <ClientMainRenderer onSelectCliente={onSelectCliente}onVolver={onVolver}/>;

    case "perfil_cliente":
      return <ClienteDetailPage onVolver={onVolver} id_cliente={clienteId} />;
    
    case "cotizaciones":
      return <Cotizaciones />;

    case "seguimiento":
      return <SeguimientoComercial />;

    case "ordenes":
      return <OrdenesTrabajo otToOpen={otToOpen} />;
    case "recepcion":
      return <MainRenderers />;
    case "importarOrden":
      return <MainRenderer2 onOpenOt={onOpenOt} />;
    case "revision":
      return <RevisionCertificados/>
    case "dashboard":
      return <Dashboard onNavigate={onNavigarte}/>
    case "calibracion":
      return <CalibracionInformesMockup/>
    case "entrega":
      return<MainRendererenv/>
    case "reportes":
      return <MainRendererreport/>
    default:
      return null;
  }
};

// 3. COMPONENTE PADRE (MainRenderer)


export const MainRenderer = () => {

  const { hasModule } = usePermissions();

  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const [activeModule, setActiveModule] = useState<ModuleKey>("dashboard");
  const [cliente, setCliente] = useState<number | null>(null);
  const [otToOpen, setOtToOpen] = useState<number | null>(null);
  const [showProfile, setShowProfile] = useState(false);

  const puedeVer = useCallback((m: ModuleKey) => {
    const key = permisionMapping[m];
    return key === true || hasModule(key as string);
  }, [hasModule]);

  const navegarSeguro = useCallback((m: ModuleKey) => {
    setActiveModule(puedeVer(m) ? m : "dashboard");
  }, [puedeVer]);


  useEffect(() => {
    console.log("Módulo activo:", activeModule);
  }, [activeModule]);
  // Funciones para cambiar de pantalla y seleccionar cliente
  const change_perfil = {
    change_id_cliente: (n: number) => setCliente(n),
    change_module: () => setActiveModule("perfil_cliente"),
    change_cliente: () => setActiveModule("clientes"),
  };

  const handleSelectCliente = useCallback((id: number) => {
  setCliente(id);
  setActiveModule("perfil_cliente"); // Navega automáticamente
}, []);


const handleVolverClientes = useCallback(() => {
  setActiveModule("clientes");
}, []);

const handleOpenOt = useCallback((id: number) => {
  setOtToOpen(id);
  setActiveModule("ordenes");
}, []);

  const handleLogout = () => {
    console.log("Cerrando sesión...");
    signOut();
  };

  return (
    <div
      className="relative flex h-screen w-screen overflow-hidden bg-slate-950"
      style={{ fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif" }}
    >
      {/* 1. Fondo */}
      <FondoDecorativo />

      {/* 2. Menú Lateral */}
      <Sidebar
        activeModule={activeModule}
        onNavigate={navegarSeguro}
        onLogout={handleLogout}
        isOpen={isSidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* 3. Contenido Principal */}
      <div className="flex flex-col flex-1 overflow-hidden">
        <Header
          moduleTitle={MODULE_TITLES[activeModule] || "Módulo"}
          isSidebarOpen={isSidebarOpen}
          setIsSidebarOpen={setSidebarOpen}
          onOpenProfile={() => setShowProfile(true)}
        />

        <main className="flex-1 overflow-auto bg-[#eff5ff]">
          {puedeVer(activeModule) ? (
            <ModuloActivo
              modulo={activeModule}
              clienteId={cliente}
              onSelectCliente={handleSelectCliente}
              onVolver={handleVolverClientes}
              onNavigarte={navegarSeguro}
              otToOpen={otToOpen}
              onOpenOt={handleOpenOt}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-slate-400">
              No tienes permisos para acceder a este módulo.
            </div>
          )}
        </main>
      </div>

      {showProfile && <Perfil onClose={() => setShowProfile(false)} />}
    </div>
  );
};

// 4. EXPORTACIÓN POR DEFECTO
export default MainRenderer;