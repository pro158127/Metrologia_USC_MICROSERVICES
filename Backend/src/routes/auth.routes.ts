import { FastifyInstance } from 'fastify';
import argon2 from 'argon2';
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod';
import { AppError } from '../lib/errors.js';
import {
  loginBodySchema,
  respuestaLoginSchema,
  usuarioLoginRawToDtoSchema,
} from './auth.schemas.js';

export default async function authRoutes(fastify: FastifyInstance) {
  fastify.setValidatorCompiler(validatorCompiler);
  fastify.setSerializerCompiler(serializerCompiler);
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  app.post(
    '/api/v1/auth/credentials',
    {
      schema: {
        body: loginBodySchema,
        response: { 200: respuestaLoginSchema },
      },
    },
    async (request) => {
      const { email, password, ip } = request.body;

      const user = await fastify.prisma.usuarios.findFirst({
        where: { CORREO_INSTITUCION: email },
        include: { roles: true },
      });

      if (!user) {
        throw new AppError(401, 'Usuario no encontrado', 'user_not_found');
      }

      if (user.intentos >= 3 || user.ESTADO === false) {
        throw new AppError(401, 'Usuario bloqueado o inactivo', 'user_blocked_or_inactive');
      }

      const passwordMatch = await argon2.verify(user.contrase_a, password);
      if (!passwordMatch) {
        const nuevosIntentos = user.intentos + 1;
        if (nuevosIntentos >= 3) {
          await fastify.prisma.usuarios.update({
            where: { ID_USUARIO_AUTO_INCREMENT: user.ID_USUARIO_AUTO_INCREMENT },
            data: { intentos: nuevosIntentos, ESTADO: false },
          });

          await fastify.prisma.notificaciones.create({
            data: {
              ID_USUARIO_FK: 1,
              MENSAJE: `La cuenta del usuario ${user.CORREO_INSTITUCION} ha sido bloqueada tras 5 intentos fallidos de contraseña. IP de origen: ${ip ?? 'n/a'}`,
              MODULO: 'Sistema',
              NIVEL_PRIORIDAD: 'ALTA',
              VISTO: false,
            },
          });

          throw new AppError(401, 'Usuario bloqueado', 'user_blocked_now');
        }

        await fastify.prisma.usuarios.update({
          where: { ID_USUARIO_AUTO_INCREMENT: user.ID_USUARIO_AUTO_INCREMENT },
          data: { intentos: nuevosIntentos },
        });

        throw new AppError(401, 'Credenciales inválidas', 'invalid_credentials');
      }

      if (user.intentos > 0) {
        await fastify.prisma.usuarios.update({
          where: { ID_USUARIO_AUTO_INCREMENT: user.ID_USUARIO_AUTO_INCREMENT },
          data: { intentos: 0 },
        });
      }

      return {
        user: usuarioLoginRawToDtoSchema.parse({
          ID_USUARIO_AUTO_INCREMENT: user.ID_USUARIO_AUTO_INCREMENT,
          NOMBRE_COMPLETO: user.NOMBRE_COMPLETO,
          CORREO_INSTITUCION: user.CORREO_INSTITUCION,
          NOMBRE_ROL: user.roles.NOMBRE_ROL,
          PERMISOS_JSON: user.roles.PERMISOS_JSON,
        }),
      };
    }
  );
}
