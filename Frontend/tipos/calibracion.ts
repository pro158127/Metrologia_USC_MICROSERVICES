// ============================================================
// calibracion.ts
// Tipos del dominio de Calibración e Informes (revisión de certificados).
// ============================================================

export type SortField =
  | "ot"
  | "estampilla"
  | "instrumento"
  | "cliente"
  | "tecnico"
  | "tipo"
  | "fecha"
  | "espera";

export type SortDir = "asc" | "desc";

/** Fila de revisión de certificados (derivada del backend). */
export interface CertificadoRevision {
  idCertificado: number;
  codigo?: string;
  ot: string;
  estampilla: string;
  cliente: string;
  instrumento: string;
  tecnico: string;
  tipo: string;
  fecha: string;
  espera: number;
  bloqueado: boolean;
  status?: "pendiente" | "aprobado" | "devuelto";
  datosTecnicos?: Record<string, string>;
  motivoRechazo?: string | null;
  rutaUrl?: string | null;
  acreditado?: boolean;
}

export interface ToastNotificationProps {
  message: string;
}

export interface RejectModalProps {
  showDevolver: number | null;
  label: string;
  motivo: string;
  motivoError: boolean;
  setMotivo: (val: string) => void;
  setMotivoError: (val: boolean) => void;
  setShowDevolver: (val: number | null) => void;
  handleDevolver: (idCertificado: number) => void;
}

export interface ApproveModalProps {
  showAprobar: number | null;
  label: string;
  setShowAprobar: (val: number | null) => void;
  handleAprobar: (idCertificado: number) => void;
}

export interface CertificatesTableProps {
  sortedCerts: CertificadoRevision[];
  selected: number | null;
  sortField: SortField;
  sortDir: SortDir;
  tienePermisosRevision: boolean;
  handleSort: (field: SortField) => void;
  setSelected: (v: number | null) => void;
  setShowAprobar: (v: number) => void;
  setShowDevolver: (v: number) => void;
}

export interface PDFViewerPanelProps {
  selectedCert: CertificadoRevision;
  tienePermisosRevision: boolean;
  setSelected: (v: number | null) => void;
  setShowAprobar: (v: number) => void;
  setShowDevolver: (v: number) => void;
}

// ============================================================
// MÓDULO CALIBRACIÓN E INFORMES
// ============================================================

export type EstadoInstrumento = "Pendiente" | "Adjuntado" | "En revisión" | "Devuelto" | "Firmado";

export interface InstrumentoAsignado {
  id: string;
  idInstrumento?: number;
  idCalibracion?: number | null;
  idCertificado?: number | null;
  idOrdenTrabajo?: number | null;
  estampilla: string;
  workOrder: string;
  equipment: string;
  client: string;
  uploadDate?: string;
  fileName?: string;
  status: EstadoInstrumento;
  motivoDevolucion?: string;
  datosTecnicos?: unknown;
}

export interface HeaderKPIsProps {
  instrumentos: InstrumentoAsignado[];
}

export interface FilterBarProps {
  filterWorkOrder: string;
  setFilterWorkOrder: (val: string) => void;
  showODropdown: boolean;
  setShowODropdown: (show: boolean) => void;
  sugerenciasOT: string[];
  filterClient: string;
  setFilterClient: (val: string) => void;
  showCDropdown: boolean;
  setShowCDropdown: (show: boolean) => void;
  sugerenciasCliente: string[];
}

export interface UploadDockProps {
  selectedInstrumento: InstrumentoAsignado;
  selectedFile: File | null;
  onCancel: () => void;
  onRemoveFile: () => void;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onUpload: () => void;
}

export interface InstrumentCardProps {
  instrumento: InstrumentoAsignado;
  isSelected: boolean;
  onSelect: (instrumento: InstrumentoAsignado) => void;
  obtenerBadgeEstado: (status: EstadoInstrumento) => string;
}
