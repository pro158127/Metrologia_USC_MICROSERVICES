import { randomUUID } from 'node:crypto';
// services/certificatePdf.service.ts
// Lógica de generación de certificados PDF desacoplada del ciclo HTTP.
// Es consumida tanto por el worker asíncrono (producción) como por rutas internas.
import { PrismaClient } from '@prisma/client';
import {
  composeCertificate,
  AreaBoxDTO,
  WatermarkAreaDTO,
} from './pdf-stamper.service.js';
import { deleteObject, getObjectBuffer, uploadBuffer } from '../lib/minioClient.js';
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

  return match ?? null;
}

/**
 * Selecciona la plantilla de sello conectada al instrumento evaluado:
 *   - acreditado    -> ID 1 ("Sello Acreditado")
 *   - no acreditado -> ID 2 ("Sello No Acreditado")
 * Si los IDs 1/2 no existen en el entorno, se recurre a la inferencia por nombre.
 */
export async function seleccionarPlantillaSello(
  prisma: PrismaClient,
  tipoServicio?: string | null
) {
  const acreditado = esAcreditado(tipoServicio);
  const idDeseado = acreditado ? 1 : 2;

  const porId = await prisma.plantillas_sellos.findUnique({
    where: { ID_PLANTILLA_SELLO: idDeseado },
  });
  if (porId && esAcreditado(porId.NOMBRE) === acreditado) return porId;

  return inferirPlantillaSello(prisma, tipoServicio);
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
  usuarioId?: number,
  revisionEsperada?: string,
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
  const revision = cert.REVISADO_AT?.toISOString();
  if (cert.ESTADO_REVISION !== 'APROBADO' || (revisionEsperada && revision !== revisionEsperada)) {
    return { skipped: true, motivo: 'La revisión dejó de estar vigente' };
  }
  if (cert.documentos.RUTA_URL.startsWith(GENERATED_PREFIX)) {
    return { skipped: true, outputKey: cert.documentos.RUTA_URL, motivo: 'El PDF de la revisión ya está sellado' };
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
    : await seleccionarPlantillaSello(prisma, tipoServicio);

  if (!plantilla || !plantilla.TEMPLATE_PDF_KEY) {
    throw new Error('La plantilla de sello no está disponible. El certificado aún requiere sellado.');
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

  // La plantilla/sello (TEMPLATE_PDF_KEY) es la BASE y el PDF del técnico se
  // coloca dentro del documentArea (mismo método que Administración / preview-stamp).
  const [templateBuffer, documentBuffer] = await Promise.all([
    resolvePdfBuffer(plantilla.TEMPLATE_PDF_KEY),
    resolvePdfBuffer(cert.documentos.RUTA_URL),
  ]);

  const result = await composeCertificate({
    templateBytes: templateBuffer,
    documentBytes: documentBuffer,
    layout: {
      documentArea,
      watermarkAreas,
      documentOpacity: 0.88,
    },
  });

  const outputName = `${cert.CODIGO_CERTIFICADO}.pdf`;
  const outputKey = `${GENERATED_PREFIX}${randomUUID()}/${outputName}`;
  await uploadBuffer(outputKey, Buffer.from(result.bytes), 'application/pdf', {
    originalName: outputName,
  });

  const resolvedUser = usuarioId ?? cert.ID_REVISOR_FK ?? 1;

  const publicado = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "ID_CERTIFICADO" FROM certificados WHERE "ID_CERTIFICADO" = ${certificadoId} FOR UPDATE`;
    const actual = await tx.certificados.findUnique({
      where: { ID_CERTIFICADO: certificadoId },
      select: { ESTADO_REVISION: true, REVISADO_AT: true, ID_DOCUMENTO_FK: true },
    });
    if (actual?.ESTADO_REVISION !== 'APROBADO' ||
        actual.REVISADO_AT?.toISOString() !== revision ||
        actual.ID_DOCUMENTO_FK !== cert.ID_DOCUMENTO_FK) return false;
    const documento = await tx.documentos.updateMany({
      where: { ID_DOCUMENTO: cert.ID_DOCUMENTO_FK, RUTA_URL: cert.documentos.RUTA_URL },
      data: {
        RUTA_URL: outputKey,
        MIME_TYPE: 'application/pdf',
        PROVEEDOR: 'AWS_S3',
        ID_COTIZACION_FK: null,
        ID_ORDEN_TRABAJO_FK: null,
        ID_RECEPCION_FK: null,
        ID_PLANTILLA_FK: null,
        ordenPagoId: null,
      },
    });
    if (!documento.count) return false;

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
    return true;
  });
  if (!publicado) {
    await deleteObject(outputKey).catch((error) => {
      console.warn('[cert-pdf-worker] No se pudo retirar un PDF de una revisión obsoleta', { outputKey, error });
    });
    return { skipped: true, motivo: 'El documento cambió antes de publicar el sello' };
  }

  return {
    outputKey,
    selloId: plantilla.ID_PLANTILLA_SELLO,
    acreditado: esAcreditado(tipoServicio),
    skipped: false,
  };
}
