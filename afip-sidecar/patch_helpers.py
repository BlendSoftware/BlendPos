#!/usr/bin/env python3
"""
Parcha específicamente el archivo helpers.py de pysimplesoap.
C Corrige el problema de write() que espera str pero recibe bytes en Python 3.
"""
import os
import sys
import site

def find_helpers_py():
    """Encuentra el archivo helpers.py instalado en site-packages."""
    for path in site.getsitepackages() + [site.getusersitepackages()]:
        if not path:
            continue
        helpers_path = os.path.join(path, 'pysimplesoap', 'helpers.py')
        if os.path.exists(helpers_path):
            return helpers_path
    return None

def patch_helpers(path):
    """Aplica parches al archivo helpers.py."""
    print(f"Parcheando {path}...")
    
    with open(path, 'r', encoding='utf-8', errors='replace') as f:
        lines = f.readlines()
    
    modified = False
    new_lines = []
    
    i = 0
    while i < len(lines):
        line = lines[i]
        
        # Buscar el patrón where se abre un archivo para escribir XML
        # Normalmente aparece como: with open(cache, "w") as f:
        # Debe cambiar a: with open(cache, "wb") as f:
        if ('open(' in line and ',"w")' in line) or ('open(' in line and ", 'w')" in line):
            original = line
            line = line.replace(',"w")', ',"wb")').replace(", 'w')", ", 'wb')")
            if line != original:
                print(f"  ✓ Línea {i+1}: Cambiado 'w' -> 'wb'")
                modified = True
        
        # También buscar f = open(..., "w") sin with
        if 'open(' in line and '"w"' in line and '=' in line:
            original = line
            line = line.replace('"w"', '"wb"')
            if line != original:
                print(f"  ✓ Línea {i+1}: Cambiado 'w' -> 'wb' (sin with)")
                modified = True
        
        if 'open(' in line and "'w'" in line and '=' in line:
            original = line
            line = line.replace("'w'", "'wb'")
            if line != original:
                print(f"  ✓ Línea {i+1}: Cambiado 'w' -> 'wb' (sin with, comillas simples)")
                modified = True
        
        new_lines.append(line)
        i += 1
    
    if modified:
        with open(path, 'w', encoding='utf-8') as f:
            f.writelines(new_lines)
        print(f"✓ Archivo parcheado exitosamente")
        return True
    else:
        print("⚠ No se encontraron cambios necesarios")
        return False

if __name__ == '__main__':
    helpers_path = find_helpers_py()
    if not helpers_path:
        print("ERROR: No se encontró pysimplesoap/helpers.py en site-packages")
        sys.exit(1)
    
    success = patch_helpers(helpers_path)
    sys.exit(0 if success else 1)
