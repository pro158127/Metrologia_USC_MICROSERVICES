
"use server"

import { auth } from "@/app/Login/types/auth"; // <-- Importas la función auth directa de la v5
import { fastifyRequest, FastifyHttpError } from "@/app/lib/api/fastifyClient";
import type { CrearClienteInput, ActualizarClienteInput, TrazabilidadCliente } from "@/tipos/clientes";
import type { ProveedorAlmacenamiento } from "@/tipos/enums";

type statuscliente = 'ACTIVO' | 'INACTIVO';

interface ClienteDTO {
  idCliente: number;
  nitCedula: string;
  razonSocial: string;
  correo: string;
  nombreContacto: string | null;
  telefono: string | null;
  observacion: string | null;
  idRutDocumento: number | null;
  status: string;
  createat: string | Date;
  dirrecion: string;
  updatedAt: string | Date;
  ciudad: string | null;
  tipoCliente: string;
}

interface DocumentoDTO {
  idDocumento: number;
  nombre: string;
  rutaUrl: string;
  proveedor: string;
  mimeType: string;
  createdAt: string | Date;
  idCotizacion: number | null;
  idOrdenTrabajo: number | null;
  idRecepcion: number | null;
  idPlantilla: number | null;
}

export async function obtenerClientes() {
  try {
    // 1. Autenticación
    const session = await auth();
    if (!session?.user) {
      return { success: false, error: 'No autenticado' };
    }

    // 2. Permisos (ajusta según tu estructura de permisos)
    const permisos = session.user?.permissions?.permisos;
    if (!permisos?.clientes?.consultar) {
      return {
        success: false,
        error: 'Acceso denegado: No tienes permisos para gestionar clientes.'
      };
    }

    // 3. Consulta delegada al backend Fastify (centraliza Prisma)
    const res = await fastifyRequest<{ success: boolean; data: ClienteDTO[] }>(
      session,
      '/api/v1/clientes'
    );

    console.log(res,"aqui esta FGDFG")

    return { success: true, data: res.data };
  } catch (error) {
    console.error('Error en obtenerClientes:', error);
    if (error instanceof FastifyHttpError) return { success: false, error: error.message };
    return { success: false, error: 'Error interno del servidor' };
  }
}


export async function obtenerUltimaCotizacionFinalizada(clienteId: number) {
  try {
    const session = await auth();
    if (!session?.user) {
      return { success: false, error: 'No autenticado' };
    }

    const permisos = session.user?.permissions?.permisos;
    if (!permisos?.clientes?.consultar) {
      return {
        success: false,
        error: 'Acceso denegado: No tienes permisos para consultar clientes.'
      };
    }

    const res = await fastifyRequest<{ success: boolean; data: string | null }>(
      session,
      `/api/v1/clientes/${clienteId}/ultima-cotizacion`
    );

    return { success: true, data: res.data ?? null };
  } catch (error) {
    console.error('Error en obtenerUltimaCotizacionFinalizada:', error);
    if (error instanceof FastifyHttpError) return { success: false, error: error.message };
    return { success: false, error: 'Error interno del servidor' };
  }
}


async function validarPermiso(accion: 'consultar' | 'desactivar' | 'crear_editar' | 'ver_historial') {
  const session = await auth();
  if (!session?.user) {
    return { autorizado: false, error: 'No autenticado' };
  }const permisos = session.user?.permissions?.permisos?.clientes;
  if (!permisos?.[accion]) {
    return { autorizado: false, error: `Acceso denegado: No tienes permisos para ${accion} clientes.` };
  }

  return { autorizado: true };
}

export async function crearCliente(input: CrearClienteInput) {
  try {
    const perm = await validarPermiso('crear_editar');
    if (!perm.autorizado) return { success: false, error: perm.error };

    const session = await auth();
    const res = await fastifyRequest<{ success: boolean; data: ClienteDTO }>(
      session,
      '/api/v1/clientes',
      {
        method: 'POST',
        body: {
          nitCedula: input.nitCedula,
          razonSocial: input.razonSocial,
          correo: input.correo,
          nombreContacto: input.nombreContacto,
          telefono: input.telefono,
          observacion: input.observacion,
          tipoCliente: input.tipoCliente ?? 'NATURAL',
          ciudad: input.ciudad ?? 'Cali',
          idRutDocumento: input.idRutDocumento ?? null,
        },
      }
    );

    return { success: true, data: res.data };
  } catch (error) {
    console.error('Error en crearCliente:', error);
    if (error instanceof FastifyHttpError) return { success: false, error: error.message };
    return { success: false, error: 'Error interno al crear el cliente' };
  }
}

// 3. ACTUALIZAR CLIENTE
export async function actualizarCliente(idCliente: number, input: ActualizarClienteInput) {
  try {
    const perm = await validarPermiso('crear_editar');
    if (!perm.autorizado) return { success: false, error: perm.error };

    const session = await auth();
    const res = await fastifyRequest<{ success: boolean; data: ClienteDTO }>(
      session,
      `/api/v1/clientes/${idCliente}`,
      {
        method: 'PUT',
        body: {
          nitCedula: input.nitCedula,
          razonSocial: input.razonSocial,
          correo: input.correo,
          nombreContacto: input.nombreContacto,
          telefono: input.telefono,
          observacion: input.observacion,
          tipoCliente: input.tipoCliente,
          dirrecion: input.dirrecion,
          ciudad: input.ciudad,
          idRutDocumento: input.idRutDocumento,
        },
      }
    );

    return { success: true, data: res.data };
  } catch (error) {
    console.error('Error en actualizarCliente:', error);
    if (error instanceof FastifyHttpError) return { success: false, error: error.message };
    return { success: false, error: 'Error interno al actualizar el cliente' };
  }
}

// 4. CAMBIAR ESTADO DEL CLIENTE (ACTIVO / INACTIVO, etc.)
export async function cambiarEstadoCliente(idCliente: number, status: statuscliente) {
  try {
    const perm = await validarPermiso('desactivar');
    if (!perm.autorizado) return { success: false, error: perm.error };

    const session = await auth();
    const res = await fastifyRequest<{ success: boolean; data: ClienteDTO }>(
      session,
      `/api/v1/clientes/${idCliente}/estado`,
      {
        method: 'PATCH',
        body: { status },
      }
    );

    return { success: true, data: res.data };
  } catch (error) {
    console.error('Error en cambiarEstadoCliente:', error);
    if (error instanceof FastifyHttpError) return { success: false, error: error.message };
    return { success: false, error: 'Error interno al cambiar el estado del cliente' };
  }
}

// 5. ELIMINAR CLIENTE
export async function eliminarCliente(idCliente: number) {
  try {
    const perm = await validarPermiso('desactivar');
    if (!perm.autorizado) return { success: false, error: perm.error };

    const session = await auth();
    const res = await fastifyRequest<{ success: boolean; message?: string }>(
      session,
      `/api/v1/clientes/${idCliente}`,
      { method: 'DELETE' }
    );

    return { success: true, message: res.message ?? 'Cliente eliminado correctamente' };
  } catch (error) {
    console.error('Error en eliminarCliente:', error);
    if (error instanceof FastifyHttpError) return { success: false, error: error.message };
    return { success: false, error: 'No se puede eliminar el cliente porque tiene registros asociados' };
  }
}

export async function obtenerTrazabilidadCliente(idCliente: number) {
  try {
    const session = await auth();
    if (!session?.user) {
      return { success: false, error: 'No autenticado' };
    }

    const perm = await validarPermiso('ver_historial');
    if (!perm.autorizado) {
      return { success: false, error: perm.error };
    }

    const res = await fastifyRequest<{ success: boolean; data: TrazabilidadCliente | null }>(
      session,
      `/api/v1/clientes/${idCliente}/trazabilidad`
    );

    return { success: true, data: res.data };
  } catch (error) {
    console.error('Error en obtenerTrazabilidadCliente:', error);
    if (error instanceof FastifyHttpError) return { success: false, error: error.message };
    return { success: false, error: 'Error interno del servidor al consultar la trazabilidad' };
  }
}

export interface CrearDocumentoInput {
  nombre: string;
  rutaUrl: string;
  mimeType: string;
  proveedor?: ProveedorAlmacenamiento; // Opcional, por defecto "LOCAL"

  // Relaciones opcionales (FKs)
  idCotizacion?: number;
  idOrdenTrabajo?: number;
  idRecepcion?: number;
  idPlantilla?: number;
  idClienteRut?: number; // Para la relación 1:1 con el RUT del Cliente
}




export async function crearDocumento(input: CrearDocumentoInput) {
  try {
    // 1. Autenticación y Verificación de Sesión

    const perm = await validarPermiso('crear_editar');
    if (!perm.autorizado) return { success: false, error: perm.error };

    // 3. Validaciones básicas de entrada
    if (!input.nombre || !input.rutaUrl || !input.mimeType) {
      return {
        success: false,
        error: "Faltan campos obligatorios (nombre, rutaUrl o mimeType)."
      };
    }

    const session = await auth();
    const res = await fastifyRequest<{ success: boolean; data: DocumentoDTO; message?: string }>(
      session,
      '/api/v1/documentos',
      {
        method: 'POST',
        body: {
          nombre: input.nombre,
          rutaUrl: input.rutaUrl,
          mimeType: input.mimeType,
          proveedor: input.proveedor ?? "LOCAL",
          idCotizacion: input.idCotizacion ?? null,
          idOrdenTrabajo: input.idOrdenTrabajo ?? null,
          idRecepcion: input.idRecepcion ?? null,
          idPlantilla: input.idPlantilla ?? null,
          idClienteRut: input.idClienteRut ?? null,
        },
      }
    );

    return {
      success: true,
      data: res.data,
      message: res.message ?? "Documento registrado correctamente en la base de datos."
    };
  } catch (error) {
    console.error("Error en crearDocumento:", error);

    if (error instanceof FastifyHttpError) {
      return { success: false, error: error.message };
    }

    return { success: false, error: "Error interno del servidor al crear el documento." };
  }
}
