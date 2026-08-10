'use server';

import { PrismaClient } from '@prisma/client';
import { create } from 'domain';

// Reutilización de la instancia de Prisma Client
const prisma = new PrismaClient();

// Tipado estricto para el parámetro de entrada
interface GetPlantillaParams {
  idPlantilla: number;
  version?: number;
}

// Tipado explícito de la respuesta para el cliente
export interface PlantillaWithVersionResponse {
  success: boolean;
  data?: {
    idPlantilla: number;
    nombre: string;
    modulo: string;
    activa: boolean;
    versionActual: {
      idVersionPlantilla: number;
      version: number;
      mapeoExcelJson: any;
      createdAt: Date;
      documento: {
        idDocumento: number;
        nombre: string;
        rutaUrl: string;
        proveedor: string;
        mimeType: string;
      } | null;
    } | null;
  };
  error?: string;
}

/**
 * Server Action para obtener una plantilla con su versión y documento asociado.
 * 
 * @param params Objetos con idPlantilla y versión opcional.
 * @returns Objeto estructurado con el estado de la operación y los datos devueltos.
 */
export async function getPlantillaConDocumento(
  params: GetPlantillaParams
): Promise<PlantillaWithVersionResponse> {
  try {
    const { idPlantilla, version } = params;

    if (!idPlantilla || typeof idPlantilla !== 'number') {
      return {
        success: false,
        error: 'El idPlantilla es requerido y debe ser un número válido.',
      };
    }

    // Consulta relacional usando Prisma
    const plantilla = await prisma.plantilla.findUnique({
      where: { idPlantilla },
      include: {
        versiones: {
          where: version ? { version } : undefined,
          orderBy: { version: 'desc' }, // Trae la versión más reciente por defecto
          take: 1, // Limita el resultado a 1 sola versión
          include: {
            documentos: true, // Incluye los metadatos del documento en MinIO/S3
          },
        },
      },
    });

    if (!plantilla) {
      return {
        success: false,
        error: `No se encontró la plantilla con el ID: ${idPlantilla}`,
      };
    }

    const versionEncontrada = plantilla.versiones[0] || null;

    return {
      success: true,
      data: {
        idPlantilla: plantilla.idPlantilla,
        nombre: plantilla.nombre,
        modulo: plantilla.modulo,
        activa: plantilla.activa,
        versionActual: versionEncontrada
          ? {
              idVersionPlantilla: versionEncontrada.idVersionPlantilla,
              version: versionEncontrada.version,
              mapeoExcelJson: versionEncontrada.mapeoExcelJson,
              createdAt: versionEncontrada.createdAt,
              documento: versionEncontrada.documentos
                ? {
                    idDocumento: versionEncontrada.documentos.idDocumento,
                    nombre: versionEncontrada.documentos.nombre,
                    rutaUrl: versionEncontrada.documentos.rutaUrl, // Object Key para MinIO
                    proveedor: versionEncontrada.documentos.proveedor,
                    mimeType: versionEncontrada.documentos.mimeType,
                  }
                : null,
            }
          : null,
      },
    };
  } catch (error: any) {
    console.error('[SERVER ACTION ERROR - getPlantillaConDocumento]:', error);
    return {
      success: false,
      error: 'Error interno del servidor al consultar la plantilla.',
    };
  }
}




// Tipado explícito para la respuesta unificada de la consulta
export interface PlantillasCompletasResponse {
  success: boolean;
  data?: Array<{
    idPlantilla: number;
    nombre: string;
    modulo: string;
    activa: boolean;
    versiones: Array<{
      idVersionPlantilla: number;
      idPlantilla: number;
      version: number;
      mapeoExcelJson: any;
      createdby:{
        nombre:string

      }
      createdAt: Date;
      iddocumentos: number | null;
      documento: {
        idDocumento: number;
        nombre: string;
        rutaUrl: string; // Object Key de MinIO
        proveedor: string;
        mimeType: string;
        createdAt: Date;
      } | null;
    }>;
  }>;
  error?: string;
}

/**
 * Consulta todas las plantillas registradas, incluyendo la totalidad
 * de sus versiones y el documento físico enlazado en MinIO a cada versión.
 */
export async function getTodasLasPlantillasCompletas(): Promise<PlantillasCompletasResponse> {
  try {
    const plantillas = await prisma.plantilla.findMany({
      orderBy: {
        idPlantilla: 'desc',
      },
      include: {
        versiones: {
          orderBy: {
            version: 'desc', // Mantiene la última versión al inicio
          },
          include: {
            documentos: true, // Incluye la relación completa con la tabla Documento
            usuarioCreador: {
              select: {
                nombreCompleto: true,
              },
            },
          }
        },
      },
    });

    return {
      success: true,
      data: plantillas.map((p) => ({
        idPlantilla: p.idPlantilla,
        nombre: p.nombre,
        modulo: p.modulo,
        activa: p.activa,
        versiones: p.versiones.map((v) => ({
          idVersionPlantilla: v.idVersionPlantilla,
          idPlantilla: v.idPlantilla,
          version: v.version,
          mapeoExcelJson: v.mapeoExcelJson,
          
          // Alinea con la interfaz: incluye createdby con el nombre del usuario creador
          createdby: {
            nombre: v.usuarioCreador?.nombreCompleto || '',
          },

          createdAt: v.createdAt,
          iddocumentos: v.iddocumentos,
          documento: v.documentos
            ? {
                idDocumento: v.documentos.idDocumento,
                nombre: v.documentos.nombre,
                rutaUrl: v.documentos.rutaUrl,
                proveedor: v.documentos.proveedor,
                mimeType: v.documentos.mimeType,
                createdAt: v.documentos.createdAt,
              }
            : null,
        })),
      })),
    };
  } catch (error: any) {
    console.error('[SERVER ACTION ERROR - getTodasLasPlantillasCompletas]:', error);
    return {
      success: false,
      error: 'Error interno al obtener la totalidad de plantillas y sus documentos.',
    };
  }
}