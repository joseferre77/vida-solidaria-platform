# DEPLOY.md — Subir el sistema a Hostinger (hosting compartido/Business)

> Reescribí esta guía después de confirmar con vos que tu plan es hosting
> compartido/Business con "Node.js App" (no VPS). Antes de escribir esto
> busqué la documentación oficial y actual de Hostinger en vez de asumir —
> las fuentes están al final. Si en algún punto la interfaz de hPanel no
> coincide exactamente con lo que describo acá, es más confiable lo que veas
> en pantalla que este documento — avisame y lo ajusto.

## Primero, lo que cambia respecto a un VPS (y por qué)

Tu plan **no soporta PostgreSQL ni Redis** — Hostinger lo dice explícito:
"PostgreSQL requiere más recursos del sistema y permisos específicos que no
están disponibles en los planes Web y Cloud hosting". Eso no es un problema
de mi diseño, es una limitación real del plan. No hace falta cambiar de
motor de base de datos igual: Hostinger tiene un botón nativo para conectar
**Supabase** (que por dentro es Postgres con PostGIS) a tu Node.js App, así
que `apps/api/prisma/schema.prisma` **no cambia nada**.

Tampoco hay acceso root/SSH con control total: tu "Node.js App" corre dentro
de un entorno administrado por Hostinger (parecido a Vercel/Railway, no a un
VPS) — ellos manejan el proceso, el puerto, y el redeploy. Por eso las cosas
que armé antes para VPS (Nginx, PM2, un script de setup de servidor) **no
aplican acá** — quedan guardadas en `deploy/vps-appendix/` por si el día de
mañana migrás a VPS, pero ignoralas por ahora.

## Paso 0 — Repo en GitHub

Igual que antes: no puedo pushear yo (este entorno tiene bloqueado el acceso
directo a GitHub), así que lo hacés vos con el contenido del ZIP:

```bash
cd vida-solidaria-platform
git init
git add .
git commit -m "Milestone 1: Core & Seguridad (auth + RBAC)"
git branch -M main
git remote add origin https://github.com/joseferre77/<TU_REPO_NUEVO>.git
git push -u origin main
```

Usá un repo **distinto** al de RedVivo.

## Paso 1 — Base de datos: conectar Supabase

1. En Supabase (supabase.com), creá un proyecto nuevo y gratis (el free tier
   alcanza de sobra para arrancar).
2. Cuando tengas la Node.js App creada en Hostinger (Paso 2), andá a su panel
   → sección **Essentials → Database → Connect** → elegí **Supabase** →
   autorizá tu cuenta → conectá el proyecto. Hostinger trae automáticamente
   las variables de conexión y las aplica en el próximo deploy — no hace
   falta que copies vos ningún connection string a mano.
3. Activá la extensión PostGIS en ese proyecto de Supabase: en su SQL Editor,
   corré `CREATE EXTENSION IF NOT EXISTS postgis;` una sola vez.

## Paso 2 — Crear la(s) Node.js App(s) en hPanel

Hostinger permite conectar por GitHub (recomendado — deploy automático en
cada push), por archivo comprimido, o con la extensión de VS Code. Vamos con
GitHub.

Necesitás **dos** Node.js Apps (backend y frontend son dos procesos
separados):

- **`vida-solidaria-api`** → subdominio `api.TU_DOMINIO`
- **`vida-solidaria-web`** → subdominio `app.TU_DOMINIO`

**Sobre el monorepo**: no encontré confirmación oficial de que Hostinger
permita apuntar la Node.js App a una *subcarpeta* de un repo (`apps/api`,
`apps/web`) cuando conectás por GitHub — la documentación no lo aclara. Dos
caminos, de más a menos cómodo:

- **Opción A (probar primero)**: conectá el mismo repo monorepo en las dos
  apps, y en cada una configurá manualmente:
  - `vida-solidaria-api`: **Install command** `pnpm install`, **Build
    command** `pnpm --filter @vida-solidaria/api exec prisma generate && pnpm --filter @vida-solidaria/api exec prisma migrate deploy && pnpm --filter @vida-solidaria/api exec tsx prisma/seed.ts && pnpm --filter @vida-solidaria/api build`,
    **Entry file / start** `apps/api/dist/server.js`. (El paso del seed
    depende de que ya hayas definido `ADMIN_PASSWORD` en las variables de
    entorno del Paso 3 — si preferís correrlo aparte más controladamente,
    sacalo de acá y mirá la sección "El usuario Admin maestro" más abajo.)
  - `vida-solidaria-web`: **Build command**
    `pnpm --filter @vida-solidaria/web build`, **Start command**
    `pnpm --filter @vida-solidaria/web start`.
  
  Si el panel no te deja poner rutas con `/` en el entry file, es que no
  soporta monorepos así — pasá a la Opción B.
- **Opción B (garantizada)**: separá `apps/api` y `apps/web` en dos repos de
  GitHub propios (cada uno con su `package.json` en la raíz), y conectá cada
  uno a su Node.js App normalmente. Es más manual de mantener en paralelo
  pero elimina cualquier duda sobre soporte de monorepo.

En ambos casos, la versión de Node.js a elegir es **20** (o 22, que viene
por defecto — el proyecto es compatible con ambas).

> Poniendo `prisma migrate deploy` dentro del **build command** de la API,
> las migraciones de base de datos corren solas en cada deploy — no
> necesitás una terminal para eso.

## Paso 3 — Variables de entorno

En cada Node.js App → **Environment variables** (a mano, o importando un
`.env` con "Import .env"):

**`vida-solidaria-api`** — copiá `apps/api/.env.example` y completá:
- `DATABASE_URL` — la pone Hostinger sola al conectar Supabase (Paso 1); no
  la borres ni la pises.
- `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` — generalos con
  `openssl rand -hex 32` cada uno.
- `CORS_ORIGIN="https://app.TU_DOMINIO"`
- `COOKIE_DOMAIN=".TU_DOMINIO"` (con el punto adelante, para que la cookie
  viaje entre `api.` y `app.`)
- `ADMIN_EMAIL`, `ADMIN_NAME`, **`ADMIN_PASSWORD`** — a diferencia de un VPS,
  acá **sí conviene que vos definas la contraseña del admin** en vez de
  dejar que se genere sola: no vas a tener una terminal interactiva a mano
  para leerla en el momento (ver más abajo).
- Dejá `REDIS_URL` vacío — no lo necesitás todavía.

**`vida-solidaria-web`**:
- `NEXT_PUBLIC_API_URL="https://api.TU_DOMINIO"`
- `NEXT_PUBLIC_SOCKET_URL="https://api.TU_DOMINIO"`

Guardar cambios redeploya automáticamente.

## El usuario Admin maestro (en este hosting, específicamente)

Con `ADMIN_PASSWORD` ya definida en las variables de entorno del Paso 3, el
seed (`prisma/seed.ts`) va a usar esa contraseña en vez de generar una al
azar — porque acá no hay una terminal donde ver un mensaje que se imprime
una sola vez. Sumá `&& pnpm --filter @vida-solidaria/api exec tsx prisma/seed.ts`
al final del **build command** de `vida-solidaria-api` (después del
`migrate deploy`) para que el seed corra en cada deploy — es seguro
repetirlo: si el usuario admin ya existe, el script no hace nada y sigue.

Si tu plan sí incluye una SSH real y preferís el flujo de contraseña
autogenerada como en VPS, es el mismo que ya te expliqué antes: dejás
`ADMIN_PASSWORD` vacía y corrés `pnpm prisma:seed` a mano una vez, copiando
la contraseña que se imprime.

## El "archivo de ingreso"

Ahora te lo puedo contestar con precisión, con la terminología exacta de
Hostinger: en su panel se llama **"Entry file"** — el script `.js`/`.mjs`/
`.cjs` que arranca tu app servidor. Para `vida-solidaria-api` es
`apps/api/dist/server.js` (compilado desde `src/server.ts` por el build
command); Hostinger lo ejecuta él solo, sin que vos tengas que hacer
`node server.js` manualmente.

## Google OAuth

Cuando tengas credenciales reales de un proyecto en Google Cloud Console,
la URL de callback autorizada ahí tiene que ser
`https://api.TU_DOMINIO/api/auth/google/callback` (la de la API, no la del
frontend). El intercambio del `code` en ese callback quedó como TODO
explícito en el código — lo termino cuando tengas esas credenciales para
poder probarlo de verdad.

## Checklist antes de dar por cerrado el Módulo 1

- [x] Repo en GitHub (distinto al de RedVivo) con el código pusheado — https://github.com/joseferre77/vida-solidaria-platform
- [ ] Proyecto Supabase creado + extensión PostGIS activada
- [ ] Las dos Node.js Apps creadas en hPanel (o resuelto Opción A vs B del
      monorepo)
- [ ] Supabase conectado a `vida-solidaria-api` desde el panel
- [ ] Variables de entorno completas en ambas apps (Paso 3)
- [ ] Subdominios `api.TU_DOMINIO` y `app.TU_DOMINIO` con DNS apuntando
      donde indique Hostinger
- [ ] Primer deploy corrido y el admin logueando bien en `app.TU_DOMINIO`
- [ ] Credenciales reales de Google OAuth (para cerrar ese TODO)

## Fuentes (documentación oficial de Hostinger, consultada para esta guía)

- [Is PostgreSQL supported at Hostinger?](https://www.hostinger.com/support/1583659-is-postgresql-supported-at-hostinger/)
- [Creating a Node.js App](https://docs.hostinger.com/node.js/creating-an-app)
- [Node.js hosting options at Hostinger](https://www.hostinger.com/support/node-js-hosting-options-at-hostinger/)
- [Connecting a Supabase database to a Hostinger Node.js application](https://www.hostinger.com/support/connecting-a-supabase-database-to-a-hostinger-node-js-application/)
- [Environment Variables (Node.js)](https://docs.hostinger.com/node.js/environment-variables)
- [FTP & SSH Access](https://docs.hostinger.com/websites/ftp-ssh)
