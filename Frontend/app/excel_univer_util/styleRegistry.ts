import type { Style } from "exceljs";
export type StyleRegistry = ReturnType<typeof createStyleRegistry>;
// utils/excel-univer/styleRegistry.ts
import { convertStyleToUniver} from './ parseStyle';

export function createStyleRegistry() {
  const registry: Record<string, NonNullable<ReturnType<typeof convertStyleToUniver>>> = {};
  const styleMap: Map<string, string> = new Map();

  return {
    getOrCreate: (style: Partial<Style>): string | null => {
      const univerStyle = convertStyleToUniver(style);
      if (!univerStyle) return null;

      // Crear hash del estilo para deduplicación
      const hash = JSON.stringify(univerStyle);

      if (styleMap.has(hash)) {
        return styleMap.get(hash)!;
      }

      // Generar ID único
      const styleId = `style-${Object.keys(registry).length}`;
      registry[styleId] = univerStyle;
      styleMap.set(hash, styleId);
      return styleId;
    },
    getAll: () => registry,
  };
}

// Función helper para usar el registry
export function getOrCreateStyleId(style: Partial<Style>, registry: StyleRegistry): string | null {
  return registry.getOrCreate(style);
}
