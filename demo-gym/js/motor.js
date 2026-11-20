/* =============================================================================
 * motor.js — El motor de las animaciones del vestuario.
 *
 * POR QUÉ EXISTE ESTE FICHERO (4-sep-2026)
 * ----------------------------------------
 * Carlos, con la 0.35.0 instalada: *«nuestro es bastante horrible (…) si abres
 * el apartado de cosmética, o abres una caja va a 3 fps (…) va lag hasta
 * cambiar de pestaña, es una puta barbaridad»*.
 *
 * Las 0.34 y 0.35 atacaron los SÍNTOMAS (los filtros, la cinta de 10.496 px) y
 * el tirón siguió ahí, porque la causa es de ARQUITECTURA. Medido en Chromium
 * con la colección abierta:
 *
 *     nodos SVG en la rejilla ........ 3.617
 *     elementos con `animation` ...... 867
 *     document.getAnimations() ....... 869
 *     fotograma medio ................ 21,6 ms   (peor: 53,5 ms)
 *
 * Y eso en un portátil. Ochocientas sesenta y siete animaciones de CSS sobre
 * elementos de SVG no se pueden componer en la GPU: cada fotograma el navegador
 * recalcula 867 estilos, vuelve a resolver la geometría del árbol SVG y lo
 * REPINTA. En un móvil de gama media eso son los 3 fps que él ve. No hay
 * micro-optimización que arregle un orden de magnitud: hay que cambiar el
 * mecanismo.
 *
 * CÓMO LO HACE DISCORD (comprobado, 4-sep-2026)
 * ---------------------------------------------
 * Sus efectos de perfil no se calculan en el móvil: son **imágenes animadas ya
 * renderizadas** (WebP/AVIF animado, antes APNG/GIF) que bajan de su CDN. Por
 * eso van a 60 fps clavados — el aparato solo pega fotogramas ya hechos. Eso
 * aquí no vale: la app tiene que abrir en un gimnasio SIN COBERTURA, y un
 * catálogo de vídeos son megas y una descarga.
 *
 * Lo más parecido que se puede hacer sin descargar nada es esto: **un `<canvas>`
 * por escena y UN SOLO `requestAnimationFrame` para toda la app**. Un canvas es
 * UNA capa que se compone en la GPU; lo que se dibuja dentro no toca el DOM, no
 * recalcula estilos y no dispara `layout`. Pintar cuarenta formas en un lienzo
 * de 232×232 cuesta microsegundos.
 *
 * LAS CINCO REGLAS DEL MOTOR
 * --------------------------
 * 1. **UN SOLO BUCLE.** Nueve azulejos no son nueve `requestAnimationFrame`:
 *    son nueve dibujos dentro del mismo fotograma. Así el coste se puede MEDIR
 *    y, sobre todo, se puede LIMITAR — que es lo que faltaba.
 * 2. **Lo que no se ve no se pinta.** `IntersectionObserver` por escena, y el
 *    bucle entero se para con `document.hidden` o cuando no queda ninguna
 *    escena viva. Cambiar de pestaña deja el motor a cero de verdad.
 * 3. **La calidad se ajusta sola.** El motor se cronometra a sí mismo: si el
 *    trabajo de un fotograma se pasa del presupuesto, baja un escalón
 *    (menos partículas, menos resolución, menos fps en los azulejos) y lo
 *    vuelve a medir. Un móvil lento no se lleva la misma escena que un móvil
 *    rápido, y ninguno de los dos se atasca. Esto es lo que hace IMPOSIBLE
 *    volver a los 3 fps.
 * 4. **La resolución tiene techo.** Un móvil con `devicePixelRatio` 3 y un
 *    azulejo de 116 px pediría 348×348 por azulejo. Se topa en 2 (y en 1,25
 *    cuando la calidad ha bajado): a ese tamaño no se nota y es menos de la
 *    mitad de píxeles.
 * 5. **`prefers-reduced-motion` pinta UN fotograma y se calla.** No es un modo
 *    degradado: es el dibujo quieto, que tiene que verse bien igual.
 *
 * CÓMO SE USA
 * -----------
 *   <canvas data-arte="m_forja" data-tam="116"></canvas>   (lo pinta el HTML)
 *   motor.montar(raiz)      // busca los canvas de `raiz` y los pone a vivir
 *   motor.desmontar(raiz)   // al repintar la pantalla, se sueltan
 *
 * El HTML lo siguen generando funciones que devuelven CADENAS (`cosmeticos.js`),
 * así que se puede seguir comprobando en Node que ninguna pieza escupe
 * `undefined` en medio del marcado.
 * ========================================================================== */

/* --------------------------------------------------------------------------
 * LOS ESCALONES DE CALIDAD
 *
 * No es un ajuste que el usuario toca: lo decide el motor midiéndose. Cada
 * escalón dice cuántas partículas se dibujan (`particulas`, un multiplicador),
 * a cuántos píxeles por píxel (`dpr`) y a cuántos fotogramas por segundo van
 * los azulejos de la rejilla (`fpsAzulejo`). El héroe —la pieza grande que se
 * está mirando— va siempre a 60: es una sola escena.
 * ------------------------------------------------------------------------ */
export const ESCALONES = [
  { nombre: 'alta',  particulas: 1.00, dpr: 2.00, fpsAzulejo: 30 },
  { nombre: 'media', particulas: 0.70, dpr: 1.50, fpsAzulejo: 30 },
  { nombre: 'baja',  particulas: 0.45, dpr: 1.25, fpsAzulejo: 24 },
  { nombre: 'minima',particulas: 0.28, dpr: 1.00, fpsAzulejo: 20 },
];

/* Cuánto puede costar el trabajo de dibujo de UN fotograma. 60 fps son 16,6 ms
 * para TODO (dibujo, composición, lo que haga el resto de la app), así que el
 * dibujo se queda con la mitad larga. Si se pasa, se baja un escalón. */
const PRESUPUESTO_MS = 7.0;
const HOLGURA_MS = 3.2;    // por debajo de esto se puede volver a subir
const VENTANA = 45;        // fotogramas que se promedian antes de decidir
/* Cuánto se deja gastar en ESTRENAR escenas dentro de un fotograma. Es un poco
 * más que el presupuesto normal porque una escena a medio pintar no existe: se
 * termina la que se ha empezado y se corta antes de la siguiente. */
const PRESUPUESTO_ESTRENO_MS = 9.0;

function menosMovimiento() {
  try {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  } catch { return false; }
}

/* --------------------------------------------------------------------------
 * EL MOTOR
 * ------------------------------------------------------------------------ */
class Motor {
  constructor() {
    /** @type {Set<Escena>} */
    this.escenas = new Set();
    this.corriendo = false;
    this.pedido = 0;
    this.t0 = 0;
    this.nivel = 0;                 // índice en ESCALONES
    this.coste = [];                // ms de las últimas VENTANA pintadas
    this.diag = { frames: 0, ms: 0, peor: 0 };
    this.quieto = menosMovimiento();
    this.ojo = null;
    this._alCambiarVisibilidad = () => {
      if (document.hidden) this.parar();
      else this.arrancar();
    };
    this._alRedimensionar = () => {
      for (const e of this.escenas) e.medir(this.escalon());
      // Y se despierta: `medir` deja la escena sucia, pero si el bucle estaba
      // parado (todo pintado, o `prefers-reduced-motion`) no volvería a pintar
      // nadie y al girar el móvil se quedaría el dibujo del tamaño de antes.
      this.arrancar();
    };
  }

  escalon() { return ESCALONES[this.nivel]; }

  /** El multiplicador de partículas que consultan los pintores. */
  get calidad() { return this.escalon().particulas; }

  /* ---------------------------------------------------------------- montar */
  /**
   * Busca en `raiz` los `<canvas data-arte>` y los pone a vivir.
   * Devuelve cuántas escenas ha montado (para los tests).
   */
  montar(raiz, pintores) {
    if (!raiz) return 0;
    this.podar();
    const lista = raiz.querySelectorAll
      ? [...raiz.querySelectorAll('canvas[data-arte]')]
      : [];
    if (raiz.matches && raiz.matches('canvas[data-arte]')) lista.unshift(raiz);
    let n = 0;
    for (const cv of lista) {
      if (cv.__escena) continue;
      const pintar = pintores(cv.dataset.arte);
      if (!pintar) continue;
      const esc = new Escena(cv, pintar, this);
      cv.__escena = esc;
      this.escenas.add(esc);
      esc.medir(this.escalon());
      this.vigilar(esc);
      n++;
    }
    if (n) this.arrancar();
    return n;
  }

  /**
   * SUELTA LO QUE YA NO ESTÁ EN EL DOCUMENTO.
   *
   * La red de seguridad del motor. Un lienzo que se quita del documento sin
   * pasar por `desmontar` (una hoja que se cierra sola, un trozo de HTML que se
   * reemplaza) se quedaría en el conjunto: `IntersectionObserver` no vuelve a
   * hablar de un elemento suelto, así que seguiría contando como visible y
   * pintando para nadie, para siempre. Es la misma familia de fuga que la de
   * los `blob:` que no se soltaban.
   */
  podar() {
    for (const e of this.escenas) {
      if (e.cv && e.cv.isConnected) continue;
      if (this.ojo && e.cv) { try { this.ojo.unobserve(e.cv); } catch { /* ya no está */ } }
      if (e.cv) e.cv.__escena = null;
      this.escenas.delete(e);
    }
  }

  /**
   * Suelta las escenas que colgaban de `raiz`. Se llama ANTES de repintar.
   *
   * Es la forma correcta de soltar: `raiz` y punto. No hay un «soltarlo todo»
   * a propósito — con una hoja abierta encima, soltarlo todo le congelaría los
   * dibujos. Lo que se escape por otro camino lo recoge `podar()`.
   */
  desmontar(raiz) {
    if (!raiz) return;
    const lista = raiz.querySelectorAll ? [...raiz.querySelectorAll('canvas[data-arte]')] : [];
    if (raiz.matches && raiz.matches('canvas[data-arte]')) lista.unshift(raiz);
    for (const cv of lista) {
      const esc = cv.__escena;
      if (!esc) continue;
      if (this.ojo) { try { this.ojo.unobserve(cv); } catch { /* da igual */ } }
      this.escenas.delete(esc);
      cv.__escena = null;
    }
    if (!this.escenas.size) this.parar();
  }

  /* ------------------------------------------------------------- el ojo */
  vigilar(esc) {
    if (!window.IntersectionObserver) { esc.visible = true; return; }
    if (!this.ojo) {
      this.ojo = new IntersectionObserver((entradas) => {
        for (const en of entradas) {
          const e = en.target.__escena;
          if (!e) continue;
          e.visible = en.isIntersecting;
          if (e.visible) e.sucio = true;
        }
        // Si ya no queda nada visible, el bucle no tiene por qué seguir.
        this.arrancar();
      }, { rootMargin: '96px' });
    }
    // Hasta que el observador conteste (un fotograma), se da por visible: si
    // no, la primera pintada llegaría tarde y se vería el hueco en negro.
    esc.visible = true;
    this.ojo.observe(esc.cv);
  }

  /* ------------------------------------------------------------- el bucle */
  arrancar() {
    if (this.corriendo || !this.escenas.size) return;
    if (typeof document !== 'undefined' && document.hidden) return;
    this.corriendo = true;
    if (!this.t0) this.t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    if (!this._enganchado && typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this._alCambiarVisibilidad);
      window.addEventListener('resize', this._alRedimensionar);
      this._enganchado = true;
    }
    this.pedido = requestAnimationFrame(this.paso);
  }

  parar() {
    this.corriendo = false;
    if (this.pedido) cancelAnimationFrame(this.pedido);
    this.pedido = 0;
  }

  paso = (ahora) => {
    if (!this.corriendo) return;
    const esc = this.escalon();
    const t = (ahora - this.t0) / 1000;
    const arranque = performance.now();

    // LAS PRIMERAS PINTADAS SE REPARTEN. Al abrir la colección se montan diez
    // escenas de golpe y pintarlas todas en el mismo fotograma costaba 129 ms:
    // un tirón de los que se ven justo al entrar, que es el peor sitio donde
    // tenerlo. Ahora se pintan hasta agotar un presupuesto y las que quedan
    // esperan al fotograma siguiente — cuatro fotogramas de nada en vez de uno
    // de un octavo de segundo. Las que ya estaban pintadas no se retrasan
    // nunca: esto solo afecta a las que estrenan.
    let vivas = 0;
    let gastado = 0;
    for (const e of this.escenas) {
      if (!e.visible) continue;
      if (e.unaVez && e.hecha) continue;
      // QUIETO: una escena ya pintada NO cuenta como viva. Contarla dejaba el
      // bucle corriendo para siempre sin pintar nada — 128 fotogramas de
      // `requestAnimationFrame` para no hacer nada, que es justo lo contrario
      // de lo que pide `prefers-reduced-motion`.
      if (this.quieto && !e.sucio) continue;
      vivas++;
      const estrena = !e.hecha;
      if (estrena && gastado > PRESUPUESTO_ESTRENO_MS) continue;
      if (this.quieto) {
        const t0 = performance.now();
        e.pintarUna(0, esc, this);
        gastado += performance.now() - t0;
        continue;
      }
      const cada = 1000 / (e.prioridad ? 60 : esc.fpsAzulejo);
      if (!e.sucio && ahora - e.ultimo < cada - 1) continue;
      e.ultimo = ahora;
      if (estrena) {
        const t0 = performance.now();
        e.pintarUna(t, esc, this);
        gastado += performance.now() - t0;
      } else {
        e.pintarUna(t, esc, this);
      }
    }

    const trabajo = performance.now() - arranque;
    // Estrenar escenas NO cuenta para decidir la calidad: son tres o cuatro
    // fotogramas al abrir una pantalla, y si contaran, el motor bajaría de
    // escalón nada más entrar y se quedaría abajo el resto de la sesión.
    this.medirse(trabajo - gastado);
    // El contador de diagnóstico: cuánto trabajo de DIBUJO se ha hecho y en
    // cuántos fotogramas. No se usa para decidir nada —de eso se encarga
    // `medirse`—, está para poder MEDIRLO desde fuera. Los milisegundos entre
    // dos `requestAnimationFrame` no valen: están topados por el vsync, así que
    // una escena diez veces más cara sale igual hasta que se atasca. Lo que hay
    // que vigilar es el trabajo, y este es el número que mira CI.
    this.diag.frames++;
    this.diag.ms += trabajo;
    if (trabajo > this.diag.peor) this.diag.peor = trabajo;

    // Sin nada que mover, el bucle se apaga: en `prefers-reduced-motion` cada
    // escena se pinta UNA vez y aquí se acaba.
    // Sin nada vivo, el bucle se apaga solo: es lo que hace que una pantalla
    // llena de fichas quietas (la cinta) no cueste NADA una vez pintada, y que
    // `prefers-reduced-motion` pinte un fotograma y se calle.
    if (!vivas) return this.parar();
    this.pedido = requestAnimationFrame(this.paso);
  };

  /* ------------------------------------------------ la calidad, sola
   * Se promedia una ventana de fotogramas antes de tocar nada: reaccionar a un
   * fotograma suelto haría que la calidad subiera y bajara sin parar, que se ve
   * peor que quedarse abajo. */
  medirse(ms) {
    this.coste.push(ms);
    if (this.coste.length < VENTANA) return;
    const medio = this.coste.reduce((s, v) => s + v, 0) / this.coste.length;
    this.coste.length = 0;
    if (medio > PRESUPUESTO_MS && this.nivel < ESCALONES.length - 1) {
      this.nivel++;
      for (const e of this.escenas) e.medir(this.escalon());
    } else if (medio < HOLGURA_MS && this.nivel > 0) {
      this.nivel--;
      for (const e of this.escenas) e.medir(this.escalon());
    }
  }

  /** Para los tests y el diagnóstico. */
  estado() {
    let visibles = 0;
    for (const e of this.escenas) if (e.visible) visibles++;
    return {
      escenas: this.escenas.size, visibles, corriendo: this.corriendo,
      nivel: this.escalon().nombre, quieto: this.quieto,
      frames: this.diag.frames,
      msPorFotograma: this.diag.frames ? +(this.diag.ms / this.diag.frames).toFixed(3) : 0,
      peorMs: +this.diag.peor.toFixed(3),
    };
  }

  /** Pone el contador de diagnóstico a cero. Para medir un tramo concreto. */
  reiniciarDiag() {
    this.diag = { frames: 0, ms: 0, peor: 0 };
  }
}

/* --------------------------------------------------------------------------
 * UNA ESCENA — un `<canvas>` y la función que lo pinta.
 * ------------------------------------------------------------------------ */
class Escena {
  constructor(cv, pintar, motor) {
    this.cv = cv;
    this.pintar = pintar;
    this.g = cv.getContext('2d', { alpha: true, desynchronized: true });
    this.visible = false;
    this.sucio = true;
    this.ultimo = -1e9;
    // `data-heroe` es la pieza grande que se está mirando: va a 60 fps y con la
    // resolución de arriba. Solo hay una en pantalla, así que puede permitírselo.
    this.prioridad = cv.dataset.heroe === '1';
    // `data-quieto` es una pieza que NO se anima aunque la app sí: la cinta de
    // la caja pinta setenta fichas mientras gira y ninguna tiene por qué
    // moverse. Se pinta UNA vez y no se vuelve a programar; el lienzo conserva
    // lo pintado aunque salga y vuelva a entrar en pantalla.
    this.unaVez = cv.dataset.quieto === '1';
    this.hecha = false;
    this.w = 0; this.h = 0; this.dpr = 1;
    this.semilla = hash(cv.dataset.arte + (cv.dataset.sem || ''));
  }

  /** Ajusta el lienzo al hueco que ocupa y al escalón de calidad de ahora. */
  medir(escalon) {
    const r = this.cv.getBoundingClientRect();
    // En un `display:none` el rectángulo es 0: se usa el atributo como respaldo
    // para no dejar un lienzo de 0×0 que luego no se repinta nunca.
    const w = Math.max(1, Math.round(r.width || Number(this.cv.dataset.tam) || 116));
    const h = Math.max(1, Math.round(r.height || Number(this.cv.dataset.alto) || w));
    const tope = this.prioridad ? Math.max(escalon.dpr, 1.5) : escalon.dpr;
    const dpr = Math.min(typeof devicePixelRatio === 'number' ? devicePixelRatio : 1, tope);
    if (w === this.w && h === this.h && dpr === this.dpr) return;
    this.hecha = false;
    this.w = w; this.h = h; this.dpr = dpr;
    this.cv.width = Math.round(w * dpr);
    this.cv.height = Math.round(h * dpr);
    this.sucio = true;
  }

  pintarUna(t, escalon, motor) {
    const g = this.g;
    if (!g) return;
    if (!this.w || !this.h) this.medir(escalon);
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.clearRect(0, 0, this.w, this.h);
    try {
      this.pintar(g, {
        t, w: this.w, h: this.h, calidad: escalon.particulas,
        semilla: this.semilla, quieto: motor.quieto, heroe: this.prioridad,
      });
    } catch (err) {
      // Una pieza que revienta no puede tumbar a las otras sesenta y nueve.
      // Se apaga esa y se deja constancia.
      this.visible = false;
      console.error('arte:', this.cv.dataset.arte, err);
    }
    this.sucio = false;
    this.hecha = true;
  }
}

/** Un hash estable del id, para que cada pieza tenga su azar y sea SIEMPRE el
 *  mismo: si cambiara en cada pintada, las partículas saltarían de sitio. */
export function hash(t) {
  let h = 2166136261;
  const s = String(t || '');
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) / 4294967296;
}

export const motor = new Motor();
export default motor;
