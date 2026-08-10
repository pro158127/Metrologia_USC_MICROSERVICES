// app/actions/ordenes.actions.ts
'use server';

import prisma from '@/app/lib/data_base/prisma';

/**
 * Obtiene todos los datos iniciales necesarios para el módulo de órdenes.
 * Se llama una sola vez al montar el componente.
 */
export async function obtenerDatosIniciales() {
  try {
    const [ordenes, clientes, usuarios,roles,tarifas,version] = await Promise.all([
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
        omit:{
             contraseña:true
        },
        include: { rol: true },
        where: { elminado: false },
      }),

      prisma.roles.findMany(),
      
     prisma.tarifa.findMany(
        {
             include:{
                historial:true
             }
        }
     ),

     prisma.documento.findMany({
     include:{
      versiones:true
     }
     })
    ]);

    return {
      ordenes,
      clientes,
      usuarios,
      roles,
      tarifas,
      version

    };
  } catch (error) {
    console.error('Error cargando datos iniciales:', error);
    throw new Error('No se pudieron cargar los datos iniciales');
  }
}

// ... resto de acciones (crear, actualizar, etc.)