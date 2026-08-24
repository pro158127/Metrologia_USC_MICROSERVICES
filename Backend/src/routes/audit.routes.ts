import { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import ExcelJS from 'exceljs';
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod';
import { AppError } from '../lib/errors.js';
import { filtrosExportarSchema } from './audit.schemas.js';

function formatearDetalles(details: unknown): string {
  if (!details) return 'Sin detalles adicionales';
  if (typeof details === 'string') return details;

  if (typeof details === 'object') {
    const record = details as Record<string, unknown>;
    if (record.before || record.after) {
      let resultado = '';
      const before = record.before as Record<string, unknown> | undefined;
      const after = record.after as Record<string, unknown> | undefined;
      if (before && Object.keys(before).length > 0) {
        resultado += `Anterior: ${JSON.stringify(before)} | `;
      }
      if (after && Object.keys(after).length > 0) {
        resultado += `Nuevo: ${JSON.stringify(after)}`;
      }
      return resultado || 'Cambios vacíos';
    }

    if (record.mensaje || record.description) {
      return (record.mensaje || record.description) as string;
    }

    return JSON.stringify(record);
  }

  return JSON.stringify(details);
}

export default async function auditRoutes(fastify: FastifyInstance) {
  fastify.setValidatorCompiler(validatorCompiler);
  fastify.setSerializerCompiler(serializerCompiler);
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  app.post(
    '/api/audit/export',
    {
      preHandler: [fastify.authenticate],
      schema: { body: filtrosExportarSchema },
    },
    async (request, reply) => {
      const userRole =
        request.user.user?.permissions?.permisos?.administracion?.consultar_bitacora_auditoria;
      if (!userRole) {
        throw new AppError(403, 'Sin permisos de auditoría.');
      }

      const filtros = request.body;
      const whereClause: Prisma.audit_logsWhereInput = {};

      if (filtros.usuario || filtros.rol) {
        const userConditions: Prisma.usuariosWhereInput = {};

        if (filtros.usuario) {
          userConditions.NOMBRE_COMPLETO = {
            equals: filtros.usuario,
            mode: 'insensitive',
          };
        }

        if (filtros.rol) {
          userConditions.roles = {
            is: {
              NOMBRE_ROL: {
                equals: filtros.rol,
                mode: 'insensitive',
              },
            },
          };
        }

        whereClause.usuarios = { is: userConditions };
      }

      if (filtros.modulo) {
        whereClause.tableName = filtros.modulo;
      }

      if (filtros.fecha) {
        const inicio = new Date(filtros.fecha);
        inicio.setUTCHours(0, 0, 0, 0);

        const fin = new Date(filtros.fecha);
        fin.setUTCHours(23, 59, 59, 999);

        whereClause.createdAt = { gte: inicio, lte: fin };
      }

      const logs = await fastify.prisma.audit_logs.findMany({
        where: whereClause,
        include: {
          usuarios: {
            include: { roles: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Auditoría de Sistema');

      worksheet.columns = [
        { header: 'ID AUDIT', key: 'id', width: 12 },
        { header: 'FECHA Y HORA (COL)', key: 'fecha', width: 22 },
        { header: 'USUARIO AFECTADO', key: 'usuario', width: 25 },
        { header: 'ROL', key: 'rol', width: 18 },
        { header: 'ACCIÓN', key: 'action', width: 15 },
        { header: 'MÓDULO (TABLA)', key: 'tableName', width: 22 },
        { header: 'ID REGISTRO', key: 'recordId', width: 15 },
        { header: 'DIRECCIÓN IP', key: 'ip', width: 18 },
        { header: 'DETALLES DEL EVENTO', key: 'detalles', width: 50 },
      ];

      const headerRow = worksheet.getRow(1);
      headerRow.height = 28;
      headerRow.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
        cell.font = { name: 'Arial', bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      });

      logs.forEach((log) => {
        const row = worksheet.addRow({
          id: log.ID_AUDIT,
          fecha: new Date(log.createdAt).toLocaleString('es-CO', { timeZone: 'America/Bogota' }),
          usuario: log.usuarios?.NOMBRE_COMPLETO || `Usuario #${log.USER_ID}`,
          rol: log.usuarios.roles.NOMBRE_ROL || 'Sin rol',
          action: log.action.toUpperCase(),
          tableName: log.tableName,
          recordId: log.recordId || 'N/A',
          ip: log.ip || '0.0.0.0',
          detalles: formatearDetalles(log.details),
        });

        row.height = 22;
        row.eachCell((cell) => {
          cell.font = { name: 'Arial', size: 9 };
          cell.alignment = { vertical: 'middle' };
        });
      });

      const buffer = await workbook.xlsx.writeBuffer();

      return reply
        .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        .header('Content-Disposition', 'attachment; filename="auditoria_sistemas.xlsx"')
        .send(buffer);
    }
  );
}
