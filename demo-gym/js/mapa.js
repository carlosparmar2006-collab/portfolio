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

/* --------------------------------------------------------------------------
 * DE DÓNDE SALE EL MAPA — Y POR QUÉ NO ESTÁ ESCRITO AQUÍ A FUEGO
 *
 * Estos dos valores son los de OpenStreetMap, que es lo que se usa por defecto.
 * Pero se pueden cambiar desde `app/nube.json` SIN publicar una versión nueva
 * de la app, y esa es la misma regla que ya está escrita en CLAUDE.md para la
 * dirección de alojamiento: la aprendimos cuando GitHub Pages resultó ser de
 * pago en un repositorio privado y hubo que mudarse.
 *
 * Aquí hace falta por un motivo concreto: la política de uso de las teselas de
 * OpenStreetMap NO contempla las apps, y pueden dejar de contestarnos cualquier
 * día. Si eso pasa —y hay que averiguar si ya está pasando, ver `probar()`—, la
 * salida es cambiar dos líneas de un JSON, no compilar un APK, subirlo a Play y
 * esperar a que 15 personas lo actualicen.
 * ------------------------------------------------------------------------ */
/* --------------------------------------------------------------------------
 * DOS PROVEEDORES, NO UNO  (1-sep-2026, segunda vuelta)
 *
 * Carlos, después de instalarla: *«el mapa no va, ni se ve, ni detecta calles»*.
 * Y la vuelta anterior ya había arreglado el pin y el arrastre, así que lo que
 * queda en pie es la hipótesis que no se puede comprobar desde aquí: que
 * OpenStreetMap simplemente NO NOS CONTESTA. Su política de uso de teselas dice
 * literalmente que no contempla las aplicaciones, y desde un WebView no se
 * puede mandar ni `User-Agent` ni `Referer` (las dos son cabeceras prohibidas
 * en `fetch`), o sea que no hay forma de identificarse como es debido.
 *
 * Preguntárselo a Carlos otra vez costaba un día entero por cada vuelta. Así
 * que en vez de un servidor hay una LISTA, y se prueban en orden hasta que uno
 * conteste. El primero que funciona se queda para el resto de la sesión.
 *
 *   BUSCADOR   1) Nominatim (OpenStreetMap)  2) Photon (Komoot)
 *   TESELAS    1) OpenStreetMap              2) CARTO (basemaps.cartocdn.com)
 *
 * Photon y CARTO son gratis, sin cuenta y sin clave, y —a diferencia de OSM—
 * sus condiciones no excluyen a las apps. Presupuesto del proyecto: 0 €.
 *
 * HONESTIDAD SOBRE ESTO: desde el entorno donde se programa NO se puede
 * comprobar ninguno de los cuatro. El proxy de salida bloquea openstreetmap.org
 * y los tests usan servidores fingidos. Lo que sí está probado, y es lo que de
 * verdad arregla el problema, es el MECANISMO: que si el primero falla se pasa
 * al segundo, que se dice cuál contestó, y que si fallan los dos se explica en
 * la pantalla en vez de dejar un rectángulo gris. Eso tiene test.
 *
 * Y sigue mandando `app/nube.json`: si algún día los cuatro se caen, la salida
 * es cambiar dos líneas de un JSON y no compilar un APK.
 * ------------------------------------------------------------------------ */
/* QUINTA VUELTA (3-sep-2026): EL PRIMERO ES EL NUESTRO.
 *
 * Carlos, con la 0.25.0: «pongo Viva gym Reus, un minuto cargando y no sale
 * nada». Cuatro versiones ajustando parámetros de una llamada que NO SE PUEDE
 * HACER BIEN DESDE EL MÓVIL: Nominatim exige un `User-Agent` que diga quién
 * eres —su política dice que las apps sin identificar se bloquean— y desde un
 * `fetch` de navegador esa cabecera está prohibida: el navegador la tira.
 *
 * Así que la búsqueda se hace en NUESTRO servidor (`worker/buscar.js`), que ya
 * existe porque es el mismo que sirve la app. Allí sí se puede identificar la
 * app, sí se puede guardar la respuesta —la otra regla de uso de OSM— y sí se
 * puede preguntar a los tres servicios a la vez y decir qué contestó cada uno.
 *
 * Los otros dos se quedan de repuesto: si el Worker se cae, la app sigue
 * buscando como hasta ahora. Peor, pero buscando. */
const BUSCADORES_POR_DEFECTO = [
  { url: 'https://gym.carlosparmar2006.workers.dev/api/buscar', tipo: 'gym' },
  { url: 'https://nominatim.openstreetmap.org/search', tipo: 'nominatim' },
  { url: 'https://photon.komoot.io/api', tipo: 'photon' },
];
const TESELAS_POR_DEFECTO = [
  'https://tile.openstreetmap.org',
  'https://basemaps.cartocdn.com/rastertiles/voyager',
];

let BUSCADORES = BUSCADORES_POR_DEFECTO.slice();
let TESELEROS = TESELAS_POR_DEFECTO.slice();

// Cuál de la lista contestó la última vez. Se empieza por ese: sería absurdo
// volver a llamar en cada búsqueda al que ya sabemos que nos rechaza.
let _buscadorBueno = 0;
let _teseleroBueno = 0;

/** El tipo de un buscador se deduce de su dirección si no viene dicho. */
function tipoDeBuscador(url, dicho) {
  const t = String(dicho || '').toLowerCase();
  if (t === 'photon' || t === 'nominatim' || t === 'gym') return t;
  if (/\/api\/buscar/.test(url)) return 'gym';
  return /photon/i.test(url) ? 'photon' : 'nominatim';
}

/** Admite una cadena suelta (como antes) o una lista. Nunca devuelve vacío. */
function comoLista(valor, porDefecto, mapear) {
  const bruto = Array.isArray(valor) ? valor : (valor == null ? [] : [valor]);
  const salida = bruto.map(mapear).filter(Boolean);
  return salida.length ? salida : porDefecto.slice();
}

/**
 * Lee `app/nube.json` una vez y se queda con lo que diga de `mapa`.
 *
 * Si el fichero no está, no es JSON o no trae `mapa`, se queda lo de arriba: un
 * mapa que deja de funcionar por un fichero de configuración mal escrito sería
 * peor que no poder cambiarlo.
 */
let _configurado = null;
export function configurar() {
  if (_configurado) return _configurado;
  // Relativa AL MÓDULO y no a la página: dentro del APK la app cuelga de
  // `/assets/` y `./nube.json` resuelto contra el documento se iría a la raíz
  // del dominio, que no existe. Es la misma trampa que ya está escrita en
  // `nube.js`, y aquí estaba puesta de la otra manera.
  _configurado = fetch(new URL('../nube.json', import.meta.url), { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : null))
    .then((c) => {
      const m = (c && c.mapa) || {};
      BUSCADORES = comoLista(m.buscador, BUSCADORES_POR_DEFECTO, (b) => {
        const url = typeof b === 'string' ? b : (b && b.url);
        if (typeof url !== 'string' || !url.startsWith('https://')) return null;
        return { url, tipo: tipoDeBuscador(url, b && b.tipo) };
      });
      TESELEROS = comoLista(m.teselas, TESELAS_POR_DEFECTO, (t) =>
        (typeof t === 'string' && t.startsWith('https://')) ? t.replace(/\/$/, '') : null);
      SITIEROS = comoLista(m.sitios, SITIOS_POR_DEFECTO, (t) =>
        (typeof t === 'string' && t.startsWith('https://')) ? t : null);
      _buscadorBueno = 0;
      _teseleroBueno = 0;
      _sitieroBueno = 0;
      return { buscadores: BUSCADORES, teselas: TESELEROS, sitios: SITIEROS };
    })
    .catch(() => ({ buscadores: BUSCADORES, teselas: TESELEROS, sitios: SITIEROS }));
  return _configurado;
}

/** El servidor de teselas que se está usando ahora mismo. */
export function teselero() {
  return TESELEROS[_teseleroBueno] || TESELAS_POR_DEFECTO[0];
}

/**
 * Pasa al siguiente servidor de teselas. Devuelve `true` si de verdad hay otro.
 *
 * Lo llama el mapa cuando la mayoría de las imágenes se han caído: reintentar
 * con el mismo servidor que acaba de rechazarnos veinte veces no arregla nada.
 */
export function siguienteTeselero() {
  if (_teseleroBueno + 1 >= TESELEROS.length) return false;
  _teseleroBueno++;
  return true;
}

// La identificación ante Nominatim. No es un correo para escribirle a nadie:
// es lo que su política de uso pide para poder avisar si una app se pasa de
// peticiones. Va en la URL porque desde un navegador el `User-Agent` no se
// puede tocar (es una cabecera prohibida en fetch).
const AGENTE_CONTACTO = 'gym-app@carlosparmar2006.dev';

/* --------------------------------------------------------------------------
 * POR QUÉ NO SALIÓ NADA  (1-sep-2026)
 *
 * Una búsqueda sin resultados y una búsqueda que el servidor ha rechazado son
 * cosas distintas y hasta ahora se veían igual: una lista vacía. Eso convirtió
 * un problema concreto («OpenStreetMap nos bloquea») en un síntoma mudo («no
 * detecta calles»), y se tardan horas en distinguir uno de otro a ciegas.
 *
 * `ultimoFallo()` guarda el motivo del último intento. Es `null` cuando la
 * búsqueda fue bien —haya encontrado algo o no—, y una frase cuando no llegó a
 * preguntarse o el servidor dijo que no.
 * ------------------------------------------------------------------------ */
let _ultimoFallo = null;

export function ultimoFallo() {
  return _ultimoFallo;
}

/**
 * Probar el mapa de verdad: una búsqueda y una tesela, y decir qué contestó
 * cada una.
 *
 * Existe porque desde el ordenador no se puede comprobar: los tests usan un
 * Nominatim y unas teselas fingidas (ni es honrado gastarle peticiones a OSM en
 * cada test, ni el test puede fallar porque su servidor tenga un mal día), y el
 * entorno donde se programa tiene bloqueada la salida a openstreetmap.org. O
 * sea que el único sitio donde se puede saber si el mapa funciona es el móvil
 * de Carlos. Esto es para que lo diga él en un toque en vez de adivinarlo yo.
 */
export async function probar() {
  const cfg = await configurar();
  const salida = { buscador: '', sitios: '', fuentes: '', teselas: '', origen: '',
                   de: '', ubicacion: '', donde: '' };
  // La lista ENTERA, no solo el primero: si el mapa acaba tirando del segundo,
  // el diagnóstico tiene que decir cuál es o la línea engaña.
  salida.de = `${cfg.buscadores.map((b) => hostDe(b.url)).join(' → ')}`
    + ` · ${cfg.teselas.map(hostDe).join(' → ')}`
    + ` · ${(cfg.sitios || []).map(hostDe).join(' → ')}`;
  try {
    salida.origen = location.origin
      + (origenSeguro() ? ' (origen seguro)' : ' (origen NO seguro)');
  } catch (_) { /* da igual */ }

  // 0) LA UBICACIÓN, que es por donde empezó todo esto. Dentro del APK tiene
  //    que decir «puente de Android»: si dice «el navegador» es que el puente
  //    no se ha registrado y volveremos a estar donde estábamos.
  salida.ubicacion = hayPuenteNativo()
    ? 'puente de Android'
    : origenSeguro()
      ? 'el navegador (navigator.geolocation)'
      : 'NINGUNA: sin puente y en origen no seguro, el navegador la bloquea';

  // Y QUÉ CONTESTA DE VERDAD.  (2-sep-2026)
  //
  // Carlos: «al darle al icono de la ubicación me sale NaN». Desde aquí no se
  // puede reproducir —el puente solo existe dentro del APK—, así que en vez de
  // adivinar se pregunta y se enseña TAL CUAL lo que devuelve. Si vuelve a
  // salir algo raro, esta línea lo dice en una frase.
  const u = await miUbicacion({ espera: 9000 });
  salida.donde = u.ok
    ? `✓ ${u.lat.toFixed(5)}, ${u.lon.toFixed(5)}`
      + (u.precision ? ` · ±${u.precision} m` : '')
      + (u.edad ? ` · de hace ${u.edad} s` : '')
    : `✗ ${u.motivo}`;

  // 1) El buscador de direcciones.
  const t0 = Date.now();
  const sitios = await buscarDireccion({ q: 'Plaza Mayor Madrid' }, 1);
  const ms = Date.now() - t0;
  salida.buscador = _ultimoFallo
    ? `✗ ${_ultimoFallo}`
    : sitios.length
      ? `✓ contesta y encuentra · ${buscadorUsado()} (${ms} ms)`
      : `✗ ${buscadorUsado()} contesta pero no encuentra nada (${ms} ms) — raro`;

  // 1 bis) LA BÚSQUEDA POR NOMBRE, que es lo que Carlos echaba en falta: «el
  //        McDonald's está en el carrer X pero tú buscas McDonald's».
  //
  //        YA NO HACE FALTA LA UBICACIÓN. Antes esta línea decía «hace falta tu
  //        ubicación» porque la única búsqueda por nombre que había era
  //        Overpass, y Overpass necesita un punto de partida. Ahora la hace el
  //        Worker con Photon, que busca por nombre en cualquier sitio: «Viva
  //        gym Reus» tiene que salir aunque el móvil no sepa dónde está — que
  //        es EXACTAMENTE el caso de la captura de Carlos.
  const t0b = Date.now();
  const porNombre = await buscarDireccion({ q: 'Viva gym Reus' }, 3);
  const detalle = detalleFuentes();
  salida.sitios = porNombre.length
    ? `✓ «Viva gym Reus» → ${porNombre.length} (${Date.now() - t0b} ms)`
    : _ultimoFallo
      ? `✗ ${_ultimoFallo} (${Date.now() - t0b} ms)`
      : `✗ contestan pero no encuentran «Viva gym Reus» (${Date.now() - t0b} ms)`;

  // 1 ter) Y QUÉ HA DICHO CADA UNO, uno por uno.
  //
  //        Esta línea es el instrumento que faltaba. Hasta hoy, «Nominatim nos
  //        está devolviendo un 403», «Photon tarda demasiado» y «no existe
  //        ningún sitio con ese nombre» llegaban al móvil exactamente igual: una
  //        lista vacía y un «No encuentro ese sitio». Con esto, la próxima vez
  //        se sabe en una frase en vez de en dos días.
  salida.fuentes = detalle
    ? ['cerca', 'nombre', 'direccion'].map((k) => {
      const f = detalle[k] || {};
      const como = k === 'cerca' ? 'lo de cerca' : k === 'nombre' ? 'por nombre' : 'por calle';
      if (f.estado === null || f.estado === undefined) return `${como}: ${f.error || 'no preguntado'}`;
      if (f.estado === 200) return `${como}: ✓ ${f.n} (${f.servidor})`;
      return `${como}: ✗ ${f.error || f.estado} (${f.servidor || '?'})`;
    }).join(' · ')
    : '— no ha contestado nuestro buscador; se ha tirado de los de repuesto';

  // 2) Una tesela. Se pide como IMAGEN y no con `fetch` a propósito: es
  //    exactamente lo que hace el mapa, y los servidores de teselas tratan
  //    distinto a un `fetch` que a un `<img>`.
  //    Y se prueban TODOS los de la lista, no solo el que toca ahora: lo que
  //    hay que saber es si queda alguno en pie, no si el primero está caído.
  let cual = -1;
  for (let i = 0; i < TESELEROS.length; i++) {
    if (await unaTesela(TESELEROS[i])) { cual = i; break; }
  }
  if (cual >= 0) {
    _teseleroBueno = cual;   // el diagnóstico deja el mapa apuntando al que va
    salida.teselas = `✓ se ven · ${hostDe(TESELEROS[cual])}`
      + (cual > 0 ? ` (el primero, ${hostDe(TESELEROS[0])}, no contesta)` : '');
  } else {
    // El navegador no cuenta el porqué de un `<img>` que falla; lo único seguro
    // es que no llegó.
    salida.teselas = `✗ no llegan de ninguno (sin conexión, o los ${TESELEROS.length} `
      + 'servidores las rechazan)';
  }

  return salida;
}

/** Una tesela de prueba contra un servidor. `true` si llegó. */
function unaTesela(base) {
  return new Promise((res) => {
    const img = new Image();
    const corte = setTimeout(() => res(false), 10000);
    img.onload = () => { clearTimeout(corte); res(true); };
    img.onerror = () => { clearTimeout(corte); res(false); };
    // Se pide como IMAGEN y no con `fetch` a propósito: es exactamente lo que
    // hace el mapa, y los servidores de teselas tratan distinto a un `fetch`
    // que a un `<img>`.
    img.src = `${base}/13/4004/3067.png?t=${Date.now()}`;
  });
}

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
  await configurar();
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

  /* CON NUESTRO BUSCADOR NO HAY CASCADA.
   *
   * La cascada eran hasta cinco intentos con 1,1 s de espera entre cada uno,
   * pensada para cuando el único buscador era Nominatim y había que probar la
   * misma dirección de cinco maneras. Sumando los cortes de cada intento eso
   * son casi cuarenta segundos: es literalmente el «ha estado un minuto
   * cargando» de Carlos. El Worker ya pregunta por nombre Y por calle a la vez,
   * así que con un intento está todo preguntado. */
  const soloUno = BUSCADORES[_buscadorBueno] && BUSCADORES[_buscadorBueno].tipo === 'gym';
  const cola = soloUno ? intentos.slice(0, 1) : intentos;

  for (const params of cola) {
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
  await configurar();
  // Admite texto suelto o {street, city, q} para la búsqueda estructurada.
  const p = typeof consulta === 'string' ? { q: consulta } : (consulta || {});
  const texto = ['q', 'street', 'city'].map((k) => String(p[k] || '').trim()).filter(Boolean).join(', ');
  if (!texto) return [];
  if (p.q && !p.street && !p.city && String(p.q).trim().length < 3) return [];

  _ultimoFallo = null;
  _buscadorUsado = '';
  // SE PRUEBAN TODOS, EMPEZANDO POR EL QUE FUNCIONÓ LA ÚLTIMA VEZ.
  //
  // Antes había un solo servidor y un solo intento: si OpenStreetMap decidía no
  // contestarnos —y su política de uso dice que las apps no entran—, la app se
  // quedaba sin buscador para siempre y sin manera de saberlo. Ahora el fallo
  // de uno es el turno del siguiente, y solo se da por perdido cuando fallan
  // todos. El motivo que se enseña es el del PRIMERO, que es el que explica de
  // verdad qué está pasando («nos está limitando (403)»).
  let primerFallo = null;
  // CONTESTAR «NADA» NO ES CONTESTAR.  (1-sep-2026, cuarta vuelta del mapa)
  //
  // Carlos: *«si yo pongo El Corte Inglés de Barcelona Diagonal no me sale
  // nada»*. Y era verdad, pero no porque nadie contestara: Nominatim es un
  // buscador de DIRECCIONES y para un nombre de comercio devuelve `[]` con un
  // 200 impecable. Como aquí un 200 se daba por bueno, se devolvía esa lista
  // vacía y Photon —que SÍ es un buscador de sitios, y encuentra «El Corte
  // Inglés Diagonal» al primer intento— no llegaba a preguntarse nunca.
  //
  // Ahora una lista vacía es motivo para seguir con el siguiente de la lista.
  // Solo cuando TODOS contestan y ninguno encuentra nada se dice «no existe»,
  // que es una afirmación muy distinta de «no me contestan».
  let alguienContesto = false;
  for (let vuelta = 0; vuelta < BUSCADORES.length; vuelta++) {
    const i = (_buscadorBueno + vuelta) % BUSCADORES.length;
    const b = BUSCADORES[i];
    const r = await unaBusqueda(b, p, texto, limite);
    if (r.ok && r.sitios.length) {
      _buscadorBueno = i;                       // el que va, se queda
      _buscadorUsado = hostDe(b.url);
      _ultimoFallo = null;
      return r.sitios;
    }
    if (r.ok) {
      alguienContesto = true;
      _buscadorUsado = hostDe(b.url);
      // NUESTRO BUSCADOR YA HA PREGUNTADO POR TODOS. Si contesta que no hay
      // nada, es que no hay nada: seguir con Nominatim y Photon sería volver a
      // preguntar lo mismo, más despacio y peor. Y hacía algo peor todavía —
      // lo cazó el test del navegador: una respuesta vacía lo DEGRADABA, la
      // siguiente búsqueda empezaba por Photon y a partir de ahí la app ya no
      // volvía a usar el buscador bueno en toda la sesión.
      if (b.tipo === 'gym') {
        _buscadorBueno = i;
        _ultimoFallo = null;
        return r.sitios;
      }
      continue;                                 // contesta, pero no lo conoce
    }
    if (!primerFallo) primerFallo = `${r.motivo} (${hostDe(b.url)})`;
  }
  if (alguienContesto) {
    _ultimoFallo = null;                        // sin resultados, pero sin avería
    return [];
  }
  _ultimoFallo = BUSCADORES.length > 1
    ? `${primerFallo} — y el de repuesto tampoco contesta`
    : primerFallo;
  return [];   // sin buscador: se escribe a mano y ya está
}

/* --------------------------------------------------------------------------
 * SUGERENCIAS MIENTRAS SE ESCRIBE  (1-sep-2026)
 *
 * Carlos: *«que tú no puedas poner la dirección manualmente y veas que te vayan
 * saliendo diferentes opciones no tiene sentido»*. Tenía razón: lo que había
 * era una CASCADA de hasta cinco intentos con una espera de 1,1 s entre cada
 * uno —pensada para el botón «Buscar»— y desde una caja de texto eso son ocho
 * segundos mirando una pantalla quieta. Parece que no hace nada, y por eso
 * parecía que no hacía nada.
 *
 * Esto es un solo tiro de texto libre, que es lo que hace un buscador de mapas
 * de verdad: escribes «corte inglés diagon» y salen opciones. Sin cascada, sin
 * esperas y con el aborto de la petición anterior en cuanto llega otra tecla.
 * ------------------------------------------------------------------------ */
let _abortarSugerencia = null;

export async function sugerir(texto, limite = 6) {
  const t = String(texto || '').trim();
  // Tres letras: con dos, cualquier buscador devuelve medio país.
  if (t.length < 3) return [];
  // La búsqueda anterior ya no le importa a nadie: quien escribe ha cambiado
  // de idea. Sin esto, dos respuestas lentas pueden llegar en desorden y la
  // lista se queda con la de la palabra a medias.
  if (_abortarSugerencia) _abortarSugerencia();
  let vigente = true;
  _abortarSugerencia = () => { vigente = false; };

  /* ----------------------------------------------------------------------
   * DOS PREGUNTAS DISTINTAS, Y LAS DOS A LA VEZ.
   *
   * Carlos: «el McDonald's está en el carrer X, pero tú buscas McDonald's
   * para encontrarlo; nuestro mapa busca por dirección exacta y no por
   * nombre». Las dos cosas hacen falta y no son la misma:
   *
   *   · SITIOS   — lo que se llama así y está aquí al lado (Overpass).
   *                Es lo que uno quiere el 90 % de las veces, así que va
   *                primero. Solo se puede preguntar si se sabe dónde estás.
   *   · DIRECCIONES — la calle y el número (Nominatim / Photon), que es lo
   *                que sirve cuando el sitio no está en el mapa todavía.
   *
   * En paralelo, no una detrás de otra: encadenarlas doblaría la espera y
   * desde una caja de texto eso se lee como «no hace nada».
   * -------------------------------------------------------------------- */
  /* SI EL BUSCADOR ES EL NUESTRO, UNA SOLA PREGUNTA BASTA.
   *
   * El Worker ya hace las tres a la vez y devuelve la lista mezclada, así que
   * pedir aquí Overpass otra vez sería preguntar dos veces lo mismo. Y hay un
   * motivo más importante: `buscarSitios` no puede preguntar SIN SABER DÓNDE
   * ESTÁS, y esa línea —`if (!_cerca) return []`— era la que dejaba la
   * búsqueda por NOMBRE apagada justo en el caso de Carlos. En el servidor no
   * hace falta: Photon busca por nombre sin ubicación ninguna. */
  const direcciones = await buscarDireccion({ q: t }, limite);
  if (!vigente) return [];
  if (buscadorUsado() === hostDe(BUSCADORES[_buscadorBueno].url)
      && BUSCADORES[_buscadorBueno].tipo === 'gym') {
    return direcciones.slice(0, limite);
  }

  /* DE REPUESTO: si el Worker no contestó y estamos con Nominatim/Photon a
   * pelo, se pregunta a Overpass desde aquí como hasta ahora. Solo funciona si
   * se sabe dónde estás, pero es mejor que nada. */
  const deCerca = await buscarSitios(t, { limite }).catch(() => []);
  if (!vigente) return [];
  const resto = direcciones.filter((x) => !deCerca.some(
    (y) => distanciaM(y.lat, y.lon, Number(x.lat), Number(x.lon)) < 60));
  return [...deCerca, ...resto].slice(0, limite);
}

/* --------------------------------------------------------------------------
 * DÓNDE ESTOY  (1-sep-2026)
 *
 * Carlos, con el APK instalado: *«no te solicita la ubicación y entonces el
 * mapa aparece justo en el centro del mapa, por eso se ve todo azul, porque es
 * el mar»*. El centro del mapa es (0,0): el golfo de Guinea.
 *
 * Eran DOS fallos, y este es el segundo (el primero está en `pintarMapa`: un
 * `null` que se convertía en un cero):
 *   · la app nunca pedía la ubicación, y
 *   · el APK no tenía el permiso de Android, así que aunque la pidiera, el
 *     WebView la negaba por su cuenta y sin decirlo (arreglado en el manifiesto
 *     y en `MainActivity.onGeolocationPermissionsShowPrompt`).
 *
 * El corte propio es a propósito: dentro de un WebView, `getCurrentPosition`
 * puede no llamar NUNCA a ninguno de sus dos callbacks. Sin este reloj, el
 * botón se quedaría en «Buscándote…» para siempre.
 * ------------------------------------------------------------------------ */
/* --------------------------------------------------------------------------
 * SEGUNDA VUELTA: NO ERA EL PERMISO, ERA EL ORIGEN.  (2-sep-2026)
 *
 * Carlos, con la 0.20.0 ya instalada: *«no deja activar la ubicación y ni
 * siquiera pide el permiso, y he probado a forzarla desde los ajustes de mi
 * móvil y nada»*. Los dos permisos estaban puestos y aun así salía «no diste
 * permiso» sin que nadie preguntara nada. La causa raíz:
 *
 *   La app se sirve desde `http://appassets.androidplatform.net`, y Chromium
 *   —lo que hay dentro del WebView— BLOQUEA `navigator.geolocation` en
 *   cualquier origen que no sea seguro. Rechaza al instante con el mismo
 *   código que «el usuario ha dicho que no» (1), sin llamar al WebView, así
 *   que el diálogo de Android no llega a existir. Forzar el permiso a mano no
 *   servía de nada porque el permiso nunca fue el problema.
 *
 * Pasar la app a https arreglaría el origen, pero el origen es también la
 * llave de IndexedDB: cambiarlo es encontrarse la base vacía, y ahí viven los
 * pesos. Así que dentro del APK la ubicación la da el lado nativo
 * (`PuenteUbicacion.java`) y `navigator.geolocation` se queda de repuesto para
 * cuando la app corre como PWA, donde el origen sí es seguro.
 * ------------------------------------------------------------------------ */

/** ¿Estamos en un sitio donde el navegador nos deja pedir la ubicación? */
export function origenSeguro() {
  if (typeof window !== 'undefined' && typeof window.isSecureContext === 'boolean') {
    return window.isSecureContext;
  }
  return true;   // navegador viejo: que lo intente y que conteste él
}

/** ¿Está el puente nativo del APK? (en el navegador, no). */
export function hayPuenteNativo() {
  return !!(typeof window !== 'undefined' && window.GYM_ANDROID
            && typeof window.GYM_ANDROID.pedirUbicacion === 'function');
}

// Cada petición al puente lleva número: si se pulsa dos veces, la respuesta de
// la primera no puede contestar a la segunda.
let _nPeticion = 0;
const _esperando = new Map();

function prepararPuente() {
  if (typeof window === 'undefined' || window.__gymUbicacion) return;
  window.__gymUbicacion = (peticion, json) => {
    const contestar = _esperando.get(peticion);
    if (!contestar) return;
    _esperando.delete(peticion);
    try {
      contestar(JSON.parse(json));
    } catch (_) {
      contestar({ ok: false, motivo: 'el móvil contestó algo que no entiendo' });
    }
  };
}

/** La ubicación por el puente nativo del APK. */
/* --------------------------------------------------------------------------
 * UNA POSICIÓN SIN NÚMEROS NO ES UNA POSICIÓN.  (2-sep-2026, tarde)
 *
 * Carlos, con el APK puesto: *«al darle al icono de la ubicación me sale
 * NaN»*. Y en su captura, el pie del mapa decía literalmente «NaN, NaN» y el
 * mapa se quedaba en gris — porque con una latitud que no es un número no hay
 * ninguna tesela que pedir.
 *
 * De dónde salía ese NaN no se puede saber desde aquí (el puente nativo solo
 * existe dentro del APK). Lo que sí se puede es que no vuelva a pasar: una
 * respuesta que dice `ok` pero no trae dos números finitos NO es un `ok`. Es
 * la misma regla que ya costó el mapa en el golfo de Guinea, aplicada al otro
 * extremo del viaje: lo que falta tiene que seguir faltando.
 * ------------------------------------------------------------------------ */
function conNumeros(r) {
  if (!r || r.ok !== true) return r;
  // `Number(null)` es 0 y 0 es una coordenada finita: es la trampa que puso el
  // mapa en el golfo de Guinea. Un hueco tiene que seguir siendo un hueco.
  const nOnada = (v) => (v === null || v === undefined || v === '' ? NaN : Number(v));
  const lat = nOnada(r.lat);
  const lon = nOnada(r.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return { ok: false, motivo: 'el móvil ha contestado sin coordenadas' };
  }
  // Y dentro del mundo: una latitud de 91 es un error, no un sitio.
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return { ok: false, motivo: 'el móvil ha contestado una posición imposible' };
  }
  return { ...r, lat, lon };
}

function ubicacionNativa(espera) {
  prepararPuente();
  return new Promise((res) => {
    const id = ++_nPeticion;
    let contestado = false;
    const contestar = (r) => {
      if (contestado) return;
      contestado = true;
      clearTimeout(corte);
      _esperando.delete(id);
      res(conNumeros(r));
    };
    // El puente ya tiene su propio reloj de 15 s, pero un fallo del puente no
    // puede dejar el botón girando: este es el cinturón por si el tirante se
    // rompe.
    const corte = setTimeout(
      () => contestar({ ok: false, motivo: 'la ubicación tarda demasiado (¿GPS apagado?)' }),
      espera + 6000,
    );
    _esperando.set(id, contestar);
    try {
      window.GYM_ANDROID.pedirUbicacion(id);
    } catch (_) {
      contestar({ ok: false, motivo: 'este móvil no sabe decirme dónde estás' });
    }
  });
}

/**
 * Dónde estás. Y —desde la 0.27.0— QUIEN LO PREGUNTE SE LO CUENTA AL BUSCADOR.
 *
 * El diagnóstico de Carlos, 3-sep-2026, con estas dos líneas seguidas:
 *
 *     Y contesta        ✓ 41.15573, 1.11667 · ±100 m
 *     Qué dice cada uno  lo de cerca: SIN UBICACIÓN
 *
 * El móvil sabía perfectamente dónde estaba y la búsqueda decía que no. `_cerca`
 * solo se rellenaba desde el mapa (al arrastrarlo o al pulsar el mando de
 * centrarse), así que quien escribía en la caja sin tocar el mapa —o sea,
 * cualquiera— buscaba a ciegas. Y sin punto de partida no se le puede preguntar
 * a Overpass, que es justo el que sabe de sitios: «una frutería cerca de mí» era
 * imposible por construcción.
 *
 * Ahora hay UN solo camino: se pregunta la ubicación, y el que la recibe la
 * guarda. Da igual quién pregunte y para qué.
 */
export function miUbicacion({ espera = 12000 } = {}) {
  return sePregunta(espera).then((r) => {
    if (r && r.ok) buscarCerca(r.lat, r.lon);
    return r;
  });
}

/**
 * SE PREGUNTA AL ABRIR, NO CUANDO AL USUARIO SE LE OCURRA PULSAR EL BOTÓN.
 * (3-sep-2026, 0.30.0)
 *
 * Hasta ahora la app sabía dónde estabas SOLO si pulsabas «usar mi ubicación»
 * o arrastrabas el mapa. Escribir en la caja no era ninguna de esas dos cosas,
 * así que la primera búsqueda —la que uno hace nada más abrir— salía siempre a
 * ciegas. Es lo que le pasó a Carlos a las 13:15: «Mcdonald's» y seis
 * McDonald's de Murcia. A las 13:16, después de mover el mapa, su calle.
 *
 * No lanza, no bloquea y no mueve el mapa: mover el mapa es elegir un sitio, y
 * eso lo decide él. Solo deja el punto de partida puesto. Y si ya se sabe
 * —porque se recordó de la última vez— no se pregunta nada.
 *
 * Devuelve `true` solo si AHORA se sabe algo que antes no se sabía, que es la
 * única razón para repetir una búsqueda ya hecha.
 */
export async function situarme() {
  if (_cerca) return false;
  const r = await miUbicacion({ espera: 9000 }).catch(() => null);
  return !!(r && r.ok && _cerca);
}

function sePregunta(espera) {
  // Dentro del APK, SIEMPRE el puente: es el único que funciona ahí.
  if (hayPuenteNativo()) return ubicacionNativa(espera);
  return new Promise((res) => {
    if (!navigator.geolocation) {
      res({ ok: false, motivo: 'este móvil no sabe decirme dónde estás' });
      return;
    }
    // Decirlo en vez de mentir: en un origen no seguro el navegador contesta
    // «permiso denegado» aunque nadie haya denegado nada, y esa frase mandó a
    // Carlos a pelearse con los ajustes de su móvil para nada.
    if (!origenSeguro()) {
      res({
        ok: false,
        motivo: 'este navegador no deja usar la ubicación en una página sin https',
      });
      return;
    }
    let contestado = false;
    const contestar = (r) => {
      if (contestado) return;
      contestado = true;
      clearTimeout(corte);
      res(conNumeros(r));
    };
    const corte = setTimeout(
      () => contestar({ ok: false, motivo: 'la ubicación tarda demasiado (¿GPS apagado?)' }),
      espera + 1500,
    );
    navigator.geolocation.getCurrentPosition(
      (p) => contestar({
        ok: true,
        lat: p.coords.latitude,
        lon: p.coords.longitude,
        precision: Math.round(p.coords.accuracy || 0),
      }),
      (e) => contestar({
        ok: false,
        motivo: e && e.code === 1
          ? 'no diste permiso para usar tu ubicación'
          : e && e.code === 2
            ? 'el móvil no consigue situarte (¿GPS apagado?)'
            : 'la ubicación tarda demasiado',
      }),
      // `maximumAge` de un minuto: al dar de alta un gimnasio estás DENTRO del
      // gimnasio, y una posición de hace un minuto vale igual y llega al
      // instante en vez de encender el GPS otra vez.
      { enableHighAccuracy: true, timeout: espera, maximumAge: 60000 },
    );
  });
}

/* --------------------------------------------------------------------------
 * BUSCAR CERCA DE DONDE ESTÁS  (2-sep-2026)
 *
 * Carlos, mirando el buscador del setup: *«solo salen algunos viva gym pero
 * realmente no va»*. Y en su captura salían tres VivaGym… de Bilbao, Granada y
 * Málaga. Él está en Reus. No es que el buscador fallara: es que no sabía
 * desde dónde se preguntaba, así que ordenaba por lo que le parecía a él.
 *
 * Esto guarda dónde estás en cuanto se sabe —al pulsar «usar mi ubicación», o
 * al mover el mapa— y desde entonces las dos búsquedas van sesgadas hacia ahí.
 * NO se filtra por distancia: si el gimnasio está en otra ciudad tiene que
 * poder salir; lo que cambia es el ORDEN, que es lo que uno lee.
 * ------------------------------------------------------------------------ */
/* ---------------------------------------------------------------------------
 * SIEMPRE SE BUSCA DESDE ALGÚN SITIO.  (3-sep-2026, 0.30.0)
 *
 * Las tres capturas de Carlos traen la hora puesta, y con eso se lee solo:
 *
 *   13:15  «Mcdonald's»              → seis McDonald's de la Región de MURCIA.
 *   13:16  «Reus viva gym»           → Casa Viva (Reus), Gym Koryo (Reus)…
 *   13:17  «Corte ingles Tarragona»  → los dos de Tarragona y el de Reus.
 *
 * Entre la primera y la segunda arrastró el mapa. Eso es LO ÚNICO que cambió,
 * y con eso el buscador pasó de contestar Murcia a contestar su calle. O sea
 * que no estaba roto: es que hasta que no tocabas el mapa no sabía desde dónde
 * preguntar, y un buscador de mapas sin punto de partida ordena por lo que le
 * parece a él — que para «Mcdonald's» es un McDonald's cualquiera de España.
 *
 * Ningún buscador de mapas de verdad hace eso: buscan siempre desde algún
 * sitio, y cuando no saben dónde estás usan LO QUE HAY EN PANTALLA. Así que
 * aquí hay dos cosas, y hasta hoy solo existía la primera:
 *
 *   · `_cerca`    — DÓNDE ESTÁS. El GPS, o un mapa que has movido a propósito.
 *                   Es un dato tuyo. Es el único con el que se puede escribir
 *                   «a 300 m», porque esa frase habla de TI.
 *   · `_mirando`  — DESDE DÓNDE SE MIRA. El centro del mapa que hay puesto, sea
 *                   el que sea. NO es un dato: es una vista, y solo vale para
 *                   ORDENAR. Confundir una vista con un dato es exactamente lo
 *                   que puso la chincheta en el golfo de Guinea.
 *
 * Y `_cerca` se RECUERDA de una vez para otra. Vivía solo en memoria, así que
 * cada vez que se abría la app volvía a no saberse nada y la primera búsqueda
 * —la que uno hace— salía a ciegas otra vez. Se queda en el móvil, no sale de
 * él, y se borra al cerrar sesión.
 * ------------------------------------------------------------------------ */

/** Un punto de verdad, o nada. `Number(null)` es 0 y (0,0) es el golfo de Guinea. */
function punto(lat, lon) {
  const la = lat === null || lat === undefined || lat === '' ? NaN : Number(lat);
  const lo = lon === null || lon === undefined || lon === '' ? NaN : Number(lon);
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return null;
  if (Math.abs(la) > 90 || Math.abs(lo) > 180) return null;
  if (la === 0 && lo === 0) return null;
  return { lat: la, lon: lo };
}

const LLAVE_DONDE = 'gym.donde';

/** El almacén del navegador, o nada. En Node no existe y esto se prueba en Node. */
function cajon() {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch (_) {
    // Un navegador con las cookies capadas LANZA al tocar `localStorage`.
    return null;
  }
}

function loQueSeRecordaba() {
  const c = cajon();
  if (!c) return null;
  try {
    const g = JSON.parse(c.getItem(LLAVE_DONDE) || 'null');
    return g ? punto(g.lat, g.lon) : null;
  } catch (_) {
    return null;
  }
}

let _cerca = loQueSeRecordaba();
let _mirando = null;

export function buscarCerca(lat, lon) {
  const p = punto(lat, lon);
  if (!p) return;
  _cerca = p;
  const c = cajon();
  if (c) { try { c.setItem(LLAVE_DONDE, JSON.stringify(p)); } catch (_) { /* lleno */ } }
}

/**
 * Por dónde anda el mapa que hay en pantalla. Sirve para ORDENAR y para nada
 * más: no se guarda, no se recuerda y no escribe ninguna distancia.
 *
 * Y SOLO SI EL MAPA ESTÁ MIRANDO A ALGO. El centro de un mapa abierto sobre
 * España entera (z5) no es un sitio: es Madrid por geometría, y darle eso al
 * buscador es exactamente el «40.4, -3.7» a mano que se acaba de quitar. Desde
 * el zoom 8 —una comarca— el centro ya quiere decir algo.
 */
export const Z_MIRANDO = 8;

export function mirandoHacia(lat, lon, z) {
  if (!(Number(z) >= Z_MIRANDO)) return;
  const p = punto(lat, lon);
  if (p) _mirando = p;
}

/** Dónde estás. `null` si no se sabe. Es lo que permite decir «a 300 m». */
export function dondeSeBusca() {
  return _cerca;
}

/** Desde dónde se pregunta: tú si se sabe, y si no, lo que hay en pantalla. */
export function desdeDondeSeBusca() {
  return _cerca || _mirando;
}

/**
 * Olvidar dónde estabas. Se usa al cerrar sesión: la última posición conocida
 * es un dato de quien la dio, y quien entre después no tiene por qué heredarla.
 * Por eso se borra también del almacén del móvil, no solo de la memoria.
 */
export function olvidarDonde() {
  _cerca = null;
  _mirando = null;
  const c = cajon();
  if (c) { try { c.removeItem(LLAVE_DONDE); } catch (_) { /* da igual */ } }
}

/* --------------------------------------------------------------------------
 * BUSCAR POR NOMBRE, NO POR DIRECCIÓN  (2-sep-2026)
 *
 * Carlos, y tiene toda la razón: *«el McDonald's está en el carrer X, pero tú
 * buscas McDonald's para encontrarlo. Nuestro mapa busca por dirección exacta
 * y no por nombre»*.
 *
 * Y era literal. Los dos buscadores que había son GEOCODIFICADORES: convierten
 * un texto en unas coordenadas, y están hechos para direcciones. Nominatim lo
 * dice en su propia documentación; Photon aguanta mejor los nombres pero
 * también ordena por parecido de cadena sobre un índice mundial, así que
 * «Viva gym» le sale antes en Bilbao que en la calle de al lado.
 *
 * Lo que hace falta para «el McDonald's de aquí» es OTRA COSA: preguntar por
 * los sitios QUE HAY CERCA cuyo nombre se parezca. Eso en OpenStreetMap se
 * llama Overpass, es gratis, no lleva clave, y la pregunta es literalmente
 * «dame todo lo que se llame así en un radio de N metros alrededor de aquí».
 *
 *     nwr["name"~"mcdonald",i](around:12000, 41.1554, 1.1069);
 *
 * SOLO SE USA SI SE SABE DÓNDE ESTÁS. Sin un punto de partida no hay «around»
 * que valga, y preguntarle al planeta entero por «gym» no es una búsqueda: es
 * una forma cara de no contestar. Sin ubicación se sigue con los de siempre.
 *
 * Y va en `nube.json` como todo lo demás: si Overpass nos cierra la puerta, se
 * cambian dos líneas de un JSON y no se compila ningún APK.
 * ------------------------------------------------------------------------ */
const SITIOS_POR_DEFECTO = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
let SITIEROS = SITIOS_POR_DEFECTO.slice();
let _sitieroBueno = 0;

/** Lo que Overpass entiende como texto dentro de una expresión regular. */
function paraOverpass(texto) {
  return String(texto)
    .replace(/[\\"]/g, '\\$&')          // comillas y barras, que rompen la consulta
    .replace(/[.*+?^${}()|[\]]/g, '.'); // metacaracteres: se vuelven comodines
}

/**
 * Los sitios QUE HAY CERCA cuyo nombre se parezca. Nunca lanza.
 *
 * `radio` en metros. 12 km cubre una ciudad y su área sin pedirle a Overpass
 * medio país, que es lo que hace que conteste en un segundo y no en veinte.
 */
export async function buscarSitios(texto, { limite = 6, radio = 12000 } = {}) {
  await configurar();
  const t = String(texto || '').trim();
  // Overpass SÍ necesita un punto: pregunta «qué hay dentro de este círculo».
  // Pero ese punto no tiene por qué ser el GPS: el mapa que hay en pantalla
  // vale igual para mirar alrededor. Lo que NO vale es inventarse uno.
  const desde = desdeDondeSeBusca();
  if (t.length < 3 || !desde) return [];

  const consulta = `[out:json][timeout:12];`
    + `nwr["name"~"${paraOverpass(t)}",i]`
    + `(around:${radio},${desde.lat.toFixed(5)},${desde.lon.toFixed(5)});`
    + `out center ${Math.min(30, limite * 4)};`;

  for (let vuelta = 0; vuelta < SITIEROS.length; vuelta++) {
    const i = (_sitieroBueno + vuelta) % SITIEROS.length;
    const ctrl = new AbortController();
    const corte = setTimeout(() => ctrl.abort(), 14000);
    try {
      const r = await fetch(SITIEROS[i], {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(consulta)}`,
        signal: ctrl.signal,
      });
      if (!r.ok) continue;
      const datos = await r.json();
      _sitieroBueno = i;
      return deOverpass(datos, limite, desde);
    } catch (_) {
      // Que un servidor de sitios no conteste no puede tumbar la búsqueda: los
      // buscadores de direcciones siguen ahí y son los que de verdad hacen
      // falta para dar de alta un gimnasio.
    } finally {
      clearTimeout(corte);
    }
  }
  return [];
}

/**
 * Lo que contesta Overpass, en la misma forma que el resto de resultados.
 *
 * `desde` es el centro del círculo que se preguntó, y sirve para ORDENAR. Pero
 * la etiqueta «a 300 m» solo se escribe si ese centro eras TÚ: medir desde una
 * vista del mapa y llamarlo «a 300 m» es contarle al que lee una distancia que
 * no es la suya.
 */
function deOverpass(datos, limite, desde) {
  const fuera = [];
  for (const e of (datos && datos.elements) || []) {
    const tags = e.tags || {};
    if (!tags.name) continue;
    const lat = e.lat != null ? e.lat : (e.center && e.center.lat);
    const lon = e.lon != null ? e.lon : (e.center && e.center.lon);
    if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lon))) continue;
    const calle = [tags['addr:street'], tags['addr:housenumber']].filter(Boolean).join(', ');
    const ciudad = tags['addr:city'] || tags['addr:town'] || tags['addr:village'] || '';
    fuera.push({
      titulo: tags.name,
      direccion: [calle, ciudad].filter(Boolean).join(' · '),
      completa: [tags.name, calle, ciudad].filter(Boolean).join(', '),
      lat: Number(lat),
      lon: Number(lon),
      // Para que la pantalla pueda decir de dónde salió: uno de estos es «un
      // sitio que está aquí al lado», y el otro «una dirección que existe».
      deCerca: true,
      orden: desde ? Math.round(distanciaM(desde.lat, desde.lon, Number(lat), Number(lon))) : 1e9,
      metros: _cerca ? Math.round(distanciaM(_cerca.lat, _cerca.lon, Number(lat), Number(lon))) : null,
    });
  }
  // Lo más cercano primero: es lo que uno espera al buscar «McDonald's». Se
  // ordena por `orden` —la distancia al punto que se preguntó— y no por
  // `metros`, que se queda vacío a propósito cuando el punto no eras tú.
  fuera.sort((a, b) => a.orden - b.orden);
  // Un mismo sitio puede estar en OSM como nodo Y como recinto: se queda uno.
  // Se compara por DISTANCIA y no por coordenadas redondeadas: redondear a
  // tres decimales junta cosas que están a 80 m y separa cosas que están a 2,
  // según de qué lado del redondeo caigan. Es lo que hizo desaparecer una
  // dirección buena en la primera versión de esto.
  const unicos = [];
  for (const x of fuera) {
    const repetido = unicos.some((y) => y.titulo.toLowerCase() === x.titulo.toLowerCase()
      && distanciaM(y.lat, y.lon, x.lat, x.lon) < 80);
    if (!repetido) unicos.push(x);
  }
  return unicos.slice(0, limite);
}

/** Metros entre dos puntos. Haversine, que a esta escala sobra y basta. */
function distanciaM(la1, lo1, la2, lo2) {
  const R = 6371000;
  const p = Math.PI / 180;
  const a = 0.5 - Math.cos((la2 - la1) * p) / 2
    + Math.cos(la1 * p) * Math.cos(la2 * p) * (1 - Math.cos((lo2 - lo1) * p)) / 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Qué servidor contestó la última búsqueda. Para el diagnóstico. */
export function buscadorUsado() {
  return _buscadorUsado;
}
let _buscadorUsado = '';

function hostDe(url) {
  try { return new URL(url).hostname; } catch (_) { return String(url); }
}

/**
 * Un solo intento contra un solo servidor.
 *
 * Devuelve `{ok:true, sitios}` o `{ok:false, motivo}`. Nunca lanza: quien lo
 * llama tiene que poder seguir con el siguiente de la lista.
 */
async function unaBusqueda(b, p, texto, limite) {
  const ctrl = new AbortController();
  /* EL RELOJ DE FUERA TIENE QUE SER MÁS LARGO QUE EL DE DENTRO.
   *
   * Estaba en 8 s mientras el Worker se daba 12 para contestar: la app mataba a
   * su propio buscador —el único que puede identificarse ante Nominatim— y se
   * caía al repuesto. Lo dijo su diagnóstico con todas las letras: «el buscador
   * de direcciones tardó demasiado (gym.carlosparmar2006.workers.dev)». Ahora el
   * Worker se da 6 y aquí se esperan 11: si se agota ESTE, es que el Worker ni
   * está. */
  const corte = setTimeout(() => ctrl.abort(), b.tipo === 'gym' ? 11000 : 8000);
  try {
    const url = b.tipo === 'gym' ? urlGym(b.url, texto, limite)
      : b.tipo === 'photon' ? urlPhoton(b.url, texto, limite)
        : urlNominatim(b.url, p, limite);
    // NADA de cabecera `User-Agent`: es una cabecera PROHIBIDA en fetch y el
    // navegador la tira antes de mandar nada. Estaba puesta creyendo que
    // identificaba la app ante OSM y no identificaba nada. La identificación
    // que Nominatim SÍ acepta desde un navegador es el parámetro `email`.
    const r = await fetch(url, { headers: { Accept: 'application/json' }, signal: ctrl.signal });
    // SE GUARDA POR QUÉ FALLÓ. Antes esto era `return []` a secas, y entonces
    // «me están bloqueando» y «no hay ninguna calle así» se veían EXACTAMENTE
    // IGUAL en la pantalla: una lista vacía. Carlos: «no detecta calles». Con
    // un 403 delante, esa frase habría sido «el buscador no me deja» y habríamos
    // ido al sitio correcto a la primera.
    if (!r.ok) {
      return {
        ok: false,
        motivo: r.status === 403 || r.status === 429
          ? `el buscador de direcciones nos está limitando (${r.status})`
          : `el buscador de direcciones contestó ${r.status}`,
      };
    }
    const datos = await r.json();
    if (b.tipo === 'gym') {
      // Nuestro Worker contesta 200 aunque por dentro le hayan fallado los
      // tres. `ok:false` ahí dentro significa «no me ha contestado nadie», que
      // NO es lo mismo que «no existe ningún sitio así» — y confundir esas dos
      // cosas es lo que puso «No encuentro ese sitio» en la pantalla de Carlos
      // mientras la verdad era que le estaban dando con la puerta en las
      // narices. Lo que diga cada servicio se guarda para el diagnóstico.
      _detalleFuentes = (datos && datos.fuentes) || null;
      if (!datos || datos.ok !== true) {
        return { ok: false, motivo: (datos && datos.motivo) || 'el buscador no ha podido preguntar' };
      }
      return { ok: true, sitios: deGym(datos) };
    }
    return { ok: true, sitios: b.tipo === 'photon' ? dePhoton(datos) : deNominatim(datos) };
  } catch (e) {
    return {
      ok: false,
      motivo: (e && e.name === 'AbortError')
        ? 'el buscador de direcciones tardó demasiado'
        : 'no hay conexión con el buscador de direcciones',
    };
  } finally {
    clearTimeout(corte);
  }
}

/* Lo que se le pide a NUESTRO buscador: el texto, dónde estás si se sabe, y ya.
 * Toda la complicación —los tres servicios, el orden, los repetidos— vive en el
 * servidor, que es donde se puede probar de verdad. */
/** ¿El último `urlGym` salió con TU posición, o con una vista del mapa? */
let _ultimoDesdeMi = false;

function urlGym(base, texto, limite) {
  const partes = new URLSearchParams();
  partes.set('q', texto);
  partes.set('limite', String(limite));
  const desde = desdeDondeSeBusca();
  // Se apunta AQUÍ si el punto que se manda eras tú, porque la respuesta llega
  // después y para entonces puede haber llegado también el GPS: una distancia
  // medida desde una vista no puede acabar escrita como «a 300 m» de ti.
  _ultimoDesdeMi = !!_cerca;   // declarado arriba: un `let` leído antes revienta
  if (desde) {
    partes.set('lat', desde.lat.toFixed(5));
    partes.set('lon', desde.lon.toFixed(5));
  }
  return `${base}?${partes.toString()}`;
}

/**
 * Ya viene en la forma buena, pero se filtra IGUAL.
 *
 * Que el servidor sea nuestro no lo convierte en de fiar: se despliega solo, se
 * puede quedar en una versión vieja, y un día puede contestar otra cosa. Lo que
 * llega de fuera de la app pasa por el mismo filtro venga de quien venga.
 *
 * Y `Number(null)` es 0. Es la trampa que ya puso el mapa en el golfo de Guinea
 * y que volvió por la puerta de la ubicación; aquí volvió a asomar por tercera
 * vez, y por partida doble: un sitio sin coordenadas se colaba como (0,0), y
 * una distancia que no se sabe —`metros: null`— se convertía en «a 0 m», que es
 * un dato inventado con toda la pinta de ser bueno. Lo cazó el test.
 */
function deGym(datos) {
  const nOnada = (v) => (v === null || v === undefined || v === '' ? NaN : Number(v));
  return ((datos && datos.sitios) || [])
    .map((s) => ({
      titulo: String(s.titulo || ''),
      direccion: String(s.direccion || ''),
      completa: String(s.completa || ''),
      lat: nOnada(s.lat),
      lon: nOnada(s.lon),
      deCerca: s.fuente === 'cerca',
      metros: _ultimoDesdeMi && Number.isFinite(nOnada(s.metros))
        ? Math.round(nOnada(s.metros)) : null,
    }))
    .filter((s) => s.titulo
      && Number.isFinite(s.lat) && Number.isFinite(s.lon)
      && Math.abs(s.lat) <= 90 && Math.abs(s.lon) <= 180
      && !(s.lat === 0 && s.lon === 0));
}

/** Qué contestó cada servicio en la última búsqueda. Solo para el diagnóstico. */
let _detalleFuentes = null;
export function detalleFuentes() {
  return _detalleFuentes;
}

function urlNominatim(base, p, limite) {
  const partes = new URLSearchParams();
  for (const k of ['q', 'street', 'city']) {
    if (p[k] && String(p[k]).trim()) partes.set(k, String(p[k]).trim());
  }
  partes.set('format', 'json');
  // Identificarse es la primera regla de uso de Nominatim. Desde un navegador
  // no se puede tocar el `User-Agent`, así que se hace por aquí.
  partes.set('email', AGENTE_CONTACTO);
  partes.set('addressdetails', '1');
  // countrycodes=es acota a España: menos ruido y menos sitios homónimos.
  partes.set('countrycodes', 'es');
  partes.set('limit', String(limite));
  // Y si se sabe dónde estás, se le da una caja de ~55 km alrededor. `bounded=0`
  // es lo importante: es una PREFERENCIA, no un filtro — un gimnasio de otra
  // ciudad sigue pudiendo salir, solo que después.
  const desde = desdeDondeSeBusca();
  if (desde) {
    const d = 0.5;
    partes.set('viewbox', [
      (desde.lon - d).toFixed(4), (desde.lat + d).toFixed(4),
      (desde.lon + d).toFixed(4), (desde.lat - d).toFixed(4),
    ].join(','));
    partes.set('bounded', '0');
  }
  return `${base}?${partes.toString()}`;
}

function urlPhoton(base, texto, limite) {
  const partes = new URLSearchParams();
  partes.set('q', texto);
  partes.set('limit', String(limite));
  // Sin `lang`: Photon solo admite default/en/de/fr y con `es` devuelve un 400.
  // Estuvo puesto desde la primera versión, así que este repuesto nunca ha
  // llegado a contestar. Lo destapó el diagnóstico del móvil de Carlos.

  /* Photon no tiene filtro de país: ORDENA por cercanía a un punto y no
   * excluye nada. Aquí había un «si no se sabe, el centro de la península
   * (40.4, -3.7)», o sea Madrid puesto a mano. Eso no era saber dónde estás:
   * era decirle a Photon que Carlos vive en Madrid. Ahora el punto sale de
   * `desdeDondeSeBusca()` —tú, o el mapa que hay en pantalla— y cuando de
   * verdad no hay ninguno no se manda nada, que es lo honrado. */
  const desde = desdeDondeSeBusca();
  if (desde) {
    partes.set('lat', desde.lat.toFixed(4));
    partes.set('lon', desde.lon.toFixed(4));
  }
  return `${base}?${partes.toString()}`;
}

function deNominatim(datos) {
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
}

/**
 * Photon contesta GeoJSON, no la lista plana de Nominatim.
 *
 * Las coordenadas vienen en `geometry.coordinates` y —esto es lo que se cuela
 * siempre— en orden **[longitud, latitud]**, que es el del estándar GeoJSON y
 * el contrario al que usa todo el mundo al hablar. Cambiarlos deja el gimnasio
 * en mitad del mar de Noruega. Hay un test que lo comprueba.
 */
function dePhoton(datos) {
  return ((datos && datos.features) || []).map((f) => {
    const p = f.properties || {};
    const c = (f.geometry && f.geometry.coordinates) || [];
    const calle = [p.street, p.housenumber].filter(Boolean).join(', ');
    const ciudad = p.city || p.town || p.village || p.county || '';
    const completa = [p.name, calle, ciudad, p.state, p.country].filter(Boolean).join(', ');
    return {
      titulo: p.name || calle || ciudad || completa.split(',')[0],
      direccion: [calle, ciudad].filter(Boolean).join(' · ') || completa.split(',').slice(1, 3).join(','),
      completa,
      lat: Number(c[1]),
      lon: Number(c[0]),
    };
  }).filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lon));
}

/* --------------------------------------------------------------------------
 * EL MAPA  (rehecho el 1-sep-2026)
 *
 * Carlos: *«el mapa está roto»* y *«en las primeras versiones tenías un mapa
 * abajo con el que podías interactuar»*.
 *
 * Tenía razón dos veces:
 *
 * 1. EL PIN NO ESTABA EN EL SITIO. `.mapa-pin` es `position:absolute` y no
 *    tenía `left` ni `top`, así que caía en su posición estática —la esquina
 *    superior izquierda— y encima con `margin:-22px`, o sea medio fuera del
 *    lienzo, recortado por el `overflow:hidden`. El mapa se dibujaba bien y la
 *    chincheta señalaba a un rincón. Medido: pin en (0,0) sobre un lienzo de
 *    312×214, donde tenía que estar en (156,107).
 *
 * 2. NO SE PODÍA TOCAR. Eran 3×3 teselas fijas: si Nominatim te dejaba dos
 *    calles más allá, no había forma de corregirlo.
 *
 * CÓMO FUNCIONA AHORA
 * -------------------
 * · Se arrastra con el dedo. El pin se queda QUIETO en el centro y lo que se
 *   mueve es el mapa por debajo: así el sitio que estás eligiendo es siempre el
 *   del centro, que es lo que la chincheta señala. Lo contrario —mover el pin
 *   sobre un mapa quieto— obliga a apuntar con el dedo tapando justo el punto.
 * · Botones de acercar y alejar, de 44 px, porque en el móvil el pellizco de
 *   dos dedos dentro de una hoja que también hace scroll es una pelea.
 * · `alMover(lat, lon)` avisa de la posición nueva. Es lo que hace que el mapa
 *   sirva para ALGO: la dirección que se guarda es la que has dejado en el
 *   centro, no la que adivinó el buscador.
 * · Y SI LAS TESELAS NO CARGAN, SE DICE. Antes cada imagen que fallaba se
 *   escondía (`visibility:hidden`) y quedaba un rectángulo gris con un pin: la
 *   definición exacta de «está roto» sin una pista de por qué. Ahora, si falla
 *   la mayoría, sale escrito qué ha pasado — y las coordenadas siguen ahí, que
 *   es el dato que de verdad se guarda.
 *
 * Sigue sin librerías: son imágenes de 256 px colocadas con `left`/`top`.
 * Meter Leaflet sería bajarse una librería de un CDN y el APK tiene que abrir
 * sin red.
 * ------------------------------------------------------------------------ */

/** Latitud/longitud a píxel del mundo entero, en el zoom `z`. */
function aPixel(lat, lon, z) {
  const mundo = 256 * 2 ** z;
  const x = ((lon + 180) / 360) * mundo;
  const senoLat = Math.sin((lat * Math.PI) / 180);
  const y = (0.5 - Math.log((1 + senoLat) / (1 - senoLat)) / (4 * Math.PI)) * mundo;
  return { x, y, mundo };
}

/** Y al revés: del píxel del mundo a latitud/longitud. */
function aLatLon(x, y, z) {
  const mundo = 256 * 2 ** z;
  const lon = (x / mundo) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * y) / mundo;
  const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  return { lat, lon };
}

const Z_MIN = 3;
const Z_MAX = 19;

/**
 * Pinta un mapa centrado en (lat, lon) dentro de `contenedor`.
 *
 * @param opciones.z          zoom inicial (3-19)
 * @param opciones.alMover    (lat, lon) cada vez que se mueve o se hace zoom
 * @param opciones.interactivo  a falso, un mapa de solo mirar
 */
export function pintarMapa(contenedor, lat, lon, opciones = {}) {
  // No se espera: `configurar()` ya se pidió al arrancar y con las teselas por
  // defecto el mapa se pinta igual. Bloquear el dibujo por leer un JSON dejaría
  // el hueco gris que ya nos costó una tarde.
  configurar();
  // Compatibilidad: antes el cuarto argumento era el zoom a secas.
  const op = typeof opciones === 'number' ? { z: opciones } : (opciones || {});
  let alMover = typeof op.alMover === 'function' ? op.alMover : null;
  const interactivo = op.interactivo !== false;

  contenedor.innerHTML = '';
  contenedor.className = 'mapa';

  // NI UN MAPA EN MITAD DEL MAR NUNCA MÁS.  (1-sep-2026)
  //
  // Este `if` ya estaba; lo que faltaba es que quien llama no colara un cero.
  // `Number(null)` es 0, y 0 es finito: un gimnasio de la nube sin coordenadas
  // llegaba aquí como (0, 0) y el mapa pintaba el golfo de Guinea con un pin en
  // medio. El arreglo de verdad está en quien llama (app.js y bienvenida.js),
  // pero (0, 0) tampoco es un sitio: es lo que sale cuando falta el dato.
  const enElMar = Math.abs(lat) < 0.01 && Math.abs(lon) < 0.01;

  /* ------------------------------------------------------------------------
   * EL MAPA SE PINTA SIEMPRE.  (2-sep-2026)
   *
   * Carlos, tercera vuelta: *«los mapas no se cargan»*. Y no se cargaban
   * porque hasta ahora, sin coordenadas, aquí no se pintaba NINGÚN mapa: salía
   * un recuadro de puntitos con un botón. O sea que quien abría el alta de un
   * gimnasio no llegaba a ver un mapa nunca, y por tanto tampoco podía saber
   * si las imágenes llegaban o no.
   *
   * Ahora sin coordenadas se pinta el mapa igual, abierto sobre el país, y se
   * arrastra hasta la puerta —que es como funciona cualquier mapa— con el
   * botón de «usar mi ubicación» encima para saltarse el paseo.
   *
   * LO QUE FALTA SIGUE FALTANDO: mientras no se toque el mapa, `alMover` NO se
   * llama y el gimnasio se guarda SIN coordenadas. Un centro por defecto es
   * una vista, no un dato, y confundir las dos cosas es exactamente lo que
   * puso la chincheta en el golfo de Guinea.
   * --------------------------------------------------------------------- */
  const faltaSitio = !Number.isFinite(lat) || !Number.isFinite(lon) || enElMar;
  // Un sitio de partida razonable para mirar: lo que diga quien llama (el
  // último gimnasio, por ejemplo) y, si no, España entera.
  const centroPorDefecto = (op.centro && Number.isFinite(op.centro.lat)
    && Number.isFinite(op.centro.lon) && !(Math.abs(op.centro.lat) < 0.01 && Math.abs(op.centro.lon) < 0.01))
    ? { lat: op.centro.lat, lon: op.centro.lon, z: 12 }
    : { lat: 40.4168, lon: -3.7038, z: 5 };

  let confirmado = !faltaSitio;
  // Si el mapa nace ya sobre un sitio de verdad —editar un gimnasio que ya
  // tiene dirección—, eso también es saber desde dónde buscar.
  if (!faltaSitio) buscarCerca(lat, lon);
  let cLat = faltaSitio ? centroPorDefecto.lat : lat;
  let cLon = faltaSitio ? centroPorDefecto.lon : lon;
  let z = faltaSitio
    ? centroPorDefecto.z
    : Math.min(Z_MAX, Math.max(Z_MIN, Number(op.z) || 16));
  /* Y AUNQUE FALTE EL SITIO, EL MAPA ESTÁ MIRANDO A ALGÚN LADO.  (0.30.0)
   *
   * Esto no dice dónde estás ni se guarda en ningún gimnasio: dice desde dónde
   * se ordena la lista mientras no se sepa nada mejor. Es la diferencia entre
   * que «Mcdonald's» conteste lo que hay donde miras o seis de Murcia.
   *
   * VA DESPUÉS DE `z`, y no es un detalle de estilo: `z` es un `let` y leerlo
   * antes de su línea no vale `undefined`, LANZA. Puesto tres líneas más
   * arriba, `pintarMapa` reventaba entero y el mapa no se pintaba. Es la misma
   * trampa que ya está apuntada para `repetirBusqueda`, y ha vuelto a morder. */
  mirandoHacia(cLat, cLon, z);

  const lienzo = document.createElement('div');
  lienzo.className = 'mapa-lienzo' + (interactivo ? ' mapa-vivo' : '');
  const capa = document.createElement('div');
  capa.className = 'mapa-capa';
  lienzo.appendChild(capa);

  // El pin, QUIETO en el centro. Con `left`/`top` de verdad, que es lo que
  // faltaba: sin ellos caía en la esquina.
  const pin = document.createElement('span');
  pin.className = 'mapa-pin';
  pin.innerHTML = icono('pin', 26);
  lienzo.appendChild(pin);

  const queja = document.createElement('p');
  queja.className = 'mapa-queja';
  queja.hidden = true;
  lienzo.appendChild(queja);

  contenedor.appendChild(lienzo);

  const pie = document.createElement('div');
  pie.className = 'mapa-pie';
  const coords = document.createElement('span');
  coords.className = 'mapa-coords';
  const enlaces = document.createElement('span');
  enlaces.className = 'mapa-enlaces';
  pie.appendChild(coords);
  pie.appendChild(enlaces);
  contenedor.appendChild(pie);

  /* ------------------------------------------------------------------------
   * LA BARRA DE «AÚN NO ESTÁ PUESTO».
   *
   * Sale mientras el sitio no está fijado y desaparece en cuanto lo está. Es
   * la única señal de que ese mapa bonito todavía no es la dirección de nadie,
   * y va con TEXTO además del sitio del pie: el color no puede ser el único
   * indicador de nada.
   * --------------------------------------------------------------------- */
  let fijar = null;
  if (interactivo) {
    fijar = document.createElement('div');
    fijar.className = 'mapa-fijar';
    fijar.hidden = confirmado;
    fijar.innerHTML = '<p class="mapa-fijar-t">Arrastra el mapa hasta la puerta del '
      + 'gimnasio, o:</p>'
      + `<button type="button" class="boton boton-2 mapa-yo">${icono('pin', 17)} `
      + 'Usar mi ubicación</button>'
      + '<p class="mapa-fijar-p" hidden></p>';
    contenedor.appendChild(fijar);
    const boton = fijar.querySelector('.mapa-yo');
    // UNA nota, no una pila de notas. Antes cada intento fallido añadía otro
    // párrafo debajo: Carlos pulsó tres veces y le salió tres veces el mismo
    // texto, uno detrás de otro.
    const nota = fijar.querySelector('.mapa-fijar-p');
    boton.onclick = async () => {
      boton.disabled = true;
      const antes = boton.innerHTML;
      boton.textContent = 'Buscándote…';
      nota.hidden = true;
      const r = await miUbicacion();
      boton.disabled = false;
      boton.innerHTML = antes;
      if (!r.ok) {
        nota.hidden = false;
        nota.textContent = `${r.motivo}. Arrastra el mapa hasta el gimnasio: se guarda igual.`;
        return;
      }
      if (!irA(r.lat, r.lon)) {
        nota.hidden = false;
        nota.textContent = 'el móvil ha contestado sin coordenadas. Arrastra el mapa '
          + 'hasta el gimnasio: se guarda igual.';
        return;
      }
      queja.hidden = true;
    };
  }

  if (interactivo) {
    const mandos = document.createElement('div');
    mandos.className = 'mapa-mandos';
    mandos.innerHTML =
      '<button type="button" class="mapa-zoom" data-z="1" aria-label="Acercar">+</button>'
      + '<button type="button" class="mapa-zoom" data-z="-1" aria-label="Alejar">−</button>'
      // Centrarse en uno mismo estando ya el mapa pintado: es lo que se
      // necesita cuando el buscador te ha dejado en la calle de al lado y el
      // gimnasio es justo donde estás.
      + `<button type="button" class="mapa-zoom mapa-aqui" aria-label="Centrar donde estoy">${icono('pin', 18)}</button>`;
    lienzo.appendChild(mandos);
    mandos.querySelector('.mapa-aqui').onclick = async (e) => {
      e.preventDefault();
      const boton = mandos.querySelector('.mapa-aqui');
      boton.disabled = true;
      const r = await miUbicacion();
      boton.disabled = false;
      if (!r.ok) {
        queja.hidden = false;
        queja.textContent = `${r.motivo}. Mueve el mapa con el dedo hasta el gimnasio.`;
        return;
      }
      if (!irA(r.lat, r.lon)) {
        queja.hidden = false;
        queja.textContent = 'el móvil ha contestado sin coordenadas. Mueve el mapa con '
          + 'el dedo hasta el gimnasio.';
        return;
      }
      queja.hidden = true;
    };
    mandos.querySelectorAll('.mapa-zoom').forEach((b) => (b.onclick = (e) => {
      e.preventDefault();
      const nuevo = Math.min(Z_MAX, Math.max(Z_MIN, z + Number(b.dataset.z)));
      if (nuevo === z) return;
      z = nuevo;
      dibujar();
      avisar(false);          // acercar no es elegir
    }));
  }

  /**
   * Llevar el mapa a un sitio. Devuelve `false` si eso no es un sitio.
   *
   * Es el ÚNICO camino por el que el centro del mapa se mueve a unas
   * coordenadas que vienen de fuera, y por eso el filtro está aquí y no
   * repartido por los dos botones: `cLat = r.lat` escrito a pelo es como el
   * pie del mapa acabó diciendo «NaN, NaN» en el móvil de Carlos.
   */
  function irA(la, lo, zoom = 17) {
    const nLa = Number(la);
    const nLo = Number(lo);
    if (!Number.isFinite(nLa) || !Number.isFinite(nLo)) return false;
    if (Math.abs(nLa) > 90 || Math.abs(nLo) > 180) return false;
    cLat = nLa;
    cLon = nLo;
    z = Math.min(Z_MAX, Math.max(Z_MIN, zoom));
    // Si ya sabemos dónde está esta persona, las búsquedas de después van
    // ordenadas desde aquí. Es lo que evita que buscando «Viva gym» desde Reus
    // salgan los de Bilbao, Granada y Málaga.
    buscarCerca(nLa, nLo);
    dibujar();
    avisar(true);
    return true;
  }

  /**
   * Repinta el pie y, SOLO si el sitio está fijado, se lo cuenta a quien llama.
   *
   * `confirma` es lo que separa «he mirado el mapa» de «he dicho que es aquí».
   * Acercar o alejar no fija nada; arrastrar el mapa o pulsar «usar mi
   * ubicación», sí. Mientras no esté fijado, el gimnasio se guarda sin
   * coordenadas: es la regla de que lo que falta tiene que seguir faltando.
   */
  function avisar(confirma) {
    if (confirma) confirmado = true;
    // ÚLTIMA BARRERA. Si algo consigue meter un NaN aquí dentro, el pie dice
    // «sitio sin fijar» —que es la verdad— en vez de «NaN, NaN», que es lo que
    // vio Carlos y no significa nada para quien lo lee.
    const hayCoords = Number.isFinite(cLat) && Number.isFinite(cLon);
    if (!hayCoords) confirmado = false;
    coords.textContent = confirmado
      ? `${cLat.toFixed(5)}, ${cLon.toFixed(5)}`
      : 'sitio sin fijar';
    enlaces.innerHTML = confirmado
      ? `<a href="https://www.openstreetmap.org/?mlat=${cLat}&mlon=${cLon}#map=17/${cLat}/${cLon}"
          target="_blank" rel="noopener">OpenStreetMap</a>`
        + `<a href="https://www.google.com/maps/search/?api=1&query=${cLat},${cLon}"
          target="_blank" rel="noopener">Google Maps</a>`
      : '';
    if (fijar) fijar.hidden = confirmado;
    // El pin flojo mientras no hay nada elegido: un pin firme sobre un centro
    // por defecto se lee como «ya está puesto», y no lo está.
    pin.classList.toggle('mapa-pin-flojo', !confirmado);
    if (confirmado && alMover) alMover(cLat, cLon);
  }

  // Cada pintada lleva número. Las imágenes de la pintada anterior siguen
  // vivas hasta que el navegador termina de darlas por perdidas, y sus
  // `onerror` llegaban tarde: contaban fallos de un dibujo que ya no existe y
  // podían empujar al siguiente servidor de teselas sin motivo.
  let generacion = 0;

  function dibujar() {
    const mia = ++generacion;
    const ancho = lienzo.clientWidth || 312;
    const alto = lienzo.clientHeight || Math.round((ancho * 11) / 16);
    const { x: cx, y: cy } = aPixel(cLat, cLon, z);
    // Esquina superior izquierda del lienzo, en píxeles del mundo.
    const x0 = cx - ancho / 2;
    const y0 = cy - alto / 2;
    const lado = 2 ** z;

    capa.innerHTML = '';
    let pedidas = 0;
    let fallidas = 0;

    for (let ty = Math.floor(y0 / 256); ty <= Math.floor((y0 + alto) / 256); ty++) {
      if (ty < 0 || ty >= lado) continue;              // fuera del mundo por arriba o por abajo
      for (let tx = Math.floor(x0 / 256); tx <= Math.floor((x0 + ancho) / 256); tx++) {
        const envuelto = ((tx % lado) + lado) % lado;  // el mundo da la vuelta en horizontal
        const img = document.createElement('img');
        img.alt = '';
        img.draggable = false;
        // NADA de loading="lazy": las teselas van dentro de una capa colocada a
        // mano y el navegador las daba por «fuera de pantalla», así que no
        // bajaba ninguna y el mapa salía en blanco.
        img.src = `${teselero()}/${z}/${envuelto}/${ty}.png`;
        img.style.left = `${tx * 256 - x0}px`;
        img.style.top = `${ty * 256 - y0}px`;
        pedidas++;
        img.onerror = () => {
          if (mia !== generacion) return;   // resto de una pintada vieja
          img.style.visibility = 'hidden';
          fallidas++;
          // Solo se reacciona si falla la MAYORÍA. Una tesela suelta que no
          // llega es un hueco gris y no merece ni un cartel ni un cambio de
          // servidor.
          if (fallidas > pedidas / 2) {
            // PRIMERO SE PRUEBA EL SIGUIENTE SERVIDOR, y solo si no queda
            // ninguno se pone el cartel. Esto es lo que arregla el «no se ve el
            // mapa» sin tener que compilar un APK nuevo: si OpenStreetMap nos
            // rechaza, en el mismo dibujo se pasa a CARTO y el mapa aparece.
            if (siguienteTeselero()) {
              queja.hidden = true;
              dibujar();
              return;
            }
            queja.hidden = false;
            queja.textContent = 'No se ven las imágenes del mapa: no contesta ninguno de '
              + `los ${TESELEROS.length} servidores (¿sin conexión?). Las coordenadas de `
              + 'abajo son correctas y se guardan igual.';
          }
        };
        capa.appendChild(img);
      }
    }
  }

  if (interactivo) {
    let arrastrando = false;
    let idPuntero = null;
    let x0 = 0;
    let y0 = 0;
    let latIni = 0;
    let lonIni = 0;

    lienzo.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.mapa-zoom')) return;
      arrastrando = true;
      idPuntero = e.pointerId;
      x0 = e.clientX;
      y0 = e.clientY;
      latIni = cLat;
      lonIni = cLon;
      lienzo.setPointerCapture(idPuntero);
      lienzo.classList.add('arrastrando');
    });

    lienzo.addEventListener('pointermove', (e) => {
      if (!arrastrando || e.pointerId !== idPuntero) return;
      // Se recalcula SIEMPRE desde el punto donde empezó el arrastre, no
      // sumando incrementos: sumando, el redondeo de cada paso se acumula y el
      // mapa se va yendo solo.
      const { x, y } = aPixel(latIni, lonIni, z);
      const sitio = aLatLon(x - (e.clientX - x0), y - (e.clientY - y0), z);
      cLat = Math.max(-85, Math.min(85, sitio.lat));
      cLon = ((((sitio.lon + 180) % 360) + 360) % 360) - 180;
      dibujar();
    });

    const soltar = (e) => {
      if (!arrastrando || (e && e.pointerId !== idPuntero)) return;
      arrastrando = false;
      lienzo.classList.remove('arrastrando');
      // Arrastrar SÍ es elegir: has movido el mapa a propósito hasta un sitio.
      buscarCerca(cLat, cLon);
      avisar(true);
    };
    lienzo.addEventListener('pointerup', soltar);
    lienzo.addEventListener('pointercancel', soltar);
  }

  // El lienzo mide 0 hasta que está en el documento y el navegador ha hecho su
  // reparto. Se dibuja ya (por si acaso) y otra vez cuando se sepa el tamaño.
  dibujar();
  requestAnimationFrame(dibujar);
  if (typeof ResizeObserver === 'function') {
    const ro = new ResizeObserver(() => dibujar());
    ro.observe(lienzo);
  }
  // El pie de salida, sin avisar a nadie: pintar un mapa no es elegir un sitio.
  const alMoverDeVerdad = alMover;
  alMover = null;
  avisar(false);
  alMover = alMoverDeVerdad;

  // Quien lo pinta puede preguntarle dónde ha quedado, sin escuchar cada paso.
  // `fijado` es lo que de verdad importa: si es `false`, no hay coordenadas que
  // guardar por mucho que el mapa esté enseñando un sitio.
  return { donde: () => ({ lat: cLat, lon: cLon, z, fijado: confirmado }) };
}
