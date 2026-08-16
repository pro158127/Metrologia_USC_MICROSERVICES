'use server';

import { prisma } from "@/app/lib/data_base/prisma";
import type {
  CotizacionModel,
  OrdenTrabajoModel,
  CertificadoModel,
  FacturaModel,
  UsuarioModel,
} from "@/tipos/entidades";

export interface DatosReportes {
  cotizaciones: CotizacionModel[];
  ordenes: OrdenTrabajoModel[];
  certificados: CertificadoModel[];
  facturas: FacturaModel[];
  usuarios: UsuarioModel[];
}

/**
 * Obtiene los datos agregados necesarios para el módulo de Reportes
 * usando concurrencia (Promise.all).
 */
export async function obtenerDatosReportes(): Promise<{
  success: boolean;
  data?: DatosReportes;
  error?: string;
}> {
  try {
    const [cotizaciones, ordenes, certificados, facturas, usuarios] = await Promise.all([
      prisma.cotizacion.findMany({
        include: { cliente: true, detalles: true, historialEstados: true },
      }),
      prisma.ordenTrabajo.findMany({
        include: {
          cliente: true,
          instrumentos: true,
          cotizacion: { include: { cliente: true } },
        },
      }),
      prisma.certificado.findMany({ include: { sellos: true } }),
      prisma.factura.findMany({ include: { ordenTrabajo: true, cliente: true } }),
      prisma.usuario.findMany({ omit: { contraseña: true } }),
    ]);

    return {
      success: true,
      data: { cotizaciones, ordenes, certificados, facturas, usuarios },
    };
  } catch (error) {
    console.error('Error en obtenerDatosReportes:', error);
    return { success: false, error: 'Error interno del servidor al consultar los reportes' };
  }
}
