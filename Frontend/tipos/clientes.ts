// ============================================================
// clientes.ts
// Tipos del dominio de Clientes (DTOs UI + inputs de server actions).
// ============================================================

import type { statuscliente, tipocliente, Prisma } from '@prisma/client';
import type { ClienteModel } from './entidades';

// ============================================================
// SERVER ACTIONS (inputs)
// ============================================================

export interface CrearClienteInput {
  nitCedula: string;
  razonSocial: string;
  correo: string;
  nombreContacto?: string;
  telefono?: string;
  observacion?: string;
  tipoCliente?: tipocliente;
  ciudad?: string;
  idRutDocumento?: number;
}

export type ActualizarClienteInput = Partial<CrearClienteInput>;

// ============================================================
// DTOs DE VISTA
// ============================================================

/** Cliente normalizado para la UI (mismo `estado` que `status` en BD). */
export type ClienteVista = ClienteModel & {
  estado: statuscliente;
};

export type ClienteFormData = {
  nitCedula: string;
  razonSocial: string;
  correo: string;
  nombreContacto: string | null;
  telefono: string | null;
  observacion: string | null;
  tipoCliente: tipocliente;
  idRutDocumento: number | null;
  ciudad: string | null;
};

export type ClienteFormSaveData = Partial<ClienteFormData> & {
  idCliente?: number;
  rutFile?: File | null;
};

/** Permisos del usuario (JSON de la sesión). */
export type PermisosUsuario = Record<string, Record<string, boolean>>;

// ============================================================
// PROPS DE COMPONENTES
// ============================================================

export interface ModalHeaderProps {
  isEditMode: boolean;
  razonSocial?: string;
  onClose: () => void;
}

export interface RutFileInputProps {
  isEditMode: boolean;
  selectedFile: File | null;
  idRutDocumento: number | null | undefined;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export interface ClientFormModalProps {
  isOpen: boolean;
  client: ClienteModel | null;
  onClose: () => void;
  onSave: (data: ClienteFormSaveData, mode: "create" | "edit") => void;
}

export interface CustomerTableRowProps {
  c: ClienteVista;
  permisos?: PermisosUsuario;
  handleEdit: (cliente: ClienteVista) => void;
  handleToggleStatus: (id: number) => void;
  onSelectCliente: (id: number) => void;
}

export interface ClientControlsProps {
  search: string;
  setSearch: (v: string) => void;
  filter: string;
  setFilter: (v: string) => void;
  onNewClient: () => void;
  permisos?: PermisosUsuario;
}

export interface ClientesModuloProps {
  onSelectCliente: (id: number) => void;
  onVolver: () => void;
}

// ============================================================
// PERFIL DEL CLIENTE (trazabilidad, árbol de archivos y visor)
// ============================================================

export type FileKind = "pdf" | "excel" | "word";

export interface FileNode {
  name: string;
  type: "file" | "folder";
  children?: FileNode[];
}

export interface FileTreeNodeProps {
  node: FileNode;
}

export interface DocumentConfig {
  kind: FileKind;
  fileId: string;
  apiBaseUrl: string;
}

/** Cotización dentro de la trazabilidad de un cliente. */
export type TrazabilidadCotizacion = Prisma.CotizacionGetPayload<{
  include: {
    detalles: true;
    documentos: true;
    recepciones: {
      include: { instrumentos: true; documentos: true };
    };
    ordenes: {
      include: { instrumentos: true; documentos: true };
    };
  };
}>;

/** Vista de cotización usada por las tarjetas del perfil. */
export type TrazabilidadCotizacionCard = TrazabilidadCotizacion & {
  titulo?: string;
  fechaFin?: string;
};

/** Resultado de `obtenerTrazabilidadCliente` (data normalizada para la UI). */
export type TrazabilidadCliente = Prisma.ClienteGetPayload<{
  include: {
    rutDocumento: {
      include: { versiones: true };
    };
    cotizaciones: {
      include: {
        detalles: true;
        documentos: true;
        recepciones: {
          include: { instrumentos: true; documentos: true };
        };
        ordenes: {
          include: { instrumentos: true; documentos: true };
        };
      };
    };
  };
}>;

export interface CotizacionCardProps {
  cotizacion: TrazabilidadCotizacionCard;
}

export interface ClienteDetailPageProps {
  onVolver: () => void;
  id_cliente: number | null;
}
