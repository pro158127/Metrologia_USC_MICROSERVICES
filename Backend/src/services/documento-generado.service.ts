export const prefijosDocumentoGenerado = {
  1: 'cotizaciones_generadas',
  2: 'ordenes_trabajo_generadas',
  3: 'recepciones_generadas',
} as const;

export type TipoDocumentoGenerado = keyof typeof prefijosDocumentoGenerado;

export function nombreArchivoDocumento(ruta: string): string {
  return ruta.split(/[?#]/, 1)[0]?.split('/').pop() ?? '';
}

export function esPdfGenerado(ruta: string, tipo: TipoDocumentoGenerado, codigo: string): boolean {
  const archivo = nombreArchivoDocumento(ruta);
  if (!/\.pdf$/i.test(archivo) || /^test_/i.test(archivo)) return false;
  if (ruta.startsWith(`${prefijosDocumentoGenerado[tipo]}/`)) return true;
  // Archivos antiguos fuera de la carpeta actual conservan el consecutivo en la ruta.
  const raiz = codigo.toUpperCase().match(/^([A-Z]+-\d{2}-\d{4,})[A-Z]$/)?.[1];
  const codigoArchivo = archivo.toUpperCase().match(/^([A-Z]+-\d{2}-\d{4,})[A-Z]\.PDF$/)?.[1];
  return raiz != null && raiz === codigoArchivo;
}

export function esPdfSelladoVigente(
  archivo: { rutaUrl: string; createdAt: Date | null },
  codigoCertificado: string,
  revisadoAt: Date | null,
): boolean {
  return archivo.rutaUrl.startsWith('certificados-generados/') &&
    nombreArchivoDocumento(archivo.rutaUrl).replace(/^\d+_/, '') === `${codigoCertificado}.pdf` &&
    (!revisadoAt || !archivo.createdAt || archivo.createdAt >= revisadoAt);
}
