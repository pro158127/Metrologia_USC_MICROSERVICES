type TablaPlantillas = "plantillas" | "version_plantilla" | "documentos_plantillas";
type Operacion = "INSERT" | "UPDATE" | "DELETE";

interface EventoRealtimePayload {
  tabla: TablaPlantillas;
  operacion: Operacion;
  // payload con los campos de la tabla afectada
  data: any; 
}
import { PlantillaModel } from "./tables_recharge";

const processPlantillasRealtime = (
  plantillasActuales: PlantillaModel[],
  payload: EventoRealtimePayload
): PlantillaModel[] => {
  const { tabla, operacion, data } = payload;

  // 1. EVENTOS DIRECTOS EN LA TABLA PADRE: plantillas
  if (tabla === "plantillas") {
    const id = Number(data.idPlantilla);
    
    if (operacion === "DELETE") {
      return plantillasActuales.filter((p) => p.idPlantilla !== id);
    }
    
    const existe = plantillasActuales.some((p) => p.idPlantilla === id);
    if (operacion === "INSERT") {
      return existe ? plantillasActuales : [{ ...data, version_plantilla: data.version_plantilla ?? null }, ...plantillasActuales];
    }
    if (operacion === "UPDATE") {
      return plantillasActuales.map((p) => (p.idPlantilla === id ? { ...p, ...data } : p));
    }
  }

  // 2. EVENTOS EN LA TABLA HIJA: version_plantilla
  if (tabla === "version_plantilla") {
    const idPlantilla = Number(data.idPlantilla);
    const idVersion = Number(data.idVersionPlantilla);

    return plantillasActuales.map((plantilla) => {
      if (plantilla.idPlantilla !== idPlantilla) return plantilla;

      if (operacion === "DELETE") {
        return plantilla.version_plantilla?.idVersionPlantilla === idVersion
          ? { ...plantilla, version_plantilla: null as any }
          : plantilla;
      }

      // INSERT / UPDATE
      return {
        ...plantilla,
        version_plantilla: {
          ...plantilla.version_plantilla,
          ...data,
        },
      };
    });
  }

  // 3. EVENTOS EN LA TABLA NIETA: documentos_plantillas
  if (tabla === "documentos_plantillas") {
    const idVersionRelacionada = Number(data.idVersionPlantilla);
    const idDoc = Number(data.idDocumento);

    return plantillasActuales.map((plantilla) => {
      // Verificar si la versión actual de la plantilla coincide con la del documento
      if (plantilla.version_plantilla?.idVersionPlantilla !== idVersionRelacionada) {
        return plantilla;
      }

      const versionActual = plantilla.version_plantilla;

      if (operacion === "DELETE") {
        return versionActual.Documentos_plantillas?.idDocumento === idDoc
          ? { ...plantilla, version_plantilla: { ...versionActual, Documentos_plantillas: null as any } }
          : plantilla;
      }

      // INSERT / UPDATE
      return {
        ...plantilla,
        version_plantilla: {
          ...versionActual,
          Documentos_plantillas: {
            ...versionActual.Documentos_plantillas,
            ...data,
          },
        },
      };
    });
  }

  return plantillasActuales;
};

export default processPlantillasRealtime