// ============================================================
// tarifas.ts
// Tipos del catálogo de Tarifas (DTOs UI).
// ============================================================

export interface PriceRecord {
  idHistorial: number;
  precioU: number;
  fechaInicio: string;
  fechaFin: string | null;
}

export interface CatalogItem {
  idTarifa: number;
  magnitud: string;
  instrumento: string;
  tipoServicio: string;
  norma: string;
  estado: "ACTIVO" | "INACTIVO";
  acreditadoONAC: boolean;
  precioVigente: number;
  fechaFin: string | null;
  historialPrecios: PriceRecord[];
}

export interface CatalogHeaderControlsProps {
  searchTerm: string;
  setSearchTerm: (v: string) => void;
  selectedMagnitud: string;
  setSelectedMagnitud: (v: string) => void;
  selectedTipoServicio: string;
  setSelectedTipoServicio: (v: string) => void;
  magnitudesDisponibles: string[];
  tiposServicioDisponibles: string[];
  onOpenCreate: () => void;
}

export interface PriceHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: CatalogItem | null;
}

export interface CatalogFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (item: Partial<CatalogItem> & { fechaInicio?: string; fechaFin?: string | null }) => void;
  initialData?: CatalogItem | null;
  isSaving: boolean;
}

export interface CatalogRowProps {
  item: CatalogItem;
  onEdit: (item: CatalogItem) => void;
  onToggleStatus: (idTarifa: number, estadoActual: "ACTIVO" | "INACTIVO") => void;
  onViewHistory: (item: CatalogItem) => void;
}
