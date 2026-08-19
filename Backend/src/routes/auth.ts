import { FastifyInstance } from 'fastify';
import argon2 from 'argon2';

interface CredentialsBody {
  email: string;
  password: string;
  ip?: string;
}

export default async function authRoutes(fastify: FastifyInstance) {
  // Endpoint público de validación de credenciales (usado por NextAuth authorize).
  fastify.post<{ Body: CredentialsBody }>(
    '/api/v1/auth/credentials',
    async (request, reply) => {
      try {
        const { email, password, ip } = request.body;

        const user = await fastify.prisma.usuarios.findFirst({
          where: { CORREO_INSTITUCION: email },
          include: { roles: true },
        });

        if (!user) {
          return reply.code(401).send({ code: 'user_not_found', error: 'Usuario no encontrado' });
        }

        if (user.intentos >= 3 || user.ESTADO === false) {
          return reply.code(401).send({ code: 'user_blocked_or_inactive', error: 'Usuario bloqueado o inactivo' });
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

            return reply.code(401).send({ code: 'user_blocked_now', error: 'Usuario bloqueado' });
          }

          await fastify.prisma.usuarios.update({
            where: { ID_USUARIO_AUTO_INCREMENT: user.ID_USUARIO_AUTO_INCREMENT },
            data: { intentos: nuevosIntentos },
          });

          return reply.code(401).send({ code: 'invalid_credentials', error: 'Credenciales inválidas' });
        }

        if (user.intentos > 0) {
          await fastify.prisma.usuarios.update({
            where: { ID_USUARIO_AUTO_INCREMENT: user.ID_USUARIO_AUTO_INCREMENT },
            data: { intentos: 0 },
          });
        }

        return {
          user: {
            id_user: user.ID_USUARIO_AUTO_INCREMENT,
            name: user.NOMBRE_COMPLETO,
            email: user.CORREO_INSTITUCION,
            role: user.roles.NOMBRE_ROL,
            permissions: user.roles.PERMISOS_JSON,
          },
        };
      } catch (error) {
        request.log.error(error);
        return reply.code(500).send({ code: 'server_error', error: 'Error interno del servidor' });
      }
    }
  );
}
