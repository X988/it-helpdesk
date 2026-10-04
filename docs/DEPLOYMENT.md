# Развёртывание и эксплуатация

## Подготовка

- Node.js 22 LTS (не ниже 22.13) / Docker с Compose v2.
- PostgreSQL 17 и резервное копирование; доступ к БД только от приложения.
- Публичный HTTPS-адрес, совпадающий с APP_URL.
- S3 и Telegram необязательны. Частичная конфигурация интеграции запрещена.
- Случайный CRON_SECRET и запуск обработчика уведомлений раз в минуту.

Не размещайте .env в GitHub. Права на файл в Linux: chmod 600 .env.
AUTH_SECRET из старой версии больше не используется: новые сессии
отзываются через БД. После обновления все пользователи входят заново.

## Вариант 1: Node.js на сервере

Задайте .env, затем:

```bash
npm ci
npm run db:generate
npm run db:migrate
npm run build
npm run db:bootstrap
NODE_ENV=production npm start
```

Bootstrap нужен только при первом развёртывании. Для действующей БД с
активным администратором этот шаг пропустите. Для обновления порядок:
резервная копия → npm ci → генерация → миграции → сборка → перезапуск.
Рекомендуется собирать новый каталог релиза, затем переключать сервис на него.

Пример systemd (путь и пользователя замените на свои):

```ini
[Unit]
Description=IT Help Desk
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=helpdesk
WorkingDirectory=/opt/it-helpdesk
Environment=NODE_ENV=production
ExecStart=/usr/bin/npm start
Restart=on-failure
RestartSec=5
TimeoutStopSec=20
NoNewPrivileges=true
PrivateTmp=true
UMask=0077

[Install]
WantedBy=multi-user.target
```

Приложение читает .env само. PATH должен содержать нужный Node.js.
Порт приложения закрывайте firewall; публичные запросы принимает reverse proxy.

## Вариант 2: Docker Compose

1. Скопируйте .env.example в .env.
2. Задайте POSTGRES_PASSWORD случайной шестнадцатеричной строкой.
   Например, сгенерируйте локально через openssl rand -hex 32.
3. Установите APP_URL=https://your-real-domain.
4. Задайте BOOTSTRAP_ADMIN_* для первого администратора.
5. Выполните:

```bash
docker compose build
docker compose up -d db
docker compose run --rm migrate
docker compose run --rm migrate npm run db:bootstrap
docker compose up -d app
```

Удалите BOOTSTRAP_ADMIN_* из .env и пересоздайте app после bootstrap.
Не запускайте bootstrap при обновлениях действующей системы.
БД хранится в postgres_data. docker compose down не удаляет том;
docker compose down -v удаляет данные и не используется для обновлений.

runner содержит production-сборку и сгенерированный Prisma Client.
builder — отдельный образ для миграций/первого создания администратора.
Сервер при старте не применяет миграции.
Compose публикует приложение только на 127.0.0.1:3000; PostgreSQL наружу
не публикуется. DATABASE_URL в контейнерах задаётся Compose автоматически.

Для проверки production-сборки по HTTP на локальной машине задайте
APP_URL=http://localhost:3000 и ALLOW_INSECURE_HTTP=true явно.
Для обычного production оставляйте ALLOW_INSECURE_HTTP=false и используйте HTTPS.
Флаг не снимает Secure с cookie production-сессии.

## Reverse proxy

Используйте настроенный сертификат для настоящего домена.
Содержимое server location для Nginx:

```nginx
client_max_body_size 52m;
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 60s;
}
```

Внешний Origin должен совпадать с APP_URL. Не разрешайте произвольные Origin.
Приложение не доверяет X-Forwarded-For для ограничения входа:
счётчики в БД привязаны к аккаунту и общему потоку запросов.
Сетевой лимит на reverse proxy полезен дополнительно, особенно перед публичным доступом.
Содержимое ответа и cookie API не кешируются.

## Уведомления и Telegram

Поставьте npm run notifications:deliver в cron/systemd timer раз в минуту,
из каталога проекта. Для Docker/отдельного планировщика используйте
защищённый HTTP endpoint /api/jobs/notifications и CRON_SECRET.

Настройку webhook в Bot API выполните отдельно с вашим реальным токеном:
метод setWebhook, url=https://your-domain/api/telegram/webhook,
secret_token=<TELEGRAM_WEBHOOK_SECRET>. Токен не записывайте в историю shell
и логи reverse proxy. Программа не устанавливает webhook автоматически.

Повторы: до 8 попыток с возрастающей задержкой. Pending/failed доступны в
«Управление». После восстановления связи можно сбросить attempts/availableAt
у выбранных не доставленных Notification через администрирование БД;
возможный повтор Telegram нужно учитывать. Внутренние сообщения не
передаются автору заявки, тело заметки не входит в уведомление.

## Резервная копия

Для Compose:

```bash
umask 077
docker compose exec -T db pg_dump -U helpdesk -d helpdesk -Fc > helpdesk-backup.dump
```

Отдельно сохраняйте приватный S3 bucket и секреты вне репозитория.
Держите резервные копии вне диска/хоста приложения.

Проверяйте восстановление в отдельной БД:

```bash
docker compose exec -T db createdb -U helpdesk helpdesk_restore_test
docker compose exec -T db pg_restore -U helpdesk -d helpdesk_restore_test --exit-on-error < helpdesk-backup.dump
```

Не восстанавливайте поверх рабочей БД без остановки, сохранения текущих данных
и согласованного плана. Дополнительная миграция аудита только добавляет таблицы
и поля; исходная миграция не переписывалась.
При откате приложения используйте прежний проверенный образ. Не удаляйте
новые таблицы автоматически; если нужен откат данных, восстанавливайте копию.

## Проверка после обновления

- /api/health возвращает 200 и status=ok; при сбое БД — 503.
- Вход администратора, создание категории и пользователя.
- Пользователь создаёт заявку; другой пользователь её не видит.
- Специалист берёт, отвечает, решает; автор подтверждает / возвращает.
- Внутренняя заметка отсутствует в интерфейсе и API пользователя.
- Приватный файл скачивается, чужой аккаунт получает 404.
- Отключённый аккаунт и старые cookie не получают доступ.
- Проверьте очередь уведомлений, расписание обработчика и восстановление копии.

Лимиты входа: 10 попыток на аккаунт за 15 минут, 100 запросов входа в минуту
на установку. Создание заявок: 30/минуту на пользователя; загрузки: 10/минуту.
Для нескольких серверов используется общая БД; счётчики и очередь общие.
