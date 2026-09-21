# PLAN — Fase K: Voluntariado, Presentismo, Cocina, Casos, Stock y Analítica

> Estado: **F + C entregados y en producción (21/09/2026)**. Este documento
> traduce el pedido de Josecito (21/09/2026) a diseño técnico concreto,
> contrastado contra el schema y las rutas YA existentes (no se repite
> trabajo hecho). Sigue en **A) Alta pública de voluntarios**. Actualizar el
> estado de cada bloque a medida que se entrega.

## Método

Igual que siempre en este repo: nunca todo junto. Cada bloque de acá abajo es
un milestone independiente (o varios), con su propia migración de Prisma,
sus rutas, su UI y su verificación end-to-end antes de pasar al siguiente.

---

## A) Alta pública de voluntarios (NUEVO)

**Dónde**: formulario en `vidasolidariamdp.com` (sitio estático en
`~/domains/vidasolidariamdp.com/public_html/` en el mismo servidor de
Hostinger — HTML/CSS/JS plano, sección "Sumate" ya existe pero su botón
"Quiero sumarme ahora" hoy solo linkea a vidasolidaria.org). Se reemplaza ese
link por un formulario real (nombre, email, teléfono, por qué querés sumarte)
que postea a un endpoint público nuevo de la API.

**Backend (nuevo)**:
- `UserStatus` pasa de `active | suspended` a `active | pending | rejected |
  suspended` (migración con backfill: todo lo existente queda `active`).
- `POST /api/public/volunteer-signup` (sin auth, rate-limited): crea un
  `User` con `status: pending`, sin rol asignado todavía, dispara el email
  de bienvenida ("recibimos tu registro, la comisión lo va a revisar").
- Vista de aprobación en `/administracion → Usuarios`: los `pending`
  aparecen arriba con un switch "Aprobar". Al aprobarlo: se elige el/los
  rol(es) (reutiliza el flujo de alta que ya existe), pasa a `active`, y
  dispara el email de bienvenida real ("ya sos parte, tu equipo es X" — el
  equipo se asigna después, en el bloque B, así que este email puede salir
  sin equipo todavía y mandarse un segundo aviso cuando se lo asignen).
  Un switch "Rechazar" pasa a `rejected` (no se manda mail negativo por
  default, para no generar fricción — se puede agregar si lo pedís).

**Email**: servicio elegido — **Resend** (plan gratuito, 3.000 emails/mes).
Cuando lleguemos a este bloque necesito que crees la cuenta y me pases la
`RESEND_API_KEY` (o me digas que la cargue yo si me das acceso a tu login).

---

## B) Presentismo y equipos semanales (EXTIENDE Fase I)

**Ya existe**: `FieldTeam` (Equipo 1/2/3…), `FieldTeamMember` (integrantes,
sin fecha — hoy un equipo es fijo), `Zone` + `ZoneAssignment` (equipo → zona,
con `weekStartDate`/`weekEndDate` — esto YA es semanal), `Checkin` con tipos
`en_camino / llegamos / entregando_viandas / relevando_caso`.

**Decisión de diseño a confirmar**: hoy `FieldTeamMember` es fijo (un
voluntario siempre pertenece al mismo equipo). Por lo que describís, la
composición de cada equipo se arma de nuevo cada domingo según quién
confirmó asistencia esa semana. Para eso `FieldTeamMember` necesita fecha
(igual que `ZoneAssignment`), no ser fijo — así el historial ("quién estuvo
en qué equipo cada domingo") queda registrado y alimenta el ranking de
usuarios más activos. **¿Confirmás este cambio o preferís mantener equipos
fijos con excepciones puntuales?**

**Nuevo — dos instancias de presente**:
1. **Intención semanal** (nuevo modelo `WeeklyAvailability`: usuario, domingo,
   `willAttend` sí/no + motivo opcional si es no). El usuario la carga
   durante la semana. Es el insumo para que coordinación arme los equipos.
2. **Confirmación de coordinación** (sábado/domingo a la mañana): coordinación
   marca en `WeeklyAvailability.confirmedPresent` si finalmente vino o no
   (aparte de lo que había dicho), ya con el equipo asignado.
3. **Presente en punto de encuentro** y **presente en zona**: se resuelven
   reutilizando `Checkin` (ya tiene user/team/lat/lng/timestamp) agregando
   dos tipos nuevos al enum: `presente_punto_encuentro` y `presente_zona`
   (más claros que el actual `llegamos`, que quedaba ambiguo entre las dos
   cosas). El punto de encuentro fijo es **Bv. Marítimo (Av. Patricio Peralta
   Ramos) 2502** (verificado — es la puerta del NH Gran Hotel Provincial).

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

## D) Circuito de Casos — asignación con roles + notificaciones (EXTIENDE Fase J)

**Ya existe**: `Case` (individual/pareja/grupo_familiar), `CaseMember`,
`CaseContactHistory`, `CaseStatusHistory`, `CaseViability` (alta/media/baja
— esto YA es tu "probabilidad de extracción"), `CaseFeasibility`
(factible/no_factible/en_pausa — esto YA es tu "caso que se cierra por no
ser posible seguir").

**Falta (nuevo)**: no hay ningún vínculo entre un `Case` y los usuarios que
lo llevan. Se agrega `CaseAssignment` (caseId, userId, `role` — enum
`coordinador | visitador_social | psicologo | seguimiento_laboral |
seguimiento_conducta`, `assignedAt`, `unassignedAt` opcional). Un caso puede
tener varios usuarios con distintos roles a la vez.

**Notificaciones por email (nuevas, sobre el mismo Resend del bloque A)**:
- Al asignar/desasignar un usuario a un caso → email a ese usuario.
- Al agregar una entrada en `CaseContactHistory` (evolución) → email a todos
  los asignados al caso (menos a quien la cargó).
- Al cambiar `CaseStatusHistory` a un estado de cierre (`feasibility:
  no_factible` o el estado que definan como "cerrado") → email a los
  asignados con el motivo (`closeReason`, campo que ya existe).

---

## E) Relevamiento — KPI de carga + buscador (EXTIENDE Fase J)

- **Timestamp de carga**: agregar `Case.surveyStartedAt` (se setea en el
  frontend al abrir el formulario "Nuevo caso", no al guardar) — el KPI
  "tiempo de carga" sale de `createdAt - surveyStartedAt`. Si el formulario
  se abre y se abandona sin guardar, no genera dato (correcto, no hay caso
  creado).
- **Buscador anti-duplicados**: `GET /api/cases/search?q=` (por nombre, alias
  o DNI) para que el que releva pueda chequear "¿esta persona ya está
  cargada?" antes de crear un caso nuevo — si aparece, entra a ese caso
  existente y agrega una entrada en `CaseContactHistory` en vez de duplicar.
  Se engancha como primer paso del flujo "Nuevo caso" en el frontend.

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

## G) Analítica e indicadores (NUEVO módulo completo)

Hoy `apps/api/src/modules/analytics/` solo tiene un `README.md` — no hay una
sola ruta construida. Se arma `GET /api/analytics/*` (permiso ya existe:
`analytics.read`) con, como mínimo:

- **Casos**: edad promedio, distribución por sexo, tiempo de permanencia
  promedio (días desde `createdAt` hasta cierre o hasta hoy si sigue activo),
  habilidades más recurrentes (agrupa `CaseSkill.skillLabel`), cantidad con/
  sin teléfono cargado (campo `phone`), cantidad por `viability` (alta/media/
  baja probabilidad de extracción).
- **Presentismo**: ranking de usuarios por asistencias confirmadas
  (`WeeklyAvailability.confirmedPresent`) en los últimos N domingos.
- **Producción**: bandejas entregadas y litros de té/café/mate cocido por
  domingo (suma de `FieldDelivery` agrupada por semana).
- Vista nueva en el frontend (`/analitica` o una pestaña dentro de
  `/administracion`) con tarjetas + la librería de gráficos ya usada en el
  resto de la plataforma.

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

## Preguntas abiertas (antes de tocar código de D)

1. ¿Qué cuenta como "caso cerrado" a efectos del email de cierre — un campo
   de estado específico, o alcanza con `feasibility = no_factible`?

## Orden de construcción

1. ~~**F (catálogo de stock real) + C (ampliar estados de cocina)**~~ —
   **entregado y en producción el 21/09/2026.**
2. **A (alta pública + aprobación + Resend)** — siguiente. Desbloquea tener
   email andando, que después reutiliza D. Necesita que Josecito cree la
   cuenta de Resend y pase la `RESEND_API_KEY` en algún momento de este
   bloque (no bloquea empezar: el sistema funciona sin ella, solo no manda
   los mails hasta que se cargue).
3. **B (presentismo + equipos semanales)** — el más grande de este lote, ya
   con la pregunta 1 original resuelta (equipos semanales confirmado).
4. **D (asignación de casos con roles + notificaciones)** y **E (KPI de
   relevamiento + buscador)** — en paralelo, son independientes entre sí.
5. **G (analítica)** — al final, porque consume datos de todos los
   anteriores (mientras más bloques estén cargando datos reales, más útil
   sale el tablero).
