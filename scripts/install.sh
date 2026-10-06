#!/usr/bin/env bash
# Установка IT Help Desk с нуля на Debian/Ubuntu.
# Не запускает тестовый seed и не создаёт energo\admin.
#
# Интерактивно (скрипт задаст адрес и LDAP, секреты сгенерирует сам):
#   curl -fsSL -o /tmp/install-helpdesk.sh \
#     https://raw.githubusercontent.com/X988/it-helpdesk/helpdesk-sla-rbac/scripts/install.sh
#   sudo bash /tmp/install-helpdesk.sh
#
# Без вопросов:
#   sudo HELPDESK_NONINTERACTIVE=1 \
#     HELPDESK_PUBLIC_HOST=192.168.0.184 \
#     LDAP_URL=ldaps://SERV1.energo.local:636 \
#     bash scripts/install.sh
#
# Повторный запуск не затирает /etc/it-helpdesk.env и сертификат nginx.
set -euo pipefail

REPO_URL="${HELPDESK_REPO_URL:-https://github.com/X988/it-helpdesk.git}"
BRANCH="${HELPDESK_BRANCH:-helpdesk-sla-rbac}"
APP_USER="${HELPDESK_USER:-helpdesk}"
APP_HOME="${HELPDESK_HOME:-/opt/it-helpdesk}"
ENV_FILE="${HELPDESK_ENV_FILE:-/etc/it-helpdesk.env}"
APP_PORT="${HELPDESK_APP_PORT:-8090}"
HTTPS_PORT="${HELPDESK_HTTPS_PORT:-}"
ORG_NAME="${HELPDESK_ORG_NAME:-КП}"

log() { printf '\n==> %s\n' "$*"; }
die() { printf 'Ошибка: %s\n' "$*" >&2; exit 1; }
trap 'printf "Сбой на строке %s\n" "$LINENO" >&2' ERR

[[ "$(id -u)" -eq 0 ]] || die "Запустите от root: sudo bash $0"
[[ -f /etc/debian_version ]] || die "Нужен Debian или Ubuntu"

ask() {
  local __var="$1" __prompt="$2" __default="${3:-}"
  local __current="${!__var:-}"
  if [[ -n "$__current" ]]; then
    return 0
  fi
  if [[ "${HELPDESK_NONINTERACTIVE:-}" == "1" || ! -r /dev/tty ]]; then
    printf -v "$__var" '%s' "$__default"
    return 0
  fi
  local __answer=""
  if [[ -n "$__default" ]]; then
    read -r -p "$__prompt [$__default]: " __answer </dev/tty || true
    __answer="${__answer:-$__default}"
  else
    read -r -p "$__prompt: " __answer </dev/tty || true
  fi
  printf -v "$__var" '%s' "$__answer"
}

confirm() {
  local __prompt="$1" __default="${2:-no}"
  if [[ "${HELPDESK_NONINTERACTIVE:-}" == "1" || ! -r /dev/tty ]]; then
    [[ "$__default" == "yes" ]]
    return
  fi
  local __hint="y/N"
  [[ "$__default" == "yes" ]] && __hint="Y/n"
  local __answer=""
  read -r -p "$__prompt [$__hint]: " __answer </dev/tty || true
  __answer="${__answer:-$__default}"
  [[ "$__answer" =~ ^([yY]|yes|да|Да)$ ]]
}

rand() {
  local n="${1:-32}" out="" chunk
  while [[ ${#out} -lt $n ]]; do
    chunk="$(openssl rand -base64 48 | tr -dc 'A-Za-z0-9')"
    out+="$chunk"
  done
  printf '%s\n' "${out:0:n}"
}

SCRIPT_SOURCE="${BASH_SOURCE[0]:-}"
if [[ "$SCRIPT_SOURCE" == /dev/fd/* || "$SCRIPT_SOURCE" == "-" || -z "$SCRIPT_SOURCE" ]]; then
  SOURCE_DIR=""
else
  SCRIPT_DIR="$(cd "$(dirname "$SCRIPT_SOURCE")" && pwd)"
  if [[ -f "$SCRIPT_DIR/../package.json" && -f "$SCRIPT_DIR/../prisma/schema.prisma" ]]; then
    SOURCE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
  else
    SOURCE_DIR=""
  fi
fi
APP_DIR="${HELPDESK_APP_DIR:-${SOURCE_DIR:-$APP_HOME/app}}"

DEFAULT_HOST="$(hostname -I 2>/dev/null | awk '{print $1}')"
DEFAULT_HOST="${DEFAULT_HOST:-127.0.0.1}"
ask HELPDESK_PUBLIC_HOST "Адрес сервера, как его открывают сотрудники (IP или DNS)" "$DEFAULT_HOST"
ask HTTPS_PORT "Внешний HTTPS-порт nginx" "8443"
ask LDAP_URL "LDAP URL (пустая строка или «-» — без Active Directory)" "${LDAP_URL:-ldaps://SERV1.energo.local:636}"
if [[ "$LDAP_URL" == "-" ]]; then
  LDAP_URL=""
fi
if [[ -n "$LDAP_URL" ]]; then
  ask LDAP_BASE_DN "LDAP base DN" "${LDAP_BASE_DN:-DC=energo,DC=local}"
  ask LDAP_DOMAIN "Короткое имя домена (energo\\ivanov)" "${LDAP_DOMAIN:-energo}"
  ask LDAP_UPN_SUFFIX "UPN-суффикс" "${LDAP_UPN_SUFFIX:-energo.local}"
  ask LDAP_EMAIL_DOMAIN "Домен почты, если в AD нет mail" "${LDAP_EMAIL_DOMAIN:-$LDAP_UPN_SUFFIX}"
else
  LDAP_BASE_DN=""
  LDAP_DOMAIN="${LDAP_DOMAIN:-energo}"
  LDAP_UPN_SUFFIX=""
  LDAP_EMAIL_DOMAIN=""
fi

ENABLE_UFW="${HELPDESK_ENABLE_UFW:-}"
if [[ -z "$ENABLE_UFW" ]]; then
  if confirm "Открыть в ufw только SSH и порт ${HTTPS_PORT}? Сначала добавится правило OpenSSH." "no"; then
    ENABLE_UFW=1
  else
    ENABLE_UFW=0
  fi
fi

log "Пакеты"
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y git curl ca-certificates gnupg nginx postgresql postgresql-contrib openssl ufw

if ! command -v node >/dev/null 2>&1 || ! node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 22 ? 0 : 1)'; then
  log "Node.js 22"
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
node -v | grep -q '^v2[2-9]\|^v[3-9]' || die "Нужен Node.js 22 или новее, сейчас $(node -v)"

if ! id "$APP_USER" >/dev/null 2>&1; then
  log "Пользователь $APP_USER"
  useradd --system --create-home --home-dir "$APP_HOME" --shell /bin/bash "$APP_USER"
fi
APP_GROUP="$(id -gn "$APP_USER")"
install -d -o "$APP_USER" -g "$APP_GROUP" -m 0755 "$APP_HOME"
install -d -o "$APP_USER" -g "$APP_GROUP" -m 0755 "$(dirname "$APP_DIR")"
if [[ -f "$APP_DIR/package.json" ]]; then
  chown -R "$APP_USER:$APP_GROUP" "$APP_DIR"
fi

if [[ ! -f "$APP_DIR/package.json" ]]; then
  log "Клонирование $REPO_URL ($BRANCH)"
  sudo -u "$APP_USER" git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
elif [[ -d "$APP_DIR/.git" ]]; then
  if [[ -n "$(sudo -u "$APP_USER" git -C "$APP_DIR" status --porcelain)" ]]; then
    log "В $APP_DIR есть локальные правки, git pull пропущен"
  else
    log "Обновление $APP_DIR ($BRANCH)"
    sudo -u "$APP_USER" git -C "$APP_DIR" fetch origin
    sudo -u "$APP_USER" git -C "$APP_DIR" checkout "$BRANCH"
    sudo -u "$APP_USER" git -C "$APP_DIR" pull --ff-only origin "$BRANCH"
  fi
fi
[[ -f "$APP_DIR/package.json" ]] || die "В $APP_DIR нет package.json"

if [[ ! -f "$ENV_FILE" ]]; then
  log "Секреты и $ENV_FILE"
  DB_PASSWORD="$(rand 32)"
  AUTH_SECRET="$(rand 48)"
  CRON_SECRET="$(rand 48)"
  APP_URL="https://${HELPDESK_PUBLIC_HOST}:${HTTPS_PORT}"
  umask 077
  cat >"$ENV_FILE" <<EOF
NODE_ENV=production
PORT=${APP_PORT}
DATABASE_URL=postgresql://${APP_USER}:${DB_PASSWORD}@127.0.0.1:5432/helpdesk
AUTH_SECRET=${AUTH_SECRET}
APP_URL=${APP_URL}
CRON_SECRET=${CRON_SECRET}
STORAGE_BACKEND=local
LOCAL_STORAGE_PATH=${APP_DIR}/data/uploads

LDAP_URL=${LDAP_URL}
LDAP_BASE_DN=${LDAP_BASE_DN}
LDAP_DOMAIN=${LDAP_DOMAIN}
LDAP_UPN_SUFFIX=${LDAP_UPN_SUFFIX}
LDAP_EMAIL_DOMAIN=${LDAP_EMAIL_DOMAIN}
LDAP_SEARCH_FILTER="(sAMAccountName={{username}})"
LDAP_BIND_DN=
LDAP_BIND_PASSWORD=
LDAP_TLS_REJECT_UNAUTHORIZED=true

SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM=

TELEGRAM_BOT_TOKEN=
TELEGRAM_WEBHOOK_SECRET=
TELEGRAM_BOT_USERNAME=
EOF
  unset DB_PASSWORD AUTH_SECRET CRON_SECRET
else
  log "Оставляю существующий $ENV_FILE"
fi
chown "root:$APP_GROUP" "$ENV_FILE"
chmod 640 "$ENV_FILE"

# shellcheck disable=SC1090
set -a
# Файл создан этим скриптом: значения без пробелов и кавычек.
source "$ENV_FILE"
set +a
[[ "${#AUTH_SECRET}" -ge 32 ]] || die "AUTH_SECRET короче 32 символов"
DB_PASSWORD="${DATABASE_URL#postgresql://${APP_USER}:}"
DB_PASSWORD="${DB_PASSWORD%%@*}"
[[ -n "$DB_PASSWORD" ]] || die "Не удалось прочитать пароль из DATABASE_URL"
if [[ "$DB_PASSWORD" == *"'"* || "$DB_PASSWORD" == *'$'* ]]; then
  die "Пароль базы не должен содержать кавычку или знак доллара"
fi

log "PostgreSQL"
sudo -u postgres psql -v ON_ERROR_STOP=1 -v app_user="$APP_USER" -v db_pass="$DB_PASSWORD" <<'SQL'
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'app_user', :'db_pass')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'app_user')
\gexec
SELECT format('ALTER ROLE %I WITH LOGIN PASSWORD %L', :'app_user', :'db_pass')
WHERE EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'app_user')
\gexec
SELECT format('CREATE DATABASE helpdesk OWNER %I', :'app_user')
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'helpdesk')
\gexec
SQL
unset DB_PASSWORD

log "Сборка"
install -d -o "$APP_USER" -g "$APP_GROUP" -m 0750 "${LOCAL_STORAGE_PATH:-$APP_DIR/data/uploads}"
chown -R "$APP_USER:$APP_GROUP" "$APP_DIR"
sudo -u "$APP_USER" bash -c "
  set -euo pipefail
  set -a
  source '$ENV_FILE'
  set +a
  cd '$APP_DIR'
  npm ci --include=dev --no-audit --no-fund
  npx prisma migrate deploy
  npm run build
"

log "Отделы, категории и организация"
ORG_DOMAIN="${LDAP_DOMAIN:-energo}"
sudo -u postgres psql -d helpdesk -v ON_ERROR_STOP=1 \
  -v org_name="$ORG_NAME" \
  -v org_domain="$ORG_DOMAIN" <<'SQL'
INSERT INTO "Department" (id, name, source, "isActive", "createdAt", "updatedAt")
SELECT gen_random_uuid(), n, 'MANUAL', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM unnest(ARRAY['IT-поддержка', 'Бухгалтерия', 'Офис']) AS n
WHERE NOT EXISTS (SELECT 1 FROM "Department" d WHERE d.name = n);

INSERT INTO "Category" (id, name, "isActive", "isHidden", "sortOrder", "ownerDepartmentId", "createdAt", "updatedAt")
SELECT gen_random_uuid(), n.name, true, false, n.ord, d.id, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (VALUES
  (0, 'Сеть и VPN'),
  (1, 'Рабочие места'),
  (2, 'Программное обеспечение'),
  (3, 'Доступы и учётные записи'),
  (4, 'Почта'),
  (5, 'Оргтехника'),
  (6, 'Другое')
) AS n(ord, name)
JOIN "Department" d ON d.name = 'IT-поддержка'
ON CONFLICT (name) DO NOTHING;

UPDATE "Category" c
SET "ownerDepartmentId" = d.id
FROM "Department" d
WHERE d.name = 'IT-поддержка'
  AND c."ownerDepartmentId" IS NULL
  AND c.name IN (
    'Сеть и VPN',
    'Рабочие места',
    'Программное обеспечение',
    'Доступы и учётные записи',
    'Почта',
    'Оргтехника',
    'Другое'
  );

INSERT INTO "Organization" (id, name, domain, "isActive", "createdAt", "updatedAt")
SELECT gen_random_uuid(), :'org_name', :'org_domain', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1 FROM "Organization" o WHERE o.name = :'org_name' AND o.domain = :'org_domain'
);
SQL

log "systemd"
NPM_BIN="$(command -v npm)"
cat >/etc/systemd/system/it-helpdesk.service <<EOF
[Unit]
Description=IT Help Desk (Next.js)
After=network-online.target postgresql.service
Wants=network-online.target

[Service]
Type=simple
User=${APP_USER}
Group=${APP_GROUP}
WorkingDirectory=${APP_DIR}
EnvironmentFile=${ENV_FILE}
ExecStart=${NPM_BIN} start -- --hostname 127.0.0.1 --port ${APP_PORT}
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now it-helpdesk
systemctl restart it-helpdesk

log "nginx"
install -d -m 0755 /etc/nginx/ssl
if [[ ! -f /etc/nginx/ssl/helpdesk.key || ! -f /etc/nginx/ssl/helpdesk.crt ]]; then
  if [[ "$HELPDESK_PUBLIC_HOST" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]]; then
    CERT_SAN="IP:${HELPDESK_PUBLIC_HOST}"
  else
    CERT_SAN="DNS:${HELPDESK_PUBLIC_HOST}"
  fi
  openssl req -x509 -nodes -newkey rsa:2048 -days 825 \
    -keyout /etc/nginx/ssl/helpdesk.key -out /etc/nginx/ssl/helpdesk.crt \
    -subj "/CN=${HELPDESK_PUBLIC_HOST}" \
    -addext "subjectAltName=${CERT_SAN}"
  chmod 600 /etc/nginx/ssl/helpdesk.key
fi

NGINX_MAJOR="$(nginx -v 2>&1 | sed -n 's|.*nginx/\([0-9]*\).*|\1|p')"
NGINX_MINOR="$(nginx -v 2>&1 | sed -n 's|.*nginx/[0-9]*\.\([0-9]*\).*|\1|p')"
NGINX_MAJOR="${NGINX_MAJOR:-1}"
NGINX_MINOR="${NGINX_MINOR:-25}"
if [[ "$NGINX_MAJOR" -gt 1 || ( "$NGINX_MAJOR" -eq 1 && "$NGINX_MINOR" -ge 25 ) ]]; then
  NGINX_LISTEN="listen ${HTTPS_PORT} ssl;"
  NGINX_HTTP2="    http2 on;"
else
  NGINX_LISTEN="listen ${HTTPS_PORT} ssl http2;"
  NGINX_HTTP2=""
fi
cat >/etc/nginx/sites-available/it-helpdesk <<EOF
server {
    ${NGINX_LISTEN}
${NGINX_HTTP2}
    server_name ${HELPDESK_PUBLIC_HOST};

    ssl_certificate     /etc/nginx/ssl/helpdesk.crt;
    ssl_certificate_key /etc/nginx/ssl/helpdesk.key;
    ssl_protocols TLSv1.2 TLSv1.3;

    client_max_body_size 60m;

    location / {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host              \$host:\$server_port;
        proxy_set_header X-Real-IP         \$remote_addr;
        proxy_set_header X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header Upgrade           \$http_upgrade;
        proxy_set_header Connection        "upgrade";
        proxy_read_timeout 120s;
    }
}
EOF
ln -sfn /etc/nginx/sites-available/it-helpdesk /etc/nginx/sites-enabled/it-helpdesk
nginx -t
systemctl reload nginx

if [[ "$ENABLE_UFW" == "1" ]]; then
  log "ufw"
  ufw allow OpenSSH
  ufw allow "${HTTPS_PORT}/tcp"
  ufw --force enable
fi

install -d -o postgres -g postgres -m 0750 /var/backups/it-helpdesk
cat >/etc/cron.d/it-helpdesk-backup <<'EOF'
30 2 * * * postgres pg_dump -Fc helpdesk > /var/backups/it-helpdesk/helpdesk-$(date +\%F).dump && find /var/backups/it-helpdesk -name 'helpdesk-*.dump' -mtime +30 -delete
EOF
chmod 644 /etc/cron.d/it-helpdesk-backup

log "Проверка"
ok=""
for _ in $(seq 1 30); do
  if curl -sf "http://127.0.0.1:${APP_PORT}/api/health"; then
    echo
    ok=1
    break
  fi
  sleep 1
done
[[ -n "$ok" ]] || die "Служба не ответила на /api/health. Смотрите: journalctl -u it-helpdesk -n 80"

PUBLIC_URL="${APP_URL:-https://${HELPDESK_PUBLIC_HOST}:${HTTPS_PORT}}"
cat <<EOF

Готово.
  Адрес:     ${PUBLIC_URL}
  Проверка:  curl -sk ${PUBLIC_URL}/api/health
  Настройки: ${ENV_FILE}
  Логи:      journalctl -u it-helpdesk -f

Вложения пишутся на диск (${LOCAL_STORAGE_PATH:-$APP_DIR/data/uploads}), S3 не нужен.
Почта без SMTP_HOST только попадает в журнал и не ломает заявку.
SEED_PASSWORD не задан специально: тестовые energo\\admin / tech / user не создаются.

Первый вход — доменный пароль. Роль будет USER.
Администратора назначьте после первого входа, как в docs/adminy.md, затем войдите снова.
Если сертификат AD недоверенный, положите CA в NODE_EXTRA_CA_CERTS или временно поставьте LDAP_TLS_REJECT_UNAUTHORIZED=false и перезапустите службу.
EOF
