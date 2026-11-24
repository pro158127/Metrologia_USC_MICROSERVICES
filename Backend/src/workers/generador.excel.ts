import type { GeneracionExcelJob } from '../services/generacion-pendiente.service.js';
import { diasVigenciaCotizacion, inicioVigenciaCotizacion, fechaVencimientoCotizacion } from '../services/vigencia-cotizacion.service.js';
import { resolverPlantillaOperativa } from '../services/plantillas-readiness.service.js';
import { Prisma, PrismaClient } from '@prisma/client';
import exceljs from 'exceljs';
import { Job, UnrecoverableError } from 'bullmq';
import { esPdfGenerado, nombreArchivoDocumento, prefijosDocumentoGenerado } from '../services/documento-generado.service.js';
import { GenerarExcelBody, MappingConfig, mappingConfigSchema } from '../routes/plantillas-generacion.schemas.js';
import { s3Client, BUCKET_NAME } from '../lib/s3Client.js';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import { promisify } from 'util';
import { firmarTokenAprobacion } from '../lib/approval-token.js';
import { PDFDocument } from 'pdf-lib';
import { hidratarFormatoOperativo } from '../services/render-documento-operativo.service.js';
import { createRequire } from 'node:module';

type LibreOfficeConvert = {
  convert: (
    document: Buffer,
    format: string,
    filter: string | undefined,
    callback: (error: NodeJS.ErrnoException | null, result: Buffer) => void,
  ) => void;
};

// El paquete publica una definición ambient incorrecta para ESM. Se carga su
// entrada CommonJS real y se tipa únicamente la función que usa este worker.
const { convert } = createRequire(import.meta.url)('libreoffice-convert') as LibreOfficeConvert;
  
const prisma = new PrismaClient();

async function limitarPdfAPaginas(pdfBuffer: Buffer, maxPaginas: number): Promise<Buffer> {
  try {
    const pdfDoc = await PDFDocument.load(pdfBuffer as any);
    const total = pdfDoc.getPageCount();
    for (let i = total - 1; i >= maxPaginas; i--) {
      pdfDoc.removePage(i);
    }
    return Buffer.from(await pdfDoc.save());
  } catch (e) {
    console.warn('[generador_excel] No se pudo limitar el PDF, se usa el original:', e);
    return pdfBuffer;
  }
}

  //cotizaciones_pasrse

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}
export async function generarExcelPlantilla(job: Job<GeneracionExcelJob>) {
  const { tipo, id_registro, tipo_entry, id_job, action, force_regenerate } = job.data;

  if (tipo !== 1 && tipo !== 2 && tipo !== 3) throw new UnrecoverableError(`Tipo documental inválido: ${tipo}`);
  if (!id_job || !id_registro) throw new UnrecoverableError('Falta id_job o id_registro para generar el documento.');
  const anterior = await prisma.quote.findUnique({ where: { id: id_job }, select: { status: true } });
  if (anterior?.status === 'COMPLETED') return { exito: false };
  const prefix = prefijosDocumentoGenerado[tipo];
  const fkDocumento = tipo === 1 ? { ID_COTIZACION_FK: id_registro }
    : tipo === 2 ? { ID_ORDEN_TRABAJO_FK: id_registro }
    : { ID_RECEPCION_FK: id_registro };
  const buscarDocumentos = (tx: Prisma.TransactionClient) => tx.documentos.findMany({
    where: { ...fkDocumento, ordenPagoId: null, certificado: null },
    include: {
      version_documentos: { orderBy: [{ VERSION: 'desc' }, { ID_VERSION: 'desc' }] },
    },
    orderBy: { ID_DOCUMENTO: 'desc' },
  });

  let mappingConfig = {} as MappingConfig;
  let s3TemplateKey = '';
  let idVersionPlantilla: number;
  let cotizacion: any = null;
  let ordenTrabajo: any = null;
  let recepcion: any = null;
  let codigoDocumento = "";
  let solicitudCreadaEn = new Date(0);
  let ultimaVersion: Awaited<ReturnType<typeof buscarDocumentos>>[number]["version_documentos"][number] | undefined;

  // ====================================================================
  // 1. LECTURA DE BASE DE DATOS (Con consulta de documentos previos)
  // ====================================================================
  await prisma.$transaction(async (tx) => {
    const { rutaPlantilla, mapeoPlantilla, idVersionPlantilla: versionFijada } = job.data;
    if (versionFijada && rutaPlantilla && mapeoPlantilla) {
      idVersionPlantilla = versionFijada;
      mappingConfig = mappingConfigSchema.parse(mapeoPlantilla);
      s3TemplateKey = rutaPlantilla;
    } else {
      const version = await resolverPlantillaOperativa(tx, tipo, { versionId: versionFijada });
      idVersionPlantilla = version.ID_VERSION_PLANTILLA;
      mappingConfig = mappingConfigSchema.parse(version.MAPPING_CONFIG);
      s3TemplateKey = version.documentos.RUTA_URL;
    }

    const seguimiento = await tx.quote.updateMany({ data: { status: 'PROCESSING' }, where: { id: id_job } });
    if (seguimiento.count === 0) {
      throw new UnrecoverableError(`No existe el registro Quote ${id_job} para el tipo ${tipo}, registro ${id_registro}.`);
    }

    const solicitud = await tx.quote.findUniqueOrThrow({ where: { id: id_job }, select: { createdAt: true } });
    solicitudCreadaEn = solicitud.createdAt;

    if (tipo === 1) {
      cotizacion = await tx.cotizaciones.findFirst({ where: { ID_COTIZACION: Number(id_registro) }, include: { cotizacion_detalles: { where: { activacion: true } }, clientes: true, ordenes_trabajo: { where: { VIGENTE: true }, orderBy: { ID_ORDEN_TRABAJO: 'asc' } } } });
    }
    if (tipo === 2) {
      ordenTrabajo = await tx.ordenes_trabajo.findFirst({ where: { ID_ORDEN_TRABAJO: Number(id_registro) }, include: { cotizaciones: { select: { CODIGO_COTIZACION: true } }, orden_trabajo_detalles: { where: { OR: [{ activacion: true }, { activacion: null }] } }, clientes: true } });
    }
    if (tipo === 3) {
      recepcion = await tx.recepciones_equipo.findFirst({
        where: { ID_RECEPCION: Number(id_registro) },
        include: {
          recepcion_equipo_detalles: {
            where: { OR: [{ activacion: true }, { activacion: null }] },
            orderBy: { ITEM: 'asc' },
          },
          cotizaciones: true,
          ordenes_trabajo: {
            include: {
              orden_trabajo_detalles: {
                where: { OR: [{ activacion: true }, { activacion: null }] },
                orderBy: { ITEM: 'asc' },
                include: { usuarios: { select: { NOMBRE_COMPLETO: true } } },
              },
            },
          },
        },
      });
    }

    codigoDocumento = cotizacion?.CODIGO_COTIZACION ?? ordenTrabajo?.CODIGO_OT ?? recepcion?.CODIGO_RECEPCION;
    if (tipo_entry === 'prod' && job.data.codigo_actual && job.data.codigo_actual !== codigoDocumento) {
      throw new UnrecoverableError(`La revisión solicitada ${job.data.codigo_actual} fue sustituida por ${codigoDocumento}.`);
    }
    if (tipo_entry === 'prod' && (ordenTrabajo?.VIGENTE === false || recepcion?.VIGENTE === false || recepcion?.activacion === false)) {
      throw new UnrecoverableError('La revisión fue sustituida porque el grupo dejó de estar vigente.');
    }
    if (job.data.estadoCotizacion && cotizacion?.ESTADO !== job.data.estadoCotizacion) {
      throw new UnrecoverableError('La revisión fue sustituida por un cambio de estado de la cotización.');
    }
    if (!codigoDocumento) throw new UnrecoverableError(`El registro ${id_registro} de tipo ${tipo} no tiene código.`);

    if (tipo_entry === 'prod') {
      const documentos = await buscarDocumentos(tx);
      ultimaVersion = documentos.flatMap((doc) => doc.version_documentos)
        .filter((version) => esPdfGenerado(version.RUTA_URL, tipo, codigoDocumento) &&
          nombreArchivoDocumento(version.RUTA_URL) === `${codigoDocumento}.pdf` &&
          (version.content_json as { idVersionPlantilla?: number } | null)?.idVersionPlantilla === idVersionPlantilla)
        .sort((a, b) => b.CREATED_AT.getTime() - a.CREATED_AT.getTime() || b.ID_VERSION - a.ID_VERSION)[0];
    }
  }); 

  // ====================================================================
  // 2. ARMADO DE DATOS PARA EL CORREO (Se necesita siempre, genere o no genere)
  // ====================================================================
  let datosPlantillaCorreo = null;
  let recordUpdatedAt: Date | null = null;

  if (tipo === 1 && cotizacion) {
    recordUpdatedAt = cotizacion.UPDATED_AT || cotizacion.CREATED_AT;
    const totalCalculado = Number(cotizacion.MONTO_TOTAL || 0);
    const fechaEmisionStr = cotizacion.CREATED_AT.toLocaleDateString('es-CO');
    const fechaVencimientoObj = fechaVencimientoCotizacion(await inicioVigenciaCotizacion(prisma, cotizacion), await diasVigenciaCotizacion(prisma));
    const totalEquipos = cotizacion.cotizacion_detalles?.reduce((acc: number, item: any) => acc + (item.CANTIDAD || 0), 0) || 0;
    const ordenes = (cotizacion.ordenes_trabajo ?? []) as Array<{ ID_ORDEN_TRABAJO: number; ID_OT_PADRE_FK: number | null; CODIGO_OT: string }>;
    const idsMaestras = new Set(ordenes.map((orden) => orden.ID_OT_PADRE_FK));
    const codigoOT = (ordenes.find((orden) => idsMaestras.has(orden.ID_ORDEN_TRABAJO)) ?? ordenes[0])?.CODIGO_OT ??
      'Pendiente de asignación';
    const segundosRestantes = Math.max(0, Math.ceil((fechaVencimientoObj.getTime() - Date.now()) / 1000));
    const tokenAprobacion = firmarTokenAprobacion(cotizacion.ID_COTIZACION, segundosRestantes, cotizacion.CODIGO_COTIZACION);
    const basePublica = (process.env.FRONTEND_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000').replace(/\/$/, '');

    datosPlantillaCorreo = {
      nombreCliente: cotizacion.clientes?.NOMBRE_CONTACTO || cotizacion.clientes?.RAZON_SOCIAL || 'Cliente',
      numeroCotizacion: cotizacion.CODIGO_COTIZACION,
      fechaEmision: fechaEmisionStr,
      fechaVencimiento: fechaVencimientoObj.toLocaleDateString('es-CO', { timeZone: 'America/Bogota' }),
      valorTotal: new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(totalCalculado),
      linkAprobacion: `${basePublica}/api/v1/cotizaciones/aprobar?token=${tokenAprobacion}`,
      emailDestino: cotizacion.clientes?.CORREO,
      cantidadEquipos: totalEquipos,
      numeroOT: codigoOT
    };
  }

  if (tipo === 2 && ordenTrabajo) {
    recordUpdatedAt = ordenTrabajo.UPDATED_AT || ordenTrabajo.CREATED_AT; // o la fecha correspondiente en tu modelo
    datosPlantillaCorreo = {
      emailDestino: ordenTrabajo.clientes?.CORREO, 
      nombreCliente: ordenTrabajo.clientes?.NOMBRE_CONTACTO || ordenTrabajo.clientes?.RAZON_SOCIAL,
      numeroOT: ordenTrabajo.CODIGO_OT,
      numeroCotizacion: ordenTrabajo.cotizaciones?.CODIGO_COTIZACION ?? ordenTrabajo.no_cotizacion,
      idOtPadre: ordenTrabajo.ID_OT_PADRE_FK,
    };
  }

  if (tipo === 3 && recepcion) {
    recordUpdatedAt = recepcion.UPDATED_AT || recepcion.CREATED_AT;
  }

  // ====================================================================
  // 🔥 3. LÓGICA DE BYPASS (OMITIR GENERACIÓN SI ESTÁ AL DÍA)
  // ====================================================================
  if (ultimaVersion && recordUpdatedAt && !force_regenerate) {
    // Tomamos las fechas en milisegundos para comparar
    // Adaptado para createdAt o created_at según como lo llame Prisma
    const fechaUltimoPdf = ultimaVersion.CREATED_AT.getTime();
    const fechaUltimaEdicion = new Date(recordUpdatedAt).getTime();

    // Si el PDF se generó DESPUÉS o en el mismo instante de la última edición de los datos
    if (fechaUltimoPdf >= fechaUltimaEdicion) {
      console.log(`[generador_excel] ⚡ BYPASS ACTIVADO: El documento Tipo ${tipo} está en su última versión. Extrayendo URLs directas...`);
      
      const contentJson = typeof ultimaVersion.content_json === 'string' 
        ? JSON.parse(ultimaVersion.content_json) 
        : ultimaVersion.content_json;
      const excel = (contentJson as { excel?: string } | null)?.excel ?? null;
      const urls = { excel, url_pdf: ultimaVersion.RUTA_URL };

      await prisma.$transaction(async (tx) => {
        if (tipo_entry === 'prod' && tipo === 1) {
          const [vigente] = await tx.$queryRaw<{ codigo: string; estado: string }[]>
            `SELECT "CODIGO_COTIZACION" AS codigo, "ESTADO"::text AS estado
              FROM cotizaciones WHERE "ID_COTIZACION" = ${id_registro} FOR UPDATE`;
          if (vigente?.codigo !== codigoDocumento || vigente.estado !== cotizacion?.ESTADO) {
            throw new UnrecoverableError('La cotización cambió antes de reutilizar el documento.');
          }
        }
        await completarGeneracionDocumental(tx, job.data, cotizacion?.ESTADO ?? null, datosPlantillaCorreo, urls);
      });

      // Retornamos instantáneamente, sin procesar nada más
      return {
        exito: true,
        tipo_documento: tipo,
        estado: cotizacion?.ESTADO || null,
        id_registro: id_registro,
        url_pdf: urls.url_pdf,
        url_excel: urls.excel,
        datos_correo: datosPlantillaCorreo,
        action: action
      };
    }
  }

  // ====================================================================
  // 4. GENERACIÓN OBLIGATORIA (S3 -> ExcelJS -> LibreOffice -> S3)
  // ====================================================================
  // Solo llegará a esta línea si NO hay documento previo o si los datos son más recientes que el PDF.
  console.log(`[generador_excel] ⚙️ PROCESANDO: Datos nuevos detectados. Generando documento Tipo ${tipo}...`);

  const comaand = new GetObjectCommand({ Bucket: BUCKET_NAME, Key: s3TemplateKey });
  const s3Response = await s3Client.send(comaand);
  if (!s3Response.Body) throw new Error(`Archivo vacío en MinIO para la versión ${tipo}`);

  const buffer = await streamToBuffer(s3Response.Body as Readable);
  const workbook = new exceljs.Workbook();
  await workbook.xlsx.load(buffer as any);

  hidratarFormatoOperativo(workbook, tipo, cotizacion ?? ordenTrabajo ?? recepcion, mappingConfig);

  workbook.eachSheet((sheet) => {
    sheet.pageSetup = {
      paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 999,
      margins: { left: 0.25, right: 0.25, top: 0.5, bottom: 0.5, header: 0.1, footer: 0.1 }
    };
    // ... limpieza de richText ...
  });

  const convertAsync = promisify(convert);
  const updatedBuffer = await workbook.xlsx.writeBuffer();
  
  const nombreBase = tipo_entry === 'prod' ? codigoDocumento : `test_${id_job}`;
  const carpeta = tipo_entry === 'prod' ? `${prefix}/${id_job}` : prefix;
  const s3Key = `${carpeta}/${nombreBase}.xlsx`;
  const s3Key_pdf = `${carpeta}/${nombreBase}.pdf`;

  const pdfBuffer = await convertAsync(Buffer.from(updatedBuffer), '.pdf', undefined);

  // 🔥 Cotización: limitar el PDF a las 2 primeras páginas.
  const pdfBufferFinal = tipo === 1
    ? await limitarPdfAPaginas(Buffer.from(pdfBuffer), 2)
    : Buffer.from(pdfBuffer);
  
  try {
    const subidas = await Promise.allSettled([
      s3Client.send(new PutObjectCommand({ Bucket: BUCKET_NAME, Key: s3Key, Body: Buffer.from(updatedBuffer), ContentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })),
      s3Client.send(new PutObjectCommand({ Bucket: BUCKET_NAME, Key: s3Key_pdf, Body: pdfBufferFinal, ContentType: 'application/pdf' }))
    ]);

    const falloSubida = subidas.find((subida) => subida.status === 'rejected');
    if (falloSubida) throw falloSubida.reason;
    const parse = { excel: s3Key, url_pdf: s3Key_pdf };

    await prisma.$transaction(async (tx) => {
      if (tipo_entry === 'prod') {
        // Serializa la publicación con otras generaciones y con las ediciones del consecutivo.
        const [actual] = tipo === 1
          ? await tx.$queryRaw<{ codigo: string; estado: string }[]>`SELECT "CODIGO_COTIZACION" AS codigo, "ESTADO"::text AS estado FROM cotizaciones WHERE "ID_COTIZACION" = ${id_registro} FOR UPDATE`
          : tipo === 2
          ? await tx.$queryRaw<{ codigo: string }[]>`SELECT "CODIGO_OT" AS codigo FROM ordenes_trabajo WHERE "ID_ORDEN_TRABAJO" = ${id_registro} AND "VIGENTE" FOR UPDATE`
          : await tx.$queryRaw<{ codigo: string }[]>`SELECT "CODIGO_RECEPCION" AS codigo FROM recepciones_equipo WHERE "ID_RECEPCION" = ${id_registro} AND "VIGENTE" AND activacion FOR UPDATE`;
        const codigo = actual?.codigo;
        if (job.data.estadoCotizacion && (!actual || !('estado' in actual) || actual.estado !== job.data.estadoCotizacion)) {
          throw new UnrecoverableError('La revisión fue sustituida por un cambio de estado antes de publicar.');
        }
        if (codigo !== codigoDocumento) {
          throw new UnrecoverableError(`El consecutivo ${codigoDocumento} cambió antes de publicar a ${codigo ?? 'registro eliminado'}.`);
        }

        const existentes = await buscarDocumentos(tx);
        const anterior = existentes.find((doc) => esPdfGenerado(doc.RUTA_URL, tipo, codigoDocumento) ||
          doc.version_documentos.some((version) => esPdfGenerado(version.RUTA_URL, tipo, codigoDocumento)));
        const ultimaPublicada = anterior?.version_documentos[0]?.content_json as { solicitudCreadaEn?: string } | null | undefined;
        if (ultimaPublicada?.solicitudCreadaEn && new Date(ultimaPublicada.solicitudCreadaEn) > solicitudCreadaEn) {
          throw new UnrecoverableError('La última publicación corresponde a un trabajo más reciente.');
        }
        if (!anterior?.version_documentos.some((version) => version.RUTA_URL === s3Key_pdf)) {
          const datos = { NOMBRE: `${nombreBase}.pdf`, RUTA_URL: s3Key_pdf, MIME_TYPE: 'application/pdf' };
          const documento = anterior
            ? await tx.documentos.update({
                where: { ID_DOCUMENTO: anterior.ID_DOCUMENTO },
                data: {
                  ...datos,
                  ID_COTIZACION_FK: tipo === 1 ? id_registro : null,
                  ID_ORDEN_TRABAJO_FK: tipo === 2 ? id_registro : null,
                  ID_RECEPCION_FK: tipo === 3 ? id_registro : null,
                  ID_PLANTILLA_FK: null,
                  ordenPagoId: null,
                },
              })
            : await tx.documentos.create({ data: { ...datos, ...fkDocumento, PROVEEDOR: 'AWS_S3' } });
          await tx.version_documentos.create({
            data: {
              ID_DOCUMENTO_FK: documento.ID_DOCUMENTO,
              VERSION: (anterior?.version_documentos[0]?.VERSION ?? 0) + 1,
              RUTA_URL: s3Key_pdf,
              usuario_fk: job.data.id_usuario || 1,
              content_json: { codigo: codigoDocumento, idVersionPlantilla: idVersionPlantilla!, solicitudCreadaEn: solicitudCreadaEn.toISOString(), excel: s3Key, pdf: s3Key_pdf },
            },
          });
        }
      }
      await completarGeneracionDocumental(tx, job.data, cotizacion?.ESTADO ?? null, datosPlantillaCorreo, parse);
    });

  } catch (error) {
    // Si el resultado del commit es incierto, conservar los objetos hasta comprobar la referencia.
    try {
      const publicado = await prisma.quote.findUnique({ where: { id: id_job }, select: { status: true } });
      if (publicado?.status !== 'COMPLETED') {
        const limpieza = await Promise.allSettled([s3Key, s3Key_pdf].map((Key) =>
          s3Client.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key }))));
        for (const resultado of limpieza) {
          if (resultado.status === 'rejected') console.warn('[generacion-documental] Falló la limpieza de un archivo parcial', resultado.reason);
        }
      }
    } catch (verificacion) {
      console.warn('[generacion-documental] No se pudo verificar el guardado; se conservaron los archivos', verificacion);
    }
    throw error;
  }

  return {
    exito: true,
    tipo_documento: tipo,
    estado: cotizacion?.ESTADO || null,
    id_registro: id_registro,
    url_pdf: s3Key_pdf,
    url_excel: s3Key,
    datos_correo: datosPlantillaCorreo,
    action: action
  };
}
import { completarGeneracionDocumental } from '../services/correo-documental.service.js';
