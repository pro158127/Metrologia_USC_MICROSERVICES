import { FastifyInstance, FastifyRequest } from 'fastify';
import argon2 from 'argon2';
import nodemailer from 'nodemailer';
import { Prisma } from '@prisma/client';
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod';
import { AppError } from '../lib/errors.js';
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

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
  },
});

function generarContrasenaTemporal(nombre: string): string {
  const primerNombre = (nombre || '')
    .trim()
    .split(' ')[0]
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '');
  const numeroAleatorio = Math.floor(100 + Math.random() * 900);
  return `Usc${primerNombre}${numeroAleatorio}*`;
}

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
    async () => {
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
      const { nombre, correo, idRol, estado } = request.body;

      const contraseñaTemporal = generarContrasenaTemporal(nombre);
      const contraseñaHasheada = await argon2.hash(contraseñaTemporal, { type: argon2.argon2id });

      const nuevoUsuario = await fastify.prisma.usuarios.create({
        data: {
          NOMBRE_COMPLETO: nombre,
          CORREO_INSTITUCION: correo,
          ID_ROL_FK: idRol,
          ESTADO: estado ?? false,
          contrase_a: contraseñaHasheada,
        },
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

      try {
        await transporter.sendMail({
          from: `"Soporte Metrología USC" <${process.env.SMTP_USER}>`,
          to: correo,
          subject: 'Bienvenido al Sistema de Metrología USC - Tu Cuenta ha sido Creada',
          html: `<p>Hola, ${nombre}. Tu cuenta fue creada. Contraseña temporal: <strong>${contraseñaTemporal}</strong></p>`,
        });
      } catch (mailError) {
        fastify.log.error(mailError);
        return {
          success: true as const,
          warning: `El usuario fue creado, pero falló el envío de correo. Compártele esta clave temporal: ${contraseñaTemporal}`,
        };
      }

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
      const idUsuario = request.params.id;
      const datos = request.body;

      const data: Record<string, any> = {};
      if (datos.nombreCompleto !== undefined) data.NOMBRE_COMPLETO = datos.nombreCompleto;
      if (datos.correo !== undefined) data.CORREO_INSTITUCION = datos.correo;
      if (datos.idRol !== undefined) data.ID_ROL_FK = datos.idRol;
      if (datos.estado !== undefined) data.ESTADO = datos.estado;
      if (datos.intentos !== undefined) data.intentos = datos.intentos;
      if (datos.elminado !== undefined) data.elminado = datos.elminado;

      const actualizado = await fastify.prisma.usuarios.update({
        where: { ID_USUARIO_AUTO_INCREMENT: idUsuario },
        data,
      });

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
        data: { elminado: true, ESTADO: false },
      });

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
      const idUsuario = request.params.id;

      const existente = await fastify.prisma.usuarios.findUnique({
        where: { ID_USUARIO_AUTO_INCREMENT: idUsuario },
      });
      if (!existente) throw new AppError(404, 'El usuario que intentas restaurar no existe.');
      if (!existente.elminado)
        throw new AppError(400, 'El usuario ya se encuentra activo y no está eliminado.');

      const actualizado = await fastify.prisma.usuarios.update({
        where: { ID_USUARIO_AUTO_INCREMENT: idUsuario },
        data: { elminado: false, ESTADO: true, intentos: 0 },
      });

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
      const idUsuario = request.params.id;

      const usuario = await fastify.prisma.usuarios.findUnique({
        where: { ID_USUARIO_AUTO_INCREMENT: idUsuario },
        select: { NOMBRE_COMPLETO: true, CORREO_INSTITUCION: true },
      });
      if (!usuario) throw new AppError(404, 'El usuario especificado no existe.');

      const nuevaContrasenaTemporal = generarContrasenaTemporal(usuario.NOMBRE_COMPLETO);
      const contrasenaHasheada = await argon2.hash(nuevaContrasenaTemporal, {
        type: argon2.argon2id,
      });

      const actualizado = await fastify.prisma.usuarios.update({
        where: { ID_USUARIO_AUTO_INCREMENT: idUsuario },
        data: { contrase_a: contrasenaHasheada },
      });

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

      try {
        await transporter.sendMail({
          from: `"Soporte Metrología USC" <${process.env.SMTP_USER}>`,
          to: usuario.CORREO_INSTITUCION,
          subject: 'Restablecimiento de Contraseña - Metrología USC',
          html: `<p>Hola, ${usuario.NOMBRE_COMPLETO}. Tu nueva contraseña temporal es: <strong>${nuevaContrasenaTemporal}</strong></p>`,
        });
      } catch (mailError) {
        fastify.log.error(mailError);
        return {
          success: true as const,
          warning: `Contraseña restablecida en el sistema, pero falló el envío del correo. Compártele la clave temporal manualmente: ${nuevaContrasenaTemporal}`,
        };
      }

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
    async () => {
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
    async () => {
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
