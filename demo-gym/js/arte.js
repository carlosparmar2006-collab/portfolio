/* =============================================================================
 * arte.js — El dibujo de las piezas del vestuario, en CANVAS.
 *
 * POR QUÉ CANVAS Y NO SVG (4-sep-2026)
 * ------------------------------------
 * Medido en Chromium con la colección abierta, tal y como estaba en la 0.35.0:
 * 3.617 nodos de SVG y **867 elementos animándose a la vez**. Eso no se compone
 * en la GPU: en cada fotograma el navegador recalcula 867 estilos y repinta el
 * árbol. De ahí los *«3 fps»* de Carlos. Aquí las mismas setenta piezas son
 * setenta funciones que pintan sobre un lienzo; en pantalla hay nueve lienzos y
 * un solo `requestAnimationFrame` (ver `motor.js`).
 *
 * LO QUE HACE QUE ESTO SE VEA COMO LO DE DISCORD (y no como un juego web)
 * ----------------------------------------------------------------------
 * Los suyos son vídeos ya renderizados, así que no se les puede copiar la
 * técnica: se les copia el ACABADO, y el acabado son cinco cosas concretas:
 *
 * 1. **Luz aditiva.** Todo lo que brilla se pinta con `globalCompositeOperation
 *    = 'lighter'`: donde se cruzan dos partículas la luz SUMA, como en una foto
 *    de larga exposición. Es lo que separa «puntos de colores» de «brasas».
 * 2. **Halos cacheados, no filtros.** Un `<canvas>` de 64 px con un degradado
 *    radial se dibuja una vez y se reusa mil: da el resplandor de un
 *    `feGaussianBlur` a coste de un `drawImage`. Ni un filtro, en ningún sitio.
 * 3. **Profundidad.** Cada escena tiene dos o tres planos, con tamaño, opacidad
 *    y velocidad distintos. Un solo plano se lee como una calcomanía.
 * 4. **Estelas.** Lo que corre se dibuja estirado en su dirección. Una chispa
 *    redonda no viaja; una chispa alargada, sí.
 * 5. **Ritmos que no casan.** Dos períodos primos entre sí (5,3 s y 8,7 s) para
 *    el mismo elemento: el bucle deja de verse.
 *
 * LAS REGLAS QUE NO SE MUEVEN
 * ---------------------------
 * · **Nada copiado de nadie.** Discord vende colaboraciones con LICENCIA
 *   (Jujutsu Kaisen, My Hero Academia): son personajes de un tercero y pagarlos
 *   no está a nuestro alcance. Aquí se imita el LENGUAJE visual —que no es de
 *   nadie: fuego, eclipses, auras, relámpagos— y nunca lo que identifica a un
 *   personaje concreto. Ver `publicacion/inspiracion.md`.
 * · **Ni una descarga.** Todo se calcula aquí; la app abre sin cobertura.
 * · **Determinista.** Cada pieza tiene su semilla, así que sus partículas
 *   nacen siempre en el mismo sitio y en todos los móviles igual.
 * · **`quieto` tiene que verse bien.** Con `prefers-reduced-motion` se pinta UN
 *   fotograma, y ese fotograma no puede ser el vacío.
 * · **Sin DOM fuera de pintar.** El módulo se importa en Node (los tests del
 *   catálogo), así que nada toca `document` hasta que hay un lienzo delante.
 * ========================================================================== */

const TAU = Math.PI * 2;
export const RFOTO = 0.405;   // dónde acaba la foto dentro del lienzo del marco

/* --------------------------------------------------------------------------
 * DADOS Y CUENTAS
 * ------------------------------------------------------------------------ */
/** Azar repetible: la misma pieza tiene siempre las mismas partículas. */
export function dados(semilla) {
  let s = ((semilla * 4294967296) >>> 0) || 1;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}
const mez = (a, b, t) => a + (b - a) * t;
const sat = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
/** La parte decimal, siempre positiva: es el motor de todo lo que da vueltas. */
const ciclo = (v) => v - Math.floor(v);
/** Una curva de ida y vuelta suave, de 0 a 1 y otra vez a 0. */
const vaiven = (v) => 0.5 - 0.5 * Math.cos(ciclo(v) * TAU);

/** '#rrggbb' → 'rgba(r,g,b,a)'. Los colores del catálogo vienen en hex. */
export function rgba(hex, a = 1) {
  const h = String(hex || '#ffffff').replace('#', '');
  const n = h.length === 3
    ? h.split('').map((c) => parseInt(c + c, 16))
    : [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  return `rgba(${n[0] || 0},${n[1] || 0},${n[2] || 0},${a})`;
}

/** Mezcla dos colores hex. Sirve para no tener que escribir veinte constantes. */
export function tinte(a, b, t) {
  const p = (h) => { const s = String(h).replace('#', ''); return [
    parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)]; };
  const [r1, g1, b1] = p(a); const [r2, g2, b2] = p(b);
  const c = (x, y) => Math.round(mez(x, y, t)).toString(16).padStart(2, '0');
  return `#${c(r1, r2)}${c(g1, g2)}${c(b1, b2)}`;
}

/* --------------------------------------------------------------------------
 * LOS HALOS CACHEADOS
 *
 * Un degradado radial dibujado en un lienzo pequeño, guardado por color. Es lo
 * que sustituye a los `feGaussianBlur` que hubo que quitar: da el mismo
 * resplandor y cuesta un `drawImage`, que es lo más barato que hace un canvas.
 * ------------------------------------------------------------------------ */
const _halos = new Map();
const TAM_HALO = 64;

function lienzo(w, h) {
  if (typeof document === 'undefined') return null;
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  return cv;
}

/** Un punto de luz: núcleo lleno, caída suave, borde transparente. */
export function halo(color) {
  let cv = _halos.get(color);
  if (cv) return cv;
  cv = lienzo(TAM_HALO, TAM_HALO);
  if (!cv) return null;
  const g = cv.getContext('2d');
  const m = TAM_HALO / 2;
  const gr = g.createRadialGradient(m, m, 0, m, m, m);
  gr.addColorStop(0, rgba(color, 1));
  gr.addColorStop(0.18, rgba(color, 0.85));
  gr.addColorStop(0.45, rgba(color, 0.28));
  gr.addColorStop(1, rgba(color, 0));
  g.fillStyle = gr;
  g.fillRect(0, 0, TAM_HALO, TAM_HALO);
  _halos.set(color, cv);
  return cv;
}

/** Un punto de luz en (x,y) de radio r. `alfa` y la suma de luz van fuera. */
export function luz(g, x, y, r, color, alfa = 1) {
  const s = halo(color);
  if (!s) return;
  g.globalAlpha = alfa;
  g.drawImage(s, x - r, y - r, r * 2, r * 2);
}

/** Un punto de luz estirado hacia (ax,ay): la estela de lo que corre. */
export function estela(g, x, y, r, ang, largo, color, alfa = 1) {
  const s = halo(color);
  if (!s) return;
  g.save();
  g.globalAlpha = alfa;
  g.translate(x, y);
  g.rotate(ang);
  g.scale(largo, 1);
  g.drawImage(s, -r, -r, r * 2, r * 2);
  g.restore();
}

/** Enciende la suma de luz. Todo lo que brille va dentro. */
export function conLuz(g, fn) {
  const antes = g.globalCompositeOperation;
  g.globalCompositeOperation = 'lighter';
  fn();
  g.globalCompositeOperation = antes;
  g.globalAlpha = 1;
}

/* --------------------------------------------------------------------------
 * LA LLAMA
 *
 * La misma geometría que se ganó en la 0.34.0, ahora en canvas: pie ancho,
 * cintura, curva en S y las dos curvas cortándose en un VÉRTICE. Sin vértice es
 * un globo; con la punta recta es una estaca. El color va DENTRO, en un
 * degradado por lengua, y el parpadeo NO es monótono: sube, cede, vuelve a
 * subir más alto y se apaga.
 * ------------------------------------------------------------------------ */
export function lengua(g, x, base, ancho, alto, curva, sesgo) {
  const c = curva * alto;
  const wl = ancho * (1 - sesgo * 0.28);
  const wr = ancho * (1 + sesgo * 0.28);
  g.beginPath();
  g.moveTo(x - wl, base);
  g.bezierCurveTo(x - wl * 1.14, base - alto * 0.2,
                  x - wl * 0.34 - c * 0.4, base - alto * 0.58,
                  x + c, base - alto);
  g.bezierCurveTo(x + wr * 0.34 - c * 0.4, base - alto * 0.58,
                  x + wr * 1.14, base - alto * 0.2,
                  x + wr, base);
  g.quadraticCurveTo(x, base + alto * 0.14, x - wl, base);
  g.closePath();
}

/** El parpadeo: cuatro tramos que no dibujan una respiración. */
function parpadeo(f) {
  const k = ciclo(f);
  if (k < 0.28) return mez(0.62, 1.00, k / 0.28);
  if (k < 0.46) return mez(1.00, 0.80, (k - 0.28) / 0.18);
  if (k < 0.74) return mez(0.80, 1.12, (k - 0.46) / 0.28);
  return mez(1.12, 0.62, (k - 0.74) / 0.26);
}

const CALIENTE = ['#ffe9a8', '#ffab26', '#ff7a08', '#f24000', '#8a1c00'];
const NEGRO = ['#ffd5dd', '#ff3f63', '#8c0026', '#1a0208', '#000000'];

/**
 * Una hoguera. `n` lenguas repartidas, cada una con su ritmo.
 *
 * @param negro  el fuego negro NO es este en negro: es el degradado al revés,
 *               el cuerpo casi invisible y un filo carmesí. Es lo único que se
 *               ve cuando el relleno es más oscuro que el fondo.
 */
export function hoguera(g, { x, base, ancho, alto, t, n = 7, negro = false,
                             semilla = 0.5, calidad = 1, quieto = false }) {
  const az = dados(semilla + (negro ? 0.37 : 0));
  const cuantas = Math.max(3, Math.round(n * mez(0.55, 1, calidad)));
  const paleta = negro ? NEGRO : CALIENTE;

  // El resplandor del suelo: un halo ancho y quieto que funde la hoguera con lo
  // que hay detrás. Sin él la hoguera parece pegada encima.
  conLuz(g, () => {
    luz(g, x, base - alto * 0.34, alto * 0.62,
      negro ? '#7a0020' : '#ff7a10', negro ? 0.20 : 0.30);
  });

  for (let i = 0; i < cuantas; i++) {
    const r1 = az(), r2 = az(), r3 = az(), r4 = az();
    const dx = (r1 - 0.5) * ancho * 1.5;
    const escala = mez(0.55, 1, r2);
    const ritmo = mez(0.75, 1.45, r3);
    const desfase = r4;
    const f = quieto ? 0.35 + i * 0.11 : t * ritmo * 0.72 + desfase;
    const p = parpadeo(f);
    const h = alto * escala * p;
    const w = ancho * 0.30 * escala * mez(1, 1.6, negro ? 1 : 0);
    // El meceo va por su cuenta y con un período que no casa con el parpadeo:
    // dos ritmos primos es lo que hace que el bucle no se vea.
    const mece = quieto ? (r1 - 0.5) * 0.2
      : Math.sin((t * 0.41 * ritmo + desfase * 3.1) * TAU) * 0.26;
    const sesgo = (r2 - 0.5) * 1.4;

    const gr = g.createLinearGradient(0, base, 0, base - h);
    gr.addColorStop(0, rgba(paleta[negro ? 1 : 0], negro ? 0.95 : 1));
    gr.addColorStop(0.30, rgba(paleta[negro ? 2 : 1], negro ? 1 : 1));
    gr.addColorStop(0.62, rgba(paleta[negro ? 3 : 2], 1));
    gr.addColorStop(0.86, rgba(paleta[negro ? 4 : 3], negro ? 1 : 0.92));
    gr.addColorStop(1, rgba(paleta[4], 0));
    g.fillStyle = gr;
    lengua(g, x + dx, base, w, h, mece, sesgo);
    g.fill();
    if (negro) {
      // EL FILO. Fino a propósito: con lenguas estrechas y un filo grueso el
      // contorno se come el relleno y el fuego negro sale rosa.
      g.strokeStyle = rgba('#ff2f57', 0.42);
      g.lineWidth = 0.8;
      g.stroke();
    }
  }

  // El núcleo: cuatro lenguas cortas y blancas. El blanco es del NÚCLEO, no del
  // pie: si todas nacen blancas, la base es una franja y parece césped.
  if (!negro) {
    conLuz(g, () => {
      for (let i = 0; i < 3; i++) {
        const f = quieto ? 0.4 : t * 1.1 + i * 0.33;
        const h = alto * 0.34 * parpadeo(f);
        g.fillStyle = rgba('#fff0bd', 0.55);
        lengua(g, x + (i - 1) * ancho * 0.24, base, ancho * 0.15, h, 0, 0);
        g.fill();
      }
    });
  }
}

/* --------------------------------------------------------------------------
 * CAMPOS DE PARTÍCULAS
 *
 * El motor de casi todas las auras y de la mitad de los fondos. Cada partícula
 * es determinista: su posición sale de `t` y de su índice, nunca de un estado
 * acumulado. Así un fotograma perdido no descoloca nada, y `quieto` puede pedir
 * el instante que quiera.
 * ------------------------------------------------------------------------ */
export function campo(g, { n, t, w, h, calidad, semilla, quieto, dibujar,
                           vida = 1, subir = 0, lado = 0, vaga = 0 }) {
  const az = dados(semilla);
  const cuantas = Math.max(2, Math.round(n * calidad));
  for (let i = 0; i < cuantas; i++) {
    const rx = az(), ry = az(), rv = az(), rd = az(), rr = az();
    const dur = mez(0.7, 1.4, rv) * vida;
    const k = quieto ? mez(0.2, 0.85, rd) : ciclo(t / dur + rd);
    const x0 = rx * w;
    const y0 = ry * h;
    const x = x0 + lado * k * w + (vaga ? Math.sin((t * 0.23 + rr) * TAU) * vaga : 0);
    const y = y0 - subir * k * h;
    // Aparece y se apaga: una partícula que nace y muere de golpe se ve.
    const a = Math.min(1, k / 0.14) * Math.min(1, (1 - k) / 0.2);
    dibujar(g, {
      x: ((x % w) + w) % w, y: ((y % h) + h) % h,
      k, a: quieto ? 0.85 : a, i, r: [rx, ry, rv, rd, rr],
    });
  }
}

/* ==========================================================================
 * LOS MARCOS
 *
 * El lienzo es cuadrado y la foto ocupa el círculo central de radio `RFOTO`.
 * Todo lo que se dibuje dentro de ese círculo tapa la cara, así que el marco
 * vive en la corona de RFOTO a 0,5 — salvo cuando la pieza es a propósito otra
 * cosa (el Sol negro, que se pone DETRÁS).
 * ======================================================================== */
const MARCOS = {};

/** El aro base: casi todos los marcos lo quieren debajo. */
function aro(g, c, r, gr, ancho, color, alfa = 1) {
  g.beginPath();
  g.arc(c, c, r * gr, 0, TAU);
  g.lineWidth = ancho * gr;
  g.strokeStyle = typeof color === 'string' ? rgba(color, alfa) : color;
  g.stroke();
}

MARCOS.venda = (g, e, p) => {
  const gr = e.w, c = gr / 2, r = RFOTO + 0.045;
  // Ocho vueltas de esparadrapo: cada una girada y con su solape. Lo que dice
  // «esto está enrollado a mano» es el solape, no el círculo.
  for (let i = 0; i < 8; i++) {
    const a0 = (i / 8) * TAU + Math.sin(e.t * 0.2) * 0.02;
    g.beginPath();
    g.arc(c, c, r * gr, a0, a0 + 0.86);
    g.lineWidth = (0.072 - (i % 3) * 0.006) * gr;
    g.strokeStyle = i % 2 ? '#e4dccb' : '#f1ece0';
    g.stroke();
    g.lineWidth = 0.006 * gr;
    g.strokeStyle = rgba('#a89c85', 0.5);
    g.stroke();
  }
  // El cabo suelto, que se mece. Una venda perfecta no la ha puesto nadie.
  const bal = Math.sin(e.t * 0.55 * TAU) * 0.16;
  g.save();
  g.translate(c, c);
  g.rotate(-2.2 + bal * 0.3);
  g.beginPath();
  g.moveTo(0, -r * gr);
  g.quadraticCurveTo(0.10 * gr, -(r + 0.10) * gr, 0.05 * gr + bal * 0.05 * gr, -(r + 0.20) * gr);
  g.lineWidth = 0.062 * gr;
  g.strokeStyle = '#f1ece0';
  g.lineCap = 'round';
  g.stroke();
  g.restore();
};

MARCOS.tiza = (g, e, p) => {
  const gr = e.w, c = gr / 2, r = (RFOTO + 0.05) * gr;
  // Lo que deja una mano llena de magnesio al agarrar la barra: trazos sueltos
  // que NO cierran el círculo, y el borde roto — el polvo no tiene contorno.
  // Antes lo rompía un `feTurbulence`; ahora son trazos cortos superpuestos,
  // que es más barato y se lee mejor.
  const az = dados(e.semilla);
  g.lineCap = 'round';
  for (let i = 0; i < 11; i++) {
    const a0 = az() * TAU, largo = mez(0.28, 1.1, az());
    g.beginPath();
    g.arc(c, c, r * mez(0.95, 1.1, az()), a0, a0 + largo);
    g.lineWidth = mez(0.014, 0.055, az()) * gr;
    g.strokeStyle = rgba('#f2f6fb', mez(0.28, 0.9, az()));
    g.stroke();
  }
  // Las cuatro marcas de dedos: cortas, paralelas y arriba a la derecha, que es
  // por donde agarra una mano. Sin esto son rayas y podrían ser cualquier cosa.
  g.save(); g.translate(c, c); g.rotate(-0.7);
  for (let i = 0; i < 4; i++) {
    const y = (-0.44 + i * 0.055) * gr;
    g.beginPath();
    g.moveTo(-0.055 * gr, y);
    g.quadraticCurveTo(0.02 * gr, y - 0.02 * gr, 0.075 * gr, y);
    g.lineWidth = 0.026 * gr;
    g.strokeStyle = rgba('#ffffff', 0.75 - i * 0.1);
    g.stroke();
  }
  g.restore();
  conLuz(g, () => {
    campo(g, { n: 34, t: e.t, w: gr, h: gr, calidad: e.calidad, semilla: e.semilla + 0.2,
      quieto: e.quieto, vida: 5.5, subir: 0.22,
      dibujar: (gg, d) => {
        // Solo el polvo que anda por la corona: dentro de la foto molesta.
        const dx = d.x - c, dy = d.y - c;
        const dist = Math.hypot(dx, dy) / gr;
        if (dist < RFOTO * 0.95 || dist > 0.55) return;
        luz(gg, d.x, d.y, mez(0.012, 0.036, d.r[2]) * gr, '#ffffff', d.a * 0.55);
      } });
  });
};
MARCOS.cuerda = (g, e, p) => {
  const gr = e.w, c = gr / 2, r = (RFOTO + 0.055) * gr;
  // Una cuerda de batalla es una trenza: dos hebras que se cruzan. Con un solo
  // círculo grueso sale una rosquilla.
  for (const s of [1, -1]) {
    g.beginPath();
    for (let a = 0; a <= TAU + 0.1; a += 0.12) {
      const rr = r + Math.sin(a * 9 + s * 1.6 + (e.quieto ? 0 : e.t * 0.9)) * 0.022 * gr;
      const x = c + Math.cos(a) * rr, y = c + Math.sin(a) * rr;
      if (a === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.lineWidth = 0.052 * gr;
    g.strokeStyle = s > 0 ? tinte(p.c2, '#000000', 0.15) : p.c2;
    g.stroke();
  }
  // La onda que recorre la cuerda: es lo que hace una cuerda de batalla.
  conLuz(g, () => {
    const a = (e.quieto ? 0.3 : ciclo(e.t * 0.28)) * TAU;
    luz(g, c + Math.cos(a) * r, c + Math.sin(a) * r, 0.09 * gr, p.c1, 0.4);
  });
};

MARCOS.metro = (g, e, p) => {
  const gr = e.w, c = gr / 2, r = (RFOTO + 0.05) * gr;
  aro(g, c, RFOTO + 0.05, gr, 0.075, '#f5c53d');
  aro(g, c, RFOTO + 0.05, gr, 0.005, rgba('#7a5c00', 0.6));
  // Las marcas, corriendo: el metro se está sacando del carrete.
  const corre = e.quieto ? 0 : ciclo(e.t * 0.06) * TAU;
  g.strokeStyle = '#2b2205';
  for (let i = 0; i < 44; i++) {
    const a = (i / 44) * TAU + corre;
    const largo = i % 5 === 0 ? 0.045 : 0.024;
    g.beginPath();
    g.moveTo(c + Math.cos(a) * (r + 0.036 * gr), c + Math.sin(a) * (r + 0.036 * gr));
    g.lineTo(c + Math.cos(a) * (r + 0.036 * gr - largo * gr),
             c + Math.sin(a) * (r + 0.036 * gr - largo * gr));
    g.lineWidth = (i % 5 === 0 ? 0.008 : 0.005) * gr;
    g.stroke();
  }
};

MARCOS.discos = (g, e, p) => {
  const gr = e.w, c = gr / 2;
  // Cuatro discos de peso apoyados alrededor. Giran despacio: un disco quieto
  // es un adorno, uno que gira es un disco.
  const giro = e.quieto ? 0.2 : e.t * 0.09;
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + giro * TAU;
    const x = c + Math.cos(a) * 0.455 * gr, y = c + Math.sin(a) * 0.455 * gr;
    const rd = (i % 2 ? 0.085 : 0.105) * gr;
    const gg = g.createLinearGradient(x - rd, y - rd, x + rd, y + rd);
    gg.addColorStop(0, tinte(p.c1, '#ffffff', 0.25));
    gg.addColorStop(0.5, p.c2);
    gg.addColorStop(1, p.c3);
    g.fillStyle = gg;
    g.beginPath(); g.arc(x, y, rd, 0, TAU); g.fill();
    g.fillStyle = rgba('#0b0e14', 0.85);
    g.beginPath(); g.arc(x, y, rd * 0.32, 0, TAU); g.fill();
    g.strokeStyle = rgba('#ffffff', 0.22); g.lineWidth = 1;
    g.beginPath(); g.arc(x, y, rd * 0.72, 0, TAU); g.stroke();
  }
  aro(g, c, RFOTO + 0.03, gr, 0.02, p.c3, 0.9);
};

MARCOS.cadena = (g, e, p) => {
  const gr = e.w, c = gr / 2, r = (RFOTO + 0.042) * gr;
  // ESLABONES QUE SE TOCAN. Es la tercera versión y las dos anteriores fallaron
  // por lo mismo: pocos eslabones y finos. A 116 px eso se lee como una fila de
  // ceros. La cuenta es simple — la corona mide 2·π·r; con eslabones de alto
  // `2·ry` hacen falta al menos `2·π·r / (1,45·ry)` para que se solapen.
  const ry = 0.052 * gr;
  const n = Math.round((TAU * r) / (1.45 * ry));
  const giro = e.quieto ? 0 : e.t * 0.03;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + giro;
    const x = c + Math.cos(a) * r, y = c + Math.sin(a) * r;
    g.save(); g.translate(x, y); g.rotate(a + Math.PI / 2);
    // Los impares van de canto: eso es lo que hace una cadena y no una fila de
    // anillas iguales.
    if (i % 2) g.scale(0.30, 1);
    g.beginPath();
    g.ellipse(0, 0, ry * 0.62, ry, 0, 0, TAU);
    g.lineWidth = 0.024 * gr;
    g.strokeStyle = i % 2 ? tinte(p.c2, '#000000', 0.32) : p.c1;
    g.stroke();
    // El filo de luz de arriba: sin él el eslabón es un aro plano.
    g.beginPath();
    g.ellipse(0, 0, ry * 0.62, ry, 0, Math.PI * 1.12, Math.PI * 1.8);
    g.lineWidth = 0.008 * gr;
    g.strokeStyle = rgba('#ffffff', 0.45);
    g.stroke();
    g.restore();
  }
  // El mosquetón, arriba, meciéndose por su propio eje.
  const bal = Math.sin(e.t * 0.42 * TAU) * 0.1;
  g.save();
  g.translate(c, c - r - 0.05 * gr);
  g.rotate(bal);
  g.beginPath();
  g.ellipse(0, 0.02 * gr, 0.046 * gr, 0.072 * gr, 0, 0.55, TAU - 0.55);
  g.lineWidth = 0.024 * gr;
  g.strokeStyle = p.c1; g.lineCap = 'round';
  g.stroke();
  g.beginPath();
  g.moveTo(-0.032 * gr, -0.024 * gr); g.lineTo(0.036 * gr, 0.032 * gr);
  g.lineWidth = 0.014 * gr; g.strokeStyle = rgba(p.c1, 0.8); g.stroke();
  g.restore();
};
MARCOS.circuito = (g, e, p) => {
  const gr = e.w, c = gr / 2, r = (RFOTO + 0.055) * gr;
  const az = dados(e.semilla);
  // Pistas: tramos rectos con codos a 45°, que es como se dibuja una placa.
  g.lineCap = 'square'; g.lineJoin = 'miter';
  const pistas = [];
  for (let i = 0; i < 10; i++) {
    const a0 = (i / 10) * TAU + az() * 0.2;
    const rr = r * mez(0.93, 1.1, az());
    const largo = mez(0.35, 0.95, az());
    pistas.push({ a0, rr, largo });
    g.beginPath();
    g.arc(c, c, rr, a0, a0 + largo);
    g.lineWidth = 0.012 * gr;
    g.strokeStyle = rgba(p.c2, 0.85);
    g.stroke();
    // El pin del final: sin pines, son rayas.
    const ax = c + Math.cos(a0 + largo) * rr, ay = c + Math.sin(a0 + largo) * rr;
    g.fillStyle = rgba(p.c1, 0.9);
    g.fillRect(ax - 0.014 * gr, ay - 0.014 * gr, 0.028 * gr, 0.028 * gr);
  }
  // El pulso que recorre las pistas: es lo que hace que la placa esté ENCENDIDA.
  conLuz(g, () => {
    for (let i = 0; i < pistas.length; i++) {
      const pi = pistas[i];
      const k = e.quieto ? 0.5 : ciclo(e.t * 0.32 + i * 0.17);
      const a = pi.a0 + pi.largo * k;
      luz(g, c + Math.cos(a) * pi.rr, c + Math.sin(a) * pi.rr, 0.05 * gr, p.c1,
        0.75 * Math.min(1, k / 0.12) * Math.min(1, (1 - k) / 0.2));
    }
  });
};

MARCOS.laurel = (g, e, p) => {
  const gr = e.w, c = gr / 2, r = (RFOTO + 0.055) * gr;
  // Dos ramas que suben desde abajo y no se cierran arriba: una corona de
  // laurel cerrada es un aro, y el laurel se reconoce por el hueco.
  for (const s of [1, -1]) {
    g.beginPath();
    g.arc(c, c, r, Math.PI / 2 - 0.15, Math.PI / 2 + s * 2.5, s < 0);
    g.lineWidth = 0.016 * gr;
    g.strokeStyle = tinte(p.c3, p.c2, 0.4);
    g.stroke();
    for (let i = 0; i < 11; i++) {
      const k = i / 11;
      const a = Math.PI / 2 - 0.15 + s * k * 2.5;
      const mece = e.quieto ? 0 : Math.sin((e.t * 0.35 + i * 0.2) * TAU) * 0.09;
      g.save();
      g.translate(c + Math.cos(a) * r, c + Math.sin(a) * r);
      g.rotate(a + s * 1.2 + mece);
      const lg = mez(0.10, 0.055, Math.abs(k - 0.45) * 1.6) * gr;
      const gg = g.createLinearGradient(0, 0, lg, 0);
      gg.addColorStop(0, p.c3); gg.addColorStop(1, p.c1);
      g.fillStyle = gg;
      g.beginPath();
      g.moveTo(0, 0);
      g.quadraticCurveTo(lg * 0.5, -lg * 0.34, lg, 0);
      g.quadraticCurveTo(lg * 0.5, lg * 0.28, 0, 0);
      g.fill();
      g.restore();
    }
  }
};

MARCOS.forja = (g, e, p) => {
  const gr = e.w, c = gr / 2, r = (RFOTO + 0.05) * gr;
  // Un aro de metal fundido: el calor NO está repartido, va por manchas que se
  // mueven. Un anillo naranja uniforme es un donut.
  aro(g, c, RFOTO + 0.05, gr, 0.075, '#2a1408');
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * TAU;
    const cal = 0.35 + 0.65 * vaiven(e.quieto ? 0.3 + i * 0.07 : e.t * 0.23 + i * 0.11);
    g.beginPath();
    g.arc(c, c, r, a - 0.24, a + 0.24);
    g.lineWidth = 0.066 * gr;
    g.strokeStyle = rgba(tinte('#6b1e00', '#ffd76a', cal), 0.95);
    g.stroke();
  }
  conLuz(g, () => {
    // Ascuas que se sueltan del aro y suben. Sin ellas es un aro caliente y ya.
    campo(g, { n: 16, t: e.t, w: gr, h: gr, calidad: e.calidad, semilla: e.semilla,
      quieto: e.quieto, vida: 2.6,
      dibujar: (gg, d) => {
        const a = d.r[0] * TAU;
        const sube = d.k * 0.16 * gr;
        const x = c + Math.cos(a) * r, y = c + Math.sin(a) * r - sube;
        luz(gg, x, y, mez(0.014, 0.032, d.r[2]) * gr * (1 - d.k * 0.5),
          tinte('#ffd76a', '#ff5a00', d.r[3]), d.a * 0.9);
      } });
    // El resplandor general del aro, que es lo que lo hace metal FUNDIDO.
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU;
      luz(g, c + Math.cos(a) * r, c + Math.sin(a) * r, 0.13 * gr, '#ff7a08', 0.16);
    }
  });
};

MARCOS.alas = (g, e, p) => {
  const gr = e.w, c = gr / 2;
  // POLILLA. Dos alas GRANDES, una a cada lado, que ocupan casi todo el alto
  // del marco. Los dos intentos anteriores fallaron por lo mismo: alas
  // pequeñas pegadas a la foto se leen como orejas. Lo que hace que se
  // reconozca a 40 px es la silueta entera, y la silueta de una polilla es
  // triangular, con el borde festoneado y la mancha ocular arriba.
  //
  // Y NO TAPAN LA CARA: el borde interior del ala nace en `RFOTO`.
  const bat = e.quieto ? 0.88 : mez(0.62, 1, vaiven(e.t * 1.05));
  const x0 = RFOTO * gr * 0.92;
  for (const lado of [-1, 1]) {
    g.save();
    g.translate(c, c);
    g.scale(lado * bat, 1);
    const gg = g.createLinearGradient(x0, -0.3 * gr, 0.52 * gr, 0.28 * gr);
    gg.addColorStop(0, rgba(p.c3, 0.97));
    gg.addColorStop(0.45, rgba(p.c2, 0.95));
    gg.addColorStop(1, rgba(p.c1, 0.92));
    g.fillStyle = gg;
    // El contorno: sube hasta arriba, se abre, y el borde de abajo baja
    // festoneado hasta la punta de la cola.
    g.beginPath();
    g.moveTo(x0, -0.22 * gr);
    g.bezierCurveTo(0.28 * gr, -0.52 * gr, 0.52 * gr, -0.40 * gr, 0.50 * gr, -0.10 * gr);
    // el festón: cuatro ondas, que es lo que distingue una polilla de una hoja
    for (let i = 0; i < 4; i++) {
      const y0 = -0.10 * gr + i * 0.085 * gr;
      const y1 = y0 + 0.085 * gr;
      const xm = (0.50 - i * 0.075) * gr;
      g.quadraticCurveTo(xm + 0.045 * gr, (y0 + y1) / 2, xm - 0.03 * gr, y1);
    }
    g.quadraticCurveTo(0.16 * gr, 0.30 * gr, x0, 0.16 * gr);
    g.closePath();
    g.fill();
    g.strokeStyle = rgba(p.c3, 0.6); g.lineWidth = 1; g.stroke();
    // Las venas: tres, saliendo del pliegue. Sin ellas el ala es una mancha.
    g.strokeStyle = rgba(p.c3, 0.35); g.lineWidth = 0.008 * gr;
    for (let i = 0; i < 3; i++) {
      g.beginPath();
      g.moveTo(x0 + 0.01 * gr, -0.16 * gr + i * 0.12 * gr);
      g.quadraticCurveTo(0.32 * gr, -0.20 * gr + i * 0.16 * gr,
                         0.46 * gr, -0.24 * gr + i * 0.20 * gr);
      g.stroke();
    }
    // La mancha ocular.
    g.fillStyle = rgba('#1a1008', 0.85);
    g.beginPath();
    g.ellipse(0.36 * gr, -0.20 * gr, 0.055 * gr, 0.042 * gr, -0.3, 0, TAU);
    g.fill();
    g.fillStyle = rgba(p.c1, 0.95);
    g.beginPath(); g.arc(0.36 * gr, -0.20 * gr, 0.018 * gr, 0, TAU); g.fill();
    // La antena.
    g.strokeStyle = rgba(p.c2, 0.85); g.lineWidth = 0.011 * gr; g.lineCap = 'round';
    g.beginPath();
    g.moveTo(0.10 * gr, -RFOTO * gr * 0.96);
    g.quadraticCurveTo(0.22 * gr, -0.50 * gr, 0.30 * gr, -0.455 * gr);
    g.stroke();
    g.restore();
  }
};
MARCOS.rayos = (g, e, p) => {
  const gr = e.w, c = gr / 2, r = (RFOTO + 0.045) * gr;
  // El aro base es un anillo de carga que SIEMPRE se ve: si lo único que hay
  // son destellos y el destello dura el 16 % del tiempo, la pieza está vacía
  // cinco de cada seis fotogramas — que es como estaba.
  conLuz(g, () => {
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * TAU;
      const lat = 0.35 + 0.65 * vaiven((e.quieto ? 0.4 : e.t * 0.5) + i * 0.09);
      luz(g, c + Math.cos(a) * r, c + Math.sin(a) * r, 0.05 * gr, p.c2, 0.28 * lat);
    }
  });
  aro(g, c, RFOTO + 0.045, gr, 0.01, p.c2, 0.55);

  // Y encima, los arcos que saltan. Uno de cada tres, no uno de cada seis.
  const az = dados(e.semilla);
  for (let i = 0; i < 5; i++) {
    const a0 = az() * TAU;
    const largo = mez(0.6, 1.6, az());
    const fase = ciclo(e.t * 0.62 + i * 0.19);
    const enciende = e.quieto ? (i < 2 ? 1 : 0) : (fase < 0.13 ? 1 : (fase < 0.19 ? 0.4 : 0));
    if (!enciende) continue;
    g.beginPath();
    const pasos = 11;
    for (let k = 0; k <= pasos; k++) {
      const a = a0 + (k / pasos) * largo;
      const rr = r + (k === 0 || k === pasos ? 0 : (az() - 0.5) * 0.09 * gr);
      const x = c + Math.cos(a) * rr, y = c + Math.sin(a) * rr;
      if (k === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.lineWidth = 0.024 * gr; g.lineJoin = 'round'; g.lineCap = 'round';
    g.strokeStyle = rgba(p.c1, 0.95 * enciende);
    g.stroke();
    conLuz(g, () => {
      g.lineWidth = 0.009 * gr; g.strokeStyle = rgba('#ffffff', 0.95 * enciende); g.stroke();
    });
  }
};
MARCOS.serpiente = (g, e, p) => {
  const gr = e.w, c = gr / 2, r = (RFOTO + 0.055) * gr;
  // El cuerpo va perdiendo grosor hasta la cola, y la cabeza es un triángulo
  // romo con ojo. Un tubo del mismo grosor con dos puntos es un gusano.
  const desliza = e.quieto ? 0 : e.t * 0.12;
  const fin = TAU * 0.92;
  const pasos = 46;
  for (let k = pasos; k >= 0; k--) {
    const u = k / pasos;
    const a = desliza + u * fin;
    const rr = r + Math.sin(u * 7 + e.t * 0.5) * 0.016 * gr;
    const x = c + Math.cos(a) * rr, y = c + Math.sin(a) * rr;
    const grosor = mez(0.052, 0.008, u) * gr;
    g.beginPath(); g.arc(x, y, grosor, 0, TAU);
    g.fillStyle = k % 3 ? tinte(p.c3, p.c2, 0.35 + 0.4 * Math.sin(u * 22)) : p.c2;
    g.fill();
  }
  const ah = desliza;
  const hx = c + Math.cos(ah) * r, hy = c + Math.sin(ah) * r;
  g.save(); g.translate(hx, hy); g.rotate(ah + Math.PI / 2);
  g.fillStyle = tinte(p.c2, p.c1, 0.3);
  g.beginPath();
  g.moveTo(0, -0.075 * gr); g.lineTo(0.05 * gr, 0.035 * gr); g.lineTo(-0.05 * gr, 0.035 * gr);
  g.closePath(); g.fill();
  g.fillStyle = '#ffd23d';
  g.beginPath(); g.arc(-0.02 * gr, 0, 0.012 * gr, 0, TAU); g.fill();
  g.beginPath(); g.arc(0.02 * gr, 0, 0.012 * gr, 0, TAU); g.fill();
  // La lengua, que sale y entra: es lo que la hace serpiente de un vistazo.
  const fuera = e.quieto ? 1 : (ciclo(e.t * 0.5) < 0.22 ? 1 : 0);
  if (fuera) {
    g.strokeStyle = '#ff3b6b'; g.lineWidth = 0.008 * gr; g.lineCap = 'round';
    g.beginPath();
    g.moveTo(0, -0.075 * gr); g.lineTo(0, -0.115 * gr);
    g.moveTo(0, -0.115 * gr); g.lineTo(-0.018 * gr, -0.14 * gr);
    g.moveTo(0, -0.115 * gr); g.lineTo(0.018 * gr, -0.14 * gr);
    g.stroke();
  }
  g.restore();
};

MARCOS.ojo = (g, e, p) => {
  const gr = e.w, c = gr / 2;
  // TRES OJOS QUE DAN VUELTAS. Dibujo propio: no es la marca de nadie. Antes
  // eran tres arcos finos y no se reconocía nada; ahora cada hoja acaba en un
  // ojo de verdad —almendra, iris y pupila vertical— que es lo que hace que la
  // pieza se llame así y se entienda a 40 px.
  const giro = e.quieto ? 0.3 : e.t * 0.1;
  for (let i = 0; i < 3; i++) {
    const a = giro * TAU + (i / 3) * TAU;
    g.save(); g.translate(c, c); g.rotate(a);
    // La hoja: de la corona hacia fuera, adelgazando.
    const gg = g.createLinearGradient(0, -RFOTO * gr, 0, -0.5 * gr);
    gg.addColorStop(0, rgba(p.c1, 0.1)); gg.addColorStop(1, rgba(p.c1, 0.85));
    g.fillStyle = gg;
    g.beginPath();
    g.moveTo(-0.03 * gr, -(RFOTO + 0.01) * gr);
    g.quadraticCurveTo(0.09 * gr, -0.36 * gr, 0, -0.495 * gr);
    g.quadraticCurveTo(-0.09 * gr, -0.36 * gr, -0.03 * gr, -(RFOTO + 0.01) * gr);
    g.fill();
    // El ojo, en la punta.
    const oy = -0.435 * gr;
    g.fillStyle = rgba('#0a0f14', 0.92);
    g.beginPath();
    g.moveTo(-0.055 * gr, oy);
    g.quadraticCurveTo(0, oy - 0.038 * gr, 0.055 * gr, oy);
    g.quadraticCurveTo(0, oy + 0.038 * gr, -0.055 * gr, oy);
    g.fill();
    g.fillStyle = p.c1;
    g.beginPath(); g.arc(0, oy, 0.026 * gr, 0, TAU); g.fill();
    g.fillStyle = '#05080c';
    g.beginPath();
    g.ellipse(0, oy, 0.008 * gr, 0.022 * gr, 0, 0, TAU);
    g.fill();
    g.restore();
  }
  // El aro exterior punteado, girando al revés: dos sentidos = profundidad.
  g.save(); g.translate(c, c); g.rotate(-giro * TAU * 0.6);
  g.setLineDash([0.03 * gr, 0.05 * gr]);
  aro(g, 0, 0.487, gr, 0.009, p.c2, 0.6);
  g.setLineDash([]);
  g.restore();
  conLuz(g, () => {
    const lat = 0.5 + 0.5 * vaiven(e.quieto ? 0.5 : e.t * 0.3);
    for (let i = 0; i < 3; i++) {
      const a = giro * TAU + (i / 3) * TAU - Math.PI / 2;
      luz(g, c + Math.cos(a) * 0.435 * gr, c + Math.sin(a) * 0.435 * gr,
        0.075 * gr, p.c1, 0.32 * lat);
    }
  });
};
MARCOS.agujero = (g, e, p) => {
  const gr = e.w, c = gr / 2;
  // Horizonte de sucesos: el disco pasa por DELANTE abajo y por DETRÁS arriba,
  // y el arco de la lente lo levanta por encima. Un aro plano es un aro.
  const giro = e.quieto ? 0.25 : e.t * 0.08;
  const disco = (alfa) => {
    g.save(); g.translate(c, c); g.rotate(0.32);
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * TAU + giro * TAU * (1 + (i % 3) * 0.25);
      const rr = 0.47 * gr * mez(0.9, 1.02, (i % 4) / 4);
      g.beginPath();
      g.ellipse(0, 0, rr, rr * 0.30, 0, a, a + 0.34);
      g.lineWidth = 0.042 * gr;
      g.strokeStyle = rgba(tinte('#fff0c8', '#ff8a2a', (i % 5) / 5), alfa);
      g.stroke();
    }
    g.restore();
  };
  conLuz(g, () => {
    disco(0.42);
    // El arco de la lente: lo que sube el disco por encima de la esfera y hace
    // que se lea como un agujero y no como un plato.
    g.save(); g.translate(c, c);
    for (const s2 of [0, Math.PI]) {
      g.beginPath();
      g.arc(0, 0, RFOTO * gr * 1.16, s2 + 0.2, s2 + Math.PI - 0.2);
      g.lineWidth = 0.05 * gr;
      g.strokeStyle = rgba('#ffc078', 0.5);
      g.stroke();
    }
    g.restore();
    luz(g, c, c, 0.52 * gr, '#c96a1a', 0.16);
  });
  g.fillStyle = '#000000';
  g.beginPath(); g.arc(c, c, RFOTO * gr * 1.02, 0, TAU); g.fill();
  conLuz(g, () => {
    // El anillo de fotones: fino, brillante y JUSTO en el borde.
    g.beginPath(); g.arc(c, c, RFOTO * gr * 1.03, 0, TAU);
    g.lineWidth = 0.012 * gr; g.strokeStyle = rgba('#ffe9c0', 0.95); g.stroke();
    disco(0.9);
  });
};
MARCOS.solnegro = (g, e, p) => {
  const gr = e.w, c = gr / 2;
  // Corona de fuego NEGRO alrededor de la foto. Lo caliente es el filo; el
  // cuerpo se pierde con el fondo, que es exactamente lo que se busca.
  const n = 9;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + (e.quieto ? 0 : e.t * 0.05 * TAU);
    g.save(); g.translate(c, c); g.rotate(a);
    hoguera(g, { x: 0, base: -(RFOTO + 0.005) * gr, ancho: 0.075 * gr,
      alto: 0.115 * gr, t: e.t + i * 0.4, n: 3, negro: true,
      semilla: e.semilla + i * 0.13, calidad: e.calidad, quieto: e.quieto });
    g.restore();
  }
  conLuz(g, () => { aro(g, c, RFOTO + 0.008, gr, 0.01, '#ff2f57', 0.5); });
};

export { MARCOS };

/* ==========================================================================
 * LOS FONDOS
 *
 * Aquí el lienzo NO es cuadrado: en la tarjeta del perfil mide 520×120 y en el
 * azulejo de la colección 116×116. Una escena compuesta para un solo tamaño
 * sale al triple en el otro — es el fallo que tuvo el aura seis versiones. La
 * regla: **todo se compone contra `w` y `h`, y lo importante va en el MEDIO**,
 * que es lo único que se ve seguro cuando el hueco es más estrecho.
 * ======================================================================== */
const FONDOS = {};

/** El fondo liso de la colección, que va debajo de casi todas las escenas. */
function base(g, e, p, arriba, abajo) {
  const gg = g.createLinearGradient(0, 0, 0, e.h);
  gg.addColorStop(0, arriba || p.c3);
  gg.addColorStop(1, abajo || tinte(p.c3, '#000000', 0.45));
  g.fillStyle = gg;
  g.fillRect(0, 0, e.w, e.h);
}

/** Una viñeta: oscurece las esquinas para que el centro respire. */
function vineta(g, e, fuerza = 0.45) {
  const gg = g.createRadialGradient(e.w / 2, e.h / 2, Math.min(e.w, e.h) * 0.15,
                                    e.w / 2, e.h / 2, Math.max(e.w, e.h) * 0.75);
  gg.addColorStop(0, 'rgba(0,0,0,0)');
  gg.addColorStop(1, `rgba(0,0,0,${fuerza})`);
  g.fillStyle = gg;
  g.fillRect(0, 0, e.w, e.h);
}

FONDOS.carbon = (g, e, p) => {
  base(g, e, p, '#1b1f26', '#0d1116');
  // Tejido de fibra de carbono: cuadros de 2×2 con la trama girada. El brillo
  // lo da un barrido, no un filtro.
  const paso = Math.max(7, Math.min(e.w, e.h) * 0.085);
  g.lineWidth = Math.max(1, paso * 0.16);
  for (let y = 0; y < e.h + paso; y += paso) {
    for (let x = 0; x < e.w + paso; x += paso) {
      const par = ((x / paso | 0) + (y / paso | 0)) % 2 === 0;
      g.strokeStyle = par ? 'rgba(255,255,255,.07)' : 'rgba(255,255,255,.028)';
      g.beginPath();
      if (par) { g.moveTo(x, y); g.lineTo(x + paso, y + paso); }
      else { g.moveTo(x + paso, y); g.lineTo(x, y + paso); }
      g.stroke();
    }
  }
  const k = e.quieto ? 0.4 : ciclo(e.t * 0.12);
  const bx = mez(-0.3, 1.3, k) * e.w;
  const gg = g.createLinearGradient(bx - e.w * 0.3, 0, bx + e.w * 0.3, e.h);
  gg.addColorStop(0, 'rgba(255,255,255,0)');
  gg.addColorStop(0.5, 'rgba(255,255,255,.09)');
  gg.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gg; g.fillRect(0, 0, e.w, e.h);
};

FONDOS.rejilla = (g, e, p) => {
  base(g, e, p, '#232a33', '#12161c');
  // Rejilla metálica de vestuario, en perspectiva: las líneas horizontales se
  // juntan hacia arriba. Una cuadrícula plana es papel milimetrado.
  const filas = 9;
  g.strokeStyle = 'rgba(255,255,255,.12)';
  g.lineWidth = 1;
  for (let i = 0; i <= filas; i++) {
    const u = i / filas;
    const y = e.h * (u * u * 0.55 + u * 0.45);
    g.beginPath(); g.moveTo(0, y); g.lineTo(e.w, y); g.stroke();
  }
  const cols = Math.max(6, Math.round(e.w / (e.h * 0.16)));
  for (let i = 0; i <= cols; i++) {
    const x = (i / cols) * e.w;
    g.beginPath(); g.moveTo(x, 0); g.lineTo(x, e.h); g.stroke();
  }
  // La luz que cruza: es lo único que se mueve, y es suficiente.
  const k = e.quieto ? 0.35 : ciclo(e.t * 0.08);
  conLuz(g, () => { luz(g, mez(-0.2, 1.2, k) * e.w, e.h * 0.3, e.h * 0.7, p.c1, 0.16); });
  vineta(g, e, 0.5);
};

FONDOS.taquilla = (g, e, p) => {
  base(g, e, p, '#2b333d', '#161b21');
  // Taquillas: puertas con rejilla de ventilación y su tirador.
  const ancho = Math.max(30, e.h * 0.62);
  for (let x = 0; x < e.w + ancho; x += ancho) {
    g.fillStyle = 'rgba(255,255,255,.045)';
    g.fillRect(x + 2, 0, ancho - 4, e.h);
    g.strokeStyle = 'rgba(0,0,0,.45)'; g.lineWidth = 2;
    g.strokeRect(x + 2, 0, ancho - 4, e.h);
    g.fillStyle = 'rgba(0,0,0,.35)';
    for (let i = 0; i < 4; i++) {
      g.fillRect(x + ancho * 0.22, e.h * (0.14 + i * 0.055), ancho * 0.56, e.h * 0.022);
    }
    g.fillStyle = 'rgba(255,255,255,.22)';
    g.fillRect(x + ancho * 0.74, e.h * 0.46, ancho * 0.09, e.h * 0.16);
  }
  const k = e.quieto ? 0.3 : ciclo(e.t * 0.05);
  conLuz(g, () => { luz(g, mez(-0.1, 1.1, k) * e.w, e.h * 0.1, e.h * 0.9, '#cfe0ff', 0.1); });
  vineta(g, e, 0.55);
};

FONDOS.polvo = (g, e, p) => {
  base(g, e, p, '#3a4049', '#1c2026');
  // Nube de magnesio: muchos halos blancos, grandes y muy transparentes, en
  // tres planos. La suavidad sale de superponerlos, no de un desenfoque.
  conLuz(g, () => {
    campo(g, { n: 34, t: e.t, w: e.w, h: e.h, calidad: e.calidad, semilla: e.semilla,
      quieto: e.quieto, vida: 9, subir: 0.35, vaga: e.w * 0.03,
      dibujar: (gg, d) => {
        luz(gg, d.x, d.y, mez(0.06, 0.24, d.r[2]) * e.h * 1.6, '#ffffff', d.a * 0.10);
      } });
    campo(g, { n: 22, t: e.t, w: e.w, h: e.h, calidad: e.calidad, semilla: e.semilla + 0.4,
      quieto: e.quieto, vida: 5, subir: 0.5,
      dibujar: (gg, d) => {
        luz(gg, d.x, d.y, mez(0.008, 0.022, d.r[2]) * e.h * 2, '#ffffff', d.a * 0.5);
      } });
  });
};

FONDOS.amanecer = (g, e, p) => {
  const gg = g.createLinearGradient(0, 0, 0, e.h);
  gg.addColorStop(0, '#132033'); gg.addColorStop(0.45, '#3b3352');
  gg.addColorStop(0.75, '#a15a4e'); gg.addColorStop(1, '#e08b4a');
  g.fillStyle = gg; g.fillRect(0, 0, e.w, e.h);
  // El sol, bajo y a la izquierda del centro, y los rayos saliendo de ÉL.
  const sx = e.w * 0.38, sy = e.h * 0.74;
  conLuz(g, () => {
    luz(g, sx, sy, e.h * 0.9, '#ffcf7a', 0.5);
    luz(g, sx, sy, e.h * 0.34, '#fff0c0', 0.85);
    const giro = e.quieto ? 0 : e.t * 0.04;
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU + giro;
      const largo = e.h * mez(0.7, 1.5, vaiven(e.t * 0.15 + i * 0.2));
      estela(g, sx + Math.cos(a) * largo * 0.4, sy + Math.sin(a) * largo * 0.4,
        e.h * 0.06, a, 5, '#ffd89a', 0.13);
    }
  });
  // Dos cordilleras: la de delante más oscura. Sin dos planos no hay distancia.
  for (const [alt, col, des] of [[0.62, '#241d33', 0], [0.78, '#12101c', 1.7]]) {
    g.beginPath(); g.moveTo(0, e.h);
    for (let x = 0; x <= e.w; x += Math.max(4, e.w / 30)) {
      const u = x / e.w;
      const y = e.h * alt - Math.sin(u * 7 + des) * e.h * 0.09 - Math.sin(u * 17 + des) * e.h * 0.035;
      g.lineTo(x, y);
    }
    g.lineTo(e.w, e.h); g.closePath();
    g.fillStyle = col; g.fill();
  }
};

FONDOS.lluvia = (g, e, p) => {
  base(g, e, p, '#1a2230', '#0b1018');
  // Dos planos de lluvia: la de lejos, fina y lenta; la de cerca, gorda y
  // rápida. Con un solo plano la lluvia es una trama.
  const raya = (n, vel, largo, ancho, alfa, sem) => {
    const az = dados(sem);
    const cuantas = Math.max(4, Math.round(n * e.calidad));
    g.lineCap = 'round';
    for (let i = 0; i < cuantas; i++) {
      const x = az() * e.w * 1.2 - e.w * 0.1;
      const d = az();
      const k = e.quieto ? d : ciclo(e.t * vel + d);
      const y = k * (e.h + largo) - largo;
      g.beginPath();
      g.moveTo(x, y); g.lineTo(x - largo * 0.18, y + largo);
      g.lineWidth = ancho; g.strokeStyle = rgba('#bcd6ff', alfa);
      g.stroke();
    }
  };
  raya(30, 0.55, e.h * 0.22, 1, 0.22, e.semilla);
  raya(16, 1.05, e.h * 0.34, 1.8, 0.4, e.semilla + 0.3);
  // Gotas pegadas al cristal, que es lo que da la sensación de ventana.
  conLuz(g, () => {
    campo(g, { n: 10, t: e.t, w: e.w, h: e.h, calidad: e.calidad, semilla: e.semilla + 0.7,
      quieto: e.quieto, vida: 7,
      dibujar: (gg, d) => { luz(gg, d.x, d.y, e.h * mez(0.02, 0.05, d.r[2]), '#dbe9ff', d.a * 0.3); } });
  });
  vineta(g, e, 0.5);
};

FONDOS.sala = (g, e, p) => {
  base(g, e, p, '#242b34', '#0e1217');
  const suelo = e.h * 0.78;
  g.fillStyle = '#161b22'; g.fillRect(0, suelo, e.w, e.h - suelo);
  // La silueta de una sala: jaula, barra, banco, mancuernas. Todo en negativo,
  // que es lo que la hace leerse a 116 px.
  g.fillStyle = '#0a0d12';
  const u = e.h;
  const jaula = e.w * 0.16;
  g.fillRect(jaula, suelo - u * 0.56, u * 0.045, u * 0.56);
  g.fillRect(jaula + u * 0.42, suelo - u * 0.56, u * 0.045, u * 0.56);
  g.fillRect(jaula, suelo - u * 0.58, u * 0.465, u * 0.035);
  g.fillRect(jaula + u * 0.03, suelo - u * 0.34, u * 0.41, u * 0.022);
  for (const d of [-1, 1]) {
    g.beginPath();
    g.arc(jaula + u * 0.225 + d * u * 0.20, suelo - u * 0.33, u * 0.07, 0, TAU);
    g.fill();
  }
  const banco = e.w * 0.62;
  g.fillRect(banco, suelo - u * 0.2, u * 0.36, u * 0.045);
  g.fillRect(banco + u * 0.02, suelo - u * 0.16, u * 0.03, u * 0.16);
  g.fillRect(banco + u * 0.30, suelo - u * 0.16, u * 0.03, u * 0.16);
  // Los focos del techo, que laten muy despacio.
  conLuz(g, () => {
    for (let i = 0; i < 3; i++) {
      const x = e.w * (0.2 + i * 0.3);
      const lat = 0.7 + 0.3 * vaiven(e.quieto ? 0.5 : e.t * 0.13 + i * 0.4);
      luz(g, x, -u * 0.05, u * 0.55, '#cfe4ff', 0.16 * lat);
    }
  });
  vineta(g, e, 0.55);
};

FONDOS.aurora = (g, e, p) => {
  base(g, e, p, '#050c18', '#0b1a20');
  // Estrellas quietas detrás. La aurora sin cielo es una cinta de colores.
  const az = dados(e.semilla + 0.9);
  for (let i = 0; i < 40; i++) {
    const x = az() * e.w, y = az() * e.h * 0.8, r = az() * 1.2 + 0.3;
    g.fillStyle = rgba('#ffffff', 0.15 + az() * 0.4);
    g.fillRect(x, y, r, r);
  }
  // Las cortinas: franjas verticales de altura variable con degradado hacia
  // arriba. Lo que las hace aurora es que ondulan a distinta velocidad.
  conLuz(g, () => {
    for (let c = 0; c < 3; c++) {
      const col = [p.c2, p.c1, '#7df9d0'][c];
      const vel = [0.09, 0.13, 0.07][c];
      const paso = Math.max(4, e.w / 44);
      for (let x = -paso; x < e.w + paso; x += paso) {
        const u = x / e.w;
        const fase = e.quieto ? 0.3 : e.t * vel;
        const alto = e.h * (0.36 + 0.34 * Math.sin((u * 3.1 + fase + c * 1.7) * TAU)
                                 + 0.14 * Math.sin((u * 8.3 - fase * 1.7) * TAU));
        const base0 = e.h * (0.86 - c * 0.06);
        const gg = g.createLinearGradient(0, base0 - alto, 0, base0);
        gg.addColorStop(0, rgba(col, 0));
        gg.addColorStop(0.55, rgba(col, 0.18));
        gg.addColorStop(1, rgba(col, 0.02));
        g.fillStyle = gg;
        g.fillRect(x, base0 - alto, paso * 1.05, alto);
      }
    }
  });
};

FONDOS.colada = (g, e, p) => {
  base(g, e, p, '#1a0a04', '#3a0f02');
  // Una colada: el chorro cae de arriba a la izquierda y se derrama. Lo que la
  // hace metal y no zumo es el brillo blanco del centro del chorro.
  const cx = e.w * 0.3;
  const gg = g.createLinearGradient(cx - e.h * 0.1, 0, cx + e.h * 0.1, 0);
  gg.addColorStop(0, rgba('#7a2f0c', 0.2));
  gg.addColorStop(0.42, rgba('#ff8a1a', 0.95));
  gg.addColorStop(0.5, rgba('#fff3c4', 1));
  gg.addColorStop(0.58, rgba('#ff8a1a', 0.95));
  gg.addColorStop(1, rgba('#7a2f0c', 0.2));
  g.fillStyle = gg;
  g.beginPath();
  g.moveTo(cx - e.h * 0.07, 0);
  for (let y = 0; y <= e.h; y += Math.max(3, e.h / 22)) {
    const on = Math.sin((y / e.h) * 6 + (e.quieto ? 0 : e.t * 2.2)) * e.h * 0.02;
    g.lineTo(cx - e.h * 0.07 + on, y);
  }
  g.lineTo(cx + e.h * 0.09, e.h); g.lineTo(cx + e.h * 0.09, 0);
  g.closePath(); g.fill();
  // El charco de abajo, que es de donde sale la luz de la escena.
  conLuz(g, () => {
    luz(g, cx, e.h * 1.02, e.h * 0.95, '#ff7a08', 0.5);
    luz(g, cx, e.h * 1.02, e.h * 0.45, '#ffd76a', 0.4);
    campo(g, { n: 26, t: e.t, w: e.w, h: e.h, calidad: e.calidad, semilla: e.semilla,
      quieto: e.quieto, vida: 2.4,
      dibujar: (gg2, d) => {
        // Las chispas salen del charco, no de cualquier sitio.
        const x = cx + (d.r[0] - 0.5) * e.w * 0.7 * d.k;
        const y = e.h * 0.95 - d.k * e.h * mez(0.5, 1.1, d.r[1]);
        luz(gg2, x, y, mez(0.008, 0.02, d.r[2]) * e.h * 2, '#ffd76a', d.a * 0.9);
      } });
  });
};

FONDOS.cumbre = (g, e, p) => {
  const gg = g.createLinearGradient(0, 0, 0, e.h);
  gg.addColorStop(0, '#0d1b2a'); gg.addColorStop(0.6, '#2c4a5e'); gg.addColorStop(1, '#7fa9b8');
  g.fillStyle = gg; g.fillRect(0, 0, e.w, e.h);
  // Tres crestas con niebla entre ellas: la niebla es lo que da la distancia.
  const cresta = (alt, col, pico, des) => {
    g.beginPath(); g.moveTo(-e.w * 0.1, e.h);
    for (let x = -e.w * 0.1; x <= e.w * 1.1; x += Math.max(4, e.w / 26)) {
      const u = (x / e.w) + des;
      const y = e.h * alt - Math.abs(Math.sin(u * pico)) * e.h * 0.30
                          - Math.abs(Math.sin(u * pico * 2.7)) * e.h * 0.09;
      g.lineTo(x, y);
    }
    g.lineTo(e.w * 1.1, e.h); g.closePath();
    g.fillStyle = col; g.fill();
  };
  cresta(0.66, '#4a6b7d', 2.1, 0.0);
  conLuz(g, () => {
    campo(g, { n: 12, t: e.t, w: e.w, h: e.h, calidad: e.calidad, semilla: e.semilla,
      quieto: e.quieto, vida: 16, lado: 0.5,
      dibujar: (g2, d) => {
        if (d.y < e.h * 0.5 || d.y > e.h * 0.82) return;
        luz(g2, d.x, d.y, e.h * mez(0.2, 0.5, d.r[2]), '#dff0f8', d.a * 0.12);
      } });
  });
  cresta(0.86, '#2a4152', 3.3, 1.4);
  cresta(1.02, '#16232e', 4.7, 2.9);
};

FONDOS.tormenta = (g, e, p) => {
  base(g, e, p, '#1a1f3a', '#06080f');
  // NUBARRONES QUE SE VEN SIEMPRE. Antes la pieza dependía del relámpago, que
  // dura el 5 % del tiempo: el otro 95 % era un degradado morado vacío. Ahora
  // la nube tiene masa y borde, y el rayo es lo que la enciende.
  const az = dados(e.semilla);
  const nubes = [];
  for (let i = 0; i < 16; i++) {
    nubes.push({ x: az() * e.w * 1.1 - e.w * 0.05,
                 y: e.h * (0.02 + az() * 0.46),
                 r: e.h * mez(0.22, 0.55, az()) });
  }
  const deriva = e.quieto ? 0 : e.t * 0.006;
  for (const n of nubes) {
    const x = n.x + Math.sin((deriva + n.r) * TAU) * e.w * 0.02;
    const gg = g.createRadialGradient(x, n.y, 0, x, n.y, n.r);
    gg.addColorStop(0, 'rgba(86,94,132,.95)');
    gg.addColorStop(0.55, 'rgba(54,60,92,.65)');
    gg.addColorStop(1, 'rgba(40,45,72,0)');
    g.fillStyle = gg;
    g.fillRect(x - n.r, n.y - n.r, n.r * 2, n.r * 2);
  }
  // La panza de la nube, más oscura, marca dónde acaba: sin ella la nube flota.
  const gg2 = g.createLinearGradient(0, e.h * 0.28, 0, e.h * 0.62);
  gg2.addColorStop(0, 'rgba(24,26,44,0)');
  gg2.addColorStop(1, 'rgba(10,11,22,.85)');
  g.fillStyle = gg2;
  g.fillRect(0, e.h * 0.28, e.w, e.h * 0.35);

  // El relámpago: cae de golpe, ilumina la nube entera y se va. Y no cae
  // siempre en el mismo sitio.
  const fase = e.quieto ? 0.02 : ciclo(e.t * 0.26);
  const brilla = fase < 0.045 ? 1 : (fase < 0.08 ? 0.4 : 0);
  if (brilla) {
    const az2 = dados(e.semilla + Math.floor(e.t * 0.26) * 0.017);
    const x0 = e.w * (0.15 + az2() * 0.7);
    conLuz(g, () => {
      luz(g, x0, e.h * 0.34, e.h * 1.4, '#9fb8ff', 0.34 * brilla);
      g.beginPath();
      let x = x0, y = e.h * 0.12;
      g.moveTo(x, y);
      while (y < e.h * 0.95) {
        x += (az2() - 0.5) * e.w * 0.14; y += e.h * (0.07 + az2() * 0.1);
        g.lineTo(x, y);
        if (az2() > 0.72) {                      // una rama, que es lo que hace rayo
          g.moveTo(x, y);
          g.lineTo(x + (az2() - 0.5) * e.w * 0.1, y + e.h * 0.1);
          g.moveTo(x, y);
        }
      }
      g.lineWidth = Math.max(1.6, e.h * 0.018); g.lineJoin = 'round'; g.lineCap = 'round';
      g.strokeStyle = rgba('#dce6ff', 0.95 * brilla); g.stroke();
      g.lineWidth = Math.max(0.8, e.h * 0.007);
      g.strokeStyle = rgba('#ffffff', brilla); g.stroke();
    });
  }
  vineta(g, e, 0.5);
};
FONDOS.nebulosa = (g, e, p) => {
  base(g, e, p, '#0a0618', '#150c2a');
  const az = dados(e.semilla);
  // Las nubes: halos gordos de tres colores, muy transparentes y superpuestos.
  conLuz(g, () => {
    for (let i = 0; i < 14; i++) {
      const x = az() * e.w, y = az() * e.h;
      const r = e.h * mez(0.35, 1.0, az());
      const col = [p.c2, '#c39bff', '#ff9ad5'][i % 3];
      const deriva = e.quieto ? 0 : Math.sin((e.t * 0.03 + i * 0.4) * TAU) * e.w * 0.03;
      luz(g, x + deriva, y, r, col, 0.075);
    }
    // Estrellas en dos planos, y las de delante titilan.
    for (let i = 0; i < 60; i++) {
      const x = az() * e.w, y = az() * e.h, r = mez(0.5, 1.8, az());
      const tit = i % 4 === 0 && !e.quieto
        ? 0.35 + 0.65 * vaiven(e.t * 0.4 + i * 0.13) : 0.8;
      luz(g, x, y, r * 2.2, '#ffffff', 0.55 * tit);
    }
  });
};

FONDOS.agujero = (g, e, p) => {
  // GARGANTUA. Carlos: *«que esté a la derecha (que sea un fondo) y que haya
  // movimiento de materia y luz alrededor»*. Lo que da la escala es que el
  // disco CRUZA el encuadre en diagonal y se sale por la izquierda: un aro
  // centrado es un donut.
  base(g, e, p, '#04060c', '#01020a');
  const cx = e.w * 0.72, cy = e.h * 0.5;
  const R = Math.min(e.h * 0.42, e.w * 0.3);
  const giro = e.quieto ? 0.2 : e.t * 0.05;

  // La materia: hebras que corren por la órbita, cada una a su velocidad.
  const orbita = (ry, alfa, atras) => {
    g.save(); g.translate(cx, cy); g.rotate(-0.42);
    for (let i = 0; i < 9; i++) {
      const vel = 0.10 + (i % 4) * 0.05;
      const a0 = (i / 9) * TAU + (e.quieto ? 0 : e.t * vel) * TAU;
      const rr = R * mez(1.35, 3.4, (i % 5) / 5);
      g.beginPath();
      g.ellipse(0, 0, rr, rr * ry, 0, a0, a0 + mez(0.5, 1.5, (i % 3) / 3));
      g.lineWidth = Math.max(1, R * mez(0.05, 0.13, (i % 4) / 4));
      g.strokeStyle = rgba(tinte('#ffd9a0', '#ff7a2a', (i % 5) / 5), alfa);
      g.stroke();
    }
    g.restore();
  };
  conLuz(g, () => {
    orbita(0.16, 0.35, true);
    // El arco de la lente: lo que sube el disco por encima de la esfera.
    g.save(); g.translate(cx, cy); g.rotate(-0.42);
    for (const s of [-1, 1]) {
      g.beginPath();
      g.ellipse(0, 0, R * 1.42, R * 1.42, 0, s > 0 ? Math.PI : 0, s > 0 ? TAU : Math.PI);
      g.lineWidth = Math.max(1.5, R * 0.1);
      g.strokeStyle = rgba('#ffc078', 0.4);
      g.stroke();
    }
    g.restore();
    luz(g, cx, cy, R * 3.2, '#c96a1a', 0.13);
  });
  // La esfera, en negro puro. Es lo que hace que lo de alrededor brille.
  g.fillStyle = '#000000';
  g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.fill();
  conLuz(g, () => {
    aro(g, 0, R / e.w * 1.02, e.w, 0.004, '#ffe9c0', 0.9);   // marcador de escala
    g.beginPath(); g.arc(cx, cy, R * 1.02, 0, TAU);
    g.lineWidth = Math.max(1, R * 0.022); g.strokeStyle = rgba('#ffe9c0', 0.85); g.stroke();
    orbita(0.16, 0.75, false);
  });
};

FONDOS.cromo = (g, e, p) => {
  base(g, e, p, '#0e1420', '#060a12');
  // Cromo líquido: bandas claras y oscuras que se desplazan a distinta
  // velocidad. El metal se reconoce por el CONTRASTE brusco, no por el gris.
  const n = 9;
  for (let i = 0; i < n; i++) {
    const u = i / n;
    const fase = e.quieto ? 0.3 : e.t * (0.05 + (i % 3) * 0.03);
    const y = e.h * (u + 0.06 * Math.sin((u * 4 + fase) * TAU));
    const alto = e.h * mez(0.06, 0.2, (i % 4) / 4);
    const gg = g.createLinearGradient(0, y, 0, y + alto);
    const claro = i % 2 === 0;
    gg.addColorStop(0, rgba(claro ? '#eafff8' : '#2a3648', 0));
    gg.addColorStop(0.5, rgba(claro ? '#eafff8' : '#2a3648', claro ? 0.5 : 0.8));
    gg.addColorStop(1, rgba(claro ? '#8fd0ff' : '#0d1420', 0));
    g.fillStyle = gg;
    g.fillRect(0, y, e.w, alto);
  }
  // El destello que cruza: es lo que dice «esto está PULIDO».
  const k = e.quieto ? 0.5 : ciclo(e.t * 0.14);
  conLuz(g, () => {
    estela(g, mez(-0.2, 1.2, k) * e.w, e.h * 0.5, e.h * 0.55, 1.15, 0.5, '#ffffff', 0.35);
  });
};

FONDOS.solnegro = (g, e, p) => {
  // El sol negro: eclipse con corona de fuego negro. Lo que se ve es el FILO.
  base(g, e, p, '#170209', '#08000a');
  const cx = e.w * 0.5, cy = e.h * 0.52;
  const R = Math.min(e.h * 0.34, e.w * 0.26);
  conLuz(g, () => { luz(g, cx, cy, R * 3.4, '#8c0026', 0.30); });
  const n = 12;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + (e.quieto ? 0 : e.t * 0.035 * TAU);
    g.save(); g.translate(cx, cy); g.rotate(a);
    hoguera(g, { x: 0, base: -R * 1.02, ancho: R * 0.4, alto: R * mez(0.7, 1.25, ((i * 7) % 5) / 5),
      t: e.t + i * 0.37, n: 4, negro: true, semilla: e.semilla + i * 0.09,
      calidad: e.calidad, quieto: e.quieto });
    g.restore();
  }
  g.fillStyle = '#000000';
  g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.fill();
  conLuz(g, () => {
    g.beginPath(); g.arc(cx, cy, R * 1.01, 0, TAU);
    g.lineWidth = Math.max(1, R * 0.03);
    g.strokeStyle = rgba('#ff2f57', 0.55 + 0.35 * vaiven(e.quieto ? 0.5 : e.t * 0.35));
    g.stroke();
  });
};

FONDOS.cero = (g, e, p) => {
  // EL CERO. Se imita el LENGUAJE visual —punto de luz concentrado y espirales
  // que giran—, que está en cien sitios. NO se dibuja nada que identifique a
  // ningún personaje: sin máscara, sin cara, sin marcas.
  base(g, e, p, '#0b0512', '#1a0410');
  const cx = e.w * 0.5, cy = e.h * 0.56;
  const R = Math.min(e.h * 0.3, e.w * 0.22);
  // La silueta, a contraluz y SIN cara: es lo que la deja siendo cualquiera.
  g.fillStyle = 'rgba(0,0,0,.92)';
  g.beginPath();
  g.ellipse(cx, cy + R * 1.5, R * 0.4, R * 0.62, 0, Math.PI, TAU);
  g.fill();
  g.beginPath(); g.arc(cx, cy + R * 0.92, R * 0.2, 0, TAU); g.fill();
  // Las dos coronas, girando en sentidos contrarios y a ritmos que no casan.
  conLuz(g, () => {
    luz(g, cx, cy, R * 2.8, '#ff2d6a', 0.24);
    for (const [s, vel, m, col] of [[1, 0.22, 9, '#ff6a8a'], [-1, 0.15, 7, '#ffd0dd']]) {
      for (let i = 0; i < m; i++) {
        const a = (i / m) * TAU + s * (e.quieto ? 0.2 : e.t * vel) * TAU;
        g.save(); g.translate(cx, cy); g.rotate(a);
        const gg = g.createLinearGradient(0, -R * 0.8, 0, -R * 1.9);
        gg.addColorStop(0, rgba(col, 0.9)); gg.addColorStop(1, rgba(col, 0));
        g.fillStyle = gg;
        lengua(g, 0, -R * 0.8, R * 0.16, R * 1.1, 0.2 * s, 0.4);
        g.fill();
        g.restore();
      }
    }
    luz(g, cx, cy, R * 0.9, '#ffffff', 0.95);
    luz(g, cx, cy, R * 1.7, '#ff9ab5', 0.5);
  });
};

export { FONDOS };

/* ==========================================================================
 * LAS AURAS
 *
 * Van ENCIMA de todo, en la misma caja que el fondo. Tienen que ser escasas: un
 * aura que tapa la cara no es un aura, es una cortina. La regla de composición
 * es la contraria a la del fondo — lo importante va en los BORDES y el centro
 * se deja respirar.
 * ======================================================================== */
const AURAS = {};

AURAS.motas = (g, e, p) => {
  conLuz(g, () => {
    campo(g, { n: 30, t: e.t, w: e.w, h: e.h, calidad: e.calidad, semilla: e.semilla,
      quieto: e.quieto, vida: 6, subir: 0.55, vaga: e.w * 0.02,
      dibujar: (gg, d) => {
        luz(gg, d.x, d.y, mez(0.006, 0.018, d.r[2]) * e.h * 2.4, '#ffffff', d.a * 0.55);
      } });
  });
};

AURAS.hojas = (g, e, p) => {
  // Una hoja que cae DA VUELTAS. Si solo baja, es confeti.
  campo(g, { n: 13, t: e.t, w: e.w, h: e.h, calidad: e.calidad, semilla: e.semilla,
    quieto: e.quieto, vida: 7,
    dibujar: (gg, d) => {
      const y = d.k * (e.h + e.h * 0.3) - e.h * 0.15;
      const x = d.x + Math.sin((d.k * 2 + d.r[3]) * TAU) * e.w * 0.05;
      const vuelta = e.quieto ? d.r[0] * 3 : (e.t * mez(0.5, 1.2, d.r[2]) + d.r[3] * 4);
      const s = Math.cos(vuelta * TAU);
      const lg = mez(0.055, 0.11, d.r[2]) * e.h;
      gg.save(); gg.translate(x, y); gg.rotate(vuelta * 0.6); gg.scale(Math.abs(s) * 0.85 + 0.15, 1);
      gg.fillStyle = rgba(tinte(p.c2, p.c1, d.r[1]), d.a * 0.9);
      gg.beginPath();
      gg.moveTo(0, -lg); gg.quadraticCurveTo(lg * 0.7, 0, 0, lg);
      gg.quadraticCurveTo(-lg * 0.7, 0, 0, -lg);
      gg.fill();
      gg.strokeStyle = rgba(p.c3, d.a * 0.5); gg.lineWidth = 0.8;
      gg.beginPath(); gg.moveTo(0, -lg); gg.lineTo(0, lg); gg.stroke();
      gg.restore();
    } });
};

AURAS.luciernagas = (g, e, p) => {
  // Una luciérnaga no parpadea a ritmo: se enciende, se apaga y tarda en volver.
  conLuz(g, () => {
    campo(g, { n: 14, t: e.t, w: e.w, h: e.h, calidad: e.calidad, semilla: e.semilla,
      quieto: e.quieto, vida: 14,
      dibujar: (gg, d) => {
        const x = d.x + Math.sin((e.t * 0.11 + d.r[3] * 5) * TAU) * e.w * 0.06;
        const y = d.y + Math.cos((e.t * 0.08 + d.r[0] * 7) * TAU) * e.h * 0.14;
        const f = ciclo(e.t * mez(0.18, 0.32, d.r[2]) + d.r[3]);
        const enc = e.quieto ? 0.85 : (f < 0.22 ? Math.sin((f / 0.22) * Math.PI) : 0);
        if (enc <= 0.01) return;
        luz(gg, x, y, e.h * 0.055, '#d9ff8a', enc * 0.85);
        luz(gg, x, y, e.h * 0.016, '#ffffff', enc);
      } });
  });
};

AURAS.gotas = (g, e, p) => {
  // Goteras: la gota se alarga al caer, brilla y salpica al llegar abajo. Las
  // de antes eran once puntos de 1,4 px — invisibles.
  campo(g, { n: 16, t: e.t, w: e.w, h: e.h, calidad: e.calidad, semilla: e.semilla,
    quieto: e.quieto, vida: 2.4,
    dibujar: (gg, d) => {
      const k = d.k * d.k;                                // acelera al caer
      const y = k * e.h * 1.02;
      const est = 1 + k * 3.2;
      const rr = e.h * 0.022;
      gg.fillStyle = rgba('#cfe2ff', d.a * 0.9);
      gg.beginPath();
      gg.ellipse(d.x, y, rr, rr * est, 0, 0, TAU);
      gg.fill();
      // El filo de luz de la gota: es lo que la hace agua y no un punto azul.
      conLuz(gg, () => {
        luz(gg, d.x - rr * 0.3, y - rr * est * 0.3, rr * 1.1, '#ffffff', d.a * 0.5);
      });
      if (d.k > 0.88) {
        const u = (d.k - 0.88) / 0.12;
        gg.strokeStyle = rgba('#cfe2ff', (1 - u) * 0.6);
        gg.lineWidth = 1.4;
        gg.beginPath();
        gg.arc(d.x, e.h, e.h * 0.16 * u, Math.PI, TAU);
        gg.stroke();
      }
    } });
};
AURAS.mariposas = (g, e, p) => {
  // Cruzan de un lado a otro subiendo y bajando, y las alas baten a su ritmo.
  campo(g, { n: 6, t: e.t, w: e.w, h: e.h, calidad: e.calidad, semilla: e.semilla,
    quieto: e.quieto, vida: 11, lado: 1.25,
    dibujar: (gg, d) => {
      const x = -e.w * 0.12 + d.k * e.w * 1.24;
      const y = d.r[1] * e.h * 0.8 + Math.sin((d.k * 2.2 + d.r[3]) * TAU) * e.h * 0.18;
      const bat = e.quieto ? 0.7 : mez(0.15, 1, vaiven(e.t * mez(3.2, 4.6, d.r[2]) + d.r[3]));
      const s = mez(0.04, 0.075, d.r[2]) * e.h;
      gg.save(); gg.translate(x, y); gg.rotate(Math.sin((d.k * 2.2 + d.r[3]) * TAU) * 0.3);
      for (const lado of [-1, 1]) {
        gg.save(); gg.scale(lado * bat, 1);
        const grd = gg.createLinearGradient(0, 0, s * 1.6, 0);
        grd.addColorStop(0, rgba(p.c3, d.a * 0.95));
        grd.addColorStop(1, rgba(p.c1, d.a * 0.9));
        gg.fillStyle = grd;
        gg.beginPath();
        gg.moveTo(0, 0);
        gg.bezierCurveTo(s * 1.7, -s * 1.5, s * 1.8, s * 0.2, s * 0.5, s * 0.9);
        gg.quadraticCurveTo(s * 0.1, s * 0.4, 0, 0);
        gg.fill();
        gg.restore();
      }
      gg.fillStyle = rgba('#1a1420', d.a * 0.9);
      gg.fillRect(-s * 0.08, -s * 0.5, s * 0.16, s * 1.2);
      gg.restore();
    } });
};

AURAS.chispas = (g, e, p) => {
  // Chispas de soldadura: salen disparadas de un punto, dejan estela y REBOTAN
  // en el suelo. La estela es lo que las hace chispas y no confeti naranja.
  const ox = e.w * 0.5, oy = e.h * 0.94;
  conLuz(g, () => {
    campo(g, { n: 26, t: e.t, w: e.w, h: e.h, calidad: e.calidad, semilla: e.semilla,
      quieto: e.quieto, vida: 1.9,
      dibujar: (gg, d) => {
        const ang = mez(-2.9, -0.25, d.r[0]);
        const vel = mez(0.5, 1.25, d.r[1]) * e.h * 1.5;
        const k = d.k;
        let x = ox + Math.cos(ang) * vel * k;
        let y = oy + Math.sin(ang) * vel * k + 2.2 * e.h * k * k;
        if (y > e.h) y = e.h - (y - e.h) * 0.35;          // el rebote
        const dir = Math.atan2(Math.sin(ang) + 4.4 * k, Math.cos(ang));
        estela(gg, x, y, e.h * 0.022, dir, mez(1.4, 3.6, d.r[2]),
          tinte('#fff0bd', '#ff6a00', k), d.a * 0.95);
      } });
    luz(g, ox, oy, e.h * 0.3, '#ffb35a', 0.2);
  });
};

AURAS.llamas = (g, e, p) => {
  // Cinco hogueras a lo ancho del hueco, pegadas al suelo. Se componen contra
  // `w`: con un lienzo fijo, en la tarjeta de 520 caían fuera del recorte, que
  // es el fallo que tuvieron seis versiones.
  const n = e.w > e.h * 2 ? 5 : 3;
  for (let i = 0; i < n; i++) {
    const x = e.w * ((i + 0.5) / n);
    hoguera(g, { x, base: e.h * 1.02, ancho: e.w / n * 0.34,
      alto: e.h * mez(0.42, 0.72, ((i * 5) % 4) / 4),
      t: e.t + i * 0.53, n: 6, semilla: e.semilla + i * 0.17,
      calidad: e.calidad, quieto: e.quieto });
  }
};

AURAS.ascuas = (g, e, p) => {
  conLuz(g, () => {
    campo(g, { n: 26, t: e.t, w: e.w, h: e.h, calidad: e.calidad, semilla: e.semilla,
      quieto: e.quieto, vida: 3.6, subir: 1.15, vaga: e.w * 0.025,
      dibujar: (gg, d) => {
        const r = mez(0.008, 0.024, d.r[2]) * e.h * 2 * (1 - d.k * 0.45);
        luz(gg, d.x, d.y, r, tinte('#ffd76a', '#ff4a00', d.k), d.a * 0.9);
      } });
    luz(g, e.w * 0.5, e.h * 1.05, e.h * 0.7, '#ff6a10', 0.14);
  });
};

AURAS.petalos = (g, e, p) => {
  campo(g, { n: 15, t: e.t, w: e.w, h: e.h, calidad: e.calidad, semilla: e.semilla,
    quieto: e.quieto, vida: 6.5,
    dibujar: (gg, d) => {
      const y = d.k * (e.h * 1.3) - e.h * 0.15;
      const x = d.x + Math.sin((d.k * 1.6 + d.r[3]) * TAU) * e.w * 0.07;
      const giro = e.quieto ? d.r[0] * 4 : e.t * mez(0.6, 1.4, d.r[2]) + d.r[3] * 6;
      const s = mez(0.035, 0.065, d.r[2]) * e.h;
      gg.save(); gg.translate(x, y); gg.rotate(giro);
      gg.scale(1, Math.abs(Math.cos(giro * 1.7)) * 0.8 + 0.2);
      const grd = gg.createLinearGradient(0, -s, 0, s);
      grd.addColorStop(0, rgba('#ffd9e8', d.a * 0.95));
      grd.addColorStop(1, rgba('#ff8fb8', d.a * 0.8));
      gg.fillStyle = grd;
      gg.beginPath();
      gg.moveTo(0, -s);
      gg.bezierCurveTo(s * 1.1, -s * 0.4, s * 0.8, s * 0.8, 0, s);
      gg.bezierCurveTo(-s * 0.8, s * 0.8, -s * 1.1, -s * 0.4, 0, -s);
      gg.fill();
      gg.restore();
    } });
};

AURAS.estatica = (g, e, p) => {
  // Arcos que saltan entre dos puntos, a golpes. No hay curva suave: la
  // electricidad es una quebrada y aparece de golpe. Se reparten por TODO el
  // hueco y hay siempre al menos dos: antes salía uno y en el centro, y a eso
  // no se le puede llamar un aura.
  const cuantos = Math.max(3, Math.round(6 * e.calidad));
  conLuz(g, () => {
    for (let i = 0; i < cuantos; i++) {
      const fase = ciclo(e.quieto ? (i * 0.11) : (e.t * 1.9 + i * 0.37));
      const on = e.quieto ? i < 3 : fase < 0.34;
      if (!on) continue;
      // La semilla cambia por chispazo: si no, el mismo rayo parpadea siempre
      // en el mismo sitio y se ve el bucle a la primera.
      const az = dados(e.semilla + i * 0.13
        + Math.floor(e.quieto ? 0 : e.t * 1.9 + i * 0.37) * 0.0037);
      const x0 = az() * e.w, y0 = az() * e.h;
      const x1 = x0 + (az() - 0.5) * e.w * 0.42;
      const y1 = y0 + (az() - 0.5) * e.h * 0.8;
      g.beginPath(); g.moveTo(x0, y0);
      const pasos = 7;
      for (let k = 1; k <= pasos; k++) {
        const u = k / pasos;
        g.lineTo(mez(x0, x1, u) + (az() - 0.5) * e.h * 0.22,
                 mez(y0, y1, u) + (az() - 0.5) * e.h * 0.22);
      }
      const fuerza = e.quieto ? 0.9 : Math.min(1, (0.34 - fase) / 0.1);
      g.lineWidth = Math.max(1.6, e.h * 0.016); g.lineJoin = 'round'; g.lineCap = 'round';
      g.strokeStyle = rgba(p.c1, 0.75 * fuerza); g.stroke();
      g.lineWidth = Math.max(0.8, e.h * 0.006);
      g.strokeStyle = rgba('#ffffff', 0.95 * fuerza); g.stroke();
      luz(g, x1, y1, e.h * 0.11, p.c1, 0.45 * fuerza);
      luz(g, x0, y0, e.h * 0.06, '#ffffff', 0.35 * fuerza);
    }
  });
};
AURAS.cometas = (g, e, p) => {
  // Cruzan en diagonal con la cabeza brillante y la cola larga detrás. La cola
  // se estrecha hacia el final, que es lo que la hace cola y no raya.
  const iris = (p.iris && p.iris.length) ? p.iris : [p.c1, p.c2];
  campo(g, { n: 7, t: e.t, w: e.w, h: e.h, calidad: e.calidad, semilla: e.semilla,
    quieto: e.quieto, vida: 3.4,
    dibujar: (gg, d) => {
      const x = mez(e.w * 1.15, -e.w * 0.2, d.k);
      const y = mez(-e.h * 0.25, e.h * 1.2, d.k) * 0.6 + d.r[1] * e.h * 0.5;
      const col = iris[d.i % iris.length];
      const largo = e.h * mez(0.5, 1.1, d.r[2]);
      const grd = gg.createLinearGradient(x, y, x + largo, y - largo * 0.5);
      grd.addColorStop(0, rgba(col, d.a * 0.85));
      grd.addColorStop(1, rgba(col, 0));
      gg.strokeStyle = grd;
      gg.lineWidth = Math.max(1.2, e.h * 0.016); gg.lineCap = 'round';
      gg.beginPath(); gg.moveTo(x, y); gg.lineTo(x + largo, y - largo * 0.5); gg.stroke();
      conLuz(gg, () => {
        luz(gg, x, y, e.h * 0.05, col, d.a * 0.9);
        luz(gg, x, y, e.h * 0.018, '#ffffff', d.a);
      });
    } });
};

export { AURAS };

/* ==========================================================================
 * EL REGISTRO
 *
 * `pintor()` devuelve la función que le toca a una pieza, ya con su paleta
 * dentro. Si la pieza no tiene dibujo (o llega un id que no existe), devuelve
 * `null` y el motor no monta nada: un hueco vacío es mejor que una excepción
 * en mitad del bucle.
 * ======================================================================== */
export const FAMILIAS_CON_ARTE = { marco: MARCOS, fondo: FONDOS, aura: AURAS };

export function pintor(familia, tipo, paleta) {
  const tabla = FAMILIAS_CON_ARTE[familia];
  const fn = tabla && tabla[tipo];
  if (!fn) return null;
  const p = paleta || { c1: '#d7e2f0', c2: '#8894a6', c3: '#2c333d' };
  return (g, e) => fn(g, e, p);
}

/** Cuántas piezas tienen dibujo. Lo usa el test del catálogo. */
export function cuantasPiezas() {
  return Object.keys(MARCOS).length + Object.keys(FONDOS).length + Object.keys(AURAS).length;
}
