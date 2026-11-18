const revisions = new Map<string, number>();

export function marcarCambioRealtime(tabla: string): void {
  revisions.set(tabla, (revisions.get(tabla) ?? 0) + 1);
}

export function obtenerRevisionRealtime(tabla: string): number {
  return revisions.get(tabla) ?? 0;
}
