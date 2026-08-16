'use server';

import { prisma } from "@/app/lib/data_base/prisma";
import { auth } from '@/app/Login/types/auth';
import { Estados, Prisma } from '@prisma/client';
import { CotizacionModel } from "@/tipos/entidades";
import type {
  CotizacionConDetalles,
  CrearCotizacionInput,
  ActualizarCotizacionInput,
  ObtenerCotizacionesParams,
  DetalleInput,
} from "@/tipos/cotizacion";
import { transicionesValidas } from "@/tipos/cotizacion";
import type { ActionResponse } from "@/tipos/comunes";

// ==========================================
// VALIDACIÓN DE PERMISOS (sin cambios)
// ==========================================
async function validarPermiso(accion: 'consultar' | 'desactivar' | 'crear_editar' | 'ver_historial') {
  const session = await auth();
  if (!session?.user) {
    return { autorizado: false, error: 'No autenticado' };
  }
  const permisos = session.user?.permissions?.permisos?.cotizaciones;
  if (!permisos?.[accion]) {
    return { autorizado: false, error: `Acceso denegado: No tienes permisos para ${accion} cotizaciones.` };
  }
  return { autorizado: true };
}

// ==========================================
// CREAR COTIZACIÓN (con estado)
// ==========================================
export async function crearCotizacion(
  data: CrearCotizacionInput
): Promise<ActionResponse<CotizacionConDetalles>> {
  const perm = await validarPermiso('crear_editar');
  if (!perm.autorizado) return { ok: false, error: perm.error };

  const session = await auth();
  const idUsuario = session?.user?.id_user;
  if (!idUsuario) return { ok: false, error: 'No se pudo identificar al usuario' };

  try {
    const resultado = await prisma.$transaction(async (tx) => {
      // Cálculo de detalles (sin cambios)
      let subtotalDetalles = 0;
      const detallesMapeados = data.detalles.map((d) => {
        const valorTotal = d.cantidad * d.valorUnitario;
        subtotalDetalles += valorTotal;
        return {
          equipoDescripcion: d.equipoDescripcion,
          tipoServicio: d.tipoServicio,
          magnitud: d.magnitud,
          normaTecnica: d.normaTecnica,
          cantidad: d.cantidad,
          valorUnitario: new Prisma.Decimal(d.valorUnitario),
          valorTotal: new Prisma.Decimal(valorTotal),
        };
      });

      const viaticos = data.viaticos || 0;
      const descuentoPorcentaje = data.descuento || 0;
      const subtotalConViaticos = subtotalDetalles + viaticos;
      const montoTotal = subtotalConViaticos - (subtotalConViaticos * (descuentoPorcentaje / 100));

      const estado = data.estado || Estados.BORRADOR;

      // Crear la cotización
      const nuevaCotizacion = await tx.cotizacion.create({
        data: {
          codigo: data.codigo,
          idCliente: data.idCliente,
          viaticos: new Prisma.Decimal(viaticos),
          descuento: descuentoPorcentaje,
          montoTotal: new Prisma.Decimal(montoTotal),
          estado,
          detalles: { create: detallesMapeados },
        },
        include: { detalles: true, cliente: true },
      });

      // Registro en historial de estados
      const historialData: any[] = [];
      if (estado === Estados.ENVIADA) {
        // Si se envía directamente, se registra el paso por BORRADOR y luego ENVIADA
        historialData.push({
          idCotizacion: nuevaCotizacion.idCotizacion,
          estadoAnterior: null,
          estadoNuevo: Estados.BORRADOR,
          idUsuario,
        });
      }
      historialData.push({
        idCotizacion: nuevaCotizacion.idCotizacion,
        estadoAnterior: estado === Estados.ENVIADA ? Estados.BORRADOR : null,
        estadoNuevo: estado,
        idUsuario,
      });

      await tx.historialEstadoCotizacion.createMany({ data: historialData });

      // ====================================================
      // TODO: GENERAR DOCUMENTO EXCEL INICIAL Y SUBIR A STORAGE
      // ====================================================
      // const excelBuffer = await generarExcelCotizacion(nuevaCotizacion);
      // const documento = await tx.documento.create({ ... });
      // await tx.cotizacion.update({ ... asociar documento ... });

      return nuevaCotizacion;
    });

    return { ok: true, data: resultado };
  } catch (error: any) {
    return { ok: false, error: error.message || 'Error al crear la cotización' };
  }
}

// ==========================================
// OBTENER COTIZACIÓN POR ID (sin cambios)
// ==========================================
export async function obtenerCotizacionPorId(
  idCotizacion: number
): Promise<ActionResponse<CotizacionConDetalles>> {
  const perm = await validarPermiso('consultar');
  if (!perm.autorizado) return { ok: false, error: perm.error };

  try {
    const cotizacion = await prisma.cotizacion.findUnique({
      where: { idCotizacion },
      include: {
        cliente: true,
        detalles: true,
        ordenes: true,
        recepciones: true,
        documentos: true,
      },
    });

    if (!cotizacion) return { ok: false, error: 'Cotización no encontrada' };
    return { ok: true, data: cotizacion };
  } catch (error: any) {
    return { ok: false, error: error.message || 'Error al obtener la cotización' };
  }
}

// ==========================================
// ACTUALIZAR COTIZACIÓN (sin cambios)
// ==========================================
export async function actualizarCotizacion(
  data: ActualizarCotizacionInput
): Promise<ActionResponse<CotizacionConDetalles>> {
  const perm = await validarPermiso('crear_editar');
  if (!perm.autorizado) return { ok: false, error: perm.error };

  const session = await auth();
  const idUsuario = session?.user?.id_user;
  if (!idUsuario) return { ok: false, error: 'No se pudo identificar al usuario' };

  try {
    const resultado = await prisma.$transaction(async (tx) => {
      const existente = await tx.cotizacion.findUnique({
        where: { idCotizacion: data.idCotizacion },
        include: { detalles: true },
      });
      if (!existente) throw new Error('Cotización no encontrada');

      // Procesar detalles si se envían
      let detallesMapeados: any[] | undefined;
      let subtotal = 0;
      if (data.detalles) {
        await tx.cotizacionDetalle.deleteMany({ where: { idCotizacion: data.idCotizacion } });
        detallesMapeados = data.detalles.map((d) => {
          const valorTotal = d.cantidad * d.valorUnitario;
          subtotal += valorTotal;
          return {
            equipoDescripcion: d.equipoDescripcion,
            tipoServicio: d.tipoServicio,
            magnitud: d.magnitud,
            normaTecnica: d.normaTecnica,
            cantidad: d.cantidad,
            valorUnitario: new Prisma.Decimal(d.valorUnitario),
            valorTotal: new Prisma.Decimal(valorTotal),
          };
        });
      } else {
        // Mantener detalles existentes y recalcular subtotal
        subtotal = existente.detalles.reduce((acc, d) => acc + d.cantidad * Number(d.valorUnitario), 0);
      }

      const viaticos = data.viaticos !== undefined ? data.viaticos : Number(existente.viaticos || 0);
      const descuento = data.descuento !== undefined ? data.descuento : Number(existente.descuento || 0);
      const subtotalConViaticos = subtotal + viaticos;
      const montoTotal = subtotalConViaticos - (subtotalConViaticos * (descuento / 100));

      // Si cambia el estado, validar transición
      if (data.estado && data.estado !== existente.estado) {
        const permitidos = transicionesValidas[existente.estado] || [];
        if (!permitidos.includes(data.estado)) {
          throw new Error(`Transición no permitida de ${existente.estado} a ${data.estado}`);
        }
      }

      const cotizacionActualizada = await tx.cotizacion.update({
        where: { idCotizacion: data.idCotizacion },
        data: {
          ...(data.codigo && { codigo: data.codigo }),
          ...(data.idCliente && { idCliente: data.idCliente }),
          ...(data.estado && { estado: data.estado }),
          viaticos: new Prisma.Decimal(viaticos),
          descuento,
          montoTotal: new Prisma.Decimal(montoTotal),
          ...(detallesMapeados && { detalles: { create: detallesMapeados } }),
        },
        include: {
          cliente: true,
          detalles: true,
          historialEstados: {
            include: { usuario: { select: { nombreCompleto: true } } }
          }
        },
      });

      // Registrar historial si cambió el estado
      if (data.estado && data.estado !== existente.estado) {
        await tx.historialEstadoCotizacion.create({
          data: {
            idCotizacion: data.idCotizacion,
            estadoAnterior: existente.estado,
            estadoNuevo: data.estado,
            idUsuario,
          },
        });
      }

      // ====================================================
      // TODO: GENERAR NUEVA VERSIÓN DE DOCUMENTO EXCEL
      // ====================================================
      // if (detallesMapeados) {
      //   const nuevoExcel = await generarExcelCotizacion(cotizacionActualizada);
      //   const versionDocumento = await tx.documento.create({ ... });
      //   // asociar versión a la cotización
      // }

      return cotizacionActualizada;
    });

    return { ok: true, data: resultado };
  } catch (error: any) {
    return { ok: false, error: error.message || 'Error al actualizar la cotización' };
  }
}
// ==========================================
// CAMBIAR ESTADO (ya existente)
// ==========================================

export async function cambiarEstadoCotizacion(
  idCotizacion: number,
  nuevoEstado: Estados
): Promise<ActionResponse<CotizacionConDetalles>> {
  const perm = await validarPermiso('crear_editar');
  if (!perm.autorizado) return { ok: false, error: perm.error };

  const session = await auth();
  const idUsuario = session?.user?.id_user;
  if (!idUsuario) return { ok: false, error: 'No se pudo identificar al usuario' };

  try {
    const resultado = await prisma.$transaction(async (tx) => {
      const actual = await tx.cotizacion.findUnique({
        where: { idCotizacion },
        select: { estado: true },
      });
      if (!actual) throw new Error('Cotización no encontrada');

      // Validar transición permitida
      const permitidos = transicionesValidas[actual.estado] || [];
      if (!permitidos.includes(nuevoEstado)) {
        throw new Error(`Transición no permitida de ${actual.estado} a ${nuevoEstado}`);
      }

      const cotizacion = await tx.cotizacion.update({
        where: { idCotizacion },
        data: { estado: nuevoEstado },
        include: {
          cliente: true,
          detalles: true,
          historialEstados: {
            include: { usuario: { select: { nombreCompleto: true } } }
          }
        },
      });

      // Registrar historial
      await tx.historialEstadoCotizacion.create({
        data: {
          idCotizacion,
          estadoAnterior: actual.estado,
          estadoNuevo: nuevoEstado,
          idUsuario,
        },
      });

      // ====================================================
      // TODO: SI PASA A APROBADA, CREAR ORDEN DE TRABAJO AUTOMÁTICA
      // ====================================================
      // if (nuevoEstado === Estados.APROBADA) {
      //   await crearOrdenTrabajoDesdeCotizacion(cotizacion, idUsuario, tx);
      // }

      return cotizacion;
    });

    return { ok: true, data: resultado };
  } catch (error: any) {
    return { ok: false, error: error.message || 'Error al cambiar el estado' };
  }
}
// ==========================================
// OBTENER TODAS (sin cambios)
// ==========================================
export async function obtenerTodasLasCotizaciones(
  params?: ObtenerCotizacionesParams
): Promise<ActionResponse<CotizacionModel[]>> {
  try {
    const page = params?.page || 1;
    const limit = params?.limit || 10;
    const skip = (page - 1) * limit;

    const where: Prisma.CotizacionWhereInput = {
      ...(params?.estado && { estado: params.estado }),
      ...(params?.idCliente && { idCliente: params.idCliente }),
      ...(params?.busqueda && {
        codigo: {
          contains: params.busqueda,
          mode: 'insensitive',
        },
      }),
    };

    const [total, cotizaciones] = await prisma.$transaction([
      prisma.cotizacion.count({ where }),
      prisma.cotizacion.findMany({
        where,
        take: limit,
        skip,
        orderBy: { createdAt: 'desc' },
        include: {
          cliente: true,
          detalles: true,
          historialEstados:true,
          Historiacambios:true,
          _count: {
            select: {
              ordenes: true,
              recepciones: true,
              documentos: true,
              historialEstados:true,
             
            },
          },
         
        },
      }),
    ]);

    return {
      ok: true,
      data: cotizaciones,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  } catch (error: any) {
    return {
      ok: false,
      error: error.message || 'Error al obtener la lista de cotizaciones'
    };
  }
}