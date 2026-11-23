/** Importar una OT vinculada requiere que el cliente haya aprobado la cotización. */
export function cotizacionAdmiteImportacionVinculada(estado: string): boolean {
  return estado === 'APROBADA';
}
