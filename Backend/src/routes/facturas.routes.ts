import { FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod';
import { AppError } from '../lib/errors.js';
import { registrarBitacora } from '../services/bitacora.service.js';
import {
  crearFacturaBodySchema,
  facturaRawToDtoSchema,
  respuestaFacturaSchema,
  respuestaFacturasSchema,
} from './facturas.schemas.js';

export default async function facturasRoutes(fastify: FastifyInstance) {
  fastify.setValidatorCompiler(validatorCompiler);
  fastify.setSerializerCompiler(serializerCompiler);
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  app.get(
    '/api/v1/facturas',
    {
      preHandler: [fastify.authenticate],
      schema: {
        response: { 200: respuestaFacturasSchema },
      },
    },
    async () => {
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

      return { ok: true as const, data: facturas.map((f) => facturaRawToDtoSchema.parse(f)) };
    }
  );

  app.post(
    '/api/v1/facturas',
    {
      preHandler: [fastify.authenticate],
      schema: {
        body: crearFacturaBodySchema,
        response: { 200: respuestaFacturaSchema },
      },
    },
    async (request) => {
      const idUsuario = Number(request.user?.sub ?? 0);
      const { numero, idOrdenTrabajo, idCliente, fecha, valor, observacion, estado, archivo } = request.body;

      const existe = await fastify.prisma.facturas.findUnique({
        where: { NUMERO_FACTURA: numero },
      });
      if (existe) throw new AppError(409, 'Ya existe una factura con este número.');

      const resultado = await fastify.prisma.$transaction(async (tx) => {
        let idDocumento: number | null = null;

        if (archivo?.rutaUrl) {
          const documento = await tx.documentos.create({
            data: {
              NOMBRE: archivo.nombre || `Factura_${numero}`,
              RUTA_URL: archivo.rutaUrl,
              MIME_TYPE: archivo.mimeType || 'application/pdf',
              PROVEEDOR: 'AWS_S3',
              ID_ORDEN_TRABAJO_FK: idOrdenTrabajo ?? null,
            },
          });
          idDocumento = documento.ID_DOCUMENTO;
        }

        const factura = await tx.facturas.create({
          data: {
            NUMERO_FACTURA: numero,
            ID_ORDEN_TRABAJO_FK: idOrdenTrabajo ?? null,
            ID_CLIENTE_FK: idCliente ?? null,
            ID_DOCUMENTO_FK: idDocumento,
            FECHA: fecha ?? new Date(),
            VALOR: valor,
            ESTADO: estado ?? 'EMITIDA',
            OBSERVACION: observacion ?? null,
          },
          include: {
            ordenes_trabajo: { include: { clientes: true } },
            clientes: true,
          },
        });

        await registrarBitacora(tx, {
          action: 'CREATE',
          tableName: 'facturas',
          recordId: factura.ID_FACTURA,
          userId: idUsuario,
          ip: request.ip,
          details: { numero: factura.NUMERO_FACTURA, idCliente: factura.ID_CLIENTE_FK, valor: Number(factura.VALOR) },
        });

        return factura;
      });

      return { ok: true as const, data: facturaRawToDtoSchema.parse(resultado) };
    }
  );
}
