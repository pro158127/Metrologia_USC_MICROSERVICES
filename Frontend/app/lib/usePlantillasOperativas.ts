'use client';

import { useEffect, useState } from 'react';
import {
  obtenerEstadoPlantillas,
  type EstadoPlantillasOperativas,
} from '@/app/action_module/template';

/**
 * Consulta el estado de las plantillas operativas (formato + mapeo).
 * Devuelve `todasCompletas = false` si alguna está incompleta.
 */
export function usePlantillasOperativas() {
  const [estado, setEstado] = useState<EstadoPlantillasOperativas | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let activo = true;
    (async () => {
      setCargando(true);
      const res = await obtenerEstadoPlantillas();
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
