# PLAN — Fase K: Voluntariado, Presentismo, Cocina, Casos, Stock y Analítica

> Estado: **F + C + A + B + D + E + G entregados y en producción (21/09/2026)
> — Fase K completa**, salvo los dos pendientes de Josecito que se explican
> abajo (Resend y watchdog). Este documento traduce el pedido de Josecito
> (21/09/2026) a diseño técnico concreto, contrastado contra el schema y
> las rutas YA existentes (no se repite trabajo hecho).
>
> ⚠️ **Pendiente de vos** (dos ítems — ver el mensaje del 22/09 abajo sobre
> por qué son dos y no tres): 1) crear la cuenta de Resend y pasarme la
> `RESEND_API_KEY` — sin ella, todo lo que manda email (alta de
> voluntarios de A, lo que sume D) funciona igual pero ningún mail sale de
> verdad todavía (se loguea y se omite, sin romper nada — ver
> `lib/email.ts`); 2) decidir qué hacer con el watchdog
> (`watchdog-deploy.sh`) que quedó corriendo por cron en el servidor desde
> el incidente del 19-20/09 (ver `DEPLOY.md`).
>
> **Post-Fase-K (22/09/2026)** — ver bloque H más abajo: dashboard
> corregido, `/analitica` ampliada (usuarios, proyectos, stock, mapa,
> reportes CSV/PDF). Dos cosas del pedido de Josecito quedaron resueltas acá
> con una decisión documentada porque el dato exacto no vino especificado:
> el mapeo de color rojo/naranja/amarillo/verde (ver bloque H), y "estos
> tres pendientes" — en este documento solo había DOS pendientes cargados
> (Resend, watchdog) al momento del pedido; se sigue con esos dos, y si
> Josecito tenía un tercero en mente que no llegó a este documento, que lo
> diga y se agrega.
>
> **Casos II (22/09/2026)** — ver bloque I más abajo: KPIs, slider de
> fotos, buscador/filtros, auto-conversión de caso a Proyecto, export a
> PDF. **Entregado y en producción (22/09/2026).**

## Método

Igual que siempre en este repo: nunca todo junto. Cada bloque de acá abajo es
un milestone independiente (o varios), con su propia migración de Prisma,
sus rutas, su UI y su verificación end-to-end antes de pasar al siguiente.

---

## A) Alta pública de voluntarios (NUEVO) ✅ ENTREGADO

**Construido y deployado (21/09/2026)**, tal cual el diseño original de
arriba, con dos ajustes que salieron al implementar:

- `UserStatus` suma `pending` y `rejected` (todo lo existente quedó
  `active`, sin tocar) y `User.volunteerMessage` para el motivo que
  escribe la persona en el formulario.
- `POST /api/public/volunteer-signup` (sin auth, rate-limit propio de 5
  intentos/15min por IP — no se sumó `@fastify/rate-limit` como
  dependencia nueva por un solo endpoint): crea el `User` en `pending`,
  sin rol ni contraseña, manda el email de "recibimos tu registro" y
  avisa (in-app + email) a quienes tienen el permiso `users.manage`.
- `PATCH /api/users/:id/approve` (elige rol, genera contraseña igual que
  el alta manual, pasa a `active`, manda el email real de bienvenida con
  el rol asignado — el equipo queda para cuando se entregue el bloque B)
  y `PATCH /api/users/:id/reject` (pasa a `rejected`, sin mail).
- `/administracion → Usuarios`: sección "Pendientes de aprobación" arriba
  de la tabla con el mensaje de cada voluntario, selector de rol y
  Aprobar/Rechazar.
- **Sitio estático** (`vidasolidariamdp.com`, fuera de este repo — vive
  directo en Hostinger): el botón "Quiero sumarme ahora" ahora abre un
  modal con el formulario real en vez de linkear a vidasolidaria.org.
- **Ajuste no previsto en el diseño original — CORS**: la API solo
  aceptaba pedidos desde `gestion.vidasolidariamdp.com`. Ahora acepta
  cualquier subdominio (o el apex) de `vidasolidariamdp.com` por regla
  fija en el código, no solo por el env var `CORS_ORIGIN` — se descubrió
  en el deploy que Hostinger pisa el `.env` del repo con lo que esté
  cargado en hPanel (Node.js App → Environment variables), así que editar
  el archivo solo no alcanzaba.
- **Bug encontrado y corregido de paso**: `usersWithPermission()` (la
  función que decide a quién avisar) no incluía a `admin_general` porque
  ese rol resuelve a acceso total en el login sin tener filas reales en
  `RolePermission` — el único admin de producción se estaba quedando sin
  ningún aviso (ni este, ni el de stock bajo del bloque F). Corregido.

**Verificado end-to-end en producción**: alta real (201), duplicado (409),
validación (400), aprobación y rechazo (transición de estado + rol +
contraseña), notificación al admin llegando después del fix. Todo limpiado
sin dejar datos de prueba.

**Email**: servicio elegido — **Resend** (plan gratuito, 3.000 emails/mes).
Sigue faltando que crees la cuenta y me pases la `RESEND_API_KEY` — el
sistema funciona igual mientras tanto, simplemente no sale ningún mail
todavía (se loguea y se omite, ver `lib/email.ts`).

---

## B) Presentismo y equipos semanales (EXTIENDE Fase I) ✅ ENTREGADO (21/09/2026)

**Ya existía**: `FieldTeam` (Equipo 1/2/3…), `FieldTeamMember` (integrantes,
sin fecha — el equipo era fijo), `Zone` + `ZoneAssignment` (equipo → zona,
con `weekStartDate`/`weekEndDate` — esto YA era semanal), `Checkin` con tipos
`en_camino / llegamos / entregando_viandas / relevando_caso`.

**Decisión de diseño confirmada** (quedó resuelta antes de construir este
bloque): `FieldTeamMember` pasó de fijo a semanal — ahora tiene
`weekStartDate` y la clave única es `(teamId, userId, weekStartDate)` en vez
de `(teamId, userId)`. El equipo se arma de nuevo cada domingo según quién
confirmó asistencia esa semana; el historial ("quién estuvo en qué equipo
cada domingo") queda registrado y alimenta el ranking de participación del
bloque G. La tabla estaba vacía en producción al migrar, así que no hizo
falta backfill.

**Construido**:
1. **Intención semanal** — modelo nuevo `WeeklyAvailability` (usuario,
   domingo, `willAttend` sí/no + `reason` opcional si es no). Cada
   voluntario/a la carga desde **`/presentismo`**, una pantalla nueva y
   deliberadamente FUERA del permiso `field_ops.*` — cualquier usuario
   logueado ve y edita ahí su propia intención (mismo criterio que
   `/notifications`: autogestión de lo propio, sin permiso especial). Es el
   insumo para que coordinación arme los equipos.
2. **Confirmación de coordinación** — pestaña nueva **"Presentismo"** dentro
   de `/equipos` (esta sí atrás de `field_ops.read`/`.write`): lista quién
   avisó que viene para la semana elegida y permite marcar
   `WeeklyAvailability.confirmedPresent` (sí/no), ya pensando el equipo.
   De ahí, coordinación pasa a la pestaña "Equipos" (ahora con selector de
   semana) para sumar a cada persona confirmada al equipo que le toque esa
   semana.
3. **Presente en punto de encuentro** y **presente en zona** — se
   resolvieron reutilizando `Checkin` (ya tenía user/team/lat/lng/timestamp)
   con dos tipos nuevos en el enum: `presente_punto_encuentro` y
   `presente_zona` (más claros que el `llegamos` viejo, que quedaba
   ambiguo entre las dos cosas — se dejó `llegamos` tal cual para no romper
   check-ins históricos). El punto de encuentro fijo es **Bv. Marítimo (Av.
   Patricio Peralta Ramos) 2502** (verificado — es la puerta del NH Gran
   Hotel Provincial); no se guardó como dato aparte, es una referencia fija
   para quien registra el check-in en el lugar.

**Endpoints nuevos**: `GET/PUT /api/weekly-availability/me` (autogestión),
`GET /api/weekly-availability?weekStartDate=` y
`PATCH /api/weekly-availability/:id/confirm` (coordinación). Los de
integrantes de equipo (`POST/DELETE /api/field-teams/:id/members`) ahora
piden `weekStartDate` además de `userId`.

**Verificación antes de tocar producción**: migración probada contra
Postgres local (diff limpio ida y vuelta) + script funcional (alta de
disponibilidad, duplicado rechazado por semana, misma persona en un equipo
en dos semanas distintas, duplicado rechazado en la misma semana, los dos
check-ins nuevos) — los cinco casos pasaron antes de aplicar en producción.

Con esto, presentismo por usuario/domingo queda armado con datos que además
alimentan el ranking de participación (bloque G).

---

## C) Cocina — estados y producción (EXTIENDE Fase I) ✅ ENTREGADO (junto con F)

Enum ampliado a los 6 estados pedidos y `responsibleUserId` agregado — ver
detalle en el bloque F de arriba (se construyeron y deployaron juntos porque
la interjección de Josecito sobre el responsable de cocina llegó a mitad de
la implementación de F).

**Pendiente, sin tocar todavía**: producción / litros de té-café-mate cocido
por domingo. Se resuelve con `FieldDelivery` (ya existe, ligado a `Checkin`
tipo `entregando_viandas`) anotando los líquidos como ítems (`itemLabel:
"Té", quantity: 40, unit: litros`) — no hace falta modelo nuevo. El
indicador semanal sale de sumar `FieldDelivery` por domingo (bloque G).

---

## D) Circuito de Casos — asignación con roles + notificaciones (EXTIENDE Fase J) ✅ ENTREGADO (21/09/2026)

**Ya existía**: `Case` (individual/pareja/grupo_familiar), `CaseMember`,
`CaseContactHistory`, `CaseStatusHistory`, `CaseViability` (alta/media/baja
— esto YA es tu "probabilidad de extracción"), `CaseFeasibility`
(factible/no_factible/en_pausa — esto YA es tu "caso que se cierra por no
ser posible seguir").

**Construido**: se agregó `CaseAssignment` (caseId, `userId` suelto igual
que el resto del módulo, `role` — enum `coordinador | visitador_social |
psicologo | seguimiento_laboral | seguimiento_conducta`, `assignedAt`,
`unassignedAt` opcional). Un caso puede tener varios usuarios con distintos
roles a la vez, e incluso la misma persona con dos roles. Desasignar marca
`unassignedAt` en vez de borrar, así el historial de quién pasó por el caso
queda para el ranking del bloque G. Se ve y se gestiona desde una sección
nueva "Equipo asignado" en la ficha de cada caso (`/casos`).

**Decisión de diseño resuelta** (era la pregunta abierta de este documento):
"estado de cierre" a efectos del email = `CaseStatus.cerrado` (el valor de
estado que ya existía), no `feasibility: no_factible` — son ejes distintos
(factibilidad de extracción vs. si el caso sigue con seguimiento abierto o
no), y `cerrado` es la señal más directa de "esto se terminó".

**Notificaciones (in-app + email, mismo `lib/notify.ts` de los bloques
anteriores — sin `RESEND_API_KEY` funciona igual, solo no manda el mail
real todavía)**:
- Al asignar/desasignar un usuario a un caso → aviso a ese usuario.
- Al agregar una entrada en `CaseContactHistory` (evolución) → aviso a
  todos los asignados ACTIVOS al caso (menos a quien la cargó).
- Al cambiar el estado a `cerrado` (y no lo estaba ya) → aviso a los
  asignados activos con el motivo (`closeReason`).

**Verificación antes de tocar producción**: migración probada contra
Postgres local (diff limpio ida y vuelta) + script funcional (asignar dos
roles a dos personas, un mismo usuario con dos roles a la vez, desasignar
sin borrar, historial completo se conserva, cascade delete del caso borra
sus asignaciones) — los cinco casos pasaron antes de aplicar en producción.

---

## E) Relevamiento — KPI de carga + buscador (EXTIENDE Fase J) ✅ ENTREGADO (21/09/2026)

**Construido**: `Case.surveyStartedAt` (nullable, la setea el FRONTEND al
abrir el formulario "Nuevo caso" — no el backend al guardar), así el KPI
"tiempo de carga" sale de `createdAt - surveyStartedAt`. Si el formulario
se abre y se abandona sin guardar, no genera dato (correcto, no llegó a
existir un `Case`).

`GET /api/cases/search?q=` — busca por nombre, alias o DNI, coincidencia
parcial insensible a mayúsculas, tanto en el/la referente del caso como en
cualquier `CaseMember` del grupo (si matchea por un integrante, la
respuesta lo marca con `matchedMember` para que se entienda por qué
apareció ese caso). Se enganchó como paso "buscar" — nuevo primer paso del
wizard de "Nuevo caso" en el frontend, antes de "básicos" — con búsqueda
con debounce de 350ms; si aparece una coincidencia, un toque lleva
directo al caso existente en el listado (`Listado` ya tenía un prop
`openCaseId` sin usar, aprovechado acá) en vez de duplicar.

**Verificación antes de tocar producción**: migración probada contra
Postgres local (diff limpio) + `tsc`/`next build` limpios en ambas apps.

---

## F) Stock e inventario — materia prima + custodia de equipamiento ✅ ENTREGADO

**Construido (21/09/2026)** — terminó más completo que el diseño original de
más arriba porque Josecito pidió, a mitad de la implementación, un form tipo
TPV/red vivo:

- `StockItem` con **código automático** (`ART-0001`, contador tipo
  `Case.caseNumber`), `unit` como **enum tipado** (`kg | litros | unidades |
  paquetes | cajas`, ya no texto libre), `category`, `isReusable`,
  `unitCost`, `reorderPoint` (punto de pedido), `restockTarget` (punto de
  reposición). La cantidad **sigue sin guardarse** como campo mutable: se
  calcula siempre sumando `StockMovement` (ingreso − egreso), igual que
  antes — la convención del repo no se tocó.
- `GET/POST /api/stock-items/:id/movements` — ledger de movimientos con
  motivo y quién lo cargó. `GET /api/stock-summary` — KPIs para el dashboard
  (total de ítems, valuación total, cantidad bajo punto de pedido, cantidad
  de reusables prestados).
- **Alerta de stock bajo**: se dispara (notificación in-app + email) solo al
  *cruzar* el punto de pedido hacia abajo, no en cada movimiento — evita
  spam cuando un ítem ya está bajo y se sigue usando.
- **Descuento automático al cocinar**: asignar/editar un ingrediente de un
  lote de cocina genera el `StockMovement` de egreso correspondiente (por la
  diferencia, nunca duplica); quitar un ingrediente genera el movimiento de
  reversión (ingreso) — nunca se borra ni se edita un movimiento ya
  registrado, se lo compensa (ledger append-only).
- **Custodia de lo permanente** (conservadoras, termos, ollas, cucharones):
  `StockCustody` (quién lo tiene, quién lo entregó, cuándo, notas de
  devolución) con check-out/return desde la UI.
- **Responsable de cocina**: `KitchenBatch.responsibleUserId` — se asigna al
  crear el lote o después, desde el detalle.
- Estados de cocina ampliados a los 6 pedidos: `preparacion → coccion →
  cocina_terminada → listo_transporte ("Cargando conservadoras") →
  camino_punto_encuentro → entregado`.
- **UI**: `apps/web/app/equipos/tabs/Stock.tsx` reescrita como TPV — 4
  tarjetas de KPI, catálogo agrupado por categoría, alta/edición de insumos,
  registro de movimientos con historial expandible, custodia de reusables.
- **Notificaciones (nuevo módulo, reutilizable para D)**: `Notification`
  (in-app) + `apps/api/src/lib/email.ts` (Resend, no-op sin
  `RESEND_API_KEY` — nada se rompe hasta que exista la cuenta) +
  `apps/api/src/lib/notify.ts` (helpers `usersWithPermission` / `notify`).
  `GET /api/notifications`, `PATCH /api/notifications/:id/read`,
  `PATCH /api/notifications/read-all` — **falta la campanita en el navbar
  del frontend** (`lib/notifications.ts` ya existe, sin consumidores todavía).

**Verificado end-to-end en producción**: migración aplicada, código
`ART-0001` generado, ledger ingreso/egreso calculado correctamente (30 − 5 =
25), limpieza de datos de prueba sin dejar rastro. Deploy de API y frontend
(`gestion.vidasolidariamdp.com`) confirmados arriba con `/health` en 200 y
las rutas nuevas devolviendo 401 (auth) en vez de 404.

---

## G) Analítica e indicadores (NUEVO módulo completo) ✅ ENTREGADO (21/09/2026)

**Construido** — sin tablas propias, todo agregación sobre lo que ya cargan
los bloques anteriores:

- `GET /api/analytics/casos`: edad promedio, distribución por sexo, tiempo
  de permanencia promedio (días desde `createdAt` hasta la última
  transición a `cerrado` en `CaseStatusHistory`, o hasta hoy si el caso
  sigue abierto), habilidades más recurrentes (`CaseSkill.skillLabel`
  agrupado), cantidad con/sin teléfono cargado, cantidad por `viability`.
- `GET /api/analytics/presentismo?weeks=`: ranking de usuarios por
  asistencias confirmadas (`WeeklyAvailability.confirmedPresent`) en los
  últimos N domingos (default 8).
- `GET /api/analytics/produccion?weeks=`: bandejas/litros entregados por
  domingo, sumando `FieldDelivery` (ligado a `Checkin` tipo
  `entregando_viandas`) agrupado por semana e ítem — la semana se calcula
  truncando `Checkin.createdAt` al domingo anterior, ya que `FieldDelivery`
  no guarda su propio `weekStartDate`.
- Vista nueva `/analitica` (página propia, no pestaña de administración —
  es un módulo de lectura para todo el equipo con `analytics.read`, no una
  tarea administrativa puntual), con tarjetas de KPI + gráficos (`recharts`,
  ya era dependencia del proyecto, sin uso hasta ahora) — enganchada en la
  barra de navegación (`AppShell`).

**Verificación antes de tocar producción**: sin migración (no hay tablas
nuevas) — se verificó con un script funcional contra Postgres local que
replica exactamente la lógica de los tres endpoints sobre datos sembrados
a mano (edad promedio, distribución por sexo, permanencia con caso
cerrado/activo, habilidades repetidas, ranking de presentismo con y sin
confirmar, producción agrupada por semana e ítem con filtro por tipo de
checkin) — los siete chequeos pasaron antes de escribir las rutas
definitivas. `tsc` y `next build` limpios en ambas apps.

---

## H) Post-Fase-K: dashboard, analítica ampliada, mapa de casos y reportes (NUEVO) ✅ ENTREGADO (22/09/2026)

Pedido de Josecito del 21/09 a la noche, ya con toda Fase K en producción:
corregir las tarjetas "próximamente" del dashboard, sumar más KPI/gráficos a
`/analitica`, agregar un mapa interactivo de casos y agregar exportación de
reportes CSV/PDF. Sin migración — todo agregación sobre tablas existentes.

**Dashboard (`/dashboard`)**: "Analítica" ya no es "próximamente" — apunta a
`/analitica` (tenía funcionalidad real desde el bloque G, la tarjeta había
quedado desactualizada). Además se sacaron las tarjetas "Logística" y
"Operaciones de Campo": ambas estaban marcadas "próximamente" pero en
realidad viven, desde los bloques B/C, como pestañas dentro de "Equipos y
Secciones" (Cocina/Stock y Equipos/Zonas/Presentismo/Check-ins
respectivamente) — tener el mismo módulo dos veces, una de ellas mintiendo
que no existe, era peor que no tenerla. "Finanzas" sigue como
"próximamente": no tiene todavía ninguna pantalla propia.

**`/analitica` — KPI y gráficos nuevos**:
- `GET /api/analytics/resumen`: usuarios totales, proyectos por estado
  (planificación/en proceso/pausado/terminado, sale de `groupBy` sobre
  `Project.status`), y stock (ítems cargados, valuación total, cantidad
  bajo punto de pedido) — calculado en lote con `groupBy` sobre
  `StockMovement` en vez de reusar el cálculo por-ítem de
  `logistics.routes.ts` (ese es N+1 a propósito, porque ahí sí hay
  paginado/filtro; acá no). Sale en 0 sin romperse si todavía no se cargó
  ningún `StockItem` (pedido explícito: "aunque no esté cargado").
- `casos.byStatus` sumado a `GET /api/analytics/casos` — cuenta de casos
  por los 4 valores de `CaseStatus`, graficado como torta en `/analitica`
  con los mismos colores que el mapa (ver abajo) para que se lean como la
  misma clasificación.
- Torta de proyectos por estado.

**Mapa de casos** (`GET /api/analytics/mapa-casos` + `CasosMap.tsx`,
`react-leaflet` + `leaflet`, tiles de OpenStreetMap — sin API key, sin
costo): un pin por caso en su ubicación GPS más reciente (`CaseLocation`,
puede haber varias por caso a lo largo del tiempo; se toma la de
`recordedAt` más nuevo). Tocar un pin (o el botón del popup) navega a
`/casos?caseId=<id>` — se le sumó a `app/casos/page.tsx` la lectura de ese
query param (antes `Listado` solo sabía abrir un caso puntual por estado de
React, dentro de la misma página; ahora también desde afuera, vía URL).

**Mapeo de color — decisión documentada** (Josecito no dio el campo exacto,
solo describió 4 categorías): se reusa el único campo de 4 valores que
tiene `Case`, el propio `status` (`CaseStatus`):
- `activo` (recién cargado) → **rojo** — "sin clasificación".
- `derivado` → **naranja** — "clasificados".
- `en_seguimiento` → **amarillo** — "en tratamiento / otro filtro".
- `cerrado` → **verde** — "extraídos" (la persona salió de la situación de
  calle, el caso se cerró).

Si esto no es lo que tenías en mente (por ejemplo si "clasificación" debía
ser un campo nuevo, separado de `status`), avisame y se ajusta — es un
campo booleano/enum chico de agregar, no una migración grande.

**Reportes** (sección nueva al final de `/analitica`, 4 filas × 2 botones
cada una = 8 botones: CSV y PDF por reporte):
- `GET /api/analytics/export/casos`, `.../export/cocina`,
  `.../export/proyectos` (listados planos, sin paginar, bajo
  `analytics.read` — no bajo `logistics.read`/`finance.read`, a propósito:
  así dirección puede exportar todo desde un solo lugar sin necesitar
  permisos de módulos operativos). "Reporte general" no tiene endpoint
  propio — se arma en el frontend combinando lo que la propia página ya
  tiene cargado (casos + resumen + presentismo + producción).
- CSV: delimitador `;` (no `,`) + BOM UTF-8 — Excel en configuración
  regional Argentina toma `;` como separador de lista nativo al abrir con
  doble clic (con `,` mete todo en una sola columna, por el separador
  decimal). `apps/web/lib/reports.ts`, sin librería — solo `Blob` +
  descarga.
- PDF: `jspdf` + `jspdf-autotable` (nuevas dependencias, antes no había
  ninguna generación de PDF en el proyecto), franja violeta con logo +
  "Vida Solidaria MDP" + título del reporte en el header de cada página,
  pie con fecha de generación + número de página — todo client-side, sin
  endpoint de "generar reporte" en el backend.

**Verificación antes de tocar producción**: sin migración (ninguna tabla
nueva; las 11 migraciones existentes se re-aplicaron limpias contra una
base Postgres local vacía, confirmando que no hay drift de schema) —
script funcional (`test_post_fase_k.js`) contra Postgres local + API real
corriendo, con datos sembrados a mano: 25 verificaciones (resumen con
stock bajo punto de pedido, mapa tomando la ubicación MÁS reciente de un
caso con varias cargadas, labels en español de los exports, 401 sin
sesión, etc.) — las 25 pasaron. `tsc` y `next build` limpios en ambas
apps, incluyendo el chunk nuevo de `/analitica` (237 kB, sube por
leaflet+jspdf — esperable, es la única página que los usa).

**Verificado end-to-end en producción**: API recompilada in-place
(`npx tsc`) y reiniciada, los 5 endpoints nuevos devuelven 401 (registrados
y con auth, no 404). Web: build standalone armado afuera del hosting (en el
sandbox de Claude, mismo motivo que siempre — ver el incidente de `next
build`/LVE en `DEPLOY.md`), extraído en una versión nueva de
`hbuilds/versions/`, con el `.env` real copiado, y recién ahí se cambió el
symlink `current` — `/login`, `/dashboard`, `/analitica` y `/casos` todos
responden bien en producción, y el chunk de `/analitica` se sirve desde la
versión nueva (hash de archivo verificado).

**Incidente nuevo (22/09/2026) — SSH parecía caído, en realidad era el
puerto equivocado**: durante buena parte de este bloque, todo intento de
`ssh u859384027@45.152.46.191` (puerto 22, el default) daba `Connection
timed out` — ni siquiera se completaba el handshake TCP (confirmado con
`nc -zv` y `/dev/tcp`: sin SYN-ACK ni RST). Se probó con puertos de
control (21 y 443 del mismo host conectaban al toque), lo que descartó un
problema de red general. La pista correcta la dio el soporte de Hostinger:
**este plan (hosting compartido, no VPS) expone SSH en el puerto `65002`,
no en el 22** — el 22 está filtrado/cerrado a propósito en ese tipo de
plan. Ya había un alias `hostinger-vidasolidaria` armado en
`~/.ssh/config` del lado del dispositivo con el puerto y la clave
correctos (`Port 65002`, `IdentityFile ~/.ssh/id_ed25519_hostinger`) — el
problema fue que en este bloque se probó a mano con `ssh
usuario@ip`, sin pasar por ese alias, y por eso pegaba contra el puerto
filtrado. **Para la próxima vez**: usar siempre `ssh
hostinger-vidasolidaria` (o agregar `-p 65002 -i
~/.ssh/id_ed25519_hostinger` a mano si hace falta un comando suelto), no
`ssh usuario@ip` a secas.

---

## Decisiones ya tomadas (de tus respuestas de hoy)

- Email transaccional: **Resend**.
- Alta de voluntarios: formulario en **vidasolidariamdp.com** (sitio
  estático en Hostinger, no en el subdominio de gestión).
- Punto de encuentro: **Bv. Marítimo (Av. P. Peralta Ramos) 2502**.
- "Con/sin móvil": solo **con/sin teléfono celular cargado** (no
  movilidad física) — no requiere campo nuevo.
- `FieldTeamMember` pasa a ser **semanal** (equipos siempre reconfigurables
  por alta rotación de voluntarios/coordinadores — se arman de nuevo cada
  domingo según convocatoria confirmada, no equipos fijos).

## Preguntas abiertas

Ninguna pendiente por ahora. La única que quedaba (qué cuenta como "caso
cerrado" a efectos del email) se resolvió al construir D: `CaseStatus.cerrado`
— ver esa sección arriba.

## Orden de construcción

1. ~~**F (catálogo de stock real) + C (ampliar estados de cocina)**~~ —
   **entregado y en producción el 21/09/2026.**
2. ~~**A (alta pública + aprobación)**~~ — **entregado y en producción el
   21/09/2026.** Sigue pendiente que Josecito cree la cuenta de Resend y
   pase la `RESEND_API_KEY` (no bloqueó nada: el sistema funciona sin
   ella, simplemente no manda los mails hasta que se cargue).
3. ~~**B (presentismo + equipos semanales)**~~ — **entregado y en
   producción el 21/09/2026.**
4. ~~**D (asignación de casos con roles + notificaciones)**~~ — **entregado
   y en producción el 21/09/2026.**
5. ~~**E (KPI de relevamiento + buscador)**~~ — **entregado y en producción
   el 21/09/2026.**
6. ~~**G (analítica)**~~ — **entregado y en producción el 21/09/2026.**

**Con esto, Fase K queda completa** salvo los dos pendientes explícitos de
Josecito (Resend y watchdog, ver el aviso al principio de este documento).

7. ~~**H (post-Fase-K: dashboard, analítica ampliada, mapa, reportes)**~~ —
   **entregado y en producción el 22/09/2026.**
8. ~~**I (Casos II: KPIs, slider de fotos, buscador/filtros,
   auto-conversión a Proyecto, export a PDF)**~~ — **entregado y en
   producción el 22/09/2026.**

---

## I) Casos II — KPIs, slider de fotos, auto-conversión a Proyecto, buscador,
## export a PDF (NUEVO) ✅ ENTREGADO (22/09/2026)

Pedido de Josecito (22/09/2026, mensaje largo sobre `/casos`) + un
mensaje de seguimiento sobre qué significa cada estado del caso. Cubre
los 7 puntos que pidió, todos "ayudame vos" resueltos acá con una
decisión documentada (no se le preguntó nada de vuelta, siguiendo el
criterio ya usado en los bloques D y H de este documento):

**1) Sentido de los estados del caso (`CaseStatus`) + su relación con
Proyectos** — respuesta directa al segundo mensaje de Josecito:

- **Activo**: caso recién relevado, sin evaluación todavía o de baja
  prioridad por ahora. Estado por defecto al crear un caso.
- **En seguimiento**: el equipo lo está trabajando activamente. Se llega
  acá a mano, O automáticamente cuando se auto-convierte a Proyecto (ver
  punto 3) — "en seguimiento" es, en la práctica, "tiene un proyecto
  interno en curso".
- **Derivado**: se derivó a otra institución/organismo — el circuito
  interno de Vida Solidaria termina ahí (no impide igual la
  auto-conversión si más adelante se le carga viabilidad/factibilidad;
  ver nota de diseño abajo).
- **Cerrado**: fin del seguimiento (motivo en `closeReason`, ya existía).

  Los 4 chips de filtro se dejaron con el mismo texto que ya tenían
  (Activo / En seguimiento / Derivado / Cerrado, `CASE_STATUS_LABEL`) —
  ya estaban bien nombrados, el pedido era de significado, no de texto. Se
  agregó un quinto chip no excluyente, **"Vinculados a Proyecto"**, que
  filtra por `projects.some({})` combinado con cualquier estado.

**2) Navegabilidad estado → Proyecto**: el badge amarillo **"En
proyecto"** (nombre elegido — ver punto 4) es clickeable tanto en la
tarjeta del listado como en el modal de detalle, y lleva directo a
`/proyectos/:id` (la ruta ya existente con las pestañas del proyecto).

**3) Viabilidad vs. Factibilidad — ya no son redundantes**: se
redefinieron en vez de borrar una (evita romper el enum/datos ya
cargados):
- **Viabilidad** = qué tan viable es la situación de **la persona**
  (salud, redes, voluntad propia) — alta/media/baja, sin cambios de
  valores.
- **Factibilidad** = si es factible para **Vida Solidaria** intervenir
  **ahora** con el equipo/recursos disponibles — factible/no_factible/
  en_pausa, sin cambios de valores.
  Uno mira a la persona, el otro a la organización — se agregó el
  subtítulo aclaratorio en el modal (`(de la persona)` / `(de intervenir
  ahora)`) y una nota de una línea abajo del selector.

**4) Auto-conversión a Proyecto**: al guardar `viability` o `feasibility`
(`PATCH /cases/:id`), si `viability` queda en alta/media **O**
`feasibility` queda en factible (criterio "o" tal cual lo pidió Josecito,
no "y") y el caso **todavía no tiene un Proyecto vinculado**, se crea un
Proyecto (`Caso <N°> — <nombre>`, área "Casos sociales", prioridad alta/
media según viabilidad), se linkea vía `ProjectCase` (mismo mecanismo que
ya usaba "Vincular caso a Proyecto" desde el módulo Proyectos) y se avisa
al equipo asignado. Es **idempotente**: el guard es "no tiene proyecto
vinculado todavía", así que ediciones posteriores no duplican el
proyecto aunque la condición se siga cumpliendo. Si el caso estaba
"activo" pasa a "en_seguimiento" en el mismo movimiento; si ya estaba en
otro estado explícito (derivado/cerrado) se respeta — la conversión no
le pisa el estado, solo le agrega el proyecto.
  El **botón amarillo del listado/detalle se llama "En proyecto"**
  (nombre elegido, alternativas descartadas: "Pasado a proyecto" —
  quedaba largo para un chip; "Convertido" — menos claro para un
  voluntario nuevo).

**5) Buscador + filtros del listado** (no existían): `GET /cases` ahora
acepta `q` (nombre/alias/dni, mismo criterio insensible a mayúsculas que
`/cases/search`), `dateFrom`/`dateTo`, `caseType`, `sex` y
`linkedToProject`, todos combinables entre sí y con `status`. Buscador
con debounce de 400ms en el frontend; el resto en un panel "Más filtros"
plegado por default para no saturar la pantalla en mobile.

**6) Cabecera de KPIs + slider de fotos**: `GET /cases/kpis` (conteo por
estado + `enProyecto` + `relevadosUltimoDomingo`, este último es el
domingo más próximo hacia atrás en huso horario de Argentina, no una
ventana de 7 días — la organización relevé los domingos). El slider
auto-avanza cada 4s (pausa al tocar/hacer hover), muestra hasta 12 casos
no cerrados con su foto o el placeholder de persona, nombre abajo, tap
abre el caso. **Tratamiento de foto**: marco rectangular con borde
amarillo (sin redondeos tipo óvalo ni sombra) — siguiendo la sección
"Fotografía" del manual de marca que Josecito adjuntó el mismo día ("la
foto va a caja llena, recortada en rectángulo... no se aplican marcos
redondeados ni sombras"). El placeholder sin foto usa un ícono de
persona de línea (trazo 2px, un solo color), mismo criterio que la
sección "Iconografía" del manual. Nota de privacidad: la "regla de oro"
del manual sobre nunca publicar fotos de personas en situación de calle
sin consentimiento aplica a comunicación **externa** (redes, sitio de
donación — el manual dice explícitamente que la página de donación no
lleva fotos de personas asistidas); este slider es **interno**, detrás
de login y del permiso `cases.read`, con el mismo propósito que ya tiene
el resto del módulo Casos (identificar a la persona para poder
ayudarla) — no es una pieza de marketing. Se deja anotado acá por si en
algún momento se necesita agregar un campo de consentimiento explícito
al caso.

**7) Exportar caso a PDF + compartir + auditoría mínima de quién
descarga**: botones "Descargar PDF" / "Compartir (WhatsApp / email)" en
el detalle del caso, mismo armazón de marca que los reportes de
`/analitica` (`lib/reports.ts`). Compartir usa `navigator.share` con
`files` (Web Share API) cuando el navegador lo soporta (Android/iOS
recientes); si no, cae a una descarga común para adjuntar a mano. Antes
de generar el PDF se llama a `POST /cases/:id/export-log`, que deja un
`AuditLog` con quién y cuándo — la Auditoría completa sigue pospuesta
("continuamos después con armar una Auditoría", palabras de Josecito),
pero de yapa se agregó `logActivity` en creación/edición/cambio de
estado de un caso (mismo patrón que ya usa el módulo Proyectos vía
`AuditLog`), así "quien modifica" también queda cubierto sin construir
una UI de auditoría todavía.

**Sin cambios de schema** — `ProjectCase`, `AuditLog`,
`CaseStatusHistory` ya existían, no hizo falta ninguna migración nueva.

**Verificación**: `tsc --noEmit` limpio en API y Web, `next build`
limpio, test funcional `apps/api/test_casos_ii.js` con Postgres local
(28/28 aserciones OK: KPIs, cada filtro, auto-conversión + idempotencia
+ no-pisa-estado-explícito, badge/link a proyecto, log de auditoría de
export y de creación/edición).

**Pendiente — manual de marca (adjuntado por Josecito el 22/09/2026)**:
se leyó completo (36 páginas) y se aplicó a lo nuevo de este bloque
(marco de foto, ícono de persona, tono de los textos). **No** se tocaron
todavía los tokens de color/tipografía de TODA la plataforma —
`brand-tokens.json` sigue con la paleta anterior (violeta `#3a0a5c`,
amarillo `#ffd400`, azul `#123a7a`, fuentes Baloo 2 + Poppins) en vez de
la oficial del manual (violeta `#73038C`, amarillo `#FDED03`, azul
`#013681`, fuentes Outfit + Work Sans). Se decidió así para que Casos no
quede con un look distinto al resto de la plataforma ya construida —
mezclar tokens a medias es peor que no tocarlos. Queda como un bloque
aparte ("J", a definir) para reconciliar toda la plataforma de una sola
vez con control de calidad, si Josecito lo prioriza.

**Nota de infraestructura de esta sesión — dónde vive de verdad el repo**:
el contenedor de trabajo en la nube de esta sesión se reinició (sesión
larga, se cortó y se retomó) y vino sin el `~/.ssh` con la clave de
Hostinger ni el repositorio git de sesiones anteriores — solo
persistieron los archivos de código sueltos, en una copia de trabajo sin
`.git` (`vs-typecheck-full`, usada solo para tipar/buildear). Ahí se
armó por error un repo git nuevo desde cero (commit `a6f84eb`) antes de
darse cuenta del problema — **ese commit queda huérfano en el
contenedor de la nube y no importa, el historial real sigue siendo
este** (el de acá, en `C:\Users\pablo\develop\vida-solidaria` en tu
máquina, con el commit `a14b1ae` como base). La solución fue usar el
puente al dispositivo (esta máquina, conectada a la sesión de Cowork)
en vez del contenedor de la nube: acá SÍ está el repo real con todo el
historial, y `ssh hostinger-vidasolidaria` anda perfecto (la clave está
en `~/.ssh/` de esta máquina, no en la nube). De hecho el contenedor de
la nube **no puede** hacer SSH/TCP crudo aunque tuviera la clave —
solo tiene salida HTTPS a través de un proxy con lista blanca; lo que
sí puede hacer bien es compilar/buildear (Node, npm, tsc), así que el
flujo que terminó funcionando fue: código se edita en la nube → se
prueba ahí (Postgres local + test funcional) → se transfieren los
archivos finales y el build ya armado a esta máquina (`SendUserFile` +
`device_commit_files`) → el deploy por SSH real (`scp`/`ssh`) corre
desde acá. **Para la próxima vez**: si el contenedor de la nube no
tiene `~/.ssh/config` con `hostinger-vidasolidaria`, no es necesariamente
que se perdió el acceso — primero probar si hay una máquina conectada
por el puente de dispositivo (`get_device_info`) antes de asumir que
hace falta pedirte la clave de nuevo.

**Fix same-day post-deploy — slider de fotos con huecos (reportado por
Josecito viendo la pantalla en vivo, 22/09/2026)**: el wrapper de cada
tarjeta del slider tenía un ancho fijo de 120px (clase `w-30`, que no
existe en Tailwind por defecto, más un `style` inline a 7.5rem) mientras
`CaseAvatarFrame size="lg"` mide 144px de ancho real — y el desplazamiento
del carrusel se calculaba a mano con `translateX` asumiendo pasos de
120px. Ese desfasaje entre el tamaño real de la foto y el paso calculado
era la causa de los huecos/superposiciones que se veían al avanzar
automáticamente. Se resolvió reemplazando el cálculo manual por scroll
nativo del navegador (`overflow-x-auto` + `scroll-snap-type: x
mandatory`), que por construcción no puede desalinearse — y de paso
resuelve gratis el arrastre táctil en celulares. Para mouse en
escritorio se agregó arrastre con Pointer Events. Se distingue un tap de
un arrastre real con un umbral de movimiento (>6px de desplazamiento =
arrastre, no abre el caso) — así un swipe para volver a una foto que se
pasó nunca dispara accidentalmente la apertura del perfil, y un tap
limpio abre al instante sin que quede nada animando de fondo (la duda de
Josecito sobre si el slider "sigue arrastrando" al tapear una foto: no,
el guardado de la selección corta ahí mismo el intervalo de autoplay).
También se agregó reanudación automática del autoplay a los 6s de
inactividad, ya que la lógica anterior solo se reanudaba con
`mouseleave` (no existe en táctil, así que en celular quedaba pausado
para siempre tras el primer toque). Desplegado a producción y verificado
por BUILD_ID coincidente entre el build local y lo servido en vivo.
Commit en el repo real: `685e195`.
