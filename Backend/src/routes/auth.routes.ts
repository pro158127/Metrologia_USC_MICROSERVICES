import { FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod';
import { AppError } from '../lib/errors.js';
import { hashPassword, verifyPassword } from '../services/password.service.js';
import {
  cancelarCodigoNoEncolado,
  generarCodigo,
  guardarCodigo,
  permitirSolicitud,
  verificarCodigo,
} from '../services/recovery.service.js';
import { registrarCorreoPendiente } from '../services/email-delivery.service.js';
import { protegerContenidoCorreo } from '../services/contenido-correo.service.js';
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

      if (user.intentos >= 3 || user.ESTADO === false || user.elminado) {
        throw new AppError(401, 'Usuario bloqueado o inactivo', 'user_blocked_or_inactive');
      }

      const passwordMatch = await verifyPassword(user.contrase_a, password);
      const idUsuario = user.ID_USUARIO_AUTO_INCREMENT;
      const resultadoLogin = await fastify.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "ID_USUARIO_AUTO_INCREMENT" FROM usuarios WHERE "ID_USUARIO_AUTO_INCREMENT" = ${idUsuario} FOR UPDATE`;
        const actual = await tx.usuarios.findUnique({
          where: { ID_USUARIO_AUTO_INCREMENT: idUsuario },
          select: { intentos: true, ESTADO: true, elminado: true, contrase_a: true, UPDATE_AT: true },
        });
        if (!actual?.ESTADO || actual.elminado || actual.intentos >= 3 ||
            actual.contrase_a !== user.contrase_a ||
            actual.UPDATE_AT?.getTime() !== user.UPDATE_AT?.getTime()) {
          return 'inactivo';
        }
        if (!passwordMatch) {
          const intentos = actual.intentos + 1;
          const bloqueado = intentos >= 3;
          await tx.usuarios.update({
            where: { ID_USUARIO_AUTO_INCREMENT: idUsuario },
            data: { intentos, ...(bloqueado && { ESTADO: false, UPDATE_AT: new Date() }) },
          });
          return bloqueado ? 'bloqueado' : 'incorrecto';
        }
        if (actual.intentos > 0) {
          await tx.usuarios.update({ where: { ID_USUARIO_AUTO_INCREMENT: idUsuario }, data: { intentos: 0 } });
        }
        return 'ok';
      });

      if (resultadoLogin === 'bloqueado') {
        fastify.io.in(`user_room_${idUsuario}`).disconnectSockets(true);
        await fastify.prisma.notificaciones.create({
            data: {
              ID_USUARIO_FK: 1,
              MENSAJE: `La cuenta del usuario ${user.CORREO_INSTITUCION} ha sido bloqueada tras 3 intentos fallidos de contraseña. IP de origen: ${ip ?? 'n/a'}`,
              MODULO: 'Sistema',
              NIVEL_PRIORIDAD: 'ALTA',
              VISTO: false,
            },
        }).catch((error) => request.log.error({ err: error, idUsuario }, 'No se pudo notificar el bloqueo de cuenta'));
        throw new AppError(401, 'Usuario bloqueado', 'user_blocked_now');
      }
      if (resultadoLogin === 'inactivo') {
        throw new AppError(401, 'La cuenta o las credenciales cambiaron. Intente iniciar sesión de nuevo.', 'user_blocked_or_inactive');
      }
      if (resultadoLogin === 'incorrecto') {
        throw new AppError(401, 'Credenciales inválidas', 'invalid_credentials');
      }

      return {
        user: usuarioLoginRawToDtoSchema.parse({
          ID_USUARIO_AUTO_INCREMENT: user.ID_USUARIO_AUTO_INCREMENT,
          NOMBRE_COMPLETO: user.NOMBRE_COMPLETO,
          CORREO_INSTITUCION: user.CORREO_INSTITUCION,
          NOMBRE_ROL: user.roles.NOMBRE_ROL,
          PERMISOS_JSON: user.roles.PERMISOS_JSON,
          UPDATE_AT: user.UPDATE_AT,
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
      const entidad = email.toLowerCase();
      const puedeEnviar = await permitirSolicitud('recuperar', entidad);

      // Solo se procede si el correo existe; la respuesta es genérica para
      // no revelar si la cuenta está registrada (anti-enumeración). El límite
      // se aplica también a direcciones desconocidas y la respuesta no cambia.
      if (puedeEnviar) {
        const usuario = await fastify.prisma.usuarios.findFirst({
          where: { CORREO_INSTITUCION: email },
          select: {
            ID_USUARIO_AUTO_INCREMENT: true,
            NOMBRE_COMPLETO: true,
            CORREO_INSTITUCION: true,
          },
        });
        if (!usuario) return { success: true as const };
        const codigo = generarCodigo();
        const expira = await guardarCodigo('recuperar', entidad, codigo);

        try {
          await registrarCorreoPendiente(fastify.prisma, {
            to: usuario.CORREO_INSTITUCION,
            subject: 'Código de recuperación de acceso - Metrología USC',
            template_type: 'codigo_recuperacion',
            context_data: {
              nombre: usuario.NOMBRE_COMPLETO,
              ...protegerContenidoCorreo('codigo', codigo, {
                expira_en: expira, codigo_verificacion: { namespace: 'recuperar', entidad },
              }),
            },
            id_registro: usuario.ID_USUARIO_AUTO_INCREMENT,
            notificar_usuario_id: usuario.ID_USUARIO_AUTO_INCREMENT,
            modulo_origen: 'autenticacion',
            tabla_origen: 'usuarios',
            tipo_entry: 'prod',
          });
        } catch (mailError) {
          fastify.log.error(mailError);
          await cancelarCodigoNoEncolado('recuperar', entidad, codigo).catch((err) =>
            request.log.warn({ err }, 'No se pudo cancelar el código que no quedó programado'));
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
      const cambio = await fastify.prisma.usuarios.updateMany({
        where: {
          ID_USUARIO_AUTO_INCREMENT: usuario.ID_USUARIO_AUTO_INCREMENT,
          UPDATE_AT: usuario.UPDATE_AT,
          contrase_a: usuario.contrase_a,
          elminado: false,
          ESTADO: usuario.ESTADO,
        },
        data: { contrase_a: contrasenaHasheada, intentos: 0, ESTADO: true, UPDATE_AT: new Date() },
      });
      if (!cambio.count) throw new AppError(409, 'La cuenta cambió durante la recuperación. Solicite un nuevo código.');
      fastify.io.in(`user_room_${usuario.ID_USUARIO_AUTO_INCREMENT}`).disconnectSockets(true);

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
