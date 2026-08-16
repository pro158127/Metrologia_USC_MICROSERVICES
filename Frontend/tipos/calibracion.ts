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

/** Fila de revisión de certificados (derivada del store). */
export interface CertificadoRevision {
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
}

export interface ToastNotificationProps {
  message: string;
}

export interface RejectModalProps {
  showDevolver: string | null;
  motivo: string;
  motivoError: boolean;
  setMotivo: (val: string) => void;
  setMotivoError: (val: boolean) => void;
  setShowDevolver: (val: string | null) => void;
  handleDevolver: (ot: string) => void;
}

export interface ApproveModalProps {
  showAprobar: string | null;
  setShowAprobar: (val: string | null) => void;
  handleAprobar: (ot: string) => void;
}

export interface CertificatesTableProps {
  sortedCerts: CertificadoRevision[];
  selected: string | null;
  sortField: SortField;
  sortDir: SortDir;
  tienePermisosRevision: boolean;
  handleSort: (field: SortField) => void;
  setSelected: (ot: string | null) => void;
  setShowAprobar: (ot: string) => void;
  setShowDevolver: (ot: string) => void;
}

export interface PDFViewerPanelProps {
  selectedCert: CertificadoRevision;
  tienePermisosRevision: boolean;
  setSelected: (ot: string | null) => void;
  setShowAprobar: (ot: string) => void;
  setShowDevolver: (ot: string) => void;
}

// ============================================================
// MÓDULO CALIBRACIÓN E INFORMES
// ============================================================

export type EstadoInstrumento = "Pendiente" | "Adjuntado" | "En revisión" | "Devuelto" | "Firmado";

export interface InstrumentoAsignado {
  id: string;
  estampilla: string;
  workOrder: string;
  equipment: string;
  client: string;
  uploadDate?: string;
  fileName?: string;
  status: EstadoInstrumento;
  motivoDevolucion?: string;
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
