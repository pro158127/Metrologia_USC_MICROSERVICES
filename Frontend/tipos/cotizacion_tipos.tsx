export interface Historial_places{
  id: string;
  numeroVersion: string;
  fechaCambio: string | Date;
  descripcion: string;
  requiereValidacionHoja: boolean;
  observaciones?: string | null;
  aprobo: string;
  idCotizacion: number;
}

export interface Historial_chagee{
  items: Historial_places[];
  loading: boolean;
}