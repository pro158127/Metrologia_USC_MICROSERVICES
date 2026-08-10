
"use server"

import { prisma } from "@/app/lib/data_base/prisma";
import { auth } from "@/app/Login/types/auth"; // <-- Importas la función auth directa de la v5



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

    // 3. Consulta sin includes (solo campos planos)
    const clientes = await prisma.cliente.findMany({
      orderBy: { createat: 'desc' },
      // Si quieres excluir algunos campos, usa 'select'
      // select: { idCliente: true, razonSocial: true, ... }
    });

    // 4. Convertir Decimal a number si es necesario (no aplica en Cliente)
    // Pero si hubiera Decimal, lo convertiríamos.

    return { success: true, data: clientes };
  } catch (error) {
    console.error('Error en obtenerClientes:', error);
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

    const cotizacion = await prisma.cotizacion.findFirst({
      where: {
        idCliente: clienteId,
        estado: {
          in: [
            "APROBADO",
            "VENCIDA",
            "RECHAZADA",
             "BORRADOR",
            "PENDIENTE_CONSOLIDAR",
            "PENDIENTE_APROBAR",
            "FINALIZADA"
          ],
        },
      },
      orderBy: {createdAt: 'desc' },
      select: { createdAt: true },
    });

    return { success: true, data: cotizacion?.createdAt ?? null };
  } catch (error) {
    console.error('Error en obtenerUltimaCotizacionFinalizada:', error);
    return { success: false, error: 'Error interno del servidor' };
  }
}


import { statuscliente, tipocliente } from "@prisma/client";

export interface CrearClienteInput {
  nitCedula: string;
  razonSocial: string;
  correo: string;
  nombreContacto?: string;
  telefono?: string;
  observacion?: string;
  tipoCliente?: tipocliente;
  ciudad?: string;
  idRutDocumento?: number;
}

export type ActualizarClienteInput = Partial<CrearClienteInput>;

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

    // Validar NIT/Cédula único
    const existeNit = await prisma.cliente.findUnique({
      where: { nitCedula: input.nitCedula },
    });
    if (existeNit) {
      return { success: false, error: 'Ya existe un cliente registrado con este NIT/Cédula' };
    }

    const nuevoCliente = await prisma.cliente.create({
      data: {
        nitCedula: input.nitCedula,
        razonSocial: input.razonSocial,
        correo: input.correo,
        nombreContacto: input.nombreContacto,
        telefono: input.telefono,
        observacion: input.observacion,
        tipoCliente: input.tipoCliente ?? "NATURAL",
        ciudad: input.ciudad ?? "Cali",
        idRutDocumento: input.idRutDocumento??null,
      },
    });

    return { success: true, data: nuevoCliente };
  } catch (error) {
    console.error('Error en crearCliente:', error);
    return { success: false, error: 'Error interno al crear el cliente' };
  }
}

// 3. ACTUALIZAR CLIENTE
export async function actualizarCliente(idCliente: number, input: ActualizarClienteInput) {
  try {
    const perm = await validarPermiso('crear_editar');
    if (!perm.autorizado) return { success: false, error: perm.error };

    const clienteActual = await prisma.cliente.findUnique({ where: { idCliente } });
    if (!clienteActual) return { success: false, error: 'Cliente no encontrado' };

    // Si cambia el NIT, verificar que no colisione con otro cliente
    if (input.nitCedula && input.nitCedula !== clienteActual.nitCedula) {
      const existeNit = await prisma.cliente.findUnique({ where: { nitCedula: input.nitCedula } });
      if (existeNit) return { success: false, error: 'El NIT/Cédula ya está en uso por otro cliente' };
    }

    const clienteActualizado = await prisma.cliente.update({
      where: { idCliente },
      data: {
        ...input,
        updatedAt: new Date(),
      },
    });

    return { success: true, data: clienteActualizado };
  } catch (error) {
    console.error('Error en actualizarCliente:', error);
    return { success: false, error: 'Error interno al actualizar el cliente' };
  }
}

// 4. CAMBIAR ESTADO DEL CLIENTE (ACTIVO / INACTIVO, etc.)
export async function cambiarEstadoCliente(idCliente: number, status: statuscliente) {
  try {
    const perm = await validarPermiso('desactivar');
    if (!perm.autorizado) return { success: false, error: perm.error };

    const clienteActualizado = await prisma.cliente.update({
      where: { idCliente },
      data: {
        status,
        updatedAt: new Date(),
      },
    });

    return { success: true, data: clienteActualizado };
  } catch (error) {
    console.error('Error en cambiarEstadoCliente:', error);
    return { success: false, error: 'Error interno al cambiar el estado del cliente' };
  }
}

// 5. ELIMINAR CLIENTE
export async function eliminarCliente(idCliente: number) {
  try {
    const perm = await validarPermiso('desactivar');
    if (!perm.autorizado) return { success: false, error: perm.error };

    await prisma.cliente.delete({
      where: { idCliente },
    });

    return { success: true, message: 'Cliente eliminado correctamente' };
  } catch (error) {
    console.error('Error en eliminarCliente:', error);
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
    if (!perm.autorizado) return { success: false, error: perm.error };

    const cliente = await prisma.cliente.findUnique({
      where: { idCliente },
      include: {
        rutDocumento: {
          include: {
            versiones: {
              include: {
                usuario: {
                  select: { idUsuario: true, nombreCompleto: true, correo: true }
                }
              },
              orderBy: { version: 'desc' }
            }
          }
        },
        cotizaciones: {
          orderBy: { createdAt: 'desc' },
          include: {
            detalles: true,
            documentos: {
              include: {
                versiones: {
                  include: {
                    usuario: {
                      select: { idUsuario: true, nombreCompleto: true, correo: true }
                    }
                  },
                  orderBy: { version: 'desc' }
                }
              }
            },
            recepciones: {
              orderBy: { createdAt: 'desc' },
              include: {
                instrumentos: {
                  include: {
                    calibracion: {
                      include: {
                        certificado: {
                          include: {
                            documento: {
                              include: {
                                versiones: {
                                  include: {
                                    usuario: {
                                      select: { idUsuario: true, nombreCompleto: true, correo: true }
                                    }
                                  },
                                  orderBy: { version: 'desc' }
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                },
                documentos: {
                  include: {
                    versiones: {
                      include: {
                        usuario: {
                          select: { idUsuario: true, nombreCompleto: true, correo: true }
                        }
                      },
                      orderBy: { version: 'desc' }
                    }
                  }
                }
              }
            },
            ordenes: {
              orderBy: { createdAt: 'desc' },
              include: {
                instrumentos: true,
                documentos: {
                  include: {
                    versiones: {
                      include: {
                        usuario: {
                          select: { idUsuario: true, nombreCompleto: true, correo: true }
                        }
                      },
                      orderBy: { version: 'desc' }
                    }
                  }
                }
              }
            }
          }
        }
      }
    });

    if (!cliente) {
      return { success: false, error: 'Cliente no encontrado' };
    }

    return { success: true, data: cliente };
  } catch (error) {
    console.error('Error en obtenerTrazabilidadCliente:', error);
    return { success: false, error: 'Error interno del servidor al consultar la trazabilidad' };
  }
}

import { ProveedorAlmacenamiento } from "@prisma/client";

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

    // 4. Creación e Inserción en PostgreSQL
    const nuevoDocumento = await prisma.documento.create({
      data: {
        nombre: input.nombre,
        rutaUrl: input.rutaUrl,
        mimeType: input.mimeType,
        proveedor: input.proveedor ?? "LOCAL",
        
        // Relaciones opcionales
        idCotizacion: input.idCotizacion ?? null,
        idOrdenTrabajo: input.idOrdenTrabajo ?? null,
        idRecepcion: input.idRecepcion ?? null,
        idPlantilla: input.idPlantilla ?? null,
        
        // Relación 1:1 con Cliente (si se adjunta como RUT)
        ...(input.idClienteRut && {
          clienteRut: {
            connect: { idCliente: input.idClienteRut }
          }
        })
      },
    });

    return {
      success: true,
      data: nuevoDocumento,
      message: "Documento registrado correctamente en la base de datos."
    };

  } catch (error: any) {
    console.error("Error en crearDocumento:", error);
    
    // Captura de errores de clave foránea o unicidad de Prisma
    if (error.code === 'P2025') {
      return { success: false, error: "La entidad relacionada (Cliente/Cotización/etc.) no existe." };
    }

    return { success: false, error: "Error interno del servidor al crear el documento." };
  }
}