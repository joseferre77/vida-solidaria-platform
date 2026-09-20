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

## Paso 0 — Repo en GitHub ✅ hecho

Ya está resuelto — el código vive en
[github.com/joseferre77/vida-solidaria-platform](https://github.com/joseferre77/vida-solidaria-platform),
rama `main`. Cada milestone nuevo se pushea ahí directo.

## Paso 1 — Crear el proyecto en Supabase (todavía sin conectar a nada)

1. En [supabase.com](https://supabase.com), creá una cuenta/proyecto nuevo y
   gratis (el free tier alcanza de sobra para arrancar). Elegí una región
   cercana (por ejemplo São Paulo).
2. No hace falta copiar ningún connection string a mano todavía — eso lo va
   a hacer Hostinger automáticamente en el Paso 3, una vez que exista la
   Node.js App.
3. Activá la extensión PostGIS: en el **SQL Editor** de ese proyecto, corré
   una sola vez `CREATE EXTENSION IF NOT EXISTS postgis;`.

## Paso 2 — Crear la(s) Node.js App(s) en hPanel

**Importante — esto es lo que te faltaba y por eso no veías el botón de
conectar la base de datos**: ese botón no está en ningún menú general de
hPanel, aparece *adentro* del panel de una Node.js App que ya existe. Hay
que crear la app primero.

Navegación exacta en hPanel:

1. **Websites → Add Website**.
2. Elegí el tipo **Node.js web app** (no sitio estático, no WordPress).
3. Como fuente del código elegí **Import from GitHub** (ya no hace falta
   subir ningún zip — el repo ya está pusheado).
4. Autorizá a Hostinger a acceder a tu cuenta de GitHub si te lo pide, y
   seleccioná el repo `joseferre77/vida-solidaria-platform`, rama `main`.
5. Hostinger va a autodetectar framework/comandos — revisalos y ajustalos
   como corresponde (detalle abajo). Version de Node: **20** (o 22, el
   proyecto anda con ambas).
6. Click en **Deploy**.

Necesitás **dos** Node.js Apps (backend y frontend son dos procesos
separados) — repetí este flujo dos veces:

- **`vida-solidaria-api`** → subdominio `api.TU_DOMINIO`
- **`vida-solidaria-web`** → subdominio `app.TU_DOMINIO`

**Sobre el monorepo**: no encontré confirmación oficial de que al importar
por GitHub, Hostinger permita apuntar la Node.js App a una *subcarpeta* del
repo (`apps/api`, `apps/web`) en vez de a la raíz. Dos caminos, de más a
menos cómodo:

- **Opción A (probar primero)**: conectá el mismo repo monorepo en las dos
  apps, y en cada una configurá manualmente:
  - `vida-solidaria-api`: **Install command** `pnpm install`, **Build
    command** `pnpm --filter @vida-solidaria/api exec prisma generate && pnpm --filter @vida-solidaria/api exec prisma migrate deploy && pnpm --filter @vida-solidaria/api exec tsx prisma/seed.ts && pnpm --filter @vida-solidaria/api build`,
    **Entry file / start** `apps/api/dist/server.js`. (El paso del seed
    depende de que ya hayas definido `ADMIN_PASSWORD` en las variables de
    entorno del Paso 4 — si preferís correrlo aparte más controladamente,
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

> Poniendo `prisma migrate deploy` dentro del **build command** de la API,
> las migraciones de base de datos corren solas en cada deploy — no
> necesitás una terminal para eso.

## Paso 3 — Ahora sí: conectar Supabase a `vida-solidaria-api`

Con la app ya creada y deployada al menos una vez (aunque falle por no tener
`DATABASE_URL` todavía, no importa):

1. Entrá al dashboard de la Node.js App **`vida-solidaria-api`** en hPanel.
2. Sección **Essentials → Database** → botón **Connect**.
3. Elegí **Supabase** → te redirige a Supabase para autorizar la conexión →
   elegís el proyecto que creaste en el Paso 1 (conectar uno existente, no
   crear uno nuevo ahí).
4. Hostinger completa `DATABASE_URL` solo y redeploya la app.

## Paso 4 — Variables de entorno

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
- [x] Proyecto Supabase creado (`vida-solidaria-production`, org `nuevogenfilms2025`) — PostGIS no se activó todavía (no hace falta para Módulo 1, ningún dato geográfico se usa aún)
- [x] Las dos Node.js Apps creadas en hPanel (monorepo con Directorio root `apps/web` y `apps/api` — Opción A del monorepo funcionó, no hizo falta separar repos)
- [x] Supabase conectado a `vida-solidaria-api` desde el panel
- [x] Variables de entorno completas en ambas apps
- [x] Subdominios `gestion.vidasolidariamdp.com` (web) y `api.vidasolidariamdp.com` (api) funcionando con SSL
- [x] Primer deploy corrido y el admin logueando bien (probado por SSH con `curl` contra `/api/auth/login`, HTTP 200 con el usuario Admin General)
- [ ] Credenciales reales de Google OAuth (para cerrar ese TODO)

## Fuentes (documentación oficial de Hostinger, consultada para esta guía)

- [Is PostgreSQL supported at Hostinger?](https://www.hostinger.com/support/1583659-is-postgresql-supported-at-hostinger/)
- [Creating a Node.js App](https://docs.hostinger.com/node.js/creating-an-app)
- [Node.js hosting options at Hostinger](https://www.hostinger.com/support/node-js-hosting-options-at-hostinger/)
- [Connecting a Supabase database to a Hostinger Node.js application](https://www.hostinger.com/support/connecting-a-supabase-database-to-a-hostinger-node-js-application/)
- [Environment Variables (Node.js)](https://docs.hostinger.com/node.js/environment-variables)
- [FTP & SSH Access](https://docs.hostinger.com/websites/ftp-ssh)

## Actualización real (post-intento): el asistente de hPanel no alcanza, hace falta SSH

Lo de arriba es la teoría según la documentación oficial de Hostinger. En la
práctica, desplegando `vida-solidaria-web` nos encontramos con esto:

1. El selector de **"Comando de compilación"** del asistente de hPanel **no
   se aplica de verdad** — sin importar qué elijas ahí, Hostinger siempre
   corre el script `build` a secas (confirmado mirando
   `hbuilds/versions/<id>/.metadata.json`: `"build_script":"build"` fijo).
2. Con `output: "standalone"` en `next.config.mjs` (necesario — sin esto
   Next no genera nada ejecutable, solo queda un build estático sin server),
   Hostinger sí arma el `server.js` correcto de Next.js dentro de
   `hbuilds/current/nodejs/server.js`... **pero nunca copia el
   `node_modules` que ese server.js necesita** (`require('next')` falla:
   `Cannot find module 'next'`). Esto pasó igual probando distintos
   "Directorio de salida" — es un bug/omisión del lado de Hostinger, no de
   nuestra config.

**Arreglo que funcionó (con acceso SSH, que este plan sí tiene):**

```bash
ssh -p 65002 <usuario>@<ip>   # datos en hPanel → Avanzado → Acceso SSH
cd domains/gestion.vidasolidariamdp.com/hbuilds/current/nodejs
/opt/alt/alt-nodejs20/root/usr/bin/npm install --omit=dev
touch tmp/restart.txt   # Passenger relee la app en el próximo request
```

**Importante — esto hay que repetirlo después de CADA deploy nuevo**, porque
cada push crea una carpeta de versión nueva bajo `hbuilds/versions/<id>/` sin
`node_modules`, y `hbuilds/current` apunta a la última. Por ahora lo hacemos
a mano por SSH después de cada push a `apps/web` (Claude lo hace como parte
del deploy, no hace falta que Josecito lo recuerde). Si esto se vuelve
tedioso, la alternativa es armar un cronjob simple en el servidor que revise
`hbuilds/current/nodejs/node_modules` y lo instale solo si falta — pendiente
de evaluar si vale la pena.

**Necesario en `next.config.mjs`**: `output: "standalone"` (ya está en el
repo). **Necesario en el `package.json` raíz y de cada app**: campo
`"packageManager"` explícito (ya está) — sin esto, el selector de pnpm de
Hostinger intenta bajar una versión de pnpm que no tiene cacheada y rompe el
install; con `npm` como gestor de paquetes no pasa esto.


## Actualización real 2 (post-intento con la API): mismo patrón, con dos matices nuevos

Desplegar `vida-solidaria-api` (preset **Fastify**) confirmó todo lo de
arriba y sumó dos cosas nuevas:

**1. El preset "Fastify" no corre NINGÚN paso de build.** A diferencia de
"Next.js" (que sí ejecuta `build` siempre, aunque ignore cuál elijas), el
modal de "Configuración de compilación y salida" para Fastify solo tiene dos
campos (`Gestor de paquetes` y `Archivo de entrada`) — ni build command ni
directorio de salida. Como nuestro backend es TypeScript (`tsc` deja el
código en `dist/`), sin un paso de build el `Archivo de entrada` que
apuntara directo a `dist/server.js` nunca existía y el deploy fallaba
("Falló la compilación", sin ningún error real en el log — el `npm install`
terminaba bien y ahí se cortaba todo).

**2. Una vez creada la app, el asistente no tiene forma de editar preset,
comando de build ni archivo de entrada** — la única forma de cambiarlos es
repetir el flujo de "elegir repo" desde el panel de esa misma app (no hace
falta borrar el sitio ni crear uno nuevo, pero sí volver a cargar todo:
directorio root, preset, variables de entorno, etc.).

**El arreglo, para no depender nunca más de tocar esa config**: se agregó
`apps/api/server.js`, un archivo JS plano (sin compilar) que Hostinger
siempre puede ejecutar tal cual, y que hace de puente:

```js
// apps/api/server.js
require('./dist/server.js');
```

`Archivo de entrada` queda fijo en `server.js` (el valor por defecto) para
siempre — nunca más hace falta tocarlo. Después de cada deploy, por SSH:

```bash
ssh -p 65002 <usuario>@<ip>
cd domains/api.vidasolidariamdp.com/hbuilds/current/nodejs
export PATH=/opt/alt/alt-nodejs20/root/usr/bin:$PATH

npm install                         # trae devDependencies (typescript, prisma, tsx)
chmod +x node_modules/.bin/* node_modules/@prisma/engines/*   # Hostinger los deja sin +x
npx prisma generate
npx tsc -p tsconfig.json            # genera dist/server.js
npx prisma migrate deploy           # aplica migraciones contra Supabase
npx tsx prisma/seed.ts              # crea roles/permisos + Admin General (idempotente)

touch tmp/restart.txt
```

**3. Las variables de entorno cargadas desde el asistente de Hostinger NO se
actualizan solas si las editás a mano.** El archivo real que Hostinger llena
en cada deploy es `hbuilds/config/.env` — pero un proceso ya desplegado no
lo relee al hacer `touch tmp/restart.txt`; hace falta copiarlo manualmente
adentro de la carpeta de la app:

```bash
cp domains/api.vidasolidariamdp.com/hbuilds/config/.env \
   domains/api.vidasolidariamdp.com/hbuilds/current/nodejs/.env
touch domains/api.vidasolidariamdp.com/hbuilds/current/nodejs/tmp/restart.txt
```

Esto importa sobre todo para `DATABASE_URL`: Hostinger conecta Supabase y
agrega `SUPABASE_URL`/`SUPABASE_API_KEY` (para el cliente JS de Supabase,
que acá no usamos), pero **no agrega `DATABASE_URL`** — hay que armarla a
mano con el **Session pooler** de Supabase (no el Transaction pooler: este
es un proceso Node persistente, no funciones serverless, así que el Session
pooler —puerto 5432— es el correcto y no necesita el parámetro
`?pgbouncer=true`):

```
DATABASE_URL='postgresql://postgres.<project-ref>:<db-password>@aws-0-<region>.pooler.supabase.com:5432/postgres'
```

Se consigue en Supabase → botón **Connect** (arriba a la derecha del
dashboard) → pestaña **Session pooler**.

## Estado real final

- `vida-solidaria-web` → https://gestion.vidasolidariamdp.com ✅
- `vida-solidaria-api` → https://api.vidasolidariamdp.com ✅ (Fastify + Prisma + Supabase Postgres, migración inicial aplicada, Admin General sembrado, login probado end-to-end con `curl`)
- Supabase: proyecto `vida-solidaria-production`, organización `nuevogenfilms2025` (separada de RedVivo), región São Paulo (`sa-east-1`)


## Importante: la "Implementación automática" redespliega con CUALQUIER push

Por defecto, las dos Node.js Apps de Hostinger tienen activado el redeploy
automático en cada push a `main` — **sin importar qué carpeta tocó el
commit** (un cambio solo en `DEPLOY.md`/`CLAUDE.md` también dispara un
redeploy de las dos apps). Como cada redeploy nuevo arranca de una carpeta
`versions/<id>/` limpia (sin `node_modules`, sin `dist/`, con el `server.js`
del repo tal cual), **pisa todos los arreglos manuales de SSH** de esta
guía.

Por eso se desactivó **"Implementación automática"** en el panel de las dos
apps (fila de indicadores arriba del todo, junto a SSL/CDN/Malware
protegido). Con esto desactivado, un push a GitHub **no actualiza nada
solo** — ni siquiera `hbuilds/last-source` (esto se confirmó al desplegar
el Módulo 2: después del `git push`, `last-source` seguía con el commit
viejo hasta que se apretó "Redeploy" a mano). Hay que apretar
**"Redeploy"** en el panel de la app correspondiente cada vez que haya un
cambio real en `apps/api` o `apps/web`, y después repetir el fix de SSH
(instalar `node_modules`, compilar, copiar `.env`, apuntar `server.js` a
`dist/server.js`) — ver las secciones de arriba. El orden entre las dos
apps no importa, son independientes.

## Módulo 2 (Gestión de Proyectos): deploy y un incidente de límite de procesos

Se agregaron rutas nuevas a `vida-solidaria-api`
(`/api/projects`, `/api/tasks`, `/api/dashboard/summary`, `/api/users/basic`)
y páginas nuevas a `vida-solidaria-web` (`/proyectos`, `/proyectos/[id]`).
No hizo falta migración de Prisma nueva — las tablas ya existían desde el
milestone 1, solo se agregaron relaciones que faltaban en `schema.prisma`.
El deploy siguió el proceso ya documentado arriba (Redeploy manual en el
panel + fix de SSH en cada app) sin sorpresas nuevas, con una excepción:

**Incidente: límite de procesos (LVE/CloudLinux) agotado por un script
colgado.** Al intentar borrar un proyecto de prueba directo en la base con
un script de Node (`node script.js` corrido por SSH) sin exportar
`DATABASE_URL` en el shell, Prisma se quedó intentando conectar a Postgres
en `localhost` (que no existe) y el proceso nunca terminó — ni siquiera al
cortarse la sesión SSH desde el lado cliente por timeout, porque el proceso
en el servidor quedó huérfano corriendo igual. Esto agotó el límite de 120
procesos simultáneos de la cuenta (LVE), y desde ahí **cualquier comando
SSH nuevo fallaba con `exec request failed on channel 0`** — la
autenticación funcionaba (la clave era válida) pero el servidor rechazaba
ejecutar nada nuevo. No aparecía ninguna alerta visible en hPanel.

Se resolvió pidiéndole al chat de soporte de Hostinger (con IA) que
revisara el uso de procesos de la cuenta — confirmaron el límite en 120/120
y lo ampliaron a 400 como refuerzo temporal. Con eso liberado, se pudo
volver a entrar por SSH, matar el proceso huérfano (`ps -u <usuario> -o
pid,etime,cmd --sort=-pcpu` para encontrarlo por tiempo corriendo, después
`kill -9`) y terminar el deploy normalmente.

**Lección para la próxima vez que haga falta un script puntual (no la app)
contra la base por SSH:** siempre exportar `DATABASE_URL` explícitamente
antes (`export $(grep DATABASE_URL hbuilds/config/.env)` o cargarlo con
`require('dotenv').config()` en el script) y correrlo con `timeout <segundos>
node script.js` para que nunca quede colgado indefinidamente si algo de red
falla.

## Incidente (19-20 sep 2026): el sitio quedó caído toda la noche — watchdog por cron

"Implementación automática" volvió a estar activa en algún momento (no se
sabe cuándo se reactivó) y confirmó, otra vez, que dispara con CUALQUIER
push a `main` — incluso uno que solo toca `CLAUDE.md`. Cada redeploy nuevo
pisa el arreglo manual de `node_modules`/`.env` de la sección de arriba, y
si nadie entra por SSH a repararlo a mano, la web queda con `503`/`Cannot
find module 'next'` indefinidamente. Así quedó desde ~16:19 UTC del 19/9
hasta que Josecito mandó una captura de pantalla del error al otro día.

**Arreglo aplicado**: se armó un script watchdog en
`/home/u859384027/scripts/watchdog-deploy.sh` que revisa `vida-solidaria-web`
y `vida-solidaria-api` y, si detecta `node_modules`/`.env`/`dist/server.js`
faltante (la firma exacta de este bug), reaplica el fix completo de SSH
solo (incluye `prisma migrate deploy` para la API, que es idempotente).
Tiene lock con `flock` para no pisarse si el cron dispara mientras una
corrida anterior sigue instalando.

**Falta un paso manual, que solo se puede hacer desde hPanel**: no hay
`crontab` disponible por SSH en este plan de hosting (CageFS lo bloquea) —
el cron hay que darlo de alta desde hPanel → **Avanzado → Cron Jobs**,
apuntando a:

```
/home/u859384027/scripts/watchdog-deploy.sh
```

con una frecuencia de cada 5 minutos (`*/5 * * * *`). Alternativa más
simple si Josecito prefiere no tener el watchdog corriendo todo el tiempo:
apagar **"Implementación automática"** en el panel de las dos Node.js Apps
(fila de indicadores arriba del todo) — con eso, un push a GitHub no
dispara nada solo, y el deploy vuelve a depender de apretar "Redeploy" a
mano (momento en el que Claude ya sabe aplicar el fix de SSH en el mismo
turno). Cualquiera de las dos opciones alcanza; no hace falta hacer ambas.

## Incidente (20 sep 2026): `next build` no corre en el servidor — LVE bloquea CUALQUIER proceso nuevo durante el build

**Síntoma**: al desplegar la Fase H (Usuarios) y la Fase I (Equipos y
Secciones), el auto-deploy de Hostinger no se disparó solo después de un
push (esperado ~12-15 minutos, sin actividad — puede seguir así, no se
confirmó si quedó deshabilitado o solo es lento; ver la sección de arriba
sobre el cron/auto-deploy). Al intentar el fix manual de siempre (`npm
install` + build) directamente por SSH en `hbuilds/last-source`, el
`npm run build:hostinger` moría siempre en el mismo punto:

```
Collecting page data ...
Generating static pages (0/N) ...
uncaughtException [Error: spawn /opt/alt/alt-nodejs20/root/usr/bin/node EAGAIN]
```

(a veces acompañado de `node[PID]: pthread_create: Resource temporarily
unavailable`).

**Diagnóstico**: Next.js arma un worker aparte (un proceso `node` nuevo,
vía `child_process.spawn`) para la fase de "Generating static pages",
incluso con una sola página. El plan de hosting tiene un límite LVE de
procesos/hilos tan ajustado que ese ÚNICO spawn adicional falla siempre,
sin importar cuánto se le baje el paralelismo al build. Se probó, en
orden, y ninguno alcanzó por sí solo:
- `experimental.cpus: 1` en `next.config.mjs` (sigue intentando spawnear
  igual, aunque sea "1 worker")
- `experimental.workerThreads: true` (cambia el spawn de proceso por un
  `pthread_create` — mismo límite, error distinto, y encima rompe el
  build con `DataCloneError` porque el paso de análisis estático incluye
  una función que no se puede clonar por `postMessage`)
- `RAYON_NUM_THREADS=1` / `UV_THREADPOOL_SIZE=1` / `NODE_OPTIONS=--v8-pool-size=1`
- Frenar el proceso Node de la web en vivo antes de buildear (por si el
  límite era de la cuenta en conjunto, no del build en sí) — mismo error

**Lo que sí funciona — dos partes, las dos necesarias**:

1. **`export const dynamic = "force-dynamic"`** en `apps/web/app/layout.tsx`.
   Todas las pantallas de esta app son `"use client"` y traen sus datos
   por `fetch` en el navegador — no hay ninguna ganancia real en
   pre-renderizar HTML estático en build time. Esto reduce lo que Next
   tiene que exportar estáticamente al mínimo indispensable (las páginas
   internas de error de Next, que no heredan el `dynamic` de las rutas de
   la app), pero **no alcanza solo** — Next igual intenta spawnear un
   worker para esas 1-2 páginas restantes y sigue fallando en este hosting.

2. **Buildear en otro lado y transferir el resultado ya armado.** La
   causa real es el límite de procesos del hosting, no algo del código —
   así que la solución que terminó funcionando es no correr `next build`
   ahí en absoluto:
   - Copiar `apps/web/` a una carpeta plana SIN el monorepo arriba (sin
     `pnpm-lock.yaml` de la raíz visible), para que Next no la trate como
     parte de un workspace y el `output: "standalone"` quede con
     `server.js` en la raíz (si se buildea adentro del monorepo, Next
     detecta el workspace y anida todo bajo `.next/standalone/apps/web/`,
     que no es la estructura que espera Hostinger).
   - `npm install` + `npm run build:hostinger` en esa copia, en un
     entorno sin el límite de procesos (funcionó perfecto en el sandbox
     de Claude).
   - Empaquetar `.next/standalone/` (que ya incluye `public/` y
     `.next/static/` copiados por el propio script `build:hostinger`) en
     un `.tar.gz`.
   - Subirlo al servidor (por `scp`), extraerlo en una carpeta nueva bajo
     `hbuilds/versions/<algo-unico>/nodejs/`, copiarle el `.env` real
     desde la versión actual, crear `tmp/restart.txt`, y recién ahí
     cambiar el symlink `hbuilds/current` para que apunte a esa carpeta
     nueva (así el sitio no queda nunca a medio armar mientras se arma la
     versión nueva al lado).
   - `touch hbuilds/current/nodejs/tmp/restart.txt` para reiniciar.

**Para la próxima vez que haya que tocar el frontend** (hasta que se
resuelva el límite de procesos del hosting, o se decida migrar de plan):
NO intentar `npm run build:hostinger` directo por SSH — va a fallar
siempre en el mismo punto. Repetir el procedimiento de "buildear afuera y
transferir" de arriba. La API sí se puede seguir arreglando con el
`npm install` + `npx tsc` de siempre por SSH sin problema (no vimos este
error ahí — el build de TypeScript no arma workers como `next build`).

**Esto también es relevante para el watchdog** (`watchdog-deploy.sh`) y
para el auto-deploy de Hostinger si algún día vuelve a andar solo: si el
pipeline propio de Hostinger corre `next build` con el mismo límite de
cuenta, va a fallar de la misma manera — el `force-dynamic` del paso 1
puede ser suficiente para que a ELLOS les funcione (tienen más margen de
recursos en su propio pipeline de build, probablemente corre en otra
máquina), pero si el auto-deploy vuelve a fallar específicamente en el
build (no en el `npm install`/`.env` de siempre), este es el motivo y el
watchdog actual no lo cubre — quedaría pendiente adaptarlo.
