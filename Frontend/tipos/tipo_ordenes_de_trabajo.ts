// ============================================================
// tipo_ordenes_de_trabajo.ts
// Tipos compartidos de Órdenes de Trabajo (Frontend + Backend).
// Archivo AUTOCONTENIDO: no importa de @/ ni de @prisma/client.
// Refleja (por espejo) los modelos Prisma "OrdenTrabajo" y
// "OrdenTrabajoDetalle" para que ambos paquetes lo consuman.
// ============================================================

import type { ReactNode } from "react";
import { Init } from "v8";

// ============================================================
// 1. ENUMS (espejo de EstadoOT y estadopay del schema Prisma)
// ============================================================
export type EstadoOrden =
  | "Creada"
  | "En_recepción"
  | "Asignada"
  | "En_calibración"
  | "Certificado_en_revisión"
  | "Certificado_aprobado"
  | "Certificado_enviado";

export type EstadoPagoOrden = "PAGADO" | "PENDINDE" | "VENCIDA";

// ============================================================
// 2. MODELO BASE (espejo de Prisma)
// ============================================================

/** Espejo del modelo Prisma `OrdenTrabajo`. */



export type OrdenTrabajoBase = {
  // Sección 1
  idOrdenTrabajo: number;
  codigo: string;
  idCotizacion: number | null;
  idCliente: number | null;
  correoCertificado: string | null;
  correoFactura: string | null;
  fechaLimiteFacturacion: string | Date | null;

  NIT: string | null;
  dirrecion: string | null;
  ciudad: string | null;



  // Información de calibración
  esInternoUSC: boolean | null;
  esEnSitio: boolean | null;
  esLabPermanente: boolean | null;
  personaContacto: string | null;
  telefonoContacto: string | null;
  fechaCalibracion: string | Date | null;
  hora: string | Date | null;

  // Información del solicitante
  Razon_social: string | null;
  dirrecion_solcitante: string | null;
  personaContacto_solicitante: string | null;
  ciudad_solcitante: string | null;
  NIT_solicitante: string | null;
  telefonoContacto_solcitante: string | null;

  // Consecutivos y fechas
  no_orden_trabajo: string | null;
  no_cotizacion: string | null;
  responsable: string | null;
  fecha_dilgenciamento: string | Date | null;

  requireAnexo: boolean | null;

  // Observaciones
  observaciones: string | null;

  // Estados
  estado: EstadoOrden | null;
  estadoRevision: string | null;
  motivoRechazo: string | null;
  createdAt: string | Date | null;
  estado_pago: EstadoPagoOrden | null;
  alertamessag: string | null;
};

/** Espejo del modelo Prisma `OrdenTrabajoDetalle`. */
export type OrdenTrabajoDetalleBase = {
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
};

/** Mínimo de tarifa usado por la UI (evita acoplar a Prisma del Frontend). */
export type TarifaOptionBase = {
  tipoServicio: string;
  Instrumento: string;
};

// ============================================================
// 3. TIPOS DEL MÓDULO ÓRDENES DE TRABAJO
// ============================================================

export type ViewMode = "kanban" | "list";

export type WarningTipo =
  | "retraso"
  | "sin_responsable"
  | "sin_fecha"
  | "exceso_instrumentos"
  | "pendiente_revision";

export type Warning = {
  tipo: WarningTipo;
  mensaje: string;
};

/** Instrumento editable en el formulario, alineado a `OrdenTrabajoDetalle`. */
export type Instrument = Omit<OrdenTrabajoDetalleBase, "idOrdenTrabajo" | "idDetalle"> & {
  /** Identificador temporal solo para la UI (row key). */
  id: string;
};

/** Vista resumida de una OT para Kanban/Lista, alineada a `OrdenTrabajo`. */
export type OTBase = {
  id: string;
  codigo: string;
  cliente: string;
  tecnico: string;
  fecha: string;
  estado: EstadoOrden;
  retraso: boolean;
  equipos: number;
  warns: Warning[];
};

/** DTO del formulario R-CM05 (valores string para bindeo de inputs). */
export type EditableOrderFields = {
  razonSocialCert: string;
  nitCert: string;
  correoCertificados: string;
  fechaLimiteFacturacion: string;
  direccionCert: string;
  ciudadCert: string;
  correoFactura: string;

  lugarCalibracion: "Interno USC" | "En sitio" | "Laboratorio permanente";
  personaContactar: string;
  telefonoCalibracion: string;
  fechaCalibracion: string;
  horaCalibracion: string;

  razonSocialSolicitante: string;
  nitSolicitante: string;
  direccionSolicitante: string;
  ciudadSolicitante: string;
  contactoSolicitante: string;
  telefonoSolicitante: string;

  noOrdenTrabajo: string;
  noCotizacion: string;
  responsableUsc: string;
  fechaDiligenciamiento: string;
  requiereAnexo: "Si" | "No";
  estadoOrden: string;
  estado_revision?: string;
  ultima_version?: string;
  observacionesGenerales: string;
};

/** OT seleccionada/detalle combinando la vista y el DTO del formulario. */
export type OTType = Partial<EditableOrderFields> & {
  id: string;
  cliente: string;
  tecnico: string;
  fecha: string;
  estado: EstadoOrden;
  retraso: boolean;
  equipos: number;
  codigo?: string;
  tipo?: string;
  warns?: Warning[];
  maquinas?: string[];
  tecnicos?: string[];
  asignaciones?: MachineAssignmentsMap;
  instrumentos?: Instrument[];
};

export interface MachineQuantityAssignment {
  quantity: number;
  technicians: string[];
}

export type MachineAssignmentsMap = Record<string, MachineQuantityAssignment>;

export type OrdenTrabajoVista = {
  idOrdenTrabajo: number;
  codigo: string;
  clienteNombre: string;
  responsable: string | null;
  fechaCalibracion: Date | null;
  fechaLimiteFacturacion: Date | null;
  estado: EstadoOrden;
  equiposCount: number;
  retraso: boolean;
};

// ============================================================
// 4. INTERFACES DE PROPS DE LOS COMPONENTES
// ============================================================

export interface ToastNotificationProps {
  message: string;
}

export interface HeaderSectionProps {
  selectedOT: OTType | null;
  search: string;
  setSearch: (val: string) => void;
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  onBack: () => void;
  totalOTs: number;
  warnings?: Warning[];
}

export interface OrderAlertsBannerProps {
  selectedOT: OTType;
  warnings?: Warning[];
}

export interface ComboboxInstrumentoProps {
  value: string;
  options: string[];
  onChange: (value: string) => void;
  placeholder?: string;
}

export interface StaffAssignmentSectionProps {
  editingTechnician: boolean;
  setEditingTechnician: (val: boolean) => void;
  technicians: Tecnico[];
  instrumentosCot:OTasiignemet[]
  onAssignTechnician:( idUsuario: number,id_instrumento:number) => void;

}

export interface InstrumentosTableProps {
  instrumentDrafts: Instrument[];
  updateInstrumentDraft: <K extends keyof Instrument>(
    id: string,
    field: K,
    value: Instrument[K]
  ) => void;
  onAddInstrument: () => void;
  onRemoveInstrument: (id: string) => void;
  excedioLimite: boolean;
  tarifas: TarifaOptionBase[];
}

export interface OrderFormRCM05Props {
  editingOrder: boolean;
  setEditingOrder: (val: boolean) => void;
  orderDraft: EditableOrderFields | null;
  updateOrderDraft: <K extends keyof EditableOrderFields>(
    field: K,
    value: EditableOrderFields[K]
  ) => void;
  instrumentDrafts: Instrument[];
  updateInstrumentDraft: <K extends keyof Instrument>(
    id: string,
    field: K,
    value: Instrument[K]
  ) => void;
  technicians: Tecnico[];
  saveOrderEdits: () => void;
  onAddInstrument: () => void;
  onRemoveInstrument: (id: string) => void;
  tarifas: TarifaOptionBase[];
}

export interface SectionProps {
  title: string;
  subtitle?: string;
  isExpanded: boolean;
  onToggle: () => void;
  bgHeader?: string;
  /** Contenido a renderizar. */
  children: ReactNode;
}

export interface FieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  list?: string;
  className?: string;
}

export interface KanbanBoardViewProps {
  otsList: Partial<OTBase>[];
  collapsedColumns: Partial<Record<EstadoOrden, boolean>>;
  toggleColumnCollapse: (key: EstadoOrden) => void;
  onOpenOT: (ot: Partial<OTBase>) => void;
  warnigs?: Warning[];
}

export interface ListViewTableProps {
  otsList: Partial<OTBase>[];
  search: string;
  onOpenOT: (ot: Partial<OTBase>) => void;
}

// ============================================================
// 5. CONSTANTES DEL MÓDULO
// ============================================================

/** Instrumentos iniciales del formulario: vacío (sin datos de prueba). */
export const defaultInstrumentos: Instrument[] = [];

export const kanbanColumns: { key: EstadoOrden; label: string; color: string }[] = [
  { key: "Creada", label: "Creada", color: "#94A3B8" },
  { key: "En_recepción", label: "En recepción", color: "#F59C0B" },
  { key: "Asignada", label: "Asignada", color: "#5680F9" },
  { key: "En_calibración", label: "En calibración", color: "#9A8CF3" },
  { key: "Certificado_en_revisión", label: "Certificado en revisión", color: "#F59C0B" },
  { key: "Certificado_aprobado", label: "Certificado aprobado", color: "#22C55E" },
  { key: "Certificado_enviado", label: "Certificado enviado", color: "#4C36D0" },
];

export interface OTasiignemet{
  id_instrumento:number;
  asignado:number;
  instrumento:string;

}
export interface Tecnico {
  idUsuario: number;
  nombreCompleto: string;
}