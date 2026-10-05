# IT Help Desk

Internal IT Service Desk for ticket intake, assignment, collaboration, attachments, audit history, and Telegram notifications.

## Stack

- Next.js 16 + TypeScript
- PostgreSQL + Prisma 6
- Tailwind CSS (via app styles)
- Telegram Bot API
- S3-compatible object storage

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

Development seed accounts (password from `SEED_PASSWORD`):

- `admin@example.local` — ADMIN
- `tech@example.local` — TECHNICIAN
- `user@example.local` — USER

## Scripts

- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run build`

## Security

No production secrets belong in this repository. Runtime secrets must be provided through environment variables.
