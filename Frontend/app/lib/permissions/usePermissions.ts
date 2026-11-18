"use client";

import { useSession } from "next-auth/react";
import { useMemo } from "react";

type Modulos = Record<string, Record<string, boolean>>;

/**
 * Normaliza el JSON de permisos del usuario autenticado.
 * El backend devuelve: { permisos: { <módulo>: { <acción>: boolean } } }
 * Puede llegar como objeto o como string JSON si fue serializado en el JWT.
 */
function normalizar(permissions: unknown): Modulos {
  if (!permissions) return {};
  const data =
    typeof permissions === "string" ? JSON.parse(permissions) : permissions;
  const modulos = (data as { permisos?: Modulos })?.permisos;
  return (modulos ?? {}) as Modulos;
}

/**
 * Hook de control de acceso basado en roles (frontend).
 * Expone helpers para renderizar condicionalmente menús, rutas y botones.
 */
export function usePermissions() {
  const { data: session } = useSession();
  const permisos = useMemo(
    () => normalizar(session?.user?.permissions),
    [session?.user?.permissions]
  );

  return useMemo(
    () => ({
      // ¿Tiene al menos una acción permitida en el módulo?
      hasModule: (modulo: string) =>
        Object.values(permisos[modulo] ?? {}).some(Boolean),
      // ¿Tiene una acción concreta permitida?
      can: (modulo: string, accion: string) =>
        Boolean(permisos[modulo]?.[accion]),
      // ¿Tiene al menos una de las acciones indicadas?
      canAny: (modulo: string, acciones: string[]) =>
        acciones.some((a) => Boolean(permisos[modulo]?.[a])),
      // Acceso crudo a los módulos normalizados
      modulos: permisos,
    }),
    [permisos]
  );
}
