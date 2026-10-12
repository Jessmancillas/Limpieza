#!/usr/bin/env bash
# Genera una e.firma FICTICIA para las pruebas (NO es del SAT ni sirve ante VUCEM):
#   - efirma-prueba.cer          certificado autofirmado RSA-2048 en DER, con
#                                x500UniqueIdentifier "RFC / CURP" como los del SAT y
#                                número de serie en "ASCII hex" (igual que el SAT).
#   - efirma-prueba.key          llave PKCS#8 cifrada en DER (PBES2 + DES-EDE3-CBC, PRF por
#                                omisión de OpenSSL 3: hmacWithSHA256).
#   - efirma-prueba-sha1prf.key  la misma llave con PRF hmacWithSHA1 (como las .key del SAT).
#   - documento-prueba.pdf       PDF mínimo para la cadena de digitalización.
# Contraseña de la llave: 12345678a
set -euo pipefail
cd "$(dirname "$0")"

PASSWORD="12345678a"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# Serie "30001000000500003416" codificada como los bytes ASCII de cada dígito (formato SAT).
SERIE_HEX="0x3330303031303030303030353030303033343136"

openssl req -x509 -newkey rsa:2048 -nodes -sha256 -days 3650 \
  -keyout "$TMP/llave.pem" -out "$TMP/cert.pem" \
  -set_serial "$SERIE_HEX" \
  -subj "/CN=EMPRESA DEMO DE PRUEBA SA DE CV/name=EMPRESA DEMO DE PRUEBA SA DE CV/O=EMPRESA DEMO DE PRUEBA SA DE CV/C=MX/emailAddress=pruebas@example.com/x500UniqueIdentifier=DME200101AB1 \/ XAXX010101HDFXXX01/serialNumber= \/ XAXX010101HDFRRR01/OU=PRUEBAS"

openssl x509 -in "$TMP/cert.pem" -outform DER -out efirma-prueba.cer

openssl pkcs8 -topk8 -v2 des3 -outform DER \
  -in "$TMP/llave.pem" -out efirma-prueba.key -passout "pass:$PASSWORD"

openssl pkcs8 -topk8 -v2 des3 -v2prf hmacWithSHA1 -outform DER \
  -in "$TMP/llave.pem" -out efirma-prueba-sha1prf.key -passout "pass:$PASSWORD"

# PDF mínimo válido (una página en blanco) con desplazamientos xref calculados.
python3 - <<'PY'
objs = [
    b"<< /Type /Catalog /Pages 2 0 R >>",
    b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>",
]
out = bytearray(b"%PDF-1.4\n")
offsets = []
for i, o in enumerate(objs, start=1):
    offsets.append(len(out))
    out += f"{i} 0 obj\n".encode() + o + b"\nendobj\n"
xref = len(out)
out += f"xref\n0 {len(objs) + 1}\n".encode()
out += b"0000000000 65535 f \n"
for off in offsets:
    out += f"{off:010d} 00000 n \n".encode()
out += f"trailer\n<< /Size {len(objs) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode()
open("documento-prueba.pdf", "wb").write(out)
PY

echo "Listo:"
openssl x509 -inform DER -in efirma-prueba.cer -noout -subject -serial -dates
sha1sum documento-prueba.pdf
