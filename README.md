# IT Help Desk

Internal IT Service Desk for ticket intake, assignment, collaboration, attachments, audit history, and Telegram notifications.

## Stack

- Next.js 16 + TypeScript
- PostgreSQL + Prisma 6
- Tailwind CSS (via app styles)
- Telegram Bot API
- S3-compatible object storage
- Optional Active Directory / LDAP login

## Local setup

```bash
cp .env.example .env
# fill DATABASE_URL, AUTH_SECRET (>=32 chars), APP_URL
npm install
npx prisma migrate deploy
SEED_PASSWORD='your-12plus-char-password' npm run db:seed
npm run build
npm start
# or: npm run dev
```

### Login (domain credentials)

UI expects NetBIOS-style logins with default domain **energo**:

- `energo\admin` — ADMIN
- `energo\tech` — TECHNICIAN
- `energo\user` — USER

Password comes from `SEED_PASSWORD` (local/dev fallback when `LDAP_URL` is not set).

API accepts either:

```json
{ "login": "energo\\admin", "password": "..." }
```

or

```json
{ "domain": "energo", "username": "admin", "password": "..." }
```

Legacy `{ "email": "admin@example.local", "password": "..." }` is still accepted and mapped to username `admin`.

### Active Directory

When `LDAP_URL` is set, the app binds to AD and then finds/creates a local `User` row (default role `USER`). Roles `ADMIN` / `TECHNICIAN` are assigned in the database after the first login.

Required for real AD:

| Variable | Example | Purpose |
|---|---|---|
| `LDAP_URL` | `ldap://dc01.energo.local:389` | Domain controller |
| `LDAP_BASE_DN` | `DC=energo,DC=local` | Search base |
| `LDAP_DOMAIN` | `energo` | NetBIOS domain (must match login) |
| `LDAP_UPN_SUFFIX` | `energo.local` | Preferred bind as `user@energo.local` |
| `LDAP_BIND_DN` / `LDAP_BIND_PASSWORD` | service account | Optional profile lookup after user bind |
| `LDAP_EMAIL_DOMAIN` | `energo.local` | Synthetic email if AD has no `mail` |

## Scripts

- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run build`

## Security

No production secrets belong in this repository. Runtime secrets must be provided through environment variables.

## Документация (RU)

- [docs/ustanovka.md](docs/ustanovka.md) — установка и настройка на Linux-сервере (Node 22, PostgreSQL, AD/LDAP, nginx HTTPS, systemd, firewall, обновление, бэкап)
- [docs/adminy.md](docs/adminy.md) — назначение администраторов и техников
- [docs/rukovodstvo.md](docs/rukovodstvo.md) — руководство пользователя и IT-специалиста
- [docs/IT-HelpDesk-instrukcii.docx](docs/IT-HelpDesk-instrukcii.docx) — все три раздела в одном Word-файле

## SLA и очередь

Рабочее время: пн–пт 09:00–18:00, Europe/Kyiv. Праздники пока не вычитаются — точка расширения `CalendarProvider` в `src/lib/sla.ts`. Приоритет «Критический» (`URGENT`) считается круглосуточно. Один рабочий день = 540 минут.

Снимок SLA сохраняется на заявке. Ожидание пользователя ставит срок решения на паузу. Первая реакция — первый публичный ответ техника или администратора.

`next start` раз в 5 минут закрывает решённые заявки старше 3 дней и один раз фиксирует просрочку. Внешний вызов: `POST /api/internal/jobs` с заголовком `x-cron-secret`. Письма идут через outbox и не откатывают заявку при сбое SMTP. Telegram сохранён; внутренние заметки пользователю не уходят.
