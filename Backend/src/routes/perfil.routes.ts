import { FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod';
import { AppError } from '../lib/errors.js';
import { hashPassword } from '../services/password.service.js';
import { generarCodigo, guardarCodigo, permitirSolicitud, verificarCodigo } from '../services/recovery.service.js';
import { getEmailQueue } from '../lib/queue/queue.js';
import {
  confirmarCambioContrasenaBodySchema,
  respuestaOkSchema,
  respuestaPerfilSchema,
} from './perfil.schemas.js';

const NS_CAMBIO = 'cambio';

export default async function perfilRoutes(fastify: FastifyInstance) {
  fastify.setValidatorCompiler(validatorCompiler);
  fastify.setSerializerCompiler(serializerCompiler);
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  app.get(
    '/api/v1/perfil',
    {
      preHandler: [fastify.authenticate],
      schema: {
        response: { 200: respuestaPerfilSchema },
      },
    },
    async (request) => {
      const id = Number(request.user?.sub ?? 0);
      const usuario = await fastify.prisma.usuarios.findUnique({
        where: { ID_USUARIO_AUTO_INCREMENT: id },
        include: { roles: true },
      });
      if (!usuario) throw new AppError(404, 'Usuario no encontrado.');

      return {
        success: true as const,
        data: {
          nombre: usuario.NOMBRE_COMPLETO,
          correo: usuario.CORREO_INSTITUCION,
          rol: usuario.roles.NOMBRE_ROL,
        },
      };
    }
  );

  app.post(
    '/api/v1/perfil/cambiar-contrasena/solicitar-codigo',
    {
      preHandler: [fastify.authenticate],
      schema: {
        response: { 200: respuestaOkSchema },
      },
    },
    async (request) => {
      const id = Number(request.user?.sub ?? 0);
      const usuario = await fastify.prisma.usuarios.findUnique({
        where: { ID_USUARIO_AUTO_INCREMENT: id },
        select: { NOMBRE_COMPLETO: true, CORREO_INSTITUCION: true },
      });
      if (!usuario) throw new AppError(404, 'Usuario no encontrado.');

      if (!(await permitirSolicitud(NS_CAMBIO, String(id)))) {
        throw new AppError(429, 'Demasiadas solicitudes. Espera un minuto e inténtalo de nuevo.', 'too_many_requests');
      }

      const codigo = generarCodigo();
      await guardarCodigo(NS_CAMBIO, String(id), codigo);

      await getEmailQueue().add('cambio_contrasena', {
        to: usuario.CORREO_INSTITUCION,
        subject: 'Código para cambiar tu contraseña - Metrología USC',
        template_type: 'cambio_contrasena',
        context_data: {
          nombre: usuario.NOMBRE_COMPLETO,
          codigo,
        },
        id_registro: id,
        tipo_entry: 'prod',
      });

      return { success: true as const };
    }
  );

  app.post(
    '/api/v1/perfil/cambiar-contrasena/confirmar',
    {
      preHandler: [fastify.authenticate],
      schema: {
        body: confirmarCambioContrasenaBodySchema,
        response: { 200: respuestaOkSchema },
      },
    },
    async (request) => {
      const id = Number(request.user?.sub ?? 0);
      const { codigo, nuevaContrasena } = request.body;

      const resultado = await verificarCodigo(NS_CAMBIO, String(id), codigo);
      if (resultado === 'expirado') {
        throw new AppError(400, 'El código ha expirado. Solicita uno nuevo.', 'codigo_expirado');
      }
      if (resultado === 'agotado') {
        throw new AppError(429, 'Superaste el límite de intentos. Solicita un nuevo código.', 'codigo_agotado');
      }
      if (resultado === 'invalido') {
        throw new AppError(400, 'Código incorrecto.', 'codigo_invalido');
      }

      const contrasenaHasheada = await hashPassword(nuevaContrasena);
      await fastify.prisma.usuarios.update({
        where: { ID_USUARIO_AUTO_INCREMENT: id },
        data: { contrase_a: contrasenaHasheada },
      });

      await fastify.prisma.audit_logs.create({
        data: {
          action: 'Cambio de contraseña por código de verificación',
          tableName: 'usuarios',
          recordId: String(id),
          USER_ID: id,
          ip: request.ip,
          details: {},
        },
      });

      return { success: true as const };
    }
  );
}
