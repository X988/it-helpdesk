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
