/* =============================================================================
 * catalogo.js — Los ejercicios que la app conoce.
 *
 * POR QUÉ EXISTE
 * --------------
 * Carlos: «poner mano a mano cada foto es un rollo». Dar de alta una máquina
 * costaba escribir el nombre, elegir grupo, elegir tipo y hacer una foto. Con
 * esto se elige de una lista y ya viene el nombre, el grupo muscular, el tipo
 * de aparato y una figura haciendo el movimiento: un toque en vez de un
 * formulario.
 *
 * DE 69 A 1.365  (v2, 27-ago-2026)
 * --------------------------------
 * El catálogo escrito a mano tenía 69 ejercicios. Ahora los datos vienen de
 * `gym/tools/construir_catalogo.mjs`, que traduce al castellano de gimnasio el
 * dataset MIT de hasaneyldrm/exercises-dataset. Los 69 de Carlos siguen ahí,
 * con su nombre EXACTO y su foto: sus series apuntan a la máquina por nombre,
 * y cambiar un nombre le dejaría un año de registros huérfano.
 *
 * LO QUE NO SE HA COGIDO: LOS GIFS
 * -------------------------------
 * Los GIF de ese repo son © Gym visual y su aviso dice «cloning this repo is
 * not a license». La app se va a cobrar. Así que la imagen del ejercicio la
 * pone `animacion.js`, que es nuestra, pesa 2 KB y funciona sin cobertura.
 *
 * TRES FUENTES DE IMAGEN, EN ESTE ORDEN
 * -------------------------------------
 *   1. La foto que Carlos le hizo a SU máquina  (la pone quien llama)
 *   2. La foto de Wikimedia del catálogo viejo   (67 ejercicios, licencia comprobada)
 *   3. La figura animada del patrón de movimiento (los 1.365)
 *
 * Los pictogramas siguen aquí porque la ficha de una máquina creada a mano en
 * su día guarda una clave de pictograma, y esas fichas no se tocan.
 * ========================================================================== */

import { rutaFoto } from './fotos.js';
import { figura, musculoDe, PATRONES } from './animacion.js';

export { rutaFoto, musculoDe };

/* --------------------------------------------------------------------------
 * Pictogramas. viewBox 0 0 64 64, solo trazo (heredan el color).
 * ------------------------------------------------------------------------ */
const D = {
  barra: 'M6 26v12M58 26v12M14 20v24M50 20v24M14 32h36',
  mancuerna: 'M12 22v20M22 26v12M42 26v12M52 22v20M22 32h20',
  maquina: 'M12 10v44M12 10h30a10 10 0 0 1 0 20H12M20 54h28M40 30v24',
  polea_alta: 'M32 6v14M20 20h24M32 20v10M24 30h16v10a8 8 0 0 1-16 0z',
  polea_baja: 'M32 58V44M20 44h24M32 44V34M24 34h16V24a8 8 0 0 0-16 0z',
  banco: 'M8 30h48M14 30v22M50 30v22M8 24h20',
  cuerda: 'M32 8v18M24 26c0 10 2 18 4 26M40 26c0 10-2 18-4 26',
  disco: 'M32 10a22 22 0 1 1 0 44 22 22 0 0 1 0-44zM32 24a8 8 0 1 1 0 16 8 8 0 0 1 0-16z',
  cinta: 'M8 46h48M12 46l6-26h28l6 26M20 20v-6h24v6',
  bici: 'M14 46a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM50 46a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM14 38l10-18h14l8 18M24 20h12',
  corporal: 'M32 10a5 5 0 1 1 0 10 5 5 0 0 1 0-10M32 20v16M32 36l-8 16M32 36l8 16M18 26l14 4 14-4',
  banda: 'M12 20c14 8 26 8 40 0M12 44c14-8 26-8 40 0M12 20v24M52 20v24',
};

export function pictograma(clave, color = 'currentColor') {
  const d = D[clave] || D.maquina;
  return `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" fill="none"
    stroke="${color}" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`;
}

/** Color con el que se tiñe cada grupo muscular (paleta de series validada). */
export const COLOR_GRUPO = {
  pecho: 'var(--serie-1)',
  espalda: 'var(--serie-3)',
  hombro: 'var(--serie-4)',
  biceps: 'var(--serie-5)',
  triceps: 'var(--serie-5)',
  pierna: 'var(--serie-2)',
  gluteo: 'var(--serie-2)',
  core: 'var(--serie-4)',
  antebrazo: 'var(--serie-5)',
  cardio: 'var(--serie-3)',
  otro: 'var(--texto-2)',
};

/* --------------------------------------------------------------------------
 * El catálogo, cargado del JSON que genera el script.
 *
 * `let` y no `const` a propósito: quien importa con `import * as cat` ve el
 * array ya relleno gracias a los enlaces vivos de los módulos. Si fuera una
 * copia, la lista se quedaría vacía para siempre.
 * ------------------------------------------------------------------------ */
export let CATALOGO = [];
export let GRUPOS_CATALOGO = ['pecho', 'espalda', 'hombro', 'biceps', 'triceps', 'pierna', 'gluteo', 'core', 'antebrazo', 'cardio'];

/** Índice por nombre, para no recorrer 1.365 filas en cada pintado. */
let PORNOMBRE = new Map();
/** Nombre normalizado de cada ejercicio, calculado UNA vez. */
let NORMAL = [];

const normaliza = (t) =>
  String(t || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

/**
 * Carga el catálogo. Se llama una vez al arrancar y es idempotente.
 *
 * Si el fichero no está (por ejemplo, un APK viejo), la app NO se cae: se queda
 * con lo que haya y lo dice por consola. Perder el catálogo es molesto; que no
 * abra la app en el gimnasio es inaceptable.
 */
let cargando = null;
export function cargar() {
  if (cargando) return cargando;
  cargando = fetch('datos/catalogo.json')
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status))))
    .then((filas) => {
      CATALOGO = filas;
      PORNOMBRE = new Map(filas.map((e) => [e.n, e]));
      NORMAL = filas.map((e) => normaliza(e.n));
      return CATALOGO;
    })
    .catch((e) => {
      console.warn('No pude cargar el catálogo:', e.message);
      CATALOGO = [];
      return CATALOGO;
    });
  return cargando;
}

/* --------------------------------------------------------------------------
 * Instrucciones: 735 KB que NO tienen por qué estar en memoria mientras se
 * entrena. Se piden la primera vez que se abre una ficha y se quedan.
 * ------------------------------------------------------------------------ */
let instr = null;
let instrCargando = null;
export function cargarInstrucciones() {
  if (instr) return Promise.resolve(instr);
  if (instrCargando) return instrCargando;
  instrCargando = fetch('datos/instrucciones.json')
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status))))
    .then((j) => (instr = j))
    .catch(() => (instr = {}));
  return instrCargando;
}

/** Los pasos de un ejercicio, o `null` si no lo tenemos. Nunca se inventan. */
export async function pasosDe(nombre) {
  const t = await cargarInstrucciones();
  const p = t[nombre];
  if (!p) return null;
  return Array.isArray(p) ? p : [p];
}

/* --------------------------------------------------------------------------
 * Búsqueda y patrones
 * ------------------------------------------------------------------------ */

/** Búsqueda tolerante: sin tildes, por trozos de palabra, en cualquier orden. */
export function buscar(consulta, grupo = '') {
  const q = normaliza(consulta).trim();
  const trozos = q ? q.split(/\s+/) : null;
  const res = [];
  for (let i = 0; i < CATALOGO.length; i++) {
    const e = CATALOGO[i];
    if (grupo && e.g !== grupo) continue;
    if (trozos) {
      const n = NORMAL[i];
      let vale = true;
      for (const t of trozos) {
        if (!n.includes(t)) {
          vale = false;
          break;
        }
      }
      if (!vale) continue;
    }
    res.push(e);
  }
  return res;
}

export function ejercicio(nombre) {
  return PORNOMBRE.get(nombre) || null;
}

/**
 * El patrón de movimiento de un ejercicio, por su nombre.
 *
 * Si la máquina la creó Carlos a mano y no está en el catálogo, se busca por
 * parecido: «Press banca del gym viejo» sigue enseñando un press horizontal.
 * Devolver `generico` sería quedarse sin dibujo justo en sus máquinas.
 */
export function patronDe(nombre) {
  const e = PORNOMBRE.get(nombre);
  if (e) return e.p;
  const n = normaliza(nombre);
  for (let i = 0; i < CATALOGO.length; i++) {
    if (NORMAL[i] === n) return CATALOGO[i].p;
  }
  // Por palabras: el nombre del catálogo cuyo primer término aparezca en el suyo.
  for (let i = 0; i < CATALOGO.length; i++) {
    const primera = NORMAL[i].split(' ')[0];
    if (primera.length > 4 && n.includes(primera)) return CATALOGO[i].p;
  }
  return 'generico';
}

export { PATRONES };

/**
 * QUÉ MANDA EN LAS LISTAS: LA FIGURA, NO LA FOTO
 *
 * Las fotos de Wikimedia son buenas de una en una, pero juntas en una lista son
 * 67 fotos de 67 personas distintas, con 67 luces y 67 encuadres: la pantalla
 * parece un tablón de anuncios y cuesta leerla. La figura, en cambio, es SIEMPRE
 * la misma y además dice algo que la foto no dice — qué músculo trabaja, en rojo.
 *
 * La foto de Wikimedia no se tira: se enseña en la ficha, como referencia.
 * Y la foto que Carlos le haga a SU máquina sigue ganando a todo, porque para
 * reconocer un aparato concreto no hay nada mejor.
 *
 * Para volver a las fotos en la lista basta con poner esto en `true`.
 */
export const FOTO_MANDA_EN_LISTAS = false;

/**
 * La imagen de un ejercicio dentro de su hueco (la caja la pone quien llama).
 *
 * `animada` va en FALSO en las listas a propósito. Sesenta figuras moviéndose a
 * la vez es justo lo que hace que el scroll raspe en un móvil normal: en la
 * lista se ve la postura, y el movimiento se ve al abrir la ficha.
 */
export function imagenEjercicio(nombre, iconoClave, grupo, { animada = false } = {}) {
  const src = rutaFoto(nombre);
  if (src && FOTO_MANDA_EN_LISTAS) {
    return `<img class="ej-foto" src="${src}" alt="" loading="lazy" decoding="async">`;
  }
  const patron = patronDe(nombre);
  if (patron && patron !== 'generico') return figura(patron, { animada });
  if (src) return `<img class="ej-foto" src="${src}" alt="" loading="lazy" decoding="async">`;
  if (iconoClave) {
    return `<span class="cat-pict" style="color:${COLOR_GRUPO[grupo] || 'var(--texto-2)'}">${pictograma(iconoClave)}</span>`;
  }
  return figura('generico', { animada });
}

/** La figura grande y en movimiento, para la ficha del ejercicio. */
export function figuraDe(nombre, opciones = {}) {
  return figura(patronDe(nombre), { animada: true, ...opciones });
}
