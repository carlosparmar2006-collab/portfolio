/* =============================================================================
 * sw.js — Service worker.
 *
 * Su único trabajo: que la app abra en el gimnasio SIN COBERTURA. Cachea el
 * armazón (html, css, js) en la instalación y luego sirve primero de caché.
 * Los DATOS no pasan por aquí: viven en IndexedDB, que ya es local.
 *
 * Nunca cachea las llamadas a /api/ (la sincronización tiene que ir a la red
 * de verdad o fallar limpiamente; una respuesta vieja de caché sería peor).
 * ========================================================================== */

/* Sube este número al tocar cualquier fichero del armazón: al arrancar, el
 * service worker borra las cachés con otro nombre y se queda con la nueva.
 * Sin esto, el móvil se quedaría con la versión vieja para siempre. */
const VERSION = 12;  // v0.9.0: rediseño, 1.365 ejercicios con animación propia, nutrición nueva
const CACHE = `gym-v${VERSION}`;
const ARMAZON = [
  './',
  './index.html',
  './css/app.css',
  './js/app.js',
  './js/db.js',
  './js/datos.js',
  './js/graficas.js',
  './js/sync.js',
  './js/catalogo.js',
  './js/fotos.js',
  './js/nutricion.js',
  './js/comida.js',
  './js/alimentos.js',
  './js/mapa.js',
  './js/animacion.js',
  './js/iconos.js',
  './js/off.js',
  './js/plan.js',
  // El catálogo (1.365 ejercicios) y los pasos de la técnica. Si no se guardan
  // aquí, en el gimnasio sin cobertura la app abre pero SIN ejercicios, que es
  // justo el sitio donde hace falta.
  './datos/catalogo.json',
  './datos/instrucciones.json',
  './manifest.webmanifest',
  './icono.svg',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(ARMAZON))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.pathname.includes('/api/')) return;
  // El mapa y la búsqueda de direcciones van SIEMPRE a la red: cachear teselas
  // de OpenStreetMap llenaría el móvil y su licencia no lo contempla. Si no hay
  // red, la petición falla limpiamente y la app sigue funcionando sin mapa.
  if (url.hostname.endsWith('openstreetmap.org')) return;

  e.respondWith(
    caches.match(e.request).then((hit) => {
      if (hit) {
        // refresco en segundo plano: la próxima vez ya está al día
        fetch(e.request)
          .then((r) => r.ok && caches.open(CACHE).then((c) => c.put(e.request, r.clone())))
          .catch(() => {});
        return hit;
      }
      // No estaba en caché: se trae y SE GUARDA. Las 67 fotos del catálogo no
      // van en el armazón (serían 680 KB en la instalación), así que se cachean
      // la primera vez que se ven. Dentro del APK esto ni se usa: allí los
      // ficheros ya son locales.
      return fetch(e.request)
        .then((r) => {
          if (r.ok && url.origin === self.location.origin) {
            const copia = r.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copia));
          }
          return r;
        })
        .catch(() => caches.match('./index.html'));
    })
  );
});
