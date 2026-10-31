import { FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod';
import { AppError } from '../lib/errors.js';
import { hashPassword, verifyPassword } from '../services/password.service.js';
import {
  generarCodigo,
  guardarCodigo,
  permitirSolicitud,
  verificarCodigo,
} from '../services/recovery.service.js';
import { getEmailQueue } from '../lib/queue/queue.js';
import {
  loginBodySchema,
  recuperarContrasenaBodySchema,
  respuestaLoginSchema,
  respuestaRecuperacionSchema,
  solicitarRecuperacionBodySchema,
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

      const passwordMatch = await verifyPassword(user.contrase_a, password);
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

  app.post(
    '/api/v1/auth/solicitar-recuperacion',
    {
      schema: {
        body: solicitarRecuperacionBodySchema,
        response: { 200: respuestaRecuperacionSchema },
      },
    },
    async (request) => {
      const { email } = request.body;

      const usuario = await fastify.prisma.usuarios.findFirst({
        where: { CORREO_INSTITUCION: email },
        select: {
          ID_USUARIO_AUTO_INCREMENT: true,
          NOMBRE_COMPLETO: true,
          CORREO_INSTITUCION: true,
        },
      });

      // Solo se procede si el correo existe; la respuesta es genérica para
      // no revelar si la cuenta está registrada (anti-enumeración).
      if (usuario) {
        if (!(await permitirSolicitud('recuperar', email.toLowerCase()))) {
          throw new AppError(
            429,
            'Demasiadas solicitudes. Espera un minuto e inténtalo de nuevo.',
            'too_many_requests'
          );
        }

        const codigo = generarCodigo();
        await guardarCodigo('recuperar', email.toLowerCase(), codigo);

        try {
          await getEmailQueue().add('codigo_recuperacion', {
            to: usuario.CORREO_INSTITUCION,
            subject: 'Código de recuperación de acceso - Metrología USC',
            template_type: 'codigo_recuperacion',
            context_data: {
              nombre: usuario.NOMBRE_COMPLETO,
              codigo,
            },
            id_registro: usuario.ID_USUARIO_AUTO_INCREMENT,
            tipo_entry: 'prod',
          });
        } catch (mailError) {
          fastify.log.error(mailError);
        }
      }

      return { success: true as const };
    }
  );

  app.post(
    '/api/v1/auth/recuperar-contrasena',
    {
      schema: {
        body: recuperarContrasenaBodySchema,
        response: { 200: respuestaRecuperacionSchema },
      },
    },
    async (request) => {
      const { email, codigo, nuevaContrasena } = request.body;

      const usuario = await fastify.prisma.usuarios.findFirst({
        where: { CORREO_INSTITUCION: email },
      });
      if (!usuario) {
        throw new AppError(400, 'Código inválido o expirado.', 'codigo_invalido');
      }

      const resultado = await verificarCodigo('recuperar', email.toLowerCase(), codigo);
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
        where: { ID_USUARIO_AUTO_INCREMENT: usuario.ID_USUARIO_AUTO_INCREMENT },
        data: { contrase_a: contrasenaHasheada, intentos: 0, ESTADO: true },
      });

      await fastify.prisma.audit_logs.create({
        data: {
          action: 'Recuperación de contraseña por código (desbloqueo de cuenta)',
          tableName: 'usuarios',
          recordId: String(usuario.ID_USUARIO_AUTO_INCREMENT),
          USER_ID: usuario.ID_USUARIO_AUTO_INCREMENT,
          ip: request.ip,
          details: { correo: usuario.CORREO_INSTITUCION },
        },
      });

      return { success: true as const };
    }
  );
}
