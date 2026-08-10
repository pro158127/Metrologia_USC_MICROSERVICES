"use server"

import { prisma } from "@/app/lib/data_base/prisma";
import { auth } from "@/app/Login/types/auth"; // <-- Importas la función auth directa de la v5
import { Prisma } from "@prisma/client";

import { headers } from "next/headers";



export async function obtenerIpCliente(): Promise<string> {
  const headersList = await headers();
  let ip = "";
  
  const xForwardedFor = headersList.get("x-forwarded-for");
  if (xForwardedFor) {
    const ips = xForwardedFor.split(",");
    ip = ips[0].trim();
  } else {
    ip = headersList.get("x-real-ip") || "127.0.0.1";
  }

  // 🧹 LIMPIEZA: Si la IP viene con el prefijo IPv6 mapeado, lo removemos
  if (ip.startsWith("::ffff:")) {
    ip = ip.replace("::ffff:", "");
  }

  // Si estás en localhost puro de IPv6 (::1), cámbialo al formato estándar IPv4 si lo prefieres
  if (ip === "::1") {
    ip = "127.0.0.1";
  }

  return ip;
}     

export type AdminTab = "usuarios" | "bitacora" | "config";



interface DatosAuditoria {
  action: string;
  tableName: string;
  recordId: string;
  details: Record<string, any>;
  userId: number; // 👈 Recibimos el ID numérico directamente
  ip?: string;
}

// Ya no necesita llamar a auth() internamente 🚀
async function registrarAuditoria(datos: DatosAuditoria) {
  try {

    const ipCliente = await obtenerIpCliente();

    await prisma.auditLog.create({
      data: {
        action: datos.action,
        tableName: datos.tableName,
        recordId: datos.recordId,
        userId: datos.userId, // 👈 Lo usamos directamente
        details: datos.details,
        ip: ipCliente || "0.0.0.0",
      },    
    });

    return { success: true };
  } catch (error) {
    console.error("Fallo crítico al guardar en audit_logs:", error);
    return { success: false, error };
  }
}


export async function obtenerUsuariosPorPermiso() {

  try {
    // 1. En NextAuth v5 obtenemos la sesión llamando directamente a auth()
    const session = await auth();
    console.log(session)
    if (!session || !session.user) {
      return { success: false, error: "No autenticado. Por favor inicia sesión." };
    }

    

    // 5. Si es válido, consultamos la base de datos
    const usuarios = await prisma.usuario.findMany({
      include: {
        rol: true,
      },
      orderBy: {
        createdAt: "desc",
      }
    });
    console.log("estoya qqq")
console.log(usuarios)
    // 6. Limpieza de contraseñas por seguridad
    const usuariosSeguros = usuarios.map((user: any) => {
      const { contraseña, ...usuarioSinContrasena } = user;
      return usuarioSinContrasena;
    });
    
    return {
      success: true,
      data: usuariosSeguros
    };

  } catch (error) {
    console.error("Error en obtenerUsuariosPorPermiso (v5):", error);
    return {
      success: false,
      error: "Ocurrió un error interno en el servidor."
    };
  }
}


// 1. Definimos un tipo TypeScript estricto basado en tu modelo de Prisma
// Esto evita que te envíen campos que no existen en la tabla de Usuarios (como id_usuario, createdAt, etc.)
type CamposActualizablesUsuario = Omit<
  Prisma.UsuarioUncheckedUpdateInput, 
  "id_usuario" | "createdAt" | "updatedAt" | "auditLogs"
>;

export async function actualizarUsuarioGenerico(
  idUsuario: number, 
  datosActualizar: CamposActualizablesUsuario
) {
  console.info("Comenzando actualización de usuario...");

  try {
    // 1. Validar la sesión en el servidor (tal como en tu otra función)
    const session = await auth();

    if (!session || !session.user) {
      console.info("Acceso denegado: No hay sesión activa");
      return { success: false, error: "No autenticado. Por favor inicia sesión." };
    }

    // 2. Validar que tenga permisos de administración
    const permisos = session.user.permissions.permisos;
    console.info("Permisos del usuario administrador:", permisos);

    if (!permisos?.administracion?.gestionar_usuarios_roles) {
      return { success: false, error: "No tienes permisos suficientes para realizar esta acción." };
    }

    // 3. Actualizar directamente en la base de datos
    const actuliza_usuario=await prisma.usuario.update({
      where: { idUsuario: idUsuario },
      data: datosActualizar
    });
    if( datosActualizar.estado!=null ||datosActualizar.estado!=undefined){
await registrarAuditoria({
  action: `cambio a ${datosActualizar.estado} el estado del usuario ${actuliza_usuario.correo}/${actuliza_usuario.nombreCompleto}`,
  tableName: "usuarios",
  recordId: actuliza_usuario.idUsuario.toString(),
  userId:parseInt(session?.user?.id_user), // 👈 Se lo pasas aquí
  details: {
    nombreCompleto: actuliza_usuario.nombreCompleto,
    correo: actuliza_usuario.correo,
  }
});
    }else{
      await registrarAuditoria({
  action: `actualizacion de datos de usuario  ${actuliza_usuario.correo}/${actuliza_usuario.nombreCompleto}`,
  tableName: "usuarios",
  recordId: actuliza_usuario.idUsuario.toString(),
  userId:parseInt(session?.user?.id_user), // 👈 Se lo pasas aquí
  details: {
    nombreCompleto: actuliza_usuario.nombreCompleto,
    correo: actuliza_usuario.correo,
  }
});
    }
       

    console.info(`Usuario con ID ${idUsuario} actualizado con éxito.`);
    return { success: true };

  } catch (error) {
    console.error("Error al actualizar usuario:", error);
    return { success: false, error: "Error de servidor al intentar guardar el cambio." };
  }
}

import nodemailer from "nodemailer";
import argon2 from "argon2"; // 👈 Importamos la librería de hashing


// Configuración del transportador de correos con Nodemailer
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || "587"),
  secure: false, 
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
  },
});

interface DatosCrearUsuario {
  nombre: string;
  correo: string;
  idRol: number;
  estado?: boolean;
}

export async function crearUsuarioGenerico(datos: DatosCrearUsuario) {
  console.info("Iniciando creación de usuario con contraseña semántica...");

  try {
    // 1. Validar la sesión en el servidor con NextAuth v5
    const session = await auth();

    if (!session || !session.user) {
      console.info("Acceso denegado: No hay sesión activa");
      return { success: false, error: "No autenticado. Por favor inicia sesión." };
    }

    // 2. Validar que tenga permisos de administración
    const permisos = session.user.permissions?.permisos;
    if (!permisos?.administracion?.gestionar_usuarios_roles) {
      console.info(" no tiene permisos")
      return { success: false, error: "No tienes permisos suficientes para realizar esta acción." };
    }

    // 3. GENERAR CONTRASEÑA TEMPORAL SEMÁNTICA (Fácil de leer para el usuario)
    const primerNombre = datos.nombre
      .trim()
      .split(" ")[0]
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]/g, "");

    const numeroAleatorio = Math.floor(100 + Math.random() * 900);
    const contraseñaTemporal = `Usc${primerNombre}${numeroAleatorio}*`;

    // 4. HASHEAR con Argon2id para guardar en la base de datos
    const contraseñaHasheada = await argon2.hash(contraseñaTemporal, {
      type: argon2.argon2id,
    });

    // 5. Registrar el usuario en la base de datos de Prisma
    const nuevoUsuario = await prisma.usuario.create({
      data: {
        nombreCompleto: datos.nombre,
        correo: datos.correo,
        idRol: datos.idRol,
        estado: datos.estado||false,
        contraseña: contraseñaHasheada,
      },
    });

       await registrarAuditoria({
  action: `Crea usuario ${nuevoUsuario.correo}/${nuevoUsuario.nombreCompleto}`,
  tableName: "usuarios",
  recordId: nuevoUsuario.idUsuario.toString(),
  userId:parseInt(session?.user?.id_user), // 👈 Se lo pasas aquí
  details: {
    nombreCompleto: nuevoUsuario.nombreCompleto,
    correo: nuevoUsuario.correo,
  }
});

    // 6. Enviar el correo con la contraseña amigable
    try {
      await transporter.sendMail({
        from: `"Soporte Metrología USC" <${process.env.SMTP_USER}>`,
        to: datos.correo,
        subject: "Bienvenido al Sistema de Metrología USC - Tu Cuenta ha sido Creada",
        html: `
          <div style="font-family: sans-serif; padding: 20px; color: #1F2937; max-width: 600px; margin: auto; border: 1px solid #E5E7EB; border-radius: 8px;">
            <h2 style="color: #800000; border-bottom: 2px solid #800000; padding-bottom: 10px;">¡Hola, ${datos.nombre}!</h2>
            <p>Se ha creado exitosamente tu cuenta en la plataforma de **Metrología USC**.</p>
            <p>A continuación, encontrarás tus credenciales temporales de acceso:</p>
            
            <div style="background-color: #F3F4F6; padding: 15px; border-radius: 6px; margin: 20px 0; font-family: monospace;">
              <p style="margin: 5px 0;"><strong>Usuario/Correo:</strong> ${datos.correo}</p>
              <p style="margin: 5px 0;"><strong>Contraseña Temporal:</strong> <span style="background-color: #FFE4E6; color: #9F1239; padding: 2px 6px; border-radius: 4px; font-weight: bold; font-size: 15px;">${contraseñaTemporal}</span></p>
            </div>

            <p style="font-size: 13px; color: #4B5563;">⚠️ Por motivos de seguridad, te recomendamos cambiar esta contraseña inmediatamente después de iniciar sesión por primera vez.</p>
            <br />
            <hr style="border: 0; border-top: 1px solid #E5E7EB;" />
            <p style="font-size: 11px; color: #9CA3AF; text-align: center;">Este es un mensaje automático del Sistema de Metrología de la Universidad Santiago de Cali.</p>
          </div>
        `,
      });
      console.info(`Correo enviado exitosamente a ${datos.correo}`);
    } catch (mailError) {
      console.error("El usuario se creó pero falló el envío del correo:", mailError);
      return { 
        success: true, 
        warning: `El usuario fue creado, pero falló el envío de correo. Compártele esta clave temporal: ${contraseñaTemporal}` 
      };
    }

    return { success: true };

  } catch (error: any) {
    console.error("Error al crear usuario:", error);
    if (error.code === "P2002") {
      return { success: false, error: "El correo institucional ya se encuentra registrado." };
    }
    return { success: false, error: "Error interno del servidor al procesar el registro." };
  }}

interface DatosEliminarUsuario {
  idUsuario: number;
}
//elemiaar usuario 
export async function eliminarUsuario(datos: DatosEliminarUsuario) {
  console.info(`Iniciando eliminación (soft delete) del usuario ID: ${datos.idUsuario}...`);

  try {
    // 1. Validar la sesión en el servidor con NextAuth v5
    const session = await auth();

    if (!session || !session.user) {
      console.info("Acceso denegado: No hay sesión activa");
      return { success: false, error: "No autenticado. Por favor inicia sesión." };
    }

    // 2. Validar permisos de administración
    const permisos = session.user.permissions?.permisos;
    if (!permisos?.administracion?.gestionar_usuarios_roles) {
      console.info("Acceso denegado: El usuario no tiene permisos suficientes");
      return { success: false, error: "No tienes permisos suficientes para realizar esta acción." };
    }

    // 3. Validar que no se elimine a sí mismo (Buena práctica de seguridad)
    if (session.user.id && Number(session.user.id) === datos.idUsuario) {
      return { success: false, error: "No puedes eliminar tu propia cuenta de usuario." };
    }

    // 4. Verificar que el usuario exista en la base de datos
    const usuarioExistente = await prisma.usuario.findUnique({
      where: { idUsuario: datos.idUsuario },
    });

    if (!usuarioExistente) {
      return { success: false, error: "El usuario que intentas eliminar no existe." };
    }

    if (usuarioExistente.elminado) {
      return { success: false, error: "El usuario ya se encuentra eliminado." };
    }

    // 5. Borrado lógico (Soft Delete): Actualizar 'elminado' a true y 'estado' a false
    const actualzaicion= await prisma.usuario.update({
      where: {
        idUsuario: datos.idUsuario,
      },
      data: {
        elminado: true,
        estado: false,
      },
    });

     await registrarAuditoria({
  action: `Eleminar usuario ${actualzaicion.correo}/${actualzaicion.nombreCompleto}`,
  tableName: "usuarios",
  recordId: actualzaicion.idUsuario.toString(),
  userId:parseInt(session?.user?.id_user), // 👈 Se lo pasas aquí
  details: {
    nombreCompleto: actualzaicion.nombreCompleto,
    correo: actualzaicion.correo,
  }
});

    console.info(`Usuario ID: ${datos.idUsuario} marcado como eliminado con éxito.`);
    return { success: true, message: "Usuario eliminado correctamente." };

  } catch (error: any) {
    console.error("Error al eliminar usuario:", error);
    
    // Manejo de errores específicos de Prisma
    if (error.code === "P2025") {
      return { success: false, error: "No se encontró el registro para actualizar." };
    }

    return { success: false, error: "Error interno del servidor al procesar la eliminación." };
  }
}
  

  export async function restablecerContrasenaGenerico(idUsuario: number) {
  console.info(`Iniciando proceso de restablecimiento para el usuario ID: ${idUsuario}...`);

  try {
    // 1. Validar la sesión en el servidor con NextAuth v5
    const session = await auth();

    if (!session || !session.user) {
      console.info("Acceso denegado: No hay sesión activa");
      return { success: false, error: "No autenticado. Por favor inicia sesión." };
    }

    // 2. Validar que el administrador que ejecuta la acción tenga los permisos necesarios
    const permisos = session.user.permissions?.permisos;
    if (!permisos?.administracion?.gestionar_usuarios_roles) {
      return { success: false, error: "No tienes permisos suficientes para realizar esta acción." };
    }

    // 3. Obtener los datos del usuario actual para generar su contraseña y saber su correo
    const usuario = await prisma.usuario.findUnique({
      where: { idUsuario: idUsuario },
      select: {
        nombreCompleto: true,
        correo: true,
      },
    });

    if (!usuario) {
      console.warn(`Usuario con ID ${idUsuario} no encontrado en la base de datos.`);
      return { success: false, error: "El usuario especificado no existe." };
    }

    // 4. GENERAR NUEVA CONTRASEÑA TEMPORAL SEMÁNTICA
    const primerNombre = usuario.nombreCompleto
      .trim()
      .split(" ")[0]
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]/g, "");

    const numeroAleatorio = Math.floor(100 + Math.random() * 900);
    const nuevaContrasenaTemporal = `Usc${primerNombre}${numeroAleatorio}`;

    // 5. HASHEAR con Argon2id para asegurar la base de datos
    const contrasenaHasheada = await argon2.hash(nuevaContrasenaTemporal, {
      type: argon2.argon2id,
    });
    console.log(contrasenaHasheada)

    // 6. Actualizar la contraseña en la base de datos
    const actualzaicion =await prisma.usuario.update({
      where: { idUsuario: idUsuario },
      data: {
        contraseña: contrasenaHasheada,
      },
    });
    console.log(actualzaicion)

await registrarAuditoria({
  action: `Restablecer contraeña  de ${actualzaicion.correo}/${actualzaicion.nombreCompleto}`,
  tableName: "usuarios",
  recordId: actualzaicion.idUsuario.toString(),
  userId:parseInt(session?.user?.id_user), // 👈 Se lo pasas aquí
  details: {
    nombreCompleto: actualzaicion.nombreCompleto,
    correo: actualzaicion.correo,
  }
});

    // 7. Enviar el correo con la nueva contraseña temporal
    try {
      await transporter.sendMail({
        from: `"Soporte Metrología USC" <${process.env.SMTP_USER}>`,
        to: usuario.correo,
        subject: "Restablecimiento de Contraseña - Metrología USC",
        html: `
          <div style="font-family: sans-serif; padding: 20px; color: #1F2937; max-width: 600px; margin: auto; border: 1px solid #E5E7EB; border-radius: 8px;">
            <h2 style="color: #800000; border-bottom: 2px solid #800000; padding-bottom: 10px;">Hola, ${usuario.nombreCompleto}</h2>
            <p>Se ha solicitado un restablecimiento de contraseña para tu cuenta en la plataforma de **Metrología USC**.</p>
            <p>Tu nueva contraseña temporal de acceso es:</p>
            
            <div style="background-color: #F3F4F6; padding: 15px; border-radius: 6px; margin: 20px 0; font-family: monospace;">
              <p style="margin: 5px 0;"><strong>Usuario/Correo:</strong> ${usuario.correo}</p>
              <p style="margin: 5px 0;"><strong>Nueva Contraseña Temporal:</strong> <span style="background-color: #FFE4E6; color: #9F1239; padding: 2px 6px; border-radius: 4px; font-weight: bold; font-size: 15px;">${nuevaContrasenaTemporal}</span></p>
            </div>

            <p style="font-size: 13px; color: #4B5563;">⚠️ Te recomendamos cambiar esta contraseña temporal por una de tu preferencia inmediatamente después de ingresar al sistema.</p>
            <p style="font-size: 13px; color: #4B5563;">Si tú no solicitaste este cambio, por favor ponte en contacto con el administrador del sistema.</p>
            <br />
            <hr style="border: 0; border-top: 1px solid #E5E7EB;" />
            <p style="font-size: 11px; color: #9CA3AF; text-align: center;">Este es un automatismo del Sistema de Metrología de la Universidad Santiago de Cali.</p>
          </div>
        `,
      });
      console.info(`Correo de restablecimiento enviado con éxito a ${usuario.correo}`);
    } catch (mailError) {
      console.error("La contraseña se actualizó pero falló el envío del correo:", mailError);
      return { 
        success: true, 
        warning: `Contraseña restablecida en el sistema, pero falló el envío del correo. Compártele la clave temporal manualmente: ${nuevaContrasenaTemporal}` 
      };
    }

    return { success: true };

  } catch (error) {
    console.error("Error al restablecer contraseña:", error);
    return { success: false, error: "Error interno del servidor al intentar restablecer la contraseña." };
  }
}

interface DatosRestaurarUsuario {
  idUsuario: number;
}
export async function restaurarUsuario(datos: DatosRestaurarUsuario) {
  console.info(`Iniciando restauración del usuario ID: ${datos.idUsuario}...`);

  try {
    // 1. Validar la sesión en el servidor con NextAuth v5
    const session = await auth();

    if (!session || !session.user) {
      console.info("Acceso denegado: No hay sesión activa");
      return { success: false, error: "No autenticado. Por favor inicia sesión." };
    }

    // 2. Validar que tenga permisos de administración
    const permisos = session.user.permissions?.permisos;
    if (!permisos?.administracion?.gestionar_usuarios_roles) {
      console.info("Acceso denegado: El usuario no tiene permisos suficientes");
      return { success: false, error: "No tienes permisos suficientes para realizar esta acción." };
    }

    // 3. Verificar que el usuario exista
    const usuarioExistente = await prisma.usuario.findUnique({
      where: { idUsuario: datos.idUsuario },
    });

    if (!usuarioExistente) {
      return { success: false, error: "El usuario que intentas restaurar no existe." };
    }

    if (!usuarioExistente.elminado) {
      return { success: false, error: "El usuario ya se encuentra activo y no está eliminado." };
    }

    // 4. Restaurar el usuario: Actualizar 'elminado' a false y 'estado' a true
    const actualzaicion=await prisma.usuario.update({
      where: {
        idUsuario: datos.idUsuario,
      },
      data: {
        elminado: false,
        estado: true,
        intentos: 0, // Opcional: reinicia el contador de intentos fallidos al restaurar
      },
    });
    await registrarAuditoria({
  action: `Restaura usuario ${actualzaicion.correo}/${actualzaicion.nombreCompleto}`,
  tableName: "usuarios",
  recordId: actualzaicion.idUsuario.toString(),
  userId:parseInt(session?.user?.id_user), // 👈 Se lo pasas aquí
  details: {
    nombreCompleto: actualzaicion.nombreCompleto,
    correo: actualzaicion.correo,
  }
});

    console.info(`Usuario ID: ${datos.idUsuario} restaurado con éxito.`);
    return { success: true, message: "Usuario restaurado y activado correctamente." };

  } catch (error: any) {
    console.error("Error al restaurar usuario:", error);

    if (error.code === "P2025") {
      return { success: false, error: "No se encontró el registro para actualizar." };
    }

    return { success: false, error: "Error interno del servidor al procesar la restauración." };
  }
}






export interface init_bitacora {
  fecha: string;
  usuario: string;
  rol: string;
  accion: string;
  modulo: string;
  ip: string;
}

export async function obtenerBitacoraPorPermiso() {
  try {
    // 1. Obtener la sesión activa en NextAuth v5
    const session = await auth();
    
    if (!session || !session.user) {
      return { success: false, error: "No autenticado. Por favor inicia sesión." };
    }

    // 2. Extraer permisos
    const permisos = session.user?.permissions?.permisos;

    // 3. Evaluar permisos de administración
    const tab_permission = {
      usuarios: permisos?.administracion?.gestionar_usuarios_roles,
      bitacora: permisos?.administracion?.consultar_bitacora_auditoria,
      config: permisos?.administracion?.configurar_catalogo_parametros || 
              permisos?.administracion?.configurar_plantillas_documentos,
    };

    // 4. Verificación del permiso requerido para consultar la bitácora
    if (!tab_permission.bitacora) {
      return { 
        success: false, 
        error: "Acceso denegado: No tienes permisos para consultar la bitácora de auditoría." 
      };
    }

    // 5. Consultar los logs de auditoría incluyendo la relación con el Usuario y su Rol
    const logs = await prisma.auditLog.findMany({
      include: {
        user: {
          include: {
            rol: true, // Incluimos el rol para obtener el nombre del rol del usuario
          }
        }
      },
      orderBy: {
        createdAt: "desc", // Los más recientes primero
      }
    });

    // 6. Mapear y formatear la salida a la estructura "init_bitacora"
    const bitacoraFormateada: init_bitacora[] = logs.map((log:any) => ({
      fecha: log.createdAt.toISOString(), // Formato ISO standard (puedes usar un formateador de fechas aquí si lo prefieres)
      usuario: log.user?.nombreCompleto || "Usuario Desconocido",
      rol: log.user?.rol?.nombreRol || "Sin Rol", // Ajusta "nombre" según cómo se llame el campo string del rol en tu esquema
      accion: log.action,
      modulo: log.tableName, // Usamos el nombre de la tabla afectada como el módulo
      ip: log.ip || "0.0.0.0",
    }));

    return {
      success: true,
      data: bitacoraFormateada
    };

  } catch (error) {
    console.error("Error en obtenerBitacoraPorPermiso:", error);
    return {
      success: false,
      error: "Ocurrió un error interno en el servidor al intentar cargar la bitácora."
    };
  }
}




///bitacora  funcion


//######ADMINISTRADOR CONFIGURADOR DE  PLATILLAS Y SELLOS

///PLATILLAS
import { PlantillaModel } from "../componets/tables_recharge";
export async function getPlantillasGlobalesServer(): Promise<PlantillaModel[]> {
  try {
    const plantillas = await prisma.plantilla.findMany({
      select: {
        idPlantilla: true,
        nombre: true,
        modulo: true,
        activa: true,
        versiones: {
          take: 1,
          orderBy: { version: "desc" },
          select: {
            idVersionPlantilla: true,
            idPlantilla: true,
            version: true,
            mapeoExcelJson: true,
            idUsuarioCreador: true,
            createdAt: true,
            usuarioCreador: {
              select: {
                nombreCompleto: true, // Cambia 'nombre' por el campo exacto de tu modelo Usuario (ej: 'nombreCompleto')
              },
            },
            docuementos: {
              select: {
                idDocumento: true,
                nombre: true,
                rutaUrl: true,
                proveedor: true,
                mimeType: true,
                createdAt: true,
                idVersionPlantilla: true,
                relacionModulo: true,
              },
            },
          },
        },
      },
    });

    const result: PlantillaModel[] = plantillas.map((p:any) => {
      const ultimaVersion = p.versiones[0];

      return {
        idPlantilla: p.idPlantilla,
        nombre: p.nombre,
        modulo: p.modulo,
        activa: p.activa,
        version_plantilla: ultimaVersion
          ? {
              idVersionPlantilla: ultimaVersion.idVersionPlantilla,
              idPlantilla: ultimaVersion.idPlantilla,
              version: ultimaVersion.version,
              idUsuarioCreador: ultimaVersion.idUsuarioCreador,
              usuarioNombre: ultimaVersion.usuarioCreador.nombreCompleto,
              createdAt: ultimaVersion.createdAt ? new Date(ultimaVersion.createdAt).toISOString() : "",
              
              // Mapeo seguro del JSON
              mapeoExcelJson: typeof ultimaVersion.mapeoExcelJson === "string"
                ? JSON.parse(ultimaVersion.mapeoExcelJson)
                : (ultimaVersion.mapeoExcelJson as Record<string, string>) || {},

              // Asignación segura de la relación hija
              Documentos_plantillas: ultimaVersion.docuementos
                ? {
                    idDocumento: ultimaVersion.docuementos,
                    nombre: ultimaVersion.Documento.nombre,
                    rutaUrl: ultimaVersion.Documento.rutaUrl,
                    proveedor: ultimaVersion.Documento.proveedor as "LOCAL" | "AWS_S3" | "CLOUDINARY",
                    mimeType: ultimaVersion.Documento.mimeType,
                    createdAt: ultimaVersion.Documento.createdAt ? new Date(ultimaVersion.Documentos_plantillas.createdAt).toISOString() : "",
                    idVersionPlantilla: ultimaVersion.Documento.idVersionPlantilla ?? undefined,
                    relacionModulo: ultimaVersion.Documento.relacionModulo,
                  }
                : (null as any),
            }
          : (null as any),
      };
    });

    return result;
  } catch (error) {
    console.error("Error al consultar plantillas globales:", error);
    throw new Error("No se pudieron cargar las plantillas");
  }
}


export async function obtenerRolesAction() {
  try {
    const roles = await prisma.roles.findMany({
      orderBy: {
        idRol: "asc",
      },
    });

    return { success: true, data: roles };
  } catch (error) {
    console.error("❌ Error al obtener los roles:", error);
    return { success: false, error: "No se pudieron cargar los roles" };
  }
}