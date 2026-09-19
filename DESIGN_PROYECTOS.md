# Rediseño de Dashboard y Proyectos — plan de implementación

> Este documento traduce las 13 capturas de RedVivo MDP que compartiste en un
> plan concreto de pantallas y componentes para Vida Solidaria. Nada de lo
> que ya definimos se recorta — esto SUMA sobre el backend, no lo reemplaza.
> Regla que quedó fijada y que respeto en todo este plan: **optimizar sí,
> simplificar no.**

## 0. Qué ya quedó listo hoy en el backend (antes de tocar una sola pantalla)

Antes de diseñar la pantalla hacía falta que el backend pudiera sostenerla.
Hoy quedó armado, probado y verificado sin errores de tipos:

- [x] Esquema Prisma ampliado con 5 conceptos nuevos que tus capturas
      mostraban y que todavía no existían: **Proceso** (agrupador de tareas
      por etapa), **Gastos de proyecto**, **Notas de proyecto**,
      **Recordatorios** (proyecto o tarea) y **Configuración por proyecto**.
- [x] Migración nueva (`20260919121958_proyectos_ui_extensions`) generada,
      probada contra una base descartable y verificada con "cero deriva"
      contra el schema final — lista para aplicar a producción cuando
      hagamos el próximo deploy.
- [x] `permissions.ts` actualizado (un permiso nuevo: `surveys.manage` para
      encuestas internas sueltas; todo lo demás de Proyectos vive dentro de
      `projects.read/write/admin` + el rol por miembro que ya existía).
- [x] **80 endpoints nuevos** en `projects.service.ts` / `projects.routes.ts`
      cubriendo: hitos, procesos, cronómetro en vivo (con la regla "un
      tramo abierto por usuario"), checklist de tareas, dependencias entre
      tareas, etiquetas, campos personalizados, encuestas, gastos, notas,
      recordatorios y configuración por proyecto — todo compilando sin
      errores (`tsc --noEmit` limpio).

Con esto la base de datos y la API ya pueden sostener cada pestaña que
viste en RedVivo. Lo que sigue es la parte visual.

## 1. Dashboard general (al entrar a la plataforma)

Estructura que vamos a construir, calcada de tu referencia pero con la
identidad de Vida Solidaria (paleta propia, no la de RedVivo):

**Barra superior**: buscador, botón "+" de creación rápida, selector de
idioma/entidad (si aplica), reloj/cronómetro activo (si el usuario tiene un
timer corriendo en cualquier tarea), notificaciones, mensajes, avatar.

**Barra lateral**: un ícono por módulo (Dashboard, Proyectos, Casos,
Logística, Campo, Finanzas, Analítica), filtrada según el permiso de cada
usuario — igual que ya hace `RoleGate` hoy, solo que con más íconos.

**Cuerpo — tarjetas KPI arriba**: proyectos activos, tareas abiertas, mis
tareas, vencimientos próximos, miembros de equipo (ya devueltos por
`GET /dashboard/summary`, que hoy ampliamos para incluir también
`teamMembersCount`, `tasksByStatus`, `upcomingMilestones`, `runningTimer` y
`recentActivity`).

**Grilla de widgets debajo**:

| Widget | Fuente de datos |
|---|---|
| Projects Overview (progreso por proyecto) | `GET /projects` (ya trae `progressPct`) |
| Tasks Overview (donut por estado) | `tasksByStatus` de `/dashboard/summary` |
| Team Members Overview | `teamMembersCount` + lista de miembros |
| Próximos hitos | `upcomingMilestones` |
| Actividad reciente | `recentActivity` (AuditLog) |
| Cronómetro activo | `runningTimer` — si hay uno corriendo, mostrarlo fijo |
| Ingresos vs gastos (versión Vida Solidaria del "Invoice Overview") | combinar `FundTransaction` (ya existía) + `ProjectExpense` (nuevo) |

## 2. Lista de Proyectos (tabla, no tarjetas)

Reemplaza la tarjeta básica actual por una tabla real, con estas columnas
(mapeo directo de lo que mostraba RedVivo):

| Columna en RedVivo | Campo en Vida Solidaria |
|---|---|
| ID | `code` (PROY-0001, autogenerado) |
| Título | `name` |
| Cliente | Casos vinculados (`caseCount` / lista vía `/projects/:id/cases`) |
| Precio | `budget` |
| Fecha de inicio / límite | `startDate` / `endDate` |
| Progreso | `progressPct` (ya calculado en el backend) |
| Estado | `status` |
| Etiquetas | `labels` |

Acciones de la barra superior de la tabla: exportar a Excel, imprimir,
"Manejar etiquetas" (CRUD de `Label`, ya expuesto en `/labels`), agregar
proyecto.

## 3. Página de un proyecto — barra de pestañas

Esta es la pieza más grande. Cada pestaña es una vista que consume un
endpoint propio (así cada una carga rápido y no traemos todo junto):

1. **Vista General** → `GET /projects/:id` (metadatos + settings + totales)
2. **Lista de Tareas** → `GET /projects/:id/tasks`
3. **Tareas Kanban** → tablero ya incluido en `GET /projects/:id`
4. **Procesos** → `GET /projects/:id/processes` (filtro sobre el Kanban)
5. **Plan** (Gantt agrupado por Proceso) → `GET /projects/:id/plan`
6. **Notas** → `GET /projects/:id/notes`
7. **Archivos** → `GET /projects/:id/attachments`
8. **Comentarios** → comentarios agregados de las tareas del proyecto
9. **Hoja de Tiempo** → `GET /projects/:id/time-entries`
10. **Gastos** → `GET /projects/:id/expenses`

En el header de la página del proyecto: botón verde fijo "Iniciar Reloj"
(dispara `POST /tasks/:id/timer/start` sobre la tarea activa, o pide elegir
una si no hay ninguna seleccionada), más "Recordatorios", "Configuraciones"
(`/projects/:id/settings`) y "Acciones".

## 4. Modal de detalle de tarea

Columna izquierda: descripción, checklist (`/tasks/:id/checklist`),
subtareas/dependencias (`/tasks/:id/dependencies`), comentarios.

Panel derecho (metadata): responsable, Proceso, fechas, prioridad,
etiquetas, colaboradores, botón "Iniciar Reloj" propio de la tarea, tiempo
total registrado (`timeTrackedMinutes`, ya calculado por el backend),
recordatorios de la tarea. Acciones al pie: Clonar, Editar, Cerrar.

## 5. Fases de construcción (para no perder el hilo)

Ir tachando en orden — cada fase deja algo funcionando de punta a punta,
nunca a medio hacer:

- [ ] **Fase A** — Aplicar la migración a producción (Hostinger/Supabase) y
      confirmar que el deploy no rompe nada existente.
- [ ] **Fase B** — Dashboard: KPIs + widgets con datos reales.
- [ ] **Fase C** — Lista de Proyectos como tabla (reemplaza las tarjetas).
- [ ] **Fase D** — Página de proyecto: Vista General + Kanban (ya eran las
      dos vistas que existían, ahora con la barra de pestañas armada).
- [ ] **Fase E** — Pestañas nuevas: Procesos, Plan, Notas, Archivos, Hoja
      de Tiempo, Gastos.
- [ ] **Fase F** — Modal de tarea completo (checklist, dependencias,
      cronómetro, recordatorios).
- [ ] **Fase G** — Campos personalizados y encuestas (uso interno) como
      pantallas de administración aparte.

## 6. Un punto para tu ok antes de seguir con pantallas

No es una pregunta que frene el trabajo — seguimos igual — pero te aviso
la decisión que tomé para no adivinar mal: como ya no tengo las 13 capturas
a la vista en este tramo de la conversación, esta Fase B en adelante la voy
a construir a partir de la descripción detallada que ya quedó registrada
(la tabla de arriba). Si en algún widget puntual el resultado no coincide
con lo que mostraba RedVivo, decímelo apenas lo veas y lo ajusto — es más
rápido corregir sobre algo construido que seguir describiendo en texto.
