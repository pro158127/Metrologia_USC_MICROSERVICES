'use client';

import { useEffect, useState } from 'react';
import {
  obtenerEstadoSellos,
  type EstadoSellosOperativos,
} from '@/app/action_module/sellos';

/**
 * Consulta el estado de las plantillas de sello (PDF + mapeo de caja).
 * Devuelve `todasCompletas = false` si alguna está incompleta.
 */
export function useSellosOperativos() {
  const [estado, setEstado] = useState<EstadoSellosOperativos | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let activo = true;
    (async () => {
      setCargando(true);
      const res = await obtenerEstadoSellos();
      if (activo) {
        setEstado(res);
        setCargando(false);
      }
    })();
    return () => {
      activo = false;
    };
  }, []);

  return {
    estado,
    cargando,
    todasCompletas: estado?.todasCompletas ?? false,
  };
}
