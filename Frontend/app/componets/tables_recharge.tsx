"use client";
import React, { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { io, Socket } from 'socket.io-client';
import { useSession } from 'next-auth/react';
import { Prisma } from '@prisma/client';
import processPlantillasRealtime from './recharge_config_platillas';
import { useDbStore } from '@/app/stores/dbstore'; // ✅ Mayúscula D
import { useShallow } from 'zustand/react/shallow'; // ✅ Importar useShallow


export type UsuarioModel = Prisma.UsuarioGetPayload<{ omit: { contraseña: true } }>;
export type TarifaModel = Prisma.TarifaGetPayload<{ include: { historial: true } }>;
export type NotificacionModel = Prisma.NotificacionGetPayload<{}>;
export type AuditLogModel = Prisma.AuditLogGetPayload<{}>;
export type RolesModel = Prisma.RolesGetPayload<{}>;
export type PlantillaModel = Prisma.PlantillaGetPayload<{ include: { versiones: true } }>;
export type VersionDocumentoModel = Prisma.VersionDocumentoGetPayload<{}>;
export type DocumentoModel = Prisma.DocumentoGetPayload<{ include: { versiones: true } }>;
export type RecepcionEquipoDetalleModel = Prisma.RecepcionEquipoDetalleGetPayload<{}>;
export type OrdenTrabajoDetalleModel = Prisma.OrdenTrabajoDetalleGetPayload<{}>;
export type CotizacionDetalleModel = Prisma.CotizacionDetalleGetPayload<{}>;
export type ClienteModel = Prisma.ClienteGetPayload<{}>;
export type CotizacionModel = Prisma.CotizacionGetPayload<{
  include: {
    detalles: true;
    cliente: true;
    historialEstados: true;
  };
}>;
export type OrdenTrabajoModel = Prisma.OrdenTrabajoGetPayload<{
  include: {
    cliente: true;
    cotizacion: {
      include: {
        cliente: true;
      };
    };
    instrumentos?: true;
  };
}>;
export type RecepcionEquipoModel = Prisma.RecepcionEquipoGetPayload<{
  include: {
    instrumentos: true;
    cotizacion: {
      include: { cliente: true };
    };
    ordenTrabajo: {
      include: { cliente: true; cotizacion: true };
    };
    documentos: true;
  };
}>;
export type UsuarioConRol = UsuarioModel & {
  rolnombre: string;
};
// ==========================================
// 2. ESTADO GLOBAL DE TABLAS TIPADO
// ==========================================
export default interface RealtimeTablesState {

  usuarios: UsuarioModel[];
  tarifas: TarifaModel[];
  notificaciones: NotificacionModel[];
  audit_logs: AuditLogModel[];
  roles: RolesModel[];
  plantillas: PlantillaModel[];
  clientes: ClienteModel[];
  cotizaciones: CotizacionModel[];
  cotizacion_detalles: CotizacionDetalleModel[];
  ordenes_trabajo: OrdenTrabajoModel[];
  orden_trabajo_detalles: OrdenTrabajoDetalleModel[];
  recepciones_equipo: RecepcionEquipoModel[];
  recepcion_equipo_detalles: RecepcionEquipoDetalleModel[];
  documentos: DocumentoModel[];
  version_documentos: VersionDocumentoModel[];
}

// ==========================================
// 4. FUNCIONES DE NORMALIZACIÓN (SIN CAMBIOS)
// ==========================================
const obtenerLlavePrimaria = (tabla: string, dataMapeada: any): { nombreLlave: string; idValor: number } => {
  switch (tabla) {
    case 'usuarios':                  return { nombreLlave: 'idUsuario', idValor: Number(dataMapeada.idUsuario) };
    case 'tarifas':                   return { nombreLlave: 'idTarifa', idValor: Number(dataMapeada.idTarifa) };
    case 'notificaciones':            return { nombreLlave: 'idNotificacion', idValor: Number(dataMapeada.idNotificacion) };
    case 'roles':                     return { nombreLlave: 'idRol', idValor: Number(dataMapeada.idRol) };
    case 'audit_logs':                return { nombreLlave: 'id', idValor: Number(dataMapeada.id) };
    case 'clientes':                  return { nombreLlave: 'idCliente', idValor: Number(dataMapeada.idCliente) };
    case 'cotizaciones':              return { nombreLlave: 'idCotizacion', idValor: Number(dataMapeada.idCotizacion) };
    case 'cotizacion_detalles':       return { nombreLlave: 'ID_DETALLE', idValor: Number(dataMapeada.ID_DETALLE) };
    case 'ordenes_trabajo':           return { nombreLlave: 'idOrdenTrabajo', idValor: Number(dataMapeada.idOrdenTrabajo) };
    case 'orden_trabajo_detalles':    return { nombreLlave: 'idDetalle', idValor: Number(dataMapeada.idDetalle) };
    case 'recepciones_equipo':     return { nombreLlave: 'idRecepcion', idValor: Number(dataMapeada.idRecepcion) };
    case 'recepcion_equipo_detalles': return { nombreLlave: 'idInstrumento', idValor: Number(dataMapeada.idInstrumento) };
    case 'documentos':             return { nombreLlave: 'idDocumento', idValor: Number(dataMapeada.idDocumento) };
    case 'version_documentos':     return { nombreLlave: 'idVersion', idValor: Number(dataMapeada.idVersion) };
    default:                          return { nombreLlave: 'id', idValor: Number(dataMapeada.id) };
  }
};

const normalizarPayload = (tabla: string, rawData: Record<string, any>): any => {
  if (!rawData) return rawData;

  const extractId = Number(
    rawData.ID_USUARIO_AUTO_INCREMENT ?? rawData.id_usuario ??
    rawData.ID_TARIFA ?? rawData.idTarifa ??
    rawData.ID_NOTIFICACION ?? rawData.idNotificacion ??
    rawData.ID_ROL_INCREMENT ?? rawData.idRol ??
    rawData.ID_AUDIT ?? rawData.id??
    rawData.idOrdenTrabajo
  );

  switch (tabla) {
    case "usuarios":
      return {
        idUsuario: extractId,
        nombreCompleto: rawData.NOMBRE_COMPLETO ?? rawData.nombreCompleto ?? "",
        idRol: Number(rawData.ID_ROL_FK ?? rawData.idRol),
        rolnombre: rawData.nombre_rol ?? rawData.rolnombre ?? "",
        correo: rawData.CORREO_INSTITUCION ?? rawData.correo ?? "",
        estado: Boolean(rawData.ESTADO ?? rawData.estado),
        intentos: Number(rawData.INTENTOS ?? rawData.intentos ?? 0),
        eleminado: Boolean(rawData.elminado ?? rawData.ELIMINADO ?? false),
        updatedAt: rawData.UPDATE_AT
          ? new Date(rawData.UPDATE_AT).toLocaleString("es-ES", {
              day: "2-digit", month: "2-digit", year: "2-digit",
              hour: "2-digit", minute: "2-digit", hour12: true,
            }).replace(",", "")
          : "Sin modificaciones",
        createdAt: rawData.CREATED_AT ?? rawData.createdAt,
      };

    case "notificaciones":
      return {
        idNotificacion: extractId,
        idUsuario: Number(rawData.ID_USUARIO_FK ?? rawData.idUsuario),
        mensaje: rawData.MENSAJE ?? rawData.mensaje ?? "",
        modulo: rawData.MODULO ?? rawData.modulo ?? "",
        visto: Boolean(rawData.VISTO ?? rawData.visto),
        nivelPrioridad: rawData.NIVEL_PRIORIDAD ?? rawData.nivelPrioridad ?? "NORMAL",
        createdAt: rawData.CREATED_AT ?? rawData.createdAt,
      };

    case "tarifas":
      return {
        idTarifa: extractId,
        magnitud: rawData.MAGNITUD ?? rawData.magnitud,
        tipoServicio: rawData.TIPO_SERVICIO ?? rawData.tipoServicio,
        precioMinimo: Number(rawData.PRECIO_MINIMO ?? rawData.precioMinimo),
        estado: rawData.ESTADO ?? rawData.estado,
        createdAt: rawData.CREATED_AT ?? rawData.createdAt,
      };

    case "roles":
      return {
        idRol: extractId,
        nombreRol: rawData.NOMBRE_ROL ?? rawData.nombreRol ?? "",
        permisos: rawData.PERMISOS ?? rawData.permisos ?? {},
        justificacion: rawData.JUSTIFICACION ?? rawData.justificacion ?? "",
        directriz_Director: Boolean(rawData.DIRECTRIZ_DIRECTOR ?? rawData.directriz_Director),
      };

    case "audit_logs":
      return {
        id: extractId,
        action: rawData.ACTION ?? rawData.action ?? "",
        tableName: rawData.TABLE_NAME ?? rawData.tableName ?? "",
        recordId: String(rawData.RECORD_ID ?? rawData.recordId ?? ""),
        userId: Number(rawData.USER_ID ?? rawData.userId),
        createdAt: rawData.CREATED_AT ?? rawData.createdAt,
        details: rawData.DETAILS ?? rawData.details ?? {},
        ip: rawData.IP ?? rawData.ip ?? "",
      };

    case "clientes":
      return {
        idCliente: Number(rawData.ID_CLIENTE ?? rawData.idCliente),
        nitCedula: rawData.NIT ?? rawData.nitCedula ?? "",
        razonSocial: rawData.RAZON_SOCIAL ?? rawData.razonSocial ?? "",
        correo: rawData.CORREO ?? rawData.correo ?? "",
        nombreContacto: rawData.NOMBRE_CONTACTO ?? rawData.nombreContacto ?? null,
        telefono: rawData.TELEFONO ?? rawData.telefono ?? null,
        observacion: rawData.OBSERVACION ?? rawData.observacion ?? null,
        tipoCliente: rawData.TIPO_CLIENTE ?? rawData.tipoCliente ?? "EXTERNO",
        idRutDocumento: rawData.ID_RUT_DOCUMENTO_FK ?? rawData.idRutDocumento ?? null,
        estado: rawData.status ?? rawData.status ?? null,
        ciudad: rawData.ciudad ?? rawData.ciudad ?? null,
        createdAt: rawData.CREATED_AT ?? rawData.createat,
        updatedAt: rawData.UPDATED_AT ?? rawData.updatedAt,
      };

    case "cotizaciones":
      return {
        idCotizacion: Number(rawData.ID_COTIZACION ?? rawData.idCotizacion),
        codigo: rawData.CODIGO_COTIZACION ?? rawData.codigo ?? "",
        idCliente: Number(rawData.ID_CLIENTE_FK ?? rawData.idCliente),
        montoTotal: Number(rawData.MONTO_TOTAL ?? rawData.montoTotal ?? 0),
        estado: rawData.ESTADO ?? rawData.estado ?? "BORRADOR",
        createdAt: rawData.CREATED_AT ?? rawData.createdAt,
        updatedAt: rawData.UPDATED_AT ?? rawData.updatedAt,
        prox_end: rawData.PROX_END_DATE ?? rawData.prox_end,
        viaticos: Number(rawData.VIATICOS ?? rawData.viaticos ?? 0),
        descuento: Number(rawData.DESCUENTO ?? rawData.descuento ?? 0),
        detalles: rawData.DETALLES ?? rawData.detalles,
      };
    
    case "ordenes_trabajo":
      return {
        idOrdenTrabajo: Number(rawData.ID_ORDEN_TRABAJO ?? rawData.idOrdenTrabajo),
        codigo: String(rawData.CODIGO_OT ?? rawData.codigo ?? ""),
        idCotizacion: rawData.ID_COTIZACION_FK != null ? Number(rawData.ID_COTIZACION_FK) : (rawData.idCotizacion != null ? Number(rawData.idCotizacion) : null),
        idCliente: rawData.ID_CLIENTE_FK != null ? Number(rawData.ID_CLIENTE_FK) : (rawData.idCliente != null ? Number(rawData.idCliente) : null),
        correoCertificado: rawData.CORREO_CERTIFICADO ?? rawData.correoCertificado ?? null,
        correoFactura: rawData.CORREO_FACTURA ?? rawData.correoFactura ?? null,
        fechaLimiteFacturacion: rawData.FECHA_LIMITE_FACTURACION ?? rawData.fechaLimiteFacturacion ?? null,
        esInternoUSC: Boolean(rawData.ES_INTERNO_USC ?? rawData.esInternoUSC ?? false),
        esEnSitio: Boolean(rawData.ES_EN_SITIO ?? rawData.esEnSitio ?? false),
        esLabPermanente: Boolean(rawData.ES_LAB_PERMANENTE ?? rawData.esLabPermanente ?? true),
        personaContacto: rawData.PERSONA_CONTACTO ?? rawData.personaContacto ?? null,
        telefonoContacto: rawData.TELEFONO_CONTACTO ?? rawData.telefonoContacto ?? null,
        fechaCalibracion: rawData.FECHA_CALIBRACION ?? rawData.fechaCalibracion ?? null,
        responsable: rawData.RESPONSABLE ?? rawData.responsable ?? null,
        observaciones: rawData.OBSERVACIONES ?? rawData.observaciones ?? null,
        requireAnexo: Boolean(rawData.REQUIERE_ANEXO ?? rawData.requireAnexo ?? false),
        estado: rawData.estado ?? "Creada",
        estadoRevision: rawData.ESTADO_REVISION ?? rawData.estadoRevision ?? "PENDIENTE_REVISION",
        motivoRechazo: rawData.MOTIVO_RECHAZO ?? rawData.motivoRechazo ?? null,
        createdAt: rawData.CREATED_AT ?? rawData.createdAt ?? new Date(),
        estado_pago: rawData.estado_pago ?? "PAGADO",
        // Relación opcional: si el rawData trae instrumentos los incluye, si no array vacío
        instrumentos: rawData.instrumentos ?? rawData.INSTRUMENTOS ?? [],
      };

    default:
      return { ...rawData, id: extractId };
  }
};
export default interface RealtimeTablesState {
  // ... igual
}

// ==========================================
// 3. CONTEXTO (Solo Socket)
// ==========================================
interface DbContextType { socket: Socket | null; }
const DbContext = createContext<DbContextType | undefined>(undefined);

// ==========================================
// 4. NORMALIZACIÓN (SIN CAMBIOS)
// ==========================================
// ... (normalizarPayload y obtenerLlavePrimaria igual)

// ==========================================
// 5. PROVIDER CON ZUSTAND
// ==========================================
export const DbProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { data: session, status } = useSession();
  const [socket, setSocket] = useState<Socket | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const userIdValido = session?.user?.id_user ?? session?.user?.id;
  const SOCKET_URL = "http://192.168.1.11:3001";
  const TABLAS_PLANTILLAS = ["plantillas", "version_plantilla", "documentos_plantillas"];

  const { updateTable, setDbState } = useDbStore(
    useShallow((state) => ({
      updateTable: state.updateTable,
      setDbState: state.setDbState,
    }))
  );

  useEffect(() => {
    if (status === "loading" || status !== "authenticated" || !userIdValido) return;
    if (socketRef.current?.connected) return;

    const nuevoSocket = io(SOCKET_URL, {
      query: { userId: String(userIdValido) },
      transports: ["websocket", "polling"],
      reconnectionAttempts: 5,
    });
    socketRef.current = nuevoSocket;

    nuevoSocket.on("connect", () => {
      setSocket(nuevoSocket);
      nuevoSocket.emit("join_room", userIdValido);
    });

    nuevoSocket.on("cambio_realtime", (payload) => {
      const { tabla, operacion, data: rawData } = payload;
     console.warn("🔔 EVENTO EN NAVEGADOR:", payload);
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
      console.log(dataMapeada,"dfsfsfs")
      const { nombreLlave, idValor } = obtenerLlavePrimaria(tabla, dataMapeada);

      if (idValor === undefined || idValor === null || isNaN(idValor)) {
        console.error(`❌ ID inválido para [${tabla}]`);
        return;
      }

      updateTable(tabla as keyof RealtimeTablesState, (listaActual) => {
        let listaActualizada = [...(listaActual as any[])];
        console.log(listaActualizada,"aqui es la lsita c")
        const existe = listaActualizada.some((item) => Number(item[nombreLlave]) === idValor);
        console.log(nombreLlave)
        if (operacion === "INSERT" && !existe) {
          console.log("hizo _insert")
          listaActualizada = [dataMapeada, ...listaActualizada];
        } else if (operacion === "UPDATE") {
          console.log("hizo update ")
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

    return () => {
      nuevoSocket.disconnect();
      socketRef.current = null;
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
      loadAllData: state.loadAllData,
      loadTable: state.loadTable,
      reset: state.reset,
    }))
  );
};