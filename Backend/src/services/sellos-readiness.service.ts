// services/sellos-readiness.service.ts
// Evalúa si las plantillas de sello están completas: deben tener su PDF subido
// a MinIO (TEMPLATE_PDF_KEY) y su mapeo de caja (DOCUMENT_AREA).
import { PrismaClient } from '@prisma/client';

export interface ResultadoSello {
  id: number;
  nombre: string;
  completa: boolean;
  tienePdf: boolean;
  tieneMapeo: boolean;
  faltantes: string[];
}

export interface EstadoSellosOperativos {
  todasCompletas: boolean;
  detalle: ResultadoSello[];
  mensaje: string;
}

function construirMensaje(detalle: ResultadoSello[]): string {
  const incompletas = detalle.filter((d) => !d.completa);
  if (incompletas.length === 0) return '';

  const partes = incompletas.map(
    (d) => `${d.nombre}: ${d.faltantes.length > 0 ? d.faltantes.join(', ') : 'incompleta'}`,
  );

  return (
    'No es posible continuar: las plantillas de sello no están completas. ' +
    'Suba el PDF del sello y configure el mapeo de su caja en Administración → Sellos. ' +
    `Detalle — ${partes.join(' | ')}`
  );
}

export async function evaluarSellosOperativos(
  prisma: PrismaClient,
): Promise<EstadoSellosOperativos> {
  const sellos = await prisma.plantillas_sellos.findMany({
    orderBy: { ID_PLANTILLA_SELLO: 'asc' },
  });

  const detalle: ResultadoSello[] = sellos.map((s) => {
    const tienePdf = s.TEMPLATE_PDF_KEY != null && s.TEMPLATE_PDF_KEY.trim() !== '';
    const tieneMapeo = s.DOCUMENT_AREA != null;
    const faltantes: string[] = [];
    if (!tienePdf) faltantes.push('PDF del sello no subido');
    if (!tieneMapeo) faltantes.push('Mapeo de caja no configurado');
    return {
      id: s.ID_PLANTILLA_SELLO,
      nombre: s.NOMBRE,
      completa: tienePdf && tieneMapeo,
      tienePdf,
      tieneMapeo,
      faltantes,
    };
  });

  const todasCompletas = sellos.length > 0 && detalle.every((d) => d.completa);

  return {
    todasCompletas,
    detalle,
    mensaje: construirMensaje(detalle),
  };
}
