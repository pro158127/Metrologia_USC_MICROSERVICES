const revisions = new Map<string, number>();
const listeners = new Set<() => void>();

export function marcarCambiosRealtime(tablas: readonly string[]): void {
  for (const tabla of tablas) revisions.set(tabla, obtenerRevisionRealtime(tabla) + 1);
  for (const listener of listeners) listener();
}

export function obtenerRevisionRealtime(tabla: string): number {
  return revisions.get(tabla) ?? 0;
}

export function suscribirRealtime(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
