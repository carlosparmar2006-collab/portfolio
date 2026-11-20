/* =============================================================================
 * ciencia.js — El estudio de entrenamiento personalizado. SIN PANTALLA.
 *
 * Carlos, 31-ago-2026: *«no me gusta nada lo que has hecho del setup inicial,
 * no tiene nada de ciencia respaldando lo que das en función de los días de
 * entrenamiento. La idea es ofrecer un estudio de entrenamiento personalizado
 * para el usuario en función de los datos proporcionados, aquí la idea es que
 * busques fuentes científicas para dar una buena recomendación»*.
 *
 * Tenía razón: la versión anterior repartía «3 días = Push/Pull/Leg, 3×12» y ese
 * 3×12 no salía de ningún sitio. Era un número bonito.
 *
 * QUÉ HACE ESTO
 * -------------
 * Coge lo que la persona ha contestado (experiencia, días que puede venir,
 * cuánto rato tiene, qué busca) y devuelve un plan con NÚMEROS Y CON MOTIVO:
 * cuántas series por grupo y semana, repartidas en cuántos días, con qué
 * repeticiones, a qué esfuerzo, cuánto descanso y cómo subir de semana en
 * semana. Cada recomendación arrastra el `id` de la fuente de la que sale, y la
 * pantalla las enseña.
 *
 * LAS TRES REGLAS QUE LO GOBIERNAN, Y LAS TRES SALEN DE LA EVIDENCIA
 * -----------------------------------------------------------------
 * 1. **EL VOLUMEN MANDA, PERO CON RENDIMIENTOS DECRECIENTES.** Más series a la
 *    semana → más músculo, y la curva sigue subiendo, pero cada serie extra
 *    aporta menos. Para FUERZA la curva se aplana muchísimo antes. Por eso el
 *    volumen recomendado depende de qué se busca, y no es «cuanto más mejor».
 * 2. **LA SESIÓN TIENE TECHO.** Meter 25 series de pecho en un día no equivale a
 *    repartirlas en dos: por sesión también hay rendimientos decrecientes. Ese
 *    techo es lo que decide la FRECUENCIA — no al revés.
 * 3. **EL TIEMPO EXISTE.** Una serie con su descanso son ~3 minutos. Si alguien
 *    dice que tiene 45 minutos, no se le pueden recetar 30 series: sería un plan
 *    que no se puede cumplir, y un plan que no se cumple no vale nada. Así que
 *    el tiempo RECORTA el volumen, y se dice cuando lo hace.
 *
 * LO QUE NO SE INVENTA
 * --------------------
 * La evidencia es sobre todo de hombres jóvenes entrenados y sanos, y la
 * variación entre personas es enorme. Esto es un PUNTO DE PARTIDA razonable, no
 * una receta médica, y la pantalla lo dice con esas palabras. Donde la evidencia
 * no se moja (¿dónde está exactamente el techo del volumen?), aquí tampoco.
 *
 * Sin DOM a propósito, como `perfil.js` y `plan.js`: se puede ejecutar en Node y
 * probar con números en vez de a ojo.
 * ========================================================================== */

/* ==========================================================================
 * LAS FUENTES
 *
 * Van en JSON estricto entre marcadores por lo de siempre: `pc/` las lee y así
 * no hay dos listas que se puedan desincronizar. `dice` es el resumen de lo que
 * se ha usado de cada una, no un resumen del artículo entero.
 * ========================================================================== */
/* FUENTES_INICIO */
export const FUENTES = [
  {
    "id": "pelland2025",
    "autores": "Pelland JC, Remmert JF, Robinson ZP, et al.",
    "anio": 2025,
    "titulo": "The Resistance Training Dose Response: Meta-Regressions Exploring the Effects of Weekly Volume and Frequency on Muscle Hypertrophy and Strength Gains",
    "revista": "Sports Medicine",
    "doi": "10.1007/s40279-025-02344-w",
    "que_es": "Metarregresión de 67 estudios y 2.058 personas",
    "dice": "El volumen y la frecuencia tienen curvas distintas. La hipertrofia sigue mejorando conforme suben las series semanales, con rendimientos decrecientes; la fuerza se aplana muchísimo antes (en torno a 4 series semanales por grupo). Con el volumen igualado, la frecuencia por sí sola apenas cambia la hipertrofia."
  },
  {
    "id": "schoenfeld2017volumen",
    "autores": "Schoenfeld BJ, Ogborn D, Krieger JW",
    "anio": 2017,
    "titulo": "Dose-response relationship between weekly resistance training volume and increases in muscle mass: A systematic review and meta-analysis",
    "revista": "Journal of Sports Sciences",
    "doi": "10.1080/02640414.2016.1210197",
    "que_es": "Revisión sistemática y metaanálisis, 15 estudios",
    "dice": "Relación dosis-respuesta graduada: cada serie semanal extra por grupo se asoció a ~0,37 % más de crecimiento. Los grupos de 10 o más series semanales fueron los que más ganaron."
  },
  {
    "id": "schoenfeld2021carga",
    "autores": "Schoenfeld BJ, Grgic J, Van Every DW, Plotkin DL",
    "anio": 2021,
    "titulo": "Loading Recommendations for Muscle Strength, Hypertrophy, and Local Endurance: A Re-Examination of the Repetition Continuum",
    "revista": "Sports (MDPI)",
    "doi": "10.3390/sports9020032",
    "que_es": "Revisión narrativa del «continuo de repeticiones»",
    "dice": "Para MÚSCULO, el crecimiento es parecido en un rango amplísimo de cargas (desde ~30 % del máximo hacia arriba) siempre que el esfuerzo sea alto. Para FUERZA MÁXIMA sí hacen falta cargas altas (~80 % o más). O sea: las repeticiones se eligen por lo que se busca, no porque «8-12 sea la zona del músculo»."
  },
  {
    "id": "schoenfeld2016frecuencia",
    "autores": "Schoenfeld BJ, Ogborn D, Krieger JW",
    "anio": 2016,
    "titulo": "Effects of Resistance Training Frequency on Measures of Muscle Hypertrophy: A Systematic Review and Meta-Analysis",
    "revista": "Sports Medicine",
    "doi": "10.1007/s40279-016-0543-8",
    "que_es": "Revisión sistemática y metaanálisis",
    "dice": "Entrenar un grupo muscular al menos DOS veces por semana superó a una vez cuando el volumen semanal era el mismo. Si tres es mejor que dos, no está claro."
  },
  {
    "id": "schoenfeld2016descanso",
    "autores": "Schoenfeld BJ, Pope ZK, Benik FM, et al.",
    "anio": 2016,
    "titulo": "Longer Interset Rest Periods Enhance Muscle Strength and Hypertrophy in Resistance-Trained Men",
    "revista": "Journal of Strength and Conditioning Research",
    "doi": "10.1519/JSC.0000000000001272",
    "que_es": "Ensayo de 8 semanas, 21 hombres entrenados",
    "dice": "Descansar 3 minutos entre series dio más fuerza (sentadilla y banca) y más grosor muscular que descansar 1 minuto, con todo lo demás igual. Descansar poco para «apretar más» sale caro."
  }
];
/* FUENTES_FIN */

export const FUENTE_POR_ID = new Map(FUENTES.map((f) => [f.id, f]));


/* ==========================================================================
 * LAS PREGUNTAS QUE SE HACEN, Y POR QUÉ CADA UNA
 *
 * Ninguna está por rellenar. Si una respuesta no cambia el plan, la pregunta
 * sobra — y la versión anterior tenía justo eso: preguntaba los días y luego
 * daba el mismo 3×12 a todo el mundo.
 * ========================================================================== */

/** Qué busca. Es lo que más mueve el plan: cambia volumen, cargas y descansos. */
export const OBJETIVOS = [
  {
    id: 'musculo',
    nombre: 'Ganar músculo',
    detalle: 'Que se note el cambio en el espejo',
    // La hipertrofia sigue mejorando con más series, con rendimientos
    // decrecientes: por eso el rango va alto (pelland2025, schoenfeld2017volumen).
    series: { min: 10, ideal: 16, max: 22 },
    reps: { min: 6, max: 20, tipico: 10 },
    rir: 2,
    descansoSeg: 120,
    fuentes: ['schoenfeld2017volumen', 'pelland2025', 'schoenfeld2021carga'],
  },
  {
    id: 'fuerza',
    nombre: 'Levantar más peso',
    detalle: 'Subir los números de la barra',
    // La curva de la fuerza se aplana pronto (≈4 series semanales por grupo),
    // así que aquí más volumen no compra casi nada: lo que compra es CARGA.
    series: { min: 6, ideal: 10, max: 14 },
    reps: { min: 3, max: 6, tipico: 5 },
    rir: 2,
    descansoSeg: 180,
    fuentes: ['pelland2025', 'schoenfeld2021carga', 'schoenfeld2016descanso'],
  },
  {
    id: 'salud',
    nombre: 'Estar en forma y sano',
    detalle: 'Sin obsesión con el músculo ni con el peso',
    series: { min: 6, ideal: 10, max: 14 },
    reps: { min: 8, max: 15, tipico: 12 },
    rir: 3,
    descansoSeg: 90,
    fuentes: ['schoenfeld2017volumen', 'schoenfeld2021carga'],
  },
];

/**
 * Cuánta experiencia. Multiplica el volumen y mueve el esfuerzo.
 *
 * Quien empieza gana con menos, y sobre todo tiene que aprender el movimiento
 * antes que cargarlo: por eso arranca en la parte baja del rango y con más
 * repeticiones de reserva. No es prudencia genérica, es que una técnica mala
 * repetida 16 series por semana es una lesión con fecha.
 */
export const EXPERIENCIAS = [
  { id: 'empiezo', nombre: 'Empiezo ahora', detalle: 'Nunca o casi nunca he entrenado',
    factorVolumen: 0.65, rirExtra: 1, progresion: 'rapida' },
  { id: 'medio', nombre: 'Llevo un tiempo', detalle: 'Meses o algún año, con parones',
    factorVolumen: 0.85, rirExtra: 0, progresion: 'normal' },
  { id: 'avanzado', nombre: 'Años de gimnasio', detalle: 'Sé lo que levanto en cada máquina',
    factorVolumen: 1, rirExtra: 0, progresion: 'lenta' },
];

/** Cuánto rato hay de verdad. Es lo que hace que el plan se pueda cumplir. */
export const DURACIONES = [
  { id: 'corta', nombre: '30-45 minutos', minutos: 40 },
  { id: 'media', nombre: '45-70 minutos', minutos: 60 },
  { id: 'larga', nombre: 'Más de 70 minutos', minutos: 85 },
];

export function objetivoDe(id) { return OBJETIVOS.find((o) => o.id === id) || OBJETIVOS[0]; }
export function experienciaDe(id) { return EXPERIENCIAS.find((e) => e.id === id) || EXPERIENCIAS[1]; }
export function duracionDe(id) { return DURACIONES.find((d) => d.id === id) || DURACIONES[1]; }

/* ==========================================================================
 * LOS TOPES QUE NO SON OPINIÓN
 * ========================================================================== */

/**
 * Series por grupo y SESIÓN a partir de las cuales dejan de notarse mejoras.
 *
 * De `pelland2025`: por sesión también hay rendimientos decrecientes, y el punto
 * donde deja de distinguirse la mejora ronda las 11 series «fraccionales» para
 * hipertrofia. Se deja en 10 como número redondo y prudente: es el que decide
 * cuántos días hacen falta, porque el volumen semanal que no cabe en una sesión
 * hay que repartirlo en dos.
 */
export const TOPE_SERIES_POR_SESION = 10;

/**
 * El suelo. Por debajo de esto se está dejando mucho por el camino, pero sigue
 * siendo entrenar: la fuerza se acerca a su meseta en torno a 4 series semanales
 * por grupo (`pelland2025`). Se usa cuando el tiempo disponible no da para más:
 * antes recortar y decirlo que recetar un plan que no cabe.
 */
export const MINIMO_UTIL = 4;

/**
 * Cuánto dura una serie con su descanso, en minutos.
 *
 * No es un número inventado: son ~40 s de trabajo más el descanso que recete el
 * objetivo. Con 2 minutos de descanso salen ~2,7 min por serie. De aquí sale el
 * techo real de series que caben en la sesión.
 */
export function minutosPorSerie(descansoSeg) {
  return (40 + Number(descansoSeg || 120)) / 60;
}

/** Los grupos que se reparten, y cuánto peso tiene cada uno en la semana. */
export const GRUPOS = [
  { id: 'pecho', nombre: 'Pecho', peso: 1 },
  { id: 'espalda', nombre: 'Espalda', peso: 1.15 },   // tira de dos patrones (vertical y horizontal)
  { id: 'pierna', nombre: 'Pierna', peso: 1.2 },      // el grupo más grande
  { id: 'hombro', nombre: 'Hombro', peso: 0.85 },
  { id: 'biceps', nombre: 'Bíceps', peso: 0.6 },      // ya trabaja en todo lo de tirar
  { id: 'triceps', nombre: 'Tríceps', peso: 0.6 },    // ya trabaja en todo lo de empujar
  { id: 'core', nombre: 'Core', peso: 0.5 },
];

/* ==========================================================================
 * LOS REPARTOS
 *
 * AQUÍ ESTÁ EL FALLO GORDO DE LA VERSIÓN ANTERIOR, y conviene dejarlo escrito.
 * Con 3 días proponía **Push / Pull / Leg**, que es el reparto más famoso del
 * mundo… y que a tres días deja cada grupo a UNA vez por semana. La evidencia
 * dice justo lo contrario: con el mismo volumen semanal, dos veces por semana
 * gana a una (`schoenfeld2016frecuencia`). O sea que el reparto más popular era,
 * a esa frecuencia, el peor de los tres que caben.
 *
 * Así que los repartos se eligen para que **ningún grupo baje de 2 veces por
 * semana** en cuanto hay 3 días o más. Push/Pull/Leg vuelve a aparecer a 6 días,
 * que es donde sí da frecuencia 2.
 *
 * `grupos` son los de `GRUPOS`. La frecuencia no se escribe: se CUENTA de aquí,
 * para que no pueda mentir.
 * ========================================================================== */
export const REPARTOS = [
  {
    dias: 2, id: 'completo2', nombre: 'Cuerpo entero, dos días',
    dice: 'Con dos días hay que tocarlo todo los dos días. Repartir por grupos dejaría cada músculo a una vez por semana, que es lo que menos rinde.',
    plan: [
      { nombre: 'Día A', grupos: ['pecho', 'espalda', 'pierna', 'hombro', 'biceps', 'triceps', 'core'] },
      { nombre: 'Día B', grupos: ['pecho', 'espalda', 'pierna', 'hombro', 'biceps', 'triceps', 'core'] },
    ],
  },
  {
    dias: 3, id: 'torsopierna3', nombre: 'Torso · Pierna · Cuerpo entero',
    dice: 'A tres días esto deja cada grupo dos veces por semana. El clásico Push/Pull/Leg, en cambio, lo dejaría solo una.',
    plan: [
      { nombre: 'Torso', grupos: ['pecho', 'espalda', 'hombro', 'biceps', 'triceps'] },
      { nombre: 'Pierna', grupos: ['pierna', 'core'] },
      { nombre: 'Cuerpo entero', grupos: ['pecho', 'espalda', 'pierna', 'hombro', 'biceps', 'triceps', 'core'] },
    ],
  },
  {
    dias: 4, id: 'torsopierna4', nombre: 'Torso · Pierna, dos veces',
    dice: 'El reparto con mejor relación entre días y frecuencia: todo dos veces por semana, sin sesiones interminables.',
    plan: [
      { nombre: 'Torso A', grupos: ['pecho', 'espalda', 'hombro', 'biceps', 'triceps'] },
      { nombre: 'Pierna A', grupos: ['pierna', 'core'] },
      { nombre: 'Torso B', grupos: ['pecho', 'espalda', 'hombro', 'biceps', 'triceps'] },
      { nombre: 'Pierna B', grupos: ['pierna', 'core'] },
    ],
  },
  {
    dias: 5, id: 'mixto5', nombre: 'Torso · Pierna · Empuje · Tirón · Pierna',
    dice: 'Cinco días permiten separar empuje y tirón sin bajar de dos veces por semana en nada.',
    plan: [
      { nombre: 'Torso', grupos: ['pecho', 'espalda', 'hombro', 'biceps', 'triceps'] },
      { nombre: 'Pierna A', grupos: ['pierna', 'core'] },
      { nombre: 'Empuje', grupos: ['pecho', 'hombro', 'triceps'] },
      { nombre: 'Tirón', grupos: ['espalda', 'biceps'] },
      { nombre: 'Pierna B', grupos: ['pierna', 'core'] },
    ],
  },
  {
    dias: 6, id: 'ppl6', nombre: 'Push · Pull · Leg, dos vueltas',
    dice: 'Aquí sí: a seis días, Push/Pull/Leg da dos veces por semana en todo y sesiones cortas.',
    plan: [
      { nombre: 'Push A', grupos: ['pecho', 'hombro', 'triceps'] },
      { nombre: 'Pull A', grupos: ['espalda', 'biceps'] },
      { nombre: 'Leg A', grupos: ['pierna', 'core'] },
      { nombre: 'Push B', grupos: ['pecho', 'hombro', 'triceps'] },
      { nombre: 'Pull B', grupos: ['espalda', 'biceps'] },
      { nombre: 'Leg B', grupos: ['pierna', 'core'] },
    ],
  },
];

export function repartoDe(dias) {
  const n = Math.max(2, Math.min(6, Number(dias) || 3));
  return REPARTOS.find((r) => r.dias === n) || REPARTOS[1];
}

/** Cuántas veces por semana toca un grupo en un reparto. Se cuenta, no se dice. */
export function frecuenciaDe(reparto, grupoId) {
  return reparto.plan.filter((d) => d.grupos.includes(grupoId)).length;
}

/* ==========================================================================
 * EL ESTUDIO
 * ========================================================================== */

const redondear = (n, d = 0) => {
  const f = 10 ** d;
  return Math.round(n * f) / f;
};

/**
 * El plan completo a partir de lo que ha contestado la persona.
 *
 * @param r {objetivo, experiencia, dias, duracion}
 * @returns un objeto con los números, los avisos y las fuentes de cada cosa.
 */
export function estudiar(r = {}) {
  const obj = objetivoDe(r.objetivo);
  const exp = experienciaDe(r.experiencia);
  const dur = duracionDe(r.duracion);
  const reparto = repartoDe(r.dias);
  const avisos = [];

  // 1. VOLUMEN DE PARTIDA — el ideal del objetivo, ajustado por experiencia.
  const ideal = obj.series.ideal * exp.factorVolumen;
  let porGrupo = Math.max(obj.series.min, Math.min(obj.series.max, Math.round(ideal)));

  // 2. EL TECHO DE LA SESIÓN. Si el volumen semanal de un grupo no cabe en las
  //    veces que se entrena, sobra volumen: por sesión también hay rendimientos
  //    decrecientes (pelland2025). Se recorta y se dice.
  const frecMin = Math.min(...GRUPOS.map((g) => frecuenciaDe(reparto, g.id)).filter((n) => n > 0));
  const cabePorFrecuencia = TOPE_SERIES_POR_SESION * frecMin;
  if (porGrupo > cabePorFrecuencia) {
    avisos.push({
      que: `Con ${reparto.dias} días no caben más de ${cabePorFrecuencia} series por grupo sin `
        + `amontonarlas: a partir de unas ${TOPE_SERIES_POR_SESION} series de un mismo músculo en `
        + `una sesión, las de más apenas suman.`,
      fuente: 'pelland2025',
    });
    porGrupo = cabePorFrecuencia;
  }

  // 3. EL TIEMPO. Una serie con su descanso son minutos de verdad. Si el plan no
  //    cabe en el rato que hay, se recorta — un plan que no se puede cumplir no
  //    vale nada, y callarlo sería peor que recortarlo.
  const minSerie = minutosPorSerie(obj.descansoSeg);
  const seriesQueCaben = Math.floor((dur.minutos * reparto.dias) / minSerie);
  const pesoTotal = GRUPOS.reduce((s, g) => s + g.peso, 0);
  let seriesSemana = Math.round(porGrupo * pesoTotal);

  if (seriesSemana > seriesQueCaben) {
    const antes = porGrupo;
    // Se puede bajar POR DEBAJO del mínimo del objetivo, hasta `MINIMO_UTIL`. Un
    // plan recortado que se cumple vale más que uno perfecto que no cabe. Pero
    // si hay que llegar ahí, se dice con todas las letras y se dan las salidas.
    porGrupo = Math.max(MINIMO_UTIL, Math.floor((seriesQueCaben / pesoTotal)));
    seriesSemana = Math.round(porGrupo * pesoTotal);
    if (porGrupo < antes) {
      avisos.push({
        que: `Con ${dur.nombre.toLowerCase()} por sesión y ${reparto.dias} días caben unas `
          + `${seriesQueCaben} series a la semana: cada serie son ${redondear(minSerie, 1)} minutos `
          + `contando los ${obj.descansoSeg} segundos de descanso. Se baja de ${antes} a `
          + `${porGrupo} series por grupo para que el plan se pueda cumplir de verdad.`,
        fuente: 'schoenfeld2016descanso',
      });
    }
    if (porGrupo < obj.series.min) {
      avisos.push({
        que: `Aun así te quedas por debajo de lo que pide «${obj.nombre.toLowerCase()}» `
          + `(${obj.series.min} series por grupo). Vas a mejorar igual, pero si quieres el ritmo `
          + `completo hace falta una de dos: venir un día más, o alargar la sesión.`,
        fuente: 'schoenfeld2017volumen',
      });
    }
  } else if (seriesQueCaben - seriesSemana >= pesoTotal * 3) {
    // Sobra tiempo. Decirlo también es información: quien tiene margen y quiere
    // más músculo puede subir, y quien no, sabe que va sobrado.
    const podria = Math.min(obj.series.max, Math.floor(seriesQueCaben / pesoTotal));
    if (podria > porGrupo) {
      avisos.push({
        que: `Te sobra tiempo: en ${dur.nombre.toLowerCase()} caben hasta ${podria} series por `
          + `grupo. Subir de ${porGrupo} a ${podria} daría algo más de músculo, aunque cada serie `
          + `extra aporta menos que la anterior y cuesta más recuperación.`,
        fuente: 'pelland2025',
        bueno: true,
      });
    }
  }

  // 4. EL REPARTO POR GRUPO, con su frecuencia contada del propio reparto.
  const grupos = GRUPOS.map((g) => {
    const frecuencia = frecuenciaDe(reparto, g.id);
    const semanales = Math.max(2, Math.round(porGrupo * g.peso));
    return {
      id: g.id,
      nombre: g.nombre,
      semanales,
      frecuencia,
      porSesion: frecuencia ? redondear(semanales / frecuencia, 1) : 0,
    };
  });

  const bajos = grupos.filter((g) => g.frecuencia === 1);
  if (bajos.length) {
    avisos.push({
      que: `${bajos.map((g) => g.nombre).join(', ')} queda${bajos.length > 1 ? 'n' : ''} a una vez `
        + 'por semana. Con el mismo volumen, dos veces rinde más.',
      fuente: 'schoenfeld2016frecuencia',
    });
  }

  // 5. ESFUERZO Y CARGA.
  const rir = Math.min(4, obj.rir + exp.rirExtra);

  // ¿CABE DE VERDAD? Puede que ni con el mínimo útil: pasa con «fuerza» a dos
  // días cortos, porque sus 3 minutos de descanso comen la sesión entera. La
  // salida NO es acortar el descanso —es lo que `schoenfeld2016descanso` dice
  // que no hay que hacer— sino decir que ese plan no entra en ese rato.
  const minutosSesion = Math.round((seriesSemana / reparto.dias) * minSerie);
  const cabe = minutosSesion <= dur.minutos;
  if (!cabe) {
    avisos.push({
      que: `Este plan pide unos ${minutosSesion} minutos por sesión y has dicho `
        + `${dur.nombre.toLowerCase()}. No se arregla descansando menos: descansar poco cuesta `
        + `fuerza y músculo. O alargas la sesión, o vienes más días, o cambias de objetivo.`,
      fuente: 'schoenfeld2016descanso',
      grave: true,
    });
  }

  return {
    objetivo: obj,
    experiencia: exp,
    duracion: dur,
    reparto,
    grupos,
    seriesPorGrupo: porGrupo,
    seriesSemana,
    minutosSesion,
    cabe,
    reps: obj.reps,
    rir,
    descansoSeg: obj.descansoSeg,
    progresion: PROGRESIONES[exp.progresion],
    avisos,
    // Las fuentes que de verdad se han usado para ESTE plan, sin repetir.
    fuentes: [...new Set([
      ...obj.fuentes,
      'schoenfeld2016frecuencia',
      ...avisos.map((a) => a.fuente),
    ])].map((id) => FUENTE_POR_ID.get(id)).filter(Boolean),
  };
}

/**
 * Cómo se sube el peso. Va por experiencia porque el margen de mejora no es el
 * mismo: quien empieza mejora casi cada sesión, y quien lleva años, no.
 */
export const PROGRESIONES = {
  rapida: {
    id: 'rapida',
    titulo: 'Sube casi cada sesión',
    dice: 'Cuando completes todas las series en el rango alto de repeticiones con la técnica limpia, sube el peso el salto más pequeño de esa máquina. Al principio se puede subir casi cada semana.',
  },
  normal: {
    id: 'normal',
    titulo: 'Sube cuando te sobre una repetición',
    dice: 'Cuando puedas hacer todas las series llegando al tope del rango y aún te sobre una repetición, sube al salto siguiente y vuelve al rango bajo.',
  },
  lenta: {
    id: 'lenta',
    titulo: 'Sube por ciclos',
    dice: 'Las mejoras ya no son semanales. Trabaja el mismo peso varias sesiones acumulando repeticiones y sube cuando el rango alto te salga en todas las series.',
  },
};

/** Una frase corta para la tarjeta del estudio. */
export function resumen(e) {
  return `${e.seriesPorGrupo} series por grupo y semana, repartidas en ${e.reparto.dias} días, `
    + `a ${e.reps.min}-${e.reps.max} repeticiones dejando ${e.rir} en la recámara.`;
}
