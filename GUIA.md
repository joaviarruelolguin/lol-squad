# Guía de uso — ZSUR LoL

Guía rápida para usar el dashboard. No hace falta saber nada técnico.

---

## Lo primero: la API key

Arriba del todo hay una barrita con el estado de la API key de Riot:

- 🟢 **Verde**: todo bien
- 🟡 **Amarillo**: le quedan menos de 3 horas
- 🔴 **Rojo**: vencio (pasa cada 24 horas)

Si está en rojo, o no hay ninguna, tenés que poner una:

1. Entrá a [developer.riotgames.com](https://developer.riotgames.com) con tu cuenta de Riot
2. Buscá la seccion **API Key (Development)** y tocá **Generate**
3. Copiá la key (empieza con `RGAPI-`)
4. En la app, tocá **"Cambiar API key"** (o "Agregar" si no hay ninguna)
5. Pegala y tocá **"Verificar y guardar"**

La app la verifica contra Riot antes de guardarla, así que si la pegás mal te avisa al toque.

---

## Las secciones

### 📊 Tabla de posiciones

El ranking de la squad, ordenado por **Flex** primero.

- **FLEX** = partida clasificatoria flexible (5v5, con roles)
- **SOLOQ** = ranked solo/duo (1v1 o 2v2)
- La **coronita 👑** marca al primero

Abajo de cada jugador están los campeones que más masterea.

Para sumar a alguien: completá el formulario de la derecha con su Riot ID (nombre + tag) y el rol. **Si el Riot ID no existe, no lo guarda** — lo verifica contra la API real.

---

### 🎮 Análisis de Flex

Acá están las últimas partidas Flex de la squad.

**Cada partida muestra:**
- Fecha, duracion y version del juego
- Quiénes de la squad judío y si ganaron
- Los dos equipos con KDA, daño (barra), vision y oro
- **Puntos débiles** detectados automáticamente

**El Coach IA** (arriba del todo de esta seccion):

1. Elegís una partida del desplegable
2. Te muestra los **diferenciales de línea**: tu equipo (verde) contra los rivales (roto) en oro y XP a los 10 y 15 minutos, y el detalle por línea
3. Escribís una pregunta y te responde

Preguntas que le funcionan bien:
- *"¿Qué salió mal en esta partida?"*
- *"¿Cuántas veces murió fulano?"*
- *"¿Qué le dirías a cada uno para mejorar?"*

Los chats se guardan solos. Los encontrás con el botón **"Chats"** (hasta 10, los más viejos se borran solos).

---

### 🤝 Sinergia

Tres cosas:

**Tendencias** — un panel por jugador con:
- Los últimos 10 resultados (verde = victoria, rojo = derrota)
- En qué franja de 5 minutos muere más seguido
- A qué hora del día le va peor
- Qué día de la semana le complica
- Su racha actual

**Matriz de tríos** — los grupos de 3 con mejor winrate. Fijate en los que tienen **5+ partidas**: un trío 2/2 al 100% no significa nada.

**Recomendador de composición** — qué combinaciones de campeones funcionan mejor. Está ordenado por confianza (más partidas primero).

---

### 📈 Stats

**Premios** —(tags automáticos que salen de las estadísticas):
- 💀 El que más se murio
- 👁️ Ward Bot
- 🔥 Máquina de kills
- 🦅 Ojo de halcon
- 🚀 / 📉 Rachas

**Promedios** — 6 gráficositos con el promedio de cada jugador en daño, vision, CS, KDA, oro y porcentaje del daño del equipo. Cada jugador tiene un color fijo en todos los gráficos.

**Tilt Meter** — le afecta perder?
- **Verde**: winrate después de ganar la partida anterior
- **Rojo**: winrate después de perder
- **Gap**: cuánto le afecta perder (si es negativo, le hace bien perder — no te lo crees pero pasa)

---

### 📅 Semanal

Genera un resumen con IA de las últimas 1/2/4/8 semanas.

1. Elegís el período
2. Tocás **"Generar resumen semanal"**
3. Te arma:
   - Un resumen de como les fue la semana
   - **3 cosas para mejorar por jugador**, basados en sus números reales

Se guarda en la base, así que podés volver a ver los resúmenes viejos.

---

### 👑 Liga de Customs

Torneo interno entre ustedes.

**Para registrar una partida:**
1. Ponés los nombres de los equipos
2. Seleccionás quién juega en cada uno
3. Opcional: scores, quién gano, MVP
4. **Victoria = 3 puntos, MVP = +1 bonus**

**Balanceo automático:** si no sabés como armar los equipos, seleccionás quiénes juegan hoy y tocás **"Repartir en 2 equipos"**. La app los reparte según el rendimiento real de cada uno en Flex.

---

## Botones del header

| Boton | Qué hace |
|-------|----------|
| **Actualizar** | Vuelve a leer los datos desde la caché. Rápido, no consulta a Riot. |
| **Forzar** | Borra TODAS las cachés y vuelve a pedir todo a Riot. Lento y come rate limit. Usalo solo si los datos están viejos de verdad. |

Cada seccion tiene su propio boton de actualizar si necesitás solo recargar esa parte.

---

## Tips

**Los datos tardan un poco la primera vez.** La app baja las partidas de Riot y las guarda en la base. Después es instantáneo.

**Si ves "rate limit"**, estás pidiendo demasiadas cosas seguidas. Esperá unos segundos o usá "Forzar" en vez de "Actualizar" repetidamente.

**La API key vence cada 24h.** No es un bug, es la política de Riot para keys de desarrollo. Cuando el badge se pone rojo, cambiala.

---

## Preguntas frecuentes

**Puede ver cualquiera los datos?**
Sí, la app es pública para quien tenga el link. No guarda contraseñas ni datos personales, solo estadísticas públicas de Riot.

**Mis datos de Riot se usan para algo más?**
No. Solo se consultan para armar las estadísticas y se guardan promediados.

**Qué pasa si borro un jugador?**
Desaparece de la tabla pero las partidas ya analizadas quedan en la base. Si lo volvés a agregar, recupera sus stats.