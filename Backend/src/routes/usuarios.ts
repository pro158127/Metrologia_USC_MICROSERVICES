import { FastifyInstance, FastifyRequest } from 'fastify';
import argon2 from 'argon2';
import nodemailer from 'nodemailer';
import { Prisma } from '@prisma/client';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
  },
});

function serializeRol(row: Record<string, any>) {
  return {
    idRol: row.ID_ROL_INCREMENT,
    nombreRol: row.NOMBRE_ROL,
    permisos: row.PERMISOS_JSON,
    justificacion: row.JUSTIFICACION,
    directrizDirector: row.DIRECTRIZ_DIRECTOR,
  };
}

function serializeUsuario(row: Record<string, any>) {
  return {
    idUsuario: row.ID_USUARIO_AUTO_INCREMENT,
    nombreCompleto: row.NOMBRE_COMPLETO,
    idRol: row.ID_ROL_FK,
    correo: row.CORREO_INSTITUCION,
    createdAt: row.CREATED_AT,
    updatedAt: row.UPDATE_AT,
    estado: row.ESTADO,
    intentos: row.intentos,
    elminado: row.elminado,
    ...(row.roles ? { rol: serializeRol(row.roles) } : {}),
  };
}

function serializeBitacora(row: Record<string, any>) {
  return {
    fecha: row.createdAt ? new Date(row.createdAt).toISOString() : '',
    usuario: row.usuarios?.NOMBRE_COMPLETO || 'Usuario Desconocido',
    rol: row.usuarios?.roles?.NOMBRE_ROL || 'Sin Rol',
    accion: row.action,
    modulo: row.tableName,
    ip: row.ip || '0.0.0.0',
  };
}

async function registrarAuditoria(
  fastify: FastifyInstance,
  request: FastifyRequest,
  action: string,
  tableName: string,
  recordId: string,
  details: Prisma.InputJsonValue
) {
  const userId = Number((request.user as any)?.sub ?? (request.user as any)?.user?.id ?? 0);
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

const crearUsuarioSchema = {
  type: 'object',
  required: ['nombre', 'correo', 'idRol'],
  properties: {
    nombre: { type: 'string' },
    correo: { type: 'string' },
    idRol: { type: 'integer' },
    estado: { type: 'boolean' },
  },
  additionalProperties: false,
} as const;

const actualizarUsuarioSchema = {
  type: 'object',
  properties: {
    nombreCompleto: { type: 'string' },
    correo: { type: 'string' },
    idRol: { type: 'integer' },
    estado: { type: 'boolean' },
    intentos: { type: 'integer' },
    elminado: { type: 'boolean' },
  },
  additionalProperties: false,
} as const;

export default async function usuariosRoutes(fastify: FastifyInstance) {
  // Listar usuarios (con rol, sin contraseña)
  fastify.get(
    '/api/v1/usuarios',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      try {
        const usuarios = await fastify.prisma.usuarios.findMany({
          include: { roles: true },
          orderBy: { CREATED_AT: 'desc' },
        });
        return { success: true, data: usuarios.map(serializeUsuario) };
      } catch (error) {
        request.log.error(error);
        return reply.code(500).send({ success: false, error: 'Ocurrió un error interno en el servidor.' });
      }
    }
  );

  // Crear usuario (hash + correo + auditoría)
  fastify.post<{ Body: { nombre: string; correo: string; idRol: number; estado?: boolean } }>(
    '/api/v1/usuarios',
    { preHandler: [fastify.authenticate], schema: { body: crearUsuarioSchema } },
    async (request, reply) => {
      try {
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

        await registrarAuditoria(fastify, request, `Crea usuario ${nuevoUsuario.CORREO_INSTITUCION}/${nuevoUsuario.NOMBRE_COMPLETO}`, 'usuarios', String(nuevoUsuario.ID_USUARIO_AUTO_INCREMENT), {
          nombreCompleto: nuevoUsuario.NOMBRE_COMPLETO,
          correo: nuevoUsuario.CORREO_INSTITUCION,
        });

        try {
          await transporter.sendMail({
            from: `"Soporte Metrología USC" <${process.env.SMTP_USER}>`,
            to: correo,
            subject: 'Bienvenido al Sistema de Metrología USC - Tu Cuenta ha sido Creada',
            html: `<p>Hola, ${nombre}. Tu cuenta fue creada. Contraseña temporal: <strong>${contraseñaTemporal}</strong></p>`,
          });
        } catch (mailError) {
          fastify.log.error(mailError);
          return { success: true, warning: `El usuario fue creado, pero falló el envío de correo. Compártele esta clave temporal: ${contraseñaTemporal}` };
        }

        return { success: true };
      } catch (error: any) {
        fastify.log.error(error);
        if (error?.code === 'P2002') {
          return reply.code(409).send({ success: false, error: 'El correo institucional ya se encuentra registrado.' });
        }
        return reply.code(500).send({ success: false, error: 'Error interno del servidor al procesar el registro.' });
      }
    }
  );

  // Actualizar usuario
  fastify.put<{ Params: { id: string }; Body: Record<string, any> }>(
    '/api/v1/usuarios/:id',
    { preHandler: [fastify.authenticate], schema: { body: actualizarUsuarioSchema } },
    async (request, reply) => {
      try {
        const idUsuario = Number(request.params.id);
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

        const action = datos.estado !== undefined
          ? `cambio a ${datos.estado} el estado del usuario ${actualizado.CORREO_INSTITUCION}/${actualizado.NOMBRE_COMPLETO}`
          : `actualizacion de datos de usuario  ${actualizado.CORREO_INSTITUCION}/${actualizado.NOMBRE_COMPLETO}`;

        await registrarAuditoria(fastify, request, action, 'usuarios', String(actualizado.ID_USUARIO_AUTO_INCREMENT), {
          nombreCompleto: actualizado.NOMBRE_COMPLETO,
          correo: actualizado.CORREO_INSTITUCION,
        });

        return { success: true };
      } catch (error) {
        request.log.error(error);
        return reply.code(500).send({ success: false, error: 'Error de servidor al intentar guardar el cambio.' });
      }
    }
  );

  // Eliminar usuario (soft delete)
  fastify.delete<{ Params: { id: string } }>(
    '/api/v1/usuarios/:id',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      try {
        const idUsuario = Number(request.params.id);
        const userId = Number((request.user as any)?.sub ?? 0);
        if (userId === idUsuario) {
          return reply.code(400).send({ success: false, error: 'No puedes eliminar tu propia cuenta de usuario.' });
        }

        const existente = await fastify.prisma.usuarios.findUnique({
          where: { ID_USUARIO_AUTO_INCREMENT: idUsuario },
        });
        if (!existente) return reply.code(404).send({ success: false, error: 'El usuario que intentas eliminar no existe.' });
        if (existente.elminado) return reply.code(400).send({ success: false, error: 'El usuario ya se encuentra eliminado.' });

        const actualizado = await fastify.prisma.usuarios.update({
          where: { ID_USUARIO_AUTO_INCREMENT: idUsuario },
          data: { elminado: true, ESTADO: false },
        });

        await registrarAuditoria(fastify, request, `Eleminar usuario ${actualizado.CORREO_INSTITUCION}/${actualizado.NOMBRE_COMPLETO}`, 'usuarios', String(actualizado.ID_USUARIO_AUTO_INCREMENT), {
          nombreCompleto: actualizado.NOMBRE_COMPLETO,
          correo: actualizado.CORREO_INSTITUCION,
        });

        return { success: true, message: 'Usuario eliminado correctamente.' };
      } catch (error) {
        request.log.error(error);
        return reply.code(500).send({ success: false, error: 'Error interno del servidor al procesar la eliminación.' });
      }
    }
  );

  // Restaurar usuario
  fastify.patch<{ Params: { id: string } }>(
    '/api/v1/usuarios/:id/restaurar',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      try {
        const idUsuario = Number(request.params.id);

        const existente = await fastify.prisma.usuarios.findUnique({
          where: { ID_USUARIO_AUTO_INCREMENT: idUsuario },
        });
        if (!existente) return reply.code(404).send({ success: false, error: 'El usuario que intentas restaurar no existe.' });
        if (!existente.elminado) return reply.code(400).send({ success: false, error: 'El usuario ya se encuentra activo y no está eliminado.' });

        const actualizado = await fastify.prisma.usuarios.update({
          where: { ID_USUARIO_AUTO_INCREMENT: idUsuario },
          data: { elminado: false, ESTADO: true, intentos: 0 },
        });

        await registrarAuditoria(fastify, request, `Restaura usuario ${actualizado.CORREO_INSTITUCION}/${actualizado.NOMBRE_COMPLETO}`, 'usuarios', String(actualizado.ID_USUARIO_AUTO_INCREMENT), {
          nombreCompleto: actualizado.NOMBRE_COMPLETO,
          correo: actualizado.CORREO_INSTITUCION,
        });

        return { success: true, message: 'Usuario restaurado y activado correctamente.' };
      } catch (error) {
        request.log.error(error);
        return reply.code(500).send({ success: false, error: 'Error interno del servidor al procesar la restauración.' });
      }
    }
  );

  // Restablecer contraseña
  fastify.post<{ Params: { id: string } }>(
    '/api/v1/usuarios/:id/restablecer',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      try {
        const idUsuario = Number(request.params.id);

        const usuario = await fastify.prisma.usuarios.findUnique({
          where: { ID_USUARIO_AUTO_INCREMENT: idUsuario },
          select: { NOMBRE_COMPLETO: true, CORREO_INSTITUCION: true },
        });
        if (!usuario) return reply.code(404).send({ success: false, error: 'El usuario especificado no existe.' });

        const nuevaContrasenaTemporal = generarContrasenaTemporal(usuario.NOMBRE_COMPLETO);
        const contrasenaHasheada = await argon2.hash(nuevaContrasenaTemporal, { type: argon2.argon2id });

        const actualizado = await fastify.prisma.usuarios.update({
          where: { ID_USUARIO_AUTO_INCREMENT: idUsuario },
          data: { contrase_a: contrasenaHasheada },
        });

        await registrarAuditoria(fastify, request, `Restablecer contraeña  de ${actualizado.CORREO_INSTITUCION}/${actualizado.NOMBRE_COMPLETO}`, 'usuarios', String(actualizado.ID_USUARIO_AUTO_INCREMENT), {
          nombreCompleto: actualizado.NOMBRE_COMPLETO,
          correo: actualizado.CORREO_INSTITUCION,
        });

        try {
          await transporter.sendMail({
            from: `"Soporte Metrología USC" <${process.env.SMTP_USER}>`,
            to: usuario.CORREO_INSTITUCION,
            subject: 'Restablecimiento de Contraseña - Metrología USC',
            html: `<p>Hola, ${usuario.NOMBRE_COMPLETO}. Tu nueva contraseña temporal es: <strong>${nuevaContrasenaTemporal}</strong></p>`,
          });
        } catch (mailError) {
          fastify.log.error(mailError);
          return { success: true, warning: `Contraseña restablecida en el sistema, pero falló el envío del correo. Compártele la clave temporal manualmente: ${nuevaContrasenaTemporal}` };
        }

        return { success: true };
      } catch (error) {
        request.log.error(error);
        return reply.code(500).send({ success: false, error: 'Error interno del servidor al intentar restablecer la contraseña.' });
      }
    }
  );

  // Obtener roles
  fastify.get(
    '/api/v1/roles',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      try {
        const roles = await fastify.prisma.roles.findMany({
          orderBy: { ID_ROL_INCREMENT: 'asc' },
        });
        return { success: true, data: roles.map(serializeRol) };
      } catch (error) {
        request.log.error(error);
        return reply.code(500).send({ success: false, error: 'No se pudieron cargar los roles' });
      }
    }
  );

  // Obtener bitácora
  fastify.get(
    '/api/v1/bitacora',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      try {
        const logs = await fastify.prisma.audit_logs.findMany({
          include: { usuarios: { include: { roles: true } } },
          orderBy: { createdAt: 'desc' },
        });
        return { success: true, data: logs.map(serializeBitacora) };
      } catch (error) {
        request.log.error(error);
        return reply.code(500).send({ success: false, error: 'Ocurrió un error interno en el servidor al intentar cargar la bitácora.' });
      }
    }
  );
}
