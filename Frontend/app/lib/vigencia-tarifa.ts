type Periodo = { fechaInicio: string | Date; fechaFin?: string | Date | null };

export function precioEnVigencia(periodo: Periodo, ahora = Date.now()): boolean {
  return new Date(periodo.fechaInicio).getTime() <= ahora &&
    (!periodo.fechaFin || new Date(periodo.fechaFin).getTime() > ahora);
}

export function obtenerPrecioVigente<T extends Periodo>(historial: readonly T[], ahora = Date.now()): T | undefined {
  return historial.reduce<T | undefined>((vigente, fila) => {
    if (!precioEnVigencia(fila, ahora)) return vigente;
    return !vigente || new Date(fila.fechaInicio) > new Date(vigente.fechaInicio) ? fila : vigente;
  }, undefined);
}
