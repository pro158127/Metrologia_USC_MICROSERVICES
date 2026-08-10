import { NextResponse } from "next/server";
import { auth } from "@/app/Login/types/auth";
import prisma from "@/app/lib/data_base/prisma";
import ExcelJS from "exceljs";

interface FiltrosExportar {
  usuario: string;
  modulo: string;
  rol: string;
  fecha: string;
}

// Función auxiliar para parsear y hacer legible el JSON de 'details' en el Excel
function formatearDetalles(details: any): string {
  if (!details) return "Sin detalles adicionales";
  if (typeof details === "string") return details;
  
  try {
    // Si contiene diferencias típicas de auditoría (old vs new), las estructuramos legibles
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
    
    // Si es un objeto de descripción simple
    if (details.mensaje || details.description) {
      return details.mensaje || details.description;
    }
    
    return JSON.stringify(details);
  } catch {
    return String(details);
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session || !session.user) {
      return NextResponse.json({ error: "No autenticado." }, { status: 401 });
    }

    const permisos = session.user?.permissions?.permisos;
    if (!permisos?.administracion?.consultar_bitacora_auditoria) {
      return NextResponse.json({ error: "Sin permisos de auditoría." }, { status: 403 });
    }

    const filtros: FiltrosExportar = await request.json();

    // CONSTRUCCIÓN DEL WHERE ADAPTADO A TU MODELO REAL
 const whereClause: any = {};

// 2. FILTRADO DE USUARIO Y ROL (Relación 'user' -> 'rol')
if (filtros.usuario || filtros.rol) {
  const userConditions: any = {};

  if (filtros.usuario) {
    userConditions.nombreCompleto = {
      equals: filtros.usuario,
      mode: "insensitive",
    };
  }

  if (filtros.rol) {
    userConditions.rol = {
      is: {
        nombreRol: {
          equals: filtros.rol,
          mode: "insensitive",
        },
      },
    };
  }

  // Se asigna a la relación 'user' definida en tu modelo AuditLog
  whereClause.user = {
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
const logs = await prisma.auditLog.findMany({
  where: whereClause,
  include: {
    user: {
      include: {
        rol: true, // 👈 Cargamos la relación del Rol que está dentro del Usuario
      },
    },
  },
  orderBy: {
    createdAt: "desc",
  },
});

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Auditoría de Sistema");

    // Estructura de columnas optimizada
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

    // Estilo elegante Slate 800 para el header
    const headerRow = worksheet.getRow(1);
    headerRow.height = 28;
    headerRow.eachCell((cell) => {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF1E293B" },
      };
      cell.font = {
        name: "Arial",
        bold: true,
        color: { argb: "FFFFFFFF" },
        size: 10,
      };
      cell.alignment = { vertical: "middle", horizontal: "center" };
    });

    // Añadir datos formateados
    logs.forEach((log) => {
      const row = worksheet.addRow({
        id: log.id,
        fecha: new Date(log.createdAt).toLocaleString("es-CO", { timeZone: "America/Bogota" }),
        usuario: log.user?.nombreCompleto || `Usuario #${log.userId}`, // Fallback al id si no hay nombre
        rol: log.user?.rol.nombreRol || "Sin rol",
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

    return new Response(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="auditoria_sistemas.xlsx"',
      },
    });

  } catch (error: any) {
    console.error("Error crítico exportando bitácora:", error);
    return NextResponse.json(
      { error: "Error en el servidor al compilar la bitácora." },
      { status: 500 }
    );
  }
}