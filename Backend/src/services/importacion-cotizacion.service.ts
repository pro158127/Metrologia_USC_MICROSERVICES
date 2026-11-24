/** Importar una OT vinculada requiere que el cliente haya aprobado la cotización. */
export function cotizacionAdmiteImportacionVinculada(estado: string): boolean {
  return estado === 'APROBADA';
}

/** Compara nombres de Excel y catálogo sin espacios invisibles ni diferencias de composición Unicode. */
export function normalizarNombreImportado(valor?: string | null): string {
  return (valor ?? '').normalize('NFKD').replace(/[\p{M}\p{Cf}]/gu, '')
    .replace(/\s+/g, ' ').trim().toLowerCase();
}

export function buscarNombresImportados<T>(nombre: string, registros: readonly T[], leer: (registro: T) => string): T[] {
  const clave = normalizarNombreImportado(nombre);
  if (!clave) return [];
  const normalizados = registros.map((registro) => ({ registro, nombre: normalizarNombreImportado(leer(registro)) }));
  // Algunas listas del Excel anteponen la familia al nombre de catálogo con el separador ».
  const etiqueta = clave.includes('»') ? clave.slice(clave.lastIndexOf('»') + 1).trim() : '';
  for (const candidato of [clave, etiqueta].filter(Boolean)) {
    const exactos = normalizados.filter((registro) => registro.nombre === candidato);
    if (exactos.length) return exactos.map(({ registro }) => registro);
    const sinEspacios = candidato.replace(/ /g, '');
    const equivalentes = normalizados.filter((registro) => registro.nombre.replace(/ /g, '') === sinEspacios);
    if (equivalentes.length) return equivalentes.map(({ registro }) => registro);
  }
  return [];
}
