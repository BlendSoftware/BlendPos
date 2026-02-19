"""
Script de debug para verificar la firma CMS con openssl
"""
import subprocess
import base64
from datetime import datetime, timedelta

# Generar un TRA simple para testing
def create_test_tra():
    now = datetime.utcnow()
    gen_time = now.strftime('%Y-%m-%dT%H:%M:%S')
    exp_time = (now + timedelta(hours=12)).strftime('%Y-%m-%dT%H:%M:%S')
    
    tra = f"""<?xml version="1.0" encoding="UTF-8"?>
<loginTicketRequest version="1.0">
<header>
<uniqueId>{int(now.timestamp())}</uniqueId>
<generationTime>{gen_time}</generationTime>
<expirationTime>{exp_time}</expirationTime>
</header>
<service>wsfe</service>
</loginTicketRequest>"""
    return tra

if __name__ == '__main__':
    print("=== Test de firma CMS con openssl ===\n")
    
    cert_path = "/certs/afip.crt"
    key_path = "/certs/afip.key"
    
    tra = create_test_tra()
    print("TRA generado:")
    print(tra)
    print("\n" + "="*50 + "\n")
    
    # Probar comando openssl con different flags
    print("Probando: openssl smime -sign -outform DER -nodetach -binary")
    try:
        result = subprocess.run(
            ["openssl", "smime", "-sign",
             "-signer", cert_path,
             "-inkey", key_path,
             "-outform", "DER",
             "-nodetach",
             "-binary"],
            input=tra.encode('utf-8'),
            capture_output=True
        )
        
        if result.returncode != 0:
            print(f"ERROR: {result.stderr.decode('utf-8')}")
        else:
            cms_der = result.stdout
            cms_b64 = base64.b64encode(cms_der).decode('ascii')
            print(f"✓ CMS generado correctamente")
            print(f"  - Tamaño DER: {len(cms_der)} bytes")
            print(f"  - Tamaño B64: {len(cms_b64)} chars")
            print(f"  - Primeros 100 chars: {cms_b64[:100]}")
            print(f"  - Últimos 50 chars: ...{cms_b64[-50:]}")
            
            # Verificar que no haya caracteres raros
            if all(c in 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=' for c in cms_b64):
                print("  - ✓ Base64 válido (solo caracteres permitidos)")
            else:
                print("  - ⚠ Base64 contiene caracteres no permitidos")
            
            # Intentar decodificar de vuelta
            try:
                base64.b64decode(cms_b64)
                print("  - ✓ Base64 decodifica correctamente")
            except Exception as e:
                print(f"  - ✗ Error al decodificar base64: {e}")
                
    except Exception as e:
        print(f"EXCEPCIÓN: {e}")
    
    print("\n" + "="*50 + "\n")
    
    # Comparar con formato PEM
    print("Comparando con formato PEM (sin -outform DER):")
    try:
        result = subprocess.run(
            ["openssl", "smime", "-sign",
             "-signer", cert_path,
             "-inkey", key_path,
             "-nodetach",
             "-binary"],
            input=tra.encode('utf-8'),
            capture_output=True,
            text=True
        )
        
        if result.returncode == 0:
            print("✓ PEM format:")
            print(result.stdout[:500])
    except Exception as e:
        print(f"Error: {e}")
