// lib/univer-parser/styleRegistry.ts
import { convertStyleToUniver } from './parseStyle';

export function createStyleRegistry() {
  const registry: Record<string, any> = {};
  const styleMap: Map<string, string> = new Map();

  return {
    getOrCreate: (style: any): string | null => {
      const univerStyle = convertStyleToUniver(style);
      if (!univerStyle) return null;

      const hash = JSON.stringify(univerStyle);

      if (styleMap.has(hash)) {
        return styleMap.get(hash)!;
      }

      const styleId = `style-${Object.keys(registry).length}`;
      registry[styleId] = univerStyle;
      styleMap.set(hash, styleId);
      return styleId;
    },
    getAll: () => registry,
  };
}

export function getOrCreateStyleId(style: any, registry: any): string | null {
  return registry.getOrCreate(style);
}
