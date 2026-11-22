// ============================================================
// recepciones.ts
// Tipos del módulo de Recepción de Equipos (DTOs UI + props).
// ============================================================

import type {
  RecepcionEquipoModel,
  ClienteModel,
  CotizacionModel,
  OrdenTrabajoModel,
  TarifaModel,
} from "./entidades";

export type {
  RecepcionEquipoModel,
  ClienteModel,
  CotizacionModel,
  OrdenTrabajoModel,
  TarifaModel,
};

// Fila de instrumento del formulario (mapeada a RecepcionEquipoDetalle)
export interface FilaInstrumento {
  id: string;
  idInstrumento?: number;
  idUnidad?: string | null;
  calibracionIniciada?: boolean;
  certificadoAprobado?: boolean;
  item?: number | null;
  instrumento: string;
  tipoServicio: string;
  marca: string;
  modelo: string;
  serie: string;
  codigoInterno: string;
  resolucion: string;
  ibcE_in: boolean | null, ibcT_in: boolean | null, ibcD_in: boolean | null, ibcA_in: boolean | null,
  ibcE_out: boolean | null, ibcT_out: boolean | null, ibcD_out: boolean | null, ibcA_out: boolean | null,
  sensorInt: boolean;
  sensorExt: boolean;
  estampilla: string;
  observaciones: string;
  verificadoExcel: boolean;
  observacionesSecretaria: string;
  idTarifaSeleccionada?: number;
}

// Estado completo del formulario de recepción
export interface FormularioRecepcion {
  solicitante: string;
  idCliente?: number;
  nombreQuienEntrega: string;
  cotizacionCodigo: string;
  ordenTrabajoCodigo: string;
  sitioCalibracion: string;
  fechaRecepcion: string;
  fechaSalida: string;
  nombreQuienRecibe: string;
  nombreQuienEmpaca: string;
  accesorios: string;
  pruebasCompletas: boolean;
  observacionesPruebas: string;
  nombreQuienCalibra: string;
  nombreQuienRecibeServicio: string;
  instrumentos: FilaInstrumento[];
}

// Para la vista de lista (recepciones enriquecidas)
export interface RecepcionConInfo {
  idRecepcion: number;
  codigo: string;
  solicitante: string;
  fecha: string;
  cantidadInstrumentos: number;
  codigoCotizacion?: string;
  codigoOT?: string;
  raw: RecepcionEquipoModel;
}

export interface FilterBarProps {
  filtroSolicitante: string;
  filtroAnio: string;
  filtroMes: string;
  filtroDia: string;
  solicitantesUnicos: string[];
  aniosDisponibles: string[];
  onSolicitanteChange: (val: string) => void;
  onAnioChange: (val: string) => void;
  onMesChange: (val: string) => void;
  onDiaChange: (val: string) => void;
  onAgregarRecepcion: () => void;
}

export interface RecepcionCardProps {
  recepcionInfo: RecepcionConInfo;
  onSelect: (recepcion: RecepcionEquipoModel) => void;
}

export type SolicitanteRecepcion = Pick<ClienteModel, "idCliente" | "razonSocial" | "nitCedula">;

export interface DatosGeneralesSectionProps {
  solicitante: string;
  idCliente?: number;
  nombreQuienEntrega: string;
  cotizacionCodigo: string;
  ordenTrabajoCodigo: string;
  sitioCalibracion: string;
  fechaRecepcion: string;
  fechaSalida: string;
  nombreQuienRecibe: string;
  nombreQuienEmpaca: string;
  solicitantes: SolicitanteRecepcion[];
  cargandoSolicitantes: boolean;
  onSeleccionarSolicitante: (cliente?: SolicitanteRecepcion) => void;
  onUpdateGeneral: (field: string, value: string) => void;
  bloqueado?: boolean;
}

export interface TablaInstrumentosProps {
  instrumentos: FilaInstrumento[];
  tarifasDisponibles: TarifaModel[];
  tecnicosInstrumentos: Array<{ item: number; instrumento: string; nombreTecnico: string }>;
  onFilaChange: (
    index: number,
    propiedad: keyof FilaInstrumento,
    valor: FilaInstrumento[keyof FilaInstrumento]
  ) => void;
  onAgregarFila: () => void;
  onEliminarFila: (index: number) => void;
}

export interface InspeccionYFirmasSectionProps {
  accesorios: string;
  pruebasCompletas: boolean;
  observacionesPruebas: string;
  nombreQuienCalibra: string;
  nombreQuienRecibeServicio: string;
  onUpdateGeneral: (field: string, value: string | boolean) => void;
}

export interface FormFooterActionsProps {
  actaGuardada: boolean;
  onGenerarActa: () => void;
  guardando?: boolean;
}
