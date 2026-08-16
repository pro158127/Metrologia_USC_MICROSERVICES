// ============================================================
// store.ts
// Estado global de tablas tipado (RealtimeTablesState).
// Reemplaza la interfaz que vivía en tables_recharge.tsx.
// ============================================================

import type {
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
} from './entidades';

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
  calibraciones: CalibracionModel[];
  certificados: CertificadoModel[];
  certificado_sellos: CertificadoSelloModel[];
  document_chunks: DocumentChunkModel[];
  historial_estado_cotizacion: HistorialEstadoCotizacionModel[];
  historial_tarifas: HistorialTarifaModel[];
  parametros_sistema: ParametroSistemaModel[];
  sellos: SelloModel[];
  tramites: TramiteModel[];
  version_plantillas: VersionPlantillaModel[];
  facturas: FacturaModel[];
}
