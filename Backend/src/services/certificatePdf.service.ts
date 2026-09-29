// services/certificatePdf.service.ts
// Lógica de generación de certificados PDF desacoplada del ciclo HTTP.
// Es consumida tanto por el worker asíncrono (producción) como por rutas internas.
import { PrismaClient } from '@prisma/client';
import { composeCertificate, AreaBoxDTO, WatermarkAreaDTO } from './pdf-stamper.service.js';
import { getObjectBuffer, uploadBuffer } from '../lib/minioClient.js';
import type { CertificateComposeJobData } from '../lib/queue/queue.js';

const GENERATED_PREFIX = 'certificados-generados/';

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

/** Resuelve una referencia (S3/MinIO key o URL) a bytes binarios del PDF. */
export async function resolvePdfBuffer(keyOrUrl: string): Promise<Uint8Array> {
  if (isHttpUrl(keyOrUrl)) {
    const response = await fetch(keyOrUrl);
    if (!response.ok) {
      throw new Error(`No se pudo descargar el PDF desde la URL (HTTP ${response.status})`);
    }
    return new Uint8Array(await response.arrayBuffer());
  }
  return getObjectBuffer(keyOrUrl);
}

/** Determina si un tipo de servicio corresponde a una calibración acreditada. */
export function esAcreditado(tipoServicio?: string | null): boolean {
  if (!tipoServicio) return false;
  const t = tipoServicio.trim().toUpperCase();
  return t.includes('ACREDITAD') && !t.includes('NO ACREDITAD');
}

/**
 * Infiere la plantilla de sello a usar evaluando el `tipo_servicio` del detalle.
 * La selección se hace por convención sobre `plantillas_sellos.NOMBRE`
 * (contiene "ACREDITADO" vs "NO ACREDITADO").
 */
export async function inferirPlantillaSello(
  prisma: PrismaClient,
  tipoServicio?: string | null
) {
  const acreditado = esAcreditado(tipoServicio);
  const candidatos = await prisma.plantillas_sellos.findMany({
    orderBy: { ID_PLANTILLA_SELLO: 'asc' },
  });

  const match = candidatos.find((p) => {
    const n = (p.NOMBRE || '').toUpperCase();
    const esNoAcreditado = n.includes('NO ACREDITAD');
    return acreditado ? n.includes('ACREDITAD') && !esNoAcreditado : esNoAcreditado;
  });

  return match ?? candidatos[0] ?? null;
}

/** Compila plantilla + documento y sube el PDF resultante a MinIO. */
export async function composeCertificateToMinio(data: CertificateComposeJobData) {
  const [templateBuffer, documentBuffer] = await Promise.all([
    resolvePdfBuffer(data.templatePdfKeyOrUrl),
    resolvePdfBuffer(data.documentPdfKeyOrUrl),
  ]);

  const result = await composeCertificate({
    templateBytes: templateBuffer,
    documentBytes: documentBuffer,
    layout: {
      documentArea: data.documentArea,
      watermarkAreas: data.watermarkAreas ?? [],
      pageRange: data.pageRange,
      documentOpacity: 0.88,
    },
  });

  const outputName = data.outputName || `certificado_${Date.now()}.pdf`;
  const outputKey = `${GENERATED_PREFIX}${Date.now()}_${outputName}`;
  await uploadBuffer(outputKey, Buffer.from(result.bytes), 'application/pdf', {
    originalName: outputName,
  });

  return { outputKey, pageCount: result.pageCount, pages: result.pages };
}

/**
 * Genera el certificado final sellado de un registro `certificados`.
 * Resuelve la plantilla (explícita o inferida por `tipo_servicio`), compila
 * con el documento subido por el técnico y versiona el documento resultante.
 */
export async function generarCertificadoFinal(
  prisma: PrismaClient,
  certificadoId: number,
  selloId?: number,
  usuarioId?: number
) {
  const cert = await prisma.certificados.findUnique({
    where: { ID_CERTIFICADO: certificadoId },
    include: {
      documentos: true,
      calibraciones: {
        include: {
          recepcion_equipo_detalles: {
            include: {
              recepciones_equipo: {
                include: { ordenes_trabajo: true },
              },
            },
          },
        },
      },
    },
  });

  if (!cert) throw new Error(`Certificado ${certificadoId} no encontrado`);
  if (!cert.documentos?.RUTA_URL) {
    throw new Error(`El certificado ${certificadoId} no tiene documento de entrada`);
  }

  const detalle = cert.calibraciones?.recepcion_equipo_detalles;
  const ot = detalle?.recepciones_equipo?.ordenes_trabajo;

  let tipoServicio: string | null = null;
  if (ot && detalle) {
    const otDetalle = await prisma.orden_trabajo_detalles.findFirst({
      where: {
        ID_ORDEN_TRABAJO_FK: ot.ID_ORDEN_TRABAJO,
        INSTRUMENTO: detalle.INSTRUMENTO,
      },
    });
    tipoServicio = otDetalle?.TIPO_SERVICIO ?? null;
  }

  const plantilla = selloId
    ? await prisma.plantillas_sellos.findUnique({ where: { ID_PLANTILLA_SELLO: selloId } })
    : await inferirPlantillaSello(prisma, tipoServicio);

  if (!plantilla || !plantilla.TEMPLATE_PDF_KEY) {
    // Sin plantilla configurada no se puede sellar; se conserva el documento original.
    return {
      outputKey: cert.documentos.RUTA_URL,
      selloId: null,
      skipped: true,
      motivo: 'No hay plantilla de sello configurada',
    };
  }

  const documentArea = (plantilla.DOCUMENT_AREA as unknown as AreaBoxDTO) ?? {
    x: 0,
    y: 0,
    width: 100,
    height: 100,
  };
  const watermarkAreas = ((plantilla.WATERMARK_AREAS as unknown as WatermarkAreaDTO[]) ?? []).filter(
    (wm) => wm && wm.box && wm.box.width > 0 && wm.box.height > 0
  );

  const [templateBuffer, documentBuffer] = await Promise.all([
    resolvePdfBuffer(plantilla.TEMPLATE_PDF_KEY),
    resolvePdfBuffer(cert.documentos.RUTA_URL),
  ]);

  const result = await composeCertificate({
    templateBytes: templateBuffer,
    documentBytes: documentBuffer,
    layout: { documentArea, watermarkAreas, documentOpacity: 0.88 },
  });

  const outputName = `${cert.CODIGO_CERTIFICADO}.pdf`;
  const outputKey = `${GENERATED_PREFIX}${outputName}`;
  await uploadBuffer(outputKey, Buffer.from(result.bytes), 'application/pdf', {
    originalName: outputName,
  });

  const resolvedUser = usuarioId ?? cert.ID_REVISOR_FK ?? 1;

  await prisma.$transaction(async (tx) => {
    await tx.documentos.update({
      where: { ID_DOCUMENTO: cert.ID_DOCUMENTO_FK },
      data: { RUTA_URL: outputKey, MIME_TYPE: 'application/pdf', PROVEEDOR: 'AWS_S3' },
    });

    const last = await tx.version_documentos.findFirst({
      where: { ID_DOCUMENTO_FK: cert.ID_DOCUMENTO_FK },
      orderBy: { VERSION: 'desc' },
    });

    await tx.version_documentos.create({
      data: {
        ID_DOCUMENTO_FK: cert.ID_DOCUMENTO_FK,
        VERSION: (last?.VERSION ?? 0) + 1,
        RUTA_URL: outputKey,
        usuario_fk: resolvedUser,
        content_json: { pdf: outputKey, selloId: plantilla.ID_PLANTILLA_SELLO },
      },
    });

    await tx.certificados.update({
      where: { ID_CERTIFICADO: certificadoId },
      data: { ID_PLANTILLA_SELLO_FK: plantilla.ID_PLANTILLA_SELLO },
    });
  });

  return {
    outputKey,
    selloId: plantilla.ID_PLANTILLA_SELLO,
    acreditado: esAcreditado(tipoServicio),
    skipped: false,
  };
}
