'use server';

import { prisma } from '@/app/lib/data_base/prisma'; // Asegúrate de tener el cliente Prisma configurado
import type { RecepcionEquipoModel } from '@/app/componets/tables_recharge'; // Opcional, para tipado

// Definimos el tipo de salida exacto (coincide con el del frontend)
export interface RecepcionConInfo {
  idRecepcion: number;
  codigo: string;
  clienteNombre: string;
  fecha: string;
  cantidadInstrumentos: number;
  codigoCotizacion?: string;
  codigoOT?: string;
  raw: any; // O puedes usar RecepcionEquipoModel, pero con relaciones incluidas
}

/**
 * Obtiene todas las recepciones de equipo enriquecidas con datos de cliente,
 * cotización, orden de trabajo y cantidad de instrumentos.
 * @returns Promise<RecepcionConInfo[]>
 */
export async function getRecepcionesEnriquecidas(): Promise<RecepcionConInfo[]> {
  try {
    // Consulta con todas las relaciones necesarias
    const recepciones = await prisma.recepcionEquipo.findMany({
      include: {
        instrumentos: true,
        cotizacion: {
          include: {
            cliente: true,
          },
        },
        ordenTrabajo: {
          include: {
            cliente: true,
            cotizacion: true,
          },
        },
        documentos: true, // si se necesitan para la UI
      },
      orderBy: {
        fechaRecepcion: 'desc',
      },
    });

    // Mapear a la estructura que espera el frontend
    const enriquecidas: RecepcionConInfo[] = recepciones.map((rec) => {
      // Determinar el nombre del cliente priorizando: cotización > orden de trabajo
      let clienteNombre = 'Cliente no especificado';
      if (rec.cotizacion?.cliente?.razonSocial) {
        clienteNombre = rec.cotizacion.cliente.razonSocial;
      } else if (rec.ordenTrabajo?.cliente?.razonSocial) {
        clienteNombre = rec.ordenTrabajo.cliente.razonSocial;
      } else if (rec.idCotizacion && rec.cotizacion?.cliente) {
        clienteNombre = rec.cotizacion.cliente.razonSocial || 'Sin razón social';
      } else if (rec.idOrdenTrabajo && rec.ordenTrabajo?.cliente) {
        clienteNombre = rec.ordenTrabajo.cliente.razonSocial || 'Sin razón social';
      }

      const codigoCotizacion = rec.cotizacion?.codigo || '';
      const codigoOT = rec.ordenTrabajo?.codigo || '';

      return {
        idRecepcion: rec.idRecepcion,
        codigo: rec.codigo || `REC-${rec.idRecepcion}`,
        clienteNombre,
        fecha: rec.fechaRecepcion ? rec.fechaRecepcion.toISOString().split('T')[0] : '',
        cantidadInstrumentos: rec.instrumentos?.length || 0,
        codigoCotizacion,
        codigoOT,
        raw: rec, // Puedes omitir raw si no lo necesitas en el frontend
      };
    });

    return enriquecidas;
  } catch (error) {
    console.error('Error al obtener recepciones enriquecidas:', error);
    throw new Error('No se pudieron cargar las recepciones');
  }
}


import { Decimal } from '@prisma/client/runtime/library';

// Helper para serializar objetos que contienen Decimal y Date
function serializeData<T>(data: T): T {
  return JSON.parse(
    JSON.stringify(data, (key, value) => {
      if (value instanceof Decimal) {
        return value.toNumber(); // o value.toString() si quieres preservar precisión
      }
      if (value instanceof Date) {
        return value.toISOString();
      }
      return value;
    })
  );
}

export async function getInitialData() {
  try {
    const [recepciones, clientes, cotizaciones, ordenes, tarifas] = await prisma.$transaction([
      prisma.recepcionEquipo.findMany({
        include: {
          instrumentos: true,
          cotizacion: {
            include: {
              cliente: true,
            },
          },
          ordenTrabajo: {
            include: {
              cliente: true,
              cotizacion: true,
            },
          },
          documentos: true,
        },
        orderBy: { fechaRecepcion: 'desc' },
      }),
      prisma.cliente.findMany({ orderBy: { razonSocial: 'asc' } }),
      prisma.cotizacion.findMany({
        include: {
          cliente: { select: { idCliente: true, razonSocial: true, correo: true } },
          detalles: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.ordenTrabajo.findMany({
        include: {
          cliente: { select: { idCliente: true, razonSocial: true, correo: true } },
          cotizacion: { select: { idCotizacion: true, codigo: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.tarifa.findMany({
        include: { historial: true },
        orderBy: { Instrumento: 'asc' },
      }),
    ]);

    // Serializar todos los datos
    return {
      recepciones: serializeData(recepciones),
      clientes: serializeData(clientes),
      cotizaciones: serializeData(cotizaciones),
      ordenes: serializeData(ordenes),
      tarifas: serializeData(tarifas),
    };
  } catch (error) {
    console.error('❌ Error en getInitialData:', error);
    throw new Error('No se pudieron cargar los datos iniciales');
  }
}