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

interface CertificadoSelloDTO {
  idCertificado: number;
  idSello: number;
}

interface CertificadoDTO {
  idCertificado: number;
  codigo: string;
  idCalibracion: number;
  idDocumento: number;
  sellos: CertificadoSelloDTO[];
}

interface CalibracionDTO {
  idCalibracion: number;
  idInstrumento: number;
  idTecnico: number;
  datosTecnicos: unknown;
  observaciones: string | null;
  createdAt: string | Date;
}

interface RecepcionEquipoDetalleDTO {
  idInstrumento: number;
  idRecepcion: number;
  instrumento: string;
  marca: string | null;
  modelo: string | null;
  serie: string | null;
  codigoInventario: string | null;
  resolucion: string | null;
  tipoSensorTemp: string | null;
  estadoIBC: unknown;
  estampilla: string | null;
  observaciones: string | null;
}

interface CotizacionDTO {
  idCotizacion: number;
  codigo: string;
  idCliente: number | null;
  montoTotal: unknown;
  createdAt: string | Date;
  updatedAt: string | Date | null;
  viaticos: unknown;
  estado: string;
  enviar: boolean;
  descuento: number | null;
  cliente: ClienteDTO | null;
}

interface OrdenTrabajoDetalleDTO {
  idDetalle: number;
  idOrdenTrabajo: number;
  item: number;
  tipoServicio: string;
  instrumento: string;
  fabricante: string | null;
  modelo: string | null;
  serie: string | null;
  codigoInventario: string | null;
  ubicacion: string | null;
  puntosCalibrar: string[];
  unidad: string | null;
  intervaloRango: string | null;
  resolucion: string | null;
  asignado: number;
  declaracionConformidad: boolean;
  limiteControlEMC: string | null;
  docEspecificacion: string | null;
  reglaDecision: string | null;
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
  cotizacion: CotizacionDTO | null;
  instrumentos: OrdenTrabajoDetalleDTO[];
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

function serializeCertificado(row: Record<string, any>): CertificadoDTO {
  return {
    idCertificado: row.ID_CERTIFICADO,
    codigo: row.CODIGO_CERTIFICADO,
    idCalibracion: row.ID_CALIBRACION_FK,
    idDocumento: row.ID_DOCUMENTO_FK,
    sellos: (row.certificado_sellos ?? []).map((cs: Record<string, any>) => ({
      idCertificado: cs.ID_CERTIFICADO_FK,
      idSello: cs.ID_SELLO_FK,
    })),
  };
}

function serializeCalibracion(row: Record<string, any>): CalibracionDTO {
  return {
    idCalibracion: row.ID_CALIBRACION,
    idInstrumento: row.ID_INSTRUMENTO_FK,
    idTecnico: row.ID_TECNICO_FK,
    datosTecnicos: row.DATOS_TECNICOS_JSON,
    observaciones: row.OBSERVACIONES ?? null,
    createdAt: row.CREATED_AT,
  };
}

function serializeRecepcionEquipoDetalle(row: Record<string, any>): RecepcionEquipoDetalleDTO {
  return {
    idInstrumento: row.ID_INSTRUMENTO,
    idRecepcion: row.ID_RECEPCION_FK,
    instrumento: row.INSTRUMENTO,
    marca: row.MARCA ?? null,
    modelo: row.MODELO ?? null,
    serie: row.SERIE ?? null,
    codigoInventario: row.CODIGO_INVENTARIO ?? null,
    resolucion: row.RESOLUCION ?? null,
    tipoSensorTemp: row.TIPO_SENSOR_TEMP ?? null,
    estadoIBC: row.ESTADO_IBC ?? null,
    estampilla: row.ESTAMPILLA ?? null,
    observaciones: row.OBSERVACIONES ?? null,
  };
}

function serializeCotizacion(row: Record<string, any>): CotizacionDTO {
  return {
    idCotizacion: row.ID_COTIZACION,
    codigo: row.CODIGO_COTIZACION,
    idCliente: row.ID_CLIENTE_FK ?? null,
    montoTotal: row.MONTO_TOTAL ?? null,
    createdAt: row.CREATED_AT,
    updatedAt: row.UPDATED_AT ?? null,
    viaticos: row.viaticos ?? null,
    estado: row.ESTADO,
    enviar: row.enviar,
    descuento: row.descuento ?? null,
    cliente: row.clientes ? serializeCliente(row.clientes) : null,
  };
}

function serializeOrdenTrabajoDetalle(row: Record<string, any>): OrdenTrabajoDetalleDTO {
  return {
    idDetalle: row.ID_DETALLE,
    idOrdenTrabajo: row.ID_ORDEN_TRABAJO_FK,
    item: row.ITEM,
    tipoServicio: row.TIPO_SERVICIO,
    instrumento: row.INSTRUMENTO,
    fabricante: row.FABRICANTE ?? null,
    modelo: row.MODELO ?? null,
    serie: row.SERIE ?? null,
    codigoInventario: row.CODIGO_INVENTARIO ?? null,
    ubicacion: row.UBICACION ?? null,
    puntosCalibrar: row.PUNTOS_CALIBRAR ?? [],
    unidad: row.UNIDAD ?? null,
    intervaloRango: row.INTERVALO_RANGO ?? null,
    resolucion: row.RESOLUCION ?? null,
    asignado: row.asignado,
    declaracionConformidad: row.DECLARACION_CONFORMIDAD,
    limiteControlEMC: row.LIMITE_CONTROL_EMC ?? null,
    docEspecificacion: row.DOC_ESPECIFICACION ?? null,
    reglaDecision: row.REGLA_DECISION ?? null,
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
    cotizacion: row.cotizaciones ? serializeCotizacion(row.cotizaciones) : null,
    instrumentos: (row.orden_trabajo_detalles ?? []).map(serializeOrdenTrabajoDetalle),
  };
}

export default async function certificadosRoutes(fastify: FastifyInstance) {
  fastify.get(
    '/api/v1/certificados',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      try {
        const [certificados, calibraciones, instrumentos, ordenes, clientes] = await Promise.all([
          fastify.prisma.certificados.findMany({
            include: { certificado_sellos: true },
            orderBy: { ID_CERTIFICADO: 'desc' },
          }),
          fastify.prisma.calibraciones.findMany(),
          fastify.prisma.recepcion_equipo_detalles.findMany(),
          fastify.prisma.ordenes_trabajo.findMany({
            include: {
              clientes: true,
              cotizaciones: { include: { clientes: true } },
              orden_trabajo_detalles: true,
            },
          }),
          fastify.prisma.clientes.findMany(),
        ]);

        return {
          success: true,
          data: {
            certificados: certificados.map(serializeCertificado),
            calibraciones: calibraciones.map(serializeCalibracion),
            instrumentos: instrumentos.map(serializeRecepcionEquipoDetalle),
            ordenes: ordenes.map(serializeOrdenTrabajo),
            clientes: clientes.map(serializeCliente),
          },
        };
      } catch (error) {
        request.log.error(error);
        return reply.code(500).send({ success: false, error: 'Error interno del servidor al consultar los certificados' });
      }
    }
  );
}
