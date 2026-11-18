// lib/permissions/mapping.ts
// Diccionario central módulo (Sidebar/UI) -> llave de permisos del backend.
// Las llaves coinciden con los módulos definidos en PERMISOS_JSON del seed.
import type { ModuleKey } from "@/app/dashboard/components/sidebar";

export const permisionMapping: Record<ModuleKey, string | boolean> = {
  dashboard: true, // Siempre visible
  clientes: "clientes",
  cotizaciones: "cotizaciones",
  seguimiento: "cotizaciones", // Comparte permiso con Cotizaciones
  recepcion: "recepcion_de_equipos",
  importarOrden: "ordenesOt", // Comparte permiso con Órdenes
  ordenes: "ordenes_de_trabajo",
  calibracion: "calibracion_e_informes",
  revision: "revision",
  firma: "firma_sello_y_certificacion",
  entrega: "entrega_y_envio",
  reportes: "reportes_y_consolidados",
  administracion: "administracion",
  configuracion: true,
  perfil_cliente: true,
};
