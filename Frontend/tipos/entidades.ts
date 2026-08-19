// ============================================================
// entidades.ts
// Tipos de ENTIDADES explícitos (espejo del schema, camelCase).
// Reemplaza los tipos derivados de `@prisma/client` para que el
// frontend no dependa del ORM.
// ============================================================

import type { Estados, statuscliente, tipocliente, ProveedorAlmacenamiento } from './enums';

export interface RolesModel {
  idRol: number;
  nombreRol: string;
  permisos: unknown;
  justificacion: string;
  directrizDirector: boolean;
}

export interface UsuarioModel {
  idUsuario: number;
  nombreCompleto: string;
  idRol: number;
  correo: string;
  createdAt: Date | string;
  updatedAt: Date | string | null;
  estado: boolean;
  intentos: number;
  elminado: boolean;
  rol?: RolesModel;
}

export interface HistorialTarifaModel {
  idHistorial: number;
  idTarifa: number;
  fechaInicio: Date | string;
  fechaFin: Date | string | null;
  precioU: number | string;
}

export interface TarifaModel {
  idTarifa: number;
  magnitud: string;
  tipoServicio: string;
  estado: string;
  Instrumento: string;
  Norma: string;
  historial: HistorialTarifaModel[];
}

export interface NotificacionModel {
  idNotificacion: number;
  idUsuario: number;
  mensaje: string;
  modulo: string;
  visto: boolean;
  nivelPrioridad: string;
  createdAt: Date | string;
}

export interface AuditLogModel {
  action: string;
  tableName: string;
  recordId: string;
  userId: number;
  createdAt: Date | string;
  details: unknown;
  ip: string;
  id: number;
}

export interface VersionPlantillaModel {
  idVersionPlantilla: number;
  idPlantilla: number;
  version: number;
  mapeoExcelJson: unknown | null;
  idUsuarioCreador: number;
  createdAt: Date | string;
  iddocumentos: number | null;
}

export interface PlantillaModel {
  idPlantilla: number;
  modulo: string;
  activa: boolean;
  nombre: string;
  versiones: VersionPlantillaModel[];
}

export interface VersionDocumentoModel {
  idVersion: number;
  idDocumento: number;
  version: number;
  rutaUrl: string;
  createdAt: Date | string;
  usuario_fk: number;
  content_json: unknown | null;
}

export interface DocumentoModel {
  idDocumento: number;
  nombre: string;
  rutaUrl: string;
  proveedor: ProveedorAlmacenamiento;
  mimeType: string;
  createdAt: Date | string;
  idCotizacion: number | null;
  idOrdenTrabajo: number | null;
  idRecepcion: number | null;
  idPlantilla: number | null;
  ordenPagoId: number | null;
  versiones: VersionDocumentoModel[];
}

export interface ClienteModel {
  idCliente: number;
  nitCedula: string;
  razonSocial: string;
  correo: string;
  nombreContacto: string | null;
  telefono: string | null;
  observacion: string | null;
  idRutDocumento: number | null;
  status: statuscliente;
  createat: Date | string;
  dirrecion: string;
  updatedAt: Date | string;
  ciudad: string | null;
  tipoCliente: tipocliente;
}

export interface CotizacionDetalleModel {
  idDetalle: number;
  idCotizacion: number;
  equipoDescripcion: string;
  tipoServicio: string;
  magnitud: string;
  normaTecnica: string | null;
  cantidad: number;
  valorUnitario: number | string;
  valorTotal: number | string;
  sitio: string | null;
}

export interface HistorialEstadoCotizacionModel {
  id: number;
  idCotizacion: number;
  estadoAnterior: Estados | null;
  estadoNuevo: Estados;
  idUsuario: number;
  createdAt: Date | string;
}

export interface HistorialCambioItem {
  id: string;
  numeroVersion: string;
  fechaCambio: string | Date;
  descripcion: string;
  requiereValidacionHoja: boolean;
  observaciones: string | null | undefined;
  aprobo: string;
  idCotizacion: number;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface CotizacionModel {
  idCotizacion: number;
  codigo: string;
  idCliente: number | null;
  montoTotal: number | string | null;
  createdAt: Date | string;
  updatedAt: Date | string | null;
  viaticos: number | string | null;
  estado: Estados;
  enviar: boolean;
  descuento: number | null;
  detalles: CotizacionDetalleModel[];
  cliente: ClienteModel | null;
  historialEstados: HistorialEstadoCotizacionModel[];
  Historiacambios: HistorialCambioItem[];
}

export interface OrdenTrabajoDetalleModel {
  idDetalle: number;
  idOrdenTrabajo: number;
  item: number;
  tipoServicio: string;
  instrumento: string;
  fabricante: string | null;
  modelo: string | null;
  serie: string | null;
  codigoInventario: string | null;
  ubicacion: string | null;
  puntosCalibrar: string[];
  unidad: string | null;
  intervaloRango: string | null;
  resolucion: string | null;
  asignado: number;
  declaracionConformidad: boolean;
  limiteControlEMC: string | null;
  docEspecificacion: string | null;
  reglaDecision: string | null;
}

export interface OrdenTrabajoModel {
  idOrdenTrabajo: number;
  codigo: string;
  idCotizacion: number | null;
  idCliente: number | null;
  correoCertificado: string | null;
  correoFactura: string | null;
  fechaLimiteFacturacion: Date | string | null;
  NIT: string | null;
  dirrecion: string | null;
  ciudad: string | null;
  esInternoUSC: boolean | null;
  esEnSitio: boolean | null;
  esLabPermanente: boolean | null;
  personaContacto: string | null;
  telefonoContacto: string | null;
  fechaCalibracion: Date | string | null;
  hora: Date | string | null;
  Razon_social: string | null;
  dirrecion_solcitante: string | null;
  personaContacto_solicitante: string | null;
  ciudad_solcitante: string | null;
  NIT_solicitante: string | null;
  telefonoContacto_solcitante: string | null;
  no_orden_trabajo: string | null;
  no_cotizacion: string | null;
  responsable: string | null;
  fecha_dilgenciamento: Date | string | null;
  requireAnexo: boolean | null;
  observaciones: string | null;
  estado: string | null;
  estadoRevision: string | null;
  motivoRechazo: string | null;
  createdAt: Date | string | null;
  estado_pago: string | null;
  alertamessag: string | null;
  cliente?: ClienteModel | null;
  cotizacion?: CotizacionModel | null;
  instrumentos?: OrdenTrabajoDetalleModel[];
}

export interface RecepcionEquipoDetalleModel {
  idInstrumento: number;
  idRecepcion: number;
  instrumento: string;
  marca: string | null;
  modelo: string | null;
  serie: string | null;
  codigoInventario: string | null;
  resolucion: string | null;
  tipoSensorTemp: string | null;
  estadoIBC: unknown | null;
  estampilla: string | null;
  observaciones: string | null;
}

export interface RecepcionEquipoModel {
  idRecepcion: number;
  codigo: string;
  idCotizacion: number | null;
  idOrdenTrabajo: number | null;
  solicitante: string;
  nombreEntrega: string | null;
  sitioCalibracion: string;
  fechaRecepcion: Date | string;
  fechaSalida: Date | string | null;
  nombreRecibe: string | null;
  nombreEmpaca: string | null;
  nombreCalibra: string | null;
  nombreRecibeServicio: string | null;
  accesorios: string | null;
  pruebasCompletas: boolean;
  observacionesPruebas: string | null;
  estado: string;
  createdAt: Date | string;
  instrumentos: RecepcionEquipoDetalleModel[];
  cotizacion?: CotizacionModel | null;
  ordenTrabajo?: OrdenTrabajoModel | null;
  documentos?: DocumentoModel[];
}

export interface CalibracionModel {
  idCalibracion: number;
  idInstrumento: number;
  idTecnico: number;
  datosTecnicos: unknown;
  observaciones: string | null;
  createdAt: Date | string;
}

export interface CertificadoSelloModel {
  idCertificado: number;
  idSello: number;
}

export interface CertificadoModel {
  idCertificado: number;
  codigo: string;
  idCalibracion: number;
  idDocumento: number;
  sellos: CertificadoSelloModel[];
}

export interface DocumentChunkModel {
  idChunk: number;
  idDocumento: number;
  contenido: string;
  embedding: unknown | null;
}

export interface ParametroSistemaModel {
  idParametro: number;
  clave: string;
  codigoScript: string | null;
  frecuencia: string;
  expresionCron: string | null;
  proximaEjecucion: Date | string | null;
  ultimaEjecucion: Date | string | null;
}

export interface SelloModel {
  idSello: number;
  nombre: string;
  idDocumento: number;
  estado: boolean;
}

export interface FacturaModel {
  idFactura: number;
  numero: string;
  idOrdenTrabajo: number | null;
  idCliente: number | null;
  fecha: Date | string;
  valor: number | string;
  estado: string;
  observacion: string | null;
  ordenTrabajo?: OrdenTrabajoModel | null;
  cliente?: ClienteModel | null;
}

export interface TramiteModel {
  idTramite: number;
  codigoTramite: string;
  idCliente: number | null;
  estadoFlujo: string;
  createdAt: Date | string;
}

export type UsuarioConRol = UsuarioModel & {
  rolnombre: string;
};
