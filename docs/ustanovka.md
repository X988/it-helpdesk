# IT Help Desk — установка и настройка с нуля на Linux-сервере

> Для кого: администратор, который ставит систему на новый сервер.
> Пример во всех командах: сервер **192.168.0.184**, домен Active Directory **energo** (полное имя `energo.local`), контроллер домена **SERV1.energo.local**.
> Замените эти значения на свои, если сервер другой.

## 0. Что получится в итоге

```
Браузер сотрудника ──HTTPS:8443──▶ nginx ──HTTP:8090 (только внутри сервера)──▶ приложение IT Help Desk (Node.js)
                                                                                  │
                                                                                  ├──▶ PostgreSQL (база заявок)
                                                                                  ├──▶ SERV1.energo.local:636 (проверка доменного пароля, LDAPS)
                                                                                  └──▶ S3-хранилище (файлы-вложения, по желанию)
```

Короткий словарь:

| Слово | Что это простыми словами |
|---|---|
| **Node.js** | Программа, которая запускает само приложение (оно написано на JavaScript/TypeScript). Нужна версия 22 или новее. |
| **PostgreSQL (Postgres)** | База данных. Хранит пользователей, заявки, переписку, историю. |
| **Prisma** | Инструмент внутри проекта, который создаёт таблицы в базе («миграции»). |
| **.env / env-файл** | Текстовый файл с настройками и паролями (адрес базы, секрет, адрес AD). В репозиторий не попадает. |
| **LDAP / LDAPS** | Способ спросить у Active Directory «верный ли пароль у energo\ivanov». LDAPS — то же самое, но зашифровано (порт 636). |
| **nginx** | Веб-сервер «на входе». Принимает HTTPS-подключения на порту 8443 и передаёт их приложению. |
| **systemd / служба** | Механизм Linux, который запускает приложение автоматически при старте сервера и перезапускает при сбое. |
| **firewall (ufw)** | Сетевой фильтр: какие порты сервера доступны из сети. |

Как сделано на 192.168.0.184 (для справки):

| Параметр | Значение |
|---|---|
| Порт приложения | `8090` (слушает только внутри сервера) |
| Внешний адрес | `https://192.168.0.184:8443` (nginx) |
| Служба | `it-helpdesk.service` |
| Файл настроек | `/etc/it-helpdesk.env` |
| Папка кода | `/home/toor/it-helpdesk` (пользователь `toor`, Node 22 через nvm) |
| AD | `ldaps://SERV1.energo.local:636`, домен `energo` |

В этой инструкции для нового сервера используется более «правильная» схема: отдельный системный пользователь `helpdesk` и папка `/opt/it-helpdesk`. Если хотите повторить 184 один в один — просто подставьте `toor` и `/home/toor/it-helpdesk`.

---

## 1. Требования

- Ubuntu 22.04/24.04 или Debian 12 (команды ниже для них).
- 2 ядра CPU, 2–4 ГБ RAM, 10+ ГБ диска.
- Сервер видит контроллер домена: `SERV1.energo.local` должен резолвиться (DNS) и быть доступен по порту 636.
- Доступ в интернет на время установки (скачать Node.js и npm-пакеты, код с GitHub).
- Права `sudo`.

Проверка связи с AD (до установки!):

```bash
getent hosts SERV1.energo.local          # должен показать IP контроллера
nc -vz SERV1.energo.local 636            # "succeeded" / "open" = порт доступен
```

Если имя не находится — пропишите DNS-сервер домена в настройках сети сервера или добавьте строку в `/etc/hosts`, например `192.168.0.10  SERV1.energo.local SERV1` (IP — ваш).

## 2. Установка системных пакетов

```bash
sudo apt update
sudo apt install -y git curl ca-certificates gnupg nginx postgresql postgresql-contrib ufw netcat-openbsd openssl
```

### Node.js 22

Вариант А (рекомендуется для сервера — ставится для всей системы):

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node -v    # должно быть v22.x
npm -v
```

Вариант Б (как на 184) — через nvm в домашней папке пользователя. Тогда в службе systemd нужно указывать полный путь к node, например `/home/toor/.nvm/versions/node/v22.x.x/bin`.

## 3. Пользователь и код

```bash
sudo useradd --system --create-home --home-dir /opt/it-helpdesk --shell /bin/bash helpdesk
sudo -u helpdesk git clone https://github.com/X988/it-helpdesk.git /opt/it-helpdesk/app
```

Дальше «папка приложения» = `/opt/it-helpdesk/app`.

> Репозиторий может быть приватным. Тогда для `git clone` нужен токен GitHub или deploy key — не храните их в коде.

## 4. База данных PostgreSQL

Придумайте надёжный пароль для базы (можно сгенерировать: `openssl rand -base64 24 | tr -d '/+='`).

```bash
sudo -u postgres psql <<'SQL'
CREATE USER helpdesk WITH PASSWORD 'ВСТАВЬТЕ_ПАРОЛЬ_БД';
CREATE DATABASE helpdesk OWNER helpdesk;
SQL
```

Проверка:

```bash
psql "postgresql://helpdesk:ВСТАВЬТЕ_ПАРОЛЬ_БД@127.0.0.1:5432/helpdesk" -c 'select 1'
```

Postgres по умолчанию слушает только `127.0.0.1` — так и оставьте, снаружи база не нужна.

## 5. Файл настроек `/etc/it-helpdesk.env`

Файл лежит вне папки с кодом, чтобы `git pull` его не трогал, и доступен только root и службе.

Сгенерируйте секрет для сессий (минимум 32 символа):

```bash
openssl rand -base64 48
```

Создайте файл:

```bash
sudo nano /etc/it-helpdesk.env
```

Содержимое (пример для energo):

```ini
# ---- Основное ----
NODE_ENV=production
PORT=8090
DATABASE_URL=postgresql://helpdesk:ВСТАВЬТЕ_ПАРОЛЬ_БД@127.0.0.1:5432/helpdesk
AUTH_SECRET=ВСТАВЬТЕ_РЕЗУЛЬТАТ_openssl_rand
# Адрес, по которому сотрудники открывают систему. Если начинается с https:// —
# cookie входа помечается как Secure (работает только по HTTPS).
APP_URL=https://192.168.0.184:8443

# ---- Active Directory (домен energo) ----
LDAP_URL=ldaps://SERV1.energo.local:636
LDAP_BASE_DN=DC=energo,DC=local
LDAP_DOMAIN=energo
LDAP_UPN_SUFFIX=energo.local
LDAP_EMAIL_DOMAIN=energo.local
LDAP_SEARCH_FILTER=(sAMAccountName={{username}})
# Сервисная учётка (необязательно) — чтобы подтягивать ФИО, почту, отдел из AD:
LDAP_BIND_DN=
LDAP_BIND_PASSWORD=
# true = проверять сертификат контроллера (правильно). См. раздел 5.2.
LDAP_TLS_REJECT_UNAUTHORIZED=true
# Если сертификат AD выдан внутренним центром сертификации — укажите его файл:
# NODE_EXTRA_CA_CERTS=/etc/ssl/certs/energo-ca.pem

# ---- Вложения (S3-совместимое хранилище, например MinIO) ----
S3_ENDPOINT=
S3_REGION=us-east-1
S3_BUCKET=helpdesk
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=

# ---- Telegram (необязательно) ----
TELEGRAM_BOT_TOKEN=
TELEGRAM_WEBHOOK_SECRET=
TELEGRAM_BOT_USERNAME=

# SEED_PASSWORD в production НЕ задавать.
```

Права доступа:

```bash
sudo chown root:helpdesk /etc/it-helpdesk.env
sudo chmod 640 /etc/it-helpdesk.env
```

### 5.1. Что означает каждая LDAP-настройка

| Переменная | Пример | Пояснение |
|---|---|---|
| `LDAP_URL` | `ldaps://SERV1.energo.local:636` | Адрес контроллера домена. `ldaps://…:636` — шифрованное подключение (рекомендуется). `ldap://…:389` — без шифрования, только для теста. **Если переменная пустая — вход через AD выключен**, работают только локальные тестовые учётки. |
| `LDAP_BASE_DN` | `DC=energo,DC=local` | «Корень» домена, где искать пользователей. Для `energo.local` это `DC=energo,DC=local`. |
| `LDAP_DOMAIN` | `energo` | Короткое (NetBIOS) имя домена. Именно его человек вводит до `\`: `energo\ivanov`. Если ввести другой домен — вход будет отклонён. |
| `LDAP_UPN_SUFFIX` | `energo.local` | Приложение сначала пробует войти как `ivanov@energo.local`, затем как `energo\ivanov`. |
| `LDAP_BIND_DN` / `LDAP_BIND_PASSWORD` | `CN=svc-helpdesk,OU=Service,DC=energo,DC=local` | Необязательная служебная учётка только для чтения AD. Нужна, чтобы подтянуть ФИО, e-mail, отдел, организацию. Без неё вход всё равно работает, но имя будет равно логину. |
| `LDAP_SEARCH_FILTER` | `(sAMAccountName={{username}})` | Как искать пользователя в AD. Обычно не меняют. |
| `LDAP_EMAIL_DOMAIN` | `energo.local` | Если у пользователя в AD нет почты, приложение запишет «условную» почту `ivanov@energo.local`. |
| `LDAP_TLS_REJECT_UNAUTHORIZED` | `true` | Проверять ли сертификат контроллера при LDAPS. |

Как устроен вход: пользователь вводит `energo\ivanov` и свой обычный доменный пароль → приложение проверяет пароль у SERV1 → если верно, при **первом** входе создаёт у себя запись пользователя с ролью **USER** (обычный пользователь). Пароли в базе Help Desk не хранятся. Роли техников и админов назначаются отдельно — см. `adminy.md`.

> Ограничение: форма входа требует пароль **не короче 8 символов**. Если у кого-то в AD пароль короче — войти не получится, пока он не сменит пароль.

### 5.2. Сертификат контроллера домена (LDAPS)

Контроллер домена обычно имеет сертификат от внутреннего центра сертификации (CA) домена, которому Linux «не доверяет» по умолчанию. Варианты:

1. **Правильно:** выгрузить корневой сертификат CA домена (на контроллере: `certlm.msc` → Доверенные корневые центры → экспорт в Base-64 `.cer`), положить на сервер как `/etc/ssl/certs/energo-ca.pem` и добавить в env-файл `NODE_EXTRA_CA_CERTS=/etc/ssl/certs/energo-ca.pem`. Оставить `LDAP_TLS_REJECT_UNAUTHORIZED=true`.
2. **Быстро, для внутренней сети/теста:** `LDAP_TLS_REJECT_UNAUTHORIZED=false` — шифрование есть, но сертификат не проверяется.

Проверить сертификат вручную:

```bash
openssl s_client -connect SERV1.energo.local:636 -showcerts </dev/null | head -30
```

Важно: в `LDAP_URL` указывайте **имя** (`SERV1.energo.local`), а не IP — сертификат выписан на имя.

## 6. Сборка приложения

```bash
cd /opt/it-helpdesk/app
sudo -u helpdesk bash -c '
  set -a; . /etc/it-helpdesk.env; set +a     # загрузить настройки в текущую сессию
  npm ci --no-audit --no-fund                  # установить зависимости строго по package-lock.json
  npx prisma migrate deploy                    # создать/обновить таблицы в базе
  npm run build                                # собрать приложение
'
```

(Если `sudo -u helpdesk` не может прочитать env-файл — проверьте шаг с `chown root:helpdesk`.)

### 6.1. Категории заявок (обязательно один раз)

Без категорий нельзя создать заявку. Тестовый скрипт `npm run db:seed` **отказывается работать при `NODE_ENV=production`** (и он же создаёт демо-учётки, которые в боевой системе не нужны). Поэтому категории добавляем SQL-запросом:

```bash
psql "postgresql://helpdesk:ВСТАВЬТЕ_ПАРОЛЬ_БД@127.0.0.1:5432/helpdesk" <<'SQL'
INSERT INTO "Category" (id, name, "isActive", "createdAt", "updatedAt")
SELECT gen_random_uuid(), n, true, now(), now()
FROM unnest(ARRAY['Windows','Linux','1С/BAF','M.E.Doc','RDP/RemoteApp','Network','MikroTik','VPN','Printers','Email','Hardware','Accounts','Other']) AS n
ON CONFLICT (name) DO NOTHING;
SQL
```

Добавить новую категорию позже: тот же запрос с одним названием. Скрыть категорию: `UPDATE "Category" SET "isActive"=false WHERE name='MikroTik';`

## 7. Служба systemd (автозапуск)

```bash
sudo nano /etc/systemd/system/it-helpdesk.service
```

```ini
[Unit]
Description=IT Help Desk (Next.js)
After=network-online.target postgresql.service
Wants=network-online.target

[Service]
Type=simple
User=helpdesk
WorkingDirectory=/opt/it-helpdesk/app
EnvironmentFile=/etc/it-helpdesk.env
# -H 127.0.0.1 : слушать только внутри сервера, снаружи доступ только через nginx
ExecStart=/usr/bin/npm start -- -H 127.0.0.1 -p 8090
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

> Если Node установлен через nvm (как на 184), замените `/usr/bin/npm` на полный путь, например `/home/toor/.nvm/versions/node/v22.x.x/bin/npm`, и добавьте строку `Environment=PATH=/home/toor/.nvm/versions/node/v22.x.x/bin:/usr/bin:/bin`.

Запуск:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now it-helpdesk
systemctl status it-helpdesk          # должно быть active (running)
curl -s http://127.0.0.1:8090/api/health
# ожидается: {"status":"ok","database":"ok"}
```

Логи (что пишет приложение):

```bash
journalctl -u it-helpdesk -f            # в реальном времени, выход Ctrl+C
journalctl -u it-helpdesk --since today
```

## 8. nginx и HTTPS на порту 8443

### 8.1. Сертификат

- Внутренняя сеть, быстро — самоподписанный сертификат (браузер один раз покажет предупреждение):

```bash
sudo mkdir -p /etc/nginx/ssl
sudo openssl req -x509 -nodes -newkey rsa:2048 -days 825 \
  -keyout /etc/nginx/ssl/helpdesk.key -out /etc/nginx/ssl/helpdesk.crt \
  -subj "/CN=192.168.0.184" \
  -addext "subjectAltName=IP:192.168.0.184,DNS:helpdesk.energo.local"
sudo chmod 600 /etc/nginx/ssl/helpdesk.key
```

- Правильно — выпустить сертификат во внутреннем CA домена (тогда доменные ПК не будут ругаться) и положить его в те же файлы.

### 8.2. Конфигурация сайта

```bash
sudo nano /etc/nginx/sites-available/it-helpdesk
```

```nginx
server {
    listen 8443 ssl;
    http2 on;                      # для старого nginx (<1.25) уберите эту строку и напишите: listen 8443 ssl http2;
    server_name 192.168.0.184 helpdesk.energo.local;

    ssl_certificate     /etc/nginx/ssl/helpdesk.crt;
    ssl_certificate_key /etc/nginx/ssl/helpdesk.key;
    ssl_protocols TLSv1.2 TLSv1.3;

    # вложения до 5 файлов по 10 МБ
    client_max_body_size 60m;

    location / {
        proxy_pass http://127.0.0.1:8090;
        proxy_http_version 1.1;
        proxy_set_header Host              $host:$server_port;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header Upgrade           $http_upgrade;
        proxy_set_header Connection        "upgrade";
        proxy_read_timeout 120s;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/it-helpdesk /etc/nginx/sites-enabled/
sudo nginx -t                 # проверка синтаксиса: "syntax is ok"
sudo systemctl reload nginx
curl -sk https://127.0.0.1:8443/api/health
```

> `APP_URL` в env-файле должен совпадать с адресом, который открывают люди (`https://192.168.0.184:8443`). Если поставили `https://`, а открываете по `http://` — вход «не держится» (cookie не сохраняется).

## 9. Firewall (ufw)

Открываем только SSH и 8443. Порт 8090 и Postgres (5432) снаружи не нужны.

```bash
sudo ufw allow OpenSSH                 # ВАЖНО сделать первым, иначе потеряете SSH
sudo ufw allow 8443/tcp
# по желанию — только из локальной сети:
# sudo ufw allow from 192.168.0.0/24 to any port 8443 proto tcp
sudo ufw enable
sudo ufw status verbose
```

Исходящие подключения к SERV1:636 ufw по умолчанию не блокирует.

## 10. Первый вход и назначение администратора

1. Откройте `https://192.168.0.184:8443` → **Войти**.
2. Домен `energo`, пользователь — ваш логин (например `o.nikishin`), пароль — доменный.
3. После первого входа вы — обычный USER. Сделайте себя администратором по инструкции **`adminy.md`** (одна SQL-команда), затем выйдите и войдите снова.

## 11. Вложения (S3)

Файлы к заявкам хранятся не в базе, а в S3-совместимом хранилище (Amazon S3, MinIO, Wasabi и т. п.). Если `S3_*` не заполнены, заявки создаются, но загрузка файлов выдаёт ошибку «Заявка создана, но часть файлов загрузить не удалось».

Пример быстрого локального MinIO на том же сервере:

```bash
sudo mkdir -p /srv/minio && sudo useradd --system minio || true && sudo chown minio /srv/minio
curl -fsSLo /tmp/minio https://dl.min.io/server/minio/release/linux-amd64/minio && sudo install /tmp/minio /usr/local/bin/minio
# создайте службу minio (MINIO_ROOT_USER/MINIO_ROOT_PASSWORD, команда: minio server /srv/minio --address 127.0.0.1:9000)
# затем создайте bucket "helpdesk" (утилитой mc или через веб-консоль MinIO)
```

И в `/etc/it-helpdesk.env`:

```ini
S3_ENDPOINT=http://127.0.0.1:9000
S3_REGION=us-east-1
S3_BUCKET=helpdesk
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
```

> Скачивание файла идёт по временной ссылке прямо в хранилище (действует 5 минут). Если MinIO слушает только 127.0.0.1, браузер пользователя до него не достанет — тогда хранилище надо опубликовать (например, отдельным location в nginx) или использовать внешний S3.

## 12. Обновление до новой версии

```bash
cd /opt/it-helpdesk/app
sudo -u helpdesk git fetch origin
sudo -u helpdesk git log --oneline HEAD..origin/main      # посмотреть, что придёт
# ВАЖНО: сначала сделайте бэкап базы (раздел 13)
sudo -u helpdesk git pull --ff-only
sudo -u helpdesk bash -c '
  set -a; . /etc/it-helpdesk.env; set +a
  npm ci --no-audit --no-fund
  npx prisma migrate deploy
  npm run build
'
sudo systemctl restart it-helpdesk
sleep 5; curl -s http://127.0.0.1:8090/api/health
```

Откат, если что-то сломалось: `git log` → `sudo -u helpdesk git checkout <предыдущий_коммит>` → снова `npm ci && npm run build` → `systemctl restart`. Если новая версия уже изменила таблицы (миграция), восстановите базу из бэкапа, сделанного перед обновлением.

## 13. Резервное копирование базы

Ручной бэкап:

```bash
sudo mkdir -p /var/backups/it-helpdesk
sudo -u postgres pg_dump -Fc helpdesk > /var/backups/it-helpdesk/helpdesk-$(date +%F-%H%M).dump
```

Автоматически каждую ночь в 02:30 с хранением 30 дней:

```bash
sudo tee /etc/cron.d/it-helpdesk-backup >/dev/null <<'EOF2'
30 2 * * * postgres pg_dump -Fc helpdesk > /var/backups/it-helpdesk/helpdesk-$(date +\%F).dump && find /var/backups/it-helpdesk -name '*.dump' -mtime +30 -delete
EOF2
sudo chown postgres /var/backups/it-helpdesk
```

Копируйте файлы бэкапа ещё и на другой сервер/NAS — бэкап на том же диске не спасёт при поломке диска. Не забудьте бэкапить и `/etc/it-helpdesk.env` (в надёжное место — там пароли) и bucket с вложениями.

Восстановление (перезапишет текущие данные!):

```bash
sudo systemctl stop it-helpdesk
sudo -u postgres pg_restore --clean --if-exists -d helpdesk /var/backups/it-helpdesk/helpdesk-2026-10-05.dump
sudo systemctl start it-helpdesk
```

## 14. Частые проблемы

| Симптом | Причина и решение |
|---|---|
| «Неверный логин или пароль», хотя пароль верный | Проверьте домен (`energo`, не `energo.local`); пароль ≥ 8 символов; `journalctl -u it-helpdesk -n 50`; `nc -vz SERV1.energo.local 636`. |
| В логах ошибка сертификата (`self signed`, `unable to verify`) | См. раздел 5.2: `NODE_EXTRA_CA_CERTS` или временно `LDAP_TLS_REJECT_UNAUTHORIZED=false`. |
| `ENOTFOUND SERV1.energo.local` | Сервер не знает имя контроллера — настройте DNS или `/etc/hosts`. |
| После входа снова выбрасывает на страницу входа | `APP_URL` начинается с `https://`, а открываете по `http://` (или наоборот). |
| `/api/health` → `database: unavailable` | Postgres не запущен (`systemctl status postgresql`) или неверный `DATABASE_URL`. |
| Пустой список категорий | Не выполнен раздел 6.1. |
| Служба не стартует: `AUTH_SECRET must contain at least 32 characters` | Секрет короче 32 символов или env-файл не читается. |
| 502 Bad Gateway в браузере | Приложение не запущено или не на 8090: `systemctl status it-helpdesk`, `ss -ltnp | grep 8090`. |
| Файл не загружается | Не настроен S3, файл больше 10 МБ или неподдерживаемый тип (разрешены PNG, JPEG, WEBP, PDF, TXT). |

После любого изменения `/etc/it-helpdesk.env`: `sudo systemctl restart it-helpdesk`.
