import { MissingStaticPage } from "next/dist/shared/lib/utils";
import { Miss_Fajardose } from "next/font/google";

 export function sidebar_permissions(permisos: any) {
  // CORRECCIÓN 1: Quitar el ".permisos" porque el objeto ya trae los módulos directamente
  const data = permisos;
// Para ver todo el objeto de módulos
const misPermisos = data?.permisos?.permisos;

const white_list:any={}
Object.entries(misPermisos || {}).forEach(([nombreModulo, subPermisos]: [string, any]) => {
  
  // Ahora sí:
  // 1ra vuelta: nombreModulo = "clientes", subPermisos = { consultar: true, ... }
  // 2da vuelta: nombreModulo = "cotizaciones", subPermisos = { crear_editar: true, ... }
  
  const valores = Object.values(subPermisos || {});
  const tieneTrue = valores.includes(true);

  if (tieneTrue) {
    white_list[nombreModulo] = true;
  }
});
return white_list;
}

export  function  module_permission(permisos:any):any{
    const data = permisos;
    console.log(permisos)
// Para ver todo el objeto de módulos
const misPermisos = data?.permisos;
console.log(misPermisos,"esto son");

return misPermisos
}

