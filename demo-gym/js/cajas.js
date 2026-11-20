/* =============================================================================
 * cajas.js — La economía del vestuario: qué se gana, con qué probabilidad y
 * cuánto vale. Sin DOM: se prueba en Node con `app/test_cajas.mjs`.
 *
 * Carlos, 3-sep-2026: *«Tú vas al gimnasio, vale, por el hecho de ir ya tienes
 * una caja. Y luego, si haces X PR, tendrás también X cajas (…) Hay que hacerlo
 * justo, porque una al día está bastante bien»*. Y sobre las exóticas: *«que
 * tengan bastante bastante baja probabilidad, porque si (…) al final del año
 * acabarán abierto trescientas sesenta y cinco cajas y cien por cien les ha
 * tocado»*.
 *
 * LAS CINCO DECISIONES QUE SOSTIENEN ESTO
 * ---------------------------------------
 * 1. **Las cajas se GANAN, no se guardan.** Cuántas te tocan sale de tus series
 *    cada vez (días entrenados y récords), igual que la racha y las insignias.
 *    Lo único que se guarda es cuántas has ABIERTO. Pendientes = ganadas −
 *    abiertas. Así, si mañana corriges una serie mal apuntada, el número se
 *    corrige solo; y no hay ningún contador que se pueda inflar tocando la base.
 *
 * 2. **Las cajas cuentan DESDE que se estrena el vestuario**, no desde la
 *    primera serie de tu vida. Con dos años de historial, abrir el vestuario
 *    daría 300 cajas de golpe: la colección entera en una tarde y ni una razón
 *    para volver. Esto es exactamente la regla de la casa —los contadores
 *    empiezan en cero y suben solos— aplicada aquí.
 *
 * 3. **Tope de tres cajas de récord al día.** Subir 0,5 kg cinco veces en una
 *    sesión son cinco récords de verdad, pero cinco cajas por una tarde
 *    convierten el sistema en un truco. Un contador que se puede inflar no es
 *    un contador.
 *
 * 4. **Las probabilidades se ENSEÑAN.** Están aquí, en una tabla, y la pantalla
 *    las pinta tal cual. Además de ser lo honrado, Google Play lo EXIGE para
 *    publicar una app con cajas: hay que enseñar el contenido y la probabilidad
 *    de cada cosa antes de abrir.
 *
 * 5. **Aquí no se paga con dinero.** Se paga con magnesio, que se gana abriendo
 *    cajas y deshaciendo repetidas. Si algún día hay una compra de verdad, será
 *    otra decisión y se escribirá aquí; a día de hoy no existe ni el botón.
 *
 * LA CUENTA QUE HAY QUE MIRAR ANTES DE TOCAR NADA
 * ----------------------------------------------
 * Con 300 cajas de entreno y 60 de récord al año (que es entrenar casi a
 * diario y batir marcas 60 veces):
 *      exótico = 1 − 0,9995^300 × 0,998^60 ≈ **24 % en un año**.
 * O sea: la mayoría de la gente NO tendrá una exótica al cabo de un año, que es
 * justo lo que pidió Carlos. Si se toca la tabla, se vuelve a hacer esta cuenta
 * — `test_cajas.mjs` la hace sola y falla si se dispara.
 * ========================================================================== */

import { COSMETICOS, RAREZAS, rareza, deRareza } from './cosmeticos.js';

/* --------------------------------------------------------------------------
 * LOS DOS TIPOS DE CAJA
 * ------------------------------------------------------------------------ */
export const TIPOS = [
  {
    id: 'entreno',
    nombre: 'Caja de entreno',
    pie: 'Una por cada día que pisas el gimnasio',
    magnesio: 25,
    // Suma 100. Comprobado en el test: una tabla que sume 99,9 haría que la
    // última rareza saliera de más sin que nadie lo notara.
    tabla: { comun: 52, pococomun: 27, raro: 14, epico: 5.2, legendario: 1.4, mitico: 0.35, exotico: 0.05 },
  },
  {
    id: 'record',
    nombre: 'Caja de récord',
    pie: 'Por batir tu marca. Hasta tres al día',
    magnesio: 40,
    tabla: { comun: 30, pococomun: 30, raro: 22, epico: 12, legendario: 4.5, mitico: 1.3, exotico: 0.2 },
  },
];

export const TIPO_POR_ID = new Map(TIPOS.map((t) => [t.id, t]));

/** Cuántas cajas de récord puede dar un mismo día. Ver decisión 3. */
export const TOPE_RECORD_DIA = 3;

/** Cajas de regalo al estrenar el vestuario: para que la primera vez haya algo que abrir. */
export const REGALO_ESTRENO = 3;

/* --------------------------------------------------------------------------
 * LA SUERTE PENDIENTE
 *
 * Si la mala racha se alarga, la caja fuerza un mínimo. No es un regalo: es lo
 * que evita que alguien abra ochenta cajas y no vea nunca nada. Se ENSEÑA en la
 * pantalla de probabilidades, porque una ayuda escondida es una mentira con
 * buena intención.
 * ------------------------------------------------------------------------ */
export const SUERTE = {
  epico: 30,        // 30 cajas sin épico o mejor → la siguiente lo es
  legendario: 90,   // 90 sin legendario o mejor → la siguiente lo es
};

const MEJOR_QUE = (id) => RAREZAS.slice(RAREZAS.findIndex((r) => r.id === id)).map((r) => r.id);

/* --------------------------------------------------------------------------
 * PRECIOS
 *
 * El precio de una pieza es su polvo × 20: deshacer veinte repetidas de una
 * rareza compra una pieza de esa rareza. Es una regla, no veinte números
 * sueltos, y por eso no se puede desequilibrar sin darse cuenta.
 *
 * Las exóticas NO se venden. Solo salen de una caja. Si se pudieran comprar,
 * dejarían de significar nada — y con una tienda de por medio, el que más paga
 * tendría lo más raro, que es justo lo contrario de lo que cuenta una exótica.
 * ------------------------------------------------------------------------ */
export const PRECIO_CAJA = 900;

export function precio(rarezaId) {
  if (rarezaId === 'exotico') return null;
  return rareza(rarezaId).polvo * 20;
}

/** Lo que da deshacer una repetida. */
export function polvoDe(rarezaId) {
  return rareza(rarezaId).polvo;
}

/* --------------------------------------------------------------------------
 * EL ESTADO GUARDADO
 *
 * Lo mínimo que NO se puede calcular: qué tienes, qué llevas puesto, cuánto
 * magnesio y cuántas cajas has abierto. Ni una racha, ni un total de días.
 * ------------------------------------------------------------------------ */
export function estadoInicial(hoyISO = new Date().toISOString()) {
  return {
    id: 'yo',
    desde: hoyISO.slice(0, 10),      // el día que se estrenó el vestuario
    magnesio: 0,
    abiertas: { entreno: 0, record: 0 },
    sueltas: { entreno: REGALO_ESTRENO, record: 0 },   // regaladas o compradas
    sinEpico: 0,
    sinLegendario: 0,
    tengo: {},                        // id de pieza → cuántas veces ha salido
    puesto: {},                       // familia → id de pieza
    historial: [],                    // las últimas aperturas, para «lo último»
    // LOS FAVORITOS (0.36.0). Se marca lo que se quiere y luego se filtra por
    // ahí. Es de las pocas cosas de la tienda de Discord que resuelven un
    // problema de verdad: con setenta piezas, «la que me gustaba» se pierde.
    favoritos: {},                    // id de pieza → true
    pruebas: false,                   // el banco de pruebas, ver más abajo
    act: 0,
  };
}

/** Rellena lo que falte de un estado viejo. Nunca revienta con una base antigua. */
export function normalizar(estado, hoyISO = new Date().toISOString()) {
  const base = estadoInicial(hoyISO);
  const e = { ...base, ...(estado || {}) };
  e.abiertas = { ...base.abiertas, ...(estado && estado.abiertas) };
  e.sueltas = { ...base.sueltas, ...(estado && estado.sueltas) };
  e.tengo = { ...(estado && estado.tengo) };
  e.puesto = { ...(estado && estado.puesto) };
  e.historial = Array.isArray(e.historial) ? e.historial.slice(0, 60) : [];
  e.favoritos = { ...(estado && estado.favoritos) };
  // Una pieza que ya no existe en el catálogo no puede quedarse puesta: dejaría
  // el perfil pintando un `undefined`.
  for (const [fam, id] of Object.entries(e.puesto)) {
    if (!COSMETICOS.some((c) => c.id === id && c.familia === fam)) delete e.puesto[fam];
  }
  return e;
}

/** Marcar o desmarcar un favorito. Devuelve un estado nuevo, como todo aquí. */
export function favorito(estado, id) {
  const e = normalizar(estado);
  const fav = { ...e.favoritos };
  if (fav[id]) delete fav[id]; else fav[id] = true;
  return { ...e, favoritos: fav, act: Date.now() };
}

/* --------------------------------------------------------------------------
 * CUÁNTAS TE HAS GANADO
 *
 * Entra el resumen del perfil (`perfil.js`), que es quien sabe qué días
 * entrenaste y cuántos récords hiciste cada día. Aquí no se vuelve a contar
 * nada: si se contara, habría dos verdades para «¿cuántos días he entrenado?».
 * ------------------------------------------------------------------------ */
export function cajasGanadas(resumen, desde) {
  const dias = (resumen && resumen.dias) || [];
  const prs = (resumen && resumen.prsPorDia) || {};
  const corte = String(desde || '0000-00-00');
  let entreno = 0;
  let record = 0;
  for (const d of dias) {
    if (d < corte) continue;
    entreno += 1;
    record += Math.min(TOPE_RECORD_DIA, prs[d] || 0);
  }
  return { entreno, record, total: entreno + record };
}

/** Las que quedan por abrir, por tipo. Nunca negativo. */
export function pendientes(estado, resumen) {
  const e = normalizar(estado);
  const g = cajasGanadas(resumen, e.desde);
  const entreno = Math.max(0, g.entreno + (e.sueltas.entreno || 0) - (e.abiertas.entreno || 0));
  const record = Math.max(0, g.record + (e.sueltas.record || 0) - (e.abiertas.record || 0));
  return { entreno, record, total: entreno + record, ganadas: g };
}

/* --------------------------------------------------------------------------
 * EL AZAR
 *
 * Un generador con semilla (mulberry32). En la app la semilla sale de
 * `crypto`; en el test se le pasa una fija, y así una apertura se puede repetir
 * exactamente. Un sorteo que no se puede repetir es un sorteo que no se puede
 * probar.
 * ------------------------------------------------------------------------ */
export function azarCon(semilla) {
  let a = semilla >>> 0;
  return function siguiente() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** La tabla que se aplica DE VERDAD a esta caja, con la suerte pendiente puesta. */
export function tablaEfectiva(tipoId, estado) {
  const tipo = TIPO_POR_ID.get(tipoId) || TIPOS[0];
  const e = normalizar(estado);
  let permitidas = null;
  if ((e.sinLegendario || 0) >= SUERTE.legendario) permitidas = MEJOR_QUE('legendario');
  else if ((e.sinEpico || 0) >= SUERTE.epico) permitidas = MEJOR_QUE('epico');
  if (!permitidas) return { ...tipo.tabla };

  // Se reparte lo que había entre las que quedan, en la misma proporción: así
  // una legendaria forzada sigue teniendo su exótica detrás.
  const suma = permitidas.reduce((s, id) => s + (tipo.tabla[id] || 0), 0) || 1;
  const salida = {};
  for (const id of permitidas) salida[id] = ((tipo.tabla[id] || 0) * 100) / suma;
  return salida;
}

/** Sortea una rareza con una tabla dada. */
export function sortearRareza(tabla, azar) {
  const total = Object.values(tabla).reduce((s, n) => s + n, 0);
  let x = azar() * total;
  for (const r of RAREZAS) {
    const p = tabla[r.id] || 0;
    if (p <= 0) continue;
    if (x < p) return r.id;
    x -= p;
  }
  return 'comun';
}

/* --------------------------------------------------------------------------
 * ABRIR UNA CAJA
 *
 * Devuelve un estado NUEVO y el premio. No toca el que se le pasa: así la
 * pantalla puede animar con el premio en la mano y guardar después, y si el
 * guardado falla no se ha perdido nada a medias.
 * ------------------------------------------------------------------------ */
export function abrir(estado, tipoId, azar = Math.random, hoyISO = new Date().toISOString()) {
  const tipo = TIPO_POR_ID.get(tipoId) || TIPOS[0];
  const e = normalizar(estado, hoyISO);

  const tabla = tablaEfectiva(tipo.id, e);
  const rarezaId = sortearRareza(tabla, azar);
  const candidatas = deRareza(rarezaId);
  // Dentro de una rareza, todas las piezas valen lo mismo. Se dice en la
  // pantalla de probabilidades tal cual.
  const pieza = candidatas[Math.min(candidatas.length - 1, Math.floor(azar() * candidatas.length))];

  const repetida = !!e.tengo[pieza.id];
  const polvo = repetida ? polvoDe(rarezaId) : 0;

  const nuevo = {
    ...e,
    magnesio: (e.magnesio || 0) + tipo.magnesio + polvo,
    abiertas: { ...e.abiertas, [tipo.id]: (e.abiertas[tipo.id] || 0) + 1 },
    tengo: { ...e.tengo, [pieza.id]: (e.tengo[pieza.id] || 0) + 1 },
    sinEpico: ORDEN(rarezaId) >= ORDEN('epico') ? 0 : (e.sinEpico || 0) + 1,
    sinLegendario: ORDEN(rarezaId) >= ORDEN('legendario') ? 0 : (e.sinLegendario || 0) + 1,
    historial: [{ pieza: pieza.id, rareza: rarezaId, caja: tipo.id, repetida, fecha: hoyISO },
                ...e.historial].slice(0, 60),
  };

  return { estado: nuevo, premio: { pieza, rareza: rarezaId, repetida, polvo, magnesio: tipo.magnesio } };
}

const ORDEN = (id) => RAREZAS.findIndex((r) => r.id === id);

/* --------------------------------------------------------------------------
 * PONERSE UNA PIEZA
 * ------------------------------------------------------------------------ */
export function ponerse(estado, piezaId) {
  const e = normalizar(estado);
  const p = COSMETICOS.find((c) => c.id === piezaId);
  if (!p || !e.tengo[p.id]) return e;          // no se puede lucir lo que no se tiene
  return { ...e, puesto: { ...e.puesto, [p.familia]: p.id } };
}

export function quitarse(estado, familia) {
  const e = normalizar(estado);
  const puesto = { ...e.puesto };
  delete puesto[familia];
  return { ...e, puesto };
}

/* --------------------------------------------------------------------------
 * LA TIENDA
 *
 * Cuatro piezas al día, las mismas para todo el mundo, elegidas por la FECHA.
 * Sin servidor: la fecha es la semilla, así que dos móviles ven lo mismo sin
 * hablar entre ellos y sin que nadie tenga que mantener una lista.
 *
 * No sale nada exótico (no se venden) ni nada que ya tengas: una tienda que te
 * ofrece lo que ya tienes es un escaparate roto.
 * ------------------------------------------------------------------------ */
export function semillaDeFecha(fechaISO) {
  const d = String(fechaISO || '').slice(0, 10).replace(/-/g, '');
  let h = 2166136261 >>> 0;
  for (const ch of d) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}

export function escaparate(fechaISO, estado, cuantas = 4) {
  const e = normalizar(estado);
  const azar = azarCon(semillaDeFecha(fechaISO));
  const bolsa = COSMETICOS.filter((c) => c.rareza !== 'exotico');
  // Barajado con la semilla del día: determinista, y sin ordenar por id (que
  // pondría siempre los mismos marcos delante).
  const orden = bolsa.slice();
  for (let i = orden.length - 1; i > 0; i--) {
    const j = Math.floor(azar() * (i + 1));
    [orden[i], orden[j]] = [orden[j], orden[i]];
  }
  const nuevas = orden.filter((c) => !e.tengo[c.id]);
  const lista = (nuevas.length >= cuantas ? nuevas : orden).slice(0, cuantas);
  return lista.map((c) => ({ pieza: c, precio: precio(c.rareza) }));
}

/** Comprar una pieza. Devuelve `null` si no llega el magnesio o ya la tiene. */
export function comprar(estado, piezaId, hoyISO = new Date().toISOString()) {
  const e = normalizar(estado, hoyISO);
  const p = COSMETICOS.find((c) => c.id === piezaId);
  if (!p) return null;
  const coste = precio(p.rareza);
  if (coste === null || e.tengo[p.id] || (e.magnesio || 0) < coste) return null;
  return {
    ...e,
    magnesio: e.magnesio - coste,
    tengo: { ...e.tengo, [p.id]: 1 },
    historial: [{ pieza: p.id, rareza: p.rareza, caja: 'tienda', repetida: false, fecha: hoyISO },
                ...e.historial].slice(0, 60),
  };
}

/** Comprar una caja con magnesio. Devuelve `null` si no llega. */
export function comprarCaja(estado, tipoId = 'entreno') {
  const e = normalizar(estado);
  if ((e.magnesio || 0) < PRECIO_CAJA) return null;
  return {
    ...e,
    magnesio: e.magnesio - PRECIO_CAJA,
    sueltas: { ...e.sueltas, [tipoId]: (e.sueltas[tipoId] || 0) + 1 },
  };
}

/* --------------------------------------------------------------------------
 * CUÁNTO LLEVAS DE COLECCIÓN
 * ------------------------------------------------------------------------ */
export function coleccion(estado) {
  const e = normalizar(estado);
  const total = COSMETICOS.length;
  const mias = COSMETICOS.filter((c) => e.tengo[c.id]).length;
  const porRareza = {};
  for (const r of RAREZAS) {
    const dela = deRareza(r.id);
    porRareza[r.id] = { total: dela.length, mias: dela.filter((c) => e.tengo[c.id]).length };
  }
  return { total, mias, porRareza, porcentaje: total ? Math.round((mias / total) * 100) : 0 };
}
