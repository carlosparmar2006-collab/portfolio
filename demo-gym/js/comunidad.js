/* =============================================================================
 * comunidad.js — Las rutinas OFICIALES que la app trae puestas.
 *
 * Carlos, 31-ago-2026: *«Créame una serie de usuarios y rutinas de la comunidad
 * ya creadas, que se puedan dar likes a las rutinas y gente que las ha
 * copiado»*.
 *
 * LO QUE HAY AQUÍ Y LO QUE NO, Y POR QUÉ
 * -------------------------------------
 * Aquí hay RUTINAS de verdad, ocho, escritas contra las mismas fuentes que usa
 * `ciencia.js`. Lo que NO hay —y esto es a propósito— son personas inventadas
 * ni contadores inflados.
 *
 * La regla del proyecto es «sin datos suficientes → no lo sé; nunca un
 * porcentaje inventado», y un «312 me gusta» puesto a mano el primer día es
 * exactamente eso: un número que no significa nada, enseñado a gente que se lo
 * va a creer. Además se rompe solo — el día que la app tenga cien usuarios de
 * verdad, esos números falsos siguen ahí y ya no cuadran con nada.
 *
 * Así que las ocho van firmadas por la propia app («GYM · rutinas oficiales»,
 * `oficial: true` en la base, sin cuenta de persona detrás) y sus contadores
 * empiezan en CERO y suben solos: un me gusta es una persona con cuenta que le
 * ha dado, y una copia es una cuenta distinta que se la ha llevado de verdad
 * (ver `copiar_rutina` en supabase/schema-3-comunidad.sql). Números pequeños al
 * principio, pero verdaderos desde el primer minuto.
 *
 * VAN DENTRO DE LA APP, NO SOLO EN LA NUBE
 * ----------------------------------------
 * Estas ocho viajan en el APK. Antes, la pantalla de rutinas de la bienvenida
 * decía «las rutinas de la gente necesitan conexión» y se quedaba vacía: quien
 * instala la app en el metro veía un hueco justo en el paso que tenía que
 * engancharle. Ahora siempre hay ocho, con o sin cobertura, y las de la gente
 * se suman por encima cuando hay red.
 *
 * UNA SOLA FUENTE
 * ---------------
 * `pc/sembrar_comunidad.py` LEE el array de abajo y escribe la semilla SQL, con
 * el mismo id en los dos sitios. Así la rutina que ves sin cobertura y la que
 * recibe los me gusta en la nube son la misma, y no pueden separarse: no hay
 * dos listas que mantener. Por eso el array va en JSON estricto entre los
 * marcadores, igual que el catálogo de insignias.
 *
 * EL `uuid` DE CADA UNA NO ES DECORATIVO Y NO SE INVENTA. Sale de su `id` con
 * uuid5 y un espacio de nombres fijo, así que es SIEMPRE el mismo: es lo que
 * permite volver a pasar la semilla sin duplicar filas y lo que hace que
 * `mezclar()` reconozca «esta oficial de la nube es esta de aquí» y se quede
 * con los contadores de verdad. Está escrito a mano porque calcular un uuid5 en
 * el móvil pediría SHA-1 para nada; que coincida con lo que genera Python lo
 * comprueba `pc/test_comunidad.py`, que falla si alguien lo cambia a ojo.
 *
 *   >>> Si tocas el array, NO cambies las líneas `RUTINAS_*` que lo rodean.
 *   >>> Y después: `python pc/sembrar_comunidad.py` para rehacer la semilla.
 *
 * EL FORMATO DE `ejercicios` NO ES LIBRE
 * -------------------------------------
 * Es EXACTAMENTE el del paquete de `compartir.js` ({nombre, grupo, series,
 * reps}), que es el mismo que viaja en un enlace de WhatsApp y el mismo que
 * guarda `rutinas_pub.datos`. Un solo formato quiere decir un solo importador
 * y una sola cosa que probar. Y los nombres son los del catálogo de 1.365
 * ejercicios, letra por letra: así al importarla la app reconoce la máquina,
 * enseña su técnica y no da de alta un duplicado con otro nombre.
 * `pc/test_comunidad.py` comprueba las dos cosas.
 *
 * `sin` Y POR QUÉ HACE FALTA
 * --------------------------
 * Cada rutina declara un `reparto` de `ciencia.js`, y el test exige que toque
 * TODOS los grupos que ese reparto reparte. Dos no lo hacen y es a propósito:
 * la de fuerza no lleva brazo aislado y la de media hora no lleva ni brazo ni
 * core, porque en treinta minutos no cabe. Sin `sin`, el test no puede
 * distinguir «me lo he saltado con motivo» de «se me ha olvidado», que es
 * exactamente la clase de agujero que acaba en una rutina de torso sin espalda
 * firmada por la app. Así que se declara, se explica, y la explicación se le
 * enseña a quien se la lleva: `porQueSin` sale en la pantalla.
 * ========================================================================== */

/** El autor que se enseña. No es una persona: es la app. */
export const AUTOR_OFICIAL = {
  alias: 'gym',
  nombre: 'GYM · rutinas oficiales',
  nota: 'Las trae la app. No son de nadie en particular.',
};

/* RUTINAS_INICIO — no toques esta línea: la lee pc/sembrar_comunidad.py */
export const RUTINAS = [
  {
    "id": "oficial-completo-2",
    "uuid": "3fedb64c-a9dc-53d2-b272-a39e815a0c01",
    "nombre": "Cuerpo entero, dos días",
    "descripcion": "Para semanas de dos días. Se toca todo las dos veces: repartir por grupos con solo dos días dejaría cada músculo a una vez por semana, que es lo que menos rinde.",
    "nivel": "empiezo",
    "dias": 2,
    "reparto": "completo2",
    "ejercicios": [
      { "nombre": "Sentadilla con barra", "grupo": "pierna", "series": 3, "reps": 8 },
      { "nombre": "Press de banca con barra", "grupo": "pecho", "series": 3, "reps": 8 },
      { "nombre": "Remo con barra", "grupo": "espalda", "series": 3, "reps": 10 },
      { "nombre": "Press militar con barra", "grupo": "hombro", "series": 3, "reps": 10 },
      { "nombre": "Curl con barra", "grupo": "biceps", "series": 2, "reps": 12 },
      { "nombre": "Extensión de tríceps con cuerda", "grupo": "triceps", "series": 2, "reps": 12 },
      { "nombre": "Plancha", "grupo": "core", "series": 3, "reps": 1 }
    ]
  },
  {
    "id": "oficial-torso-3",
    "uuid": "3389cabc-e176-5887-8b86-b577459de09c",
    "nombre": "Torso · Pierna · Cuerpo entero",
    "descripcion": "Tres días con todo dos veces por semana. El Push/Pull/Leg clásico a tres días dejaría cada músculo a una sola vez; esto no.",
    "nivel": "medio",
    "dias": 3,
    "reparto": "torsopierna3",
    "ejercicios": [
      { "nombre": "Press de banca con barra", "grupo": "pecho", "series": 4, "reps": 8 },
      { "nombre": "Remo con barra", "grupo": "espalda", "series": 4, "reps": 10 },
      { "nombre": "Jalón al pecho en polea", "grupo": "espalda", "series": 3, "reps": 12 },
      { "nombre": "Press militar con barra", "grupo": "hombro", "series": 3, "reps": 10 },
      { "nombre": "Elevaciones laterales con mancuernas", "grupo": "hombro", "series": 3, "reps": 15 },
      { "nombre": "Curl con barra", "grupo": "biceps", "series": 3, "reps": 12 },
      { "nombre": "Extensión de tríceps en polea", "grupo": "triceps", "series": 3, "reps": 12 },
      { "nombre": "Sentadilla con barra", "grupo": "pierna", "series": 4, "reps": 8 },
      { "nombre": "Peso muerto rumano", "grupo": "pierna", "series": 3, "reps": 10 },
      { "nombre": "Prensa de piernas", "grupo": "pierna", "series": 3, "reps": 12 },
      { "nombre": "Elevación de gemelos", "grupo": "pierna", "series": 4, "reps": 15 },
      { "nombre": "Rueda abdominal", "grupo": "core", "series": 3, "reps": 10 }
    ]
  },
  {
    "id": "oficial-torso-4",
    "uuid": "ce5dc231-96ad-50e2-bdf6-8a11a6033772",
    "nombre": "Torso · Pierna, dos vueltas",
    "descripcion": "El reparto con mejor relación entre días y frecuencia: todo dos veces por semana sin sesiones eternas. Si tuviéramos que recomendar una sola, sería esta.",
    "nivel": "medio",
    "dias": 4,
    "reparto": "torsopierna4",
    "ejercicios": [
      { "nombre": "Press de banca con barra", "grupo": "pecho", "series": 4, "reps": 8 },
      { "nombre": "Press inclinado con mancuernas", "grupo": "pecho", "series": 3, "reps": 12 },
      { "nombre": "Dominadas", "grupo": "espalda", "series": 4, "reps": 8 },
      { "nombre": "Remo sentado en polea", "grupo": "espalda", "series": 3, "reps": 12 },
      { "nombre": "Elevaciones laterales con mancuernas", "grupo": "hombro", "series": 4, "reps": 15 },
      { "nombre": "Face pull en polea", "grupo": "hombro", "series": 3, "reps": 15 },
      { "nombre": "Curl con barra", "grupo": "biceps", "series": 3, "reps": 10 },
      { "nombre": "Curl martillo", "grupo": "biceps", "series": 3, "reps": 12 },
      { "nombre": "Extensión de tríceps con cuerda", "grupo": "triceps", "series": 3, "reps": 12 },
      { "nombre": "Fondos en paralelas", "grupo": "triceps", "series": 3, "reps": 10 },
      { "nombre": "Sentadilla con barra", "grupo": "pierna", "series": 4, "reps": 8 },
      { "nombre": "Peso muerto rumano", "grupo": "pierna", "series": 4, "reps": 10 },
      { "nombre": "Extensión de cuádriceps", "grupo": "pierna", "series": 3, "reps": 15 },
      { "nombre": "Curl femoral tumbado", "grupo": "pierna", "series": 3, "reps": 12 },
      { "nombre": "Elevación de gemelos", "grupo": "pierna", "series": 4, "reps": 15 },
      { "nombre": "Elevación de piernas colgado", "grupo": "core", "series": 3, "reps": 12 }
    ]
  },
  {
    "id": "oficial-mixto-5",
    "uuid": "594f4ae8-d95b-5432-bfcf-a0018338ec93",
    "nombre": "Torso · Pierna · Empuje · Tirón · Pierna",
    "descripcion": "Cinco días separando empuje y tirón sin bajar de dos veces por semana en nada. Para quien ya lleva tiempo y tiene la semana libre.",
    "nivel": "avanzado",
    "dias": 5,
    "reparto": "mixto5",
    "ejercicios": [
      { "nombre": "Press de banca con barra", "grupo": "pecho", "series": 4, "reps": 6 },
      { "nombre": "Press inclinado con mancuernas", "grupo": "pecho", "series": 4, "reps": 10 },
      { "nombre": "Aperturas en máquina (contractor)", "grupo": "pecho", "series": 3, "reps": 15 },
      { "nombre": "Dominadas", "grupo": "espalda", "series": 4, "reps": 8 },
      { "nombre": "Remo con barra", "grupo": "espalda", "series": 4, "reps": 8 },
      { "nombre": "Remo sentado en polea", "grupo": "espalda", "series": 3, "reps": 12 },
      { "nombre": "Press militar con barra", "grupo": "hombro", "series": 4, "reps": 8 },
      { "nombre": "Elevaciones laterales con mancuernas", "grupo": "hombro", "series": 4, "reps": 15 },
      { "nombre": "Pájaros con mancuernas", "grupo": "hombro", "series": 3, "reps": 15 },
      { "nombre": "Curl con barra", "grupo": "biceps", "series": 4, "reps": 10 },
      { "nombre": "Curl martillo", "grupo": "biceps", "series": 3, "reps": 12 },
      { "nombre": "Extensión de tríceps en polea", "grupo": "triceps", "series": 4, "reps": 12 },
      { "nombre": "Fondos en paralelas", "grupo": "triceps", "series": 3, "reps": 10 },
      { "nombre": "Sentadilla con barra", "grupo": "pierna", "series": 4, "reps": 6 },
      { "nombre": "Peso muerto rumano", "grupo": "pierna", "series": 4, "reps": 8 },
      { "nombre": "Prensa de piernas", "grupo": "pierna", "series": 4, "reps": 12 },
      { "nombre": "Curl femoral sentado", "grupo": "pierna", "series": 4, "reps": 12 },
      { "nombre": "Elevación de gemelos", "grupo": "pierna", "series": 5, "reps": 15 },
      { "nombre": "Rueda abdominal", "grupo": "core", "series": 4, "reps": 10 }
    ]
  },
  {
    "id": "oficial-ppl-6",
    "uuid": "b1df326e-d320-522c-9080-91544035bdb7",
    "nombre": "Push · Pull · Leg, dos vueltas",
    "descripcion": "A seis días el Push/Pull/Leg sí funciona: dos veces por semana en todo y sesiones cortas. Mucho volumen; no es para empezar.",
    "nivel": "avanzado",
    "dias": 6,
    "reparto": "ppl6",
    "ejercicios": [
      { "nombre": "Press de banca con barra", "grupo": "pecho", "series": 4, "reps": 8 },
      { "nombre": "Press inclinado con mancuernas", "grupo": "pecho", "series": 4, "reps": 10 },
      { "nombre": "Aperturas con mancuernas", "grupo": "pecho", "series": 3, "reps": 15 },
      { "nombre": "Press militar con barra", "grupo": "hombro", "series": 4, "reps": 8 },
      { "nombre": "Elevaciones laterales con mancuernas", "grupo": "hombro", "series": 4, "reps": 15 },
      { "nombre": "Extensión de tríceps con cuerda", "grupo": "triceps", "series": 4, "reps": 12 },
      { "nombre": "Fondos en paralelas", "grupo": "triceps", "series": 3, "reps": 10 },
      { "nombre": "Dominadas", "grupo": "espalda", "series": 4, "reps": 8 },
      { "nombre": "Remo con barra", "grupo": "espalda", "series": 4, "reps": 10 },
      { "nombre": "Jalón al pecho en polea", "grupo": "espalda", "series": 3, "reps": 12 },
      { "nombre": "Face pull en polea", "grupo": "hombro", "series": 3, "reps": 15 },
      { "nombre": "Curl con barra", "grupo": "biceps", "series": 4, "reps": 10 },
      { "nombre": "Curl martillo", "grupo": "biceps", "series": 3, "reps": 12 },
      { "nombre": "Sentadilla con barra", "grupo": "pierna", "series": 4, "reps": 8 },
      { "nombre": "Peso muerto rumano", "grupo": "pierna", "series": 4, "reps": 10 },
      { "nombre": "Prensa de piernas", "grupo": "pierna", "series": 3, "reps": 12 },
      { "nombre": "Extensión de cuádriceps", "grupo": "pierna", "series": 3, "reps": 15 },
      { "nombre": "Curl femoral tumbado", "grupo": "pierna", "series": 3, "reps": 12 },
      { "nombre": "Elevación de gemelos", "grupo": "pierna", "series": 5, "reps": 15 },
      { "nombre": "Elevación de piernas colgado", "grupo": "core", "series": 4, "reps": 12 }
    ]
  },
  {
    "id": "oficial-fuerza-3",
    "uuid": "4e6b14b0-dfb5-5458-83fc-918fcea5d18a",
    "nombre": "Fuerza: los tres grandes",
    "descripcion": "Sentadilla, banca y peso muerto tres días por semana, con series cortas y descansos largos. Para subir el número de la barra, no para el espejo.",
    "nivel": "medio",
    "dias": 3,
    "reparto": "torsopierna3",
    "sin": ["biceps", "triceps"],
    "porQueSin": "Sin curl ni extensiones: los brazos ya trabajan en banca, militar, remo y dominadas. Si quieres brazo directo, añádelo tú al final.",
    "ejercicios": [
      { "nombre": "Sentadilla con barra", "grupo": "pierna", "series": 5, "reps": 5 },
      { "nombre": "Press de banca con barra", "grupo": "pecho", "series": 5, "reps": 5 },
      { "nombre": "Peso muerto con barra", "grupo": "espalda", "series": 3, "reps": 5 },
      { "nombre": "Press militar con barra", "grupo": "hombro", "series": 4, "reps": 6 },
      { "nombre": "Remo con barra", "grupo": "espalda", "series": 4, "reps": 6 },
      { "nombre": "Dominadas", "grupo": "espalda", "series": 3, "reps": 8 },
      { "nombre": "Plancha", "grupo": "core", "series": 3, "reps": 1 }
    ]
  },
  {
    "id": "oficial-media-hora",
    "uuid": "b6d3c027-316e-5276-84a8-550b4de830f0",
    "nombre": "Media hora y a casa",
    "descripcion": "Tres días de 30 minutos, solo ejercicios que mueven mucho músculo a la vez. Cuando el problema no es la gana, es la agenda.",
    "nivel": "empiezo",
    "dias": 3,
    "reparto": "torsopierna3",
    "sin": ["biceps", "triceps", "core"],
    "porQueSin": "En media hora no cabe nada aislado. Los brazos trabajan en banca y remo; el core, sujetando la sentadilla y el muerto rumano.",
    "ejercicios": [
      { "nombre": "Sentadilla con barra", "grupo": "pierna", "series": 3, "reps": 10 },
      { "nombre": "Press de banca con barra", "grupo": "pecho", "series": 3, "reps": 10 },
      { "nombre": "Remo con barra", "grupo": "espalda", "series": 3, "reps": 10 },
      { "nombre": "Peso muerto rumano", "grupo": "pierna", "series": 3, "reps": 10 },
      { "nombre": "Elevaciones laterales con mancuernas", "grupo": "hombro", "series": 2, "reps": 15 }
    ]
  },
  {
    "id": "oficial-solo-maquinas",
    "uuid": "f4da6816-6653-5a89-bce4-cc3128fc2d66",
    "nombre": "Solo máquinas",
    "descripcion": "Sin barra libre, para gimnasios de máquinas o para quien todavía no se fía de la técnica. Cuatro días, todo dos veces por semana.",
    "nivel": "empiezo",
    "dias": 4,
    "reparto": "torsopierna4",
    "ejercicios": [
      { "nombre": "Press de banca en multipower", "grupo": "pecho", "series": 4, "reps": 12 },
      { "nombre": "Aperturas en máquina (contractor)", "grupo": "pecho", "series": 3, "reps": 15 },
      { "nombre": "Jalón al pecho en polea", "grupo": "espalda", "series": 4, "reps": 12 },
      { "nombre": "Remo sentado en máquina", "grupo": "espalda", "series": 4, "reps": 12 },
      { "nombre": "Press militar en máquina", "grupo": "hombro", "series": 3, "reps": 12 },
      { "nombre": "Elevaciones laterales en máquina", "grupo": "hombro", "series": 3, "reps": 15 },
      { "nombre": "Curl con barra Z", "grupo": "biceps", "series": 3, "reps": 12 },
      { "nombre": "Extensión de tríceps en máquina", "grupo": "triceps", "series": 3, "reps": 12 },
      { "nombre": "Prensa de piernas", "grupo": "pierna", "series": 4, "reps": 12 },
      { "nombre": "Extensión de cuádriceps", "grupo": "pierna", "series": 3, "reps": 15 },
      { "nombre": "Curl femoral sentado", "grupo": "pierna", "series": 3, "reps": 12 },
      { "nombre": "Prensa de gemelos en máquina", "grupo": "pierna", "series": 4, "reps": 15 },
      { "nombre": "Encogimiento crunch", "grupo": "core", "series": 3, "reps": 15 }
    ]
  }
];
/* RUTINAS_FIN — no toques esta línea */

export const RUTINA_POR_ID = new Map(RUTINAS.map((r) => [r.id, r]));

/**
 * Una rutina oficial en el formato de paquete de `compartir.js`.
 *
 * Es el MISMO objeto que llega por un enlace de WhatsApp o que guarda
 * `rutinas_pub.datos`, así que se importa con `compartir.importarRutina()` sin
 * ningún camino especial. Un solo importador, una sola cosa que probar.
 */
export function paqueteDe(rutina) {
  return {
    v: 1,
    tipo: 'rutina',
    nombre: rutina.nombre,
    autor: AUTOR_OFICIAL.nombre,
    ejercicios: rutina.ejercicios.map((e) => ({
      nombre: e.nombre, grupo: e.grupo, series: e.series, reps: e.reps,
    })),
  };
}

/**
 * Las oficiales con la misma forma que devuelve `rutinas_populares` de la nube.
 *
 * Sirve para pintarlas en la MISMA lista que las de la gente sin que la
 * pantalla tenga que saber de dónde viene cada una. Los contadores van a cero
 * porque aquí, sin red, no se saben: la nube los rellena cuando hay.
 */
export function comoDeLaNube() {
  return RUTINAS.map((r) => ({
    // El uuid, no el `id` corto: es el mismo con el que está sembrada en la
    // nube, y es lo que hace que `mezclar()` no la enseñe dos veces.
    id: r.uuid,
    slug: r.id,
    nombre: r.nombre,
    descripcion: r.descripcion,
    nivel: r.nivel,
    dias: r.dias,
    n_likes: 0,
    n_comentarios: 0,
    n_copias: 0,
    creado: null,
    alias: AUTOR_OFICIAL.alias,
    alias_visible: AUTOR_OFICIAL.alias,
    autor_nombre: AUTOR_OFICIAL.nombre,
    foto_url: null,
    le_di: false,
    oficial: true,
    // Lo que la rutina se salta a propósito. Viaja con la fila para que la
    // pantalla lo pueda decir ANTES de que alguien se la lleve: enterarte de
    // que tu rutina no lleva brazo tres semanas después es enterarte tarde.
    sin: r.sin || [],
    porQueSin: r.porQueSin || '',
    // El paquete viaja con la fila: una oficial se puede importar SIN RED, que
    // es la mitad del motivo de que estén dentro de la app.
    datos: paqueteDe(r),
  }));
}

/**
 * Mezcla las oficiales con las que traiga la nube.
 *
 * Si la nube ya trae una oficial (porque está sembrada allí y tiene me gusta de
 * verdad), MANDA LA DE LA NUBE: sus contadores son reales y los de aquí son
 * ceros de relleno. Lo de dentro de la app es el suelo, no la verdad.
 */
export function mezclar(deLaNube = []) {
  const dentro = comoDeLaNube();
  const vistas = new Set(deLaNube.map((r) => r.id));
  return [
    ...deLaNube,
    ...dentro.filter((r) => !vistas.has(r.id)),
  ];
}
