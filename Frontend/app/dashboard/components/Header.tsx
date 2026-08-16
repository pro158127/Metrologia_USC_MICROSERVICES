"use client";

import { useState,useMemo,useEffect } from "react";
import { Menu,Check, Bell, ChevronDown, CheckCircle, X, Ruler,Trash2 } from "lucide-react";
import { useSession } from "next-auth/react";
import { warn } from "console";
import { useDbTable, useDbActions } from "@/app/componets/tables_recharge";
import type RealtimeTablesState from "@/tipos/store";


import { 
  marcarNotificacionComoLeida, 
  eliminarNotificacion, 
  marcarTodasComoLeidas, 
  eliminarTodasLasNotificaciones ,
  getHistorialCompletoNotificaciones
  
} from '@/app/action_module/notify'; // Ajusta la ruta a tu archivo de funciones

const priorityStyles: Record<string, { bg: string; text: string; label: string }> = {
  ALTA: { bg: "#FEE2E2", text: "#991B1B", label: "Alta" },
  MEDIA: { bg: "#FEF3C7", text: "#92400E", label: "Media" },
  BAJA: { bg: "#E0F2FE", text: "#075985", label: "Baja" },
};


export default function NotificationCenter() {
  const [showPanel, setShowPanel] = useState(false);
  const notificaciones = useDbTable("notificaciones");
  const { setDbState } = useDbActions();
  const { data: session } = useSession();
  const currentUserId = session?.user?.id_user;

  // Estado local para manejar las transiciones de salida
  const [exitingIds, setExitingIds] = useState<number[]>([]);

  // Filtramos para mostrar únicamente las que NO han sido vistas
  const activeNotifications = notificaciones.filter((n) => !n.visto);
  const unreadCount = activeNotifications.length;

  const formatTime = (dateInput: string | Date) => {
    const d = new Date(dateInput);
    return d.toLocaleDateString("es-ES", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

useEffect(() => {
  async function obtener_noty() {
    // Evitamos consultas si aún no tenemos el ID del usuario
    if (!currentUserId) return;

    console.log("Consultando en la base de datos notificaciones para el usuario:", currentUserId);
    
    const { success, data } = await getHistorialCompletoNotificaciones(currentUserId);

    if (success) {
      setDbState((prevGlobalState): RealtimeTablesState => ({
        ...prevGlobalState,
        // Usamos ?? [] para que si por algún motivo 'data' es undefined, 
        // TypeScript reciba un array vacío y no lance el error anterior.
        notificaciones: data ?? [] 
      }));
    } else {
      console.error("No se pudieron cargar las notificaciones desde el backend");
    }
  }

  obtener_noty();
}, [currentUserId, setDbState]); // Añadimos las dependencias correctas para el ciclo de vida

  // 1. Marcar una sola notificación como leída
  const handleMarkAsRead = async (idNotificacion: number) => {
    setExitingIds((prev) => [...prev, idNotificacion]);

    setTimeout(async () => {
      try {
        // Ejecución de tu Server Action original
        const result = await marcarNotificacionComoLeida(idNotificacion);

        if (result.success) {
          setDbState((prev) => ({
            ...prev,
            notificaciones: prev.notificaciones.map((n) =>
              n.idNotificacion === idNotificacion ? { ...n, visto: true } : n
            ),
          }));
        }
      } catch (error) {
        console.error("Error al actualizar la notificación:", error);
      } finally {
        setExitingIds((prev) => prev.filter((id) => id !== idNotificacion));
      }
    }, 300);
  };

  // 2. Eliminar una sola notificación de forma permanente
  const handleDelete = async (idNotificacion: number) => {
    setExitingIds((prev) => [...prev, idNotificacion]);

    setTimeout(async () => {
      try {
        // Ejecución de tu Server Action original
        const result = await eliminarNotificacion(idNotificacion);

        if (result.success) {
          setDbState((prev) => ({
            ...prev,
            notificaciones: prev.notificaciones.filter((n) => n.idNotificacion !== idNotificacion),
          }));
        } else {
          setExitingIds((prev) => prev.filter((id) => id !== idNotificacion));
        }
      } catch (error) {
        console.error("Error al eliminar la notificación:", error);
        setExitingIds((prev) => prev.filter((id) => id !== idNotificacion));
      } 
    }, 300);
  };

  // 3. NUEVA: Marcar ABSOLUTAMENTE TODAS como leídas para el usuario actual
  const handleMarkAllAsRead = async () => {
    if (!currentUserId) return;

    try {
      const result = await marcarTodasComoLeidas(Number(currentUserId));
      
      if (result.success) {
        setDbState((prev) => ({
          ...prev,
          notificaciones: prev.notificaciones.map((n) => ({ ...n, visto: true })),
        }));
      }
    } catch (error) {
      console.error("Error al marcar todas las notificaciones:", error);
    }
  };

  // 4. NUEVA: Vaciar el historial por completo para el usuario actual
  const handleClearAll = async () => {
    if (!currentUserId) return;

    try {
      const result = await eliminarTodasLasNotificaciones(Number(currentUserId));
      
      if (result.success) {
        setDbState((prev) => ({
          ...prev,
          notificaciones: [], // Vaciamos por completo el array local de notificaciones
        }));
      }
    } catch (error) {
      console.error("Error al eliminar todas las notificaciones:", error);
    }
  };

  return (
<div className="relative inline-block text-left">
      {/* Botón de la Campana con Contador */}
      <button
        onClick={() => setShowPanel(!showPanel)}
        className="relative p-2 text-gray-600 hover:text-gray-900 focus:outline-none transition-colors duration-200"
      >
        <span className="sr-only">Ver notificaciones</span>
        <svg
          className="h-6 w-6"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth="1.5"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0"
          />
        </svg>

        {unreadCount > 0 && (
          <span className="absolute top-0 right-0 inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-red-100 transform translate-x-1/3 -translate-y-1/3 bg-red-600 rounded-full animate-pulse">
            {unreadCount}
          </span>
        )}
      </button>

      {/* Panel Desplegable de Notificaciones */}
      {showPanel && (
        <div className="absolute right-0 mt-2 w-96 max-h-[500px] flex flex-col bg-white rounded-xl shadow-2xl border border-gray-100 z-50 overflow-hidden transform origin-top-right transition-all">
          
          {/* Cabecera del Panel */}
          <div className="p-4 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-gray-800 text-sm">Notificaciones</h3>
              <p className="text-xs text-gray-500">Tienes {unreadCount} por leer</p>
            </div>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllAsRead}
                className="text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors"
              >
                Marcar todo leído
              </button>
            )}
          </div>

          {/* Cuerpo / Lista de Alertas */}
          <div className="overflow-y-auto flex-1 divide-y divide-gray-100 max-h-[380px]">
            {activeNotifications.length === 0 ? (
              <div className="p-8 text-center text-gray-400 text-sm flex flex-col items-center justify-center gap-2">
                <svg className="w-8 h-8 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>¡Todo al día! No hay notificaciones nuevas.</span>
              </div>
            ) : (
              activeNotifications.map((n) => {
                const style = priorityStyles[n.nivelPrioridad] || { bg: "#F3F4F6", text: "#374151", label: n.nivelPrioridad };
                const isExiting = exitingIds.includes(n.idNotificacion);

                return (
                  <div
                    key={n.idNotificacion}
                    className={`p-4 hover:bg-gray-50 flex gap-3 transition-all duration-300 transform ${
                      isExiting ? "opacity-0 scale-95 translate-x-4 max-h-0 p-0 overflow-hidden" : "opacity-100"
                    }`}
                  >
                    {/* Indicador de Prioridad Estilizado por ti */}
                    <div className="flex-shrink-0">
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider"
                        style={{ backgroundColor: style.bg, color: style.text }}
                      >
                        {style.label}
                      </span>
                    </div>

                    {/* Contenido de la Alerta */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-700 font-medium break-words leading-snug">
                        {n.mensaje}
                      </p>
                      <div className="flex items-center gap-2 mt-1.5 text-xs text-gray-400">
                        <span className="bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded font-mono uppercase text-[10px]">
                          {n.modulo}
                        </span>
                        <span>•</span>
                        <span>{formatTime(n.createdAt)}</span>
                      </div>
                    </div>

                    {/* Botones de Acción Rápidos (Check y Eliminar) */}
                    <div className="flex flex-col gap-1.5 justify-center">
                      <button
                        onClick={() => handleMarkAsRead(n.idNotificacion)}
                        title="Marcar como leída"
                        className="p-1 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded transition-all"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleDelete(n.idNotificacion)}
                        title="Eliminar permanentemente"
                        className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-all"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Pie de Panel (Limpieza de Historial Completo) */}
          {notificaciones.length > 0 && (
            <div className="p-2.5 bg-gray-50 border-t border-gray-100 text-center">
              <button
                onClick={handleClearAll}
                className="text-xs text-gray-500 hover:text-red-600 font-medium transition-colors w-full py-1 rounded hover:bg-red-50/50"
              >
                Limpiar historial por completo
              </button>
            </div>
          )}

        </div>
      )}
    </div>
  );
}

const mockNotificaciones = [
  {
    idNotificacion: 1,
    idUsuario: 10,
    mensaje: "Se ha detectado un inicio de sesión sospechoso desde una dirección IP desconocida.",
    modulo: "Seguridad",
    visto: false,
    nivelPrioridad: "ALTA",
    createdAt: "2026-07-17T05:30:00.000Z", // Hoy
  },
  {
    idNotificacion: 2,
    idUsuario: 10,
    mensaje: "Felicidades, se ha registrado una nueva venta por un valor de $1,250.00 USD.",
    modulo: "Ventas",
    visto: false,
    nivelPrioridad: "BAJA",
    createdAt: "2026-07-17T04:15:00.000Z", // Hoy
  },
  {
    idNotificacion: 3,
    idUsuario: 10,
    mensaje: "El stock del producto 'Laptop Pro 15' está por debajo del límite mínimo establecido.",
    modulo: "Inventario",
    visto: false,
    nivelPrioridad: "MEDIA",
    createdAt: "2026-07-16T18:20:00.000Z", // Ayer
  },
  {
    idNotificacion: 4,
    idUsuario: 10,
    mensaje: "El usuario 'Admin_Carlos' ha cambiado los permisos del rol de Editor.",
    modulo: "Seguridad",
    visto: true, // Ya leída
    nivelPrioridad: "MEDIA",
    createdAt: "2026-07-15T14:00:00.000Z", // Hace 2 días
  },
  {
    idNotificacion: 5,
    idUsuario: 10,
    mensaje: "Mantenimiento programado de la base de datos para este domingo a las 02:00 AM.",
    modulo: "Soporte",
    visto: true, // Ya leída
    nivelPrioridad: "BAJA",
    createdAt: "2026-07-14T09:45:00.000Z", // Hace 3 días
  },
  {
    idNotificacion: 6,
    idUsuario: 10,
    mensaje: "ERROR CRÍTICO: Caída del servicio de pasarela de pagos API (Stripe).",
    modulo: "Ventas",
    visto: false,
    nivelPrioridad: "ALTA",
    createdAt: "2026-07-17T06:05:00.000Z", // Reciente de hoy
  }
];

import socket from "@/app/lib/socket/socket";
export function Header({ moduleTitle, isSidebarOpen, setIsSidebarOpen }: any) {

  const [showPanel, setShowPanel] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const  {data:session}=useSession();


  

const getInitials = (fullName: string | null | undefined): string => {
  if (!fullName) return "";

  return fullName
    .trim()
    .split(/\s+/)
    .filter(Boolean)       // Filtra cualquier string vacío por seguridad
    .map(name => name.charAt(0)) // charAt(0) es más seguro que name[0] en TS
    .slice(0, 2)
    .join('')
    .toUpperCase();
};
const inital=getInitials(session?.user?.name)






  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/85 backdrop-blur-xl shadow-sm">
      <div className="flex h-16 items-center justify-between px-4 sm:px-6">
        
        {/* SECCIÓN IZQUIERDA: Botón Sidebar + Logo + Título */}
        <div className="flex items-center gap-2 sm:gap-4 min-w-0">
          {/* Botón de Menú (Hamburguesa) - Integrado y alineado dentro del flujo */}
          {!isSidebarOpen && (
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="rounded-xl p-2 text-slate-600 hover:bg-slate-100 active:bg-slate-200 transition-colors"
              aria-label="Abrir menú de navegación"
            >
              <Menu size={22} />
            </button>
          )}

          {/* Logo (Oculto en celulares muy pequeños si el título del módulo es muy largo) */}
          <div className="hidden xs:inline-flex items-center gap-2 rounded-2xl bg-slate-900/5 px-3 py-2 text-slate-900 shadow-sm shrink-0">
            <Ruler size={16} color="#6366F1" />
            <span className="text-sm font-semibold hidden md:inline">MetroSoft USC</span>
          </div>

          {/* Título del módulo activo */}
          <div className="truncate">
            <div className="text-sm font-semibold text-slate-950 truncate max-w-[150px] sm:max-w-xs md:max-w-md">
              {moduleTitle}
            </div>
          </div>
        </div>

        {/* SECCIÓN DERECHA: Notificaciones + Perfil de Usuario */}
<div className="flex items-center gap-2 sm:gap-3 shrink-0">

          {/* Notificaciones */}
          <div className="relative">
            <NotificationCenter

            />
          </div>

          {/* Menú de Usuario */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setShowUserMenu((prev) => !prev);
                setShowPanel(false);
              }}
              className={`flex items-center gap-2 sm:gap-3 rounded-2xl border border-slate-200 bg-white p-1.5 sm:px-3 sm:py-2 transition ${
                showUserMenu ? "shadow-sm bg-slate-50" : "shadow-none"
              }`}
            >
              {/* Círculo con Iniciales */}
              <div className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-full bg-slate-950 text-xs sm:text-sm font-medium text-white shrink-0">
                {inital}
              </div>
              
              {/* Nombre y Cargo (Ocultos en móvil para priorizar espacio) */}
              <div className="hidden md:flex flex-col text-left">
                <span className="text-sm font-medium text-slate-950 leading-none mb-1">{session?.user.name}</span>
                <span className="text-xs text-slate-500">{session?.user.role}</span>
              </div>
              
              <ChevronDown size={14} className="text-slate-500" />
            </button>

            {/* Desplegable de Usuario */}
            {showUserMenu && (
              <div className="absolute right-0 top-13 sm:top-14 w-48 overflow-hidden rounded-[20px] border border-slate-200 bg-white shadow-[0_24px_80px_-24px_rgba(15,23,42,0.25)]">
                {/* Información básica de usuario visible también en móvil */}
                <div className="px-4 py-3 border-b border-slate-200/70 md:hidden">
                  <p className="text-sm font-semibold text-slate-950">Luis Burgos</p>
                  <p className="text-xs text-slate-500 truncate">director@usc.edu.co</p>
                </div>
                {[
                  { label: "Mi perfil" },
                  { label: "Configuración" },
                ].map((item) => (
                  <button key={item.label} type="button" className="w-full px-4 py-2.5 text-left text-sm text-slate-700 transition hover:bg-slate-50">
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>
    </header>
  );
}