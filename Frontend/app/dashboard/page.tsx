"use client";

// 1. IMPORTS
import React, { useCallback, useEffect, useRef, useState } from "react";
import { signOut } from "next-auth/react";
import dynamic from "next/dynamic";
import { Sidebar, ModuleKey } from "./components/sidebar";
import { usePermissions } from "@/app/lib/permissions/usePermissions";
import { permisionMapping } from "@/app/lib/permissions/mapping";
import { Header } from "./components/Header";
import Perfil from "./components/Perfil";
import { MODULE_READY_EVENT, PageLoadSplash } from "./components/PageLoadSplash";

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

interface ModuloActivoProps {
  modulo: ModuleKey;
  clienteId: number | null;                 // ← el ID del cliente seleccionado
  onSelectCliente: (id: number) => void;   // ← navega a perfil
  onVolver: () => void;     
  onNavigarte: (modulo: ModuleKey, idCertificado?: number) => void;
  certificadoToOpen: number | null;               // ← vuelve a lista
  otToOpen: number | null;                 // ← OT a preseleccionar en Órdenes
  onOpenOt: (id: number) => void;          // ← abre una OT desde importación
}

const ModuloActivo = ({
    modulo, 
  clienteId, 
  onSelectCliente, 
  onVolver ,
  onNavigarte,
  certificadoToOpen,
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
      return <RevisionCertificados certificadoInicial={certificadoToOpen} />
    case "dashboard":
      return <Dashboard onNavigate={onNavigarte}/>
    case "calibracion":
      return <CalibracionInformesMockup/>
    case "entrega":
      return<MainRendererenv onOpenOt={onOpenOt} />
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
  const activeModuleRef = useRef<ModuleKey>("dashboard");
  const pendingModuleRef = useRef<{ key: ModuleKey; id: number } | null>({ key: "dashboard", id: 0 });
  const navigationIdRef = useRef(0);
  const splashDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const splashWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [splashVisible, setSplashVisible] = useState(false);
  const [cliente, setCliente] = useState<number | null>(null);
  const [certificadoToOpen, setCertificadoToOpen] = useState<number | null>(null);
  const [otToOpen, setOtToOpen] = useState<number | null>(null);
  const [showProfile, setShowProfile] = useState(false);

  const puedeVer = useCallback((m: ModuleKey) => {
    const key = permisionMapping[m];
    return key === true || hasModule(key as string);
  }, [hasModule]);

  const iniciarNavegacionModulo = useCallback((module: ModuleKey) => {
    if (module === activeModuleRef.current) return;
    activeModuleRef.current = module;
    setActiveModule(module);

    const renderizaModulo = new Set<ModuleKey>([
      "dashboard", "clientes", "cotizaciones", "seguimiento", "ordenes", "importarOrden",
      "recepcion", "calibracion", "revision", "entrega", "reportes", "administracion", "perfil_cliente",
    ]).has(module);
    const id = ++navigationIdRef.current;
    pendingModuleRef.current = renderizaModulo ? { key: module, id } : null;
    setSplashVisible(false);
    if (splashDelayRef.current) clearTimeout(splashDelayRef.current);
    if (splashWatchdogRef.current) clearTimeout(splashWatchdogRef.current);
    if (!renderizaModulo) return;

    // Fast module changes stay unobstructed; slower loads reveal the full-page splash.
    splashDelayRef.current = setTimeout(() => {
      if (pendingModuleRef.current?.id === id) setSplashVisible(true);
    }, 120);
    // A broken request must not leave the screen covered indefinitely.
    splashWatchdogRef.current = setTimeout(() => {
      if (pendingModuleRef.current?.id !== id) return;
      pendingModuleRef.current = null;
      setSplashVisible(false);
    }, 15000);
  }, []);

  useEffect(() => {
    const confirmarCargaModulo = (event: Event) => {
      const key = (event as CustomEvent<{ moduleKey?: ModuleKey }>).detail?.moduleKey;
      if (!key || pendingModuleRef.current?.key !== key || activeModuleRef.current !== key) return;
      pendingModuleRef.current = null;
      if (splashDelayRef.current) clearTimeout(splashDelayRef.current);
      if (splashWatchdogRef.current) clearTimeout(splashWatchdogRef.current);
      setSplashVisible(false);
    };
    window.addEventListener(MODULE_READY_EVENT, confirmarCargaModulo);
    // The first dashboard module can also need a full-page initial load.
    const id = pendingModuleRef.current?.id;
    if (id != null) {
      splashDelayRef.current = setTimeout(() => {
        if (pendingModuleRef.current?.id === id) setSplashVisible(true);
      }, 120);
      splashWatchdogRef.current = setTimeout(() => {
        if (pendingModuleRef.current?.id !== id) return;
        pendingModuleRef.current = null;
        setSplashVisible(false);
      }, 15000);
    }
    return () => {
      window.removeEventListener(MODULE_READY_EVENT, confirmarCargaModulo);
      if (splashDelayRef.current) clearTimeout(splashDelayRef.current);
      if (splashWatchdogRef.current) clearTimeout(splashWatchdogRef.current);
    };
  }, []);

  const navegarSeguro = useCallback((m: ModuleKey, idCertificado?: number) => {
    setCertificadoToOpen(m === "revision" ? idCertificado ?? null : null);
    iniciarNavegacionModulo(puedeVer(m) ? m : "dashboard");
  }, [iniciarNavegacionModulo, puedeVer]);


  useEffect(() => {
    console.log("Módulo activo:", activeModule);
  }, [activeModule]);
  // Funciones para cambiar de pantalla y seleccionar cliente
  const change_perfil = {
    change_id_cliente: (n: number) => setCliente(n),
    change_module: () => iniciarNavegacionModulo("perfil_cliente"),
    change_cliente: () => iniciarNavegacionModulo("clientes"),
  };

  const handleSelectCliente = useCallback((id: number) => {
  setCliente(id);
  iniciarNavegacionModulo("perfil_cliente"); // Navega automáticamente
}, [iniciarNavegacionModulo]);


const handleVolverClientes = useCallback(() => {
  iniciarNavegacionModulo("clientes");
}, [iniciarNavegacionModulo]);

const handleOpenOt = useCallback((id: number) => {
  setOtToOpen(id);
  iniciarNavegacionModulo("ordenes");
}, [iniciarNavegacionModulo]);

  const handleLogout = async () => {
    try {
      // Espera a que NextAuth elimine la cookie antes de cambiar de pantalla.
      await signOut({ redirect: false });
    } catch (error) {
      console.error("No se pudo completar la solicitud de cierre de sesión:", error);
    }
    window.location.replace("/Login");
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
              certificadoToOpen={certificadoToOpen}
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
      <PageLoadSplash visible={splashVisible} moduleTitle={MODULE_TITLES[activeModule] || "Módulo"} />
    </div>
  );
};

// 4. EXPORTACIÓN POR DEFECTO
export default MainRenderer;
