#!/usr/bin/env python3
import pandas as pd
import json
import re
import argparse
import sys

# 1. Traductor: Convierte letras ("K") a índices (10)
def letra_a_indice(col_str: str) -> int:
    num = 0
    for c in col_str.upper():
        num = num * 26 + (ord(c) - ord('A')) + 1
    return num - 1

# 2. Extractor del año
def extraer_anio(texto):
    if pd.isna(texto): return None
    match = re.search(r"(20\d{2})", str(texto))
    return int(match.group(1)) if match else None

# 3. Limpiador de dinero
def parsear_precio(val):
    if pd.isna(val): return None
    val_clean = re.sub(r"[^\d\.,]", "", str(val))
    if not val_clean or not any(c.isdigit() for c in val_clean): return None
    try:
        return float(val_clean.replace(',', '.'))
    except ValueError:
        return None

def ejecutar_extraccion(file_path, config, out_file):
    # Leemos la hoja de Excel
    df = pd.read_excel(file_path, sheet_name='Tarifas', header=None)
    
    # Asignación de índices
    col_mag = letra_a_indice(config["columnas"]["magnitud"])
    col_inst = letra_a_indice(config["columnas"]["instrumento"])
    col_norma = letra_a_indice(config["columnas"]["norma"])
    col_tipo_servicio = letra_a_indice(config["columnas"]["tipoServicio"])
    
    # Propagar el bloque (Acreditado / No Acreditado / Magnitud)
    df[col_tipo_servicio] = df[col_tipo_servicio].ffill()
    
    fila_encabezados = config["filaEncabezados"] - 1
    fila_datos = config["filaInicialDatos"] - 1
    
    mapa_anios = {}
    for letra in config.get("columnasPrecios", []):
        idx = letra_a_indice(letra)
        anio = extraer_anio(df.iloc[fila_encabezados, idx])
        if anio:
            mapa_anios[idx] = anio
            
    resultados = []
    
    for idx in range(fila_datos, len(df)):
        row = df.iloc[idx]
        instrumento = row[col_inst]
        
        # Ignorar vacíos
        if pd.isna(instrumento) or str(instrumento).strip() == "":
            continue
            
        valor_col_servicio = str(row[col_tipo_servicio]).strip().upper()
        
        if "NO ACREDITADO" in valor_col_servicio:
            tipo_servicio = "NO ACREDITADO"
        else:
            tipo_servicio = "ACREDITADO"
            
        magnitud = str(row[col_mag]).strip() if pd.notna(row[col_mag]) else "N/A"
            
        precios = []
        for col_idx, anio in mapa_anios.items():
            precio = parsear_precio(row[col_idx])
            if precio is not None and precio > 0:
                precios.append({"anio": anio, "precio": round(precio, 2)})
                
        resultados.append({
            "magnitud": magnitud,
            "instrumento": str(instrumento).strip(),
            "norma": str(row[col_norma]).strip() if pd.notna(row[col_norma]) else "N/A",
            "tipoServicio": tipo_servicio,
            "preciosPorAnio": precios
        })
        
    # Escritura atómica en el archivo indicado por Node.js
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump({"success": True, "data": resultados}, f, ensure_ascii=False)

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--file", required=True, help="Ruta al archivo Excel")
    parser.add_argument("--mapeo-file", required=True, help="Ruta al JSON de configuración")
    parser.add_argument("--out-file", required=True, help="Ruta donde se guardará el resultado JSON")
    args = parser.parse_args()

    try:
        # Cargar el combustible (JSON) dictado por la terminal
        with open(args.mapeo_file, "r", encoding="utf-8") as f:
            config_dict = json.load(f)
            
        ejecutar_extraccion(args.file, config_dict, args.out_file)
        
    except Exception as e:
        # Control de daños: Si algo explota, le informamos a Node estructuradamente
        with open(args.out_file, "w", encoding="utf-8") as f:
            json.dump({"success": False, "error": str(e)}, f, ensure_ascii=False)
        sys.exit(1)