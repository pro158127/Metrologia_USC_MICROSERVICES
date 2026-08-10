import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { PrismaClient } from '@prisma/client';
import ExcelJS from 'exceljs';

const prisma = new PrismaClient();

interface FiltrosExportar {
  usuario?: string;
  modulo?: string;
  rol?: string;
  fecha?: string; // Formato esperado: "DD/MM/YY"
}

// Función auxiliar para parsear y hacer legible el JSON de 'details'
function formatearDetalles(details: any): string {
  if (!details) return "Sin detalles adicionales";
  if (typeof details === "string") return details;
  
  try {
    if (details.before || details.after) {
      let resultado = "";
      if (details.before && Object.keys(details.before).length > 0) {
        resultado += `Anterior: ${JSON.stringify(details.before)} | `;
      }
      if (details.after && Object.keys(details.after).length > 0) {
        resultado += `Nuevo: ${JSON.stringify(details.after)}`;
      }
      return resultado || "Cambios vacíos";
    }
    
    if (details.mensaje || details.description) {
      return details.mensaje || details.description;
    }
    
    return JSON.stringify(details);
  } catch {
    return String(details);
  }
}

export default async function auditRoutes(fastify: FastifyInstance) {
  fastify.post<{ Body: FiltrosExportar }>(
    '/api/audit/export',
    { preHandler: [fastify.authenticate] }, // Valida el JWT firmado con NEXTAUTH_SECRET
    async (request: FastifyRequest<{ Body: FiltrosExportar }>, reply: FastifyReply) => {
      try {
        // Validación opcional de permisos desde el payload del token decodificado
        console.log("llegoOOOOO")
        const userRole = request.user.user?.permissions?.permisos?.administracion?.consultar_bitacora_auditoria;
        if (!userRole) {
          return reply.code(403).send({ error: "Sin permisos de auditoría." });
        }

        const filtros = request?.body
        const whereClause: any = {};

// 2. FILTRADO DE USUARIO Y ROL (Relación 'user' -> 'rol')
if (filtros.usuario || filtros.rol) {
  const userConditions: any = {};

  if (filtros.usuario) {
    userConditions.NOMBRE_COMPLETO = {
      equals: filtros.usuario,
      mode: "insensitive",
    };
  }

  if (filtros.rol) {
    userConditions.roles = {
      is: {
        NOMBRE_ROL: {
          equals: filtros.rol,
          mode: "insensitive",
        },
      },
    };
  }

  // Se asigna a la relación 'user' definida en tu modelo AuditLog
  whereClause.usuarios = {
    is: userConditions,
  };
}

// 3. FILTRADO POR MÓDULO (Mapeado a 'tableName' en AuditLog)
if (filtros.modulo) {
  whereClause.tableName = filtros.modulo;
}

// 4. FILTRADO POR FECHA (Rango completo del día en UTC)
console.log(filtros.fecha)
if (filtros.fecha) {
  // Aseguramos que la fecha se procese correctamente independientemente de la zona horaria local del servidor
  const [dia, mes, año] = filtros.fecha.split("/");

const fechaInicio = new Date(
  `20${año}-${mes}-${dia}T00:00:00.000Z`
);

const fechaFin = new Date(
  `20${año}-${mes}-${dia}T23:59:59.999Z`
);

whereClause.createdAt = {
  gte: fechaInicio,
  lte: fechaFin,
};
}

    // 3. Filtrado por Módulo (mapeado directamente a 'tableName' en tu base de datos)
    if (filtros.modulo) {
      whereClause.tableName = filtros.modulo;
    }

    // 4. Filtrado exacto del día por 'createdAt'
    if (filtros.fecha) {
      const inicio = new Date(filtros.fecha);
      inicio.setUTCHours(0, 0, 0, 0);

      const fin = new Date(filtros.fecha);
      fin.setUTCHours(23, 59, 59, 999);

      whereClause.createdAt = {
        gte: inicio,
        lte: fin,
      };
    }
    console.log(whereClause)
    // Consulta robusta a Prisma con la relación cargada
const logs = await prisma.audit_logs.findMany({
  where: whereClause,
  include: {
    usuarios: {
      include: {
        roles: true, // 👈 Cargamos la relación del Rol que está dentro del Usuario
      },
    },
  },
  orderBy: {
    createdAt: "desc",
  },
});

        // Generación de Excel con ExcelJS
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet("Auditoría de Sistema");

        worksheet.columns = [
          { header: "ID AUDIT", key: "id", width: 12 },
          { header: "FECHA Y HORA (COL)", key: "fecha", width: 22 },
          { header: "USUARIO AFECTADO", key: "usuario", width: 25 },
          { header: "ROL", key: "rol", width: 18 },
          { header: "ACCIÓN", key: "action", width: 15 },
          { header: "MÓDULO (TABLA)", key: "tableName", width: 22 },
          { header: "ID REGISTRO", key: "recordId", width: 15 },
          { header: "DIRECCIÓN IP", key: "ip", width: 18 },
          { header: "DETALLES DEL EVENTO", key: "detalles", width: 50 },
        ];

        // Estilo Slate 800 para el encabezado
        const headerRow = worksheet.getRow(1);
        headerRow.height = 28;
        headerRow.eachCell((cell) => {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E293B" } };
          cell.font = { name: "Arial", bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
          cell.alignment = { vertical: "middle", horizontal: "center" };
        });

        // Inserción de filas
        logs.forEach((log) => {
          const row = worksheet.addRow({
            id: log.ID_AUDIT,
            fecha: new Date(log.createdAt).toLocaleString("es-CO", { timeZone: "America/Bogota" }),
            usuario: log.usuarios?.NOMBRE_COMPLETO || `Usuario #${log.USER_ID}`,
            rol: log.usuarios.roles.NOMBRE_ROL|| "Sin rol",
            action: log.action.toUpperCase(),
            tableName: log.tableName,
            recordId: log.recordId || "N/A",
            ip: log.ip || "0.0.0.0",
            detalles: formatearDetalles(log.details),
          });

          row.height = 22;
          row.eachCell((cell) => {
            cell.font = { name: "Arial", size: 9 };
            cell.alignment = { vertical: "middle" };
          });
        });

        const buffer = await workbook.xlsx.writeBuffer();

        return reply
          .header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
          .header("Content-Disposition", 'attachment; filename="auditoria_sistemas.xlsx"')
          .send(buffer);

      } catch (error: any) {
        request.log.error("Error crítico exportando bitácora:", error);
        return reply.code(500).send({ error: "Error en el servidor al compilar la bitácora." });
      }
    }
  );
}