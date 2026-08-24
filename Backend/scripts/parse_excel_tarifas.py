#!/usr/bin/env python3
"""
Parser de plantillas Excel de tarifas de metrología.

Recibe una ruta a un archivo .xlsx y un JSON de configuración de mapeo
(MAPEO_CONFIG) generado en el Frontend. Extrae las filas de datos y emite
a stdout un JSON estandarizado:

{
  "success": true,
  "data": [
    {
      "magnitud": "PRESIÓN",
      "instrumento": "MANÓMETRO DIGITAL",
      "norma": "DKD-R 6-1",
      "tipoServicio": "ACREDITADO",
      "preciosPorAnio": [
        { "anio": 2025, "precio": 135000.0 },
        { "anio": 2026, "precio": 150000.0 }
      ]
    }
  ]
}

Uso:
    python3 scripts/parse_excel_tarifas.py --file /ruta/plantilla.xlsx --mapeo '{"filaInicialDatos":1,...}'
"""

import argparse
import json
import re
import sys
from datetime import datetime

import pandas as pd

# Patrón para extraer el valor numérico de una celda con fórmula sin caché
# (ej: "=SUMA(B2:B5)" -> intenta extraer un número literal).
# El lookbehind evita casar dígitos dentro de referencias de celda (B2, A1).
_NUMERO_EN_FORMULA = re.compile(r"(?<![A-Za-z0-9_.])\s*[+-]?\d+(?:[.,]\d+)*")

# Símbolos de moneda y sufijos comunes (COP, USD, $, €, COL$, etc.)
_PATRON_LIMPIADO = re.compile(r"(?i)[a-záéíóú$\u20ac]")
_SOLO_DIGITOS_SEPARADORES = re.compile(r"^[+\-()\d.,\s]+$")


def limpiar_string(val, default="n/a") -> str:
    """Normaliza un valor de celda a cadena limpia (sin saltos de línea)."""
    if val is None or pd.isna(val):
        return default
    s = str(val).replace("\n", " ").replace("\r", " ").replace("\t", " ")
    s = re.sub(r"\s+", " ", s).strip()
    if not s or s.lower() in ("nan", "none", "null"):
        return default
    return s


def _extraer_numero_de_formula(val: str):
    """Si la celda es una fórmula sin valor calculado, intenta leer un número literal."""
    m = _NUMERO_EN_FORMULA.search(val)
    if not m:
        return None
    texto = m.group(0)
    try:
        return _normalizar_numero(texto)
    except ValueError:
        return None


def _normalizar_numero(val) -> float:
    """
    Convierte un valor de celda (string o numérico) a float de forma defensiva.

    Soporta:
      - Números puros ("135000", 135000.5)
      - Moneda con símbolos ("$1.350.000", "COP 150.000,00", "USD 1,350.00")
      - Negativos entre paréntesis ("(1.200,50)" -> -1200.5)
      - Celdas corruptas tipo fecha ("2025-01-01", Excel serial)
      - Celdas con fórmula ("=SUM(...)" sin caché -> intenta extraer número)
    """
    if val is None or pd.isna(val):
        raise ValueError("Valor vacío")

    # Numérico nativo de pandas (int/float). Los booleanos se rechazan.
    if isinstance(val, bool):
        raise ValueError(f"Valor booleano no es un precio: {val}")
    if isinstance(val, (int, float)):
        return float(val)

    # Datetime: una celda de precio con formato de fecha es un dato corrupto.
    if isinstance(val, (pd.Timestamp, datetime)):
        raise ValueError(f"Celda con formato de fecha en columna de precio: {val}")

    texto = str(val).strip()
    if not texto:
        raise ValueError("Valor vacío")

    # Fórmula sin valor calculado (pandas normalmente devuelve el caché, no la fórmula).
    if texto.startswith("="):
        extraido = _extraer_numero_de_formula(texto)
        if extraido is None:
            raise ValueError(f"Fórmula sin valor numérico recuperable: {texto}")
        return extraido

    # Fecha ISO dentro de una columna de precio -> dato corrupto.
    if re.match(r"^\d{4}-\d{2}-\d{2}", texto):
        raise ValueError(f"Formato de fecha en columna de precio: {texto}")

    # Si tras limpiar no queda una forma numérica plausible, rechazar.
    candidato = _PATRON_LIMPIADO.sub("", texto)
    if not _SOLO_DIGITOS_SEPARADORES.match(candidato):
        raise ValueError(f"Formato de moneda corrupto: {texto}")

    # Contexto de moneda: presencia de símbolo ($, €) o texto (COP, USD, COL$...).
    es_moneda = bool(re.search(r"(?i)[a-záéíóú$€]", texto))

    # Negativos entre paréntesis.
    es_negativo = "(" in texto and ")" in texto
    signo = -1 if es_negativo else 1

    candidato = candidato.replace("(", "").replace(")", "").strip()

    # Determinar el separador decimal:
    #  - Si aparecen '.' y ',' -> el último es el decimal.
    #  - Si solo aparece ',' -> decimal (formato latino).
    #  - Si solo aparece '.' -> separador de miles si hay contexto de moneda y el
    #    último grupo tiene 3 dígitos, o si hay múltiples grupos de 3 (1.350.000).
    #    En caso contrario se conserva como decimal ("1350.5").
    if "," in candidato and "." in candidato:
        if candidato.rfind(",") > candidato.rfind("."):
            candidato = candidato.replace(".", "").replace(",", ".")
        else:
            candidato = candidato.replace(",", "")
    elif "," in candidato:
        candidato = candidato.replace(",", ".")
    elif "." in candidato:
        partes = candidato.split(".")
        ultimo_largo = len(partes[-1])
        multiples_grupos = len(partes) > 2 and all(len(g) == 3 for g in partes[1:])
        if (es_moneda and ultimo_largo == 3) or multiples_grupos:
            candidato = candidato.replace(".", "")

    if not re.match(r"^[+-]?\d+(\.\d+)?$", candidato):
        raise ValueError(f"Formato de moneda corrupto: {texto}")

    return signo * float(candidato)


def parsear_precio_celda(val) -> float:
    """Wrapper defensivo: nunca lanza, devuelve None si la celda no es un precio válido."""
    try:
        return _normalizar_numero(val)
    except (ValueError, TypeError, OverflowError):
        return None


def parsear_excel(ruta_excel: str, config: dict):
    df = pd.read_excel(ruta_excel, header=None)
    fila_inicio = config.get("filaInicialDatos", 1)
    cols = config.get("columnas", {})
    mapa_anios = config.get("anios", {})

    # Validación mínima del mapeo: sin columnas mapeadas no hay nada que extraer.
    if not cols or not mapa_anios:
        raise ValueError("El MAPEO_CONFIG debe incluir 'columnas' y 'anios'.")

    resultados = []

    for idx in range(fila_inicio, len(df)):
        row = df.iloc[idx]

        magnitud = limpiar_string(row.get(cols.get("magnitud")))
        instrumento = limpiar_string(row.get(cols.get("instrumento")))
        norma = limpiar_string(row.get(cols.get("norma")))
        tipo_servicio_raw = limpiar_string(
            row.get(cols.get("tipoServicio")), default="ACREDITADO"
        )

        # Regla de omisión de filas vacías
        if magnitud == "n/a" and instrumento == "n/a":
            continue

        tipo_servicio = (
            "NO ACREDITADO"
            if "NO" in tipo_servicio_raw.upper()
            else "ACREDITADO"
        )

        precios_lista = []
        for anio_str, col_idx in mapa_anios.items():
            raw_val = row.get(col_idx)
            precio = parsear_precio_celda(raw_val)
            if precio is not None and precio >= 0:
                precios_lista.append(
                    {"anio": int(anio_str), "precio": round(precio, 2)}
                )

        if precios_lista:
            resultados.append(
                {
                    "magnitud": magnitud,
                    "instrumento": instrumento,
                    "norma": norma,
                    "tipoServicio": tipo_servicio,
                    "preciosPorAnio": precios_lista,
                }
            )

    return resultados


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--file", required=True)
    parser.add_argument("--mapeo", required=True)
    args = parser.parse_args()

    try:
        config_dict = json.loads(args.mapeo)
        data = parsear_excel(args.file, config_dict)
        print(json.dumps({"success": True, "data": data}))
    except Exception as e:
        print(
            json.dumps({"success": False, "error": str(e)}), file=sys.stderr
        )
        sys.exit(1)
