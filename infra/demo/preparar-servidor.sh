#!/usr/bin/env bash
# Pasitos · prepara el VPS de la demo (Ubuntu 24.04). Se puede correr de nuevo sin romper nada.
# Uso, en el servidor: sudo STELLAR_WASM_HASH=… STELLAR_ADMIN_DIRECCION=… bash /srv/pasitos/preparar-servidor.sh
# (opcional: CORREO_REMITENTE y CORREO_SOPORTE, con el dominio real)
#
# Seguridad mínima (la completa llega con T-002):
#   - ufw: SSH abierto; 80 y 443 solo desde los rangos de Cloudflare.
#   - Secretos nuevos y aleatorios en /srv/pasitos/.env (solo root y el grupo docker lo leen).
set -euo pipefail

DIR=/srv/pasitos
cd "$DIR"

echo '== Docker'
if ! command -v docker >/dev/null; then
  apt-get update -q
  apt-get install -y -q docker.io docker-compose-v2
  systemctl enable --now docker
fi
usermod -aG docker ubuntu || true

echo '== Rangos de Cloudflare'
V4=$(curl -fsS https://www.cloudflare.com/ips-v4)
V6=$(curl -fsS https://www.cloudflare.com/ips-v6)
RANGOS=$(echo $V4 $V6)

echo '== Firewall'
apt-get install -y -q ufw >/dev/null
ufw --force reset >/dev/null
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
for rango in $V4 $V6; do
  ufw allow proto tcp from "$rango" to any port 80,443 >/dev/null
done
ufw --force enable

echo '== Carpetas'
mkdir -p datos/postgres datos/archivos datos/caddy secretos
# El API y el trabajador corren como el usuario `node` (uid 1000) dentro del contenedor.
chown -R 1000:1000 datos/archivos

echo '== Secretos'
aleatorio() { openssl rand -base64 48 | tr -dc 'A-Za-z0-9' | head -c 32; }
if [ ! -f .env ]; then
  MAILPIT_CLAVE=$(aleatorio)
  cat > .env <<EOF
POSTGRES_PASSWORD=$(aleatorio)
PASITOS_OWNER_PASSWORD=$(aleatorio)
PASITOS_APP_PASSWORD=$(aleatorio)
PASITOS_SISTEMA_PASSWORD=$(aleatorio)
PASITOS_COPIAS_PASSWORD=$(aleatorio)
LLAVE_CIFRADO_DATOS=$(openssl rand -base64 32)
LLAVES_CIFRADO_ANTERIORES=
PUBLIC_URL=https://pasitos.com.bo
WEBAUTHN_RP_ID=pasitos.com.bo
WEBAUTHN_RP_NAME=Pasitos
LOG_LEVEL=info
STELLAR_RED=testnet
STELLAR_RPC_URL=https://soroban-testnet.stellar.org
STELLAR_WASM_HASH=${STELLAR_WASM_HASH:?falta STELLAR_WASM_HASH}
STELLAR_ADMIN_DIRECCION=${STELLAR_ADMIN_DIRECCION:?falta STELLAR_ADMIN_DIRECCION}
CORREO_REMITENTE=${CORREO_REMITENTE:-Pasitos <hola@example.com>}
CORREO_SOPORTE=${CORREO_SOPORTE:-soporte@example.com}
MAILPIT_UI_AUTH=demo:${MAILPIT_CLAVE}
CLOUDFLARE_RANGOS=${RANGOS}
EOF
  echo "Buzón de la demo: usuario demo, contraseña ${MAILPIT_CLAVE} (también en $DIR/.env)"
else
  # Los rangos de Cloudflare cambian poco, pero se refrescan en cada corrida.
  sed -i "s|^CLOUDFLARE_RANGOS=.*|CLOUDFLARE_RANGOS=${RANGOS}|" .env
fi
chown root:docker .env secretos
chmod 640 .env
chmod 750 secretos
[ -f secretos/stellar-operador.key ] && chown 1000:1000 secretos/stellar-operador.key && chmod 600 secretos/stellar-operador.key

echo 'Listo. Siguiente: docker compose up -d --build'
