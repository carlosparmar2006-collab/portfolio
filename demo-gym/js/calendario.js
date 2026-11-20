/* =============================================================================
 * calendario.js — Qué toca cada día.
 *
 * Carlos, 29-ago-2026: *«un calendario de objetivos o simplemente para
 * organizar los días y que la gente se pueda montar sus entrenamientos allí y
 * verlo de manera muy clara, ejemplo el lunes me toca esto, el martes descanso
 * etc…»*.
 *
 * CÓMO CONVIVE CON LA ROTACIÓN QUE YA HABÍA
 * -----------------------------------------
 * Hasta ahora, «hoy te toca» se deducía mirando la última sesión con rutina y
 * pasando a la siguiente de la lista. Eso sigue valiendo para el que no quiere
 * planificar nada. El calendario es una capa POR ENCIMA:
 *
 *    lo que diga el calendario  >  la rotación automática
 *
 * Y solo se guardan los días que Carlos ha tocado. Un calendario que escribe
 * una fila por cada día del año es un calendario que en dos años pesa más que
 * todas sus series juntas.
 *
 * DESCANSO ES UN VALOR, NO UN HUECO
 * ---------------------------------
 * «Descanso» se guarda con `rutinaId: 'descanso'`. Un día vacío significa «no
 * he dicho nada», y no es lo mismo: en uno la app propone entreno y en el otro
 * respeta que hoy no toca.
 *
 * Aritmética pura, sin pantalla: se prueba con `node`.
 * ========================================================================== */

export const DESCANSO = 'descanso';

/** Lunes primero, como se lee un calendario aquí. */
export const DIAS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
/* Los nombres enteros, para cuando hay sitio: en una tarjeta, «Lunes 24» se lee
   y «L 24» hay que descifrarlo. En la rejilla del mes no caben y por eso siguen
   estando los de una letra. */
export const DIAS_LARGOS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
export const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
  'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** 'YYYY-MM-DD' de una fecha, en HORA LOCAL (toISOString daría el día de ayer
 *  a partir de las 22:00 en España, y eso descoloca el calendario entero). */
export function iso(fecha) {
  const f = fecha instanceof Date ? fecha : new Date(fecha);
  const mm = String(f.getMonth() + 1).padStart(2, '0');
  const dd = String(f.getDate()).padStart(2, '0');
  return `${f.getFullYear()}-${mm}-${dd}`;
}

export function fechaDe(textoISO) {
  return new Date(`${textoISO}T00:00:00`);
}

/** Qué día de la semana es, con el lunes en 0. */
export function diaSemana(textoISO) {
  return (fechaDe(textoISO).getDay() + 6) % 7;
}

export function sumarDias(textoISO, n) {
  const f = fechaDe(textoISO);
  f.setDate(f.getDate() + n);
  return iso(f);
}

export function sumarMeses(textoISO, n) {
  const f = fechaDe(textoISO);
  // Al día 1 antes de saltar de mes: si no, del 31 de enero + 1 mes salen «tres
  // de marzo», que es correcto en JavaScript y absurdo en un calendario.
  f.setDate(1);
  f.setMonth(f.getMonth() + n);
  return iso(f);
}

/**
 * La rejilla de un mes: seis semanas de siete días, siempre.
 *
 * Siempre 42 casillas aunque el mes ocupe menos: si la rejilla cambia de alto
 * al pasar de mes, la pantalla pega un salto y el pulgar pierde el sitio.
 */
export function rejillaDelMes(textoISO) {
  const f = fechaDe(textoISO);
  const primero = new Date(f.getFullYear(), f.getMonth(), 1);
  const desplazamiento = (primero.getDay() + 6) % 7;      // lunes = 0
  const inicio = new Date(primero);
  inicio.setDate(primero.getDate() - desplazamiento);

  const dias = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(inicio);
    d.setDate(inicio.getDate() + i);
    dias.push({ fecha: iso(d), delMes: d.getMonth() === f.getMonth(), dia: d.getDate() });
  }
  return dias;
}

/**
 * Qué hay puesto un día concreto.
 *
 * Devuelve `{ rutinaId, nota, fuente }`, donde `fuente` es:
 *   'calendario' — lo dijo Carlos
 *   'hecho'      — no lo dijo, pero ese día entrenó y quedó apuntado
 *   null         — no hay nada
 *
 * Lo HECHO no pisa a lo planeado: si el lunes ponía Push y acabó haciendo Pull,
 * el calendario enseña las dos cosas y no se inventa cuál era la buena.
 */
export function delDia(fecha, { calendario = [], sesiones = [] } = {}) {
  const puesto = calendario.find((c) => !c.del && c.fecha === fecha);
  if (puesto) return { rutinaId: puesto.rutinaId, nota: puesto.nota || '', fuente: 'calendario' };
  const ses = sesiones.find((s) => !s.del && s.fecha === fecha && s.rutina);
  if (ses) return { rutinaId: ses.rutina, nota: '', fuente: 'hecho' };
  return { rutinaId: '', nota: '', fuente: null };
}

/**
 * Un mes entero resuelto, listo para pintar.
 *
 * Por cada día: qué toca, si se entrenó de verdad (cuántas series) y si es hoy.
 * Que un día tenga plan y CERO series es justo lo que hay que ver de un
 * vistazo: es el día que te saltaste.
 */
export function mes(textoISO, { calendario = [], sesiones = [], series = [], rutinas = [], hoy = null } = {}) {
  const hoyISO = hoy || iso(new Date());
  const porFecha = {};
  for (const s of series) {
    if (s.del) continue;
    porFecha[s.fecha] = (porFecha[s.fecha] || 0) + 1;
  }
  const nombre = (id) => {
    if (id === DESCANSO) return 'Descanso';
    const r = rutinas.find((x) => x.id === id);
    return r ? r.nombre : '';
  };

  return rejillaDelMes(textoISO).map((d) => {
    const plan = delDia(d.fecha, { calendario, sesiones });
    const nSeries = porFecha[d.fecha] || 0;
    return {
      ...d,
      rutinaId: plan.rutinaId,
      nombre: nombre(plan.rutinaId),
      nota: plan.nota,
      fuente: plan.fuente,
      series: nSeries,
      entrenado: nSeries > 0,
      descanso: plan.rutinaId === DESCANSO,
      esHoy: d.fecha === hoyISO,
      pasado: d.fecha < hoyISO,
      // Lo que hay que mirar: día planeado, ya pasado y sin una sola serie.
      saltado: plan.rutinaId && plan.rutinaId !== DESCANSO && d.fecha < hoyISO && nSeries === 0,
    };
  });
}

/**
 * Copiar una semana entera a la siguiente.
 *
 * Es lo que se hace de verdad: montas una semana y repites. Copiar a mano siete
 * días es la clase de tarea que hace que la gente deje de usar el calendario.
 */
export function repetirSemana(desdeLunes, { calendario = [], semanas = 1 } = {}) {
  const nuevos = [];
  for (let s = 1; s <= semanas; s++) {
    for (let i = 0; i < 7; i++) {
      const origen = sumarDias(desdeLunes, i);
      const puesto = calendario.find((c) => !c.del && c.fecha === origen);
      if (!puesto || !puesto.rutinaId) continue;
      nuevos.push({ fecha: sumarDias(origen, 7 * s), rutinaId: puesto.rutinaId, nota: puesto.nota || '' });
    }
  }
  return nuevos;
}

/** El lunes de la semana de una fecha. */
export function lunesDe(textoISO) {
  return sumarDias(textoISO, -diaSemana(textoISO));
}

/**
 * Resumen de la semana para la cabecera: entrenados, planeados y saltados.
 */
export function resumenSemana(lunes, datos) {
  const dias = [];
  for (let i = 0; i < 7; i++) dias.push(sumarDias(lunes, i));
  const delMes = mes(lunes, datos);
  const porFecha = new Map(delMes.map((d) => [d.fecha, d]));
  let entrenados = 0, planeados = 0, saltados = 0, descansos = 0;
  for (const f of dias) {
    const d = porFecha.get(f);
    if (!d) continue;
    if (d.entrenado) entrenados++;
    // «Planeado» es lo que TÚ pusiste en el calendario. Un día que entrenaste
    // sin haberlo planeado no cuenta aquí: si contara, el resumen diría que
    // cumpliste un plan que nunca hiciste, y el número dejaría de servir para
    // lo único que sirve — saber si sigues tu plan o improvisas.
    if (d.fuente === 'calendario' && d.rutinaId && d.rutinaId !== DESCANSO) planeados++;
    if (d.descanso) descansos++;
    if (d.saltado) saltados++;
  }
  return { entrenados, planeados, saltados, descansos };
}
