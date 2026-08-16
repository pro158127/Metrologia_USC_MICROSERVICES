// app/actions/ordenes.actions.ts
'use server';

import prisma from '@/app/lib/data_base/prisma';

export async function obtenerDatosIniciales() {
  try {
    const [ordenes, clientes, usuarios, roles, tarifas, version] = await Promise.all([
      prisma.ordenTrabajo.findMany({
        include: {
          cliente: true,
          cotizacion: { include: { cliente: true } },
          instrumentos: true,
        },
        orderBy: { createdAt: 'desc' },
      }),

      prisma.cliente.findMany(),

      prisma.usuario.findMany({
        omit: {
          contraseña: true,
        },
        include: { rol: true },
        where: { elminado: false },
      }),

      // Asegúrate de usar la propiedad exacta generada por Prisma Client (Roles)
      prisma.roles.findMany(),

      prisma.tarifa.findMany({
        include: {
          historial: true,
        },
      }),

     prisma.documento.findMany({
        include: {
          versiones: true,
        },
      }),
    ]);

    return {
      ordenes,
      clientes,
      usuarios,
      roles,
      tarifas,
      version,
    };
  } catch (error) {
    console.error('Error cargando datos iniciales:', error);
    // Devuelve arreglos vacíos explícitos en lugar de undefined o lanzar throw
    return {
      ordenes: [],
      clientes: [],
      usuarios: [],
      roles: [],
      tarifas: [],
      version: [],
    };
  }
}