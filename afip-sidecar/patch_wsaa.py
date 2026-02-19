#!/usr/bin/env python3
"""
Parcha específicamente el archivo wsaa.py de pyafipws instalado.
Corrige el bug de time.time().isoformat() que debería ser time.time()
"""
import os
import re
import sys
import site

def find_wsaa_py():
    """Encuentra el archivo wsaa.py instalado en site-packages."""
    for path in site.getsitepackages() + [site.getusersitepackages()]:
        if not path:
            continue
        wsaa_path = os.path.join(path, 'pyafipws', 'wsaa.py')
        if os.path.exists(wsaa_path):
            return wsaa_path
    return None

def patch_wsaa(path):
    """Aplica parches al archivo wsaa.py."""
    print(f"Parcheando {path}...")
    
    with open(path, 'r', encoding='utf-8', errors='replace') as f:
        content = f.read()
    
    original = content
    
    # PASO 1: Reemplazar time.time().isoformat() con time.time()
    # Este es el bug principal que causa el primer error
    if 'time.time().isoformat()' in content:
        content = content.replace('time.time().isoformat()', 'time.time()')
        print(f"  ✓ Corregido time.time().isoformat()")
    
    # PASO 2: Agregar .isoformat() donde falta
    old_gen = "tra.header.add_child('generationTime',str(datetime.datetime.fromtimestamp(int(time.time())-ttl)))"
    new_gen = "tra.header.add_child('generationTime',str(datetime.datetime.fromtimestamp(int(time.time())-ttl).isoformat()))"
    if old_gen in content:
        content = content.replace(old_gen, new_gen)
        print(f"  ✓ Corregido generationTime")
    
    old_exp = "tra.header.add_child('expirationTime',str(datetime.datetime.fromtimestamp(int(time.time())+ttl)))"
    new_exp = "tra.header.add_child('expirationTime',str(datetime.datetime.fromtimestamp(int(time.time())+ttl).isoformat()))"
    if old_exp in content:
        content = content.replace(old_exp, new_exp)
        print(f"  ✓ Corregido expirationTime")
    
    # PASO 3: Corregir el problema de communicate() que necesita bytes
    # El patrón es: .communicate(tra)[0]
    # Debe ser: .communicate(tra.encode() if isinstance(tra, str) else tra)[0]
    if '.communicate(tra)[0]' in content:
        content = content.replace(
            '.communicate(tra)[0]',
            '.communicate(tra.encode("utf-8") if isinstance(tra, str) else tra)[0]'
        )
        print(f"  ✓ Corregido communicate() para bytes")
    
    # PASO 4: Corregir el manejo de excepciones con errno
    # Buscar el patrón de excepción incorrecta
    old_exception_handling = """    except Exception as e:
        if e.errno == 2:"""
    
    new_exception_handling = """    except OSError as e:
        if e.errno == 2:"""
    
    if old_exception_handling in content:
        content = content.replace(old_exception_handling, new_exception_handling)
        print(f"  ✓ Corregido manejo de excepción errno")
    
    # Variante alternativa: puede estar como "except Exception, e:"
    old_exception_handling2 = """    except Exception, e:
        if e.errno == 2:"""
    
    if old_exception_handling2 in content:
        content = content.replace(old_exception_handling2, new_exception_handling)
        print(f"  ✓ Corregido manejo de excepción errno (v2)")
    
    if content != original:
        with open(path, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"✓ Archivo parcheado exitosamente")
        return True
    else:
        print("⚠ No se encontraron cambios necesarios")
        return False

if __name__ == '__main__':
    wsaa_path = find_wsaa_py()
    if not wsaa_path:
        print("ERROR: No se encontró pyafipws/wsaa.py en site-packages")
        sys.exit(1)
    
    success = patch_wsaa(wsaa_path)
    sys.exit(0 if success else 1)
