// ============================================================
// cotizacion.ts
// Tipos del dominio de Cotizaciones (DTOs UI + inputs de server actions).
// Los tipos de entidad provienen de ./entidades (Prisma-derived).
// ============================================================

import { Estados } from './enums';
import type { HistorialEstadoCotizacionModel, CotizacionModel } from './entidades';

// ============================================================
// SERVER ACTIONS (inputs / payloads)
// ============================================================

export type CotizacionConDetalles = CotizacionModel;

export interface DetalleInput {
  equipoDescripcion: string;
  tipoServicio: string;
  magnitud: string;
  normaTecnica?: string;
  cantidad: number;
  valorUnitario: number;
}

export interface CrearCotizacionInput {
  codigo: string;
  idCliente: number;
  viaticos?: number;
  descuento?: number;
  estado?: Estados;
  detalles: DetalleInput[];
}

export interface ActualizarCotizacionInput extends Partial<CrearCotizacionInput> {
  idCotizacion: number;
  estado?: Estados;
}

export interface ObtenerCotizacionesParams {
  page?: number;
  limit?: number;
  estado?: Estados;
  idCliente?: number;
  busqueda?: string;
}

/** Transiciones de estado permitidas (única fuente: server actions). */
export const transicionesValidas: Record<Estados, Estados[]> = {
  BORRADOR: [Estados.ENVIADA],
  ENVIADA: [Estados.APROBADA, Estados.RECHAZADA],
  APROBADA: [Estados.EN_SEGUIMIENTO],
  RECHAZADA: [],
  EN_SEGUIMIENTO: [],
};

// ============================================================
// DTOs DE VISTA
// ============================================================

export type QuoteItem = {
  id: number;
  tipoServicio: string;
  magnitud: string;
  instrumento: string;
  norma: string;
  cantidad: number;
  valorUnitario: number;
  lugarCalibracion: "Laboratorio" | "Sitio";
};

export type TarifaOption = {
  tipoServicio: string;
  magnitud: string;
  instrumento: string;
  norma: string;
  precio: number;
};

export type ViewCotizacion = "list" | "create" | "catalog";

export interface cambiospayload {
  descripcion: string;
  aprobo: string;
  requiereValidacionHoja: boolean;
  observaciones?: string | null;
}

export interface HistorialItem {
  id: number;
  estadoAnterior: string | null;
  estadoNuevo: string;
  idUsuario: number;
  createdAt: Date | string;
  usuario?: {
    nombreCompleto: string;
  };
}

/** Cotización normalizada para la UI (Decimal → number). */
export type CotizacionDetalleVista = {
  idDetalle: number;
  idCotizacion: number;
  equipoDescripcion: string;
  tipoServicio: string;
  magnitud: string;
  normaTecnica: string | null;
  cantidad: number;
  valorUnitario: number;
  valorTotal: number;
  sitio: string | null;
};

export type CotizacionVista = {
  idCotizacion: number;
  codigo: string;
  idCliente: number | null;
  montoTotal: number;
  estado: Estados;
  createdAt: Date | string;
  updatedAt: Date | string | null;
  viaticos: number;
  descuento: number;
  detalles: CotizacionDetalleVista[];
  cliente: {
    idCliente: number | null;
    razonSocial: string | null;
    correo: string | null;
  } | null;
  historialEstados: HistorialEstadoCotizacionModel[];
  historial_cambio : HistorialCambioItem[],
};

// ============================================================
// PROPS DE COMPONENTES
// ============================================================

export interface ToastNotificationProps {
  toast: string;
}

export interface HeaderBarProps {
  view: ViewCotizacion;
  setView: (v: ViewCotizacion) => void;
  setStep: (s: number) => void;
  onNewQuote?: () => void;
}

export interface ItemsTableProps {
  itemsList: QuoteItem[];
  target: "create" | "modal";
  manejarCambioFila: <K extends keyof QuoteItem>(
    index: number,
    propiedad: K,
    valor: QuoteItem[K],
    target: "create" | "modal"
  ) => void;
  eliminarFila: (id: number, target: "create" | "modal") => void;
  tarifasOptions: TarifaOption[];
  getMagnitudesByTipo: (tipo: string) => string[];
  getInstrumentosByMagnitudAndTipo: (magnitud: string, tipo: string) => TarifaOption[];
}

export interface VersionModalProps {
  usu_rol:string;
  isOpen: boolean;
  onClose: () => void;
  modalItems: QuoteItem[];
  modalDescuento: number;
  setModalDescuento: (v: number) => void;
  modalViaticos: number;
  setModalViaticos: (v: number) => void;
  agregarFila: (target: "create" | "modal") => void;
  eliminarFila: (id: number, target: "create" | "modal") => void;
  manejarCambioFila: <K extends keyof QuoteItem>(
    index: number,
    propiedad: K,
    valor: QuoteItem[K],
    target: "create" | "modal"
  ) => void;
  calculateTotal: (items: QuoteItem[], desc: number, viat: number) => number;
  formatCurrency: (val: number) => string;
  saveNewVersion: (auditForm: cambiospayload) => Promise<void>;
  isSaving: boolean;
  tarifasOptions: TarifaOption[];
  getMagnitudesByTipo: (tipo: string) => string[];
  getInstrumentosByMagnitudAndTipo: (magnitud: string, tipo: string) => TarifaOption[];
}

export interface TimelineHistorialProps {
  items: HistorialItem[];

  loading?: boolean;
  estadoActual?: string;
}

export interface QuotationListTableProps {
  filtered: CotizacionVista[];
  setSelectedQuotation: (c: CotizacionVista | null) => void;
  formatCurrency: (v: number) => string;
  onEstadoChange: (id: number, nuevoEstado: Estados) => void;
  updatingId: number | null;
}

export interface QuotationDetailViewProps {
  selectedQuotation: CotizacionVista;
  openVersionModal: () => void;
  showToast: (msg: string) => void;
  setSelectedQuotation: (q: CotizacionVista | null) => void;
  historialitems: HistorialItem[];
  formatCurrency: (v: number) => string;
  loadingHistorial: boolean;
  onopentable:() => void;
  
}

export interface CreateQuotationWizardProps {
  step: number;
  setStep: React.Dispatch<React.SetStateAction<number>>;
  items: QuoteItem[];
  agregarFila: (target: "create" | "modal") => void;
  eliminarFila: (id: number, target: "create" | "modal") => void;
  manejarCambioFila: <K extends keyof QuoteItem>(
    index: number,
    propiedad: K,
    valor: QuoteItem[K],
    target: "create" | "modal"
  ) => void;
  descuento: number;
  setDescuento: (v: number) => void;
  viaticos: number;
  setViaticos: (v: number) => void;
  calculateTotal: (items: QuoteItem[], desc: number, viat: number) => number;
  formatCurrency: (val: number) => string;
  showToast: (msg: string) => void;
  setView: (v: ViewCotizacion) => void;
  guardarCotizacion: (estado: Estados) => Promise<void>;
  isSaving: boolean;
  idClienteSeleccionado: number | null;
  setIdClienteSeleccionado: (id: number) => void;
  tarifasOptions: TarifaOption[];
  getMagnitudesByTipo: (tipo: string) => string[];
  getInstrumentosByMagnitudAndTipo: (magnitud: string, tipo: string) => TarifaOption[];
}

// Interfaz que refleja el modelo Prisma para el frontend
export interface HistorialCambioItem {
  id: string;
  numeroVersion: string;
  fechaCambio: string | Date;
  descripcion: string;
  requiereValidacionHoja: boolean;
  observaciones?: string | null;
  aprobo: string;
  idCotizacion: number;
  createdAt: string | Date;
  updatedAt: string | Date;
}

// Props del componente Modal
export interface ModalHistorialCambiosProps {
  isOpen: boolean;
  onClose: () => void;
  codigo_cotizacion: string;
  historial: HistorialCambioItem[];
  isLoading?: boolean;
}