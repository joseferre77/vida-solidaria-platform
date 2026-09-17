# ARCHITECTURE.md — Plataforma de Gestión Vida Solidaria

> Documento vivo. Es la fuente de verdad técnica del proyecto. Cualquier decisión de
> arquitectura que cambie durante el desarrollo se actualiza acá primero.
> Versión: 0.2 — Módulo 1 (Core & Seguridad) implementado y probado.
> Infraestructura corregida tras confirmar que el hosting es compartido/
> Business (no VPS) — ver §1 y [`DEPLOY.md`](./DEPLOY.md).
> Ver también: [`CLAUDE.md`](./CLAUDE.md) para estado actual y próximos pasos.

## 0. Objetivo del sistema

Plataforma interna de gestión para la ONG **Vida Solidaria MDP** que unifica:
voluntariado y coordinación (RBAC), gestión de proyectos, un CRM social para
personas en situación de calle ("Casos"), logística/stock/cocina, operaciones
de campo en tiempo real, finanzas/donaciones con trazabilidad pública, y
analítica/KPIs por rol. Mobile-first estricto (PWA instalable + empaquetado
APK), pensado para usarse desde la calle con conectividad intermitente.

---

## 1. Decisiones de stack

| Capa | Elección | Por qué |
|---|---|---|
| Backend | **Node.js 20 LTS + TypeScript + Fastify** | Fastify da mejor rendimiento y validación de esquema (JSON Schema/Zod) nativa que Express; TS por seguridad de tipos en un dominio con muchos módulos. |
| ORM / DB | **Prisma + PostgreSQL + PostGIS, alojado en Supabase** | Postgres soporta todo el modelo relacional + JSONB para campos flexibles. PostGIS habilita geolocalización recurrente y consultas por zona real. Prisma da migraciones versionadas y tipos compartidos. El plan de Hostinger contratado (compartido/Business) **no ofrece Postgres** ("requiere más recursos y permisos que no están disponibles en los planes Web y Cloud hosting" — doc. oficial), así que la base vive en Supabase, conectado a la Node.js App con el botón nativo de hPanel (Essentials → Database → Connect → Supabase). El schema no cambia una línea por esto. |
| Cache / Realtime pub-sub | **Redis — diferido, no en Módulo 1** | Mismo motivo que Postgres: el hosting compartido/Business tampoco ofrece Redis. Nada de lo implementado hoy lo necesita (`REDIS_URL` es opcional en `env.ts`, `lib/redis.ts` no rompe si falta). Se vuelve necesario recién si Socket.IO (Módulo 5) tiene que escalar a más de una instancia — ahí se evalúa un Redis externo tipo Upstash, o pasar a VPS. |
| Realtime | **Socket.IO** (sobre el mismo servidor Fastify) | Check-ins "en camino / llegamos / entregando / relevando" y actualizaciones de tablero deben verse en vivo sin polling. En una sola instancia (lo normal en este hosting) no necesita Redis como backplane. |
| Autenticación | **JWT (access + refresh) propio + Passport (Google OAuth2)** | Directiva pide login nativo + Google. JWT con refresh rotation da sesiones persistentes seguras sin depender de un proveedor externo de auth. |
| Frontend | **Next.js (App Router) + TypeScript + Tailwind + shadcn/ui** | PWA-first: `next-pwa`/Serwist para service worker + manifest instalable. La estructura de componentes reutiliza el vocabulario visual de RedVivo (shadcn/ui) sin copiar su código de negocio. |
| Empaquetado móvil | **Capacitor** sobre el build de Next (export estático de las vistas de campo) | Permite generar el `.apk` pedido reutilizando el mismo código PWA, sin mantener una app nativa aparte. |
| Almacenamiento de archivos | **Filesystem local `/uploads`** por ahora, detrás de una interfaz `StorageAdapter` | El hosting compartido/Business no da un bucket tipo S3 propio; se empieza simple y se migra a un storage externo (Supabase Storage, S3/MinIO) sin tocar el dominio de negocio cuando haga falta. |
| Infraestructura | **Hostinger — hosting compartido/Business, "Node.js App" gestionada** (confirmado con Josecito) | Dos Node.js Apps separadas en hPanel (`vida-solidaria-api` y `vida-solidaria-web`), cada una en su subdominio, conectadas por GitHub para deploy automático en cada push. Sin acceso root/Nginx/PM2 propio — eso lo gestiona la plataforma. Detalle completo, con fuentes oficiales, en `DEPLOY.md`. Los artefactos para un eventual VPS futuro (Nginx, PM2, script de setup) quedan guardados en `deploy/vps-appendix/` pero no aplican hoy. |
| CI/CD | **El propio Git-deploy de Hostinger** (push a `main` → build + deploy automático en hPanel) | No hace falta GitHub Actions con SSH para esto — es justamente lo que evita tener que compartir credenciales de servidor. GitHub Actions se usa solo como CI liviano (type-check + build, sin deploy) en `.github/workflows/ci.yml`, para no romper nada antes de que Hostinger lo despliegue. |
| Monorepo | **pnpm workspaces + Turborepo** (opcional a partir de Módulo 2) | Mismo gestor que ya usa RedVivo (`pnpm-lock.yaml`), consistencia de tooling. Ojo: no está confirmado si Hostinger soporta apuntar una Node.js App a una subcarpeta de un monorepo — ver "Opción A / B" en `DEPLOY.md`. |

### Patrones que se reutilizan (con criterio) de RedVivo

No se clona código, pero se rescatan **ideas arquitectónicas** ya probadas en tu propio SaaS:

- **Patrón adapter** (`lib/adapters/*` en RedVivo) → acá se traduce en un **registro de módulos por rol**: cada rol ve una navegación y un set de permisos distintos, definidos declarativamente en un solo lugar (`apps/api/src/modules/rbac/role-registry.ts`, a implementarse en Módulo 1) en vez de si/no repartidos por la UI.
- **Ledger de movimientos** (`cash_movements`: ingreso/egreso con saldo derivado) → se reutiliza tal cual como patrón para `stock_movements` (insumos) y `fund_transactions` (plata), en vez de guardar un "stock actual" mutable.
- **Contador atómico por tenant** (`next_ticket_number`) → mismo patrón para numerar Casos (`next_case_number`) y remitos de acopio.
- **RLS por tenant** (Supabase) → como acá NO hay multi-tenant SaaS sino una sola organización, se reemplaza por **middleware de autorización por rol + scope de proyecto/zona** en la capa de aplicación (Fastify `preHandler` hooks), documentado en la sección RBAC.

---

## 2. Arquitectura de alto nivel

```
Hostinger hPanel — dos Node.js Apps (gestionadas por la plataforma)
┌─────────────────────────┐  HTTPS   ┌───────────────────────────┐
│ vida-solidaria-web       │◄────────►│ vida-solidaria-api         │
│ app.TU_DOMINIO (Next.js) │          │ api.TU_DOMINIO (Fastify)   │
│ PWA + Capacitor APK      │          │ REST + WebSocket (io)      │
└─────────┬─────────────────┘          └───────────┬────────────────┘
          │  Service Worker                         │
          │  (offline check-in queue)                │
          ▼                                          ▼
   Cache local (IndexedDB)                  ┌─────────────────────┐
   para reintentar check-ins                │  Supabase (externo)  │
   sin señal en la calle                    │  Postgres + PostGIS  │
                                             └─────────────────────┘
                                                        ▲
                                                        │
                                             ┌─────────────────────┐
                                             │ /uploads (fs local)  │  → StorageAdapter → (futuro: Supabase Storage / S3)
                                             └─────────────────────┘

Externos:  Google OAuth  ·  Webhooks del sitio público (leads)  ·  Supabase (DB gestionada)

(Redis queda fuera del diagrama a propósito: diferido — ver §1)
```

---

## 3. Modelo de roles (RBAC) — base para el esquema

Roles globales (jerárquicos, de mayor a menor alcance):

1. `admin_general` — acceso total, gestión de usuarios y roles.
2. `direccion_general` — visión completa de analítica y finanzas, sin gestión de usuarios.
3. `direccion_proyectos` — gestión total de Proyectos (todos).
4. `coordinacion_logistica` — módulo Logística/Stock/Cocina.
5. `coordinacion_comercial` — módulo Finanzas/Donaciones + leads.
6. `coordinacion_recepcion` — alta y triage inicial de Casos.
7. `coordinacion_extraccion` — operaciones de campo (equipos, zonas).
8. `coordinador_relevamiento` — releva y actualiza Casos en calle.
9. `voluntario` — check-ins de campo, tareas asignadas, sin acceso administrativo.

Además, **roles por proyecto** (independientes del rol global, igual que pediste):
`creador`, `editor`, `visor`, `admin` — se resuelven en `project_members`, y el
middleware de autorización siempre chequea primero el rol global y después,
si aplica, el rol de proyecto (el más restrictivo gana).

---

## 4. Esquema relacional completo

> Convención: toda tabla de negocio tiene `id UUID`, `created_at`, `updated_at`,
> y donde aplica `created_by` / `updated_by` (referencia a `users.id`) para
> cumplir el requisito de "usuario que actualiza" en Casos y Stock.
> Ver `apps/api/prisma/schema.prisma` para la versión ejecutable de este modelo.

### 4.1 Core & Seguridad (Módulo 1)

- **users** — `id, email, password_hash NULL, google_id NULL, name, phone, avatar_url, status(active|suspended), created_at`
- **roles** — catálogo fijo de los 9 roles globales de la sección 3 (`slug`, `label`, `rank`)
- **user_roles** — `user_id, role_id` (un usuario puede tener más de un rol, ej. coordinador + voluntario)
- **permissions** — catálogo granular (`slug`: `cases.write`, `finance.read`, `projects.admin`, etc.)
- **role_permissions** — matriz rol↔permiso (seed inicial, editable desde admin)
- **refresh_tokens** — `id, user_id, token_hash, expires_at, revoked_at, user_agent, ip` (sesiones persistentes + logout remoto)
- **audit_log** — tabla transversal: `id, user_id, entity_type, entity_id, action, diff JSONB, created_at` — cubre "usuario que actualiza" en cualquier módulo sin repetir la columna en cada tabla.

### 4.2 Gestión de Proyectos

- **projects** — `id, name, description, status(planning|active|paused|done), owner_id, area TEXT` (ej. "Cocina comunitaria", "Frazadas de invierno")
- **project_members** — `project_id, user_id, project_role(creador|editor|visor|admin)`
- **boards** — `id, project_id, name` (un proyecto puede tener más de un tablero)
- **board_columns** — `id, board_id, name, sort_order` (ej. Backlog/En curso/Bloqueado/Hecho)
- **tasks** — `id, board_column_id, title, description, priority(baja|media|alta), due_date, created_by`
- **task_assignees** — `task_id, user_id`
- **task_comments** — `id, task_id, user_id, body, created_at`
- **task_attachments** — `id, task_id, file_url, uploaded_by`

### 4.3 CRM Social — Módulo "Casos"

- **cases** — ficha principal de la persona:
  `id, case_number (autogenerado, patrón next_ticket_number), full_name, alias, approx_age, main_photo_url, health_status TEXT, current_sleep_spot TEXT, status(activo|en_seguimiento|derivado|cerrado), created_by, updated_by`
- **case_contacts_history** — historial de contactos/relevamientos: `id, case_id, user_id, notes, contacted_at, mood_observed TEXT`
- **case_locations** — geolocalización recurrente (serie temporal, no un solo punto): `id, case_id, lat, lng, recorded_at, recorded_by` (PostGIS `geography(Point)`)
- **case_photos** — galería además de la foto principal: `id, case_id, url, taken_at, uploaded_by`
- **case_skills** — formación/habilidades: `id, case_id, skill_label, level TEXT`
- **case_needs** — matriz de necesidades: `id, case_id, category(salud|documentacion|abrigo|alimentacion|vivienda|laboral|otro), urgency(inmediata|urgente|normal), notes, resolved_at NULL`
- **case_status_history** — auditoría de cambios de estado del caso (para reportes de "casos abiertos/cerrados")

### 4.4 Logística, Inventario y Stock

- **donors_in_kind** — origen de una donación en especie: `id, name, contact, type(individuo|empresa)`
- **donation_intakes** — acopio: `id, donor_id, received_by (recolector), item_description, quantity, unit, received_at, destination_note`
- **stock_items** — catálogo de insumos (maestro, sin cantidad — la cantidad se deriva del ledger): `id, name, unit, category, min_stock_alert`
- **stock_movements** — ledger de entradas/salidas (mismo patrón que `cash_movements` de RedVivo): `id, stock_item_id, type(ingreso|egreso), quantity, reason, related_entity_type NULL, related_entity_id NULL, created_by, created_at`
- **kitchen_batches** — "flujo de cocina": `id, name (ej. "Vianda lunes mediodía"), target_servings, status(preparacion|coccion|listo_transporte|entregado), created_by`
- **kitchen_batch_ingredients** — `batch_id, stock_item_id, quantity_assigned` → al confirmarse, genera un `stock_movement` tipo `egreso` automático
- **kitchen_batch_assignees** — voluntarios asignados a un batch (ollas, corte de verdura, etc.): `batch_id, user_id, task_label`
- **kitchen_batch_status_history** — auditoría de cambios de estado

### 4.5 Operaciones de Campo (tiempo real)

- **field_teams** — `id, name, vehicle_label`
- **field_team_members** — `team_id, user_id`
- **zones** — `id, name, polygon` (PostGIS `geography(Polygon)`) — zona geográfica de reparto/relevamiento
- **zone_assignments** — rotación semanal: `id, zone_id, team_id, week_start_date, week_end_date`
- **checkins** — `id, user_id, team_id NULL, type(en_camino|llegamos|entregando_viandas|relevando_caso), case_id NULL, kitchen_batch_id NULL, lat, lng, created_at` — el tipo de check-in determina si se linkea a un caso, a un batch de cocina, o a ninguno
- **field_deliveries** — conteo de viandas/insumos entregados en el check-in: `checkin_id, item_label, quantity`

> Los check-ins se emiten también por Socket.IO al confirmarse (no solo se
> persisten), para que los dashboards de coordinación se actualicen en vivo.
> El frontend encola el check-in en IndexedDB si no hay señal y reintenta el
> POST cuando vuelve la conexión (requisito mobile-first "uso en calle").

### 4.6 Finanzas y Donaciones (transparencia)

- **leads** — capturados por webhook desde la web pública: `id, type(donante|empresa|voluntario), name, email, phone, source, payload JSONB, created_at, converted_to_user_id NULL`
- **donors_monetary** — donante recurrente ya calificado: `id, name, email, phone, is_company`
- **fund_transactions** — ledger único de fondos (mismo patrón ledger): `id, type(ingreso|egreso), method(transferencia|efectivo), amount, currency, donor_id NULL, origin_note, destination_project_id NULL, executed_by, occurred_at`
- **financial_reports** — snapshots generados: `id, period_start, period_end, totals JSONB, generated_by, generated_at, public_url` (el "motor de reportes públicos con un clic" genera esta fila + un PDF/HTML servido en `public_url`)

### 4.7 Analítica y Reporting

No requiere tablas propias en la v1: se resuelve con **vistas SQL** sobre las
tablas anteriores (`cases_kpi_view`, `stock_kpi_view`, `finance_kpi_view`,
`field_ops_kpi_view`), materializadas si el volumen lo justifica más adelante.
`audit_log` + `case_status_history` alimentan "casos abiertos/cerrados";
`stock_movements` alimenta "volumen de alimentos"; `fund_transactions`
alimenta "métricas financieras"; `checkins` alimenta "rendimiento operativo".

---

## 5. Dependencias Node.js

### `apps/api` (backend)

```
fastify, @fastify/cors, @fastify/cookie, @fastify/multipart, @fastify/websocket
@prisma/client, prisma
zod, fastify-type-provider-zod
jsonwebtoken, bcryptjs (o argon2), passport, passport-google-oauth20
socket.io, ioredis   (ioredis solo se conecta si REDIS_URL está definido — ver §1)
pino, pino-pretty
dotenv
vitest, supertest        (dev)
typescript, tsx, @types/node   (dev)
```

### `apps/web` (frontend)

```
next, react, react-dom
tailwindcss, @tailwindcss/postcss
shadcn/ui (radix-ui primitives, class-variance-authority, tailwind-merge, lucide-react)
@tanstack/react-query        (server-state + reintentos offline)
socket.io-client
next-pwa (o @serwist/next)
react-hook-form, zod, @hookform/resolvers
recharts                      (dashboards KPI)
date-fns
typescript                    (dev)
@capacitor/core, @capacitor/android   (empaquetado APK, se agrega al llegar a esa fase)
```

### Raíz del monorepo

```
turbo (opcional, a partir de Módulo 2), prettier, eslint, husky + lint-staged
```

---

## 6. Identidad de marca aplicada

Se reutiliza la identidad ya generada para Vida Solidaria MDP (isotipo corazón +
ola + slogan) como base visual del sistema. Tokens extraídos y versionados en
`apps/web/public/brand/brand-tokens.json` y aplicados en `tailwind.config` de
`apps/web` (ver Módulo 2). Aún no existe un manual de marca formal completo —
si lo necesitás para otros materiales (papelería, redes), lo armamos como
entregable aparte cuando quieras.

| Token | Valor |
|---|---|
| `--purple-deep` | `#3a0a5c` |
| `--purple` | `#7c1fb0` |
| `--magenta` | `#c026d3` |
| `--yellow` | `#ffd400` |
| `--orange` | `#ff8a00` |
| `--navy` (ola) | `#123a7a` |
| `--cream` | `#fff8ec` |
| Slogan | "Tu esfuerzo, nuestro motor" |
| Tipografía display | Baloo 2 (700/800) |
| Tipografía texto | Poppins |

---

## 7. Roadmap de módulos (orden de implementación)

1. **Core & Seguridad** — auth nativo + Google OAuth, RBAC, sesiones. ⏸️ *pendiente tu confirmación*
2. Gestión de Proyectos
3. CRM Social (Casos)
4. Logística, Inventario y Stock
5. Operaciones de Campo (tiempo real)
6. Finanzas y Donaciones
7. Analítica y Reporting

Cada módulo se entrega como milestone independiente (ZIP + changelog en
`CLAUDE.md`), nunca todo junto.
