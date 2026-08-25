export interface CotizacionVinculable {
  idCotizacion: number;
  codigo: string;
  cliente: string;
  fecha: string;
  equiposContados: number;
}

export interface ImportarOTPayload {
  s3KeyTemp: string;
  tipoFlujo: 'estandar' | 'inverso';
  idCotizacion?: number; // Si es undefined, el Worker asume flujo anormal y crea la cotización
}

export interface RespuestaWorkerJob {
  ok: boolean;
  id_job?: string;
  error?: string;
}

export interface PollingJobStatus {
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  fileUrl?: string;
  data?: any;
}