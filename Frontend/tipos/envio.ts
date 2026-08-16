// ============================================================
// envio.ts
// Tipos del dominio de Entrega y Envío de Certificados.
// ============================================================

export interface OTItem {
  id: string;
  cliente: string;
  correo: string;
  certs: number;
  valor: string;
  facturado: boolean;
  pagado: boolean;
}

export interface HistorialItem {
  fecha: string;
  ots: string;
  correo: string;
  certs: number;
  estado: "enviado" | "error";
}

export interface AlertBannerProps {
  count: number;
}

export interface ToastProps {
  message: string;
}

export interface HeaderProps {
  selectedCount: number;
  totalCerts: number;
  onOpenSendPanel: () => void;
}

export interface ColumnFacturadasProps {
  items: OTItem[];
  selectedIds: string[];
  onSelectDetail: (ot: OTItem) => void;
  onConfirmarPago: (id: string) => void;
}

export interface ColumnListasEnvioProps {
  items: OTItem[];
  selectedIds: string[];
  onToggleSelected: (id: string) => void;
}

export interface ColumnSinFacturarProps {
  items: OTItem[];
  paymentSelector: string | null;
  selectedMethod: string;
  comprobantes: Record<string, string>;
  onSetPaymentSelector: (id: string | null) => void;
  onSetSelectedMethod: (method: string) => void;
  onUploadComprobante: (id: string, fileName: string) => void;
  onConfirmarFactura: (id: string) => void;
}

export interface DetailPanelProps {
  detail: OTItem;
  email: string;
  cc: string;
  message: string;
  onSetEmail: (val: string) => void;
  onSetCC: (val: string) => void;
  onSetMessage: (val: string) => void;
  onSend: () => void;
  onClose: () => void;
  onCertificadoPress: (otId: string, certIndex: number) => void;
}

export interface SendPanelProps {
  selectedOTs: OTItem[];
  totalCerts: number;
  ccEmail: string;
  onSetCcEmail: (val: string) => void;
  onEnviar: () => void;
  onClose: () => void;
}

export interface HistoryTableProps {
  historial: HistorialItem[];
}
