import { Prisma, type PrismaClient } from '@prisma/client';
import { readFile } from 'node:fs/promises';
import { calcularMontoTotalCotizacion } from './cotizacion-money.service.js';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { AppError } from '../lib/errors.js';
import { uploadBuffer } from '../lib/minioClient.js';
import type { FacturaPdfJob } from './generacion-pendiente.service.js';

export type DatosFacturaPdf = {
  numero: string;
  fecha: Date;
  estado: string;
  cliente: string | null;
  nit: string | null;
  direccion: string | null;
  ciudad: string | null;
  correo: string | null;
  cotizacion: string | null;
  orden: string | null;
  ordenes?: string[];
  estadoPago?: string | null;
  detalle?: {
    lineas: { descripcion: string; magnitud: string; servicio: string; cantidad: number; unitario: number; total: number }[];
    subtotal: number;
    viaticos: number;
    descuento: number;
  };
  observacion: string | null;
  valor: number;
};

export async function generarFacturaPdf(factura: DatosFacturaPdf): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Factura ${factura.numero}`);
  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  const negrita = await pdf.embedFont(StandardFonts.HelveticaBold);
  const logo = await pdf.embedJpg(await readFile(new URL('../../src/templates/logo-universidad-usc.jpg', import.meta.url)));
  const azul = rgb(0.08, 0.18, 0.34);
  const gris = rgb(0.29, 0.35, 0.43);
  const margen = 46;
  const ancho = 612;
  let pagina = pdf.addPage([ancho, 792]);
  let y = 0;

  function encabezado() {
    pagina.drawRectangle({ x: 0, y: 682, width: ancho, height: 110, color: azul });
    pagina.drawImage(logo, { x: ancho - margen - 65, y: 705, width: 65, height: 65 });
    pagina.drawText('UNIVERSIDAD SANTIAGO DE CALI', { x: margen, y: 753, size: 10, font: negrita, color: rgb(0.85, 0.90, 1) });
    pagina.drawText('Laboratorio de Metrología', { x: margen, y: 736, size: 10, font: normal, color: rgb(0.85, 0.90, 1) });
    pagina.drawText('Factura de servicios', { x: margen, y: 702, size: 26, font: negrita, color: rgb(1, 1, 1) });
    y = 645;
  }

  function asegurarEspacio(alto: number) {
    if (y - alto >= 60) return;
    pagina = pdf.addPage([ancho, 792]);
    encabezado();
  }

  function lineasValor(valor: string | null | undefined, anchoColumna: number) {
    const texto = [...(valor?.trim() || 'Sin registro')].map((caracter) => {
      if (/\s/u.test(caracter)) return caracter === '\n' ? '\n' : ' ';
      try {
        normal.encodeText(caracter);
        return caracter;
      } catch {
        return '?';
      }
    }).join('');
    return texto.split('\n').flatMap((parrafo) => {
      const resultado: string[] = [];
      let linea = '';
      for (const caracter of parrafo) {
        if (normal.widthOfTextAtSize(linea + caracter, 11) > anchoColumna) {
          const corte = linea.lastIndexOf(' ');
          resultado.push(corte > 0 ? linea.slice(0, corte) : linea);
          linea = corte > 0 ? linea.slice(corte + 1) : '';
        }
        linea += caracter;
      }
      resultado.push(linea);
      return resultado;
    });
  }

  function filaDatos(...campos: [string, string | null | undefined][]) {
    const separacion = 18;
    const anchoColumna = (ancho - margen * 2 - separacion * (campos.length - 1)) / campos.length;
    const columnas = campos.map(([etiqueta, valor], indice) => ({
      etiqueta, lineas: lineasValor(valor, anchoColumna), x: margen + indice * (anchoColumna + separacion),
    }));
    const cantidad = Math.max(...columnas.map(({ lineas }) => lineas.length));
    asegurarEspacio(Math.min(540, 16 + 15 * cantidad));
    for (const { etiqueta, x } of columnas) {
      pagina.drawText(etiqueta, { x, y, size: 9, font: negrita, color: gris });
    }
    y -= 16;
    for (let indice = 0; indice < cantidad; indice++) {
      asegurarEspacio(15);
      for (const { lineas, x } of columnas) {
        if (lineas[indice]) pagina.drawText(lineas[indice], { x, y, size: 11, font: normal, color: azul });
      }
      y -= 15;
    }
    y -= 7;
  }

  const campo = (etiqueta: string, valor?: string | null) => filaDatos([etiqueta, valor]);

  function seccion(titulo: string) {
    asegurarEspacio(62);
    pagina.drawRectangle({ x: margen, y: y - 6, width: ancho - margen * 2, height: 22, color: rgb(0.92, 0.95, 0.99) });
    pagina.drawText(titulo, { x: margen + 8, y: y + 1, size: 10, font: negrita, color: azul });
    y -= 25;
  }

  const formatoImporte = new Intl.NumberFormat('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const moneda = (valor: number) => `COP $${formatoImporte.format(valor)}`;
  encabezado();
  seccion('Identificación de la factura');
  filaDatos(['Número de factura', factura.numero], ['Fecha de emisión',
    new Intl.DateTimeFormat('es-CO', { dateStyle: 'long', timeZone: 'America/Bogota' }).format(factura.fecha)],
    ['Estado de la factura', factura.estado]);
  seccion('Datos de facturación del cliente');
  filaDatos(['Razón social o nombre', factura.cliente], ['NIT o identificación', factura.nit]);
  filaDatos(['Dirección y ciudad', [factura.direccion, factura.ciudad].filter(Boolean).join(', ')],
    ['Correo de facturación', factura.correo]);
  seccion('Referencias del servicio');
  const ordenes = factura.ordenes?.length ? factura.ordenes : factura.orden ? [factura.orden] : [];
  filaDatos(['Cotización asociada', factura.cotizacion], ['Órdenes de trabajo asociadas', ordenes.join(', ')],
    ['Estado del pago', factura.estadoPago]);
  if (factura.detalle?.lineas.length) {
    seccion('Detalle de los servicios facturados');
    for (const [indice, linea] of factura.detalle.lineas.entries()) {
      campo(`Servicio ${indice + 1}`, [
        linea.descripcion,
        [linea.magnitud, linea.servicio].filter(Boolean).join(' | '),
        `Cantidad ${linea.cantidad}  |  Unitario ${moneda(linea.unitario)}  |  Importe ${moneda(linea.total)}`,
      ].join('\n'));
    }
    seccion('Liquidación en pesos colombianos');
    filaDatos(['Subtotal de servicios', moneda(factura.detalle.subtotal)], ['Viáticos', moneda(factura.detalle.viaticos)],
      ['Descuento aplicado', `${factura.detalle.descuento}%`]);
  }
  asegurarEspacio(62);
  pagina.drawRectangle({ x: margen, y: y - 42, width: ancho - margen * 2, height: 58, color: rgb(0.92, 0.95, 0.99) });
  pagina.drawText('TOTAL FACTURADO', { x: margen + 14, y: y - 3, size: 9, font: negrita, color: gris });
  pagina.drawText(moneda(factura.valor), { x: margen + 14, y: y - 28, size: 19, font: negrita, color: azul });
  y -= 66;
  if (factura.observacion) campo('Observaciones', factura.observacion);

  const paginas = pdf.getPages();
  paginas.forEach((hoja, indice) => hoja.drawText(`Página ${indice + 1} de ${paginas.length}`, {
    x: margen, y: 30, size: 9, font: normal, color: gris,
  }));
  return Buffer.from(await pdf.save());
}

export async function publicarPdfFactura(prisma: PrismaClient, job: FacturaPdfJob) {
  const factura = await prisma.facturas.findUnique({
    where: { ID_FACTURA: job.id_registro },
    include: { clientes: true, documentos: true, ordenes_trabajo: { include: {
      cotizaciones: { select: {
        CODIGO_COTIZACION: true, viaticos: true, descuento: true,
        ordenes_trabajo: { where: { VIGENTE: true }, orderBy: { ID_ORDEN_TRABAJO: 'asc' }, select: { CODIGO_OT: true } },
        cotizacion_detalles: { where: { activacion: true }, orderBy: { ID_DETALLE: 'asc' } },
      } },
    } } },
  });
  if (!factura) throw new AppError(404, 'Factura no encontrada.');
  const orden = factura.ordenes_trabajo;
  const cliente = factura.clientes;
  const cotizacion = orden?.cotizaciones;
  const referencias = [
    ...(orden ? [orden.CODIGO_OT] : []),
    ...(cotizacion?.ordenes_trabajo.map((ot) => ot.CODIGO_OT) ?? []),
  ];
  const lineas = cotizacion?.cotizacion_detalles ?? [];
  const subtotal = lineas.reduce((acumulado, linea) => acumulado.plus(linea.VALOR_TOTAL), new Prisma.Decimal(0));
  const viaticos = Number(cotizacion?.viaticos ?? 0);
  const descuento = cotizacion?.descuento ?? 0;
  // La cotización vigente puede haberse versionado después de la emisión.
  const coincideEmision = cotizacion && factura.NUMERO_FACTURA === `FAC-${cotizacion.CODIGO_COTIZACION}` &&
    calcularMontoTotalCotizacion(subtotal, viaticos, descuento).eq(factura.VALOR);
  const detalle = coincideEmision && lineas.length ? {
    subtotal: Number(subtotal), viaticos, descuento,
    lineas: lineas.map((linea) => ({
      descripcion: linea.EQUIPO_DESCRIPCION, magnitud: linea.MAGNITUD, servicio: linea.TIPO_SERVICIO,
      cantidad: linea.CANTIDAD, unitario: Number(linea.VALOR_UNITARIO), total: Number(linea.VALOR_TOTAL),
    })),
  } : undefined;

  const nombre = `${factura.NUMERO_FACTURA.replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`;
  const ruta = `facturas/${factura.ID_FACTURA}/${nombre}`;
  const buffer = factura.ID_DOCUMENTO_FK ? null : await generarFacturaPdf({
    numero: factura.NUMERO_FACTURA, fecha: factura.FECHA, estado: factura.ESTADO,
    cliente: cliente?.RAZON_SOCIAL ?? orden?.Razon_social ?? null,
    nit: cliente?.NIT ?? orden?.NIT ?? null,
    direccion: cliente?.dirrecion ?? orden?.dirrecion ?? null,
    ciudad: cliente?.ciudad ?? orden?.ciudad ?? null,
    correo: orden?.CORREO_FACTURA ?? cliente?.CORREO ?? null,
    cotizacion: orden?.cotizaciones?.CODIGO_COTIZACION ?? null,
    orden: orden?.CODIGO_OT ?? null, ordenes: [...new Set(referencias)], estadoPago: orden?.estado_pago,
    detalle,
    observacion: factura.OBSERVACION, valor: Number(factura.VALOR),
  });

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "ID_FACTURA" FROM facturas WHERE "ID_FACTURA" = ${factura.ID_FACTURA} FOR UPDATE`;
    const actual = await tx.facturas.findUniqueOrThrow({
      where: { ID_FACTURA: factura.ID_FACTURA },
      select: { documentos: { select: { ID_DOCUMENTO: true, RUTA_URL: true } } },
    });
    let documento = actual.documentos;
    if (!documento) {
      if (!buffer) throw new Error('El documento vinculado cambió durante la publicación.');
      await uploadBuffer(ruta, buffer, 'application/pdf', { originalName: nombre });
      documento = await tx.documentos.create({ data: {
        NOMBRE: nombre, RUTA_URL: ruta, MIME_TYPE: 'application/pdf', PROVEEDOR: 'AWS_S3',
      } });
      await tx.facturas.update({
        where: { ID_FACTURA: factura.ID_FACTURA }, data: { ID_DOCUMENTO_FK: documento.ID_DOCUMENTO },
      });
    }
    await tx.quote.update({
      where: { id: job.id_job },
      data: { status: 'COMPLETED', fileUrl: documento.RUTA_URL, data: { idFactura: factura.ID_FACTURA } },
    });
    return { url_pdf: documento.RUTA_URL };
  }, { timeout: 30_000 });
}
