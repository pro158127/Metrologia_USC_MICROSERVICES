type EstadoIbcLike = {
  salida?: Record<string, unknown>;
} | null | undefined;

export interface RecepcionSalidaLike {
  fechaSalida?: unknown;
  nombreRecibe?: string | null;
  nombreEmpaca?: string | null;
  accesorios?: string | null;
  nombreRecibeServicio?: string | null;
  instrumentos: Array<{
    instrumento?: string | null;
    estadoIBC?: EstadoIbcLike;
    activacion?: boolean | null;
  }>;
}

/** Datos de salida pendientes. Son informativos para Entrega y Envío; no bloquean el correo. */
export function pendientesEntregaSalida(recepcion: RecepcionSalidaLike): string[] {
  const faltantes = new Set<string>();
  const equipos = recepcion.instrumentos.filter((equipo) => equipo.activacion !== false);

  if (!recepcion.fechaSalida) faltantes.add('fecha de salida');
  if (!recepcion.nombreRecibe?.trim()) faltantes.add('nombre de quien recibe');
  if (!recepcion.nombreEmpaca?.trim()) faltantes.add('nombre de quien empaca');
  if (!/^Accesorios: (Bueno|Malo) -\s*\S/i.test(recepcion.accesorios ?? '')) {
    faltantes.add('accesorios y estado general');
  }
  if (!recepcion.nombreRecibeServicio?.trim()) faltantes.add('nombre de quien recibe el servicio');
  if (equipos.length === 0) faltantes.add('instrumentos activos en la recepción');

  for (const equipo of equipos) {
    const salida = equipo.estadoIBC?.salida;
    if (!['E', 'T', 'D', 'A'].every((clave) => typeof salida?.[clave] === 'boolean')) {
      faltantes.add(`estado IBC de salida de ${equipo.instrumento ?? 'instrumento'}`);
    }
  }

  return [...faltantes];
}
