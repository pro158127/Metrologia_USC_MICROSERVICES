import { FastifyInstance } from 'fastify';
import { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { Prisma } from '@prisma/client';
import { hasZodFastifySchemaValidationErrors } from 'fastify-type-provider-zod';
import { AppError } from '../lib/errors.js';

function mapearErrorPrisma(error: Prisma.PrismaClientKnownRequestError): {
  status: number;
  message: string;
} {
  switch (error.code) {
    case 'P2002':
      return {
        status: 409,
        message: `Conflicto: ya existe un registro con esos datos únicos${
          Array.isArray(error.meta?.target) ? ` (${(error.meta.target as string[]).join(', ')})` : ''
        }`,
      };
    case 'P2003':
      return { status: 409, message: 'Conflicto: violación de restricción de clave foránea' };
    case 'P2025':
      return { status: 404, message: 'Recurso no encontrado' };
    case 'P2023':
      return { status: 400, message: 'Datos inconsistentes en la solicitud' };
    default:
      return { status: 500, message: 'Error interno de base de datos' };
  }
}

async function errorHandlerPlugin(fastify: FastifyInstance) {
  fastify.setErrorHandler(
    async (error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
      if (hasZodFastifySchemaValidationErrors(error)) {
        const detalle = error.validation?.[0]?.message ?? 'Datos de entrada inválidos';
        request.log.warn({ err: error }, 'Error de validación');
        return reply.code(400).send({ error: detalle });
      }

      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        const { status, message } = mapearErrorPrisma(error);
        request.log.error({ err: error }, 'Error de Prisma');
        return reply.code(status).send({ error: message });
      }

      if (error instanceof Prisma.PrismaClientValidationError) {
        request.log.error({ err: error }, 'Error de validación de Prisma');
        return reply.code(400).send({ error: 'La solicitud no cumple las reglas de la base de datos' });
      }

      if (error instanceof AppError) {
        return reply
          .code(error.statusCode)
          .send(error.code ? { error: error.message, code: error.code } : { error: error.message });
      }

      const statusCode = (error as FastifyError & { statusCode?: number }).statusCode;
      if (typeof statusCode === 'number' && statusCode >= 400 && statusCode < 500) {
        request.log.warn({ err: error }, 'Error del cliente');
        return reply.code(statusCode).send({ error: error.message || 'Solicitud incorrecta' });
      }

      request.log.error({ err: error }, 'Error no manejado');
      return reply.code(500).send({ error: 'Error interno del servidor' });
    }
  );
}

export default fp(errorHandlerPlugin);
