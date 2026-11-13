export const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15 MB (igual al límite de @fastify/multipart)

export interface ValidarArchivoOptions {
  maxBytes?: number;
  extensionesPermitidas?: string[];
  mimesPermitidos?: string[];
}

function extensionDe(nombre: string): string {
  const idx = nombre.lastIndexOf('.');
  return idx >= 0 ? nombre.slice(idx + 1).toLowerCase() : '';
}

/**
 * Valida un archivo antes de subirlo. Devuelve un mensaje de error legible
 * (español) o `null` si el archivo es válido.
 */
export function validarArchivo(file: File, options: ValidarArchivoOptions = {}): string | null {
  const maxBytes = options.maxBytes ?? MAX_FILE_SIZE;

  if (file.size > maxBytes) {
    const mb = Math.round(maxBytes / (1024 * 1024));
    return `El archivo "${file.name}" supera el tamaño máximo permitido de ${mb} MB.`;
  }

  if (file.size === 0) {
    return `El archivo "${file.name}" está vacío.`;
  }

  if (options.extensionesPermitidas && options.extensionesPermitidas.length > 0) {
    const ext = extensionDe(file.name);
    if (!options.extensionesPermitidas.includes(ext)) {
      return `El archivo "${file.name}" tiene una extensión no permitida (.${ext || 'sin extensión'}).`;
    }
  }

  if (options.mimesPermitidos && options.mimesPermitidos.length > 0) {
    if (!options.mimesPermitidos.includes(file.type)) {
      return `El tipo de archivo "${file.type || 'desconocido'}" no está permitido.`;
    }
  }

  return null;
}

/** Mensaje legible de los tipos permitidos para mostrar en la UI. */
export function etiquetaTiposPermitidos(extensiones: string[]): string {
  return extensiones.map((e) => `.${e}`).join(', ');
}
