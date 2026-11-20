/* =============================================================================
 * temas.js — El estudio de temas: colores, formas y tamaño de letra.
 *
 * Carlos, 29-ago-2026: *«en el color personalizado, añade una opción de
 * personalización más amplia y más controlable para el usuario con la opción de
 * poder importar y exportar las diferentes personalizaciones»*.
 *
 * QUÉ SE PUEDE TOCAR, Y POR QUÉ SOLO ESO
 * --------------------------------------
 *   · acento      — el color de la app (botones, cifras, la pestaña activa)
 *   · base        — oscuro o claro
 *   · intensidad  — cuánto se hunde el fondo, de gris carbón a casi negro
 *   · radio       — esquinas más o menos redondas
 *   · escala      — el tamaño de TODA la letra (Carlos ya pidió una vez que
 *                   fuese más grande; aquí lo decide él)
 *
 * Lo que NO se puede tocar, y no es negociable:
 *   · Los colores de los DATOS (`--serie-N`). Están elegidos con un validador
 *     de daltonismo y contraste. Si dos series no se distinguen, la gráfica se
 *     convierte en un adorno.
 *   · El contraste del texto. Las tintas salen de la base, no del capricho: un
 *     tema bonito que no se lee no es un tema, es un problema.
 *
 * LAS SUPERFICIES SE CALCULAN, NO SE ELIGEN
 * -----------------------------------------
 * De un solo color salen las cinco superficies, tomando su TONO y bajándole la
 * saturación al 6-9 %. Es lo que hace que un tema morado no parezca «gris con
 * botones morados», sino morado entero. Elegir siete colores a mano es pedirle
 * a alguien que haga de diseñador para poder usar la app.
 *
 * Aritmética pura: se prueba con `node`, sin navegador.
 * ========================================================================== */

/* --------------------------------------------------------------------------
 * COLOR
 * ------------------------------------------------------------------------ */
export function aHsl(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
  if (!m) return { h: 0, s: 0, l: 50 };
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  return { h: h * 360, s: s * 100, l: l * 100 };
}

export function aHex({ h, s, l }) {
  const S = Math.max(0, Math.min(100, s)) / 100;
  const L = Math.max(0, Math.min(100, l)) / 100;
  const k = (n) => (n + h / 30) % 12;
  const a = S * Math.min(L, 1 - L);
  const f = (n) => {
    const v = L - a * Math.max(-1, Math.min(Math.min(k(n) - 3, 9 - k(n)), 1));
    return Math.round(255 * v).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/** Luminancia relativa (WCAG). Se calcula: elegir a ojo es cómo salen los botones ilegibles. */
export function luminancia(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
  if (!m) return 0;
  const n = parseInt(m[1], 16);
  const canal = (c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * canal((n >> 16) & 255) + 0.7152 * canal((n >> 8) & 255) + 0.0722 * canal(n & 255);
}

/** Cuánto contraste hay entre dos colores. 4,5 es el mínimo para leer texto. */
export function contraste(a, b) {
  const la = luminancia(a), lb = luminancia(b);
  return Math.round(((Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)) * 100) / 100;
}

export function rgba(hex, alfa) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
  if (!m) return `rgba(210,250,85,${alfa})`;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alfa})`;
}

/** La tinta que se lee encima de un color: la que MÁS contraste da, medido. */
export function tintaSobre(hex) {
  return contraste(hex, '#0b1002') >= contraste(hex, '#ffffff') ? '#0b1002' : '#ffffff';
}

/* --------------------------------------------------------------------------
 * EL TEMA
 * ------------------------------------------------------------------------ */
export const POR_DEFECTO = {
  nombre: 'El mío',
  base: 'oscuro',
  acento: '#d2fa55',
  intensidad: 60,   // 0 = gris carbón · 100 = casi negro
  radio: 100,       // 60 = esquinas suaves · 140 = muy redondo
  escala: 100,      // 90 = letra más pequeña · 115 = más grande
};

/** Temas de regalo, para no empezar con una pantalla en blanco. */
export const PRESETS = [
  { nombre: 'Lima', base: 'oscuro', acento: '#d2fa55', intensidad: 60 },
  { nombre: 'Fuego', base: 'oscuro', acento: '#ff7a2f', intensidad: 70 },
  { nombre: 'Hielo', base: 'oscuro', acento: '#5ad8ff', intensidad: 55 },
  { nombre: 'Uva', base: 'oscuro', acento: '#b28bff', intensidad: 65 },
  { nombre: 'Menta', base: 'oscuro', acento: '#4ee6b0', intensidad: 58 },
  { nombre: 'Coral', base: 'oscuro', acento: '#ff6b81', intensidad: 62 },
  { nombre: 'Papel', base: 'claro', acento: '#3f6212', intensidad: 30 },
  { nombre: 'Cielo', base: 'claro', acento: '#0b6bcb', intensidad: 20 },
];

// OJO con el `Number.isFinite`: sin él, un `'hola'` en un tema importado se
// convierte en NaN, NaN sobrevive a Math.max/min y acaba en el CSS como
// `font-size: NaNpx` — que el navegador ignora en silencio. Un tema roto que no
// da error es peor que uno que lo da.
const entre = (v, min, max, porDefecto) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return porDefecto;
  return Math.max(min, Math.min(max, n));
};

export function normalizar(t = {}) {
  const base = t.base === 'claro' ? 'claro' : 'oscuro';
  const acento = /^#?[0-9a-f]{6}$/i.test(String(t.acento || '')) ? String(t.acento).replace(/^#?/, '#') : POR_DEFECTO.acento;
  return {
    id: t.id || null,
    nombre: String(t.nombre || POR_DEFECTO.nombre).slice(0, 40),
    base,
    acento: acento.toLowerCase(),
    intensidad: entre(t.intensidad, 0, 100, POR_DEFECTO.intensidad),
    radio: entre(t.radio, 60, 140, POR_DEFECTO.radio),
    escala: entre(t.escala, 90, 115, POR_DEFECTO.escala),
  };
}

/**
 * Las variables CSS de un tema.
 *
 * Devuelve un objeto plano `{ '--fondo': '#0b0d11', … }` para poder aplicarlo,
 * probarlo y enseñarlo en la vista previa sin tocar el documento.
 */
export function variables(temaBruto) {
  const t = normalizar(temaBruto);
  const { h } = aHsl(t.acento);
  const oscuro = t.base === 'oscuro';
  // Un pelín del tono del acento en los grises: lo justo para que el tema sea
  // de ese color y no «gris con botones de colores». Pasarse de saturación aquí
  // es lo que hace que una app parezca un caramelo.
  const sat = oscuro ? 9 : 14;
  const k = t.intensidad / 100;

  const gris = (l) => aHex({ h, s: sat, l });
  const colores = oscuro
    ? {
        '--fondo': gris(9 - 6 * k),
        '--fondo-hondo': gris(6 - 4.5 * k),
        '--superficie': gris(13 - 6 * k),
        '--superficie-2': gris(17 - 7 * k),
        '--superficie-3': gris(23 - 8 * k),
        '--borde': gris(29 - 8 * k),
        '--borde-tenue': 'rgba(255,255,255,0.06)',
        '--brillo': 'rgba(255,255,255,0.08)',
        '--velo': rgba(gris(9 - 6 * k), 0.72),
        '--texto': aHex({ h, s: 12, l: 97 }),
        '--texto-2': aHex({ h, s: 10, l: 74 }),
        '--texto-tenue': aHex({ h, s: 9, l: 60 }),
      }
    : {
        '--fondo': gris(96 - 5 * k),
        '--fondo-hondo': gris(92 - 5 * k),
        '--superficie': gris(100 - 3 * k),
        '--superficie-2': gris(97 - 5 * k),
        '--superficie-3': gris(93 - 6 * k),
        '--borde': gris(87 - 7 * k),
        '--borde-tenue': 'rgba(15,20,27,0.08)',
        '--brillo': 'rgba(255,255,255,0.9)',
        '--velo': rgba(gris(96 - 5 * k), 0.78),
        '--texto': aHex({ h, s: 22, l: 10 }),
        '--texto-2': aHex({ h, s: 14, l: 32 }),
        // 40 y no 45: con 45 el texto pequeño sobre una tarjeta blanca se
        // quedaba en 4,07:1 y el mínimo para leer es 4,5. Barrido con los ocho
        // presets y las once intensidades, el peor caso ahora es 4,76.
        '--texto-tenue': aHex({ h, s: 12, l: 40 }),
      };

  // Las esquinas y la letra, a escala. Se calculan sobre los mismos números que
  // trae el CSS de fábrica para que un tema al 100 % sea EXACTAMENTE el de
  // siempre y no un parecido.
  const r = t.radio / 100;
  const radios = {
    '--r-xs': `${Math.round(10 * r)}px`,
    '--r-s': `${Math.round(16 * r)}px`,
    '--r-m': `${Math.round(22 * r)}px`,
    '--r-l': `${Math.round(30 * r)}px`,
    '--r-xl': `${Math.round(38 * r)}px`,
  };

  return {
    ...colores,
    ...radios,
    '--acento': t.acento,
    '--acento-tinta': tintaSobre(t.acento),
    '--acento-suave': rgba(t.acento, oscuro ? 0.15 : 0.13),
    '--acento-tenue': rgba(t.acento, 0.08),
    '--acento-halo': rgba(t.acento, 0.34),
  };
}

/** El tamaño de letra va en el documento, no en las variables. */
export function tamanoLetra(temaBruto) {
  const t = normalizar(temaBruto);
  return `${Math.round(17.5 * (t.escala / 100) * 10) / 10}px`;
}

/**
 * ¿Se lee bien este tema?
 *
 * No bloquea nada —es SU app y su color—, pero lo dice. Un aviso honesto es
 * mejor que una prohibición o que un tema ilegible en silencio.
 */
export function avisos(temaBruto) {
  const t = normalizar(temaBruto);
  const v = variables(t);
  const fuera = [];
  const cAcento = contraste(t.acento, v['--fondo']);
  if (cAcento < 3) {
    fuera.push(`El acento casi no se ve sobre el fondo (${cAcento}:1). Prueba un color más ${
      luminancia(t.acento) > 0.4 ? 'oscuro' : 'claro'}.`);
  }
  const cTexto = contraste(v['--texto'], v['--fondo']);
  if (cTexto < 7) fuera.push(`El texto se queda en ${cTexto}:1 sobre el fondo.`);
  const cTenue = contraste(v['--texto-tenue'], v['--superficie']);
  if (cTenue < 4.5) fuera.push(`El texto pequeño se queda en ${cTenue}:1 y el mínimo para leer es 4,5.`);
  return fuera;
}

/* --------------------------------------------------------------------------
 * COMPARTIR: exportar e importar
 * ------------------------------------------------------------------------ */
const MARCA = 'GYMTEMA1';

/**
 * Un tema convertido en texto para mandar por WhatsApp.
 *
 * Se usa base64 y no el JSON pelado porque un JSON con comillas se rompe al
 * pegarlo en cualquier sitio que «mejore» las comillas —y entonces el tema no
 * entra y no se sabe por qué—.
 */
export function aCodigo(tema) {
  const t = normalizar(tema);
  const json = JSON.stringify([t.nombre, t.base, t.acento, t.intensidad, t.radio, t.escala]);
  const b64 = typeof btoa === 'function'
    ? btoa(unescape(encodeURIComponent(json)))
    : Buffer.from(json, 'utf8').toString('base64');
  return `${MARCA}:${b64.replace(/=+$/, '')}`;
}

/** Lee un tema de un código, de un JSON pegado, o de una lista de temas. */
export function deCodigo(texto) {
  const t = String(texto || '').trim();
  if (!t) throw new Error('No has pegado nada');

  if (t.startsWith(MARCA)) {
    const b64 = t.slice(MARCA.length + 1).replace(/\s+/g, '');
    const relleno = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const json = typeof atob === 'function'
      ? decodeURIComponent(escape(atob(relleno)))
      : Buffer.from(relleno, 'base64').toString('utf8');
    const [nombre, base, acento, intensidad, radio, escala] = JSON.parse(json);
    return [normalizar({ nombre, base, acento, intensidad, radio, escala })];
  }

  if (t.startsWith('{') || t.startsWith('[')) {
    const datos = JSON.parse(t);
    const lista = Array.isArray(datos) ? datos : datos.temas || [datos];
    const temas = lista.map(normalizar);
    if (!temas.length) throw new Error('Ahí no había ningún tema');
    return temas;
  }

  throw new Error('Eso no parece un tema de GYM');
}

/** El fichero que se exporta: legible, con fecha y con todos los temas. */
export function aFichero(temas) {
  return JSON.stringify({
    app: 'GYM',
    formato: 1,
    exportado: new Date().toISOString().slice(0, 10),
    temas: (temas || []).map(normalizar),
  }, null, 2);
}
