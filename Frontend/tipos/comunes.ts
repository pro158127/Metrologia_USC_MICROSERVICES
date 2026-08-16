// ============================================================
// comunes.ts
// Tipos genéricos compartidos entre action_module, stores y módulos.
// ============================================================

export type ActionResponse<T> = {
  ok: boolean;
  data?: T;
  error?: string;
  meta?: {
    total: number;
    page: number;
    totalPages: number;
    limit?: number;
  };
};

export type PermisoAccion = 'consultar' | 'desactivar' | 'crear_editar' | 'ver_historial';
