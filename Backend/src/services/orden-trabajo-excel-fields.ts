import type { Cell } from 'exceljs';

export function resolverContactoSolicitante(orden: {
  PERSONA_CONTACT_SOLCITANTE?: string | null;
  clientes?: { NOMBRE_CONTACTO?: string | null } | null;
}): string | null {
  return orden.PERSONA_CONTACT_SOLCITANTE?.trim() ||
    orden.clientes?.NOMBRE_CONTACTO?.trim() || null;
}

export function escribirFechaFacturacionOT(celda: Cell, fecha: Date | null | undefined): void {
  const destino = celda.master;
  destino.value = fecha ?? null;
  destino.style = { ...destino.style, numFmt: 'dd/mm/yyyy' };
}
