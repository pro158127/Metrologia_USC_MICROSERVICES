"use client";

/**
 * FileViewer.tsx
 * Componente único para Next.js que permite visualizar archivos PDF, Excel (.xls/.xlsx)
 * y Word (.doc/.docx) que provienen de un endpoint backend (S3 por detrás, Fastify, etc.)
 * o de un objeto File local.
 *
 * Dependencias necesarias:
 *   npm install xlsx mammoth
 *
 * Uso típico con tus rutas de Fastify (GET /api/v1/{excel|pdf|docs}/download/:fileId):
 *
 *   <FileViewer kind="excel" fileUrl={`/api/v1/excel/download/${fileId}`} />
 *   <FileViewer kind="pdf"   fileUrl={`/api/v1/pdf/download/${fileId}`} />
 *   <FileViewer kind="word"  fileUrl={`/api/v1/docs/download/${fileId}`} />
 *
 * O dejá que arme la URL por vos:
 *   <FileViewer kind="excel" fileId={fileId} apiBaseUrl="/api/v1" />
 *
 * Si tu endpoint requiere cookies de sesión o headers (Authorization, etc.):
 *   <FileViewer kind="pdf" fileId={fileId} fetchOptions={{ credentials: "include" }} />
 *
 * Compatibilidad: Next.js 16.x + React 19 — componente 100% "use client",
 * no usa APIs de Server Components ni depende de params síncronos, así que
 * no lo afectan los breaking changes de Next 16 (async params, Cache Components,
 * remoción de Babel). Si lo instanciás desde un Server Component/page que recibe
 * params, recordá que en Next 16 son async:
 *
 *   export default async function Page({ params }: { params: Promise<{ fileId: string }> }) {
 *     const { fileId } = await params;
 *     return <FileViewer kind="pdf" fileId={fileId} />;
 *   }
 */

import React, { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import mammoth from "mammoth";

type FileKind = "pdf" | "excel" | "word";

/** Ajustá estos templates si tus rutas reales difieren */
const DEFAULT_ENDPOINTS: Record<FileKind, (base: string, id: string) => string> = {
  excel: (base, id) => `${base}/excel/download/${id}`,
  pdf: (base, id) => `${base}/pdf/download/${id}`,
  word: (base, id) => `${base}/docs/download/${id}`,
};

interface FileViewerProps {
  /** Tipo de archivo — obligatorio ya que la URL del endpoint no trae extensión */
  kind: FileKind;
  /** URL completa del endpoint que devuelve el binario (tiene prioridad sobre fileId) */
  fileUrl?: string;
  /** Alternativa: id del archivo, se arma la URL con apiBaseUrl + DEFAULT_ENDPOINTS */
  fileId?: string;
  /** Base de tu API, usado junto con fileId (por defecto "/api/v1") */
  apiBaseUrl?: string;
  /** Alternativa: un objeto File local (por ejemplo desde un <input type="file" />) */
  file?: File;
  /** Nombre a mostrar en el header del visor */
  fileName?: string;
  /** Opciones extra para el fetch (headers, credentials, etc.) */
  fetchOptions?: RequestInit;
  /** Altura del contenedor (por defecto 80vh) */
  height?: string;
  className?: string;
}

async function getArrayBuffer(
  fileUrl?: string,
  file?: File,
  fetchOptions?: RequestInit
): Promise<ArrayBuffer> {
  if (file) return await file.arrayBuffer();
  if (fileUrl) {
    console.log("Descargando archivo desde URL:", fileUrl, "con opciones:", fetchOptions);
    const res = await fetch(fileUrl, fetchOptions);
    if (!res.ok) throw new Error(`No se pudo descargar el archivo (${res.status})`);
    return await res.arrayBuffer();
  }
  throw new Error("Debes proporcionar 'fileUrl', 'fileId' o 'file'.");
}

/* ---------------------------- Visor de Excel ---------------------------- */

function ExcelViewer({
  fileUrl,
  file,
  fetchOptions,
}: {
  fileUrl?: string;
  file?: File;
  fetchOptions?: RequestInit;
}) {
  const [sheets, setSheets] = useState<Record<string, any[][]>>({});
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [activeSheet, setActiveSheet] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    getArrayBuffer(fileUrl, file, fetchOptions)
      .then((buffer) => {
        const workbook = XLSX.read(buffer, { type: "array" });
        const result: Record<string, any[][]> = {};
        workbook.SheetNames.forEach((name) => {
          const sheet = workbook.Sheets[name];
          result[name] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
        });
        if (!cancelled) {
          setSheets(result);
          setSheetNames(workbook.SheetNames);
          setActiveSheet(workbook.SheetNames[0] ?? "");
        }
      })
      .catch((err) => !cancelled && setError(err.message ?? "Error al leer el Excel"))
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
  }, [fileUrl, file, fetchOptions]);

  if (loading) return <CenteredMessage text="Cargando hoja de cálculo..." />;
  if (error) return <CenteredMessage text={`Error: ${error}`} isError />;

  const rows = sheets[activeSheet] ?? [];

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      {sheetNames.length > 1 && (
        <div className="flex flex-shrink-0 gap-1 overflow-x-auto border-b border-gray-200 bg-gray-50 px-2 py-1">
          {sheetNames.map((name) => (
            <button
              key={name}
              onClick={() => setActiveSheet(name)}
              className={`whitespace-nowrap rounded-t px-3 py-1.5 text-sm font-medium transition-colors ${
                activeSheet === name
                  ? "bg-white text-blue-600 shadow-sm"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              {name}
            </button>
          ))}
        </div>
      )}
      <div className="flex-1 overflow-auto">
        <table className="min-w-full border-collapse text-sm">
          <tbody>
            {rows.map((row, rIdx) => (
              <tr key={rIdx} className={rIdx === 0 ? "bg-gray-100 font-semibold" : "even:bg-gray-50"}>
                {row.map((cell, cIdx) => (
                  <td key={cIdx} className="border border-gray-200 px-3 py-1.5 whitespace-nowrap">
                    {String(cell)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <CenteredMessage text="Esta hoja está vacía." />}
      </div>
    </div>
  );
}

/* ----------------------------- Visor de Word ----------------------------- */

function WordViewer({
  fileUrl,
  file,
  fetchOptions,
}: {
  fileUrl?: string;
  file?: File;
  fetchOptions?: RequestInit;
}) {
  const [html, setHtml] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    getArrayBuffer(fileUrl, file, fetchOptions)
      .then((buffer) => mammoth.convertToHtml({ arrayBuffer: buffer }))
      .then((result) => !cancelled && setHtml(result.value))
      .catch((err) => !cancelled && setError(err.message ?? "Error al leer el documento Word"))
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
  }, [fileUrl, file, fetchOptions]);

  if (loading) return <CenteredMessage text="Cargando documento..." />;
  if (error) return <CenteredMessage text={`Error: ${error}`} isError />;

  return (
    <div className="h-full w-full overflow-auto bg-white p-8">
      <div
        className="prose prose-sm sm:prose-base mx-auto max-w-3xl"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}

/* ------------------------------ Visor de PDF ------------------------------ */

function PdfViewer({
  fileUrl,
  file,
  fetchOptions,
}: {
  fileUrl?: string;
  file?: File;
  fetchOptions?: RequestInit;
}) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let createdUrl: string | null = null;
    setError(null);
    setObjectUrl(null);
    console.log(fileUrl ? "Cargando PDF desde URL:" : "Cargando PDF desde File:", fileUrl || file);
    getArrayBuffer(fileUrl, file, fetchOptions)
      .then((buffer) => {
        if (cancelled) return;
        const blob = new Blob([buffer], { type: "application/pdf" });
        createdUrl = URL.createObjectURL(blob);
        setObjectUrl(createdUrl);
        console.log("PDF cargado y listo para mostrar:", createdUrl);
      })
      .catch((err) => !cancelled && setError(err.message ?? "Error al leer el PDF"));

    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [fileUrl, file, fetchOptions]);

  if (error) return <CenteredMessage text={`Error: ${error}`} isError />;
  if (!objectUrl) return <CenteredMessage text="Cargando PDF..." />;

  return <iframe src={objectUrl} title="Visor de PDF" className="h-full w-full border-0" />;
}

/* ------------------------------ Utilidades UI ------------------------------ */

function CenteredMessage({ text, isError = false }: { text: string; isError?: boolean }) {
  return (
    <div className="flex h-full w-full items-center justify-center p-8 text-center">
      <p className={isError ? "text-red-600" : "text-gray-500"}>{text}</p>
    </div>
  );
}

/* ------------------------------ Componente raíz ------------------------------ */

export default function FileViewer({
  kind,
  fileUrl,
  fileId,
  apiBaseUrl = "/api/v1",
  file,
  fileName,
  fetchOptions,
  height = "80vh",
  className = "",
}: FileViewerProps) {
const resolvedUrl = useMemo(() => {
  console.log("Resolviendo URL para kind:", kind, "fileUrl:", fileUrl, "fileId:", fileId);

  // Helper de sanitización único para no repetir código
  const sanitizePath = (path: string) => {
    return path
      .replace(/(\/?pdf\/download\/)/g, '/') // Elimina cualquier "/pdf/download/" colado
      .replace(/([^:]\/)\/+/g, "$1");        // Limpia dobles barras ("//")
  };

  // 1. Si viene por fileUrl, lo sanitizamos directamente
  if (fileUrl) {
    return sanitizePath(fileUrl);
  }

  // 2. Si viene por fileId, armamos la URL base y la sanitizamos
  if (fileId) {
    const cleanFileId = fileId
      .replace(/(\/?pdf\/download\/)/g, '')
      .replace(/^\//, '');

    const rawUrl = DEFAULT_ENDPOINTS[kind](apiBaseUrl, cleanFileId);
    return sanitizePath(rawUrl);
  }

  return undefined;
}, [fileUrl, fileId, apiBaseUrl, kind]);
  const resolvedName = useMemo(
    () => fileName || file?.name || fileId || resolvedUrl || "",
    [fileName, file, fileId, resolvedUrl]
  );

  if (!resolvedUrl && !file) {
    return <CenteredMessage text="No se proporcionó ningún archivo (fileUrl, fileId o file)." isError />;
  }

  console.log(resolvedUrl ? "Usando URL resuelta:" : "Usando objeto File:", resolvedUrl || file);

  let content: React.ReactNode;
  switch (kind) {
    case "pdf":
      content = <PdfViewer fileUrl={resolvedUrl} file={file} fetchOptions={fetchOptions} />;
      break;
    case "excel":
      content = <ExcelViewer fileUrl={resolvedUrl} file={file} fetchOptions={fetchOptions} />;
      break;
    case "word":
      content = <WordViewer fileUrl={resolvedUrl} file={file} fetchOptions={fetchOptions} />;
      break;
  }

  return (
    <div
      className={`flex flex-col overflow-hidden rounded-lg border border-gray-200 shadow-sm ${className}`}
      style={{ height }}
    >
      <div className="flex flex-shrink-0 items-center justify-between border-b border-gray-200 bg-gray-50 px-4 py-2">
        <span className="truncate text-sm font-medium text-gray-700">
          {resolvedName.split("/").pop() || "Archivo"}
        </span>
        <span className="ml-2 flex-shrink-0 rounded bg-gray-200 px-2 py-0.5 text-xs uppercase text-gray-600">
          {kind}
        </span>
      </div>
      <div className="flex-1 overflow-hidden">{content}</div>
    </div>
  );
}
