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
- [ ] Nada de Módulo 2 en adelante todavía (Proyectos, Casos, Logística,
      Campo, Finanzas, Analítica).

## Roadmap completo (ver detalle en ARCHITECTURE.md §7)

1. Core & Seguridad ✅ *implementado, ver arriba — falta Google OAuth real y desplegar*
2. Gestión de Proyectos ⏸️ *siguiente*
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
