#!/usr/bin/env python3
"""
"""Parcha pysimplesoap para compatibilidad Python 3.

Parche 1 — write mode:
  Corrige el problema de write() que espera str pero recibe bytes en Python 3.
  Cambia open(..., "w") → open(..., "wb") para escritura de caché WSDL.

Parche 2 — Struct pickle safety:
  Struct hereda de dict. Al hacer pickle.load(), Python restaura primero los
  pares key-value del dict (llamando __setitem__) y DESPUÉS restaura __dict__
  del objeto. Esto significa que cuando __setitem__ se ejecuta durante el
  unpickling, self._Struct__keys todavía no existe → AttributeError.
  Se agrega un guard en __setitem__ e insert_setitem que inicializa __keys
  si aún no está presente, haciendo el unpickling seguro.

Parche 3 — hashlib.md5 Python 3:
  pysimplesoap/client.py usa hashlib.md5(url) donde url es str.
  Python 3 requiere bytes: hashlib.md5(url.encode('utf-8')).
"""
import os
import re
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

def find_client_py():
    """Encuentra el archivo client.py de pysimplesoap instalado en site-packages."""
    for path in site.getsitepackages() + [site.getusersitepackages()]:
        if not path:
            continue
        client_path = os.path.join(path, 'pysimplesoap', 'client.py')
        if os.path.exists(client_path):
            return client_path
    return None

def patch_client(path):
    """Aplica parche hashlib.md5 a pysimplesoap/client.py para Python 3."""
    print(f"Parcheando {path}...")

    with open(path, 'r', encoding='utf-8', errors='replace') as f:
        content = f.read()

    original = content

    # Parche 3: hashlib.md5(url) → hashlib.md5(url.encode('utf-8'))
    old = "hashlib.md5(url).hexdigest()"
    new = "hashlib.md5(url.encode('utf-8') if isinstance(url, str) else url).hexdigest()"
    if old in content:
        content = content.replace(old, new)
        print("  ✓ hashlib.md5(url) → encode utf-8 (Python 3 fix)")

    if content != original:
        with open(path, 'w', encoding='utf-8') as f:
            f.write(content)
        print("✓ client.py parcheado exitosamente")
        return True
    else:
        print("⚠ client.py: no se encontraron cambios necesarios")
        return False

def patch_helpers(path):
    """Aplica parches al archivo helpers.py."""
    print(f"Parcheando {path}...")

    with open(path, 'r', encoding='utf-8', errors='replace') as f:
        content = f.read()

    original = content
    modified_flags = []

    # ── Parche 1: write mode "w" → "wb" ──────────────────────────────────────
    for old, new in [(',"w")', ',"wb")'), (", 'w')", ", 'wb')")]:
        if old in content:
            content = content.replace(old, new)
            modified_flags.append(f"✓ Cambiado '{old}' -> '{new}' (write mode)")

    for old, new in [('"w"', '"wb"'), ("'w'", "'wb'")]:
        # Solo en contextos de open(...) con asignación (evitar falsos positivos)
        pattern = r'(open\([^)]+)' + re.escape(old) + r'(\))'
        replaced = re.sub(pattern, r'\g<1>' + new + r'\2', content)
        if replaced != content:
            content = replaced
            modified_flags.append(f"✓ Cambiado open(..., {old}) -> open(..., {new})")

    # ── Parche 2: Struct pickle safety ───────────────────────────────────────
    # Reemplaza __setitem__ para que sea seguro durante unpickling
    old_setitem = (
        "    def __setitem__(self, key, value):\n"
        "        if key not in self.__keys:\n"
        "            self.__keys.append(key)\n"
        "        dict.__setitem__(self, key, value)"
    )
    new_setitem = (
        "    def __setitem__(self, key, value):\n"
        "        # Guard para pickle safety: durante unpickling de subclases de dict,\n"
        "        # __setitem__ se invoca antes de que __dict__ sea restaurado.\n"
        "        if '_Struct__keys' not in self.__dict__:\n"
        "            self.__dict__['_Struct__keys'] = []\n"
        "        if key not in self.__keys:\n"
        "            self.__keys.append(key)\n"
        "        dict.__setitem__(self, key, value)"
    )
    if old_setitem in content:
        content = content.replace(old_setitem, new_setitem)
        modified_flags.append("✓ Struct.__setitem__: agregado guard para pickle safety")

    # También parchear insert_setitem si existe
    old_insert = (
        "        if key not in self.__keys:\n"
        "            self.__keys.insert(index, key)\n"
        "        dict.__setitem__(self, key, value)"
    )
    new_insert = (
        "        if '_Struct__keys' not in self.__dict__:\n"
        "            self.__dict__['_Struct__keys'] = []\n"
        "        if key not in self.__keys:\n"
        "            self.__keys.insert(index, key)\n"
        "        dict.__setitem__(self, key, value)"
    )
    if old_insert in content and new_insert not in content:
        content = content.replace(old_insert, new_insert)
        modified_flags.append("✓ Struct.insert_setitem: agregado guard para pickle safety")

    if content != original:
        with open(path, 'w', encoding='utf-8') as f:
            f.write(content)
        for msg in modified_flags:
            print(f"  {msg}")
        print(f"✓ Archivo parcheado exitosamente ({len(modified_flags)} parches)")
        return True
    else:
        print("⚠ No se encontraron cambios necesarios")
        return False

if __name__ == '__main__':
    ok = True

    helpers_path = find_helpers_py()
    if not helpers_path:
        print("ERROR: No se encontró pysimplesoap/helpers.py en site-packages")
        ok = False
    else:
        ok = patch_helpers(helpers_path) and ok

    client_path = find_client_py()
    if not client_path:
        print("ERROR: No se encontró pysimplesoap/client.py en site-packages")
        ok = False
    else:
        patch_client(client_path)

    sys.exit(0 if ok else 1)
