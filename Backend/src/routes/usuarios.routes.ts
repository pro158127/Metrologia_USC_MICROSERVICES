import { FastifyInstance, FastifyRequest } from 'fastify';
import { Prisma } from '@prisma/client';
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod';
import { AppError } from '../lib/errors.js';
import { assertPermission } from '../lib/permissions.js';
import { hashPassword, generarContrasenaTemporalSegura } from '../services/password.service.js';
import { registrarCorreoPendiente } from '../services/email-delivery.service.js';
import { protegerContenidoCorreo } from '../services/contenido-correo.service.js';
import {
  actualizarUsuarioBodySchema,
  bitacoraRawToDtoSchema,
  crearUsuarioBodySchema,
  idParamSchema,
  respuestaListaBitacoraSchema,
  respuestaListaRolesSchema,
  respuestaListaUsuariosSchema,
  respuestaOkConMensajeSchema,
  respuestaOkConWarningSchema,
  respuestaOkSchema,
  rolRawToDtoSchema,
  usuarioRawToDtoSchema,
} from './usuarios.schemas.js';

async function registrarAuditoria(
  fastify: FastifyInstance,
  request: FastifyRequest,
  action: string,
  tableName: string,
  recordId: string,
  details: Prisma.InputJsonValue
) {
  const userId = Number(request.user?.sub ?? 0);
  try {
    await fastify.prisma.audit_logs.create({
      data: {
        action,
        tableName,
        recordId,
        USER_ID: userId,
        details,
        ip: request.ip || '0.0.0.0',
      },
    });
  } catch (error) {
    fastify.log.error(error);
  }
}

function desconectarSesionesUsuario(fastify: FastifyInstance, idUsuario: number) {
  fastify.io.in(`user_room_${idUsuario}`).disconnectSockets(true);
}

export default async function usuariosRoutes(fastify: FastifyInstance) {
  fastify.setValidatorCompiler(validatorCompiler);
  fastify.setSerializerCompiler(serializerCompiler);
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  app.get(
    '/api/v1/usuarios',
    {
      preHandler: [fastify.authenticate],
      schema: {
        response: { 200: respuestaListaUsuariosSchema },
      },
    },
    async (request) => {
      assertPermission(request, 'administracion', 'gestionar_usuarios_roles');
      const usuarios = await fastify.prisma.usuarios.findMany({
        include: { roles: true },
        orderBy: { CREATED_AT: 'desc' },
      });
      return {
        success: true as const,
        data: usuarios.map((u) => usuarioRawToDtoSchema.parse(u)),
      };
    }
  );

  app.post(
    '/api/v1/usuarios',
    {
      preHandler: [fastify.authenticate],
      schema: {
        body: crearUsuarioBodySchema,
        response: { 200: respuestaOkConWarningSchema },
      },
    },
    async (request) => {
      assertPermission(request, 'administracion', 'gestionar_usuarios_roles');
      const { nombre, correo, idRol, estado } = request.body;

      const contraseñaTemporal = generarContrasenaTemporalSegura();
      const contraseñaHasheada = await hashPassword(contraseñaTemporal);

      const nuevoUsuario = await fastify.prisma.$transaction(async (tx) => {
        const creado = await tx.usuarios.create({
          data: { NOMBRE_COMPLETO: nombre, CORREO_INSTITUCION: correo, ID_ROL_FK: idRol,
            ESTADO: estado ?? false, contrase_a: contraseñaHasheada },
        });
        await registrarCorreoPendiente(tx, {
          to: correo, subject: 'Bienvenido al Sistema de Metrología USC - Tu Cuenta ha sido Creada',
          template_type: 'crear_usuario',
          context_data: { nombre, correo, ...protegerContenidoCorreo('contrasenaTemporal', contraseñaTemporal,
            { version_credencial: creado.UPDATE_AT?.getTime() ?? 0 }) },
          id_registro: creado.ID_USUARIO_AUTO_INCREMENT,
          notificar_usuario_id: Number(request.user?.sub ?? 0) || null,
          modulo_origen: 'administracion_usuarios',
        });
        return creado;
      });

      await registrarAuditoria(
        fastify,
        request,
        `Crea usuario ${nuevoUsuario.CORREO_INSTITUCION}/${nuevoUsuario.NOMBRE_COMPLETO}`,
        'usuarios',
        String(nuevoUsuario.ID_USUARIO_AUTO_INCREMENT),
        {
          nombreCompleto: nuevoUsuario.NOMBRE_COMPLETO,
          correo: nuevoUsuario.CORREO_INSTITUCION,
        }
      );

      return { success: true as const };
    }
  );

  app.put(
    '/api/v1/usuarios/:id',
    {
      preHandler: [fastify.authenticate],
      schema: {
        params: idParamSchema,
        body: actualizarUsuarioBodySchema,
        response: { 200: respuestaOkSchema },
      },
    },
    async (request) => {
      assertPermission(request, 'administracion', 'gestionar_usuarios_roles');
      const idUsuario = request.params.id;
      const datos = request.body;

      const data: Record<string, any> = {};
      if (datos.nombreCompleto !== undefined) data.NOMBRE_COMPLETO = datos.nombreCompleto;
      if (datos.correo !== undefined) data.CORREO_INSTITUCION = datos.correo;
      if (datos.idRol !== undefined) data.ID_ROL_FK = datos.idRol;
      if (datos.estado !== undefined) data.ESTADO = datos.estado;
      if (datos.intentos !== undefined) data.intentos = datos.intentos;
      if (datos.elminado !== undefined) data.elminado = datos.elminado;
      // Reactivar desde Administración también debe liberar el bloqueo por
      // intentos fallidos; de lo contrario el login la seguirá rechazando.
      if (datos.estado === true) data.intentos = 0;
      if (Object.keys(data).length > 0) data.UPDATE_AT = new Date();

      const actualizado = await fastify.prisma.usuarios.update({
        where: { ID_USUARIO_AUTO_INCREMENT: idUsuario },
        data,
      });
      if (Object.keys(data).length > 0) desconectarSesionesUsuario(fastify, idUsuario);

      const action =
        datos.estado !== undefined
          ? `cambio a ${datos.estado} el estado del usuario ${actualizado.CORREO_INSTITUCION}/${actualizado.NOMBRE_COMPLETO}`
          : `actualizacion de datos de usuario  ${actualizado.CORREO_INSTITUCION}/${actualizado.NOMBRE_COMPLETO}`;

      await registrarAuditoria(
        fastify,
        request,
        action,
        'usuarios',
        String(actualizado.ID_USUARIO_AUTO_INCREMENT),
        {
          nombreCompleto: actualizado.NOMBRE_COMPLETO,
          correo: actualizado.CORREO_INSTITUCION,
        }
      );

      return { success: true as const };
    }
  );

  app.delete(
    '/api/v1/usuarios/:id',
    {
      preHandler: [fastify.authenticate],
      schema: {
        params: idParamSchema,
        response: { 200: respuestaOkConMensajeSchema },
      },
    },
    async (request) => {
      assertPermission(request, 'administracion', 'gestionar_usuarios_roles');
      console.log('ENTRO A L ARUTA');
      const idUsuario = request.params.id;
      const userId = Number(request.user?.sub ?? 0);
      if (userId === idUsuario) {
        throw new AppError(400, 'No puedes eliminar tu propia cuenta de usuario.');
      }

      const existente = await fastify.prisma.usuarios.findUnique({
        where: { ID_USUARIO_AUTO_INCREMENT: idUsuario },
      });
      if (!existente) throw new AppError(404, 'El usuario que intentas eliminar no existe.');
      if (existente.elminado) throw new AppError(400, 'El usuario ya se encuentra eliminado.');

      const actualizado = await fastify.prisma.usuarios.update({
        where: { ID_USUARIO_AUTO_INCREMENT: idUsuario },
        data: { elminado: true, ESTADO: false, UPDATE_AT: new Date() },
      });
      desconectarSesionesUsuario(fastify, idUsuario);

      await registrarAuditoria(
        fastify,
        request,
        `Eleminar usuario ${actualizado.CORREO_INSTITUCION}/${actualizado.NOMBRE_COMPLETO}`,
        'usuarios',
        String(actualizado.ID_USUARIO_AUTO_INCREMENT),
        {
          nombreCompleto: actualizado.NOMBRE_COMPLETO,
          correo: actualizado.CORREO_INSTITUCION,
        }
      );

      return { success: true as const, message: 'Usuario eliminado correctamente.' };
    }
  );

  app.patch(
    '/api/v1/usuarios/:id/restaurar',
    {
      preHandler: [fastify.authenticate],
      schema: {
        params: idParamSchema,
        response: { 200: respuestaOkConMensajeSchema },
      },
    },
    async (request) => {
      assertPermission(request, 'administracion', 'gestionar_usuarios_roles');
      const idUsuario = request.params.id;

      const existente = await fastify.prisma.usuarios.findUnique({
        where: { ID_USUARIO_AUTO_INCREMENT: idUsuario },
      });
      if (!existente) throw new AppError(404, 'El usuario que intentas restaurar no existe.');
      if (!existente.elminado)
        throw new AppError(400, 'El usuario ya se encuentra activo y no está eliminado.');

      const actualizado = await fastify.prisma.usuarios.update({
        where: { ID_USUARIO_AUTO_INCREMENT: idUsuario },
        data: { elminado: false, ESTADO: true, intentos: 0, UPDATE_AT: new Date() },
      });
      desconectarSesionesUsuario(fastify, idUsuario);

      await registrarAuditoria(
        fastify,
        request,
        `Restaura usuario ${actualizado.CORREO_INSTITUCION}/${actualizado.NOMBRE_COMPLETO}`,
        'usuarios',
        String(actualizado.ID_USUARIO_AUTO_INCREMENT),
        {
          nombreCompleto: actualizado.NOMBRE_COMPLETO,
          correo: actualizado.CORREO_INSTITUCION,
        }
      );

      return { success: true as const, message: 'Usuario restaurado y activado correctamente.' };
    }
  );

  app.post(
    '/api/v1/usuarios/:id/restablecer',
    {
      preHandler: [fastify.authenticate],
      schema: {
        params: idParamSchema,
        response: { 200: respuestaOkConWarningSchema },
      },
    },
    async (request) => {
      assertPermission(request, 'administracion', 'gestionar_usuarios_roles');
      const idUsuario = request.params.id;

      const nuevaContrasenaTemporal = generarContrasenaTemporalSegura();
      const contrasenaHasheada = await hashPassword(nuevaContrasenaTemporal);

      const actualizado = await fastify.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "ID_USUARIO_AUTO_INCREMENT" FROM usuarios WHERE "ID_USUARIO_AUTO_INCREMENT" = ${idUsuario} FOR UPDATE`;
        const usuario = await tx.usuarios.findUnique({ where: { ID_USUARIO_AUTO_INCREMENT: idUsuario } });
        if (!usuario || usuario.elminado) throw new AppError(404, 'El usuario especificado no existe.');
        const version = new Date(Math.max(Date.now(), (usuario.UPDATE_AT?.getTime() ?? 0) + 1));
        const modificado = await tx.usuarios.update({
          where: { ID_USUARIO_AUTO_INCREMENT: idUsuario },
          data: { contrase_a: contrasenaHasheada, UPDATE_AT: version },
        });
        await registrarCorreoPendiente(tx, {
          to: modificado.CORREO_INSTITUCION, subject: 'Restablecimiento de Contraseña - Metrología USC',
          template_type: 'restablecer_contrasena',
          context_data: { nombre: modificado.NOMBRE_COMPLETO, ...protegerContenidoCorreo('nuevaContrasena', nuevaContrasenaTemporal,
            { version_credencial: version.getTime() }) },
          id_registro: idUsuario, notificar_usuario_id: Number(request.user?.sub ?? 0) || null,
          modulo_origen: 'administracion_usuarios',
        });
        return modificado;
      });
      desconectarSesionesUsuario(fastify, idUsuario);

      await registrarAuditoria(
        fastify,
        request,
        `Restablecer contraeña  de ${actualizado.CORREO_INSTITUCION}/${actualizado.NOMBRE_COMPLETO}`,
        'usuarios',
        String(actualizado.ID_USUARIO_AUTO_INCREMENT),
        {
          nombreCompleto: actualizado.NOMBRE_COMPLETO,
          correo: actualizado.CORREO_INSTITUCION,
        }
      );

      return { success: true as const };
    }
  );

  app.get(
    '/api/v1/roles',
    {
      preHandler: [fastify.authenticate],
      schema: {
        response: { 200: respuestaListaRolesSchema },
      },
    },
    async (request) => {
      assertPermission(request, 'administracion', 'gestionar_usuarios_roles');
      const roles = await fastify.prisma.roles.findMany({
        orderBy: { ID_ROL_INCREMENT: 'asc' },
      });
      return {
        success: true as const,
        data: roles.map((r) => rolRawToDtoSchema.parse(r)),
      };
    }
  );

  app.get(
    '/api/v1/bitacora',
    {
      preHandler: [fastify.authenticate],
      schema: {
        response: { 200: respuestaListaBitacoraSchema },
      },
    },
    async (request) => {
      assertPermission(request, 'administracion', 'consultar_bitacora_auditoria');
      const logs = await fastify.prisma.audit_logs.findMany({
        include: { usuarios: { include: { roles: true } } },
        orderBy: { createdAt: 'desc' },
      });
      return {
        success: true as const,
        data: logs.map((l) => bitacoraRawToDtoSchema.parse(l)),
      };
    }
  );
}
