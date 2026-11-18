async function downloadFromPresignedUrl(
  presignedUrl: string, 
  fallbackName = 'archivo_descargado'
): Promise<boolean> {
  try {
    // 1. Petición directa a MinIO
    const response = await fetch(presignedUrl);
    
    if (!response.ok) {
      console.error(`Error HTTP en MinIO: ${response.status} ${response.statusText}`);
      return false;
    }

    // 2. Intentar extraer el nombre del encabezado HTTP
    let fileName = fallbackName;
    const contentDisposition = response.headers.get('content-disposition');
    
    if (contentDisposition) {
      const match = contentDisposition.match(/filename="?([^";]+)"?/);
      if (match && match[1]) {
        fileName = match[1];
      }
    }

    // 3. Procesar el binario e iniciar la descarga en el DOM
    const blob = await response.blob();
    const blobUrl = window.URL.createObjectURL(blob);

    const anchor = document.createElement('a');
    anchor.href = blobUrl;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();

    // Limpieza
    document.body.removeChild(anchor);
    window.URL.revokeObjectURL(blobUrl);

    return true; // Descarga iniciada con éxito
  } catch (error) {
    console.error('Fallo en el proceso de descarga:', error);
    return false; // Ocurrió un error de red o en la manipulación del Blob
  }
}

export default downloadFromPresignedUrl;