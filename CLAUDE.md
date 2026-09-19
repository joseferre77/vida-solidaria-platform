# CLAUDE.md — Índice de estado (fuente de verdad para retomar sin releer todo)

> Este archivo se actualiza en cada milestone. Para retomar el proyecto en una
> sesión nueva: leer esto primero, después `ARCHITECTURE.md` si hace falta
> detalle de esquema/stack. No hace falta releer la conversación completa.

## Qué es esto

Plataforma de gestión integral para **Vida Solidaria MDP** (ONG de Josecito):
voluntarios, coordinadores, proyectos, casos sociales (personas en situación
de calle), logística/stock/cocina, operaciones de campo en tiempo real,
finanzas/donaciones con transparencia pública, y analítica por rol.

Se diseñó reutilizando **patrones** (no código) del SaaS propio de Josecito,
**RedVivo** (`/home/claude/redvivo/redvivo-main` en este entorno de trabajo):
patrón adapter → registro de módulos por rol; ledger de movimientos →
`stock_movements`/`fund_transactions`; contador atómico → numeración de
casos. Detalle completo en `ARCHITECTURE.md` §1.

## Estado actual (Milestone 1 — Core & Seguridad, verificado end-to-end)

- [x] `ARCHITECTURE.md` — stack completo, diagrama, esquema relacional de los
      7 módulos, dependencias Node, roadmap.
- [x] `apps/api/prisma/schema.prisma` + migración inicial real
      (`prisma/migrations/20260917001307_init`) — probada con
      `prisma migrate deploy` contra Postgres+PostGIS limpio.
- [x] Estructura de monorepo (`apps/api`, `apps/web`, `packages/*`).
- [x] Identidad de marca aplicada (logo, íconos PWA, tokens, manifest).
- [x] **Módulo 1 — Core & Seguridad implementado y probado de punta a punta**
      contra Postgres+Redis reales (no solo compilado, corrido):
      - Login nativo (email+password, bcrypt), JWT access token (15m) +
        refresh token opaco con rotación y detección de reuso
        (`apps/api/src/modules/auth/*`).
      - RBAC: 9 roles globales + catálogo de permisos + middleware
        `requireAuth`/`requirePermission`/`requireRole`
        (`apps/api/src/modules/rbac/permissions.ts`,
        `apps/api/src/middleware/auth.middleware.ts`).
      - Seed (`apps/api/prisma/seed.ts`) que crea roles/permisos y el
        usuario Admin General maestro con contraseña aleatoria generada en
        el momento (nunca hardcodeada ni versionada).
      - Frontend: `/login`, `/dashboard` (nav filtrada por permiso vía
        `RoleGate`), middleware de Next que protege `/dashboard`.
      - Google OAuth: estrategia de Passport armada, pero el intercambio de
        `code` en el callback queda como TODO explícito — Passport está
        pensado para Express, no Fastify, y no lo iba a fingir "listo" sin
        poder probarlo contra credenciales reales de Google Cloud Console.
      - `pnpm exec tsc --noEmit` limpio en `api`; `next build` limpio en
        `web` (sin warnings).
- [x] **Confirmado por Josecito: el plan de Hostinger es hosting
      compartido/Business con "Node.js App"** (no VPS). Reescribí
      `DEPLOY.md` entero para ese hosting real, con fuentes oficiales de
      Hostinger citadas (no supuestos): sin Postgres/Redis nativos → DB en
      Supabase (Postgres+PostGIS, conectado con el botón nativo de hPanel);
      sin PM2/Nginx propio → dos Node.js Apps gestionadas por la
      plataforma; sin SSH para deploy → Hostinger redeploya solo en cada
      push a GitHub, `prisma migrate deploy` corre dentro del build
      command. Los artefactos de VPS (Nginx, PM2, script de setup, el
      workflow de deploy por SSH) quedaron movidos a
      `deploy/vps-appendix/` por si algún día migra — no aplican hoy.
      `.github/workflows/ci.yml` reemplaza al de deploy: solo build+type
      check, sin tocar el servidor.
      **Pendiente de Josecito**: si Hostinger soporta apuntar una Node.js
      App a una subcarpeta de un monorepo no está confirmado en su
      documentación — `DEPLOY.md` da dos caminos (probar con el monorepo, o
      separar `apps/api`/`apps/web` en dos repos si no anda).
- [x] **Repo en GitHub**: https://github.com/joseferre77/vida-solidaria-platform (pusheado desde la compu de Josecito vía el bridge de dispositivo, con una deploy key propia del repo — sin tokens/contraseñas manejados por Claude).
- [x] **`vida-solidaria-web` (frontend) desplegado y funcionando** en https://gestion.vidasolidariamdp.com — el asistente de hPanel de Hostinger tiene un bug real (no aplica el comando de compilación elegido, y no copia `node_modules` junto al server.js standalone de Next.js); se resolvió con acceso SSH (que este plan sí tiene, a diferencia de lo que se asumía). Detalle completo y el arreglo exacto en `DEPLOY.md` ("Actualización real"). Falta repetir el arreglo de node_modules después de cada deploy nuevo hasta que se automatice.
- [x] **`vida-solidaria-api` (backend) desplegado y funcionando** en https://api.vidasolidariamdp.com, conectado a Supabase (Postgres) — migración inicial aplicada, roles/permisos y Admin General sembrados, login probado end-to-end (`POST /api/auth/login` devuelve 200 con el usuario real). El preset "Fastify" de Hostinger no corre ningún build de TypeScript, así que se agregó `apps/api/server.js` como puente fijo (`require('./dist/server.js')`) para no depender nunca más de tocar "Archivo de entrada" en el panel (no se puede editar sin rehacer el alta de la app). Detalle completo, incluyendo el fix de permisos de `node_modules/.bin` y por qué `DATABASE_URL` hay que armarla a mano con el Session pooler de Supabase, en `DEPLOY.md` ("Actualización real 2").
- [x] **Módulo 2 — Gestión de Proyectos implementado, desplegado y
      probado end-to-end en producción.** Backend: `projects.service.ts` +
      `projects.routes.ts` (proyectos, tableros Kanban con columnas por
      defecto Backlog/En curso/Bloqueado/Hecho, tareas, asignaciones,
      comentarios) y `users.routes.ts` (endpoint mínimo `/users/basic` para
      pickers). No hizo falta migración nueva — las tablas ya existían desde
      `20260917001307_init`, solo faltaban relaciones de Prisma
      (`owner`, `boards`, `members`, `assignee`/`comment.user`) que se
      agregaron a `schema.prisma`. Frontend: `/proyectos` (listado con
      contadores) y `/proyectos/[id]` (tablero Kanban, tareas con
      prioridad/vencimiento/comentarios/asignados), dashboard con métricas
      reales (`getDashboardSummary`) en vez de tarjetas estáticas,
      `middleware.ts` protegiendo también `/proyectos`. Verificado
      creando un proyecto real vía API (se generó su tablero y columnas
      automáticamente) y confirmando `/api/dashboard/summary`,
      `/api/projects`, `/api/users/basic` en producción. RBAC ya estaba
      definido desde Milestone 1 (`projects.read/write/admin`).
- [x] **Módulo 2 — extendido con el resto del esquema de gestión de
      proyectos** (hitos, procesos/tableros por etapa, gastos, notas,
      recordatorios, configuración por proyecto, adjuntos, checklist y
      dependencias de tareas, hoja de tiempo, campos personalizados,
      encuestas) — migración `20260919121958_proyectos_ui_extensions`
      aplicada en producción sin backfill (todo nullable/tablas nuevas).
- [x] **Autorización por proyecto (`project-access.ts`)**: hasta acá
      `projects.read/write/admin` (permiso GLOBAL) eran los únicos
      guardianes de las rutas de Proyectos, y ningún rol operativo
      (voluntario, coordinación) lo tiene — así que un miembro agregado a
      un proyecto puntual (`ProjectMember.projectRole`) quedaba afuera de
      TODO el módulo. Se agregó una capa que concede acceso si se cumple
      el permiso global (dirección/admin, ven todo) O el rol de membresía
      en ESE proyecto (creador/editor/admin escriben, visor solo lee) — 79
      rutas migradas. Mismo bug espejado y corregido en el frontend
      (`/proyectos` dejó de exigir el permiso global para listar).
- [x] **Auditoría real (`AuditLog`)**: el widget de "actividad reciente" del
      dashboard existía desde Milestone 1 pero nada escribía en la tabla.
      Se agregó `logActivity()` (try/catch, nunca rompe la operación real)
      enganchado a las ~40 funciones que mutan datos de Proyectos.
      Verificado en producción (crear/borrar hito → aparece en el log).
- [x] **`/proyectos` rediseñada como tabla real** (código, título+área+
      etiquetas, casos, presupuesto, fechas, barra de progreso, prioridad,
      estado) en vez de tarjetas de 3 campos — refleja el esquema
      extendido. Modal de creación con prioridad/presupuesto/fechas.
- [x] **Subida real de archivos (`POST /api/uploads`)**: los adjuntos de
      Proyectos/Tareas solo aceptaban una URL ya alojada en otro lado.
      Ahora hay un endpoint multipart (whitelist de tipos, 20MB máx.,
      nombre aleatorio) servido de vuelta con `@fastify/static`. **Ojo**:
      en Hostinger `UPLOADS_DIR` tiene que ser una ruta ABSOLUTA fuera de
      `hbuilds/current` (cada redeploy clona a una carpeta de versión
      nueva) — ya configurada en el `.env` de producción apuntando a
      `hbuilds/uploads` (hermana de `current`/`versions`/`config`).
      Falta: UI de adjuntos en el frontend (el helper `uploadFile()` en
      `apps/web/lib/projects.ts` ya está listo, sin consumidor todavía).
- [ ] Nada de Módulo 3 en adelante todavía (Casos, Logística, Campo,
      Finanzas, Analítica). Tampoco hay UI para: hitos, procesos/tableros
      por etapa, gastos, notas, recordatorios, configuración de proyecto,
      campos personalizados/encuestas (todo el backend ya existe, ver
      arriba) — es el próximo tramo "visible" grande del Módulo 2.

## Roadmap completo (ver detalle en ARCHITECTURE.md §7)

1. Core & Seguridad ✅ *implementado, ver arriba — falta Google OAuth real*
2. Gestión de Proyectos ✅ *implementado y desplegado, ver arriba*
3. CRM Social (Casos)
4. Logística, Inventario y Stock
5. Operaciones de Campo (tiempo real)
6. Finanzas y Donaciones
7. Analítica y Reporting

## Decisiones ya tomadas (no volver a discutir salvo que cambie el contexto)

- Backend Node.js + Fastify + Prisma + PostgreSQL/PostGIS, base alojada en
  **Supabase** (el plan de Hostinger contratado —compartido/Business— no
  ofrece Postgres; ver DEPLOY.md). Auth sigue siendo propia (JWT), NO se usa
  Supabase Auth — Supabase acá es solo la base de datos.
- Redis diferido — no está disponible en ese hosting y nada del Módulo 1 lo
  necesita (`REDIS_URL` opcional).
- Auth propia (JWT) + Google OAuth vía Passport.
- Frontend Next.js App Router + Tailwind + shadcn/ui, PWA con Serwist,
  empaquetado APK con Capacitor cuando se llegue a esa fase.
- Monorepo con pnpm workspaces (con la salvedad del deploy — ver DEPLOY.md
  sobre soporte de subcarpetas en Hostinger, no confirmado).
- Deploy: dos Node.js Apps de Hostinger (hPanel), conectadas por GitHub,
  deploy automático en cada push — no VPS, no SSH, no PM2/Nginx propio.
  GitHub Actions se usa solo como CI liviano (`ci.yml`), no para deployar.
- RBAC en la capa de aplicación (Fastify `preHandler`), no RLS de Postgres
  (esto no es multi-tenant SaaS, es una sola organización).

## Convenciones del repo

- Toda tabla de negocio tiene `created_at`/`updated_at` y, donde aplica,
  `created_by`/`updated_by` — cumple el requisito de trazabilidad ("usuario
  que actualiza") en Casos y Stock.
- Los movimientos de stock y de fondos son **ledgers** (ingreso/egreso), nunca
  un campo de "cantidad actual" mutable — la cantidad se deriva sumando.
- Cada módulo se entrega como milestone independiente (ZIP + changelog acá),
  nunca todo junto.

## Historial de milestones

- **Milestone 0**: diseño de arquitectura + scaffolding del monorepo. Sin
  código de negocio.
- **Milestone 1**: Core & Seguridad. Auth + RBAC probados de punta a punta
  contra Postgres+Redis reales. Runbook de deploy a Hostinger. Google OAuth
  y el deploy real quedan pendientes de datos que solo tiene Josecito
  (credenciales de Google Cloud Console; tipo de plan de Hostinger).
- **Milestone 2 (extendido)**: esquema completo de Proyectos (hitos,
  procesos, gastos, notas, recordatorios, configuración, adjuntos,
  checklist, dependencias, hoja de tiempo, campos personalizados,
  encuestas), autorización por proyecto conectando permisos globales con
  roles de membresía (79 rutas), auditoría real, tabla `/proyectos`
  rediseñada, y subida real de archivos (`POST /api/uploads`). Todo
  desplegado y verificado en producción. Método de trabajo de esta etapa:
  "uno y uno" — alternar una mejora visible (frontend) con una de
  cañería (backend), a pedido de Josecito.
- **Milestone 2 (cierre visual)**: a pedido de Josecito ("vamos con todo lo
  visual pendiente hasta ahora") se completó de una vez todo el frontend
  que quedaba pendiente del Módulo 2, en vez de seguir "uno y uno":
  - Dashboard reescrito: los KPIs y widgets ahora se auto-limitan a los
    proyectos propios del usuario (se corrigió una fuga de datos org-wide
    real en `getDashboardSummary`), banner de cronómetro corriendo,
    resumen financiero, actividad reciente.
  - `getProjectAccess()` nuevo en `lib/projects.ts`: unifica permiso
    global + rol por proyecto en el cliente (antes la página de detalle
    usaba solo permisos globales, igual que el bug ya corregido en el
    backend y en la lista de `/proyectos`).
  - Página de detalle de proyecto (`/proyectos/[id]`) reescrita como shell
    con 10 pestañas: Vista General, Lista de Tareas, Kanban, Procesos,
    Plan (Gantt liviano sin librería), Notas, Archivos (usa la subida real
    de archivos), Comentarios (agregado nuevo, `GET /projects/:id/comments`),
    Hoja de Tiempo, Gastos. Carga perezosa de datos por pestaña.
  - `TaskDetailModal` completo: checklist, dependencias, comentarios,
    cronómetro, etiquetas, asignados, recordatorios, clonar/eliminar tarea.
  - `ProjectHeaderActions`: selector de cronómetro, recordatorios de
    proyecto, configuración (admin), editar/eliminar proyecto.
  - Fase G — nueva ruta `/administracion` (global a la organización, no
    específica de un proyecto): CRUD de Etiquetas, CRUD de Campos
    Personalizados (Proyectos/Casos), gestión de Encuestas (crear,
    preguntas, ver respuestas). Gateado por `projects.admin` /
    `surveys.manage`, con tarjeta nueva en el dashboard.
  - Todo verificado con `tsc --noEmit` y `next build` limpios antes de cada
    sync, y desplegado en producción (`api` y `web`) con el procedimiento
    manual de SSH ya documentado más arriba — se confirmó que
    "Implementación automática" está activa de nuevo en `web` (dispara con
    cualquier push a `main`), así que sigue haciendo falta el fix manual de
    `npm install --omit=dev` + copiar `.env` + `restart.txt` después de
    cada uno.
