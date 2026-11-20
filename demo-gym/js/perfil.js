/* =============================================================================
 * perfil.js — Racha, veteranía, logros y medallas. SIN PANTALLA.
 *
 * Aquí se decide quién ha ganado qué. El catálogo (`insignias.js`) solo dice
 * cuál es el listón; este módulo mide. Igual que `plan.js`, no toca el DOM: se
 * puede ejecutar en Node y probar con datos de verdad, en vez de a ojo.
 *
 * Y tiene GEMELO EN PYTHON (`pc/gym_perfil.py`), porque JARVIS también va a
 * decir por voz «llevas 6 semanas seguidas». Rige la regla de paridad del
 * proyecto: si la app dice 6 y JARVIS dice 5, el dato deja de valer.
 *
 * LAS TRES DECISIONES QUE HAY QUE ENTENDER
 * ----------------------------------------
 * 1. LA RACHA NO ES «DÍAS SEGUIDOS». Nadie entrena los siete días de la semana,
 *    y una racha que se rompe cada domingo es una racha que castiga por
 *    descansar — justo lo contrario de lo que tiene que hacer. Aquí una racha
 *    sigue viva mientras no pasen más de `HUECO_MAX` días (3) sin pisar el
 *    gimnasio. Con un Push/Pull/Leg normal no se rompe nunca; con tres semanas
 *    de sofá, sí. Se cuenta en DÍAS ENTRENADOS, que es el número que motiva.
 *
 * 2. LA RACHA DE SEMANAS ES LA MEDIDA SERIA. Semanas seguidas (de lunes a
 *    domingo) con al menos `MIN_SEMANA` (2) días de gimnasio. Es la que usan
 *    las insignias de racha, porque no se puede maquillar entrenando cuatro
 *    días de golpe y desapareciendo.
 *
 * 3. UN PR ES UNA MEJORA REAL SOBRE LA MISMA MÁQUINA. Se cuenta cada vez que
 *    una máquina supera su propio récord de 1RM estimado. La primera serie de
 *    una máquina NO es un PR: si lo fuera, dar de alta veinte máquinas
 *    regalaría la insignia de «20 récords» sin haber levantado nada.
 *
 * LO QUE NO SE INVENTA
 * --------------------
 * Los días marcados como flojos siguen contando para la RACHA (fuiste, y eso
 * es lo que mide la constancia) pero no para los PR ni para el volumen, igual
 * que en el resto de la app. Y las medallas por múltiplo del peso corporal no
 * salen si no hay una pesada apuntada: antes callar que una medalla calculada
 * sobre un peso inventado.
 * ========================================================================== */

import * as D from './datos.js';
import { INSIGNIAS, MEDALLAS, NIVELES, LEVANTAMIENTOS, MATERIALES } from './insignias.js';

/** Días de descanso que aguanta una racha antes de romperse. */
export const HUECO_MAX = 3;
/** Días de gimnasio que hacen que una semana cuente para la racha de semanas. */
export const MIN_SEMANA = 2;
/** Antes de esta hora (local) una serie cuenta como madrugón. */
export const HORA_MADRUGON = 8;
/** A partir de esta hora (local) una serie cuenta como nocturna. */
export const HORA_NOCTURNA = 21;

/* --------------------------------------------------------------------------
 * Ayudas de fecha
 * ------------------------------------------------------------------------ */

export function dia(fechaISO) {
  return String(fechaISO || '').slice(0, 10);
}

/** Diferencia en días entre dos AAAA-MM-DD. Con mediodía, para que el cambio
 *  de hora de marzo y octubre no reste ni sume un día de propina. */
export function diasEntre(desde, hasta) {
  const a = new Date(`${desde}T12:00:00`);
  const b = new Date(`${hasta}T12:00:00`);
  return Math.round((b - a) / 86400000);
}

/** El lunes de esa fecha, como AAAA-MM-DD. Mismo criterio que `datos.js`. */
export function claveSemana(fechaISO) {
  return D.claveperiodo(fechaISO, 'semana');
}

/** La hora LOCAL del aparato que mira. Ver la nota de MEMORIA sobre husos. */
function horaLocal(fechaISO) {
  const d = new Date(fechaISO);
  return Number.isNaN(d.getTime()) ? null : d.getHours();
}

/* --------------------------------------------------------------------------
 * Rachas
 * ------------------------------------------------------------------------ */

/**
 * La racha de días entrenados.
 *
 * @param dias  lista de AAAA-MM-DD (se ordena y se deduplica aquí)
 * @param hoy   AAAA-MM-DD de referencia
 * @returns {{actual, mejor, viva, ultimoDia, diasParaRomper}}
 *
 * `viva` distingue «llevas 12» de «llevaste 12»: si hace cinco días que no
 * pisas el gimnasio, la racha está rota y decir «llevas 12» sería mentir.
 * `diasParaRomper` es lo que hace que la racha sirva de algo — «te quedan 2
 * días» empuja; un número a secas, no.
 */
export function rachaDeDias(dias, hoy) {
  const orden = [...new Set((dias || []).map(dia).filter(Boolean))].sort();
  if (!orden.length) {
    return { actual: 0, mejor: 0, viva: false, ultimoDia: null, diasParaRomper: 0 };
  }

  let mejor = 1;
  let corrida = 1;
  for (let i = 1; i < orden.length; i++) {
    if (diasEntre(orden[i - 1], orden[i]) <= HUECO_MAX) corrida++;
    else corrida = 1;
    if (corrida > mejor) mejor = corrida;
  }

  const ultimoDia = orden[orden.length - 1];
  const desdeElUltimo = diasEntre(ultimoDia, hoy);
  const viva = desdeElUltimo >= 0 && desdeElUltimo <= HUECO_MAX;

  // La racha ACTUAL es la corrida que acaba en el último día entrenado, y solo
  // se enseña como actual si sigue viva.
  let actual = 1;
  for (let i = orden.length - 1; i > 0; i--) {
    if (diasEntre(orden[i - 1], orden[i]) <= HUECO_MAX) actual++;
    else break;
  }

  return {
    actual: viva ? actual : 0,
    mejor,
    viva,
    ultimoDia,
    diasParaRomper: viva ? HUECO_MAX - desdeElUltimo : 0,
  };
}

/**
 * La racha de semanas: semanas seguidas con al menos MIN_SEMANA días de gimnasio.
 *
 * La semana EN CURSO cuenta como viva aunque todavía no llegue al mínimo — es
 * lunes por la mañana, no se ha roto nada. Romper la racha de alguien el lunes
 * a las 00:01 sería un error de bulto.
 */
export function rachaDeSemanas(dias, hoy) {
  const porSemana = new Map();
  for (const d of new Set((dias || []).map(dia).filter(Boolean))) {
    const s = claveSemana(`${d}T12:00:00`);
    porSemana.set(s, (porSemana.get(s) || 0) + 1);
  }
  if (!porSemana.size) return { actual: 0, mejor: 0, estaSemana: 0 };

  const buenas = [...porSemana.entries()]
    .filter(([, n]) => n >= MIN_SEMANA)
    .map(([s]) => s)
    .sort();

  const semanaDeHoy = claveSemana(`${dia(hoy)}T12:00:00`);
  const estaSemana = porSemana.get(semanaDeHoy) || 0;

  let mejor = 0;
  let corrida = 0;
  let anterior = null;
  for (const s of buenas) {
    corrida = anterior && diasEntre(anterior, s) === 7 ? corrida + 1 : 1;
    if (corrida > mejor) mejor = corrida;
    anterior = s;
  }

  // La actual: se cuenta hacia atrás desde la última semana buena, y solo vale
  // si esa última semana es la de hoy o la de la semana pasada.
  let actual = 0;
  if (buenas.length) {
    const ultima = buenas[buenas.length - 1];
    const distancia = diasEntre(ultima, semanaDeHoy);
    if (distancia === 0 || distancia === 7) {
      actual = 1;
      for (let i = buenas.length - 1; i > 0; i--) {
        if (diasEntre(buenas[i - 1], buenas[i]) === 7) actual++;
        else break;
      }
    }
  }

  return { actual, mejor, estaSemana };
}

/* --------------------------------------------------------------------------
 * Récords personales
 * ------------------------------------------------------------------------ */

/**
 * Cuántas veces se ha batido el récord, y el mejor peso REAL de cada máquina.
 *
 * Se recorre en orden de fecha: cada serie que supere el mejor 1RM estimado
 * de SU máquina cuenta como un PR. La primera de cada máquina no cuenta (ver
 * la cabecera del fichero).
 *
 * `mejorPeso` es el peso de placa más alto levantado en esa máquina,
 * normalizado a kg. Es el que usan las medallas: una medalla de «100 kg» tiene
 * que ser cien kilos en la barra, no un 1RM estimado a partir de 80×8.
 */
export function records(series, maquinasPorId, { excluir = new Set() } = {}) {
  const utiles = (series || [])
    .filter((s) => !excluir.has(s.sesionId))
    .slice()
    .sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));

  const mejorE1 = new Map();
  const mejorPeso = new Map();
  // Los récords POR DÍA, y no solo el total: es lo que necesita el vestuario
  // para dar como mucho tres cajas de récord al día. Sin esto, subir medio kilo
  // cinco veces en una tarde daría cinco cajas, y un contador que se puede
  // inflar no es un contador.
  const prsPorDia = new Map();
  let prs = 0;

  for (const s of utiles) {
    const m = maquinasPorId.get(s.maquinaId);
    if (!m) continue;
    const unidad = m.unidad || 'kg';
    const e1 = D.e1rmKg(s, unidad);
    const kg = D.aKg(s.peso, unidad);

    if (mejorE1.has(s.maquinaId)) {
      if (e1 > mejorE1.get(s.maquinaId)) {
        prs++;
        const d = dia(s.fecha);
        if (d) prsPorDia.set(d, (prsPorDia.get(d) || 0) + 1);
        mejorE1.set(s.maquinaId, e1);
      }
    } else {
      mejorE1.set(s.maquinaId, e1);   // estreno: no es un récord, es el primero
    }

    if (kg > (mejorPeso.get(s.maquinaId) || 0)) mejorPeso.set(s.maquinaId, kg);
  }

  return { prs, prsPorDia, mejorE1, mejorPeso };
}

/** Para casar «Press de Banca» con «press de banca». */
export function normalizarNombre(t) {
  return String(t || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * El mejor peso levantado por NOMBRE de ejercicio (no por id de máquina).
 *
 * Se agrupa por nombre a propósito: el «press de banca» del gimnasio de Reus y
 * el de Barcelona son la misma barra con los mismos discos. Para las medallas
 * —que son hitos absolutos— eso sí se puede juntar, al revés que las
 * comparaciones de progreso, donde cada máquina va sola.
 */
export function mejorPorEjercicio(mejorPeso, maquinasPorId) {
  const salida = new Map();
  for (const [maquinaId, kg] of mejorPeso) {
    const m = maquinasPorId.get(maquinaId);
    if (!m) continue;
    const clave = normalizarNombre(m.nombre);
    if (kg > (salida.get(clave) || 0)) salida.set(clave, kg);
  }
  return salida;
}

/* --------------------------------------------------------------------------
 * QUÉ MÁQUINA ES QUÉ LEVANTAMIENTO
 *
 * El arreglo de «con algunas máquinas si cumples los requisitos no lo detecta».
 * La explicación larga está en la cabecera de `LEVANTAMIENTOS` en insignias.js.
 * ------------------------------------------------------------------------ */

/**
 * ¿Este nombre de máquina es este levantamiento?
 *
 * El orden de las tres comprobaciones NO es intercambiable:
 *   1. `exactos` primero, y gana a todo. Ahí están los nombres que la regla
 *      general tumbaría por error («peso muerto sumo con barra» lleva «sumo»,
 *      que está en `ninguna`, pero es un peso muerto de competición).
 *   2. `ninguna` después: basta uno para descartar.
 *   3. `todas` al final: tienen que estar todos.
 */
export function casaConLevantamiento(nombreMaquina, lev) {
  const n = normalizarNombre(nombreMaquina);
  if (!n || !lev) return false;
  for (const e of lev.exactos || []) if (normalizarNombre(e) === n) return true;
  for (const t of lev.ninguna || []) if (n.includes(normalizarNombre(t))) return false;
  const todas = lev.todas || [];
  if (!todas.length) return false;
  for (const t of todas) if (!n.includes(normalizarNombre(t))) return false;
  return true;
}

/**
 * El levantamiento de una máquina, o null.
 *
 * Lo que Carlos haya dicho a mano en la ficha MANDA, y manda también para
 * decir «esta no es ninguno» (`levantamiento: ''`): si la regla se equivoca en
 * los dos sentidos, tiene que poder corregirse en los dos.
 */
export function levantamientoDe(maquina) {
  if (!maquina) return null;
  if (maquina.levantamiento !== undefined && maquina.levantamiento !== null) {
    return String(maquina.levantamiento) || null;
  }
  for (const l of LEVANTAMIENTOS) if (casaConLevantamiento(maquina.nombre, l)) return l.id;
  return null;
}

/**
 * El mejor peso levantado en cada levantamiento grande.
 *
 * Se junta por levantamiento y no por máquina a propósito: el press de banca de
 * Reus y el de Barcelona son la misma barra con los mismos discos, y una
 * medalla es un hito absoluto. Para el progreso, en cambio, cada máquina sigue
 * comparándose solo consigo misma — eso no se toca.
 */
export function mejorPorLevantamiento(mejorPeso, maquinasPorId) {
  const salida = new Map();
  for (const [maquinaId, kg] of mejorPeso) {
    const m = maquinasPorId.get(maquinaId);
    if (!m) continue;
    const lev = levantamientoDe(m);
    if (!lev) continue;
    if (kg > (salida.get(lev) || 0)) salida.set(lev, kg);
  }
  return salida;
}

/* --------------------------------------------------------------------------
 * LA HOJA DE VIDA DE CADA LEVANTAMIENTO
 *
 * Para saber de qué MATERIAL es una medalla no basta con el mejor peso: hace
 * falta CUÁNDO cruzaste el listón, si lo has vuelto a mejorar después y en
 * cuántos gimnasios distintos has movido ese peso. Todo eso sale de las mismas
 * series de siempre, en una pasada.
 *
 * `hitos` es la escalera de máximos: cada vez que el mejor peso de ese
 * levantamiento sube, se apunta la fecha. No es el historial entero —eso serían
 * miles de filas—, son los peldaños, que es lo único que hace falta para saber
 * qué día pasaste por encima de 100 kg.
 *
 * `porGimnasio` guarda el mejor de CADA gimnasio, no el número de gimnasios.
 * La diferencia importa: la plata no pregunta «¿has entrenado en 3 sitios?»,
 * pregunta «¿has levantado ESE peso en 3 sitios?». Entrenar en muchos gimnasios
 * no puede regalar nada.
 * ------------------------------------------------------------------------ */
export function historialLevantamientos(datos) {
  const maquinasPorId = new Map((datos.maquinas || []).map((m) => [m.id, m]));
  const flojas = new Set((datos.sesiones || []).filter((s) => s.excluir).map((s) => s.id));
  const series = (datos.series || [])
    .filter((s) => !flojas.has(s.sesionId))
    .slice()
    .sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));

  const salida = new Map();
  for (const s of series) {
    const m = maquinasPorId.get(s.maquinaId);
    if (!m) continue;
    const lev = levantamientoDe(m);
    if (!lev) continue;
    const kg = D.aKg(s.peso, m.unidad || 'kg');
    if (!(kg > 0)) continue;

    let h = salida.get(lev);
    if (!h) { h = { mejorKg: 0, hitos: [], porGimnasio: new Map() }; salida.set(lev, h); }

    // El gimnasio de la MÁQUINA, no el de la sesión: una máquina pertenece a un
    // gimnasio y no se mueve. Si algún día una serie llegara sin sesión, esto
    // sigue sabiendo dónde se hizo.
    const gim = m.gimnasioId || s.gimnasioId || '';
    if (kg > (h.porGimnasio.get(gim) || 0)) h.porGimnasio.set(gim, kg);
    if (kg > h.mejorKg) { h.mejorKg = kg; h.hitos.push({ fecha: s.fecha, kg }); }
  }
  return salida;
}

/** Los materiales de más raro a menos: el primero que cumpla es el que va. */
const MATERIALES_POR_RAREZA = MATERIALES.slice().sort((a, b) => b.rareza - a.rareza);

/**
 * Lo que se sabe de una medalla YA CONSEGUIDA: cuándo, con cuánto margen y
 * en cuántos sitios. Es la entrada de `materialDe`, y también lo que la ficha
 * de la medalla enseña por escrito.
 *
 * Se separa del material a propósito: los hechos son los hechos, y la tabla de
 * materiales es una interpretación de esos hechos que puede cambiar sin tocar
 * este cálculo.
 */
export function hojaDeMedalla(medalla, historial, hoy) {
  const h = historial && historial.get ? historial.get(medalla.levantamiento) : null;
  const liston = Number(medalla.listonKg);
  if (!h || !(liston > 0)) {
    return { desde: null, dias: 0, margen: 0, gimnasios: 0, batidaDespues: false };
  }

  const cruce = h.hitos.find((x) => x.kg >= liston) || null;
  let gimnasios = 0;
  for (const kg of h.porGimnasio.values()) if (kg >= liston) gimnasios++;

  return {
    desde: cruce ? cruce.fecha : null,
    dias: cruce ? Math.max(0, diasEntre(dia(cruce.fecha), dia(hoy))) : 0,
    // EL MARGEN ES CON EL QUE LA SACASTE, NO CON EL QUE VAS HOY.
    //
    // (2-sep-2026) Carlos: «he cogido el press de banca y he ido aumentando de
    // peso hasta 150 y las medallas pasaban de bronce a hierro, luego a nada y
    // luego otra vez de hierro a bronce». Y con razón: esto era
    // `mejorKg / liston`, o sea CUÁNTO LE SACAS HOY al listón. Con 150 kg en
    // banca, «Banca 60» te sacaba un 150 % (diamante) y «Banca 140» un 7 %
    // (cobre) — la medalla más fácil salía con el material más caro y la más
    // difícil con el más barato. Al revés de como tiene que ser, y cambiando
    // cada vez que subes una serie.
    //
    // El material dice CÓMO LA SACASTE, así que el margen es el del
    // levantamiento que cruzó el listón. Se congela en ese momento y ya no se
    // mueve: subir más peso no reescribe lo que pasó aquel día.
    margen: cruce ? cruce.kg / liston : 0,
    gimnasios,
    // «La has vuelto a batir DESPUÉS de conseguirla»: no vale que el propio
    // salto que te la dio fuera enorme —para eso está el margen—, tiene que
    // haber otro peldaño posterior.
    batidaDespues: !!cruce && h.mejorKg > cruce.kg,
  };
}

/** ¿Cumple esta hoja la regla de este material? */
export function cumpleMaterial(material, hoja) {
  switch (material.regla) {
    case 'siempre':   return true;
    case 'margen':    return hoja.margen >= material.valor;
    case 'dias':      return hoja.dias >= material.valor;
    case 'gimnasios': return hoja.gimnasios >= material.valor;
    case 'veterana':  return hoja.dias >= material.valor && hoja.batidaDespues;
    default:          return false;
  }
}

/**
 * De qué material es esta medalla. `null` si no está conseguida.
 *
 * Se queda el de mayor rareza de los que cumplen. Uno por pieza: un acabado es
 * un acabado, y dos superpuestos no se distinguirían a 44 px.
 */
export function materialDe(medalla, historial, hoy) {
  if (!medalla.ganada) return null;
  const hoja = hojaDeMedalla(medalla, historial, hoy);
  for (const m of MATERIALES_POR_RAREZA) if (cumpleMaterial(m, hoja)) return { ...m, hoja };
  return null;
}

/**
 * Las máquinas que podrían ser un levantamiento pero la regla no reconoce.
 *
 * Sirve para la pantalla: en vez de dejar una medalla apagada sin explicación
 * («¿por qué no me la da si levanto 110?»), se le puede ofrecer «¿es alguna de
 * estas tu press de banca?». Se propone lo que comparte al menos una palabra
 * con el levantamiento y todavía no está asignado a ninguno.
 */
export function candidatasA(levId, maquinas) {
  const lev = LEVANTAMIENTOS.find((l) => l.id === levId);
  if (!lev) return [];
  const palabras = new Set(
    (lev.todas || []).concat(lev.nombre ? [lev.nombre] : []).flatMap((t) => normalizarNombre(t).split(' '))
  );
  palabras.delete('de'); palabras.delete('con'); palabras.delete('el'); palabras.delete('la');
  return (maquinas || []).filter((m) => {
    if (levantamientoDe(m) === levId) return false;      // ya cuenta: no hay nada que ofrecer
    const n = normalizarNombre(m.nombre).split(' ');
    return n.some((p) => palabras.has(p));
  });
}

/* --------------------------------------------------------------------------
 * El resumen: los números de los que cuelga todo lo demás
 * ------------------------------------------------------------------------ */

/**
 * Resume una vida entera de entrenos en las métricas que miden las insignias.
 *
 * @param datos {series, maquinas, sesiones, gimnasios, comidas, pesos, rutinas}
 * @param hoy   ISO de referencia (se puede fijar para poder probarlo)
 */
export function resumir(datos, hoy = new Date().toISOString()) {
  const series = datos.series || [];
  const maquinas = datos.maquinas || [];
  const sesiones = datos.sesiones || [];
  const maquinasPorId = new Map(maquinas.map((m) => [m.id, m]));
  const sesionPorId = new Map(sesiones.map((s) => [s.id, s]));
  const flojas = new Set(sesiones.filter((s) => s.excluir).map((s) => s.id));
  const hoyDia = dia(hoy);

  const diasSet = new Set();
  const gimnasiosSet = new Set();
  const maquinasSet = new Set();
  let volumenKg = 0;
  let madrugones = 0;
  let nocturnas = 0;
  let primera = null;
  let ultima = null;

  for (const s of series) {
    const d = dia(s.fecha);
    if (!d) continue;
    diasSet.add(d);
    maquinasSet.add(s.maquinaId);
    if (!primera || s.fecha < primera) primera = s.fecha;
    if (!ultima || s.fecha > ultima) ultima = s.fecha;

    const ses = sesionPorId.get(s.sesionId);
    const gimId = s.gimnasioId || (ses && ses.gimnasioId);
    if (gimId) gimnasiosSet.add(gimId);

    const h = horaLocal(s.fecha);
    if (h !== null && h < HORA_MADRUGON) madrugones++;
    if (h !== null && h >= HORA_NOCTURNA) nocturnas++;

    // El volumen NO cuenta los días flojos, igual que en las tendencias.
    if (!flojas.has(s.sesionId)) {
      const m = maquinasPorId.get(s.maquinaId);
      if (m) volumenKg += D.volumenKg(s, m.unidad || 'kg');
    }
  }

  const dias = [...diasSet].sort();
  const racha = rachaDeDias(dias, hoyDia);
  const semanas = rachaDeSemanas(dias, hoyDia);
  const { prs, prsPorDia, mejorPeso } = records(series, maquinasPorId, { excluir: flojas });

  const diasNutricion = new Set((datos.comidas || []).map((c) => dia(c.fecha)).filter(Boolean)).size;
  const diasCompletos = contarDiasCompletos(datos, flojas);

  const diasDesdeLaPrimera = primera ? Math.max(0, diasEntre(dia(primera), hoyDia)) : 0;

  return {
    // constancia
    diasEntrenados: dias.length,
    // La lista de días, no solo cuántos. La usa el vestuario para saber cuántas
    // cajas te has ganado DESDE que se estrenó, y así no vuelve a contar días
    // por su cuenta: dos sitios contando lo mismo acaban dando dos números.
    dias,
    prsPorDia: Object.fromEntries([...prsPorDia.entries()].sort()),
    seriesTotales: series.length,
    primeraSerie: primera,
    ultimaSerie: ultima,
    diasDesdeLaPrimera,
    // racha
    rachaDias: racha.actual,
    mejorRachaDias: racha.mejor,
    rachaViva: racha.viva,
    diasParaRomper: racha.diasParaRomper,
    rachaSemanas: semanas.actual,
    mejorRachaSemanas: semanas.mejor,
    diasEstaSemana: semanas.estaSemana,
    // fuerza y trabajo
    prs,
    volumenKg,
    volumenTon: volumenKg / 1000,
    // exploración
    gimnasios: gimnasiosSet.size,
    maquinasUsadas: maquinasSet.size,
    // disciplina y comida
    diasCompletos,
    diasNutricion,
    // horarios
    madrugones,
    nocturnas,
    // el mejor peso real por ejercicio, que es lo que miran las medallas
    mejorPorEjercicio: mejorPorEjercicio(mejorPeso, maquinasPorId),
    // El que miran las medallas desde el 31-ago-2026. `mejorPorEjercicio` se
    // queda porque JARVIS lo usa para hablar de una máquina concreta.
    mejorPorLevantamiento: mejorPorLevantamiento(mejorPeso, maquinasPorId),
    // La hoja de vida de cada levantamiento: es lo que decide el MATERIAL de
    // cada medalla (31-ago-2026). Va en el resumen y no en `evaluarMedallas`
    // para no recorrer las series dos veces.
    historialLevantamientos: historialLevantamientos(datos),
    // El día contra el que se cuentan los «90 días con la medalla». Sin esto,
    // `evaluarMedallas` tendría que volver a pedir la fecha y las dos mitades
    // del cálculo podrían caer en días distintos.
    hoy,
    pesoCorporalKg: ultimoPeso(datos.pesos),
  };
}

/** La última pesada apuntada, o null. Sin ella no hay medallas por múltiplo. */
export function ultimoPeso(pesos) {
  let mejor = null;
  for (const p of pesos || []) {
    if (!p || !p.fecha || !p.kg) continue;
    if (!mejor || p.fecha > mejor.fecha) mejor = p;
  }
  return mejor ? Number(mejor.kg) : null;
}

/**
 * Días en los que se completó ENTERO el plan del día.
 *
 * Solo cuentan las sesiones que tienen una rutina apuntada: sin plan no hay
 * «entero» que completar, y dar el logro por un día suelto sería regalarlo.
 */
export function contarDiasCompletos(datos, flojas = new Set()) {
  const rutinas = new Map((datos.rutinas || []).map((r) => [r.id, r]));
  const maquinas = datos.maquinas || [];
  const series = datos.series || [];
  let n = 0;

  for (const ses of datos.sesiones || []) {
    if (!ses.rutina || flojas.has(ses.id)) continue;
    const rutina = rutinas.get(ses.rutina);
    if (!rutina) continue;

    const delGym = maquinas.filter((m) => m.gimnasioId === ses.gimnasioId);
    const plan = planDeRutina(rutina, delGym);
    if (!plan.length) continue;

    const d = dia(ses.fecha);
    const hechasPorMaquina = new Map();
    for (const s of series) {
      if (dia(s.fecha) !== d) continue;
      hechasPorMaquina.set(s.maquinaId, (hechasPorMaquina.get(s.maquinaId) || 0) + 1);
    }
    if (plan.every((p) => (hechasPorMaquina.get(p.maquinaId) || 0) >= p.series)) n++;
  }
  return n;
}

/**
 * El plan de una rutina, en corto.
 *
 * Es el mismo criterio que `plan.planDe()`, repetido aquí a propósito para que
 * `perfil.js` no dependa de `plan.js` y el gemelo en Python solo tenga que
 * copiar UN fichero. Si alguna vez cambia la forma de deducir el plan de las
 * rutinas sin plan propio, hay que tocar los dos sitios — está fijado por test.
 */
function planDeRutina(rutina, maquinas) {
  const POR_DEFECTO = { series: 3, reps: 12 };
  const porId = new Map(maquinas.map((m) => [m.id, m]));
  const sano = (v, pd) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : pd;
  };
  if (Array.isArray(rutina.plan) && rutina.plan.length) {
    return rutina.plan
      .filter((p) => porId.has(p.maquinaId))
      .map((p) => ({
        maquinaId: p.maquinaId,
        series: sano(p.series, POR_DEFECTO.series),
        reps: sano(p.reps, POR_DEFECTO.reps),
      }));
  }
  const grupos = new Set(rutina.grupos || []);
  const sueltas = new Set(rutina.maquinas || []);
  return maquinas
    .filter((m) => sueltas.has(m.id) || grupos.has(m.grupo))
    .map((m) => ({ maquinaId: m.id, ...POR_DEFECTO }));
}

/* --------------------------------------------------------------------------
 * Veteranía, insignias y medallas
 * ------------------------------------------------------------------------ */

/** El nivel que toca por antigüedad, y cuánto falta para el siguiente. */
export function veterania(resumen) {
  const dias = resumen.diasDesdeLaPrimera || 0;
  let actual = NIVELES[0];
  let siguiente = null;
  for (const n of NIVELES) {
    if (dias >= n.desde) actual = n;
    else if (!siguiente) siguiente = n;
  }
  return {
    ...actual,
    dias,
    siguiente,
    diasParaElSiguiente: siguiente ? siguiente.desde - dias : 0,
  };
}

/**
 * Qué insignias están ganadas y cuánto falta para las demás.
 *
 * Devuelve TODAS, ganadas y pendientes, con su progreso 0..1. La pantalla
 * decide qué enseña, pero el dato de «te faltan 8 días» tiene que existir: una
 * insignia sin progreso visible es una sorpresa, no un objetivo.
 */
export function evaluarInsignias(resumen) {
  return INSIGNIAS.map((i) => {
    const valor = Number(resumen[i.metrica]) || 0;
    const ganada = valor >= i.meta;
    return {
      ...i,
      valor,
      ganada,
      progreso: i.meta > 0 ? Math.min(1, valor / i.meta) : 0,
      falta: ganada ? 0 : i.meta - valor,
    };
  });
}

/**
 * Qué te falta para el SIGUIENTE material de esta medalla.
 *
 * Es la mitad útil de todo esto. Un acabado bonito que no dice cómo se
 * consigue el siguiente es decoración; con esto, la ficha de una medalla ya
 * conseguida sigue teniendo algo que contar («para el lapislázuli, 120 kg»), que es
 * justo lo que le faltaba a una medalla ganada: dejaba de decir nada.
 *
 * Devuelve el material y `falta` en DATOS, no en una frase: la frase la pone la
 * pantalla, y JARVIS la dirá a su manera. `null` cuando ya tienes el más raro.
 */
export function siguienteMaterial(medalla, historial, hoy) {
  if (!medalla.ganada) return null;
  const hoja = hojaDeMedalla(medalla, historial, hoy);
  const actual = materialDe(medalla, historial, hoy);
  const rareza = actual ? actual.rareza : -1;

  // El menos raro de los que todavía no cumples: el que tienes más a mano.
  const meta = MATERIALES
    .filter((m) => m.rareza > rareza && !cumpleMaterial(m, hoja))
    .sort((a, b) => a.rareza - b.rareza)[0];
  if (!meta) return null;

  const liston = Number(medalla.listonKg) || 0;
  let falta = {};
  if (meta.regla === 'margen') {
    falta = { kg: liston * meta.valor };
  } else if (meta.regla === 'dias') {
    falta = { dias: Math.max(0, meta.valor - hoja.dias) };
  } else if (meta.regla === 'gimnasios') {
    falta = { gimnasios: Math.max(0, meta.valor - hoja.gimnasios), kg: liston };
  } else if (meta.regla === 'veterana') {
    falta = { dias: Math.max(0, meta.valor - hoja.dias), batir: !hoja.batidaDespues };
  }
  return { ...meta, hoja, falta };
}

/**
 * Qué medallas de PR están ganadas.
 *
 * `estado` es uno de cuatro, y los cuatro dicen cosas distintas:
 *   · `ganada`      — la tienes.
 *   · `pendiente`   — te falta peso, y se sabe cuánto.
 *   · `sin_peso`    — es por múltiplo del peso corporal y no hay pesada
 *                     apuntada. Decir «pendiente» sería afirmar que no la
 *                     tienes cuando la verdad es que no lo sabemos.
 *   · `sin_maquina` — no hay NINGUNA máquina tuya que cuente como ese
 *                     levantamiento. Este estado es nuevo (31-ago-2026) y es la
 *                     mitad visible del arreglo que pidió Carlos: antes una
 *                     medalla así salía «pendiente, 0 %», que se lee como «no
 *                     levantas bastante» cuando lo que pasa es que la app no
 *                     sabe cuál de tus máquinas es el press de banca. Ahora lo
 *                     dice, y la pantalla ofrece elegirla.
 */
export function evaluarMedallas(resumen) {
  const mejores = resumen.mejorPorLevantamiento || new Map();
  const peso = resumen.pesoCorporalKg;
  const historial = resumen.historialLevantamientos || new Map();
  const hoy = resumen.hoy || new Date().toISOString();

  return MEDALLAS.map((m) => {
    const mejor = mejores.get(m.levantamiento) || 0;

    if (!mejores.has(m.levantamiento)) {
      return { ...m, estado: 'sin_maquina', ganada: false, mejorKg: 0, listonKg: null,
               progreso: 0, material: null, materialInfo: null };
    }
    if (m.xPeso && !peso) {
      return { ...m, estado: 'sin_peso', ganada: false, mejorKg: mejor, listonKg: null,
               progreso: 0, material: null, materialInfo: null };
    }
    const liston = m.kg != null ? m.kg : m.xPeso * peso;
    const ganada = mejor >= liston;
    const fila = {
      ...m,
      estado: ganada ? 'ganada' : 'pendiente',
      ganada,
      mejorKg: mejor,
      listonKg: liston,
      progreso: liston > 0 ? Math.min(1, mejor / liston) : 0,
    };
    // El MATERIAL, que solo tienen las conseguidas. `material` es el id (lo que
    // mira el dibujo y lo que compara el test de paridad con Python) y
    // `materialInfo` lleva además la hoja de hechos con la que se decidió, que
    // es lo que la ficha enseña por escrito: «un año con ella, y la has vuelto
    // a batir». Un acabado que no sabe explicarse es un adorno.
    const mat = materialDe(fila, historial, hoy);
    fila.material = mat ? mat.id : null;
    fila.materialInfo = mat;
    return fila;
  });
}

/**
 * Todo lo del perfil de una vez, que es como lo piden la pantalla y JARVIS.
 */
export function calcular(datos, hoy = new Date().toISOString()) {
  const resumen = resumir(datos, hoy);
  const insignias = evaluarInsignias(resumen);
  const medallas = evaluarMedallas(resumen);
  return {
    resumen,
    veterania: veterania(resumen),
    insignias,
    medallas,
    ganadas: insignias.filter((i) => i.ganada),
    medallasGanadas: medallas.filter((m) => m.ganada),
  };
}

/**
 * Una frase para JARVIS y para la cabecera del perfil.
 *
 * Si no hay ni una serie apuntada NO se inventa nada motivacional: se dice que
 * no hay datos. Es la regla del proyecto y aquí se nota más que en ningún sitio,
 * porque un perfil vacío con «¡vas genial!» es una tomadura de pelo.
 */
export function frase(calculo) {
  const r = calculo.resumen;
  if (!r.diasEntrenados) return 'Todavía no has apuntado ninguna serie.';
  if (r.rachaSemanas >= 2) {
    return `${r.rachaSemanas} semanas seguidas entrenando. ${r.diasEntrenados} días en total.`;
  }
  if (r.rachaViva && r.rachaDias > 1) {
    return `Racha de ${r.rachaDias} días. Te quedan ${r.diasParaRomper} para no romperla.`;
  }
  return `${r.diasEntrenados} días entrenados. ${calculo.veterania.nombre} desde hace ${r.diasDesdeLaPrimera} días.`;
}
