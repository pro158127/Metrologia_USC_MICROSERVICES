// lib/univer-parser/parseStyle.ts

export function convertStyleToUniver(style: any): any {
  if (!style || Object.keys(style).length === 0) return null;

  const univerStyle: any = {};

  if (style.font) {
    const f = style.font;
    if (f.bold) univerStyle.bl = 1;
    if (f.italic) univerStyle.it = 1;
    if (f.size) univerStyle.fs = f.size;
    if (f.name) univerStyle.ff = f.name;
    if (f.color?.argb) {
      univerStyle.cl = { rgb: argbToRgb(f.color.argb) };
    }
    if (f.underline) {
      univerStyle.ul = { s: 1, c: 0 };
    }
    if (f.strike) {
      univerStyle.st = { s: 1, c: 0 };
    }
  }

  const fill = style.fill as any;
  if (fill) {
    if (fill.type === 'pattern' && fill.fgColor?.argb) {
      univerStyle.bg = { rgb: argbToRgb(fill.fgColor.argb) };
    } else if (fill.type === 'gradient' && fill.stops?.length > 0) {
      const firstStop = fill.stops[0];
      if (firstStop?.color?.argb) {
        univerStyle.bg = { rgb: argbToRgb(firstStop.color.argb) };
      }
    }
  }

  if (style.alignment) {
    const a = style.alignment;
    if (a.horizontal) {
      univerStyle.ht = horizontalAlignMap(a.horizontal);
    }
    if (a.vertical) {
      univerStyle.vt = verticalAlignMap(a.vertical);
    }
    if (a.wrapText) {
      univerStyle.tb = 3;
    }
    if (a.textRotation) {
      if (a.textRotation === 'vertical') {
        univerStyle.tr = { a: 0, v: 1 };
      } else if (typeof a.textRotation === 'number') {
        univerStyle.tr = { a: a.textRotation, v: 0 };
      }
    }
    if (a.indent) {
      univerStyle.pd = { l: a.indent * 4 };
    }
  }

  if (style.border) {
    const b = style.border;
    const borderObj: any = {};

    ['top', 'bottom', 'left', 'right'].forEach((side) => {
      const sideStyle = b[side as keyof typeof b];
      if (sideStyle?.style) {
        const key = side[0] as 't' | 'b' | 'l' | 'r';
        borderObj[key] = {
          s: borderStyleMap(sideStyle.style),
          cl: sideStyle.color?.argb
            ? { rgb: argbToRgb(sideStyle.color.argb) }
            : { rgb: '#000000' },
        };
      }
    });

    if (Object.keys(borderObj).length > 0) {
      univerStyle.bd = borderObj;
    }
  }

  if (style.numFmt) {
    univerStyle.n = { pattern: style.numFmt };
  }

  return Object.keys(univerStyle).length > 0 ? univerStyle : null;
}

function horizontalAlignMap(align: string): number {
  const map: Record<string, number> = {
    left: 1,
    center: 2,
    right: 3,
    justify: 1,
    distributed: 1,
    fill: 1,
    centerContinuous: 2,
  };
  return map[align] || 1;
}

function verticalAlignMap(align: string): number {
  const map: Record<string, number> = {
    top: 1,
    middle: 2,
    bottom: 3,
    justify: 2,
    distributed: 2,
  };
  return map[align] || 1;
}

function borderStyleMap(style: string): number {
  const map: Record<string, number> = {
    thin: 1,
    hair: 2,
    dotted: 3,
    dashed: 4,
    dashDot: 5,
    dashDotDot: 6,
    double: 7,
    medium: 8,
    mediumDashed: 9,
    mediumDashDot: 10,
    mediumDashDotDot: 11,
    thick: 12,
    slantDashDot: 13,
  };
  return map[style] || 1;
}

function argbToRgb(argb: string): string {
  if (!argb) return '#000000';
  if (argb.startsWith('#')) return argb;
  if (argb.length === 8) return '#' + argb.slice(2);
  if (argb.length === 6) return '#' + argb;
  return '#000000';
}
