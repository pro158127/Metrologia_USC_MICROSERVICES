type TablaPlantillas = "plantillas" | "version_plantilla" | "documentos_plantillas";
type Operacion = "INSERT" | "UPDATE" | "DELETE";

interface EventoRealtimePayload {
  tabla: TablaPlantillas;
  operacion: Operacion;
  // payload con los campos de la tabla afectada
  data: Record<string, any>;
}

import type { PlantillaModel, VersionPlantillaModel } from "@/tipos/entidades";

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
      return existe
        ? plantillasActuales
        : [{ ...(data as PlantillaModel), versiones: data.versiones ?? [] }, ...plantillasActuales];
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

      const versiones = plantilla.versiones ?? [];

      if (operacion === "DELETE") {
        return {
          ...plantilla,
          versiones: versiones.filter((v) => v.idVersionPlantilla !== idVersion),
        };
      }

      const existe = versiones.some((v) => v.idVersionPlantilla === idVersion);
      if (operacion === "INSERT") {
        return {
          ...plantilla,
          versiones: existe ? versiones : [...versiones, data as VersionPlantillaModel],
        };
      }

      // UPDATE
      return {
        ...plantilla,
        versiones: versiones.map((v) =>
          v.idVersionPlantilla === idVersion ? { ...v, ...data } : v
        ),
      };
    });
  }

  // 3. EVENTOS EN LA TABLA NIETA: documentos_plantillas (sin correlato directo en el schema actual)
  return plantillasActuales;
};

export default processPlantillasRealtime;
