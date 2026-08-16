// ============================================================
// entidades.ts
// Tipos de ENTIDADES derivados del schema Prisma (source of truth).
// Se mueven aquí los tipos GetPayload que vivían en tables_recharge.tsx
// para romper el ciclo client ↔ server y centralizar el tipado.
// ============================================================

import type { Prisma } from '@prisma/client';

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
export type CalibracionModel = Prisma.CalibracionGetPayload<{}>;
export type CertificadoModel = Prisma.CertificadoGetPayload<{ include: { sellos: true } }>;
export type CertificadoSelloModel = Prisma.CertificadoSelloGetPayload<{}>;
export type DocumentChunkModel = Prisma.DocumentChunkGetPayload<{}>;
export type HistorialEstadoCotizacionModel = Prisma.HistorialEstadoCotizacionGetPayload<{}>;
export type HistorialTarifaModel = Prisma.HistorialTarifaGetPayload<{}>;
export type ParametroSistemaModel = Prisma.ParametroSistemaGetPayload<{}>;
export type SelloModel = Prisma.SelloGetPayload<{}>;
export type VersionPlantillaModel = Prisma.VersionPlantillaGetPayload<{}>;
export type FacturaModel = Prisma.FacturaGetPayload<{ include: { ordenTrabajo: true; cliente: true } }>;
export type TramiteModel = {
  idTramite: number;
  codigoTramite: string;
  idCliente: number | null;
  estadoFlujo: string;
  createdAt: Date | string;
};
