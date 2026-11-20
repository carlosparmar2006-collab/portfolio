/* =============================================================================
 * mapa.js — Buscar la dirección de un gimnasio y verla en un mapa.
 *
 * Carlos: «cuando pongas el gym que salga un mapa para asegurarte de que pongas
 * bien la dirección». El problema real que resuelve: escribir «La Cochera, Sant
 * Feliu» y no saber si el sitio que ha entendido la app es el bueno.
 *
 * POR QUÉ ESTÁ HECHO ASÍ (sin librerías ni claves)
 * ------------------------------------------------
 * · Búsqueda de direcciones: **Nominatim** de OpenStreetMap. Gratis, sin cuenta
 *   y sin clave de API. Encaja con el presupuesto de 0 € del proyecto.
 * · El mapa se pinta con 4 imágenes de tesela de OpenStreetMap colocadas a mano.
 *   Meter Leaflet supondría descargar una librería de un CDN, y el APK tiene que
 *   funcionar sin red: aquí, si no hay red, simplemente no sale el mapa y la
 *   dirección se escribe a mano como siempre. Nada se rompe.
 * · Se respeta la política de uso de OSM: una identificación honesta en la
 *   cabecera, un solo tiro por búsqueda y un puñado de teselas.
 *
 * Todo esto solo se usa al DAR DE ALTA un gimnasio, que es algo que se hace tres
 * veces en la vida y con WiFi. El uso diario en el gimnasio no toca la red.
 * ========================================================================== */

import { icono } from './iconos.js';

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const TESELAS = 'https://tile.openstreetmap.org';
const AGENTE = 'GYM-JARVIS/0.2 (app personal de registro de pesos)';

/** Convierte latitud/longitud a coordenadas de tesela (Web Mercator). */
function aTesela(lat, lon, z) {
  const n = 2 ** z;
  const x = ((lon + 180) / 360) * n;
  const rad = (lat * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n;
  return { x, y };
}

/**
 * Busca un gimnasio probando de lo más concreto a lo más general.
 *
 * Nominatim es un buscador de DIRECCIONES, no un listín de negocios: pedirle
 * «Basic-Fit Barcelona Tarradellas» devuelve NADA, mientras que
 * «Av. Josep Tarradellas 133 Barcelona» lo encuentra al primer intento
 * (comprobado). Por eso se prueba en cascada y nos quedamos con el primer
 * escalón que dé algo, en vez de decirle a Carlos «no encontrado».
 */
export async function buscarGimnasio(nombre, direccion, limite = 5) {
  const n = String(nombre || '').trim();
  const d = String(direccion || '').trim();

  // La búsqueda ESTRUCTURADA (calle + ciudad por separado) es mucho más
  // precisa que la de texto libre. Con texto libre, «Av. Josep Tarradellas,
  // 133, Barcelona» devolvía la calle del mismo nombre en VILADECANS —
  // plausible y equivocada. Separando ciudad y calle, Nominatim ya no se va
  // de municipio.
  const trozos = d.split(/[,·]/).map((s) => s.trim()).filter(Boolean);
  const ciudad = trozos.length > 1 ? trozos[trozos.length - 1] : '';
  const calle = trozos.length > 1 ? trozos.slice(0, -1).join(' ') : d;

  // ORDEN COMPROBADO CONTRA NOMINATIM (27-jul-2026), no inventado:
  // para «Avinguda de Josep Tarradellas 133, 08029 Barcelona» el texto libre
  // acierta de pleno (les Corts, Barcelona) mientras que la búsqueda
  // ESTRUCTURADA devolvía Viladecans. Por eso el texto libre va primero y la
  // estructurada queda de red de seguridad. El código postal es lo que más
  // desempata: por eso la pantalla lo sugiere.
  const intentos = [];
  if (d) intentos.push({ q: d });                  // la dirección tal cual: la que mejor funciona
  if (n && d) intentos.push({ q: `${n} ${d}` });   // por si el gimnasio SÍ está en el mapa
  if (calle && ciudad) intentos.push({ street: calle, city: ciudad });
  if (ciudad) intentos.push({ city: ciudad });
  if (!d && n) intentos.push({ q: n });

  for (const params of intentos) {
    let res = await buscarDireccion(params, limite);
    if (res.length) {
      // Nominatim ordena por su propio criterio y a veces pone primero un sitio
      // del pueblo de al lado. Se suben los que mencionan la localidad que
      // escribió Carlos: es el dato que él sí conoce con certeza.
      const pistas = (d || n).toLowerCase()
        .split(/[,·]/).map((s) => s.trim()).filter((s) => s.length > 3);
      if (pistas.length) {
        res = res.slice().sort((a, b) => puntua(b, pistas) - puntua(a, pistas));
      }
      return res;
    }
    await new Promise((r) => setTimeout(r, 1100));   // ritmo cortés con OSM
  }
  return [];
}

function puntua(sitio, pistas) {
  const texto = String(sitio.completa || '').toLowerCase();
  return pistas.reduce((n, p) => n + (texto.includes(p) ? 1 : 0), 0);
}

/**
 * Busca una dirección concreta. Devuelve [{titulo, direccion, lat, lon}] o []
 * si no hay red. NUNCA lanza: quedarse sin mapa no puede impedir crear el
 * gimnasio — en el gimnasio no siempre hay cobertura.
 */
export async function buscarDireccion(consulta, limite = 5) {
  // Admite texto suelto o {street, city, q} para la búsqueda estructurada.
  const p = typeof consulta === 'string' ? { q: consulta } : (consulta || {});
  const partes = new URLSearchParams();
  for (const k of ['q', 'street', 'city']) {
    if (p[k] && String(p[k]).trim()) partes.set(k, String(p[k]).trim());
  }
  if (![...partes.keys()].length) return [];
  if (partes.get('q') && partes.get('q').length < 3) return [];

  try {
    const ctrl = new AbortController();
    const corte = setTimeout(() => ctrl.abort(), 8000);
    // countrycodes=es acota a España: menos ruido y menos sitios homónimos.
    partes.set('format', 'json');
    partes.set('addressdetails', '1');
    partes.set('countrycodes', 'es');
    partes.set('limit', String(limite));
    const url = `${NOMINATIM}?${partes.toString()}`;
    const r = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': AGENTE },
      signal: ctrl.signal,
    });
    clearTimeout(corte);
    if (!r.ok) return [];
    const datos = await r.json();
    return (datos || []).map((d) => {
      const a = d.address || {};
      const calle = [a.road, a.house_number].filter(Boolean).join(', ');
      const ciudad = a.city || a.town || a.village || a.municipality || '';
      return {
        titulo: (d.display_name || '').split(',')[0],
        direccion: [calle, ciudad].filter(Boolean).join(' · ') || (d.display_name || '').split(',').slice(0, 3).join(','),
        completa: d.display_name || '',
        lat: parseFloat(d.lat),
        lon: parseFloat(d.lon),
      };
    });
  } catch (_) {
    return [];   // sin cobertura: se escribe a mano y ya está
  }
}

/**
 * Pinta un mapa pequeño centrado en (lat, lon) dentro de `contenedor`.
 * Son 2x2 teselas colocadas de forma que el punto quede centrado.
 */
export function pintarMapa(contenedor, lat, lon, z = 16) {
  contenedor.innerHTML = '';
  contenedor.className = 'mapa';

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    contenedor.innerHTML = '<p class="mapa-vacio">Busca la dirección para ver el mapa.</p>';
    return;
  }

  const { x, y } = aTesela(lat, lon, z);
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  // Desplazamiento dentro de la tesela, para centrar el punto exacto.
  const dx = (x - tx) * 256;
  const dy = (y - ty) * 256;

  const lienzo = document.createElement('div');
  lienzo.className = 'mapa-lienzo';
  const capa = document.createElement('div');
  capa.className = 'mapa-capa';
  // Se colocan 3x3 teselas y se desplaza la capa para que el punto caiga en el centro.
  capa.style.transform = `translate(${-dx}px, ${-dy}px)`;

  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const img = document.createElement('img');
      // NADA de loading="lazy": las teselas viven dentro de una capa desplazada
      // con transform y el navegador las daba por «fuera de pantalla», así que
      // no bajaba ninguna y el mapa salía en blanco. Son 9 imágenes pequeñas.
      img.alt = '';
      img.src = `${TESELAS}/${z}/${tx + i}/${ty + j}.png`;
      img.style.left = `${(i + 1) * 256}px`;
      img.style.top = `${(j + 1) * 256}px`;
      img.onerror = () => (img.style.visibility = 'hidden');
      capa.appendChild(img);
    }
  }
  lienzo.appendChild(capa);

  const pin = document.createElement('span');
  pin.className = 'mapa-pin';
  pin.innerHTML = icono('pin', 26);
  lienzo.appendChild(pin);
  contenedor.appendChild(lienzo);

  const pie = document.createElement('div');
  pie.className = 'mapa-pie';
  pie.innerHTML =
    `<a href="https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=17/${lat}/${lon}"
        target="_blank" rel="noopener">Ver en OpenStreetMap</a>` +
    `<a href="https://www.google.com/maps/search/?api=1&query=${lat},${lon}"
        target="_blank" rel="noopener">Abrir en Google Maps</a>`;
  contenedor.appendChild(pie);
}
