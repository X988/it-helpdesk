# IT Help Desk — как добавлять администраторов и техников

> Для кого: администратор системы. Нужен доступ по SSH к серверу (например 192.168.0.184) и права `sudo`.

## 1. Как устроены роли

В системе три роли (в базе они называются именно так, латиницей):

| Роль в базе | Кто это | Что может |
|---|---|---|
| `USER` | Обычный сотрудник | Создаёт заявки, видит **только свои** заявки, пишет в них сообщения, прикрепляет файлы. |
| `TECHNICIAN` | Техник / специалист IT (иногда сокращают «TECH») | Видит **все** заявки (очередь), берёт заявки в работу, меняет статусы, пишет публичные сообщения и **внутренние заметки** (их не видит автор заявки). |
| `ADMIN` | Администратор Help Desk | Всё, что может техник. Отдельных «админских» экранов пока нет — назначение ролей делается через базу (эта инструкция). |

Главное правило: **при первом входе через домен (AD) любой человек получает роль `USER`.** Повысить его до техника или админа можно только после того, как он хотя бы один раз вошёл — тогда в базе появится его запись.

## 2. Откуда берутся пользователи: seed против LDAP

| Способ | Когда работает | Как появляется пользователь | Пароль |
|---|---|---|---|
| **LDAP / AD** (боевой режим) | В `/etc/it-helpdesk.env` заполнен `LDAP_URL` | Автоматически при первом успешном входе `energo\логин` | Проверяется в AD, в базе Help Desk пароля нет |
| **Seed** (тестовый режим) | `LDAP_URL` пустой | Команда `SEED_PASSWORD='...' npm run db:seed` создаёт `energo\admin` (ADMIN), `energo\tech` (TECHNICIAN), `energo\user` (USER) | Общий из `SEED_PASSWORD` |

Важно:

- Когда включён LDAP, **локальные seed-пароли больше не работают** — все входы проверяются в AD.
- Seed не запускается при `NODE_ENV=production` (так задумано).
- **Безопасность:** если в базе остались seed-учётки `admin` / `tech` / `user`, а в AD существует пользователь с таким же логином (например `energo\admin`), то при входе он «подхватит» роль из базы — то есть станет ADMIN. На боевом сервере seed-учётки нужно отключить (раздел 6).

## 3. Подключение к базе

На сервере:

```bash
ssh toor@192.168.0.184
```

Самый простой способ открыть консоль базы, взяв адрес из файла настроек службы:

```bash
DB_URL=$(sudo grep -E '^DATABASE_URL=' /etc/it-helpdesk.env | cut -d= -f2- | tr -d "\"'")
psql "${DB_URL%%\?*}"
```

(`${DB_URL%%\?*}` отрезает хвост вида `?schema=public`, который понимает приложение, но не понимает `psql`.)

Альтернатива, если база на этом же сервере и называется `helpdesk`:

```bash
sudo -u postgres psql helpdesk
```

Появится приглашение `helpdesk=>` (или `helpdesk=#`). Выход — `\q`.

> Таблица называется `"User"` с большой буквы и **в двойных кавычках**. Колонки с большими буквами тоже в кавычках: `"isActive"`, `"createdAt"`, `"updatedAt"`.

## 4. Как найти пользователя

Все пользователи, новые сверху:

```sql
SELECT username, name, email, role, "isActive", "createdAt"
FROM "User"
ORDER BY "createdAt" DESC;
```

Поиск по части логина/имени/почты (без учёта регистра):

```sql
SELECT id, username, name, email, role, "isActive"
FROM "User"
WHERE username ILIKE '%nikishin%' OR name ILIKE '%Нікішин%' OR email ILIKE '%nikishin%';
```

Сколько людей в каждой роли:

```sql
SELECT role, count(*) FROM "User" GROUP BY role;
```

Что хранится в колонках:

- `username` — доменный логин без домена, маленькими буквами (`o.nikishin`). По нему лучше всего искать.
- `name` — ФИО из AD (если настроена служебная учётка `LDAP_BIND_DN`), иначе равен логину.
- `email` — почта из AD или «условная» `логин@energo.local`.
- `role` — `USER` / `TECHNICIAN` / `ADMIN`.
- `isActive` — `true` = может входить, `false` = заблокирован.

Если пользователя нет в списке — он ещё ни разу не входил. Попросите его зайти на `https://192.168.0.184:8443` под `energo\своим_логином`, затем повторите поиск.

## 5. Повысить / понизить роль

Всегда указывайте точное условие `WHERE`, иначе поменяете роль всем!

Сделать **администратором**:

```sql
UPDATE "User" SET role = 'ADMIN', "updatedAt" = now()
WHERE username = 'o.nikishin';
```

Сделать **техником**:

```sql
UPDATE "User" SET role = 'TECHNICIAN', "updatedAt" = now()
WHERE username = 'i.petrenko';
```

Несколько техников сразу:

```sql
UPDATE "User" SET role = 'TECHNICIAN', "updatedAt" = now()
WHERE username IN ('i.petrenko', 's.kovalenko', 'a.shevchenko');
```

Вернуть в обычные пользователи:

```sql
UPDATE "User" SET role = 'USER', "updatedAt" = now()
WHERE username = 'i.petrenko';
```

`psql` ответит `UPDATE 1` — значит изменена одна запись. `UPDATE 0` — такого логина нет (проверьте написание, раздел 4).

Безопасный вариант «с возможностью отмены»:

```sql
BEGIN;
UPDATE "User" SET role = 'ADMIN', "updatedAt" = now() WHERE username = 'o.nikishin';
SELECT username, role FROM "User" WHERE username = 'o.nikishin';   -- проверить
COMMIT;    -- или ROLLBACK; чтобы отменить
```

Одной командой из обычной консоли (без входа в psql):

```bash
sudo -u postgres psql helpdesk -c "UPDATE \"User\" SET role='ADMIN', \"updatedAt\"=now() WHERE username='o.nikishin';"
```

### ⚠️ Чтобы новая роль заработала — выйти и войти заново

Роль записывается в «пропуск» (cookie сессии) в момент входа. Пропуск действует **12 часов**. Поэтому после `UPDATE`:

- человек должен выйти и войти снова. Кнопки «Выйти» в интерфейсе пока нет, поэтому любой из способов:
  - удалить cookie сайта в браузере (значок замка слева от адреса → «Файлы cookie и данные сайта» → удалить) и обновить страницу;
  - или нажать F12 → вкладка «Console» → вставить `fetch('/api/auth/logout',{method:'POST'}).then(()=>location.href='/login')` → Enter;
  - или открыть сайт в окне инкогнито (Ctrl+Shift+N);
- при **понижении** роли старый пропуск продолжает работать до 12 часов. Если нужно отобрать права немедленно — смените `AUTH_SECRET` в `/etc/it-helpdesk.env` и выполните `sudo systemctl restart it-helpdesk` (выкинет из системы **всех**, им нужно просто войти заново).

## 6. Заблокировать и разблокировать

```sql
-- заблокировать (уволился, ушёл в другой отдел и т. п.)
UPDATE "User" SET "isActive" = false, "updatedAt" = now() WHERE username = 'i.petrenko';
-- разблокировать
UPDATE "User" SET "isActive" = true,  "updatedAt" = now() WHERE username = 'i.petrenko';
```

Удалять пользователей не нужно (и часто нельзя): на них ссылаются заявки и сообщения. Блокировка — правильный способ. Отключённая учётка в AD тоже не сможет войти, т. к. пароль проверяется в AD.

Отключить тестовые seed-учётки на боевом сервере:

```sql
UPDATE "User" SET "isActive" = false, "updatedAt" = now()
WHERE email IN ('admin@example.local', 'tech@example.local', 'user@example.local');
```

## 7. Можно ли добавить админа ДО его первого входа?

Можно, но обычно не нужно. Запись создаётся заранее, а при первом входе приложение найдёт её по `username` (или `email`) и просто обновит ФИО/отдел, **сохранив роль**:

```sql
INSERT INTO "User" (id, email, username, name, "passwordHash", role, "isActive", "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'i.petrenko@energo.local', 'i.petrenko', 'i.petrenko',
        '!ldap-only', 'TECHNICIAN', true, now(), now())
ON CONFLICT DO NOTHING;
```

- `username` — строго как в AD (sAMAccountName), маленькими буквами.
- `email` — лучше указать настоящую почту из AD; если в AD почты нет — `логин@energo.local`.
- `passwordHash` = `'!ldap-only'` — заглушка: при включённом LDAP пароль из базы не используется.

## 8. Проверка администратора o.nikishin

После первого входа `energo\o.nikishin` проверьте:

```sql
SELECT username, name, email, role, "isActive" FROM "User" WHERE username = 'o.nikishin';
```

Если `role` не `ADMIN` — выполните:

```sql
UPDATE "User" SET role = 'ADMIN', "updatedAt" = now() WHERE username = 'o.nikishin';
```

и перезайдите в Help Desk (см. раздел 5 — как выйти). Признак, что вы админ/техник: на панели заголовок **«Панель специалиста»** (а не «Мои заявки»), видны чужие заявки и кнопка «Взять в работу».

## 9. Шпаргалка

| Задача | Команда |
|---|---|
| Открыть базу | `sudo -u postgres psql helpdesk` |
| Найти | `SELECT username,name,role FROM "User" WHERE username ILIKE '%петр%';` |
| Сделать админом | `UPDATE "User" SET role='ADMIN',"updatedAt"=now() WHERE username='логин';` |
| Сделать техником | `UPDATE "User" SET role='TECHNICIAN',"updatedAt"=now() WHERE username='логин';` |
| Понизить | `UPDATE "User" SET role='USER',"updatedAt"=now() WHERE username='логин';` |
| Заблокировать | `UPDATE "User" SET "isActive"=false,"updatedAt"=now() WHERE username='логин';` |
| После изменения | человеку выйти и войти снова |
