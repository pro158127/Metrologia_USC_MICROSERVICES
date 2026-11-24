"use client";
import React, { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore, ReactNode } from 'react';
import { io, Socket } from 'socket.io-client';
import { useSession } from 'next-auth/react';
import { useDbStore, TABLAS_CON_SNAPSHOT } from '@/app/stores/dbstore';
import { useShallow } from 'zustand/react/shallow';
import type RealtimeTablesState from '@/tipos/store';
import { toast } from 'sonner';
import { marcarCambiosRealtime, obtenerRevisionRealtime, suscribirRealtime } from '@/app/lib/realtime/revision';
import { obtenerTokenSocket } from '@/app/lib/socket/token';

const RECARGAS_RELACIONADAS: Partial<Record<string, (keyof RealtimeTablesState)[]>> = {
  ordenes_trabajo: ["recepciones_equipo"],
  recepciones_equipo: ["ordenes_trabajo"],
  cotizacion_detalles: ["cotizaciones"],
  orden_trabajo_detalles: ["ordenes_trabajo", "recepciones_equipo"],
  recepcion_equipo_detalles: ["recepciones_equipo", "ordenes_trabajo", "certificados"],
  calibraciones: ["certificados", "recepciones_equipo", "ordenes_trabajo"],
  certificados: ["ordenes_trabajo", "recepciones_equipo"],
  certificado_sellos: ["certificados"],
  documentos: ["certificados"],
  version_documentos: ["certificados"],
  historial_estado_cotizacion: ["cotizaciones"],
  historial_tarifas: ["tarifas"],
  roles: ["usuarios"],
  clientes: ["cotizaciones"],
};

// ==========================================
// TIPOS CENTRALIZADOS (Frontend/tipos/)
// Se re-exportan para compatibilidad con los consumidores actuales.
// ==========================================
export type {
  UsuarioModel,
  TarifaModel,
  NotificacionModel,
  AuditLogModel,
  RolesModel,
  PlantillaModel,
  ClienteModel,
  CotizacionModel,
  CotizacionDetalleModel,
  OrdenTrabajoModel,
  OrdenTrabajoDetalleModel,
  RecepcionEquipoModel,
  RecepcionEquipoDetalleModel,
  DocumentoModel,
  VersionDocumentoModel,
  CalibracionModel,
  CertificadoModel,
  CertificadoSelloModel,
  DocumentChunkModel,
  HistorialEstadoCotizacionModel,
  HistorialTarifaModel,
  ParametroSistemaModel,
  SelloModel,
  TramiteModel,
  VersionPlantillaModel,
  FacturaModel,
  UsuarioConRol,
} from '@/tipos/entidades';
export type { default as RealtimeTablesState } from '@/tipos/store';

// ==========================================
// 3. CONTEXTO (Solo Socket)
// ==========================================
interface DbContextType { socket: Socket | null; }
const DbContext = createContext<DbContextType | undefined>(undefined);

// ==========================================
// 5. PROVIDER CON ZUSTAND
// ==========================================
export const DbProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { data: session, status } = useSession();
  const [socket, setSocket] = useState<Socket | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const userIdValido = session?.user?.id_user ?? session?.user?.id;
  useEffect(() => {
    if (status === "loading" || status !== "authenticated" || !userIdValido) return;
    if (socketRef.current?.connected) return;

    let cancelado = false;
    let limpiar: (() => void) | undefined;

    (async () => {
      const token = await obtenerTokenSocket();
      if (cancelado || !token) return;

      const endpoint = process.env.NEXT_PUBLIC_SOCKET_URL ||
        (process.env.NODE_ENV === "development" && window.location.hostname === "localhost"
          ? "http://localhost:3001" : undefined);
      const nuevoSocket = io(endpoint, {
        path: "/socket.io",
        autoConnect: false,
        auth: { token },
        transports: ["websocket", "polling"],
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 10000,
        timeout: 20000,
      });
      socketRef.current = nuevoSocket;

      const pendientes = new Set<keyof RealtimeTablesState>();
      let recarga: ReturnType<typeof setTimeout> | undefined;
      let conexionInicialCompletada = false;
      const invalidar = (tablas: string[]) => {
        marcarCambiosRealtime(tablas);
        for (const tabla of TABLAS_CON_SNAPSHOT) {
          if (tablas.includes(tabla)) pendientes.add(tabla);
        }
        if (recarga || !pendientes.size) return;
        recarga = setTimeout(() => {
          recarga = undefined;
          for (const tabla of pendientes) void useDbStore.getState().loadTable(tabla, true);
          pendientes.clear();
        }, 120);
      };
      const sincronizarRealtime = () => invalidar([
        ...TABLAS_CON_SNAPSHOT, "notificaciones", "documentos", "version_documentos",
        "calibraciones", "orden_trabajo_detalles", "recepcion_equipo_detalles",
        "plantillas", "version_plantillas", "plantillas_sellos",
      ]);

      nuevoSocket.on("connect", () => {
        setSocket(nuevoSocket);
        // La carga inicial de cada pantalla ya obtiene su snapshot. Evitamos
        // duplicar todas esas consultas en la primera conexión del socket;
        // tras una reconexión sí resincronizamos lo que pudo perderse.
        if (conexionInicialCompletada) sincronizarRealtime();
        conexionInicialCompletada = true;
      });

      nuevoSocket.on("job_plantilla_terminado", (payload) => {
        console.warn("🔔 EVENTO EN NAVEGADOR:", payload);

        // 🔥 Le damos un alias a 'status' para no chocar con el 'status' de useSession
        const { idVersion, mensaje, status: jobStatus } = payload;

        if (jobStatus === "COMPLETADO") {
          toast.success(mensaje, {
            description: `La plantilla con ID ${idVersion} ha sido procesada correctamente.`,
          });
        } else {
          toast.error(mensaje, {
            description: `La plantilla con ID ${idVersion} ha fallado al ser procesada.`,
          });
        }
      });

      nuevoSocket.on("cambio_realtime", (payload) => {
        const tabla = payload?.tabla;
        if (typeof tabla !== "string") return;
        invalidar([tabla, ...(RECARGAS_RELACIONADAS[tabla] ?? [])]);
      });
      nuevoSocket.on("realtime_resync", sincronizarRealtime);
      nuevoSocket.on("disconnect", () => setSocket(null));
      let ultimoToken = token;
      nuevoSocket.on("connect_error", async () => {
        if (nuevoSocket.active) return;
        const tokenActual = await obtenerTokenSocket();
        if (cancelado || !tokenActual || tokenActual === ultimoToken) return;
        ultimoToken = tokenActual;
        nuevoSocket.auth = { token: tokenActual };
        nuevoSocket.connect();
      });
      nuevoSocket.connect();

      // Al volver a la pestaña, forzar reconexión y re-sincronización si la
      // conexión se suspendió mientras la pestaña estuvo oculta.
      const manejarVisibilidad = () => {
        if (document.visibilityState !== "visible") return;
        if (!nuevoSocket.connected) {
          nuevoSocket.connect();
        }
      };
      const manejarOnline = () => {
        if (!nuevoSocket.connected) nuevoSocket.connect();
      };
      document.addEventListener("visibilitychange", manejarVisibilidad);
      window.addEventListener("online", manejarOnline);

      limpiar = () => {
        document.removeEventListener("visibilitychange", manejarVisibilidad);
        window.removeEventListener("online", manejarOnline);
        if (recarga) clearTimeout(recarga);
        nuevoSocket.disconnect();
        socketRef.current = null;
      };
    })();

    return () => {
      cancelado = true;
      limpiar?.();
    };
  }, [status, userIdValido]);

  return <DbContext.Provider value={{ socket }}>{children}</DbContext.Provider>;
};

// ==========================================
// 6. HOOK PRINCIPAL CON useShallow
// ==========================================
export const useDbRealtime = () => {
  const context = useContext(DbContext);
  if (!context) throw new Error('useDbRealtime debe usarse dentro de un DbProvider');

  // 🔥 Leer el estado completo con useShallow para evitar re‑renders
  // Si solo cambia una tabla, el objeto completo NO cambia de referencia
  const dbState = useDbStore(
    useShallow((state) => ({
      usuarios: state.usuarios,
      tarifas: state.tarifas,
      notificaciones: state.notificaciones,
      audit_logs: state.audit_logs,
      roles: state.roles,
      plantillas: state.plantillas,
      clientes: state.clientes,
      cotizaciones: state.cotizaciones,
      cotizacion_detalles: state.cotizacion_detalles,
      ordenes_trabajo: state.ordenes_trabajo,
      orden_trabajo_detalles: state.orden_trabajo_detalles,
      recepciones_equipo: state.recepciones_equipo,
      recepcion_equipo_detalles: state.recepcion_equipo_detalles,
      documentos: state.documentos,
      version_documentos: state.version_documentos,
      calibraciones: state.calibraciones,
      certificados: state.certificados,
      certificado_sellos: state.certificado_sellos,
      document_chunks: state.document_chunks,
      historial_estado_cotizacion: state.historial_estado_cotizacion,
      historial_tarifas: state.historial_tarifas,
      parametros_sistema: state.parametros_sistema,
      sellos: state.sellos,
      tramites: state.tramites,
      version_plantillas: state.version_plantillas,
      facturas: state.facturas,
      plantillas_sellos: state.plantillas_sellos,
      seguimientos_comerciales: state.seguimientos_comerciales,
    }))
  );

  const setDbState = useDbStore((state) => state.setDbState);

  return { dbState, setDbState, socket: context.socket };
};

// ==========================================
// 7. NUEVOS HOOKS PARA SELECTORES (Recomendados)
// ==========================================


export function useRevisionTablas(...tablas: string[]): number {
  return useSyncExternalStore(
    suscribirRealtime,
    () => tablas.reduce((revision, tabla) => revision + obtenerRevisionRealtime(tabla), 0),
    () => 0,
  );
}

export const useDbTable = <K extends keyof RealtimeTablesState>(table: K) => {
  return useDbStore(useShallow((state) => state[table]));
};

export const useDbLoading = <K extends keyof RealtimeTablesState>(table: K) => {
  return useDbStore((state) => state.loading[table] ?? false);
};
export const useDbActions = () => {
  return useDbStore(
    useShallow((state) => ({
      setDbState: state.setDbState,
      updateTable: state.updateTable,
      mergeTable: state.mergeTable,
      setTableLoading: state.setTableLoading,
      loadAllData: state.loadAllData,
      loadTable: state.loadTable,
      reset: state.reset,
    }))
  );
};
