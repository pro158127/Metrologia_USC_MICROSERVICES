
'use server';

import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

// 1. Tipo serializable plano para el cliente
export type TarifaModel = Omit<
  Prisma.TarifaGetPayload<{ include: { historial: true } }>,
  'historial'
> & {
  historial: Array<
    Omit<Prisma.HistorialTarifaGetPayload<{}>, 'precioU'> & {
      precioU: number;
    }
  >;
};

export type ResponseAction<T> = {
  ok: boolean;
  data?: T;
  error?: string;
};

// Helper interno para sanitizar las instancias de Decimal
function serializeTarifa(
  tarifa: Prisma.TarifaGetPayload<{ include: { historial: true } }>
): TarifaModel {
  return {
    ...tarifa,
    historial: tarifa.historial.map((h) => ({
      ...h,
      precioU: h.precioU ? Number(h.precioU) : 0,
    })),
  };
}

// ==========================================
// 1. Obtener todas las tarifas
// ==========================================
export async function obtenerTodasLasTarifas(): Promise<ResponseAction<TarifaModel[]>> {
  try {
    const tarifas = await prisma.tarifa.findMany({
      include: {
        historial: {
          orderBy: { fechaInicio: 'desc' },
        },
      },
      orderBy: { idTarifa: 'desc' },
    });

    const tarifasSerializadas = tarifas.map(serializeTarifa);
    return { ok: true, data: tarifasSerializadas };
  } catch (error: any) {
    console.error('[obtenerTodasLasTarifas_ERROR]:', error);
    return { ok: false, error: 'Error al consultar el catálogo de tarifas.' };
  }
}

// ==========================================
// 2. Actualizar Tarifa (SCD2 + campos principales)
// ==========================================
export interface ActualizarTarifaInput {
  idTarifa: number;
  magnitud?: string;
  tipoServicio?: string;
  instrumento?: string;
  norma?: string;
  precioVigente?: number;    // Si se envía, se actualiza el precio con SCD2
  fechaInicio?: Date | string; // Fecha de inicio del nuevo precio (opcional)
  fechaFin?: Date | string | null; // Fecha de fin del nuevo precio (opcional)
}

export async function actulzar_tarifa(
  input: ActualizarTarifaInput
): Promise<ResponseAction<TarifaModel>> {
  const { idTarifa, precioVigente, fechaInicio, fechaFin, ...camposTarifa } = input;

  // Validar ID
  if (!idTarifa) return { ok: false, error: 'ID de tarifa requerido.' };

  try {
    // 1. Actualizar campos principales de la tarifa (si se proporcionan)
    const updateData: any = {};
    if (camposTarifa.magnitud) updateData.magnitud = camposTarifa.magnitud;
    if (camposTarifa.tipoServicio) updateData.tipoServicio = camposTarifa.tipoServicio;
    if (camposTarifa.instrumento) updateData.Instrumento = camposTarifa.instrumento;
    if (camposTarifa.norma) updateData.Norma = camposTarifa.norma;

    // 2. Si se envía un nuevo precio, manejar el historial (SCD2)
    if (precioVigente !== undefined && precioVigente !== null) {
      const ahora = new Date();
      const nuevaFechaInicio = fechaInicio ? new Date(fechaInicio) : ahora;
      const nuevaFechaFin = fechaFin ? new Date(fechaFin) : null;

      // Usamos transacción para asegurar consistencia
      await prisma.$transaction(async (tx) => {
        // Cerrar el historial vigente (fechaFin = null)
        await tx.historialTarifa.updateMany({
          where: {
            idTarifa: idTarifa,
            fechaFin: null,
          },
          data: { fechaFin: nuevaFechaInicio }, // El registro anterior termina cuando inicia el nuevo
        });

        // Crear nuevo registro histórico
        await tx.historialTarifa.create({
          data: {
            idTarifa: idTarifa,
            precioU: new Prisma.Decimal(precioVigente),
            fechaInicio: nuevaFechaInicio,
            fechaFin: nuevaFechaFin,
          },
        });
      });
    }

    // 3. Actualizar la tarifa (si hay campos para actualizar)
    let tarifaActualizada;
    if (Object.keys(updateData).length > 0) {
      tarifaActualizada = await prisma.tarifa.update({
        where: { idTarifa },
        data: updateData,
        include: { historial: { orderBy: { fechaInicio: 'desc' } } },
      });
    } else {
      // Si solo se actualizó el precio, recuperamos la tarifa con historial
      tarifaActualizada = await prisma.tarifa.findUniqueOrThrow({
        where: { idTarifa },
        include: { historial: { orderBy: { fechaInicio: 'desc' } } },
      });
    }

    return { ok: true, data: serializeTarifa(tarifaActualizada) };
  } catch (error: unknown) {
    const err = error as Error;
    console.error('[actulzar_tarifa_ERROR]:', err?.message || error);
    return { ok: false, error: 'Error al actualizar la tarifa.' };
  }
}

// ==========================================
// 3. Crear una nueva Tarifa (con fechas opcionales)
// ==========================================
export interface CrearTarifaInput {
  magnitud: string;
  tipoServicio: string;
  instrumento: string;        // antes magnitudCalibrar
  precioInicial: number;
  norma?: string;
  fechaInicio?: Date | string;
  fechaFin?: Date | string | null;
}

export async function crearTarifa(
  input: CrearTarifaInput
): Promise<ResponseAction<TarifaModel>> {
  try {
    const precio = Number(input.precioInicial);
    if (isNaN(precio) || precio < 0) {
      return { ok: false, error: 'El precio inicial debe ser un número válido.' };
    }

    const ahora = new Date();
    const fechaInicio = input.fechaInicio ? new Date(input.fechaInicio) : ahora;
    const fechaFin = input.fechaFin ? new Date(input.fechaFin) : null;

    const nuevaTarifa = await prisma.$transaction(async (tx) => {
      return await tx.tarifa.create({
        data: {
          magnitud: input.magnitud,
          tipoServicio: input.tipoServicio,
          Instrumento: input.instrumento,
          Norma: input.norma || 'n/a',
          estado: 'ACTIVO',
          historial: {
            create: {
              precioU: new Prisma.Decimal(precio),
              fechaInicio: fechaInicio,
              fechaFin: fechaFin,
            },
          },
        },
        include: { historial: true },
      });
    });

    return { ok: true, data: serializeTarifa(nuevaTarifa) };
  } catch (error: unknown) {
    const err = error as Error;
    console.error('[crearTarifa_ERROR]:', err?.message || error);
    return { ok: false, error: 'No se pudo crear la tarifa metrológica.' };
  }
}

// ==========================================
// 4. Actualizar solo el precio (mantenido para compatibilidad)
// ==========================================
export interface ActualizarPrecioTarifaInput {
  idTarifa: number;
  nuevoPrecio: number;
  fechaInicio?: Date | string;
  fechaFin?: Date | string | null;
}

export async function actualizarPrecioTarifa(
  input: ActualizarPrecioTarifaInput
): Promise<ResponseAction<TarifaModel>> {
  try {
    const ahora = new Date();
    const nuevaFechaInicio = input.fechaInicio ? new Date(input.fechaInicio) : ahora;
    const nuevaFechaFin = input.fechaFin ? new Date(input.fechaFin) : null;

    const tarifaActualizada = await prisma.$transaction(async (tx) => {
      // Cerrar el vigente
      await tx.historialTarifa.updateMany({
        where: {
          idTarifa: input.idTarifa,
          fechaFin: null,
        },
        data: { fechaFin: nuevaFechaInicio },
      });

      // Crear nuevo
      await tx.historialTarifa.create({
        data: {
          idTarifa: input.idTarifa,
          precioU: new Prisma.Decimal(input.nuevoPrecio),
          fechaInicio: nuevaFechaInicio,
          fechaFin: nuevaFechaFin,
        },
      });

      return await tx.tarifa.findUniqueOrThrow({
        where: { idTarifa: input.idTarifa },
        include: {
          historial: {
            orderBy: { fechaInicio: 'desc' },
          },
        },
      });
    });

    return { ok: true, data: serializeTarifa(tarifaActualizada) };
  } catch (error: any) {
    console.error('[actualizarPrecioTarifa_ERROR]:', error);
    return { ok: false, error: 'Error al actualizar el precio de la tarifa.' };
  }
}

// ==========================================
// 5. Cambiar Estado
// ==========================================
export async function cambiarEstadoTarifa(
  idTarifa: number,
  nuevoEstado: 'ACTIVO' | 'INACTIVO'
): Promise<ResponseAction<TarifaModel>> {
  try {
    const tarifa = await prisma.tarifa.update({
      where: { idTarifa },
      data: { estado: nuevoEstado },
      include: {
        historial: {
          orderBy: { fechaInicio: 'desc' },
        },
      },
    });

    return { ok: true, data: serializeTarifa(tarifa) };
  } catch (error: any) {
    console.error('[cambiarEstadoTarifa_ERROR]:', error);
    return { ok: false, error: 'Error al cambiar el estado de la tarifa.' };
  }
}