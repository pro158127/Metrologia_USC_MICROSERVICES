"use client";

// 1. IMPORTS
import React, { useCallback, useState } from "react";
import { signOut } from "next-auth/react";
import { Sidebar, ModuleKey } from "./components/sidebar";
import { Header } from "./components/Header";
import { Administracion } from "./module/Administracion";
import ClientMainRenderer from "./module/gestion_clientes/page";
import ClienteDetailPage from "./module/gestion_clientes/perfil/[id]/page";
import Cotizaciones from "./module/cotizacion";
import Dashboard from "./dashboard";
import OrdenesTrabajo from "./module/ordenes_ot";
import  { MainRenderers } from  "./module/recepciones";
import SocketDebugger from "../componets/debugges_webscoekt ";
import RevisionCertificados from "./module/Revison_certifados";
import CalibracionInformesMockup from "./module/Calibracion_informes";
import MainRendererenv from "./module/Envio_entrega";
import MainRendererreport from "./module/reportes";
// Tipado formal para las funciones de navegación
import MainRenderer2 from "./module/import_ot";
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
}

const ModuloActivo = ({
    modulo, 
  clienteId, 
  onSelectCliente, 
  onVolver ,
  onNavigarte
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

    case "ordenes":
      return <OrdenesTrabajo />;
    case "recepcion":
      return <MainRenderers />;
    case "importarOrden":
      return <MainRenderer2 />;
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



  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const [activeModule, setActiveModule] = useState<ModuleKey>("dashboard");
  const [cliente, setCliente] = useState<number | null>(null);


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
        onNavigate={(m) => setActiveModule(m)}
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
        />

        <main className="flex-1 overflow-auto bg-[#eff5ff]">
          <ModuloActivo modulo={activeModule}   clienteId={cliente}
  onSelectCliente={handleSelectCliente}
  onVolver={handleVolverClientes}  onNavigarte={(m:ModuleKey) => setActiveModule(m)} />
        </main>
      </div>

    </div>
  );
};

// 4. EXPORTACIÓN POR DEFECTO
export default MainRenderer;