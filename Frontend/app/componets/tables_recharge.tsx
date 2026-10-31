"use client";
import React, { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { io, Socket } from 'socket.io-client';
import { useSession } from 'next-auth/react';
import processPlantillasRealtime from './recharge_config_platillas';
import { useDbStore } from '@/app/stores/dbstore'; // ✅ Mayúscula D
import { useShallow } from 'zustand/react/shallow'; // ✅ Importar useShallow
import type RealtimeTablesState from '@/tipos/store';
import { toast } from 'sonner';
import { obtenerLlavePrimaria, normalizarPayload } from '@/app/lib/realtime/normalize';
import { obtenerTokenSocket } from '@/app/lib/socket/token';
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
  const TABLAS_PLANTILLAS = ["plantillas"];

  const { updateTable, setDbState } = useDbStore(
    useShallow((state) => ({
      updateTable: state.updateTable,
      setDbState: state.setDbState,
    }))
  );

  useEffect(() => {
    if (status === "loading" || status !== "authenticated" || !userIdValido) return;
    if (socketRef.current?.connected) return;

    let cancelado = false;
    let limpiar: (() => void) | undefined;

    (async () => {
      const token = await obtenerTokenSocket();
      if (cancelado || !token) return;

      const nuevoSocket = io(process.env.NEXT_PUBLIC_SOCKET_URL || undefined, {
        path: "/socket.io",
        auth: { token },
        transports: ["websocket", "polling"],
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 10000,
        timeout: 20000,
      });
      socketRef.current = nuevoSocket;

      // Re-sincroniza salas y estado pendiente tras (re)conexión.
      const sincronizarRealtime = () => {
        nuevoSocket.emit("join_room", userIdValido);
        const store = useDbStore.getState();
        // Forzar recarga de las tablas que pueden quedar desactualizadas
        // si se perdieron eventos durante la desconexión/suspensión.
        const tablasClave: (keyof RealtimeTablesState)[] = [
          "usuarios",
          "cotizaciones",
          "clientes",
          "ordenes_trabajo",
          "recepciones_equipo",
          "facturas",
          "seguimientos_comerciales",
          "certificados",
        ];
        tablasClave.forEach((t) => store.loadTable(t, true));
      };

      nuevoSocket.on("connect", () => {
        setSocket(nuevoSocket);
        sincronizarRealtime();
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
        const { tabla, operacion, data: rawData } = payload;
        const { updateTable, setDbState } = useDbStore.getState();
        // Caso especial plantillas
        if (TABLAS_PLANTILLAS.includes(tabla)) {
          setDbState((prev) => ({
            ...prev,
            plantillas: processPlantillasRealtime(prev.plantillas, payload),
          }));
          return;
        }

        // Normalizar y actualizar usando updateTable (atómico)
        const dataMapeada = normalizarPayload(tabla, rawData);
        const { nombreLlave, idValor } = obtenerLlavePrimaria(tabla, dataMapeada);

        if (idValor === undefined || idValor === null || isNaN(idValor)) {
          return;
        }

        updateTable(tabla as keyof RealtimeTablesState, (listaActual) => {
          let listaActualizada = [...(listaActual as any[])];
          const existe = listaActualizada.some((item) => Number(item[nombreLlave]) === idValor);
          if (operacion === "INSERT" && !existe) {
            listaActualizada = [dataMapeada, ...listaActualizada];
          } else if (operacion === "UPDATE") {
            listaActualizada = existe
              ? listaActualizada.map((item) =>
                  Number(item[nombreLlave]) === idValor ? dataMapeada : item
                )
              : [dataMapeada, ...listaActualizada];
          } else if (operacion === "DELETE") {
            listaActualizada = listaActualizada.filter(
              (item) => Number(item[nombreLlave]) !== idValor
            );
          }
          return listaActualizada;
        });
      });

      nuevoSocket.on("disconnect", () => console.warn("🔌 Desconectado"));

      // Al volver a la pestaña, forzar reconexión y re-sincronización si la
      // conexión se suspendió mientras la pestaña estuvo oculta.
      const manejarVisibilidad = () => {
        if (document.visibilityState !== "visible") return;
        if (!nuevoSocket.connected) {
          nuevoSocket.connect();
        } else {
          sincronizarRealtime();
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
    }))
  );

  const setDbState = useDbStore((state) => state.setDbState);

  return { dbState, setDbState, socket: context.socket };
};

// ==========================================
// 7. NUEVOS HOOKS PARA SELECTORES (Recomendados)
// ==========================================


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