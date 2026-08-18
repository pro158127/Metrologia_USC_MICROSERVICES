import { FastifyInstance } from 'fastify';

// Contrato camelCase que consume el frontend (mismo shape que el modelo Cliente del frontend).
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

interface CrearClienteBody {
  nitCedula: string;
  razonSocial: string;
  correo: string;
  nombreContacto?: string | null;
  telefono?: string | null;
  observacion?: string | null;
  tipoCliente?: 'NATURAL' | 'JURIDICO';
  ciudad?: string | null;
  idRutDocumento?: number | null;
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

const crearClienteSchema = {
  type: 'object',
  required: ['nitCedula', 'razonSocial', 'correo'],
  properties: {
    nitCedula: { type: 'string' },
    razonSocial: { type: 'string' },
    correo: { type: 'string' },
    nombreContacto: { type: ['string', 'null'] },
    telefono: { type: ['string', 'null'] },
    observacion: { type: ['string', 'null'] },
    tipoCliente: { type: 'string', enum: ['NATURAL', 'JURIDICO'] },
    ciudad: { type: ['string', 'null'] },
    idRutDocumento: { type: ['integer', 'null'] },
  },
  additionalProperties: false,
} as const;

export default async function clientesRoutes(fastify: FastifyInstance) {
  fastify.get(
    '/api/v1/clientes',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      try {
        const clientes = await fastify.prisma.clientes.findMany({
          orderBy: { createat: 'desc' },
        });

        return { success: true, data: clientes.map(serializeCliente) };
      } catch (error) {
        request.log.error(error);
        return reply.code(500).send({ success: false, error: 'Error interno del servidor' });
      }
    }
  );

  fastify.post<{ Body: CrearClienteBody }>(
    '/api/v1/clientes',
    { preHandler: [fastify.authenticate], schema: { body: crearClienteSchema } },
    async (request, reply) => {
      try {
        const body = request.body;

        const existeNit = await fastify.prisma.clientes.findUnique({
          where: { NIT: body.nitCedula },
        });
        if (existeNit) {
          return reply
            .code(409)
            .send({ success: false, error: 'Ya existe un cliente registrado con este NIT/Cédula' });
        }

        const nuevo = await fastify.prisma.clientes.create({
          data: {
            NIT: body.nitCedula,
            RAZON_SOCIAL: body.razonSocial,
            CORREO: body.correo,
            NOMBRE_CONTACTO: body.nombreContacto ?? null,
            TELEFONO: body.telefono ?? null,
            OBSERVACION: body.observacion ?? null,
            TIPO_CLIENTE: body.tipoCliente ?? 'NATURAL',
            ciudad: body.ciudad ?? 'Cali',
            ID_RUT_DOCUMENTO_FK: body.idRutDocumento ?? null,
          },
        });

        return { success: true, data: serializeCliente(nuevo) };
      } catch (error) {
        request.log.error(error);
        return reply.code(500).send({ success: false, error: 'Error interno al crear el cliente' });
      }
    }
  );
}
