#!/usr/bin/env python3
"""
Parcha específicamente el archivo client.py de pysimplesoap instalado.
Corrige referencias a basestring que no existen en Python 3.
"""
import os
import re
import sys
import site

def find_pysimplesoap_client():
    """Encuentra el archivo client.py instalado en site-packages."""
    for path in site.getsitepackages() + [site.getusersitepackages()]:
        if not path:
            continue
        client_path = os.path.join(path, 'pysimplesoap', 'client.py')
        if os.path.exists(client_path):
            return (path, client_path)
    return (None, None)

def patch_file(path, file_description):
    """Aplica parches a un archivo de pysimplesoap."""
    print(f"Parcheando {file_description}: {path}...")
    
    with open(path, 'r', encoding='utf-8', errors='replace') as f:
        content = f.read()
    
    original = content
    
    # Reemplazar basestring con str
    # En Python 3, basestring no existe, solo str
    content = re.sub(r'\bbasestring\b', 'str', content)
    
    # También reemplazar unicode con str si existe
    content = re.sub(r'\bunicode\b', 'str', content)
    
    # Corregir apertura de archivos para escritura binaria
    # open(filename, "w") -> open(filename, "wb") si se escribe bytes
    # Buscar el patrón: f = open(..., "w") seguido de f.write(xml) donde xml son bytes
    # Este es un patrón común en helpers.py de pysimplesoap
    
    # Patrón 1: open(cache, "w") debería ser open(cache, "wb")
    if 'open(cache, "w")' in content:
        content = content.replace('open(cache, "w")', 'open(cache, "wb")')
        print(f"  ✓ Corregido: open(cache, 'w') -> open(cache, 'wb')")
    
    if "open(cache, 'w')" in content:
        content = content.replace("open(cache, 'w')", "open(cache, 'wb')")
        print(f"  ✓ Corregido: open(cache, 'w') -> open(cache, 'wb')")
    
    # Patrón 2: open(filename, "w") -> open(filename, "wb") en contexto de escritura XML
    content = re.sub(
        r'open\(([^,]+),\s*["\']w["\']\s*\)(\s*as\s+f:)',
        r'open(\1, "wb")\2',
        content
    )
    
    # Patrón 3: Corregir lectura de archivos pickle
    # open(filename, "r") -> open(filename, "rb") cuando se usa con pickle
    # Buscar líneas cerca de pickle.load
    if 'pickle.load' in content:
        # Caso 1: open(..., "r") as f: seguido de pickle.load en siguiente línea
        content = re.sub(
            r'open\(([^,]+),\s*["\']r["\']\s*\)(\s*as\s+f:\s*\n[^\n]*pickle\.load)',
            r'open(\1, "rb")\2',
            content
        )
        # Caso 2: f = open(..., 'r') en una línea, pickle.load(f) en otra
        content = re.sub(
            r"f\s*=\s*open\(([^,]+),\s*['\"]r['\"]\s*\)(.*?pickle\.load\(f\))",
            r"f = open(\1, 'rb')\2",
            content,
            flags=re.DOTALL
        )
        print(f"  ✓ Corregido: open(..., 'r') -> open(..., 'rb') para pickle.load")
    
    # Patrón 4: Escritura de pickle también necesita binario
    if 'pickle.dump' in content:
        content = re.sub(
            r'open\(([^,]+),\s*["\']w["\']\s*\)(\s*as\s+f:\s*\n[^\n]*pickle\.dump)',
            r'open(\1, "wb")\2',
            content
        )
        print(f"  ✓ Corregido: open(..., 'w') -> open(..., 'wb') para pickle.dump")
    
    if content != original:
        with open(path, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"✓ Archivo {file_description} parcheado exitosamente")
        return True
    else:
        print(f"⚠ No se encontraron cambios necesarios en {file_description}")
        return False

if __name__ == '__main__':
    root_path, client_path = find_pysimplesoap_client()
    if not client_path:
        print("ERROR: No se encontró pysimplesoap/client.py en site-packages")
        sys.exit(1)
    
    success = True
    
    # Parchear client.py
    success = patch_file(client_path, "client.py") and success
    
    # Parchear helpers.py
    helpers_path = os.path.join(root_path, 'pysimplesoap', 'helpers.py')
    if os.path.exists(helpers_path):
        success = patch_file(helpers_path, "helpers.py") and success
    else:
        print("WARNING: No se encontró helpers.py")
    
    sys.exit(0 if success else 1)
