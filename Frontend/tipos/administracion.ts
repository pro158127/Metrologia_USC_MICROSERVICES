// ============================================================
// administracion.ts
// Tipos específicos del módulo Administración (Administracion.tsx).
// ============================================================

import type { Dispatch, SetStateAction } from 'react';
import type { UsuarioModel } from './entidades';

export type AdminTab = "usuarios" | "bitacora" | "config";
export type ConfigSection = "plantillas" | "sello" | "parametros";
export type TipoRol = "Secretaria" | "Director Técnico" | "Técnico" | "Coordinadora" | "Gestor Comercial" | "";
export type TipoModulo = "administracion" | "cleintes" | "revision" | "cotizaciones" | "ordenes_ot" | "";

export interface init_bitacora {
  fecha: string;
  usuario: string;
  rol: string;
  accion: string;
  modulo: string;
  ip: string;
}

export interface ToastProps {
  message: string;
}

export interface FormUsuario {
  nombre: string;
  correo: string;
  rol?: string;      // Opcional (?) para que al crear no estorbe
  estado?: boolean;    // Opcional para que la base de datos asuma el valor por defecto si no lo mandas
  id?: number;         // Opcional, solo existirá cuando estemos EDITANDO
}

export interface uso_rol {
  rolnombre: string;
}

export type RolColorMap = Record<string, { bg: string; color: string }>;

export interface FiltrosBitacora {
  usuario: string; // Input de texto libre para buscar nombre
  modulo: TipoModulo;
  rol: TipoRol;
  fecha: string; // Formato YYYY-MM-DD para el input de tipo date
}

export interface tab_bitacora {
  info_bitacora: init_bitacora[];
  recarga: () => Promise<void>;
  token: string | null;
}

export interface TabUsuariosProps {
  search: string;
  setSearch: (val: string) => void;
  filteredUsers: (UsuarioModel & uso_rol)[];
  openCreate: () => void;
  openEdit: (user: UsuarioModel & uso_rol) => void;
  toggleEstado: (id: number, estado: boolean) => void;
  showToast: (msg: string) => void;
  rolColors: RolColorMap;
}

export interface ModalUsuarioProps {
  editingUser: boolean;
  form: FormUsuario;
  setForm: Dispatch<SetStateAction<FormUsuario>>;
  onClose: () => void;
  onSave: () => void;
  rolColors: RolColorMap;
}

export interface TabConfiguracionProps {
  configSection: ConfigSection;
  setConfigSection: (section: ConfigSection) => void;
}
