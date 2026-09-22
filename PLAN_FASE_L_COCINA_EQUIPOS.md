# PLAN — Fase L: Cocina como módulo de gestión, Equipos con jerarquía, Presentismo con semáforo y Chat

Documento de diseño para la reunión de hoy a la tarde (22/09/2026). No es
código todavía — es la arquitectura para acordar antes de construir, tal
como venimos trabajando (primero definimos, después implementamos por
bloques sin romper lo que ya funciona: Casos, Proyectos, Equipos básico,
Check-ins, Presentismo básico).

---

## 1) Diagnóstico rápido: el problema que viste en el form de insumos

Tenés razón, y es un síntoma de algo más grande, no un bug puntual: **el
alta de un insumo (catálogo) y el ingreso de cantidad (stock) son dos
cosas distintas, y hoy el sistema solo tiene la primera.**

Es exactamente el patrón de un sistema de punto de venta (POS):
- **Catálogo de producto** ("Bolsa de Papa", unidad Kilos, categoría
  Materia Prima, costo, punto de pedido/reposición) → se carga **una
  sola vez**.
- **Movimiento de stock** (entró 1 lote de 25kg de papa el 22/09, motivo
  "donación", opcionalmente con vencimiento) → se carga **cada vez que
  entra o sale mercadería**, y de la suma de esos movimientos sale el
  "stock actual" del insumo.

Hoy el form de "Nuevo insumo" es solo el catálogo. Falta la pantalla de
**"Ingresar stock"** (o "Registrar entrada"), que es donde vas a poner
"entraron 20kg de papa". Esto es la Fase L, punto 3.

---

## 2) Dos tipos de "cosas" en Cocina — no son lo mismo y no deben vivir en la misma tabla

Esto es la base de todo lo demás, así que lo defino primero.

### A) Insumos consumibles
Papa, zanahoria, arroz, lentejas, caldos, bandejas descartables,
cubiertos descartables, cofias, guantes. **Se cuentan, se gastan, no
vuelven.** Modelo: catálogo + movimientos de stock (punto 3).

### B) Ítems reutilizables (activos con custodia individual)
Conservadoras, ollas, cucharones, termos. **No se cuentan como "5kg de
conservadora"** — cada unidad es un objeto individual con nombre/código
propio ("Conservadora Azul #1", "Termo Verde #2") que **en todo momento
está en poder de alguien**, y necesitás saber quién lo tiene ahora y su
historial de traspasos (justo lo que pediste: "debemos poder pasar la
conservadora de un usuario a otro... trazabilidad de dónde están los
insumos que no se consumen").

Por qué separarlos: si mezclás ambos en la misma tabla de "insumos", el
sistema de stock por cantidad (decrementar al usar) no tiene sentido
para una conservadora (no se "gasta", circula), y el sistema de
custodia/traspaso no tiene sentido para una bolsa de papa (se come, no
vuelve). Son dos máquinas de estados distintas.

---

## 3) Stock de consumibles — modelo tipo POS

**`Insumo`** (catálogo, alta única):
`nombre, unidad (kg/unidad/litro/paquete), categoría, esEquipoReusable
(false), costoPorUnidad, puntoDePedido, puntoDeReposición, stockActual
(calculado)`

**`MovimientoStock`** (cada entrada/salida, es el corazón del punto de
venta invertido — "punto de compra/uso"):
`insumoId, tipo (ingreso | egreso_cocina | ajuste | merma), cantidad,
fecha, lote (opcional), vencimiento (opcional), motivo, costoUnitario
(opcional), registradoPor, asignacionCocinaId (opcional — si el egreso
fue porque se le dio a un voluntario para cocinar)`

`stockActual` de un insumo = suma de sus movimientos. Cuando llega al
`puntoDePedido`, se dispara la notificación que ya tenías pensada
("se avisa por email/en el sistema a quienes manejan logística").

Con vencimiento por lote, además te dejo la puerta abierta a alertar
"este lote de X vence en 3 días" — lo marco como una mejora de fase
posterior (Fase L.2), no es bloqueante para hoy.

---

## 4) Ítems reutilizables — modelo de custodia (el "quién tiene qué")

**`ItemReutilizable`** (alta única, uno por unidad física):
`nombre/código (ej. "Conservadora Azul #1"), tipo (conservadora | olla |
cucharón | termo | otro), estadoActual (en_deposito |
asignado_a_cocinero | en_transito | en_despacho | devuelto), enPoderDeId
(userId o null si está en depósito)`

**`ItemMovimiento`** (el historial — la trazabilidad que pediste):
`itemId, deUserId (o null si sale de depósito), aUserId (o null si
vuelve a depósito), fecha, contexto (asignacionCocinaId opcional),
notas`

Flujo típico de un domingo:
1. Coordinador de Cocina arma el Kit de la semana → el sistema pasa
   `n` conservadoras/ollas de `en_deposito` a `asignado_a_cocinero`,
   con `enPoderDeId` = el voluntario que cocina.
2. El cocinero, al terminar, hace clic en **"Entregar a [nombre del
   voluntario de despacho]"** → nuevo `ItemMovimiento`, `enPoderDeId`
   pasa al de despacho, estado `en_transito`.
3. El de despacho, al terminar el reparto, hace clic en **"Devolver a
   coordinación"** → estado `devuelto`, `enPoderDeId = null`.
4. Coordinación revisa y confirma **"Recibido, vuelve a depósito"** →
   estado `en_deposito`, listo para el próximo domingo.

Con esto, en cualquier momento la vista de Coordinación es una tabla
simple: **ítem | estado | en poder de quién | desde cuándo**. Eso
resuelve exactamente lo que pediste: "quien tiene conservadoras, quien
cocina esa fecha y qué insumos se le dio".

---

## 5) El "remito" de cocina — Kit semanal asignado

**`AsignacionCocina`** (una por domingo, por voluntario que cocina):
`fecha (domingo), cocineroId, coordinadorResponsableId,
porcionesObjetivo, estado (ver punto 6), responsableActualId (quién
tiene la posta ahora mismo — cocinero, o quien recibió la
conservadora)`

**`AsignacionCocinaItem`** (las líneas del remito — mezcla consumibles
+ reutilizables en una sola lista de "lo que se le dio"):
`asignacionCocinaId, tipo (insumo | reutilizable), insumoId o
itemReutilizableId, cantidad (solo si es insumo)`

Esto genera automáticamente:
- Los `MovimientoStock` de egreso para cada insumo consumible de la
  lista (con motivo "uso en cocina", vinculado a esta asignación).
- Los `ItemMovimiento` de asignación para cada reutilizable de la
  lista.

Y el voluntario, en su tablero, ve exactamente lo que describiste:
> "Hola [Nombre], te toca cocinar este domingo. Te asignamos: 5kg de
> papa, 2kg de zanahoria, 1 paquete de lentejas, Conservadora Azul #1,
> Olla Grande #2, Cucharón #3."

Como una orden/remito, tal cual lo pediste.

---

## 6) Estados de cocina — nombres propuestos

Pediste que elija yo los términos. Van 6 estados, pensados para que un
voluntario sin capacitación entienda cuál toca tocar sin dudar, y que
mapeen 1 a 1 con las fotos/checklist que ya usás en la cabeza:

| Orden | Estado (código) | Lo que ve el voluntario | Color sugerido |
|---|---|---|---|
| 1 | `asignado` | "Kit asignado — todavía no empezaste" | Gris |
| 2 | `preparando` | "Preparando / cortando" | Amarillo |
| 3 | `cocinando` | "En cocción" | Amarillo |
| 4 | `envasando` | "Envasando en conservadoras/termos" | Amarillo |
| 5 | `listo_para_retirar` | "Listo — esperando que lo retiren / salgo para el punto de encuentro" | Verde |
| 6 | `entregado` | "Entregado en punto de encuentro" | Verde (cierra) |

El propio cocinero toca un botón grande para avanzar de estado (no hace
falta que tipee nada), y Coordinación ve la lista de todos los
cocineros del domingo con su estado actual en una sola pantalla —
justo la "vista del estado de la cocina" que pediste.

---

## 7) Equipos — funciones y jerarquía

### Funciones (no son roles de sistema, son "sombreros" dentro de un equipo)
Un mismo usuario puede tener más de una función en el mismo equipo:
`coordinador, relevo, extraccion, despacho_comida, despacho_bebida,
despacho_infusion, general`

(`despacho_comida` + `despacho_infusion` combinados = simplemente el
usuario tiene ambas funciones marcadas, no hace falta una función
compuesta nueva.)

### Jerarquía — decisión de diseño (la que pediste que tome yo)
Propongo **jerarquía plana por equipo, no árbol de niveles**: cada
Equipo tiene **un Coordinador** y **N miembros**, todos los miembros
reportan directamente al coordinador de su equipo. Es lo que ya se
ajusta a cómo armás los equipos hoy (screenshot "Equipo 1", sin niveles
intermedios), y es lo que un voluntario necesita ver en su tablero:

> "Esta semana estás en **Equipo 1**, tu función es **Despacho de
> comida**, tu coordinador es **[Nombre]**, van a la **Zona 1
> Independencia y Belgrano**. Tus compañeros de equipo: [lista]."

Si en el futuro necesitás sub-jefes dentro de un equipo grande, se
agrega un campo opcional `reportaAId` en el miembro (por defecto
apunta al coordinador) — no rompe nada, lo dejo como extensión posible,
no lo construyo ahora porque hoy no lo necesitás y agregaría
complejidad sin uso real.

**`EquipoMiembro`**: `equipoId, userId, funciones[] (multi-select),
reportaAId (opcional, default = coordinador del equipo)`

---

## 8) Presentismo + Check-in del día — el "semáforo"

Buena noticia: **no hace falta inventar un sistema nuevo de estados
para esto — el Check-in que ya construimos ES el semáforo.** Solo hay
que (a) agregarle un estado de confirmación previo, (b) pintarlo con
color, y (c) mostrarlo agrupado por persona en una tabla.

### Paso 1 — Confirmación semanal (nuevo)
El sistema dispara una notificación (push + en el tablero) el
[día que definan en Admin, ej. jueves]: **"Domingo 27/09, 9:00hs, punto
de encuentro Plaza X — ¿confirmás asistencia?"**. El voluntario responde
Sí/No. Esto llena:

`ConfirmacionSemanal`: `userId, fecha (domingo), respuesta (confirmado |
no_asiste | sin_responder), respondidoEn`

- **Gris** = `sin_responder`
- **Rojo** = `no_asiste`
- **Verde** = `confirmado`

### Paso 2 — El día domingo, estado en vivo (ya existe, solo se visualiza distinto)
Reusa tu tabla `CheckIn` tal cual está (`en_camino, llegamos,
presente_en_punto_de_encuentro, presente_en_zona, entregando_viandas,
relevando_caso`) + le agrego un estado de cierre `finalizado`. El
sistema manda el "buenos días, ¿cómo vas?" a los que confirmaron, y
ellos van tocando botones grandes de check-in durante el día — que es
exactamente el flujo que describiste.

### Vista para Coordinación — tabla semáforo
Una fila por voluntario confirmado, con el color = **el check-in más
reciente de esa persona** (no un estado nuevo separado):

| Color | Cuándo |
|---|---|
| Gris | No confirmó todavía / confirmó pero el domingo no arrancó |
| Amarillo | `en_camino` |
| Verde | `llegamos`, `presente_en_punto_de_encuentro`, `presente_en_zona`, `entregando_viandas`, `relevando_caso` (está activo en terreno) |
| Azul | `finalizado` (volvió, cerró el día) |
| Rojo | `no_asiste` |

Esta misma tabla alimenta Presentismo (ya lo tenías previsto) y el KPI
de "voluntario más activo" (contando check-ins/asignaciones a lo largo
del tiempo).

---

## 9) Chat

Tres canales, no uno solo (para que no se mezcle todo):
1. **General** — todos los usuarios activos.
2. **Por Equipo** — solo los miembros del equipo de esa semana
   (se recrea/filtra automáticamente según la asignación semanal).
3. **Coordinadores** — solo usuarios con función `coordinador` en
   algún equipo (para bajada de línea entre coordinadores sin ruido).

Mensajería simple (texto + opcionalmente foto), con push notification
en mensajes nuevos si el usuario no tiene el chat abierto. No propongo
mensajes privados 1-a-1 en esta fase — agrega superficie de moderación
y no lo pediste; si hace falta lo sumamos después.

---

## 10) Notificaciones push — dónde se disparan exactamente

| Evento | A quién |
|---|---|
| Confirmación semanal abierta | Todos los voluntarios activos |
| Recordatorio si no respondió (24hs antes) | Los que están en `sin_responder` |
| "Buenos días" + arranca check-in | Los que confirmaron `sí` |
| Kit de cocina asignado | El voluntario cocinero asignado |
| Insumo llegó a punto de pedido | Coordinador de Cocina + Logística |
| Ítem reutilizable traspasado a vos | El nuevo `enPoderDeId` |
| Mensaje nuevo en chat (si no está abierto) | Miembros del canal correspondiente |

---

## 11) Orden de construcción propuesto (para no romper nada)

No se construye todo junto — mi recomendación de secuencia, cada bloque
deployable y probado antes del siguiente:

1. **Stock consumibles**: `MovimientoStock` + pantalla "Ingresar stock"
   + `stockActual` calculado + alerta de punto de pedido. *(Resuelve tu
   bug de hoy, es la base de todo lo demás.)*
2. **Ítems reutilizables**: alta + estado de custodia + traspasos +
   vista "quién tiene qué".
3. **Kit de cocina semanal**: `AsignacionCocina` + remito +
   descuenta stock automáticamente al asignar.
4. **Estados de cocina**: los 6 botones + vista Coordinación en vivo.
5. **Equipos con función + jerarquía**: extender `EquipoMiembro`,
   tablero personal "esta semana estás en...".
6. **Confirmación semanal + semáforo**: nueva tabla + recoloreo del
   check-in existente + vista tabla para Coordinación.
7. **Chat**: los 3 canales + push.

Los puntos 1 a 4 son el corazón de lo que pediste ("Cocina como
módulo completo") y los dejaría como el foco de esta fase. 5, 6 y 7 los
podemos arrancar en paralelo si la reunión de hoy define que son
igual de urgentes.

---

## 12) Preguntas para cerrar hoy en la reunión

1. **Confirmación semanal**: ¿qué día de la semana se abre (jueves? viernes?) y quién carga el punto de encuentro/hora de cada domingo — Admin, a mano cada semana?
2. **Reutilizables**: ¿arrancamos con conservadoras/ollas/cucharones/termos como las primeras unidades a dar de alta, o hay más tipos de equipo que se me estén pasando?
3. **Vencimientos por lote**: ¿es necesario para esta fase o lo dejamos para L.2? (afecta a insumos como leche en polvo, conservas — no a lo que se cocina el mismo día).
4. **Chat de coordinadores**: ¿lo arrancamos ya o esperamos a que haya más de un coordinador activo por área además de vos?
5. **Jerarquía plana por equipo** (punto 7): ¿confirmás que alcanza por ahora, sin sub-jefes dentro de un equipo?

---

## 13) Corrección honesta + estado real después de la reunión (22-23/09/2026)

Antes de nada, una corrección que te debo: al escribir este documento **no
revisé primero si algo de esto ya existía en el código** — y gran parte SÍ
existía, de una fase anterior (lo que acá llamo "Fase K") que ya había
construido buena parte del modelo de datos que describo arriba: stock de
consumibles vs. reutilizables con custodia (`StockItem`/`StockCustody`/
`StockMovement`), estados de cocina (`KitchenBatch` y sus 6 etapas),
Equipos (`FieldTeam`/`FieldTeamMember`), confirmación semanal
(`WeeklyAvailability`), Zonas y el semáforo de check-ins
(`Checkin` con los mismos 6 tipos que describo en el punto de
"semáforo"). Lo que faltaba no era construir todo esto de cero — era
**wirear/extender** lo que ya estaba, más lo puntual que pediste en tus
respuestas. Te lo aclaro para que sepas que el trabajo real fue más
acotado de lo que este documento hacía parecer.

### Tus 5 respuestas, implementadas

1. **Confirmación semanal, ¿viernes o sábado?** → Viernes (te daba la
   opción, elegí viernes: deja todo el fin de semana para armar equipos
   antes del domingo). Ya está andando — ver punto "avisos programados"
   abajo.
2. **Reutilizables como stock fijo/patrimonio** → Confirmado, no se tocó
   nada nuevo: el `isReusable` que ya existía en el catálogo de stock
   alcanza para esto.
3. **Vencimientos** → Quedan afuera de esta fase, como pediste.
4. **Alta de usuario más completa** (14 coordinadores reales no estaban
   cargados) → Implementado: el formulario de alta/edición de usuario
   (pestaña Administración → Usuarios) ahora tiene foto de perfil, CV
   adjunto, domicilio, teléfono alternativo, fecha de nacimiento, sexo,
   habilidades, días y horarios disponibles. Todo opcional — el alta
   rápida de siempre (nombre + email + rol) sigue andando igual.
5. **Sin sub-jefes** → Confirmado. Cada equipo tiene un solo coordinador
   (`coordinatorUserId`, editable desde la pestaña Equipos) y cada
   integrante puede tener una o más funciones (relevo, extracción,
   despacho de comida/bebida/infusión, general) en vez de un segundo
   nivel de jerarquía.

### Los 3 bugs que reportaste en el P.D.

- **"Agrego integrantes desde el caso/proyecto y no se reflejan"** →
  Causa real: la función para agregar/quitar miembros de un proyecto
  existía en el backend desde antes, pero **ningún lado del frontend la
  llamaba** — no es que no se reflejara, es que nunca se llegaba a crear.
  Arreglado: Vista General de un proyecto ahora tiene el selector para
  agregar integrantes (con su rol) y un botón para quitarlos.
- **"Los avisos programados no están funcionando"** → Causa real: existía
  el campo para marcar un recordatorio como "ya avisado"
  (`Reminder.notifiedAt`) pero nada lo leía para efectivamente mandar el
  aviso — se guardaban y quedaban ahí para siempre, sin disparar nada.
  Arreglado: un chequeo cada 5 minutos, adentro del mismo proceso de la
  API (sin sumar servicios ni procesos nuevos al hosting — justo hoy
  pegamos contra el límite de procesos de la cuenta, así que evité
  agregar más), que manda el recordatorio cuando vence Y el aviso
  semanal de "¿venís el domingo?" los viernes.
- **"Los procesos no se pueden eliminar, solo agregar"** → Revisé a fondo
  el endpoint de borrado, el control de acceso y la cascada en la base —
  no encontré ninguna asimetría entre crear y borrar; debería funcionar.
  No pude reproducir una falla real. Lo que sí hice: si vuelve a fallar,
  ahora la pantalla te va a mostrar el mensaje de error real en vez de
  fallar en silencio (antes no tenía manejo de error). Si te vuelve a
  pasar, contame el mensaje exacto que aparece y lo sigo desde ahí — puede
  ser un caso puntual (permisos, un proceso con tareas en un estado
  particular) que todavía no vi.

### Lo que quedó afuera de esta sesión

- **Chat de coordinadores** (los 3 canales del punto 9 del documento): no
  se tocó. Es la pieza más grande que falta del diseño original y
  conviene encararla como su propio bloque, no apurada al final de una
  sesión ya larga.
- **Kit de cocina semanal con descuento automático de stock** (punto 3 del
  diseño): el modelo de datos ya existe (`KitchenBatch` y afines de Fase
  K), pero no se tocó nada nuevo acá — si hace falta ajustar el flujo de
  asignación, es la siguiente pieza natural a mirar.

### Qué está en producción ahora mismo

Todo lo de "Tus 5 respuestas, implementadas" y "Los 3 bugs" de arriba está
desplegado y verificado en `gestion.vidasolidariamdp.com` /
`api.vidasolidariamdp.com` (incluida la migración de base de datos). Nota
técnica para el próximo despliegue: `prisma migrate deploy` por SSH está
fallando en este hosting con un panic de conexión ("timer has gone away")
en procesos lanzados ad-hoc — la solución que quedó andando es que la
propia API aplica las migraciones pendientes al arrancar
(`ensure-migrations.ts`), así que un `touch tmp/restart.txt` alcanza para
que una migración nueva se aplique sola.

## 14) Bloque "Kit semanal + tablero del voluntario" (23/09/2026)

Elegiste este bloque como prioridad después de la revisión honesta del
punto 13 — cubre 3 de los ítems del diseño original que estaban marcados
como faltantes. Desplegado y verificado en producción (API + web).

**1. Armar el kit en un solo paso desde Cocina** — antes, el equipamiento
reusable (conservadora, olla) no tenía ninguna conexión con un lote de
cocina: vivía únicamente en el préstamo suelto de la pestaña Stock, y si
intentabas sumarlo como "insumo" de un lote, la API lo rechazaba (es
equipamiento, no se consume). Ahora, el mismo modal de detalle de un lote
(pestaña Cocina → abrís un lote) tiene una sección nueva "Equipamiento
(kit)" al lado de "Insumos": elegís conservadora/olla/termo, cantidad, y
queda sumado al kit a nombre del responsable de esa cocina — un préstamo
más, pero linkeado al lote. Requiere haber asignado un responsable arriba
primero (el kit queda a su nombre).

**2. Vista personal del voluntario asignado** — nuevo widget destacado
arriba del todo en el Dashboard ("Te toca cocinar — [nombre del lote]"),
que le aparece a cualquier persona logueada que sea responsable o esté
asignada a un lote de cocina activo (no entregado todavía) — sin
necesitar permiso de logística, autogestionado como Presentismo. Muestra
el estado actual, las porciones objetivo, y la lista completa de lo que
se le asignó (insumos + equipamiento, remito-style), con un link directo
a Cocina para ver el detalle completo.

**3. Traspaso directo de custodia (cocinero → despachador)** — antes había
que devolver el préstamo (queda "sin dueño" un rato) y después prestarlo
de nuevo a la próxima persona: dos llamadas separadas. Ahora hay un botón
"Pasar a otra persona" (en Stock, junto a cada ítem prestado, y también
dentro del detalle de un lote de Cocina) que cierra el préstamo viejo y
abre uno nuevo a la vez — un solo paso, con historial completo de todos
modos (se ve en "Ver historial" de cada insumo).

Nota técnica: se agregó `StockCustody.batchId` (nullable, migración
`20260922192817_fase_l_kit_semanal_custodia_batch`) para poder linkear un
préstamo de equipamiento a un lote de cocina sin tocar el ledger de
`StockMovement` (que sigue siendo exclusivo de lo que se consume).

### Lo que sigue quedando afuera

- **Chat de coordinadores**: sigue sin tocar, es la pieza más grande que
  falta.
- **Vista semáforo en vivo agrupada**, **día/hora/punto de encuentro
  configurable**, **aviso automático "buenos días" el día del evento**,
  **KPI de usuario más activo**, **ampliación de Stock** (dijiste que
  falta más profundidad — todavía no definimos exactamente qué) y
  **catalogación completa de Stock** (dijiste "sigue sin catalogar" — necesito
  que me cuentes puntualmente qué te falta ver ahí, porque lo que
  encontré en el código ya cubre catálogo + código automático + categoría
  + costo + punto de pedido).
