import { FastifyInstance } from 'fastify';

// Contratos camelCase que consume el frontend (mismo shape que los modelos del frontend).

interface ClienteDTO {
  idCliente: number;
  nitCedula: string;
  razonSocial: string;
  correo: string;
  nombreContacto: string | null;
  telefono: string | null;
  observacion: string | null;
  idRutDocumento: number | null;
  status: string;
  createat: string | Date;
  dirrecion: string;
  updatedAt: string | Date;
  ciudad: string | null;
  tipoCliente: string;
}

interface OrdenTrabajoDTO {
  idOrdenTrabajo: number;
  codigo: string;
  idCotizacion: number | null;
  idCliente: number | null;
  correoCertificado: string | null;
  correoFactura: string | null;
  fechaLimiteFacturacion: string | Date | null;
  NIT: string | null;
  dirrecion: string | null;
  ciudad: string | null;
  esInternoUSC: boolean | null;
  esEnSitio: boolean | null;
  esLabPermanente: boolean | null;
  personaContacto: string | null;
  telefonoContacto: string | null;
  fechaCalibracion: string | Date | null;
  hora: string | Date | null;
  Razon_social: string | null;
  dirrecion_solcitante: string | null;
  personaContacto_solicitante: string | null;
  ciudad_solcitante: string | null;
  NIT_solicitante: string | null;
  telefonoContacto_solcitante: string | null;
  no_orden_trabajo: string | null;
  no_cotizacion: string | null;
  responsable: string | null;
  fecha_dilgenciamento: string | Date | null;
  requireAnexo: boolean | null;
  observaciones: string | null;
  estado: string | null;
  estadoRevision: string | null;
  motivoRechazo: string | null;
  createdAt: string | Date | null;
  estado_pago: string | null;
  alertamessag: string | null;
  cliente: ClienteDTO | null;
}

interface FacturaDTO {
  idFactura: number;
  numero: string;
  idOrdenTrabajo: number | null;
  idCliente: number | null;
  fecha: string | Date;
  valor: number;
  estado: string;
  observacion: string | null;
  ordenTrabajo: OrdenTrabajoDTO | null;
  cliente: ClienteDTO | null;
}

// Mapea la fila cruda (nombres de columna reales de la DB) al contrato camelCase del frontend.
function serializeCliente(row: Record<string, any>): ClienteDTO {
  return {
    idCliente: row.ID_CLIENTE,
    nitCedula: row.NIT,
    razonSocial: row.RAZON_SOCIAL,
    correo: row.CORREO,
    nombreContacto: row.NOMBRE_CONTACTO ?? null,
    telefono: row.TELEFONO ?? null,
    observacion: row.OBSERVACION ?? null,
    idRutDocumento: row.ID_RUT_DOCUMENTO_FK ?? null,
    status: row.status,
    createat: row.createat,
    dirrecion: row.dirrecion,
    updatedAt: row.updatedAt,
    ciudad: row.ciudad ?? null,
    tipoCliente: row.TIPO_CLIENTE,
  };
}

function serializeOrdenTrabajo(row: Record<string, any>): OrdenTrabajoDTO {
  return {
    idOrdenTrabajo: row.ID_ORDEN_TRABAJO,
    codigo: row.CODIGO_OT,
    idCotizacion: row.ID_COTIZACION_FK ?? null,
    idCliente: row.ID_CLIENTE_FK ?? null,
    correoCertificado: row.CORREO_CERTIFICADO ?? null,
    correoFactura: row.CORREO_FACTURA ?? null,
    fechaLimiteFacturacion: row.FECHA_LIMITE_FACTURACION ?? null,
    NIT: row.NIT ?? null,
    dirrecion: row.dirrecion ?? null,
    ciudad: row.ciudad ?? null,
    esInternoUSC: row.ES_INTERNO_USC ?? null,
    esEnSitio: row.ES_EN_SITIO ?? null,
    esLabPermanente: row.ES_LAB_PERMANENTE ?? null,
    personaContacto: row.PERSONA_CONTACTO ?? null,
    telefonoContacto: row.TELEFONO_CONTACTO ?? null,
    fechaCalibracion: row.FECHA_CALIBRACION ?? null,
    hora: row.hora ?? null,
    Razon_social: row.Razon_social ?? null,
    dirrecion_solcitante: row.dirrecion_solcitante ?? null,
    personaContacto_solicitante: row.PERSONA_CONTACT_SOLCITANTE ?? null,
    ciudad_solcitante: row.ciudad_solcitante ?? null,
    NIT_solicitante: row.NIT_solicitante ?? null,
    telefonoContacto_solcitante: row.TELEFONO_CONTACTO_SOLICITANTE ?? null,
    no_orden_trabajo: row.no_orden_trabajo ?? null,
    no_cotizacion: row.no_cotizacion ?? null,
    responsable: row.RESPONSABLE ?? null,
    fecha_dilgenciamento: row.FECHA_CALIBRACION_DILIGENCIAMENTO ?? null,
    requireAnexo: row.REQUIERE_ANEXO ?? null,
    observaciones: row.OBSERVACIONES ?? null,
    estado: row.estado ?? null,
    estadoRevision: row.ESTADO_REVISION ?? null,
    motivoRechazo: row.MOTIVO_RECHAZO ?? null,
    createdAt: row.CREATED_AT ?? null,
    estado_pago: row.estado_pago ?? null,
    alertamessag: row.alertamessag ?? null,
    cliente: row.clientes ? serializeCliente(row.clientes) : null,
  };
}

function serializeFactura(row: Record<string, any>): FacturaDTO {
  return {
    idFactura: row.ID_FACTURA,
    numero: row.NUMERO_FACTURA,
    idOrdenTrabajo: row.ID_ORDEN_TRABAJO_FK ?? null,
    idCliente: row.ID_CLIENTE_FK ?? null,
    fecha: row.FECHA,
    valor: row.VALOR ? Number(row.VALOR) : 0,
    estado: row.ESTADO,
    observacion: row.OBSERVACION ?? null,
    ordenTrabajo: row.ordenes_trabajo ? serializeOrdenTrabajo(row.ordenes_trabajo) : null,
    cliente: row.clientes ? serializeCliente(row.clientes) : null,
  };
}

export default async function facturasRoutes(fastify: FastifyInstance) {
  fastify.get(
    '/api/v1/facturas',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      try {
        const facturas = await fastify.prisma.facturas.findMany({
          include: {
            ordenes_trabajo: {
              include: {
                clientes: true,
              },
            },
            clientes: true,
          },
          orderBy: { FECHA: 'desc' },
        });

        return { ok: true, data: facturas.map(serializeFactura) };
      } catch (error) {
        request.log.error(error);
        return reply.code(500).send({ ok: false, error: 'Error al consultar las facturas.' });
      }
    }
  );
}
