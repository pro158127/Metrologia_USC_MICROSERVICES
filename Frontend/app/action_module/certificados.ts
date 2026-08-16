'use server';

import { prisma } from "@/app/lib/data_base/prisma";
import type {
  CertificadoModel,
  CalibracionModel,
  RecepcionEquipoDetalleModel,
  OrdenTrabajoModel,
  ClienteModel,
} from "@/tipos/entidades";

export interface CertificadosConContexto {
  certificados: CertificadoModel[];
  calibraciones: CalibracionModel[];
  instrumentos: RecepcionEquipoDetalleModel[];
  ordenes: OrdenTrabajoModel[];
  clientes: ClienteModel[];
}

/**
 * Obtiene certificados junto con el contexto necesario (calibración, instrumento,
 * orden de trabajo y cliente) usando concurrencia.
 */
export async function obtenerCertificadosConContexto(): Promise<{
  success: boolean;
  data?: CertificadosConContexto;
  error?: string;
}> {
  try {
    const [certificados, calibraciones, instrumentos, ordenes, clientes] = await Promise.all([
      prisma.certificado.findMany({
        include: { sellos: true },
        orderBy: { idCertificado: 'desc' },
      }),
      prisma.calibracion.findMany(),
      prisma.recepcionEquipoDetalle.findMany(),
      prisma.ordenTrabajo.findMany({
        include: {
          cliente: true,
          cotizacion: { include: { cliente: true } },
          instrumentos: true,
        },
      }),
      prisma.cliente.findMany(),
    ]);

    return {
      success: true,
      data: { certificados, calibraciones, instrumentos, ordenes, clientes },
    };
  } catch (error) {
    console.error('Error en obtenerCertificadosConContexto:', error);
    return { success: false, error: 'Error interno del servidor al consultar los certificados' };
  }
}
