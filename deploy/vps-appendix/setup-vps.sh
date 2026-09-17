#!/usr/bin/env bash
# ============================================================
# Setup inicial de un VPS Ubuntu 22.04/24.04 en Hostinger para
# Vida Solidaria — Plataforma de Gestión.
#
# Se corre UNA sola vez, a mano, la primera vez que se prepara el servidor
# (no es parte del pipeline de CI/CD — eso lo hace .github/workflows/deploy.yml
# después de que el servidor ya está listo).
#
# Uso:
#   scp deploy/setup-vps.sh root@TU_IP:/root/
#   ssh root@TU_IP
#   bash setup-vps.sh
# ============================================================
set -euo pipefail

echo "== 1/7: Paquetes base =="
apt-get update -y
apt-get install -y curl git ufw nginx software-properties-common ca-certificates gnupg

echo "== 2/7: Node.js 20 LTS =="
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs
npm install -g pnpm@9.15.0 pm2

echo "== 3/7: PostgreSQL 16 + PostGIS =="
apt-get install -y postgresql postgresql-contrib postgresql-16-postgis-3

echo "== 4/7: Redis =="
apt-get install -y redis-server
systemctl enable --now redis-server

echo "== 5/7: Base de datos y usuario de la app =="
read -rp "Nombre de la base de datos [vida_solidaria]: " DB_NAME
DB_NAME=${DB_NAME:-vida_solidaria}
read -rp "Usuario de Postgres para la app [vida_solidaria]: " DB_USER
DB_USER=${DB_USER:-vida_solidaria}
read -rsp "Contraseña para ese usuario de Postgres: " DB_PASS
echo

sudo -u postgres psql -c "CREATE ROLE ${DB_USER} LOGIN PASSWORD '${DB_PASS}';" || true
sudo -u postgres psql -c "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};" || true
sudo -u postgres psql -d "${DB_NAME}" -c "CREATE EXTENSION IF NOT EXISTS postgis;"

echo "== 6/7: Firewall (UFW) =="
ufw allow OpenSSH
ufw allow "Nginx Full"
ufw --force enable

echo "== 7/7: Certbot (TLS) =="
apt-get install -y certbot python3-certbot-nginx

cat <<EOF

✅ Servidor listo.

Datos para tu apps/api/.env de producción:
  DATABASE_URL="postgresql://${DB_USER}:${DB_PASS}@localhost:5432/${DB_NAME}?schema=public"
  REDIS_URL="redis://localhost:6379"

Próximos pasos (manuales, una sola vez):
  1. Clonar el repo en /var/www/vida-solidaria (o donde prefieras):
       git clone <URL_DE_TU_REPO_GITHUB> /var/www/vida-solidaria
  2. Copiar deploy/nginx.conf.example a /etc/nginx/sites-available/vida-solidaria,
     reemplazar TU_SUBDOMINIO y activarlo:
       ln -s /etc/nginx/sites-available/vida-solidaria /etc/nginx/sites-enabled/
       nginx -t && systemctl reload nginx
  3. Emitir el certificado TLS:
       certbot --nginx -d TU_SUBDOMINIO
  4. Seguir "Primer deploy manual" en DEPLOY.md.

A partir de ahí, los siguientes deploys los hace GitHub Actions solo con
cada push a main (ver .github/workflows/deploy.yml).
EOF
