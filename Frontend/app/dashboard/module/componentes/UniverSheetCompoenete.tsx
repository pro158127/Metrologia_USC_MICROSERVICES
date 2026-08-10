'use client';

import React, { useEffect, useRef, useState } from 'react';
import { createUniver, LocaleType, mergeLocales } from '@univerjs/presets';
import { UniverSheetsCorePreset } from '@univerjs/preset-sheets-core';
import sheetsCoreEnUS from '@univerjs/preset-sheets-core/locales/en-US';
import { IWorkbookData } from '@univerjs/presets';
import ExcelJS from 'exceljs';
import { excelToUniverSnapshot } from '@/app/excel_univer_util/index';

import '@univerjs/preset-sheets-core/lib/index.css';

interface UniverSheetProps {
  fileUrl?: string;
}


//tal




//funcion para  crear estructura 



export const UniverSheet: React.FC<UniverSheetProps> = ({ fileUrl }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const univerAPIRef = useRef<any>(null);
  const workbookRef = useRef<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 1. Inicializar Univer
  useEffect(() => {
    if (!containerRef.current) return;

    const { univerAPI } = createUniver({
      locale: LocaleType.EN_US,
      locales: {
        [LocaleType.EN_US]: mergeLocales([sheetsCoreEnUS]),
      },
      presets: [
        UniverSheetsCorePreset({
          container: containerRef.current,
        }),
      ],
    });

    univerAPIRef.current = univerAPI;

    return () => {
      univerAPI.dispose();
    };
  }, []);

  // 2. Cargar archivo
  useEffect(() => {



    if (!fileUrl || !univerAPIRef.current) return;

    const loadExcelFile = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const univerAPI = univerAPIRef.current;

        // Limpiar workbook anterior
        if (workbookRef.current) {
          workbookRef.current = null;
        }
 // 🔥 Paso 1: Descargar el archivo Excel desde el endpoint
      const response = await fetch(fileUrl, {
          // ✅ Asegurar que no se cachee mal
          cache: 'no-store',
          headers: {
            'Accept': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          }
        });

        if (!response.ok) {
          throw new Error(`Error HTTP: ${response.status} - ${response.statusText}`);
        }

        // ✅ Verificar el Content-Type de la respuesta
        const contentType = response.headers.get('content-type');
        console.log('Content-Type recibido:', contentType);

        // 🔥 Paso 2: Obtener el ArrayBuffer
        const arrayBuffer = await response.arrayBuffer();

   


        const snap=await excelToUniverSnapshot(arrayBuffer)
        const blob = new Blob([JSON.stringify(snap, null, 2)], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `snapshot-${Date.now()}.txt`;
        a.click();
        URL.revokeObjectURL(url);
            
        // 🔥 Paso 4: Crear workbook en Univer
        workbookRef.current = univerAPI.createWorkbook(snap);
        setIsLoading(false);

      } catch (err) {
        console.error('Error:', err);
        setError('Error al cargar el archivo');
        setIsLoading(false);
      }
    };

    loadExcelFile();
  }, [fileUrl]);

  // 3. Función simple para asegurar IDs únicos
  const ensureUniqueIds = (data: any) => {
    const newData = { ...data };
    const usedIds = new Set<string>();
    const timestamp = Date.now();

    // Solo procesar sheets si existen
    if (newData.sheets) {
      const sheetsArray = Array.isArray(newData.sheets) 
        ? newData.sheets 
        : Object.values(newData.sheets);

      const cleanSheets = sheetsArray.map((sheet: any, index: number) => {
        const newSheet = { ...sheet };
        
        // Generar ID único si está duplicado o no existe
        if (!newSheet.id || usedIds.has(newSheet.id)) {
          newSheet.id = `sheet-${timestamp}-${index}`;
        }
        
        usedIds.add(newSheet.id);
        return newSheet;
      });

      // Mantener el mismo formato
      newData.sheets = Array.isArray(newData.sheets) 
        ? cleanSheets 
        : cleanSheets.reduce((acc: any, sheet: any) => {
            acc[sheet.id] = sheet;
            return acc;
          }, {});
    }

    return newData;
  };

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      {isLoading && (
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}>
          Cargando...
        </div>
      )}
      
      {error && (
        <div style={{ color: 'red', position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}>
          {error}
        </div>
      )}

      <div ref={containerRef} style={{ width: '100%', height: '100%', minHeight: '500px' }} />
    </div>
  );
};