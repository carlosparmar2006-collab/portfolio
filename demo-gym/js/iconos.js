/* =============================================================================
 * iconos.js — Todos los iconos de la app, en SVG.
 *
 * POR QUÉ NO HAY NI UN EMOJI
 * --------------------------
 * Un emoji lo dibuja el sistema operativo, no nosotros: el 💪 de un Samsung no
 * se parece al de un Pixel, en Windows sale otro distinto, y en algunos móviles
 * viejos sale un cuadrado. Y lo peor: NO se puede teñir con los tokens, así que
 * en el tema claro se queda con el color que trae de fábrica.
 *
 * Un SVG de trazo hereda `currentColor`, mide lo que le digamos y es igual en
 * todas partes.
 *
 * CÓMO SE USAN
 * ------------
 *   icono('camara')            → 20 px, color heredado
 *   icono('camara', 24)        → 24 px
 *
 * Y siempre dentro de algo que tenga texto o `aria-label`: un icono solo, sin
 * nombre, no lo lee TalkBack y no se entiende con prisa.
 * ========================================================================== */

const D = {
  // acciones
  camara: '<path d="M3 8.5A2.5 2.5 0 0 1 5.5 6h1.7a2 2 0 0 0 1.7-.9l.7-1.1a2 2 0 0 1 1.7-.9h1.4a2 2 0 0 1 1.7.9l.7 1.1a2 2 0 0 0 1.7.9h1.7A2.5 2.5 0 0 1 21 8.5v9A2.5 2.5 0 0 1 18.5 20h-13A2.5 2.5 0 0 1 3 17.5z"/><circle cx="12" cy="13" r="3.6"/>',
  lapiz: '<path d="M4 20h4L20 8a2.8 2.8 0 0 0-4-4L4 16z"/><path d="M14.5 5.5l4 4"/>',
  papelera: '<path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13"/><path d="M10 11v6M14 11v6"/>',
  cerrar: '<path d="M6 6l12 12M18 6L6 18"/>',
  // v0.16.0 — la parte social. El corazón es de TRAZO, no relleno: relleno lo
  // pone el CSS cuando está dado (`.rc-like.dado`), que es lo que hace que se
  // note el cambio sin que el icono sea otro dibujo.
  corazon: '<path d="M12 20.2S3.6 15.4 3.6 9.6a4.6 4.6 0 0 1 8.4-2.6 4.6 4.6 0 0 1 8.4 2.6c0 5.8-8.4 10.6-8.4 10.6z"/>',
  gente: '<circle cx="9" cy="8" r="3.4"/><path d="M2.8 20a6.2 6.2 0 0 1 12.4 0"/><path d="M16.2 5.2a3.4 3.4 0 0 1 0 6.6M17.5 14.4A6.2 6.2 0 0 1 21.2 20"/>',
  comentario: '<path d="M20.5 12.4c0 4-3.8 7.2-8.5 7.2-1 0-2-.15-2.9-.42L4 20.8l1.5-3.7C4 15.9 3.5 14.2 3.5 12.4c0-4 3.8-7.2 8.5-7.2s8.5 3.2 8.5 7.2z"/>',
  tic: '<path d="M4 12.5l5.5 5.5L20 7"/>',
  mas: '<path d="M12 5v14M5 12h14"/>',
  arriba: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  abajo: '<path d="M12 5v14M6 13l6 6 6-6"/>',
  izquierda: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  derecha: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  deshacer: '<path d="M9 14L4 9l5-5"/><path d="M4 9h9a7 7 0 0 1 0 14h-3"/>',
  lupa: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.6-3.6"/>',
  pausa: '<path d="M9 5v14M15 5v14"/>',
  reproducir: '<path d="M7 4.5v15l13-7.5z"/>',

  // enlaces de la chuleta
  video: '<rect x="2.5" y="5" width="19" height="14" rx="4"/><path d="M10.5 9.2v5.6l5-2.8z"/>',
  camara_social: '<rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="4"/><path d="M17.2 6.8h.01"/>',
  imagen: '<rect x="3" y="4.5" width="18" height="15" rx="3"/><circle cx="8.5" cy="10" r="1.8"/><path d="M4 17l5-4.5 4 3.5 3-2.5 4 3.5"/>',
  enlace: '<path d="M10.5 13.5a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1.5 1.5"/><path d="M13.5 10.5a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.5-1.5"/>',

  // secciones y estados
  pesa: '<path d="M4 9v6M20 9v6M7 6v12M17 6v12M7 12h10"/>',
  fuego: '<path d="M12 3s5 4.2 5 8.6a5 5 0 0 1-10 0C7 9.6 8.6 8 8.6 8S9 10 10.2 10c1 0 1.3-1.3 1.3-3.2 0-1.4.5-2.8.5-3.8z"/>',
  carro: '<circle cx="9.5" cy="19" r="1.6"/><circle cx="17" cy="19" r="1.6"/><path d="M3 4h2.2l2.4 11h10.2l1.9-8H6.2"/>',
  codigo: '<path d="M4 6v12M7 6v12M10 6v12M13.5 6v12M16 6v12M20 6v12"/>',
  pin: '<path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.6"/>',
  musculo: '<path d="M6 20V9a3 3 0 0 1 3-3h1.6a2 2 0 0 0 1.7-1L13 3.6a1.6 1.6 0 0 1 3 .8c0 1.6-.7 2.7-.7 3.6h2.2A2.5 2.5 0 0 1 20 10.5c0 5.2-2.6 9.5-7 9.5z"/>',
  reloj: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  grafica: '<path d="M4 19V5M4 19h16M8 15l3.5-4 3 2.5L20 8"/>',

  // perfil y compartir (0.15.0)
  persona: '<circle cx="12" cy="8" r="4"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/>',
  // Avión de papel: el gesto universal de «mandar esto». Se prefiere al icono
  // de compartir de Android (los tres nodos), que en iOS no significa nada.
  enviar: '<path d="M21 3L10.5 13.5M21 3l-6.8 18-3.7-7.5L3 9.8z"/>',
  rueda: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
  salir: '<path d="M15 4h3.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H15"/><path d="M10 8l-4 4 4 4M6 12h9"/>',
  nube: '<path d="M7 19a4.5 4.5 0 0 1-.4-8.98A6 6 0 0 1 18 10.5a4.25 4.25 0 0 1-.5 8.5z"/>',
  copiar: '<rect x="9" y="9" width="11" height="11" rx="2.5"/><path d="M5.5 15H5a1.5 1.5 0 0 1-1.5-1.5V5A1.5 1.5 0 0 1 5 3.5h8.5A1.5 1.5 0 0 1 15 5v.5"/>',
  // Los cuatro de la pantalla de Configuración (1-sep-2026). Mismo trazo de
  // 1,9 sobre lienzo de 24 que todos los demás: una rejilla de ajustes donde un
  // icono es de otra familia se ve enseguida.
  candado: '<rect x="4.5" y="10.5" width="15" height="10" rx="2.2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/><circle cx="12" cy="15.5" r="1.4"/>',
  llave: '<circle cx="8" cy="12" r="3.8"/><path d="M11.8 12H21M18 12v3M15 12v2.2"/>',
  lista: '<path d="M9 6.5h11M9 12h11M9 17.5h11"/><circle cx="4.6" cy="6.5" r="1.3"/><circle cx="4.6" cy="12" r="1.3"/><circle cx="4.6" cy="17.5" r="1.3"/>',
  aviso: '<path d="M12 3.8 21 19.5H3z"/><path d="M12 9.6v4.2"/><circle cx="12" cy="16.6" r="1"/>',
  // El escudo de la moderación. No es un candado (eso es «privado») ni un
  // aviso (eso es «algo va mal»): es «alguien vela por esto».
  escudo: '<path d="M12 3.2 19.5 6v6.2c0 4.4-3.1 7.4-7.5 8.6-4.4-1.2-7.5-4.2-7.5-8.6V6z"/><path d="M9 12l2.2 2.2L15.4 10"/>',
};

/**
 * Devuelve el SVG de un icono.
 * @param {string} clave  nombre del icono
 * @param {number} px     lado en píxeles (por defecto 20)
 */
export function icono(clave, px = 20) {
  const d = D[clave];
  if (!d) return '';
  const relleno = clave === 'reproducir' ? 'currentColor' : 'none';
  return `<svg class="ic" width="${px}" height="${px}" viewBox="0 0 24 24" fill="${relleno}"
    stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"
    aria-hidden="true" focusable="false">${d}</svg>`;
}

export const HAY = (clave) => !!D[clave];
