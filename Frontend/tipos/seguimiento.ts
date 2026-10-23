// ============================================================
// seguimiento.ts
// Tipos del dominio de Seguimiento Comercial (DTOs UI + inputs).
// ============================================================

import type { SeguimientoComercialModel } from './entidades';

export type TipoSeguimiento = 'LLAMADA' | 'CORREO' | 'REUNION' | 'OTRO';

export interface CrearSeguimientoInput {
  idCotizacion: number;
  tipo: TipoSeguimiento;
  descripcion: string;
  fechaGestion?: Date | string;
  proximaGestion?: Date | string | null;
  resultado?: string | null;
  idUsuario?: number | null;
}

export type ActualizarSeguimientoInput = Partial<Omit<CrearSeguimientoInput, 'idCotizacion'>>;

export type SeguimientoVista = SeguimientoComercialModel;

export const TIPOS_SEGUIMIENTO: { value: TipoSeguimiento; label: string }[] = [
  { value: 'LLAMADA', label: 'Llamada' },
  { value: 'CORREO', label: 'Correo' },
  { value: 'REUNION', label: 'Reunión' },
  { value: 'OTRO', label: 'Otro' },
];
