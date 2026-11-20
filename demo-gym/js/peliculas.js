/* =============================================================================
 * peliculas.js — Los efectos del vestuario YA RENDERIZADOS.
 *
 * POR QUÉ EXISTE ESTE FICHERO (5-sep-2026, 0.37.0)
 * ------------------------------------------------
 * Carlos, con la 0.36.0 en el móvil: *«el resto son la puta peor mierda que he
 * visto en mi vida, no se acercan ni por asomo a los que te he enviado de
 * Discord (…) ¿por qué no usas el mismo método que hacen ellos para que tengan
 * tanta calidad? ¿No has dicho que ellos lo que hacían era descargarlo en la
 * app y que estén pre-renderizados?»*.
 *
 * Sí lo dije, y estaba escrito en `motor.js` desde el 4-sep — y se descartó por
 * la regla de que la app abre en un gimnasio sin cobertura. Esa regla sigue en
 * pie; lo que estaba mal era la conclusión. La salida no es «entonces se
 * calcula todo en el móvil»: es **que el pack básico VIAJE DENTRO DEL APK** y
 * que el bueno se descargue. Sin cobertura no se pierde nada; con cobertura se
 * gana el doble de resolución.
 *
 * EL PORQUÉ TÉCNICO, QUE ES EL QUE MANDA
 * --------------------------------------
 * Lo que dibuja `arte.js` tiene que caber en 7 ms de un móvil, sesenta veces
 * por segundo. Con ese techo caben treinta polígonos, y treinta polígonos
 * parecen treinta polígonos. Lo de Discord no es más talento: es que su
 * animación NO SE CALCULA EN EL TELÉFONO. Se renderiza una vez, en un
 * ordenador, sin prisa (APNG desde su CDN — comprobado el 5-sep-2026), y el
 * móvil solo pega fotogramas ya hechos.
 *
 * Aquí el ordenador es `tools/estudio/`: Chromium sin ventana con WebGL2, donde
 * un fotograma puede costar TREINTA SEGUNDOS. De ahí salen cosas que en el
 * móvil son impensables — trazar la órbita de un fotón alrededor de un agujero
 * negro, un charco en perspectiva con ondas que deforman el reflejo— y en el
 * móvil todas cuestan lo mismo: nada. Un `<img>` con WebP animado lo
 * descodifica el NAVEGADOR, en su hilo, con su gestión de memoria. Ni un
 * `requestAnimationFrame`, ni un lienzo, ni presupuesto que vigilar.
 *
 * LAS TRES CAPAS, EN ORDEN
 * ------------------------
 *   1. La película de ALTA, si se ha descargado (IndexedDB → blob:).
 *   2. La del pack ESTÁNDAR, que viaja en el APK. Siempre está.
 *   3. Si la pieza no tiene película, el dibujo de `arte.js` de toda la vida.
 *      Ninguna pieza se queda en blanco.
 *
 * DOS TRAMPAS QUE YA ESTABAN PAGADAS Y QUE AQUÍ VUELVEN
 * ----------------------------------------------------
 * · **Los `blob:` no se sueltan mientras la app vive.** Soltar uno cancela la
 *   imagen que aún se está cargando: es lo que dejaba la foto de perfil en gris
 *   (`limpiarUrls()`, 0.21.0). Las URL de aquí se crean UNA vez y se quedan.
 * · **Los Blob no sobreviven al sync**, así que el almacén `peliculas` está
 *   fuera de `ALMACENES_SYNC` — como el avatar y la cola de fotos.
 * ========================================================================== */

import { MANIFIESTO } from './peliculas_datos.js';
import * as DB from './db.js';

/* --------------------------------------------------------------------------
 * LOS DOS TAMAÑOS, Y POR QUÉ CADA HUECO SE LLEVA EL SUYO (0.37.1)
 *
 * Carlos: *«las animaciones no entiendo por qué se ven de mala calidad, se ve
 * como un gif malo de WhatsApp»*. Dos causas, las dos de tamaño: el pack que le
 * llegaba medía 416 px y la tarjeta del perfil mide 1.560 píxeles de verdad en
 * su móvil (520 de CSS × densidad 3). Eso es estirar por 3,75.
 *
 * Pero poner los 1.152 del pack grande en los DIEZ azulejos de la rejilla sería
 * descodificar decenas de MB por segundo, y volveríamos al tirón que costó tres
 * versiones quitar. Así que:
 *
 *   `mini`   → los azulejos. Viaja DENTRO del APK: el vestuario se ve bien
 *              desde el primer arranque y sin cobertura.
 *   `grande` → la tarjeta del perfil y la pieza que se está mirando, que es
 *              UNA a la vez. Se descarga.
 * ------------------------------------------------------------------------ */
const PACK_BASE = 'mini';
const PACK_ALTO = 'grande';

/** id → URL de la película de alta que ya está descargada. */
const descargadas = new Map();

/** Qué piezas tienen película en el pack del APK. */
const enElApk = new Set(Object.keys((MANIFIESTO.packs || {})[PACK_BASE] || {}));
/** Y cuáles existen en el pack grande, o sea: cuáles puede servir el servidor. */
const enElServidor = new Set(Object.keys((MANIFIESTO.packs || {})[PACK_ALTO] || {}));

/* De dónde cuelga el pack grande. Sale de `nube.json` (`web`), así que cambiar
 * de alojamiento NO obliga a publicar una versión nueva de la app — la misma
 * regla que los servidores del mapa. */
let _base = '';
export function fijarBase(b) { _base = String(b || '').replace(/\/+$/, ''); }

let estado = { bajando: false, hechas: 0, total: 0, error: '' };

/**
 * ¿El móvil pide MENOS MOVIMIENTO?
 *
 * Si lo pide, aquí no se sirve ninguna película: un WebP animado no se puede
 * congelar, y la tentación de taparlo con un `filter` está prohibida en este
 * proyecto (un filtro sobre algo que se mueve se recalcula en cada fotograma;
 * es lo que dejó la app «súper lag» en la 0.34). Devolviendo cadena vacía, la
 * pieza vuelve al lienzo de `arte.js`, que el motor pinta UNA vez y se calla —
 * que es exactamente lo que «menos movimiento» quiere decir.
 */
function menosMovimiento() {
  try {
    return !!(typeof window !== 'undefined' && window.matchMedia
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  } catch { return false; }
}

/* --------------------------------------------------------------------------
 * LO QUE USA EL CATÁLOGO
 * ------------------------------------------------------------------------ */

/** ¿Esta pieza se dibuja con una película en vez de con un lienzo? */
export function hayPelicula(id) {
  if (menosMovimiento()) return false;
  return descargadas.has(id) || enElApk.has(id);
}

/**
 * De dónde sale la película de una pieza.
 *
 * `grande` lo pide quien tiene sitio para ella: la tarjeta del perfil y la
 * pieza que se está mirando de cerca. Los azulejos de la rejilla piden la
 * pequeña SIEMPRE, aunque la grande esté descargada — hay diez a la vez y el
 * navegador tiene que descodificarlas todas.
 *
 * Devuelve `''` si la pieza no tiene película (y entonces la pinta `arte.js`).
 */
export function fuenteDe(id, grande = false) {
  if (menosMovimiento()) return '';
  if (grande) {
    // 1. La que ya está en el móvil: instantánea y funciona sin cobertura.
    const g = descargadas.get(id);
    if (g) return g;
    // 2. LA DEL SERVIDOR, DIRECTAMENTE.
    //
    //    Esto es lo que hace que la tarjeta se vea bien DESDE LA PRIMERA VEZ.
    //    Sin esto, la calidad buena solo llegaba después de que terminara la
    //    descarga entera — y mientras tanto se veía la de 384 px estirada a los
    //    1.560 píxeles de la tarjeta, que es exactamente lo que Carlos describió
    //    como «un gif malo de WhatsApp». El navegador se la guarda en su caché
    //    (el Worker manda `Cache-Control` de un mes), así que la segunda vez ya
    //    no viaja por la red aunque la descarga a IndexedDB no haya acabado.
    if (_base && enElServidor.has(id)) return `${_base}/efectos/${PACK_ALTO}/${id}.webp`;
  }
  if (enElApk.has(id)) return `./efectos/${PACK_BASE}/${id}.webp`;
  // Sin el pack del APK pero con la grande bajada: mejor eso que un hueco.
  return descargadas.get(id) || '';
}

/** El respaldo de una pieza: la del APK, que siempre está. */
export function respaldoDe(id) {
  return enElApk.has(id) ? `./efectos/${PACK_BASE}/${id}.webp` : '';
}

/* --------------------------------------------------------------------------
 * SI LA GRANDE NO CARGA, SE VUELVE A LA DEL APK
 *
 * La grande puede venir del servidor, y el servidor puede no estar: sin
 * cobertura, o si algún día se cambia de alojamiento y una pieza ya no existe
 * ahí. Un `<img>` que falla deja un HUECO y no avisa a nadie.
 *
 * Se escucha el error en fase de CAPTURA porque los errores de carga de una
 * imagen NO burbujean: un oyente normal en `document` no se entera. Es un solo
 * oyente para toda la app, no uno por imagen.
 * ------------------------------------------------------------------------ */
if (typeof document !== 'undefined') {
  document.addEventListener('error', (e) => {
    const el = e.target;
    if (!el || el.tagName !== 'IMG' || !el.dataset || !el.dataset.respaldo) return;
    const r = el.dataset.respaldo;
    delete el.dataset.respaldo;      // una sola vez: si el respaldo falla, ya está
    if (r && el.src !== r) el.src = r;
  }, true);
}

/** Los datos de una película (tamaño, fotogramas): para los tests y el HUD. */
export function datosDe(id, pack = PACK_BASE) {
  return ((MANIFIESTO.packs || {})[pack] || {})[id] || null;
}

export function comoVa() { return { ...estado, descargadas: descargadas.size }; }

/* --------------------------------------------------------------------------
 * LA DESCARGA
 * ------------------------------------------------------------------------ */

/**
 * Recupera de IndexedDB lo que ya se bajó en arranques anteriores y crea sus
 * URL. Se llama UNA vez al arrancar, antes de pintar nada.
 *
 * Es a prueba de todo a propósito: si esto falla, la app tiene que seguir
 * abriendo con el pack del APK. Un adorno no puede tumbar la aplicación.
 */
export async function recuperar() {
  try {
    const filas = await DB.peliculas();
    for (const f of filas) {
      if (!f || !f.blob || f.pack !== PACK_ALTO) continue;
      // La URL se crea una vez y NO se suelta mientras la app viva: soltarla
      // cancelaría la imagen que se está cargando en ese momento.
      descargadas.set(f.id, URL.createObjectURL(f.blob));
    }
  } catch { /* sin base, sin películas: se sigue con las del APK */ }
  return descargadas.size;
}

/**
 * Se baja del servidor las piezas de alta que falten o hayan cambiado.
 *
 * `base` es de dónde: sale de `nube.json` (`web`), así que cambiar de
 * alojamiento NO obliga a publicar una versión nueva de la app — la misma regla
 * que los servidores del mapa.
 *
 * No es una descarga de «todo o nada»: cada pieza que llega se guarda y ya se
 * ve. Si se corta la cobertura a la mitad, se queda lo que llegó y el resto
 * sigue saliendo del APK, que es exactamente lo que tiene que pasar.
 */
export async function descargar(base, { alAvanzar = null, senal = null, soloEstas = null } = {}) {
  if (estado.bajando || !base) return 0;
  const raiz = String(base).replace(/\/+$/, '');
  estado = { bajando: true, hechas: 0, total: 0, error: '' };
  let puestas = 0;

  try {
    // El manifiesto del SERVIDOR, no el del APK: es el que sabe qué hay ahora.
    const r = await fetch(`${raiz}/efectos/manifiesto.json`, { cache: 'no-cache', signal: senal });
    if (!r.ok) throw new Error(`manifiesto ${r.status}`);
    const man = await r.json();
    const lista = (man.packs || {})[PACK_ALTO] || {};

    // Qué hay ya guardado, con su hash: solo se baja lo que falta o cambió.
    const tengo = new Map();
    for (const f of await DB.peliculas()) tengo.set(f.id, f.sha);

    let faltan = Object.entries(lista).filter(([id, d]) => tengo.get(id) !== d.sha);
    /* SI SE PIDE UNA LISTA, SOLO ESAS.
     *
     * El pack grande entero son 127 MB, y bajárselos en segundo plano nada más
     * abrir la app sería gastarle a Carlos la tarifa de datos sin preguntar. No
     * hace falta: desde la 0.37.1 la tarjeta del perfil pide la grande
     * DIRECTAMENTE al servidor y el navegador se la guarda un mes. Lo único que
     * merece estar en el móvil de verdad es lo que llevas PUESTO, que son tres
     * piezas — para que el perfil se vea bien también sin cobertura.
     *
     * Bajarlo todo sigue estando: es el botón de Ajustes, y ahí lo pide quien
     * quiere, sabiendo lo que pesa. */
    if (soloEstas && soloEstas.length) {
      const quiero = new Set(soloEstas);
      faltan = faltan.filter(([id]) => quiero.has(id));
    }
    estado.total = faltan.length;
    if (alAvanzar) alAvanzar(estado);

    for (const [id, d] of faltan) {
      if (senal && senal.aborted) break;
      try {
        const rp = await fetch(`${raiz}/efectos/${PACK_ALTO}/${id}.webp`,
                               { cache: 'no-cache', signal: senal });
        if (!rp.ok) throw new Error(String(rp.status));
        const blob = await rp.blob();
        // Una respuesta de 200 con el HTML de la app dentro NO es un WebP. Ya
        // pasó con `/api/*` y el buscador: se comprueba el tipo, no el código.
        if (!/image\/webp/i.test(blob.type || '') || blob.size < 1024) {
          throw new Error(`no es un webp (${blob.type}, ${blob.size} B)`);
        }
        await DB.guardarPelicula(id, PACK_ALTO, d.sha, blob);
        const vieja = descargadas.get(id);
        descargadas.set(id, URL.createObjectURL(blob));
        // La URL vieja sí se suelta: nadie la está cargando ya, porque la
        // pieza se repinta con la nueva.
        if (vieja) { try { URL.revokeObjectURL(vieja); } catch { /* da igual */ } }
        puestas++;
      } catch (e) {
        // Una pieza que falla no para las demás: esa se queda con la del APK.
        estado.error = String(e.message || e);
      }
      estado.hechas++;
      if (alAvanzar) alAvanzar(estado);
    }
  } catch (e) {
    estado.error = String(e.message || e);
  } finally {
    estado.bajando = false;
  }
  return puestas;
}

/** Suelta lo descargado (Ajustes → «Borrar las descargas»). */
export async function olvidar() {
  for (const url of descargadas.values()) {
    try { URL.revokeObjectURL(url); } catch { /* da igual */ }
  }
  descargadas.clear();
  await DB.borrarPeliculas();
}
