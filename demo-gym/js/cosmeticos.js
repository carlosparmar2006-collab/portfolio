/* =============================================================================
 * cosmeticos.js — El catálogo de cosméticos del perfil, y su dibujo.
 *
 * SEGUNDA VUELTA (3-sep-2026). Carlos, sobre la primera: *«el diseño de las
 * personalizaciones es muy mierda, muy muy básico (…) ceniza es literal [otra]
 * pero con otro nombre; burbujas es la misma pero en azul (…) las has hecho
 * supergenéricas, literalmente las puedo poner una al lado de la otra»*.
 *
 * Tenía razón, y la causa era concreta: la primera versión era UN dibujo
 * («partículas que flotan», «un anillo») con distintos colores y velocidades.
 * Eso no es un catálogo, es un color picker. Lo que se ha cambiado:
 *
 * 1. **CADA PIEZA TIENE UN SUJETO.** No «partículas verdes»: mariposas, con sus
 *    alas, que baten. No «un anillo naranja»: una forja, con metal fundido y
 *    ascuas subiendo. Si una pieza no se reconoce a 40 px por su SILUETA, no
 *    está terminada.
 * 2. **CINCO COLECCIONES**, y cada una es un mundo con su paleta: Sala de
 *    hierro, Fundición, Tormenta, Bosque quieto y Vacío. Una pieza pertenece a
 *    un sitio, que es lo que hace que un conjunto parezca un conjunto y no una
 *    bolsa de adornos.
 * 3. **TÉCNICA DE VERDAD, no opacidades**: filtros SVG (`feTurbulence` para el
 *    humo, el fuego y el metal líquido; `feGaussianBlur` + `feColorMatrix` para
 *    que las gotas se fundan), máscaras, gradientes cónicos, y capas a
 *    velocidades distintas — que es lo que hace que algo parezca vivo.
 * 4. **LOS TÍTULOS TAMBIÉN SE DIBUJAN.** Un título épico no es un texto de otro
 *    color: es neón que parpadea, cromo con un destello que lo cruza, fuego, o
 *    un glitch. Carlos: *«si el nombre es muy épico, pues que tenga efecto
 *    brillo o neón o algo así»*.
 *
 * LO QUE NO SE MUEVE DE SITIO
 * ---------------------------
 * · **Ni un emoji y ni una descarga.** Todo es SVG y CSS escritos aquí: la app
 *   abre en un gimnasio sin cobertura, y una librería de animación vive en un
 *   CDN. Lo que se mueve, se mueve con fotogramas de CSS.
 * · **Nada copiado de nadie.** Ni un dibujo, ni una marca, ni un nombre de otra
 *   app o de otra obra. El concepto (marcos, fondos, títulos) no es de nadie;
 *   los dibujos son de esta app y de sus tokens. El «Ojo» exótico es un dibujo
 *   propio: tres hojas curvas girando, no la marca de ningún anime.
 * · **La rareza NUNCA se dice solo con el color**: lleva su nombre escrito y sus
 *   puntos.
 * · Se prueba en Node: aquí no se toca el DOM, todo devuelve cadenas.
 * ========================================================================== */


import * as PELIS from './peliculas.js';

/* --------------------------------------------------------------------------
 * LAS RAREZAS
 * ------------------------------------------------------------------------ */
export const RAREZAS = [
  { id: 'comun',      nombre: 'Común',       puntos: 1, color: '#9aa6b6', luz: '#c3ccd8', polvo: 15 },
  { id: 'pococomun',  nombre: 'Poco común',  puntos: 2, color: '#46d17f', luz: '#8bf0b4', polvo: 30 },
  { id: 'raro',       nombre: 'Raro',        puntos: 3, color: '#4d9bf0', luz: '#9ccbff', polvo: 75 },
  { id: 'epico',      nombre: 'Épico',       puntos: 4, color: '#a86bf5', luz: '#d3aeff', polvo: 200 },
  { id: 'legendario', nombre: 'Legendario',  puntos: 5, color: '#ff9a3d', luz: '#ffd08a', polvo: 600 },
  { id: 'mitico',     nombre: 'Mítico',      puntos: 6, color: '#ff5aa8', luz: '#ffb0d6', polvo: 1800 },
  { id: 'exotico',    nombre: 'Exótico',     puntos: 7, color: '#7df9d0', luz: '#eafff8', polvo: 6000,
    iris: ['#7df9d0', '#8fd0ff', '#c39bff', '#ff9ad5', '#ffd98a', '#7df9d0'] },
];

export const RAREZA_POR_ID = new Map(RAREZAS.map((r) => [r.id, r]));
export const ORDEN_RAREZA = RAREZAS.map((r) => r.id);

export function nivelDeRareza(id) {
  const i = ORDEN_RAREZA.indexOf(id);
  return i < 0 ? 0 : i;
}

export function rareza(id) {
  return RAREZA_POR_ID.get(id) || RAREZAS[0];
}

/* --------------------------------------------------------------------------
 * LAS FAMILIAS — cinco sitios, y solo se lleva UNA de cada uno.
 * ------------------------------------------------------------------------ */
export const FAMILIAS = [
  { id: 'marco',  nombre: 'Marco',  plural: 'Marcos',  pie: 'Rodea tu foto' },
  { id: 'fondo',  nombre: 'Fondo',  plural: 'Fondos',  pie: 'La escena de tu tarjeta' },
  { id: 'placa',  nombre: 'Placa',  plural: 'Placas',  pie: 'La chapa con tu nombre' },
  { id: 'aura',   nombre: 'Aura',   plural: 'Auras',   pie: 'Lo que cruza tu perfil' },
  { id: 'titulo', nombre: 'Título', plural: 'Títulos', pie: 'Lo que pone bajo tu nombre' },
];

export const FAMILIA_POR_ID = new Map(FAMILIAS.map((f) => [f.id, f]));

/* --------------------------------------------------------------------------
 * LAS COLECCIONES
 *
 * Cinco mundos. Una pieza pertenece a uno y comparte su paleta con las demás
 * del mismo, así que un marco de Fundición y un fondo de Fundición se ven
 * juntos como si los hubiera hecho la misma mano — que es exactamente lo que
 * les faltaba a las de la primera versión.
 * ------------------------------------------------------------------------ */
export const COLECCIONES = [
  { id: 'hierro',   nombre: 'Sala de hierro', pie: 'Lo que hay de verdad en un gimnasio',
    c1: '#c8d2df', c2: '#7c8697', c3: '#3b434f' },
  { id: 'fundicion', nombre: 'Fundición', pie: 'Metal al rojo y ascuas',
    c1: '#ffd08a', c2: '#ff8a3d', c3: '#7a2f0c' },
  { id: 'tormenta', nombre: 'Tormenta', pie: 'Electricidad, cristal y neón',
    c1: '#d9e8ff', c2: '#6fa8ff', c3: '#2a2f6b' },
  { id: 'bosque',   nombre: 'Bosque quieto', pie: 'Lo que crece y lo que cae',
    c1: '#d7f7c4', c2: '#5fc98a', c3: '#1e4234' },
  { id: 'vacio',    nombre: 'Vacío', pie: 'Lo que hay más allá',
    c1: '#eafff8', c2: '#8fd0ff', c3: '#150c2a' },
];

export const COLECCION_POR_ID = new Map(COLECCIONES.map((c) => [c.id, c]));

/* ==========================================================================
 * EL CATÁLOGO
 *
 * >>> Los `id` NO se cambian NUNCA. <<< Es lo que tiene alguien guardado en su
 * colección: cambiar uno le borra la pieza. El nombre, el dibujo y hasta la
 * rareza se pueden cambiar; el id, no.
 * ======================================================================== */
const M = (id, nombre, rareza, coleccion, arte) => ({ id: `m_${id}`, familia: 'marco', nombre, rareza, coleccion, arte });
const F = (id, nombre, rareza, coleccion, arte) => ({ id: `f_${id}`, familia: 'fondo', nombre, rareza, coleccion, arte });
const P = (id, nombre, rareza, coleccion, arte) => ({ id: `p_${id}`, familia: 'placa', nombre, rareza, coleccion, arte });
const A = (id, nombre, rareza, coleccion, arte) => ({ id: `a_${id}`, familia: 'aura', nombre, rareza, coleccion, arte });
const T = (id, nombre, rareza, coleccion, efecto) => ({ id: `t_${id}`, familia: 'titulo', nombre, rareza, coleccion, arte: { efecto } });

export const COSMETICOS = [
  /* ================================================================ MARCOS
   * Cada uno una silueta distinta. Si no se reconoce a 40 px, no vale. */
  M('cinta', 'Cinta de muñeca', 'comun', 'hierro', { tipo: 'venda' }),
  M('tiza', 'Marca de tiza', 'comun', 'hierro', { tipo: 'tiza' }),
  M('cuerda', 'Cuerda de batalla', 'pococomun', 'hierro', { tipo: 'cuerda' }),
  M('metro', 'Cinta métrica', 'pococomun', 'hierro', { tipo: 'metro' }),
  M('discos', 'Discos', 'raro', 'hierro', { tipo: 'discos' }),
  M('mosqueton', 'Cadena y mosquetón', 'raro', 'hierro', { tipo: 'cadena' }),
  M('circuito', 'Circuito', 'epico', 'tormenta', { tipo: 'circuito' }),
  M('laurel', 'Laurel', 'epico', 'bosque', { tipo: 'laurel' }),
  M('forja', 'Forja', 'legendario', 'fundicion', { tipo: 'forja' }),
  M('alas', 'Alas de polilla', 'legendario', 'bosque',
    { tipo: 'alas', c1: '#f4e3c1', c2: '#c9975a', c3: '#6b4a2a' }),
  M('rayos', 'Tormenta', 'mitico', 'tormenta', { tipo: 'rayos' }),
  M('serpiente', 'Serpiente', 'mitico', 'bosque', { tipo: 'serpiente' }),
  M('ojo', 'El Ojo', 'exotico', 'vacio', { tipo: 'ojo' }),
  M('agujero', 'Horizonte de sucesos', 'exotico', 'vacio', { tipo: 'agujero' }),
  // Se llamaba «Sol negro», igual que el FONDO de abajo: en la rejilla salían
  // dos «Sol negro · Exótico» seguidos y Carlos lo leyó como un fallo (5-sep-2026).
  // Un marco de eclipse es un aro de corona; el fondo es el sol entero.
  M('solnegro', 'Eclipse', 'exotico', 'fundicion', { tipo: 'solnegro' }),

  /* ================================================================= FONDOS
   * Escenas, no degradados. Cada una tiene algo que MIRAR. */
  F('carbon', 'Carbón', 'comun', 'hierro', { tipo: 'carbon' }),
  F('rejilla', 'Rejilla', 'comun', 'hierro', { tipo: 'rejilla' }),
  F('taquilla', 'Taquillas', 'pococomun', 'hierro', { tipo: 'taquilla' }),
  F('polvo', 'Nube de tiza', 'pococomun', 'hierro', { tipo: 'polvo' }),
  F('amanecer', 'Amanecer', 'raro', 'bosque', { tipo: 'amanecer' }),
  F('lluvia', 'Lluvia', 'raro', 'tormenta', { tipo: 'lluvia' }),
  F('sala', 'La sala', 'epico', 'hierro', { tipo: 'sala' }),
  F('aurora', 'Aurora', 'epico', 'bosque', { tipo: 'aurora' }),
  F('fundicion', 'Colada', 'legendario', 'fundicion', { tipo: 'colada' }),
  F('cumbre', 'Cumbre', 'legendario', 'bosque', { tipo: 'cumbre' }),
  F('tormenta', 'Tormenta seca', 'mitico', 'tormenta', { tipo: 'tormenta' }),
  F('nebulosa', 'Nebulosa', 'mitico', 'vacio', { tipo: 'nebulosa' }),
  F('agujero', 'Agujero negro', 'exotico', 'vacio', { tipo: 'agujero' }),
  F('cromo', 'Cromo líquido', 'exotico', 'vacio', { tipo: 'cromo' }),
  F('solnegro', 'Sol negro', 'exotico', 'fundicion', { tipo: 'solnegro' }),
  F('cero', 'Cero', 'exotico', 'vacio', { tipo: 'cero' }),

  /* ================================================================= PLACAS
   * Cada una con FORMA distinta, no solo con otro color. */
  P('lisa', 'Lisa', 'comun', 'hierro', { tipo: 'lisa' }),
  P('esparadrapo', 'Esparadrapo', 'comun', 'hierro', { tipo: 'esparadrapo' }),
  P('grabada', 'Placa grabada', 'pococomun', 'hierro', { tipo: 'grabada' }),
  P('etiqueta', 'Etiqueta', 'pococomun', 'bosque', { tipo: 'etiqueta' }),
  P('neon', 'Neón', 'raro', 'tormenta', { tipo: 'neon' }),
  P('vidrio', 'Vidrio', 'raro', 'tormenta', { tipo: 'vidrio' }),
  P('holo', 'Holograma', 'epico', 'vacio', { tipo: 'holo' }),
  P('yunque', 'Yunque', 'legendario', 'fundicion', { tipo: 'yunque' }),
  P('reliquia', 'Reliquia', 'mitico', 'vacio', { tipo: 'reliquia' }),

  /* =================================================================== AURAS
   * Cosas, no puntos: mariposas que baten, pétalos que giran al caer,
   * chispas de soldadura que rebotan, ceniza que sube. */
  A('motas', 'Motas de tiza', 'pococomun', 'hierro', { tipo: 'motas' }),
  A('hojas', 'Hojas', 'pococomun', 'bosque', { tipo: 'hojas' }),
  A('luciernagas', 'Luciérnagas', 'raro', 'bosque', { tipo: 'luciernagas' }),
  A('gotas', 'Goteras', 'raro', 'tormenta', { tipo: 'gotas' }),
  A('mariposas', 'Mariposas', 'epico', 'bosque', { tipo: 'mariposas' }),
  A('chispas', 'Chispas de soldadura', 'epico', 'fundicion', { tipo: 'chispas' }),
  A('llamas', 'Llamas', 'legendario', 'fundicion', { tipo: 'llamas' }),
  A('ascuas', 'Ascuas', 'legendario', 'fundicion', { tipo: 'ascuas' }),
  A('petalos', 'Pétalos', 'legendario', 'bosque', { tipo: 'petalos' }),
  A('estatica', 'Estática', 'mitico', 'tormenta', { tipo: 'estatica' }),
  A('cometas', 'Cometas', 'exotico', 'vacio', { tipo: 'cometas' }),

  /* ================================================================= TÍTULOS
   * El efecto sube con la rareza: de tinta plana a iridiscente con destello. */
  T('novato', 'Novato', 'comun', 'hierro', 'plano'),
  T('constante', 'Constante', 'comun', 'hierro', 'plano'),
  T('sinexcusas', 'Sin excusas', 'comun', 'hierro', 'plano'),
  T('tocahierro', 'Toca hierro', 'comun', 'hierro', 'plano'),
  T('madrugador', 'Madrugador', 'pococomun', 'bosque', 'contorno'),
  T('nocturno', 'Nocturno', 'pococomun', 'tormenta', 'contorno'),
  T('kilero', 'Kilero', 'pococomun', 'hierro', 'grabado'),
  T('poleas', 'Señor de las poleas', 'pococomun', 'hierro', 'grabado'),
  T('deacero', 'De acero', 'raro', 'hierro', 'acero'),
  T('rompebarras', 'Rompebarras', 'raro', 'fundicion', 'acero'),
  T('imparable', 'Imparable', 'raro', 'tormenta', 'brillo'),
  T('bestia', 'Bestia de carga', 'epico', 'fundicion', 'fuego'),
  T('coloso', 'Coloso', 'epico', 'hierro', 'neon'),
  T('inquebrantable', 'Inquebrantable', 'epico', 'tormenta', 'neon'),
  T('titan', 'Titán', 'legendario', 'fundicion', 'oro'),
  T('leyenda', 'Leyenda de la sala', 'legendario', 'hierro', 'cromo'),
  T('mitomotor', 'El que mueve el mundo', 'mitico', 'vacio', 'glitch'),
  T('eterno', 'Eterno', 'mitico', 'vacio', 'humo'),
  T('nadiecomotu', 'Nadie como tú', 'exotico', 'vacio', 'iris'),
];

export const POR_ID = new Map(COSMETICOS.map((c) => [c.id, c]));

export function deFamilia(familia) {
  return COSMETICOS.filter((c) => c.familia === familia);
}

export function deRareza(id) {
  return COSMETICOS.filter((c) => c.rareza === id);
}

export function deColeccion(id) {
  return COSMETICOS.filter((c) => c.coleccion === id);
}

export function pieza(id) {
  return POR_ID.get(id) || null;
}

export function coleccionDe(item) {
  return COLECCION_POR_ID.get(item && item.coleccion) || COLECCIONES[0];
}

export function familiaDe(item) {
  const f = FAMILIA_POR_ID.get(item && item.familia);
  return f ? f.nombre : '';
}

/* ==========================================================================
 * EL DIBUJO
 *
 * TERCERA VUELTA (4-sep-2026): AQUÍ YA NO SE ESCRIBE SVG.
 * ------------------------------------------------------
 * Las dos versiones anteriores generaban el dibujo entero como marcado: la
 * colección abierta eran **3.617 nodos de SVG y 867 elementos animándose a la
 * vez**, y de ahí los *«3 fps»* de Carlos. Ni quitando los filtros (0.34) ni
 * reciclando la cinta (0.35) se arregló, porque el problema no era ninguna de
 * las dos cosas: era pedirle al navegador que animara ochocientos elementos.
 *
 * Ahora cada pieza es **un `<canvas>` y una función** (`arte.js`), y todos los
 * lienzos de la pantalla los pinta UN solo `requestAnimationFrame` (`motor.js`).
 * Un canvas es una capa que se compone en la GPU y lo que se dibuja dentro no
 * toca el DOM: ni estilos, ni layout, ni repintado del árbol.
 *
 * LO QUE NO CAMBIA: **esto sigue devolviendo CADENAS.** Ni un `document`, ni un
 * `createElement`. Así se puede seguir comprobando en Node que ninguna pieza
 * escupe `undefined` en medio del marcado — que no da error, deja un hueco, y
 * eso solo se ve en el móvil.
 *
 * Placas y títulos SÍ siguen siendo CSS: son una caja y un texto, no una
 * escena. Un texto con un degradado no cuesta nada. Lo que se les ha quitado es
 * cualquier `filter` animado (`brightness`) y el `backdrop-filter` del vidrio,
 * que obligaba a volver a desenfocar el fondo —que se mueve— en cada fotograma.
 * ======================================================================== */

import * as ARTE from './arte.js';

function esc(t) {
  return String(t ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* --------------------------------------------------------------------------
 * LA PALETA DE UNA PIEZA
 *
 * La de su colección, salvo cuando la pieza la pisa: una polilla no es verde
 * lima por mucho que viva en el bosque. Y el iris de las exóticas viaja con la
 * rareza, no con la colección.
 * ------------------------------------------------------------------------ */
export function paletaDe(item) {
  const a = (item && item.arte) || {};
  const col = coleccionDe(item);
  const r = rareza(item && item.rareza);
  return {
    c1: a.c1 || col.c1, c2: a.c2 || col.c2, c3: a.c3 || col.c3,
    rareza: r.color, luz: r.luz, iris: r.iris || null,
  };
}

/**
 * EL RESOLVEDOR QUE USA EL MOTOR.
 *
 * `motor.montar(raiz, pintorDe)` le pasa el `data-arte` de cada lienzo y espera
 * la función que lo pinta. Un id que no existe devuelve `null` y el motor
 * simplemente no monta ese lienzo: un hueco vacío es mejor que una excepción
 * dentro del bucle, que se llevaría por delante a las otras sesenta y nueve.
 */
export function pintorDe(clave) {
  const item = pieza(clave);
  if (!item) return null;
  const a = item.arte || {};
  return ARTE.pintor(item.familia, a.tipo, paletaDe(item));
}

/* --------------------------------------------------------------------------
 * LOS LIENZOS
 *
 * `data-tam` y `data-alto` son el respaldo para cuando el lienzo se mide dentro
 * de algo que aún no tiene tamaño (una hoja que se está abriendo): sin ellos el
 * rectángulo mide 0 y quedaría un lienzo de 0×0 que ya no se repinta nunca.
 * `data-heroe` marca la pieza grande que se está mirando: va a 60 fps y a la
 * resolución de arriba, y solo hay una en pantalla.
 * ------------------------------------------------------------------------ */
function lienzo(item, clase, { tam, alto, animado = true, heroe = false, extra = '' }) {
  if (!item) return '';

  // PELÍCULA SI LA HAY (0.37.0). Un `<img>` con WebP animado lo descodifica el
  // navegador en su hilo: en el móvil no cuesta ni un `requestAnimationFrame`,
  // que es exactamente el problema que teníamos. Y lo que se ve es lo que salió
  // del estudio, sin techo de 7 ms. Ver `peliculas.js`.
  // LA GRANDE SOLO DONDE CABE. El héroe y la tarjeta del perfil se llevan la
  // de 1.152 px; los azulejos de la rejilla, la pequeña — hay diez a la vez.
  // El umbral de 320 es el que separa un azulejo (200) de la tarjeta (520).
  const cinta = PELIS.fuenteDe(item.id, heroe || tam >= 320);
  if (cinta) {
    // `data-arte` se conserva: los tests y el HUD identifican la pieza por él, y
    // el motor solo monta `canvas[data-arte]`, así que una imagen no le entra.
    // `decoding=async` para que una rejilla de nueve no bloquee la pintada.
    // `data-respaldo` es la del APK: si la grande viene del servidor y el
    // servidor no está, `peliculas.js` la cambia por ésta en vez de dejar un
    // hueco. Solo se pone cuando es OTRA fuente, para no repetir la misma.
    const resp = PELIS.respaldoDe(item.id);
    return `<img class="${clase} cos-cinta" src="${esc(cinta)}" alt=""`
      + (resp && resp !== cinta ? ` data-respaldo="${esc(resp)}"` : '')
      + ` data-arte="${esc(item.id)}" data-pelicula="1"`
      + ` width="${Math.round(tam)}" height="${Math.round(alto || tam)}"`
      + (heroe ? ' data-heroe="1"' : '')
      + ` decoding="async" aria-hidden="true"${extra ? ` ${extra}` : ''}>`;
  }

  return `<canvas class="${clase}" data-arte="${esc(item.id)}"`
    + ` data-tam="${Math.round(tam)}" data-alto="${Math.round(alto || tam)}"`
    + (heroe ? ' data-heroe="1"' : '')
    + (animado ? '' : ' data-quieto="1"')
    + ` aria-hidden="true"${extra ? ` ${extra}` : ''}></canvas>`;
}

/** El marco: un lienzo cuadrado que va POR ENCIMA de la foto, con la foto en
 *  el círculo del medio (radio `RFOTO`). */
export function dibujarMarco(item, { tam = 96, animado = true, heroe = false } = {}) {
  if (!item || item.familia !== 'marco') return '';
  return lienzo(item, 'cos-marco', { tam, animado, heroe });
}

/** El fondo: llena la caja de la tarjeta. */
export function escenaFondo(item, { animado = true, ancho = 200, alto = 0, heroe = false } = {}) {
  if (!item || item.familia !== 'fondo') return '';
  return lienzo(item, 'cos-escena', { tam: ancho, alto: alto || Math.round(ancho * 0.6), animado, heroe });
}

/** El aura: por encima del fondo y por debajo de la letra. */
export function dibujarAura(item, { animado = true, ancho = 200, alto = 0, heroe = false } = {}) {
  if (!item || item.familia !== 'aura') return '';
  return lienzo(item, 'cos-aura', { tam: ancho, alto: alto || Math.round(ancho * 0.6), animado, heroe });
}

/* --------------------------------------------------------------------------
 * EL CIELO DE CADA FONDO
 *
 * El degradado plano que va DEBAJO del lienzo. Sirve para dos cosas: que el
 * azulejo tenga color desde el primer fotograma (sin él se ve un parpadeo
 * negro al entrar en la pantalla) y que con `prefers-reduced-motion` el fondo
 * siga siendo el suyo.
 * ------------------------------------------------------------------------ */
export function estiloFondo(item) {
  if (!item || item.familia !== 'fondo') return { css: '', clase: '' };
  const a = item.arte || {};
  const cielos = {
    carbon: 'linear-gradient(165deg, #1a1f26, #0d1014)',
    rejilla: 'linear-gradient(165deg, #131820, #0a0d12)',
    taquilla: 'linear-gradient(100deg, #1d242c, #121821)',
    polvo: 'linear-gradient(165deg, #1c2129, #0f1319)',
    amanecer: 'linear-gradient(180deg, #16233d 0%, #3d3a66 42%, #a05a5c 72%, #e8925c 100%)',
    lluvia: 'linear-gradient(180deg, #0f1720, #1a2733 60%, #101820)',
    sala: 'linear-gradient(170deg, #12161c 0%, #1b222b 60%, #0c0f14 100%)',
    aurora: 'linear-gradient(180deg, #060a18, #0d1a2e 55%, #071018)',
    colada: 'linear-gradient(180deg, #1c0d06, #48170a 62%, #96380f)',
    cumbre: 'linear-gradient(180deg, #070c1c, #16233f 60%, #2b3b5c)',
    tormenta: 'linear-gradient(180deg, #0a0a14, #1b1b2e 60%, #0e0e18)',
    nebulosa: 'linear-gradient(150deg, #0a0616, #1d1140 45%, #350f36 75%, #0b0714)',
    agujero: 'radial-gradient(120% 100% at 50% 50%, #0a0714 0%, #04050a 60%, #000 100%)',
    cromo: 'linear-gradient(120deg, #2a3340, #8fa1b8 30%, #46525f 52%, #cdd8e6 68%, #2a3340)',
    solnegro: 'radial-gradient(120% 100% at 50% 52%, #2a0410 0%, #12020a 55%, #050008 100%)',
    cero: 'radial-gradient(120% 100% at 50% 56%, #2a0618 0%, #150310 55%, #07010a 100%)',
  };
  return { css: cielos[a.tipo] || cielos.carbon, clase: `cos-fondo-${a.tipo}` };
}

/* --------------------------------------------------------------------------
 * LAS PLACAS — una caja con nombre. Aquí no hay escena, así que sigue en CSS.
 * ------------------------------------------------------------------------ */
export function estiloPlaca(item) {
  if (!item || item.familia !== 'placa') return { css: '', clase: '' };
  const a = item.arte || {};
  const col = coleccionDe(item);
  const c = col.c2;
  const mapa = {
    lisa: { css: 'padding:6px 14px;border-radius:999px;background:#2a323d;border:1px solid #39434f;' },
    esparadrapo: { css: 'padding:6px 16px;background:#e6e1d4;color:#20242b;'
      + 'clip-path:polygon(2% 12%,8% 0,18% 10%,30% 2%,44% 12%,58% 2%,72% 12%,86% 2%,96% 12%,100% 50%,'
      + '96% 90%,86% 100%,72% 88%,58% 100%,44% 88%,30% 100%,18% 90%,8% 100%,2% 88%,0 50%);',
      clase: 'cos-placa-cinta' },
    grabada: { css: 'padding:7px 18px;border-radius:6px;background:linear-gradient(180deg,#39434f,#232a33);'
      + `border:1px solid ${c}88;box-shadow:inset 0 1px 0 rgba(255,255,255,.16);`,
      clase: 'cos-placa-remaches' },
    etiqueta: { css: 'padding:6px 14px 6px 20px;border-radius:4px 12px 12px 4px;'
      + `background:${c}22;border:1.5px solid ${c};`, clase: 'cos-placa-etiqueta' },
    neon: { css: `padding:6px 15px;border-radius:999px;background:${c}14;border:1.5px solid ${c};`
      + `box-shadow:0 0 16px -1px ${c},inset 0 0 12px -6px ${c};text-shadow:0 0 10px ${c};`,
      clase: 'cos-placa-neon' },
    // Antes llevaba `backdrop-filter: blur(5px)`. Un desenfoque del fondo hay
    // que rehacerlo en cada fotograma en el que el fondo cambia — y detrás de
    // la placa está justo la escena que se mueve. Ahora el vidrio son dos
    // degradados y un borde claro, que es lo que se lee como cristal.
    vidrio: { css: 'padding:6px 16px;border-radius:12px;'
      + `background:linear-gradient(150deg,${c}55,${c}14 45%,rgba(255,255,255,.10));`
      + `border:1px solid ${c}77;box-shadow:inset 0 1px 0 rgba(255,255,255,.28);` },
    holo: { css: 'padding:6px 16px;border-radius:999px;'
      + `background:linear-gradient(100deg,${c}55,#7df9d044,#ff9ad544,${c}55);`
      + `background-size:220% 100%;border:1px solid ${c}88;`, clase: 'cos-placa-holo' },
    yunque: { css: 'padding:8px 20px;border-radius:3px 3px 10px 10px;'
      + 'background:linear-gradient(180deg,#4a5360,#1b2027);border:1px solid #5d6875;'
      + 'box-shadow:inset 0 2px 0 rgba(255,255,255,.18),0 3px 0 #0b0d11;', clase: 'cos-placa-yunque' },
    reliquia: { css: 'padding:8px 22px;'
      + `background:linear-gradient(140deg,${c}55,#1b0f1c);border:1.5px solid ${c};`
      + 'clip-path:polygon(10px 0,100% 0,100% calc(100% - 10px),calc(100% - 10px) 100%,0 100%,0 10px);'
      + `box-shadow:0 0 22px -8px ${c};`, clase: 'cos-placa-reliquia' },
  };
  const m = mapa[a.tipo] || mapa.lisa;
  return { css: m.css, clase: m.clase || '' };
}

/* --------------------------------------------------------------------------
 * TÍTULOS — y su efecto.
 *
 * Carlos: *«si el nombre es muy épico, pues que tenga efecto brillo o neón o
 * algo así»*. Un título raro no es el mismo texto en otro color: es acero,
 * neón, fuego, cromo con un destello que lo cruza, un glitch o un iris que se
 * mueve. El efecto SUBE con la rareza, y ese es todo el sistema.
 *
 * Lo que se ha quitado en la 0.36.0: los `filter: brightness()` animados. Un
 * filtro sobre algo que cambia se rehace entero en cada fotograma, y la regla
 * de la casa es que no hay ni uno por encima de nada que se mueva. El latido
 * lo hace ahora la `text-shadow`, que se rasteriza con la letra.
 * ------------------------------------------------------------------------ */
export function estiloTitulo(item) {
  if (!item || item.familia !== 'titulo') return { css: '', clase: '' };
  const efecto = (item.arte || {}).efecto || 'plano';
  const col = coleccionDe(item);
  const r = rareza(item.rareza);
  const degradado = (colores) => `background:linear-gradient(100deg,${colores});`
    + 'background-size:220% 100%;-webkit-background-clip:text;background-clip:text;'
    + 'color:transparent;-webkit-text-fill-color:transparent;';
  const mapa = {
    plano: { css: `color:${r.color};` },
    // El contorno lleva un relleno muy tenue: hueco del todo, sobre un fondo
    // oscuro, se lee a medias.
    contorno: { css: `color:${r.color}22;-webkit-text-stroke:1.1px ${r.color};text-stroke:1.1px ${r.color};` },
    // Grabado en metal CLARO: con el tono medio de la colección se leía gris
    // sucio sobre gris oscuro.
    grabado: { css: `color:${col.c1};text-shadow:0 1.5px 0 rgba(0,0,0,.9),0 -1px 0 rgba(255,255,255,.2);` },
    acero: { css: degradado('#e8eef6,#8f9bab 40%,#f7fbff 52%,#7d8794 64%,#dfe6ef') },
    brillo: { css: `color:${r.color};--luz:${r.color};`, clase: 'cos-tit-brillo' },
    neon: { css: `color:#fff;text-shadow:0 0 4px #fff,0 0 10px ${r.color},0 0 22px ${r.color};`,
      clase: 'cos-tit-neon' },
    fuego: { css: degradado('#ffe9b8,#ff9a3d 38%,#ff5f2e 60%,#ffd08a'), clase: 'cos-tit-fuego' },
    oro: { css: degradado('#fff3c4,#e8b23c 38%,#fffbe8 50%,#c98f16 62%,#ffe9a8'), clase: 'cos-tit-sheen' },
    cromo: { css: degradado('#dfe8f5,#5c6a7d 38%,#ffffff 50%,#42505f 62%,#cfdae8'), clase: 'cos-tit-sheen' },
    glitch: { css: `color:${r.color};`, clase: 'cos-tit-glitch' },
    humo: { css: `color:${r.color};text-shadow:0 0 12px ${r.color}77;`, clase: 'cos-tit-humo' },
    iris: { css: degradado(rareza('exotico').iris.join(',')), clase: 'cos-tit-iris' },
  };
  const m = mapa[efecto] || mapa.plano;
  return { css: m.css, clase: m.clase || '' };
}

/** El título ya montado: lleva el texto repetido si el efecto lo necesita. */
export function tituloHTML(item, { etiqueta = 'span', clase = '' } = {}) {
  if (!item || item.familia !== 'titulo') return '';
  const e = estiloTitulo(item);
  const texto = esc(item.nombre);
  return `<${etiqueta} class="cos-titulo ${e.clase} ${clase}" style="${e.css}"
    data-texto="${texto}">${texto}</${etiqueta}>`;
}

/* --------------------------------------------------------------------------
 * LOS PUNTOS DE RAREZA — la mitad que no es color.
 * ------------------------------------------------------------------------ */
export function puntosHTML(rarezaId) {
  const r = rareza(rarezaId);
  return `<span class="cos-puntos" aria-hidden="true">${
    Array.from({ length: 7 }, (_, i) => `<b class="${i < r.puntos ? 'on' : ''}"></b>`).join('')
  }</span>`;
}

/* --------------------------------------------------------------------------
 * LA FICHA DE UNA PIEZA
 *
 * El mismo azulejo en los tres sitios donde se ve una pieza: la cinta que gira
 * al abrir la caja, la colección y la tienda. Que sean el mismo trozo de HTML
 * es lo que hace que lo que ves girar sea EXACTAMENTE lo que luego tienes.
 * ------------------------------------------------------------------------ */
export function vistaPreviaHTML(item, { tam = 116, animado = true, heroe = false } = {}) {
  if (!item) return '';
  const r = rareza(item.rareza);
  const lado = Math.round(tam);
  const dentro = {
    marco: () => `<span class="cos-mini-foto"><b class="cos-mini-cara"></b>
      ${dibujarMarco(item, { tam: lado * 0.82, animado, heroe })}</span>`,
    fondo: () => {
      const f = estiloFondo(item);
      return `<span class="cos-mini-fondo" style="background:${f.css}">
        ${escenaFondo(item, { animado, ancho: lado, alto: Math.round(lado * 0.72), heroe })}</span>`;
    },
    placa: () => {
      const p = estiloPlaca(item);
      return `<span class="cos-mini-placa ${animado ? p.clase : ''}" style="${p.css}"
        data-texto="Tu nombre">Tu nombre</span>`;
    },
    aura: () => `<span class="cos-mini-foto"><b class="cos-mini-cara"></b>
      ${dibujarAura(item, { animado, ancho: lado, alto: lado, heroe })}</span>`,
    titulo: () => `<span class="cos-mini-titulo">${tituloHTML(item)}</span>`,
  }[item.familia];

  return `<span class="cos-ficha rar-${item.rareza}" data-rareza="${item.rareza}">
    <span class="cos-ficha-lienzo">${dentro ? dentro() : ''}</span>
    <span class="cos-ficha-pie">
      <b class="cos-ficha-nombre">${esc(item.nombre)}</b>
      <span class="cos-ficha-rareza">${esc(r.nombre)}</span>
      ${puntosHTML(item.rareza)}
    </span>
  </span>`;
}
