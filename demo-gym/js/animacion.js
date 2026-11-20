/* =============================================================================
 * animacion.js — La figura que hace el ejercicio, dibujada por nosotros.
 *
 * POR QUÉ NO HAY GIFS
 * -------------------
 * Los GIF de ejercicios que circulan por GitHub son © Gym visual. El repo del
 * que sacamos los DATOS lo dice con todas las letras: «cloning this repo is not
 * a license». La app se va a cobrar, así que meterlos sería justo lo que Carlos
 * prohibió. Estas animaciones son nuestras: pesan 2 KB, funcionan sin cobertura
 * y no dependen de nadie.
 *
 * CÓMO FUNCIONA
 * -------------
 * Un solo esqueleto articulado en SVG (cadera → tronco → brazo → antebrazo, y
 * cadera → muslo → pierna → pie) y VEINTIOCHO patrones de movimiento. Cada
 * patrón son dos posturas —el principio y el final del recorrido— y la figura
 * va y viene entre ellas. Un «press de banca con mancuernas» y un «press de
 * banca agarre cerrado» comparten patrón: el gesto es el mismo.
 *
 * LOS PIES NO FLOTAN
 * ------------------
 * En los patrones de pie, la cadera NO se coloca a mano: se CALCULA desde los
 * ángulos de la pierna para que el pie caiga siempre en el suelo. Si se pone a
 * ojo, al bajar en la sentadilla la figura se hunde en el suelo o levita, y es
 * lo primero que se ve mal.
 *
 * EL MÚSCULO EN ROJO
 * ------------------
 * Cada patrón marca qué músculo trabaja, y ese trazo se pinta con `--musculo`
 * y late al ritmo del movimiento. Es lo que pidió Carlos: saber de un vistazo
 * qué estás moviendo. El rojo NUNCA va solo: el nombre del músculo se escribe
 * debajo (el color como único indicador se lee mal y con daltonismo no se lee).
 * ========================================================================== */

/* --------------------------------------------------------------------------
 * Medidas del cuerpo, en unidades del viewBox (0 0 100 120).
 * ------------------------------------------------------------------------ */
const L = {
  tronco: 26,
  cuello: 4,
  cabeza: 5.6,
  brazo: 15,
  antebrazo: 14,
  muslo: 23,
  pierna: 23,
  pie: 8,
};
const SUELO = 112;

/* --------------------------------------------------------------------------
 * Las posturas.
 *
 * Ángulos en grados. El criterio, siempre el mismo: POSITIVO = HACIA DELANTE
 * (la figura mira a la derecha). Los ángulos de los miembros son RELATIVOS al
 * segmento del que cuelgan, como en un cuerpo de verdad: el antebrazo se mide
 * desde el brazo, no desde el suelo.
 *
 *   tronco     inclinación del pecho (0 = erguido, 90 = tumbado boca abajo)
 *   brazo      hombro
 *   antebrazo  codo
 *   muslo      cadera
 *   pierna     rodilla
 *   pie        tobillo
 *
 * `suelo: false` = la figura no se apoya en los pies (tumbada, sentada,
 * colgada), y entonces la cadera se coloca a mano con `cadera: [x, y]`.
 * ------------------------------------------------------------------------ */
const P = (tronco, brazo, antebrazo, muslo, pierna, pie = 0) => ({ tronco, brazo, antebrazo, muslo, pierna, pie });

export const PATRONES = {
  press_horizontal: {
    nombre: 'Press horizontal',
    musculo: 'pecho',
    equipo: 'barra',
    banco: 'plano',
    suelo: false,
    cadera: [42, 72],
    a: { ...P(90, -95, -85, -60, 85), _: 'abajo' },
    b: { ...P(90, -95, 0, -60, 85) },
  },
  press_inclinado: {
    nombre: 'Press inclinado',
    musculo: 'pecho',
    equipo: 'barra',
    banco: 'inclinado',
    suelo: false,
    cadera: [44, 78],
    a: P(62, -78, -80, -42, 78),
    b: P(62, -78, 0, -42, 78),
  },
  apertura: {
    nombre: 'Apertura',
    musculo: 'pecho',
    equipo: 'mancuerna',
    banco: 'plano',
    suelo: false,
    cadera: [42, 72],
    a: P(90, -170, -8, -60, 85),
    b: P(90, -95, -8, -60, 85),
  },
  press_vertical: {
    nombre: 'Press vertical',
    musculo: 'hombro',
    equipo: 'barra',
    suelo: true,
    a: P(4, 150, -85, 0, 0),
    b: P(4, 172, -4, 0, 0),
  },
  elevacion_lateral: {
    nombre: 'Elevación lateral',
    musculo: 'hombro',
    equipo: 'mancuerna',
    suelo: true,
    frontal: true,
    a: P(2, 6, 0, 0, 0),
    b: P(2, 88, 0, 0, 0),
  },
  elevacion_frontal: {
    nombre: 'Elevación frontal',
    musculo: 'hombro',
    equipo: 'mancuerna',
    suelo: true,
    a: P(2, -6, 0, 0, 0),
    b: P(2, -92, 0, 0, 0),
  },
  pajaro: {
    nombre: 'Pájaro',
    musculo: 'hombro',
    equipo: 'mancuerna',
    suelo: true,
    frontal: true,
    a: P(70, -8, -12, -18, 22),
    b: P(70, 84, -12, -18, 22),
  },
  encogimiento: {
    nombre: 'Encogimiento',
    musculo: 'trapecio',
    equipo: 'mancuerna',
    suelo: true,
    a: { ...P(2, -2, 0, 0, 0), hombros: 0 },
    b: { ...P(2, -2, 0, 0, 0), hombros: -4 },
  },
  jalon: {
    nombre: 'Jalón',
    musculo: 'dorsal',
    equipo: 'jalon',
    suelo: false,
    cadera: [50, 62],
    a: P(-6, 168, -6, -14, 40),
    b: P(-10, 118, -74, -14, 40),
  },
  remo: {
    nombre: 'Remo',
    musculo: 'dorsal',
    equipo: 'barra',
    suelo: true,
    a: P(62, -60, -6, -22, 26),
    b: P(62, -60, -96, -22, 26),
  },
  fondo: {
    nombre: 'Fondo',
    musculo: 'triceps',
    equipo: 'paralelas',
    suelo: false,
    cadera: [50, 60],
    a: P(12, -170, -6, -34, 70),
    b: P(20, -150, -78, -34, 70),
  },
  curl: {
    nombre: 'Curl',
    musculo: 'biceps',
    equipo: 'barra',
    suelo: true,
    a: P(2, -4, -8, 0, 0),
    b: P(2, -8, -138, 0, 0),
  },
  extension_triceps: {
    nombre: 'Extensión de tríceps',
    musculo: 'triceps',
    equipo: 'polea_alta',
    suelo: true,
    a: P(6, -32, -96, 0, 0),
    b: P(6, -32, -6, 0, 0),
  },
  antebrazo: {
    nombre: 'Antebrazo',
    musculo: 'antebrazo',
    equipo: 'mancuerna',
    suelo: true,
    a: { ...P(4, -34, -84, 0, 0), muñeca: 26 },
    b: { ...P(4, -34, -84, 0, 0), muñeca: -30 },
  },
  sentadilla: {
    nombre: 'Sentadilla',
    musculo: 'cuadriceps',
    equipo: 'barra_espalda',
    suelo: true,
    a: P(8, 150, -60, 0, 0, 0),
    b: P(34, 150, -60, 74, -96, 22),
  },
  prensa: {
    nombre: 'Prensa',
    musculo: 'cuadriceps',
    equipo: 'prensa',
    suelo: false,
    cadera: [42, 78],
    a: P(-64, -34, -20, 96, -12),
    b: P(-64, -34, -20, 118, -84),
  },
  extension_cuadriceps: {
    nombre: 'Extensión de cuádriceps',
    musculo: 'cuadriceps',
    equipo: 'maquina_sentado',
    suelo: false,
    cadera: [44, 66],
    a: P(-6, -30, -16, 88, -88),
    b: P(-6, -30, -16, 88, -6),
  },
  curl_femoral: {
    nombre: 'Curl femoral',
    musculo: 'isquios',
    equipo: 'maquina_tumbado',
    suelo: false,
    cadera: [46, 76],
    a: P(92, -70, -10, -88, 2),
    b: P(92, -70, -10, -88, 118),
  },
  bisagra: {
    nombre: 'Bisagra de cadera',
    musculo: 'isquios',
    equipo: 'barra',
    suelo: true,
    a: P(4, -4, -4, 0, 0),
    b: P(74, -6, -4, -16, 20),
  },
  cadera: {
    nombre: 'Extensión de cadera',
    musculo: 'gluteo',
    equipo: 'banco_hombros',
    suelo: false,
    cadera: [48, 74],
    a: P(38, -132, -20, 52, -78),
    b: P(4, -150, -20, 6, -86),
  },
  abduccion: {
    nombre: 'Abducción',
    musculo: 'gluteo',
    equipo: 'maquina_sentado',
    suelo: false,
    frontal: true,
    cadera: [50, 66],
    a: P(-4, -22, -14, 8, -14),
    b: P(-4, -22, -14, 34, -14),
  },
  zancada: {
    nombre: 'Zancada',
    musculo: 'cuadriceps',
    equipo: 'mancuerna',
    suelo: true,
    a: P(6, -4, -4, 0, 0),
    b: P(10, -4, -4, 46, -86, 14),
  },
  gemelo: {
    nombre: 'Gemelo',
    musculo: 'gemelo',
    equipo: 'mancuerna',
    suelo: true,
    a: { ...P(2, -3, -3, 0, 0), talon: 0 },
    b: { ...P(2, -3, -3, 0, 0), talon: 9 },
  },
  crunch: {
    nombre: 'Crunch',
    musculo: 'abdomen',
    equipo: null,
    suelo: false,
    cadera: [40, 86],
    a: P(88, -66, -104, -74, 96),
    b: P(50, -66, -104, -74, 96),
  },
  giro: {
    nombre: 'Giro',
    musculo: 'oblicuos',
    equipo: null,
    suelo: false,
    cadera: [46, 74],
    a: { ...P(-24, -80, -70, -84, 92), tuerce: -16 },
    b: { ...P(-24, -80, -70, -84, 92), tuerce: 16 },
  },
  plancha: {
    nombre: 'Plancha',
    musculo: 'abdomen',
    equipo: null,
    suelo: false,
    cadera: [50, 80],
    a: P(84, -88, -92, -86, 4),
    b: P(86, -88, -92, -88, 4),
  },
  cuello: {
    nombre: 'Cuello',
    musculo: 'cuello',
    equipo: null,
    suelo: true,
    a: { ...P(2, -4, -4, 0, 0), cabeza: -18 },
    b: { ...P(2, -4, -4, 0, 0), cabeza: 18 },
  },
  movilidad: {
    nombre: 'Movilidad',
    musculo: null,
    equipo: null,
    suelo: true,
    a: P(10, -20, -14, -8, 12),
    b: P(46, -140, -14, -22, 26),
  },
  cardio: {
    nombre: 'Cardio',
    musculo: 'corazon',
    equipo: null,
    suelo: true,
    a: P(10, -46, -70, 32, -34, 6),
    b: P(10, 46, -70, -30, -6, -6),
  },
  generico: {
    nombre: 'Ejercicio',
    musculo: null,
    equipo: null,
    suelo: true,
    a: P(4, -10, -14, 0, 0),
    b: P(4, -52, -64, 0, 0),
  },
};

/** Nombre legible del músculo, que acompaña SIEMPRE al rojo. */
export const MUSCULO_NOMBRE = {
  pecho: 'Pectoral',
  hombro: 'Deltoides',
  trapecio: 'Trapecio',
  dorsal: 'Dorsal',
  biceps: 'Bíceps',
  triceps: 'Tríceps',
  antebrazo: 'Antebrazo',
  cuadriceps: 'Cuádriceps',
  isquios: 'Isquiotibiales',
  gluteo: 'Glúteo',
  gemelo: 'Gemelo',
  abdomen: 'Abdomen',
  oblicuos: 'Oblicuos',
  cuello: 'Cuello',
  corazon: 'Sistema cardiovascular',
};

/* --------------------------------------------------------------------------
 * Cinemática
 * ------------------------------------------------------------------------ */

const rad = (g) => (g * Math.PI) / 180;

/**
 * Dónde va la cadera para que el pie toque el suelo.
 *
 * El pie es el punto fijo; se sube por la pierna y el muslo hasta la cadera.
 * Sin esto, al bajar en la sentadilla la figura atraviesa el suelo.
 */
function caderaApoyada(pose, pieX = 50) {
  const m = rad(pose.muslo);
  const p = rad(pose.muslo + pose.pierna);
  const talon = pose.talon || 0;
  const x = pieX - (L.muslo * Math.sin(m) + L.pierna * Math.sin(p));
  const y = SUELO - talon - (L.muslo * Math.cos(m) + L.pierna * Math.cos(p));
  return [x, y];
}

function anclaje(patron, pose) {
  if (patron.suelo === false) return patron.cadera;
  return caderaApoyada(pose);
}

/* --------------------------------------------------------------------------
 * EL ENCUADRE SE CALCULA, NO SE PONE A OJO
 *
 * El `viewBox` estaba fijo en «0 0 100 120» y la mitad de los patrones se
 * salían: el remo inclinado sacaba la cabeza por la derecha, la prensa un pie
 * por la izquierda, y en pantalla se veía media figura pegada a una esquina.
 *
 * Aquí se recorre el esqueleto con las dos posturas, se juntan todos los
 * puntos con lo que ocupa el aparato, y el `viewBox` sale de ahí. Es la misma
 * regla de siempre: la geometría se mide.
 * ------------------------------------------------------------------------ */

/** Dónde cae cada articulación en una postura. Coordenadas del dibujo. */
function esqueleto(patron, pose, lejos) {
  const [cx, cy] = anclaje(patron, pose);
  const pts = [[cx, cy]];
  const t = rad(pose.tronco || 0);

  // tronco y cabeza
  const hx = cx + L.tronco * Math.sin(t);
  const hy = cy - L.tronco * Math.cos(t);
  pts.push([hx, hy]);
  const c = rad((pose.tronco || 0) + (pose.cabeza || 0));
  const lc = L.cuello + L.cabeza;
  pts.push([hx + lc * Math.sin(c) - L.cabeza, hy - lc * Math.cos(c) - L.cabeza]);
  pts.push([hx + lc * Math.sin(c) + L.cabeza, hy - lc * Math.cos(c) + L.cabeza]);

  // brazos (el de delante y el de detrás)
  for (const f of [1, 0]) {
    const ab = f ? pose.brazo || 0 : lejos(pose.brazo || 0);
    const aa = f ? pose.antebrazo || 0 : lejos(pose.antebrazo || 0);
    const p1 = rad((pose.tronco || 0) - ab);
    const ex = hx - L.brazo * Math.sin(p1);
    const ey = hy + L.brazo * Math.cos(p1);
    pts.push([ex, ey]);
    const p2 = rad((pose.tronco || 0) - ab - aa);
    const mx = ex - L.antebrazo * Math.sin(p2);
    const my = ey + L.antebrazo * Math.cos(p2);
    // lo que se lleva en la mano ocupa hasta 13 a cada lado
    const r = patron.equipo === 'barra' || patron.equipo === 'barra_espalda' ? 14 : 8;
    pts.push([mx - r, my - r], [mx + r, my + r]);
  }

  // piernas
  for (const f of [1, 0]) {
    const am = f ? pose.muslo || 0 : lejos(pose.muslo || 0);
    const ap = f ? pose.pierna || 0 : lejos(pose.pierna || 0);
    const kx = cx + L.muslo * Math.sin(rad(am));
    const ky = cy + L.muslo * Math.cos(rad(am));
    pts.push([kx, ky]);
    const tx = kx + L.pierna * Math.sin(rad(am + ap));
    const ty = ky + L.pierna * Math.cos(rad(am + ap));
    pts.push([tx, ty]);
    const pf = rad(-(am + ap + (pose.pie || 0)));
    pts.push([tx + L.pie * Math.cos(pf), ty + L.pie * Math.sin(pf)]);
  }
  return pts;
}

/** Lo que ocupa cada aparato, medido de sus propios trazos. */
const CAJA_APARATO = {
  jalon: [34, 4, 66, 30],
  polea_alta: [64, 6, 84, 30],
  paralelas: [26, 66, 74, 108],
  prensa: [24, 28, 104, 96],
  maquina_sentado: [28, 40, 60, 102],
  maquina_tumbado: [22, 78, 74, 104],
  banco_hombros: [24, 66, 50, 102],
};
const CAJA_BANCO = {
  plano: [18, 72, 80, 110],
  inclinado: [22, 62, 74, 110],
};

/**
 * El `viewBox` de un patrón.
 *
 * Se estira hasta un mínimo para que todas las figuras salgan más o menos del
 * mismo tamaño: si cada una se ajustara a su contenido, un curl (estrecho) se
 * vería gigante al lado de una prensa (ancha), y en una lista eso baila.
 */
function encuadre(patron, lejos) {
  const pts = [...esqueleto(patron, patron.a, lejos), ...esqueleto(patron, patron.b, lejos)];
  const caja = CAJA_APARATO[patron.equipo];
  if (caja) pts.push([caja[0], caja[1]], [caja[2], caja[3]]);
  const banco = patron.banco && CAJA_BANCO[patron.banco];
  if (banco) pts.push([banco[0], banco[1]], [banco[2], banco[3]]);
  if (patron.suelo !== false) pts.push([50, SUELO]);

  const P = 7; // media pluma del trazo, y un poco de aire
  let x0 = Math.min(...pts.map((p) => p[0])) - P;
  let y0 = Math.min(...pts.map((p) => p[1])) - P;
  let x1 = Math.max(...pts.map((p) => p[0])) + P;
  let y1 = Math.max(...pts.map((p) => p[1])) + P;

  const MIN_W = 92;
  const MIN_H = 122;
  if (x1 - x0 < MIN_W) {
    const m = (x0 + x1) / 2;
    x0 = m - MIN_W / 2;
    x1 = m + MIN_W / 2;
  }
  if (y1 - y0 < MIN_H) {
    const m = (y0 + y1) / 2;
    y0 = m - MIN_H / 2;
    y1 = m + MIN_H / 2;
  }
  return [x0, y0, x1 - x0, y1 - y0].map((n) => Math.round(n * 10) / 10).join(' ');
}

/* --------------------------------------------------------------------------
 * El aparato. Se dibuja detrás de la figura y no se mueve (salvo lo que la
 * figura lleva en las manos, que va colgado del antebrazo).
 * ------------------------------------------------------------------------ */
function aparatoFondo(patron) {
  const t = 'class="an-aparato"';
  switch (patron.equipo) {
    case 'barra':
    case 'mancuerna':
    case 'barra_espalda':
      return '';
    case 'jalon':
      return `<path ${t} d="M50 4 V22" /><path ${t} d="M34 22 H66" />`;
    case 'polea_alta':
      return `<path ${t} d="M64 6 H84 M74 6 V30" />`;
    case 'paralelas':
      return `<path ${t} d="M26 66 H74 M30 66 V108 M70 66 V108" />`;
    case 'prensa':
      return `<path ${t} d="M78 34 L98 54 M84 28 L104 48" /><path ${t} d="M24 96 H74" />`;
    case 'maquina_sentado':
      return `<path ${t} d="M28 66 H60 M30 66 V102 M58 66 V40 M58 40 H44" />`;
    case 'maquina_tumbado':
      return `<path ${t} d="M22 78 H74 M26 78 V104 M70 78 V104" />`;
    case 'banco_hombros':
      return `<path ${t} d="M24 66 H50 M28 66 V102" />`;
    default:
      return '';
  }
}

function banco(patron) {
  if (!patron.banco) return '';
  if (patron.banco === 'inclinado') {
    return `<path class="an-colchoneta" d="M24 98 L72 64" />
            <path class="an-aparato" d="M30 97 V110 M66 76 V110 M30 110 H40 M60 110 H72" />`;
  }
  return `<path class="an-colchoneta" d="M20 74 H80" />
          <path class="an-aparato" d="M28 76 V108 M72 76 V108 M22 108 H36 M64 108 H78" />`;
}

/** Lo que se lleva en la mano, dibujado en el extremo del antebrazo. */
function enLaMano(patron) {
  const t = 'class="an-carga"';
  switch (patron.equipo) {
    case 'barra':
    case 'barra_espalda':
      return `<path ${t} d="M-13 0 H13" /><path class="an-disco" d="M-13 -5 V5 M13 -5 V5" />`;
    case 'mancuerna':
      return `<path ${t} d="M-6 0 H6" /><path class="an-disco" d="M-6 -4 V4 M6 -4 V4" />`;
    case 'jalon':
    case 'polea_alta':
      return `<path ${t} d="M-9 0 H9" />`;
    default:
      return '';
  }
}

/* --------------------------------------------------------------------------
 * El esqueleto
 * ------------------------------------------------------------------------ */

/**
 * Devuelve el SVG del ejercicio.
 *
 * @param {string} clave        patrón (`press_horizontal`…)
 * @param {object} opciones
 *   - animada  false = una sola postura (para las listas: 60 figuras moviéndose
 *              a la vez en un móvil viejo es justo lo que hace que raspe)
 *   - ciclo    duración de una repetición, en segundos
 */
export function figura(clave, { animada = true, ciclo = 2.6, id = null } = {}) {
  const patron = PATRONES[clave] || PATRONES.generico;
  const uid = id || 'an' + Math.random().toString(36).slice(2, 8);
  const A = { ...patron.a };
  const B = { ...patron.b };
  const [ax, ay] = anclaje(patron, A);
  const [bx, by] = anclaje(patron, B);

  // El lado de detrás. De perfil se dibuja un poco retrasado y más apagado —
  // sin él la figura es un palo plano y no se entiende la postura. De frente
  // (elevaciones laterales, abducción) va ESPEJADO y con el mismo peso: ahí lo
  // que cuenta es justo la simetría.
  const frontal = !!patron.frontal;
  const lejos = (g) => (frontal ? -g : g * 0.72);

  // Solo se anima lo que cambia entre las dos posturas.
  const ejes = {
    raiz: [`translate(${ax.toFixed(1)}px, ${ay.toFixed(1)}px)`, `translate(${bx.toFixed(1)}px, ${by.toFixed(1)}px)`],
    tronco: [rot(A.tronco), rot(B.tronco)],
    cabeza: [rot(A.cabeza || 0), rot(B.cabeza || 0)],
    hombros: [tr(0, A.hombros || 0), tr(0, B.hombros || 0)],
    brazo: [rot(-(A.brazo || 0)), rot(-(B.brazo || 0))],
    antebrazo: [rot(-(A.antebrazo || 0)), rot(-(B.antebrazo || 0))],
    muneca: [rot(-(A['muñeca'] || 0)), rot(-(B['muñeca'] || 0))],
    muslo: [rot(-(A.muslo || 0)), rot(-(B.muslo || 0))],
    pierna: [rot(-(A.pierna || 0)), rot(-(B.pierna || 0))],
    pie: [rot(-(A.pie || 0)), rot(-(B.pie || 0))],
    tuerce: [esc(A.tuerce || 0), esc(B.tuerce || 0)],
    brazo2: [rot(-lejos(A.brazo || 0)), rot(-lejos(B.brazo || 0))],
    antebrazo2: [rot(-lejos(A.antebrazo || 0)), rot(-lejos(B.antebrazo || 0))],
    muslo2: [rot(-lejos(A.muslo || 0)), rot(-lejos(B.muslo || 0))],
    pierna2: [rot(-lejos(A.pierna || 0)), rot(-lejos(B.pierna || 0))],
  };

  const css = animada
    ? Object.entries(ejes)
        .filter(([, [a, b]]) => a !== b)
        .map(
          ([eje, [a, b]]) =>
            `@keyframes ${uid}-${eje}{0%,6%{transform:${a}}50%,56%{transform:${b}}100%{transform:${a}}}` +
            `#${uid} .j-${eje}{animation:${uid}-${eje} ${ciclo}s cubic-bezier(.45,.05,.35,1) infinite}`
        )
        .join('')
    : '';

  const E = (k) => ejes[k][0];

  /** Un brazo entero. `n` = '' el de delante, '2' el de detrás. */
  const brazo = (n) => `
      <g class="j-brazo${n}" style="transform:${E('brazo' + n)}">
        <path class="an-hueso h-brazo" d="M0 0 V${L.brazo}" />
        <g style="transform:translate(0px,${L.brazo}px)">
          <g class="j-antebrazo${n}" style="transform:${E('antebrazo' + n)}">
            <path class="an-hueso h-antebrazo" d="M0 0 V${L.antebrazo}" />
            <g style="transform:translate(0px,${L.antebrazo}px)">
              <g class="j-muneca" style="transform:${E('muneca')}">${n ? (frontal ? enLaMano(patron) : '') : enLaMano(patron)}</g>
            </g>
          </g>
        </g>
      </g>`;

  /** Una pierna entera. */
  const pierna = (n) => `
      <g class="j-muslo${n}" style="transform:${E('muslo' + n)}">
        <path class="an-hueso h-muslo" d="M0 0 V${L.muslo}" />
        <g style="transform:translate(0px,${L.muslo}px)">
          <g class="j-pierna${n}" style="transform:${E('pierna' + n)}">
            <path class="an-hueso h-pierna" d="M0 0 V${L.pierna}" />
            <g style="transform:translate(0px,${L.pierna}px)">
              <g class="j-pie" style="transform:${E('pie')}">
                <path class="an-hueso h-pie" d="M0 0 H${L.pie}" />
              </g>
            </g>
          </g>
        </g>
      </g>`;

  const musculo = patron.musculo ? ` m-${patron.musculo}` : '';

  return `<svg id="${uid}" class="an-fig${frontal ? ' an-frontal' : ''}${musculo}" viewBox="${encuadre(patron, lejos)}"
   xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${patron.nombre}" preserveAspectRatio="xMidYMid meet">
  ${css ? `<style>${css}</style>` : ''}
  <g class="an-escena">
    ${aparatoFondo(patron)}
    ${banco(patron)}
    <g class="j-raiz" style="transform:${E('raiz')}">
      <g class="j-tuerce" style="transform:${E('tuerce')}">
        <g class="an-lejos">${pierna('2')}</g>
        ${pierna('')}
        <g class="j-tronco" style="transform:${E('tronco')}">
          <path class="an-hueso h-tronco" d="M0 0 V-${L.tronco}" />
          <g style="transform:translate(0px,-${L.tronco}px)">
            <g class="j-hombros" style="transform:${E('hombros')}">
              <g class="an-lejos">${brazo('2')}</g>
              <g class="j-cabeza" style="transform:${E('cabeza')}">
                <path class="an-hueso h-cuello" d="M0 0 V-${L.cuello}" />
                <circle class="an-cabeza" cx="0" cy="-${L.cuello + L.cabeza}" r="${L.cabeza}" />
              </g>
              ${brazo('')}
            </g>
          </g>
        </g>
      </g>
    </g>
  </g>
</svg>`;
}

const rot = (g) => `rotate(${(+g || 0).toFixed(1)}deg)`;
const tr = (x, y) => `translate(${x}px, ${(+y || 0).toFixed(1)}px)`;
const esc = (g) => `scaleX(${(1 - Math.abs(g) / 120).toFixed(3)}) rotate(${(g / 3).toFixed(1)}deg)`;

/** El músculo que trabaja, con su nombre. El color nunca va solo. */
export function musculoDe(clave) {
  const p = PATRONES[clave] || PATRONES.generico;
  return p.musculo ? { clave: p.musculo, nombre: MUSCULO_NOMBRE[p.musculo] || p.musculo } : null;
}
