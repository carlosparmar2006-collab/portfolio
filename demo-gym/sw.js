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
const VERSION = 44;  // v0.37.1: las 41 piezas, bucles de 4 s y packs mini/grande
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
  // Los tres de 0.12/0.13. Faltaban aquí: sin ellos en la caché, la app abría
  // en el gimnasio sin cobertura y se caía al importar el primer módulo que no
  // estuviera guardado. Cada `import` nuevo en `app.js` tiene que aparecer
  // TAMBIÉN en esta lista.
  './js/metas.js',
  './js/calendario.js',
  './js/temas.js',
  // Los cuatro de 0.15.0. Cada `import` nuevo en `app.js` tiene que aparecer
  // TAMBIÉN aquí: sin esto, en el gimnasio sin cobertura la app abre y se cae
  // al importar el primero que falte.
  './js/perfil.js',
  './js/insignias.js',
  './js/nube.js',
  './js/compartir.js',
  // Los dos de 0.16.0. Cada `import` nuevo en `app.js` tiene que aparecer
  // TAMBIÉN aquí: sin esto, en el gimnasio sin cobertura la app abre y se cae
  // al importar el primero que falte. Ya nos pasó con los tres de 0.12/0.13.
  './js/social.js',
  './js/bienvenida.js',
  './js/identidad.js',
  // Los cuatro de 0.20.0 (el vestuario). Cada `import` nuevo tiene que aparecer
  // TAMBIÉN aquí: sin esto, en el gimnasio sin cobertura la app abre y se cae
  // al importar el primero que falte. Ya ha pasado dos veces.
  './js/vestuario.js',
  './js/cosmeticos.js',
  // Los dos de 0.36.0: el motor de canvas y el arte de las 70 piezas. Ya ha
  // pasado tres veces — cada `import` nuevo tiene que aparecer TAMBIÉN aquí, o
  // la app abre en el gimnasio sin cobertura y se cae al importar el que falte.
  './js/motor.js',
  './js/arte.js',
  // Lo cazó la comprobación de CI en local, que es para lo que está.
  './js/cajas.js',
  './js/sonido.js',
  // Los dos de 0.37.0: el resolvedor de películas pre-renderizadas y su
  // inventario. `cosmeticos.js` importa `peliculas.js`, así que sin ellos aquí
  // la app abriría sin cobertura y se caería en la primera pantalla que enseñe
  // una pieza — que es medio vestuario y todo el perfil.
  './js/peliculas.js',
  './js/peliculas_datos.js',
  // Los dos de 0.17.0: el motor del estudio de entrenamiento y las ocho rutinas
  // oficiales. Cada `import` nuevo tiene que aparecer TAMBIÉN aquí, y no solo
  // los de `app.js`: `comunidad.js` lo importa `social.js`, y sin él en la
  // caché la app abriría sin cobertura y se caería en la primera pantalla que
  // pida rutinas — que es justo la que existe PARA funcionar sin cobertura.
  './js/ciencia.js',
  './js/comunidad.js',
  // El catálogo (1.365 ejercicios) y los pasos de la técnica. Si no se guardan
  // aquí, en el gimnasio sin cobertura la app abre pero SIN ejercicios, que es
  // justo el sitio donde hace falta.
  './datos/catalogo.json',
  './datos/instrucciones.json',
  // La configuración de la nube que viaja con la app. Va en el armazón porque
  // se lee en cada arranque: sin ella en la caché, la primera vez sin cobertura
  // la app arrancaría creyendo que no hay nube y escondería la cuenta entera.
  './nube.json',
  './manifest.webmanifest',
  './icono.svg',
  // La letra. Va en el armazón porque si no se guarda, la primera vez sin
  // cobertura la app se pinta con la del sistema y no se parece a sí misma.
  './fuentes/archivo-var.woff2',
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

  // TODO LO QUE NO ES NUESTRO, DIRECTO A LA RED.
  //
  // Esto arregla un fallo que con la 0.16.0 habría salido a diario. El respaldo
  // de abajo devuelve `index.html` cuando una petición falla, para que la app
  // abra sin cobertura. Con las llamadas a Supabase (que son GET a otro
  // dominio) eso significaba que una consulta sin red no devolvía un error:
  // devolvía la página HTML de la app con un 200, y `nube.pedir` la tomaba por
  // una respuesta buena. Un fallo de red disfrazado de dato correcto es lo peor
  // que puede pasar en esta capa.
  //
  // De paso cubre el mapa: cachear teselas de OpenStreetMap llenaría el móvil y
  // su licencia no lo contempla.
  if (url.origin !== self.location.origin) return;

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
