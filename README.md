# Vida Solidaria — Plataforma de Gestión

Plataforma interna para la ONG Vida Solidaria MDP: voluntariado y coordinación
(RBAC), gestión de proyectos, CRM social de casos, logística/stock/cocina,
operaciones de campo en tiempo real, finanzas/donaciones y analítica.

- **Arquitectura completa y esquema de datos:** [`ARCHITECTURE.md`](./ARCHITECTURE.md)
- **Estado actual / próximos pasos:** [`CLAUDE.md`](./CLAUDE.md)
- **Cómo subir esto a Hostinger (hosting compartido/Business):** [`DEPLOY.md`](./DEPLOY.md)

## Estructura

```
apps/
  api/     — backend Node.js (Fastify + Prisma + PostgreSQL)
  web/     — frontend Next.js (PWA, empaquetable a APK con Capacitor)
packages/
  shared-types/ — tipos TS compartidos entre api y web
  config/       — configuración compartida (eslint/tsconfig base)
```

## Desarrollo local

```bash
pnpm install
docker compose up -d          # Postgres+PostGIS y Redis locales
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
pnpm prisma:migrate
pnpm dev:api                  # http://localhost:4000
pnpm dev:web                  # http://localhost:3000
```

> Estado actual: **Módulo 1 — Core & Seguridad implementado y probado de
> punta a punta** (login, JWT + refresh con rotación, RBAC de 9 roles, seed
> del Admin General, frontend con `/login` y `/dashboard` protegido). Falta
> Google OAuth real (credenciales pendientes) y el deploy a producción — ver
> [`DEPLOY.md`](./DEPLOY.md) para el paso a paso en Hostinger (hosting
> compartido/Business, con Supabase como base de datos). Módulo 2 en
> adelante (Proyectos, Casos, Logística, Campo, Finanzas, Analítica) todavía
> no arrancó — ver el roadmap en [`CLAUDE.md`](./CLAUDE.md).
