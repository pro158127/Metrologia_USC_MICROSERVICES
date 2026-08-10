// lib/workers/excelParser.worker.js
const { parentPort, workerData } = require('worker_threads');
const ExcelJS = require('exceljs');
const fs = require('fs');

/**
 * Convierte formatos de color ARGB / Theme de ExcelJS a HEX estándar de CSS
 */
function argbToHex(colorObj) {
  if (!colorObj) return null;
  
  // Si viene en formato string ARGB direct "FF1E1B4B"
  if (typeof colorObj === 'string') {
    const clean = colorObj.replace(/^FF/i, '');
    return `#${clean.padStart(6, '0')}`;
  }
  
  // Si viene como objeto { argb: "FF1E1B4B" }
  if (colorObj.argb) {
    const clean = colorObj.argb.replace(/^FF/i, '');
    return `#${clean.padStart(6, '0')}`;
  }

  return null;
}

async function parseExcelToSnapshot() {
  try {
    const { absolutePath, documentId } = workerData;

    // 1. Validar que el archivo exista en el sistema local
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`El archivo local no fue encontrado en: ${absolutePath}`);
    }

    // 2. Instanciar workbook de ExcelJS y leer el buffer en memoria del worker
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(absolutePath);

    const hojasParsed = [];

    // 3. Iterar cada pestaña (Worksheet)
    workbook.eachSheet((worksheet) => {
      const datosCeldas = {};
      const imagenesHoja = [];

      // Mapear celdas y extraer propiedades visuales
      worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
        row.eachCell({ includeEmpty: false }, (cell) => {
          const address = cell.address; // Ej: "A1", "B3"

          // Extraer Color de Fondo (Fill)
          let bgHex = null;
          if (cell.fill && cell.fill.type === 'pattern' && cell.fill.fgColor) {
            bgHex = argbToHex(cell.fill.fgColor);
          }

          // Extraer Estilos de Fuente
          let colorTexto = null;
          let bold = false;
          let italic = false;

          if (cell.font) {
            colorTexto = argbToHex(cell.font.color);
            bold = !!cell.font.bold;
            italic = !!cell.font.italic;
          }

          // Extraer Alineación
          const align = cell.alignment?.horizontal || 'left';

          // Extraer Valor (Soporta fórmulas calculadas y links)
          let valor = cell.value;
          if (typeof valor === 'object' && valor !== null) {
            if (valor.result !== undefined) valor = valor.result; // Resultado de formula
            else if (valor.text !== undefined) valor = valor.text; // Texto enriquecido
          }

          datosCeldas[address] = {
            valor: valor ?? null,
            bgHex,
            colorTexto,
            bold,
            italic,
            align,
          };
        });
      });

      // Extraer Imágenes Embebidas de la Hoja
      const images = worksheet.getImages();
      for (const img of images) {
        const media = workbook.model.media[img.imageId];
        if (media && media.buffer) {
          const extension = media.extension || 'png';
          const base64 = `data:image/${extension};base64,${media.buffer.toString('base64')}`;
          
          imagenesHoja.push({
            id: img.imageId,
            range: img.range, // Posición de la imagen (tl/br anchors)
            base64,
          });
        }
      }

      hojasParsed.push({
        nombre: worksheet.name,
        filas: worksheet.rowCount,
        columnas: worksheet.columnCount,
        datos: datosCeldas,
        imagenes: imagenesHoja,
      });
    });

    // 4. Retornar el Snapshot JSON procesado al Main Thread
    parentPort.postMessage({
      success: true,
      snapshot: {
        documentId: documentId || 'doc-local',
        hojas: hojasParsed,
        procesadoEn: new Date().toISOString(),
      },
    });

  } catch (error) {
    parentPort.postMessage({
      success: false,
      error: error.message,
    });
  }
}

// Iniciar ejecución
parseExcelToSnapshot();