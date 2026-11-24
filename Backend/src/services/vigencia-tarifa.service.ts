export function filtroPrecioVigente(fecha = new Date()) {
  return { FECHA_INICIO: { lte: fecha }, OR: [{ FECHA_FIN: null }, { FECHA_FIN: { gt: fecha } }] };
}
