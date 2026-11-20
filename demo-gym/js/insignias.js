/* =============================================================================
 * insignias.js — El catálogo de insignias, medallas y niveles. Y su dibujo.
 *
 * Carlos, 30-ago-2026: *«que se vea la racha que lleva, pequeños logros,
 * veteranía, insignias que diseñaremos (…) medallas en función de PR que tengas
 * para poderte poner en el perfil»*.
 *
 * Y sobre el primer intento: *«las insignias están bastante mediocres, se ven
 * super toscas y nada modernas»*. Tenía razón, y la causa es concreta: estaban
 * dibujadas contra el diseño VIEJO (azul y gris) con hexágonos de metal,
 * degradados de oro y plata y biseles. Eso es la estampita de mérito de 2012, y
 * al lado del rediseño 0.10.0 —plano, lima, «menos cajas»— cantaba muchísimo.
 *
 * CÓMO SE DIBUJAN AHORA
 * ---------------------
 * · SQUIRCLE, no hexágono. Toda la app son rectángulos de esquina redonda; un
 *   hexágono con relieve no pertenece a esta familia. El hexágono metálico es,
 *   además, el cliché de la gamificación.
 * · EL NIVEL SE DICE CON EL RELLENO, no con el metal:
 *      1  contorno, sin relleno       — «la tienes»
 *      2  relleno tenue + contorno    — «vas en serio»
 *      3  relleno SÓLIDO de acento    — el mismo trato que un botón principal,
 *                                        que es la señal de «lo máximo» de la app
 *   Así se distingue el nivel en blanco y negro, sin depender del color, sin
 *   galones y sin leyenda.
 * · LO QUE FALTA LLEVA ANILLO DE PROGRESO alrededor. Sustituye a la barrita
 *   suelta de antes: el progreso está EN la pieza, que es donde se mira.
 * · COLOR CON SIGNIFICADO, no decorativo. Las insignias van en `--acento` (el
 *   lima de la app) y las medallas de PR en `--record` (el naranja que la app
 *   YA reserva para los récords). Cero colores nuevos, cero degradados de metal.
 *
 * Todo hereda de los tokens del tema, así que las insignias cambian de color
 * con el tema como el resto de la app — con los hexágonos de metal no podían.
 *
 * REGLA NÚMERO UNO: AQUÍ NO SE CALCULA NADA.
 * Este fichero es una TABLA («la insignia X se gana cuando la métrica Y llega a
 * Z») y un juego de dibujos. Quién ha ganado qué lo decide `perfil.js`. Si el
 * catálogo hiciera cuentas, JARVIS tendría que reimplementarlas en Python y
 * volveríamos al problema de siempre: dos verdades para la misma pregunta.
 *
 * POR QUÉ EL CATÁLOGO ESTÁ EN JSON ESTRICTO
 * -----------------------------------------
 * `gym_perfil.py` (el gemelo de JARVIS) LEE ESTE FICHERO y saca la tabla de
 * entre los marcadores de abajo con `json.loads`. Por eso los arrays van con las
 * claves entre comillas dobles, que en JavaScript es igual de válido.
 *
 * Es a propósito y es importante: `gym_datos.py` es un gemelo copiado A MANO y
 * ya nos mordió una vez (los «91 días» contra `setMonth`). Una lista de 28
 * insignias copiada a mano se desincroniza el primer día que se toque. Así,
 * físicamente, no puede.
 *
 * >>> Si tocas los arrays, NO cambies las líneas `*_INICIO` / `*_FIN`. <<<
 *
 * EL ARTE: UN SISTEMA, NO 30 DIBUJOS
 * ----------------------------------
 * Una insignia = una FORMA (el squircle, con el relleno de su nivel) + un GLIFO
 * (su familia). 10 glifos × 3 niveles dan las 28 y se parecen entre ellas, que
 * es lo que hace que una colección PAREZCA una colección.
 *
 * Los glifos son de trazo 1.8 sobre lienzo de 24, exactamente como `iconos.js`
 * y como los de la barra de abajo: es el mismo dibujo de toda la app. Ni un
 * emoji (el 💪 de un Samsung no se parece al de un Pixel y no se puede teñir) y
 * ni una descarga (la app tiene que abrir en un gimnasio sin cobertura).
 * ========================================================================== */

/* --------------------------------------------------------------------------
 * NIVELES DE PIEZA — cómo se rellena cada uno.
 *
 * No son «metales»: son tres intensidades del MISMO color. El oro, la plata y
 * el bronce obligaban a tres degradados que no pertenecían a la paleta y que
 * ningún tema podía cambiar.
 * ------------------------------------------------------------------------ */
export const NIVELES_PIEZA = {
  1: { id: 'contorno', nombre: 'Bronce' },
  2: { id: 'tenue', nombre: 'Plata' },
  3: { id: 'solido', nombre: 'Oro' },
};

/* Se mantiene el nombre `METALES` porque lo usan la pantalla y los textos, pero
   ya no hay metal: es el nombre del nivel y nada más. */
export const METALES = NIVELES_PIEZA;

/* --------------------------------------------------------------------------
 * GLIFOS — uno por familia. Trazo 1.8 sobre lienzo de 24, como `iconos.js`.
 * ------------------------------------------------------------------------ */
const GLIFOS = {
  // calendario con un visto: «has venido»
  constancia: '<path d="M4 6.5h16v13H4zM4 10.5h16M8.5 3.5v4M15.5 3.5v4"/><path d="M8.5 14.8l2.4 2.4 4.6-4.9"/>',
  // llama — el mismo trazo que usa la tarjeta de la racha
  racha: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
  // barra con discos — el mismo icono «pesa» de iconos.js
  fuerza: '<path d="M4 9v6M20 9v6M7 6v12M17 6v12M7 12h10"/>',
  // discos apilados
  volumen: '<path d="M12 4.4c4.2 0 7.4 1.2 7.4 2.6S16.2 9.6 12 9.6 4.6 8.4 4.6 7 7.8 4.4 12 4.4z"/><path d="M4.6 7v4.5c0 1.4 3.2 2.6 7.4 2.6s7.4-1.2 7.4-2.6V7"/><path d="M4.6 11.5V16c0 1.4 3.2 2.6 7.4 2.6s7.4-1.2 7.4-2.6v-4.5"/>',
  // chincheta de mapa — el mismo «pin» de iconos.js
  explorador: '<path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.6"/>',
  // diana
  disciplina: '<circle cx="12" cy="12" r="8.2"/><circle cx="12" cy="12" r="4.6"/><circle cx="12" cy="12" r="1.1"/>',
  // hoja
  nutricion: '<path d="M20 4.4c0 8.4-4.6 12.6-10 12.6-2 0-3.4-.6-3.4-.6C5.4 10.6 10 4.4 20 4.4z"/><path d="M15.4 8.6C11 11 8.2 14.6 6.2 19.8"/>',
  // sol saliendo por el horizonte
  madrugador: '<path d="M3.4 17.6h17.2M6.6 17.6a5.4 5.4 0 0 1 10.8 0"/><path d="M12 4.2v2.6M5.2 7l1.8 1.8M18.8 7L17 8.8M2.6 13.2h2.4M19 13.2h2.4"/>',
  // luna
  nocturno: '<path d="M20 14.6A8.4 8.4 0 0 1 9.4 4a8.4 8.4 0 1 0 10.6 10.6z"/>',
  // galones de veteranía
  veterania: '<path d="M5 9.4L12 4l7 5.4M5 14L12 8.6 19 14M5 18.6L12 13.2l7 5.4"/>',
};

/* ==========================================================================
 * EL CATÁLOGO
 *
 * `metrica` es una clave del resumen que devuelve `perfil.resumir()`.
 * `meta` es el valor a partir del cual la insignia está ganada (>=).
 * `pista` es lo que se le enseña a quien todavía no la tiene: una insignia
 *   secreta no motiva a nadie, solo confunde.
 * ========================================================================== */

/* INSIGNIAS_INICIO — no toques esta línea: la lee gym_perfil.py */
export const INSIGNIAS = [
  { "id": "constancia1", "familia": "constancia", "nivel": 1, "nombre": "Primera piedra", "pista": "Entrena 5 días", "metrica": "diasEntrenados", "meta": 5 },
  { "id": "constancia2", "familia": "constancia", "nivel": 2, "nombre": "Ya es costumbre", "pista": "Entrena 50 días", "metrica": "diasEntrenados", "meta": 50 },
  { "id": "constancia3", "familia": "constancia", "nivel": 3, "nombre": "Doscientos días", "pista": "Entrena 200 días", "metrica": "diasEntrenados", "meta": 200 },

  { "id": "racha1", "familia": "racha", "nivel": 1, "nombre": "Encendido", "pista": "4 semanas seguidas entrenando", "metrica": "mejorRachaSemanas", "meta": 4 },
  { "id": "racha2", "familia": "racha", "nivel": 2, "nombre": "Tres meses sin fallar", "pista": "12 semanas seguidas entrenando", "metrica": "mejorRachaSemanas", "meta": 12 },
  { "id": "racha3", "familia": "racha", "nivel": 3, "nombre": "Un año entero", "pista": "52 semanas seguidas entrenando", "metrica": "mejorRachaSemanas", "meta": 52 },

  { "id": "fuerza1", "familia": "fuerza", "nivel": 1, "nombre": "Primer récord", "pista": "Bate tu marca en una máquina", "metrica": "prs", "meta": 1 },
  { "id": "fuerza2", "familia": "fuerza", "nivel": 2, "nombre": "Rompemarcas", "pista": "25 récords personales", "metrica": "prs", "meta": 25 },
  { "id": "fuerza3", "familia": "fuerza", "nivel": 3, "nombre": "Cazador de PR", "pista": "100 récords personales", "metrica": "prs", "meta": 100 },

  { "id": "volumen1", "familia": "volumen", "nivel": 1, "nombre": "Diez toneladas", "pista": "Levanta 10 t en total", "metrica": "volumenTon", "meta": 10 },
  { "id": "volumen2", "familia": "volumen", "nivel": 2, "nombre": "Cien toneladas", "pista": "Levanta 100 t en total", "metrica": "volumenTon", "meta": 100 },
  { "id": "volumen3", "familia": "volumen", "nivel": 3, "nombre": "Mil toneladas", "pista": "Levanta 1.000 t en total", "metrica": "volumenTon", "meta": 1000 },

  { "id": "explorador1", "familia": "explorador", "nivel": 1, "nombre": "Cambio de aires", "pista": "Entrena en 2 gimnasios", "metrica": "gimnasios", "meta": 2 },
  { "id": "explorador2", "familia": "explorador", "nivel": 2, "nombre": "De gira", "pista": "Entrena en 4 gimnasios", "metrica": "gimnasios", "meta": 4 },
  { "id": "explorador3", "familia": "explorador", "nivel": 3, "nombre": "Sin casa fija", "pista": "Entrena en 8 gimnasios", "metrica": "gimnasios", "meta": 8 },

  { "id": "disciplina1", "familia": "disciplina", "nivel": 1, "nombre": "Día redondo", "pista": "Termina el día entero una vez", "metrica": "diasCompletos", "meta": 1 },
  { "id": "disciplina2", "familia": "disciplina", "nivel": 2, "nombre": "Sin excusas", "pista": "Termina el día entero 25 veces", "metrica": "diasCompletos", "meta": 25 },
  { "id": "disciplina3", "familia": "disciplina", "nivel": 3, "nombre": "Reloj suizo", "pista": "Termina el día entero 100 veces", "metrica": "diasCompletos", "meta": 100 },

  { "id": "nutricion1", "familia": "nutricion", "nivel": 1, "nombre": "También se come", "pista": "Apunta la comida 7 días", "metrica": "diasNutricion", "meta": 7 },
  { "id": "nutricion2", "familia": "nutricion", "nivel": 2, "nombre": "Cuentas claras", "pista": "Apunta la comida 60 días", "metrica": "diasNutricion", "meta": 60 },
  { "id": "nutricion3", "familia": "nutricion", "nivel": 3, "nombre": "Sabes lo que comes", "pista": "Apunta la comida 200 días", "metrica": "diasNutricion", "meta": 200 },

  { "id": "madrugador1", "familia": "madrugador", "nivel": 1, "nombre": "Antes que el sol", "pista": "10 series antes de las 8:00", "metrica": "madrugones", "meta": 10 },
  { "id": "madrugador2", "familia": "madrugador", "nivel": 2, "nombre": "El del turno de mañana", "pista": "100 series antes de las 8:00", "metrica": "madrugones", "meta": 100 },

  { "id": "nocturno1", "familia": "nocturno", "nivel": 1, "nombre": "Turno de noche", "pista": "10 series después de las 21:00", "metrica": "nocturnas", "meta": 10 },
  { "id": "nocturno2", "familia": "nocturno", "nivel": 2, "nombre": "Cierra el gimnasio", "pista": "100 series después de las 21:00", "metrica": "nocturnas", "meta": 100 },

  { "id": "veterania1", "familia": "veterania", "nivel": 1, "nombre": "Seis meses dentro", "pista": "180 días desde tu primera serie", "metrica": "diasDesdeLaPrimera", "meta": 180 },
  { "id": "veterania2", "familia": "veterania", "nivel": 2, "nombre": "Un año dentro", "pista": "365 días desde tu primera serie", "metrica": "diasDesdeLaPrimera", "meta": 365 },
  { "id": "veterania3", "familia": "veterania", "nivel": 3, "nombre": "Hierro viejo", "pista": "1.095 días desde tu primera serie", "metrica": "diasDesdeLaPrimera", "meta": 1095 }
];
/* INSIGNIAS_FIN — no toques esta línea */

/* ==========================================================================
 * NIVELES DE VETERANÍA
 *
 * Se mide en DÍAS DESDE LA PRIMERA SERIE, no en sesiones. Es antigüedad, no
 * esfuerzo: para el esfuerzo ya están las insignias de constancia. Quien lleva
 * dos años y se lesionó tres meses sigue siendo un veterano.
 * ========================================================================== */
/* NIVELES_INICIO */
export const NIVELES = [
  { "id": "novato", "nombre": "Novato", "desde": 0 },
  { "id": "iniciado", "nombre": "Iniciado", "desde": 30 },
  { "id": "constante", "nombre": "Constante", "desde": 90 },
  { "id": "veterano", "nombre": "Veterano", "desde": 365 },
  { "id": "hierroviejo", "nombre": "Hierro viejo", "desde": 1095 },
  { "id": "leyenda", "nombre": "Leyenda", "desde": 1825 }
];
/* NIVELES_FIN */

/* ==========================================================================
 * MEDALLAS DE PR
 *
 * Carlos: *«medallas en función de PR que tengas para poderte poner en el
 * perfil»*. Van sobre los levantamientos GRANDES, que es donde un número
 * significa algo comparable entre dos personas. Una medalla por «120 kg en
 * extensión de cuádriceps» no diría nada: depende de la máquina.
 *
 * Dos clases, y la diferencia importa:
 *  · `kg`     — hito ABSOLUTO (100 kg en banca son 100 kg aquí y en Cuenca).
 *  · `xPeso`  — múltiplo del PESO CORPORAL. Es la medida honesta: 100 kg de
 *               banca no valen lo mismo pesando 60 que pesando 100. Solo se
 *               puede conceder si hay una pesada apuntada; sin ella, no se
 *               enseña ni ganada ni pendiente, se dice que falta el peso.
 *               Antes eso que dar una medalla calculada sobre un peso inventado.
 *
 * `ejercicios` son NOMBRES del catálogo, en minúsculas y sin tildes. Se
 * comparan contra el nombre de la máquina de Carlos, que puede haberla llamado
 * como quiera; por eso `perfil.js` normaliza los dos lados.
 *
 * El peso que cuenta es el MEJOR LEVANTADO DE VERDAD (kg × reps no vale aquí:
 * una medalla de «100 kg» tiene que ser 100 kg en la barra), normalizado a kg
 * aunque la placa fuera en libras.
 * ========================================================================== */
/* ==========================================================================
 * LOS LEVANTAMIENTOS — y POR QUÉ ESTO EXISTE
 *
 * Carlos, 31-ago-2026: *«con algunas máquinas si cumples los requisitos no lo
 * detecta»*. Tenía razón y el fallo era este: cada medalla llevaba una lista de
 * NOMBRES EXACTOS (`["press de banca"]`) y se comparaba con `===` contra el
 * nombre de la máquina. Pero el catálogo tiene 33 ejercicios cuyo nombre lleva
 * «press de banca» dentro, y el que un usuario elige de verdad casi nunca es el
 * escueto: elige «Press de banca con barra». Resultado: levantaba 100 kg en
 * banca y el «Club de los 100» seguía apagado, sin decir por qué.
 *
 * Ahora una medalla no apunta a un nombre: apunta a un LEVANTAMIENTO, y el
 * levantamiento sabe reconocerse en muchas formas de escribirlo.
 *
 * CÓMO SE RECONOCE (y por qué no vale con «que contenga»)
 * ------------------------------------------------------
 * Con la regla ingenua «si el nombre contiene ›muerto‹», el ejercicio de core
 * **«Bicho muerto»** regalaría la medalla de peso muerto 220. Por eso son dos
 * listas, y las dos hacen falta:
 *
 *   · `todas`   — todos estos trozos tienen que aparecer.
 *   · `ninguna` — si aparece uno solo, NO cuenta.
 *
 * `ninguna` es la que hace el trabajo fino, y lo que hay dentro no es capricho:
 *   · `mancuerna`, `kettlebell`, `polea`, `banda` → no es la misma barra.
 *   · `multipower` (máquina Smith) → la barra va guiada por dos raíles; 100 kg
 *     ahí no son 100 kg libres, y una medalla que se pueda ganar por el camino
 *     fácil no vale nada.
 *   · `inclinado`, `declinado`, `frontal`, `rumano`, `sumo`… → son otros
 *     ejercicios, más flojos o más fuertes que el de referencia.
 *   · `una pierna`, `a una mano` → la mitad del cuerpo, la mitad del peso.
 *
 * Y `exactos` es la puerta de atrás para los nombres que la regla no pillaría
 * pero que cualquiera reconoce («banca», «press banca», «squat»).
 *
 * SI AUN ASÍ NO LO PILLA, MANDA LA PERSONA
 * ----------------------------------------
 * Ninguna lista de trozos acierta con todo el mundo: hay quien llama a su
 * máquina «La banca del fondo». Por eso una máquina puede llevar
 * `levantamiento: 'banca'` escrito a mano desde su ficha, y eso gana a
 * cualquier regla de aquí. Ver `perfil.levantamientoDe()`.
 * ========================================================================== */
/* LEVANTAMIENTOS_INICIO */
export const LEVANTAMIENTOS = [
  { "id": "banca", "nombre": "Press de banca", "glifo": "banca",
    "todas": ["press", "banca"],
    "ninguna": ["mancuerna", "kettlebell", "polea", "banda", "elastica", "multipower", "maquina", "inclinado", "declinado", "inverso", "invertido", "giro", "jm", "guillotine", "agarre cerrado", "suelo", "bosu", "pelota", "una mano", "alterno", "pasador", "stalder"],
    "exactos": ["banca", "press banca", "press de banca", "press de banca con barra", "press plano", "press de banca plano", "press de pecho con barra", "press banca plano"] },

  { "id": "sentadilla", "nombre": "Sentadilla con barra", "glifo": "sentadilla",
    "todas": ["sentadilla"],
    "ninguna": ["mancuerna", "kettlebell", "polea", "banda", "elastica", "multipower", "maquina", "bulgara", "sissy", "salto", "una pierna", "cossack", "curtsey", "split", "frontal", "jefferson", "frankenstein", "hack", "goblet", "pistol", "bosu", "pared", "isometrica", "sumo", "lastre", "remo", "curl", "semi", "envion", "apoyado", "apoyo", "apertura", "hindu", "zercher", "overhead", "sobre la cabeza", "encima de la cabeza", "reach", "cajon", "rodillas", "lateral", "sissi"],
    "exactos": ["sentadilla", "sentadilla con barra", "sentadilla trasera", "sentadilla completo con barra", "squat", "back squat", "sentadilla libre"] },

  { "id": "muerto", "nombre": "Peso muerto", "glifo": "muerto",
    "todas": ["peso muerto"],
    "ninguna": ["mancuerna", "kettlebell", "polea", "banda", "elastica", "multipower", "maquina", "rumano", "piernas rigidas", "recto", "una pierna", "una mano", "lateral", "soportes", "cajon", "espalda recta"],
    "exactos": ["peso muerto", "peso muerto con barra", "peso muerto sumo con barra", "peso muerto con barra hexagonal", "muerto", "deadlift"] },

  { "id": "militar", "nombre": "Press militar", "glifo": "militar",
    "todas": ["press militar"],
    "ninguna": ["mancuerna", "kettlebell", "polea", "banda", "elastica", "multipower", "maquina", "tras nuca", "una mano", "lateral", "sentado"],
    "exactos": ["press militar", "press militar con barra", "press militar de pie con barra", "militar", "press de hombro con barra", "overhead press"] },

  { "id": "remo", "nombre": "Remo con barra", "glifo": "remo",
    "todas": ["remo"],
    "ninguna": ["mancuerna", "kettlebell", "polea", "banda", "elastica", "multipower", "maquina", "invertido", "suspendido", "esqui", "ergometro", "sentado", "alto", "superior", "una mano", "alterno", "correas", "banco", "sentadilla", "de pie", "rotacional", "pendlay", "gorila", "meadows", "renegado", "cara", "cuello", "menton", "tumbado", "cambered"],
    "exactos": ["remo con barra", "remo inclinado con barra", "remo", "barbell row"] },

  { "id": "hip", "nombre": "Hip thrust", "glifo": "hip",
    "todas": ["hip thrust"],
    "ninguna": ["una pierna", "banda", "elastica", "maquina", "mancuerna"],
    "exactos": ["hip thrust", "hip thrust con barra", "empuje de cadera"] }
];
/* LEVANTAMIENTOS_FIN */

/* MEDALLAS_INICIO */
export const MEDALLAS = [
  { "id": "banca60", "levantamiento": "banca", "nivel": 1, "nombre": "Banca 60", "kg": 60 },
  { "id": "banca80", "levantamiento": "banca", "nivel": 2, "nombre": "Banca 80", "kg": 80 },
  { "id": "banca100", "levantamiento": "banca", "nivel": 3, "nombre": "Club de los 100", "kg": 100 },
  { "id": "banca140", "levantamiento": "banca", "nivel": 3, "nombre": "Banca 140", "kg": 140 },
  { "id": "bancaX1", "levantamiento": "banca", "nivel": 2, "nombre": "Banca a tu peso", "xPeso": 1 },
  { "id": "bancaX15", "levantamiento": "banca", "nivel": 3, "nombre": "Banca a peso y medio", "xPeso": 1.5 },

  { "id": "sentadilla80", "levantamiento": "sentadilla", "nivel": 1, "nombre": "Sentadilla 80", "kg": 80 },
  { "id": "sentadilla100", "levantamiento": "sentadilla", "nivel": 2, "nombre": "Sentadilla 100", "kg": 100 },
  { "id": "sentadilla140", "levantamiento": "sentadilla", "nivel": 3, "nombre": "Sentadilla 140", "kg": 140 },
  { "id": "sentadilla180", "levantamiento": "sentadilla", "nivel": 3, "nombre": "Sentadilla 180", "kg": 180 },
  { "id": "sentadillaX15", "levantamiento": "sentadilla", "nivel": 2, "nombre": "Sentadilla a peso y medio", "xPeso": 1.5 },
  { "id": "sentadillaX2", "levantamiento": "sentadilla", "nivel": 3, "nombre": "Sentadilla al doble", "xPeso": 2 },

  { "id": "muerto100", "levantamiento": "muerto", "nivel": 1, "nombre": "Muerto 100", "kg": 100 },
  { "id": "muerto140", "levantamiento": "muerto", "nivel": 2, "nombre": "Muerto 140", "kg": 140 },
  { "id": "muerto180", "levantamiento": "muerto", "nivel": 3, "nombre": "Muerto 180", "kg": 180 },
  { "id": "muerto220", "levantamiento": "muerto", "nivel": 3, "nombre": "Muerto 220", "kg": 220 },
  { "id": "muertoX2", "levantamiento": "muerto", "nivel": 2, "nombre": "Muerto al doble", "xPeso": 2 },
  { "id": "muertoX25", "levantamiento": "muerto", "nivel": 3, "nombre": "Muerto a dos y medio", "xPeso": 2.5 },

  { "id": "militar40", "levantamiento": "militar", "nivel": 1, "nombre": "Militar 40", "kg": 40 },
  { "id": "militar60", "levantamiento": "militar", "nivel": 2, "nombre": "Militar 60", "kg": 60 },
  { "id": "militarX075", "levantamiento": "militar", "nivel": 3, "nombre": "Militar a tres cuartos", "xPeso": 0.75 },

  { "id": "remo60", "levantamiento": "remo", "nivel": 1, "nombre": "Remo 60", "kg": 60 },
  { "id": "remo100", "levantamiento": "remo", "nivel": 2, "nombre": "Remo 100", "kg": 100 },

  { "id": "hip100", "levantamiento": "hip", "nivel": 1, "nombre": "Hip thrust 100", "kg": 100 },
  { "id": "hip160", "levantamiento": "hip", "nivel": 2, "nombre": "Hip thrust 160", "kg": 160 }
];
/* MEDALLAS_FIN */

/* ==========================================================================
 * DE QUÉ ESTÁ HECHA LA MEDALLA — MATERIALES
 *
 * Carlos, 31-ago-2026: *«de alguna de las medallas (quiero materiales normales
 * y exóticos por ejemplo)»*.
 *
 * El NIVEL ya dice CUÁNTO pesa el hito (60 · 100 · 140). El MATERIAL dice CÓMO
 * lo conseguiste, que es un eje distinto y por eso puede convivir con el nivel
 * sin pisarlo: dos personas con el «Club de los 100» pueden tener la misma
 * medalla de dos materiales distintos, y la pieza lo cuenta sola.
 *
 * REGLA: EL MATERIAL SE CALCULA, NO SE GUARDA
 * -------------------------------------------
 * Como todo lo que se GANA en esta app (racha, insignias, veteranía), el
 * material sale de tus series cada vez que abres el perfil. Si corriges una
 * serie mal apuntada, el material se recalcula solo. Nada de esto se escribe en
 * la base ni sube a la nube.
 *
 * Y NINGUNO ES DECORATIVO: cada uno responde a una pregunta concreta.
 *   · ¿Cuánto margen le sacaste al listón?      → plata, obsidiana, zafiro
 *   · ¿Cuánto llevas manteniéndola?             → cobre, hierro
 *   · ¿Fuiste tú o fue la máquina de tu gym?    → oro
 *   · ¿La has mantenido Y vuelto a batir?       → lapislázuli, rubí, diamante
 *
 * `oro` es el que más nos gusta y el que más honrado es: levantar ese mismo
 * peso en TRES gimnasios distintos descarta la excusa de siempre —«esa máquina
 * de ahí va suave»— porque son tres barras diferentes. Encaja con la regla del
 * proyecto de que cada máquina solo se compara consigo misma: aquí no se
 * comparan cargas entre máquinas, se comprueba que la tuya se repite.
 *
 * El `diamante` es el único que no se puede acelerar con fuerza: pide TRES años
 * con la medalla y haberla vuelto a batir después. Por eso está arriba del
 * todo — y por eso es el que nadie va a tener el primer año.
 *
 * POR QUÉ NO HAY ORO, PLATA NI BRONCE (otra vez)
 * ----------------------------------------------
 * Ya se quitaron una vez, y por un motivo que sigue vigente: un degradado de
 * metal es un color FIJO, no se puede teñir con el tema y se queda dorado sobre
 * el tema claro. Así que un material no es un color: es un ACABADO —moleteado,
 * rayado, tejido, facetado— dibujado con el mismo `--record` de siempre. Se
 * distingue en blanco y negro, y cambia de color con el tema como el resto.
 *
 * Y para que «exótico» se lea sin saberse la tabla de memoria, los tres
 * exóticos llevan además un ARO EXTERIOR continuo alrededor del disco. Un rasgo
 * de silueta, que es lo que se ve antes que cualquier textura a 44 px.
 *
 * `regla` es lo que mira `perfil.materialDe()`, y son cuatro:
 *   · `siempre`     — sin condición (la madera: sale con la medalla).
 *   · `margen`      — mejor levantado ÷ listón ≥ `valor`.
 *   · `dias`        — días desde que cruzaste el listón ≥ `valor`.
 *   · `gimnasios`   — en cuántos gimnasios distintos has levantado ese peso.
 *   · `veterana`    — `dias` ≥ `valor` Y la has vuelto a batir después.
 *
 * Se queda el de MAYOR `rareza` de los que cumplen. Uno por pieza: un acabado
 * es un acabado.
 * ========================================================================== */
/* MATERIALES_INICIO — no toques esta línea: la lee gym_perfil.py */
export const MATERIALES = [
  { "id": "madera", "nombre": "Madera", "clase": "normal", "rareza": 0,
    "regla": "siempre", "valor": 0,
    "pista": "Viene con la medalla. Todo el mundo empieza aquí." },
  { "id": "cobre", "nombre": "Cobre", "clase": "normal", "rareza": 1,
    "regla": "dias", "valor": 30,
    "pista": "Un mes desde que la conseguiste" },
  { "id": "hierro", "nombre": "Hierro", "clase": "normal", "rareza": 2,
    "regla": "dias", "valor": 120,
    "pista": "Cuatro meses desde que la conseguiste" },
  { "id": "plata", "nombre": "Plata", "clase": "normal", "rareza": 3,
    "regla": "margen", "valor": 1.05,
    "pista": "Cruzaste el listón con un 5 % de margen" },
  { "id": "oro", "nombre": "Oro", "clase": "exotico", "rareza": 4,
    "regla": "gimnasios", "valor": 3,
    "pista": "Levanta ese peso en 3 gimnasios distintos" },
  { "id": "obsidiana", "nombre": "Obsidiana", "clase": "exotico", "rareza": 5,
    "regla": "margen", "valor": 1.2,
    "pista": "Cruzaste el listón con un 20 % de margen" },
  { "id": "lapislazuli", "nombre": "Lapislázuli", "clase": "exotico", "rareza": 6,
    "regla": "veterana", "valor": 365,
    "pista": "Un año con ella, y haberla vuelto a batir" },
  { "id": "zafiro", "nombre": "Zafiro", "clase": "exotico", "rareza": 7,
    "regla": "margen", "valor": 1.4,
    "pista": "Cruzaste el listón con un 40 % de margen" },
  { "id": "rubi", "nombre": "Rubí", "clase": "exotico", "rareza": 8,
    "regla": "veterana", "valor": 730,
    "pista": "Dos años con ella, y haberla vuelto a batir" },
  { "id": "diamante", "nombre": "Diamante", "clase": "exotico", "rareza": 9,
    "regla": "veterana", "valor": 1095,
    "pista": "Tres años con ella, y haberla vuelto a batir" }
];
/* MATERIALES_FIN — no toques esta línea */

export const MATERIAL_POR_ID = new Map(MATERIALES.map((m) => [m.id, m]));

/** Los exóticos, que es lo que la pantalla enseña aparte. */
export const MATERIALES_EXOTICOS = MATERIALES.filter((m) => m.clase === 'exotico');

/* ==========================================================================
 * MEDALLAS EXCLUSIVAS
 *
 * Carlos, 31-ago-2026: *«las medallas (haremos algunas exclusivas)»*.
 *
 * La diferencia con todo lo demás de este fichero no es de dificultad, es de
 * NATURALEZA. Una insignia o una medalla de récord se calculan de tus series
 * cada vez que abres el perfil, y por eso no se guardan: si corriges una serie
 * mal apuntada, el logro se recalcula solo. Estas NO se pueden calcular así,
 * porque dependen de algo que ya pasó y que tu móvil no sabe — cuánta gente
 * había el día que entraste, o si alguien se llevó tu rutina. Así que estas se
 * CONCEDEN, las concede la base (`repasar_exclusivas` en el esquema), y se
 * guardan en el perfil.
 *
 * Y por eso también se dibujan distinto: son otra clase de cosa y tienen que
 * verse como otra clase de cosa. Misma familia (el disco), pero ocho cortes en
 * vez de cuatro, un glifo en vez de un número, y el lima del acento en vez del
 * naranja de los récords.
 * ========================================================================== */
/* EXCLUSIVAS_INICIO */
export const EXCLUSIVAS = [
  { "id": "fundador", "nombre": "Fundador", "glifo": "bandera",
    "pista": "De los 100 primeros que se hicieron una cuenta" },
  { "id": "pionero", "nombre": "Pionero", "glifo": "brujula",
    "pista": "De los 1.000 primeros que se hicieron una cuenta" },
  { "id": "maestro1", "nombre": "Alguien te copió", "glifo": "compartir",
    "pista": "Alguien se ha llevado una rutina tuya" },
  { "id": "maestro2", "nombre": "Escuela propia", "glifo": "compartir",
    "pista": "50 personas se han llevado una rutina tuya" },
  { "id": "querido", "nombre": "Querido", "glifo": "corazon",
    "pista": "25 me gusta repartidos entre tus rutinas" },
  { "id": "amo", "nombre": "Amo del gimnasio", "glifo": "corona",
    "pista": "El primer puesto de una máquina de tu gimnasio" }
];
/* EXCLUSIVAS_FIN */

export const EXCLUSIVA_POR_ID = new Map(EXCLUSIVAS.map((e) => [e.id, e]));

/** Trazo 1.8 sobre lienzo de 24, como el resto de la app. */
const GLIFOS_EXCLUSIVA = {
  bandera: '<path d="M6 21V3.6M6 4.6h12.5l-2.6 4.2 2.6 4.2H6"/>',
  brujula: '<circle cx="12" cy="12" r="8.6"/><path d="M15.4 8.6l-2 4.8-4.8 2 2-4.8z"/>',
  compartir: '<circle cx="17.5" cy="5.8" r="2.6"/><circle cx="6.5" cy="12" r="2.6"/><circle cx="17.5" cy="18.2" r="2.6"/><path d="M8.8 10.7l6.4-3.6M8.8 13.3l6.4 3.6"/>',
  corazon: '<path d="M12 20.2S3.6 15.4 3.6 9.6a4.6 4.6 0 0 1 8.4-2.6 4.6 4.6 0 0 1 8.4 2.6c0 5.8-8.4 10.6-8.4 10.6z"/>',
  corona: '<path d="M4 18h16M4.4 6.4l3.8 4 3.8-6 3.8 6 3.8-4L18 15.6H6z"/>',
};

/**
 * Una medalla exclusiva.
 *
 * Ocho cortes y no cuatro: a simple vista, en la vitrina del perfil, ya se ve
 * que no es del mismo montón que las de récord. Y va en `--acento`, que es el
 * color con el que la app señala lo suyo.
 */
export function dibujarExclusiva(ex, ganada = true, tam = 64) {
  const glifo = GLIFOS_EXCLUSIVA[ex.glifo] || GLIFOS_EXCLUSIVA.bandera;
  const id = `ex${++_pieza}`;
  const corona = ganada ? 'var(--acento)' : 'var(--superficie-2)';
  const borde = ganada ? 'var(--acento)' : 'var(--borde)';
  const tinta = ganada ? 'var(--acento)' : 'var(--texto-tenue)';

  return `
    <svg class="med-svg exc-svg ${ganada ? '' : 'ins-pendiente'}" viewBox="0 0 64 64"
         width="${tam}" height="${tam}" role="img"
         aria-label="${escaparAtributo(ex.nombre)}${ganada ? '' : ' (aún no conseguida)'}">
      <defs>
        <mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="64" height="64">
          <rect x="0" y="0" width="64" height="64" fill="#fff"/>
          <path d="${CORTES_8}" fill="#000"/>
        </mask>
      </defs>
      <g mask="url(#${id})">
        <path d="${CORONA}" fill-rule="evenodd" fill="${corona}"
              stroke="${borde}" stroke-width="1.6"/>
      </g>
      <g transform="translate(20 20)" fill="none" stroke="${tinta}"
         stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        ${glifo}
      </g>
    </svg>`;
}

/** El levantamiento de cada medalla, ya indexado. */
export const LEVANTAMIENTO_POR_ID = new Map(LEVANTAMIENTOS.map((l) => [l.id, l]));

/** Cuántas medallas se pueden lucir en la tarjeta del perfil. */
export const MEDALLAS_EN_PERFIL = 4;

/* ==========================================================================
 * DIBUJO
 *
 * Todo sale de los tokens del tema (`--acento`, `--record`, `--superficie-2`…),
 * así que las piezas cambian de color con el tema igual que el resto de la app.
 * Con los degradados de metal del primer intento eso era imposible: se quedaban
 * doradas sobre un tema claro y sobre el rosa.
 * ========================================================================== */

/**
 * El contorno del squircle, en un lienzo de 64.
 *
 * Es una superelipse dibujada con cuatro bézier, no un `rect` con `rx`. Se nota:
 * la esquina de un `rect` redondeado entra en la curva de golpe, y a este tamaño
 * eso se ve como un canto duro. La superelipse entra suave, que es la forma que
 * usan los iconos de iOS y la que hace que una pieza pequeña parezca cuidada.
 */
const SQUIRCLE =
  'M32 3c12.8 0 17.4 1.3 22.1 6S61 20.2 61 33s-1.3 17.4-6 22.1S44.8 61 32 61'
  + 's-17.4-1.3-22.1-6S3 44.8 3 32s1.3-17.4 6-22.1S19.2 3 32 3z';

/** El perímetro aproximado del squircle, para el anillo de progreso. */
const PERIMETRO = 214;

/**
 * Una insignia dibujada.
 *
 * @param insignia  la fila del catálogo (necesita `familia`, `nivel`, `nombre`)
 * @param ganada    en falso se dibuja apagada y con su anillo de progreso
 * @param tam       lado en píxeles
 * @param progreso  0..1, solo se usa cuando NO está ganada
 */
export function dibujarInsignia(insignia, ganada = true, tam = 64, progreso = 0) {
  const glifo = GLIFOS[insignia.familia] || GLIFOS.constancia;
  const nivel = Math.min(3, Math.max(1, Number(insignia.nivel) || 1));

  // Los tres niveles, de menos a más. El 3 es el mismo trato que un botón
  // principal —relleno sólido de acento con tinta oscura—, que en esta app es
  // LA señal de «esto es lo importante».
  let relleno = 'none';
  let borde = 'var(--acento)';
  let tinta = 'var(--acento)';
  let grosorBorde = 1.6;

  if (!ganada) {
    relleno = 'var(--superficie-2)';
    borde = 'var(--borde)';
    tinta = 'var(--texto-tenue)';
  } else if (nivel === 2) {
    // 26 % y no `--acento-suave` (15 %): a 60 px el 15 % no se distinguía del
    // nivel 1 y los tres escalones parecían dos.
    relleno = 'color-mix(in srgb, var(--acento) 26%, transparent)';
  } else if (nivel === 3) {
    relleno = 'var(--acento)';
    borde = 'var(--acento)';
    tinta = 'var(--acento-tinta)';
    grosorBorde = 0;
  }

  // El anillo solo aparece si hay algo que enseñar: un anillo al 0 % es una
  // línea que no dice nada y ensucia la rejilla.
  const anillo = !ganada && progreso > 0.02
    // Sin `rotate`: el trazado del squircle YA empieza arriba y en el centro
    // («M32 3»), que es donde el ojo espera que arranque un progreso. El giro
    // de -90 que llevan los anillos circulares aquí lo sacaba por la izquierda.
    ? `<path d="${SQUIRCLE}" fill="none" stroke="var(--acento)" stroke-width="2.6"
         stroke-linecap="round" pathLength="${PERIMETRO}"
         stroke-dasharray="${(progreso * PERIMETRO).toFixed(1)} ${PERIMETRO}"
         opacity="0.9"/>`
    : '';

  return `
    <svg class="ins-svg ${ganada ? '' : 'ins-pendiente'}" viewBox="0 0 64 64"
         width="${tam}" height="${tam}" role="img"
         aria-label="${escaparAtributo(insignia.nombre)}${ganada
           ? '' : ` (aún no conseguida${progreso ? `, ${Math.round(progreso * 100)} %` : ''})`}">
      <path d="${SQUIRCLE}" fill="${relleno}" stroke="${borde}" stroke-width="${grosorBorde}"/>
      ${anillo}
      <g transform="translate(20 20)" fill="none" stroke="${tinta}"
         stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        ${glifo}
      </g>
    </svg>`;
}

/* --------------------------------------------------------------------------
 * LA MEDALLA ES UN DISCO DE GIMNASIO, Y EL MATERIAL ES DE QUÉ ESTÁ HECHO
 * (rehecha entera el 2-sep-2026)
 *
 * Carlos, viendo la lámina del catálogo: *«las medallas de peso no me gustan
 * nada, pero nada. Que aparezca un número así tan chillón, y que tengan esa
 * forma, y que se adornen con una textura tan fea»*. Y tenía razón en las tres
 * cosas: el número iba a 21 px en naranja sobre naranja, la silueta era una
 * corona partida en cuatro que a tamaño pequeño se leía como una cruz, y los
 * seis materiales eran el MISMO naranja con un rayado distinto, o sea que a
 * 58 px —el tamaño al que salen en el perfil— no se distinguían.
 *
 * QUÉ CAMBIA
 * ----------
 * · La silueta es un DISCO ENTERO, sin cortes. Un disco de gimnasio visto de
 *   frente: canto, moleteado y buje. La corona partida se queda para las
 *   medallas EXCLUSIVAS, que así son otra cosa de un vistazo.
 * · El número ya no grita: vive DENTRO del buje, en la tinta del material, a
 *   un tamaño que cabe sin apreturas. El protagonista es la pieza.
 * · Cada material tiene SU COLOR (token `--mat-*`) y ADEMÁS su textura. El
 *   color no puede ser el único indicador —hay quien no lo distingue— así que
 *   la textura sigue ahí, pero ahora es un rasgo secundario y no el único.
 *
 * EL ORDEN DE LOS MATERIALES ES EL QUE YA SE SABE TODO EL MUNDO
 * -------------------------------------------------------------
 * La vuelta anterior los ordenó por PRECIO DE MERCADO por kilo. Estaba bien
 * buscado y era inservible: dejaba el lapislázuli por delante del hierro y el
 * hierro en el suelo del todo. Carlos: *«no tiene sentido que la lapislázuli
 * vaya antes que el hierro, un poco de cultura general. Como en el Minecraft:
 * primero la madera, luego el hierro, luego la cota de malla, luego el oro,
 * luego el diamante»*.
 *
 * Y tiene razón, porque una escala de materiales no es una tasación: es una
 * cosa que se tiene que entender SIN QUE NADIE LA EXPLIQUE. La que todo el
 * mundo lleva puesta —de los videojuegos, de las medallas, de los cuentos— es
 * esta, y es la que hay:
 *
 *   LOS METALES, de menos a más:
 *     madera → cobre → hierro → plata → oro
 *   LAS PIEDRAS, encima de todos ellos y también de menos a más:
 *     obsidiana → lapislázuli → zafiro → rubí → DIAMANTE
 *
 * El diamante arriba del todo, que es donde lo pone cualquiera al que le
 * preguntes. La madera abajo, que es por donde se empieza. Y ninguna piedra por
 * debajo de ningún metal: eso era lo que chirriaba.
 *
 * La DIFICULTAD sube en ese mismo orden, que es lo que hace que la escala
 * signifique algo: si el material de arriba se sacara antes que el de abajo,
 * sería un dibujo bonito y nada más. Y como el material se congela con el
 * levantamiento que cruzó el listón, una medalla no cambia de material nunca
 * más: dice cómo la sacaste aquel día.

/** Cada SVG necesita ids únicos: dos máscaras con el mismo id se pisan. */
let _pieza = 0;

/**
 * Un sector (una porción de tarta) como trazado.
 *
 * Es lo que RECORTA la corona. Va de `r1` a `r2` para que el corte atraviese el
 * aro entero y no deje una pestaña de un píxel en los bordes.
 */
function sector(gradosCentro, gradosAncho, r1, r2) {
  const p = (g, r) => {
    const a = (g - 90) * (Math.PI / 180);
    return `${(32 + r * Math.cos(a)).toFixed(2)} ${(32 + r * Math.sin(a)).toFixed(2)}`;
  };
  const a = gradosCentro - gradosAncho / 2;
  const b = gradosCentro + gradosAncho / 2;
  return `M${p(a, r1)}L${p(a, r2)}A${r2} ${r2} 0 0 1 ${p(b, r2)}L${p(b, r1)}A${r1} ${r1} 0 0 0 ${p(a, r1)}Z`;
}

/** Ocho cortes finos: la silueta de las medallas EXCLUSIVAS, y solo de esas.
    Los cuatro cortes en diagonal que llevaban las medallas de peso se han
    quitado: a 58 px la corona partida se leía como una cruz. */
const CORTES_8 = [0, 45, 90, 135, 180, 225, 270, 315].map((g) => sector(g, 12, 15, 31)).join('');


/* --------------------------------------------------------------------------
 * LA MEDALLA ES UNA PIEDRA TALLADA  (tercera vuelta, 2-sep-2026)
 *
 * Carlos: *«no me gusta absolutamente nada, son feísimas. Inspírate de algo,
 * tío. Que sea como un mineral tallado, que esté guapo, que no sea una
 * pegatina horrorosa»*.
 *
 * DE DÓNDE SALE LA GEOMETRÍA (no de la cabeza de nadie)
 * ----------------------------------------------------
 * Es la CORONA DE UN BRILLANTE, la talla redonda de toda la vida, mirada
 * desde arriba. Vista desde ahí se ven exactamente 33 caras, y son estas
 * (fuente: GIA, «Anatomy of a Round Brilliant»):
 *
 *     1 tabla        — la cara plana de arriba, un octógono
 *     8 biseles      — las cometas radiales, la cara grande de cada punta
 *     8 estrellas    — los triángulos que rodean la tabla
 *    16 mitades      — las caras entre los biseles y el filo
 *
 * Están las 33, una a una, y por eso brilla: una piedra no brilla por el
 * color, brilla porque tiene MUCHAS caras pequeñas apuntando a sitios
 * distintos. La versión de antes era un círculo plano con un rayado encima —
 * literalmente una pegatina— y por eso se veía como una pegatina.
 *
 * Cada cara se tiñe mezclando el color del material con blanco o con negro en
 * proporciones distintas, así que un material sigue siendo UN token
 * (`--mat-X`) y no ocho colores sueltos. El brillo sale de la mezcla, no de un
 * degradado dibujado a mano.
 *
 * LOS TRES NIVELES SE VEN EN BLANCO Y NEGRO, como siempre, y por SILUETA:
 *   1 · la piedra sola
 *   2 · la piedra engastada: un aro de metal alrededor del filo
 *   3 · el engaste con CUATRO GARRAS, que sobresalen del contorno
 *
 * Y el número va grabado en la tabla, pequeño y en el tono oscuro de la
 * piedra: dentro de una talla se lee como una inscripción, no como un cartel.
 * ------------------------------------------------------------------------ */

/** Un punto en coordenadas polares del lienzo de 64, con 0° arriba. */
function polar(grados, radio) {
  const a = (grados - 90) * (Math.PI / 180);
  return `${(32 + radio * Math.cos(a)).toFixed(2)} ${(32 + radio * Math.sin(a)).toFixed(2)}`;
}

/** La corona partida: la silueta de las medallas EXCLUSIVAS. */
const CORONA =
  'M32 4.5a27.5 27.5 0 1 1 0 55 27.5 27.5 0 0 1 0-55zm0 10a17.5 17.5 0 1 0 0 35 17.5 17.5 0 0 0 0-35z';

/** Rayitas radiales: el trazado a secas, para poder pintarlo de otro color. */
function moleteadoD(n, r1, r2) {
  let d = '';
  for (let i = 0; i < n; i++) d += `M${polar((i * 360) / n, r1)}L${polar((i * 360) / n, r2)}`;
  return d;
}

/* --------------------------------------------------------------------------
 * LAS 33 CARAS DE LA CORONA
 *
 * Radios, de dentro a fuera. Están medidos para que a 58 px —el tamaño al que
 * salen las medallas en el perfil— la tabla siga teniendo sitio para el número
 * y las mitades no se conviertan en una franja gris.
 * ------------------------------------------------------------------------ */
const R_FILO = 27.4;    // el filo de la piedra (la «cintura»)
const R_ESTRELLA = 18.4; // hasta dónde llegan las puntas de las estrellas
const R_TABLA = 11.8;   // la tabla, el octógono de arriba

/** El ángulo de cada bisel (8) y el de cada estrella, justo en medio. */
const A_BISEL = (k) => k * 45;
const A_ESTRELLA = (k) => k * 45 + 22.5;

/** Mezcla el color del material con blanco o negro. Un token, muchas caras. */
function cara(luz) {
  return luz >= 0
    ? `color-mix(in srgb, var(--piedra) ${100 - luz}%, white)`
    : `color-mix(in srgb, var(--piedra) ${100 + luz}%, black)`;
}

/** Las 33 caras de la corona, en orden de dentro a fuera. */
function tallaBrillante() {
  const T = (k) => polar(A_BISEL(k), R_TABLA);
  const E = (k) => polar(A_ESTRELLA(k), R_ESTRELLA);
  const Fb = (k) => polar(A_BISEL(k), R_FILO);
  const Fe = (k) => polar(A_ESTRELLA(k), R_FILO);
  const cara8 = (k) => k % 8;
  let d = '';

  // 16 MITADES, las de fuera. Alternan claro/oscuro: es lo que hace el
  // centelleo del borde, y es donde una piedra de verdad tiene más caras.
  for (let k = 0; k < 8; k++) {
    d += `<path d="M${E(k)}L${Fb(cara8(k))}L${Fe(k)}Z" fill="${cara(-36)}"/>`;
    d += `<path d="M${E(k)}L${Fe(k)}L${Fb(cara8(k + 1))}Z" fill="${cara(-18)}"/>`;
  }
  // 8 BISELES: las cometas radiales. Son la cara grande, así que llevan la luz.
  for (let k = 0; k < 8; k++) {
    d += `<path d="M${T(k)}L${E(cara8(k))}L${Fb(k)}L${E(cara8(k + 7))}Z"
            fill="${cara(k % 2 ? 10 : 34)}"/>`;
  }
  // 8 ESTRELLAS: los triángulos que rodean la tabla.
  for (let k = 0; k < 8; k++) {
    d += `<path d="M${T(k)}L${T(cara8(k + 1))}L${E(k)}Z" fill="${cara(k % 2 ? -14 : 6)}"/>`;
  }
  return d;
}

/** El octógono de la tabla, para pintarlo y para recortar el brillo. */
function octogonoTabla() {
  let d = '';
  for (let k = 0; k < 8; k++) d += `${k ? 'L' : 'M'}${polar(A_BISEL(k), R_TABLA)}`;
  return `${d}Z`;
}

/** El contorno de la piedra: el filo, en 16 puntos (no es un círculo liso). */
function contornoFilo() {
  let d = '';
  for (let k = 0; k < 8; k++) {
    d += `${k ? 'L' : 'M'}${polar(A_BISEL(k), R_FILO)}L${polar(A_ESTRELLA(k), R_FILO)}`;
  }
  return `${d}Z`;
}

/** Las cuatro garras del engaste del nivel 3. Sobresalen: eso es la silueta. */
function garras() {
  let d = '';
  for (const g of [45, 135, 225, 315]) {
    const [x, y] = polar(g, R_FILO + 0.6).split(' ').map(Number);
    d += `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="4.1"/>`;
  }
  return d;
}

const TALLA = tallaBrillante();
const TABLA = octogonoTabla();
const FILO = contornoFilo();
const GARRAS = garras();

/**
 * Una medalla de peso: una piedra tallada del material que te has ganado.
 *
 * El orden de importancia es la PIEDRA, el MATERIAL y luego el número. Antes
 * era al revés y por eso el número gritaba.
 */
export function dibujarMedalla(medalla, ganada = true, tam = 64, progreso = 0) {
  const cifra = medalla.kg ? String(medalla.kg) : `×${String(medalla.xPeso).replace('.', ',')}`;
  // La tabla mide 24 px de ancho útil. Medido con la Archivo al 86 %: «×1,5» a
  // 12 px cabe con aire dentro del octógono; a 14 toca las estrellas.
  const tamCifra = cifra.length >= 5 ? 8.5 : cifra.length === 4 ? 10 : cifra.length === 3 ? 11.5 : 13;
  const nivel = Math.min(3, Math.max(1, Number(medalla.nivel) || 1));
  const id = `md${++_pieza}`;

  // EL MATERIAL. Solo lo tienen las conseguidas: un material describe CÓMO la
  // sacaste, y una que no tienes no la has sacado de ninguna forma.
  const material = (ganada && MATERIAL_POR_ID.get(medalla.material)) || MATERIAL_POR_ID.get('hierro');
  const exotico = ganada && material.clase === 'exotico';

  // `--piedra` es lo que leen las 33 caras. Se pone una sola vez, en el <svg>:
  // así el material es UN token y no ocho colores repartidos por el dibujo.
  const piedra = ganada ? `var(--mat-${material.id})` : 'var(--superficie-3)';
  const grabado = ganada ? `var(--mat-${material.id}-tinta)` : 'var(--texto-tenue)';
  const metal = ganada ? `var(--mat-${material.id}-canto)` : 'var(--borde)';

  const anillo = !ganada && progreso > 0.02
    ? `<circle cx="32" cy="32" r="30.4" fill="none" stroke="var(--record)" stroke-width="2.2"
         stroke-linecap="round" pathLength="100"
         stroke-dasharray="${(progreso * 100).toFixed(1)} 100"
         transform="rotate(-90 32 32)" opacity="0.95"/>`
    : '';

  // El aro de los exóticos: un rasgo de SILUETA, que a 44 px se lee antes que
  // cualquier color. Nunca choca con el progreso (uno va en las que tienes y
  // el otro en las que no).
  const aroExotico = exotico
    ? `<circle cx="32" cy="32" r="30.4" fill="none" stroke="${piedra}"
         stroke-width="1.3" opacity="0.85"/>`
    : '';

  return `
    <svg class="med-svg med-piedra mat-${material.id} ${exotico ? 'med-exotica' : ''} ${
      ganada ? '' : 'ins-pendiente'}"
         style="--piedra:${piedra}"
         viewBox="0 0 64 64" width="${tam}" height="${tam}" role="img"
         aria-label="${escaparAtributo(medalla.nombre)}${ganada
           ? ` · ${escaparAtributo(material.nombre)}`
           : ` (aún no conseguida${progreso ? `, ${Math.round(progreso * 100)} %` : ''})`}">
      ${anillo}
      ${aroExotico}
      ${nivel === 3 ? `<g fill="${metal}" opacity="0.95">${GARRAS}</g>` : ''}
      ${nivel >= 2
        ? `<path d="${FILO}" fill="none" stroke="${metal}" stroke-width="2.6"
             stroke-linejoin="round"/>`
        : ''}
      <g class="med-talla">${TALLA}</g>
      <path d="${TABLA}" fill="${cara(26)}" stroke="${cara(-38)}" stroke-width="0.6"/>
      <!-- El destello: una sola cara clara sobre la tabla. Es lo que separa
           «piedra» de «polígono de colores», y va recortado por la tabla para
           que no se salga por las estrellas. -->
      <clipPath id="${id}t"><path d="${TABLA}"/></clipPath>
      <g clip-path="url(#${id}t)">
        <path d="M${polar(202, R_TABLA + 2)}L${polar(258, R_TABLA + 2)}L${polar(238, 2)}Z"
              fill="white" opacity="${ganada ? 0.24 : 0.05}"/>
      </g>
      <path d="${FILO}" fill="none" stroke="${cara(-44)}" stroke-width="0.9"
            stroke-linejoin="round"/>
      <text x="32" y="32.6" text-anchor="middle" dominant-baseline="middle"
            font-size="${tamCifra}" font-weight="700" fill="${grabado}"
            font-family="Archivo, system-ui, sans-serif" opacity="0.92"
            font-stretch="86%" letter-spacing="-0.2">${cifra}</text>
    </svg>`;
}

/**
 * Cómo se cuenta un material en una línea: «Obsidiana · exótico».
 *
 * Va con la pista al lado en la ficha de la medalla, porque un material que no
 * dice cómo se consigue es un adorno, y aquí ninguno lo es.
 */
export function explicarMaterial(material) {
  const m = typeof material === 'string' ? MATERIAL_POR_ID.get(material) : material;
  if (!m) return '';
  return m.clase === 'exotico' ? `${m.nombre} · exótico` : m.nombre;
}

/** Cómo se lee una medalla en una línea: «Press de banca · 100 kg». */
export function explicarMedalla(medalla) {
  const lev = LEVANTAMIENTO_POR_ID.get(medalla.levantamiento);
  const donde = lev ? lev.nombre : bonito(medalla.levantamiento || '');
  if (medalla.kg) return `${donde} · ${medalla.kg} kg`;
  // «1 veces tu peso» cantaba en la pantalla de elegir medallas. El singular no
  // es un detalle: un texto mal concordado hace que todo lo demás parezca
  // igual de descuidado.
  const n = String(medalla.xPeso).replace('.', ',');
  return `${donde} · ${n} ${Number(medalla.xPeso) === 1 ? 'vez' : 'veces'} tu peso`;
}

function bonito(nombre) {
  return String(nombre || '').replace(/^./, (c) => c.toUpperCase());
}

function escaparAtributo(t) {
  return String(t ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Índices por id, que es como los busca la pantalla. */
export const INSIGNIA_POR_ID = new Map(INSIGNIAS.map((i) => [i.id, i]));
export const MEDALLA_POR_ID = new Map(MEDALLAS.map((m) => [m.id, m]));

export const FAMILIAS = {
  constancia: 'Constancia',
  racha: 'Racha',
  fuerza: 'Fuerza',
  volumen: 'Volumen',
  explorador: 'Explorador',
  disciplina: 'Disciplina',
  nutricion: 'Nutrición',
  madrugador: 'Madrugador',
  nocturno: 'Nocturno',
  veterania: 'Veteranía',
};
