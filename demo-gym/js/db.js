/* =============================================================================
 * db.js — Base de datos local del móvil (IndexedDB).
 *
 * REGLA DE ORO: la app tiene que funcionar en el gimnasio SIN COBERTURA.
 * Por eso el dato de verdad nace aquí, en el móvil, y el PC es un espejo al
 * que sincronizamos cuando hay WiFi. Nunca al revés: si el PC está apagado,
 * Carlos sigue apuntando series como si nada.
 *
 * Para que la sincronización sea sencilla y no pierda datos, TODO registro
 * lleva tres campos de control:
 *    id   — uuid, generado en el móvil (no autoincremental: chocaría con el PC)
 *    act  — "actualizado", epoch ms. Gana el más reciente (last-write-wins).
 *    del  — borrado lógico (0/1). Nunca se borra físicamente hasta sincronizar,
 *           si no el PC resucitaría lo borrado en el siguiente cruce.
 * ========================================================================== */

const NOMBRE_BD = 'gymdb';
// v2: nutrición (alimentos, comidas, objetivos).
// v3: peso corporal, platos guardados, vínculos foto→producto y cola de fotos.
// v4: momentos del día propios (preentreno y demás).
// v5: metas (objetivos) y calendario de entrenos.
// v6: perfil (alias, bio, medallas elegidas, anotaciones) y su foto.
// Subir este número crea los almacenes que falten SIN tocar los datos que Carlos
// ya tiene: `onupgradeneeded` solo crea los que no existen. Se probó ABRIENDO
// una base v2 con datos dentro, no una recién hecha — que es justo el error que
// dejó pasar el `no such column: speaker` de JARVIS.
// v7: vestuario (la colección de cosméticos, el magnesio y qué llevas puesto).
// Probado ABRIENDO una base v6 con datos dentro, no una recién hecha: es la
// misma comprobación que se hizo al pasar de la v2, y por el mismo motivo.
// v8: `peliculas` — los efectos ya renderizados que se DESCARGAN (0.37.0). Ver
// `peliculas.js`. Probado igual: abriendo una v7 con series dentro.
const VERSION_BD = 8;

/** Almacenes y sus índices. */
const ALMACENES = {
  gimnasios: ['act'],
  maquinas: ['gimnasioId', 'act'],
  medios: ['maquinaId', 'act'],
  series: ['maquinaId', 'sesionId', 'fecha', 'act'],
  sesiones: ['gimnasioId', 'fecha', 'act'],
  rutinas: ['act'],
  // --- nutrición ---
  alimentos: ['nombre', 'act'],   // ficha de un alimento: macros por 100 g
  comidas: ['fecha', 'act'],      // lo que se comió un día concreto
  objetivos: ['act'],             // objetivo diario (una sola fila)
  pesos: ['fecha', 'act'],        // peso corporal, una pesada por día
  platos: ['nombre', 'act'],      // receta reutilizable: «mi desayuno»
  // vinculos: lo que la foto detecta («crema de arroz») → el producto CONCRETO
  // que usa Carlos (Hero 0% azúcar). Es lo que hace que la segunda foto ya no
  // pregunte. Indexado por el nombre detectado, en minúsculas y sin tildes.
  vinculos: ['detectado', 'act'],
  // Momentos del día propios de Carlos («preentreno», «postentreno»…). Los de
  // fábrica viven en el código; aquí solo van los que se inventa él.
  momentos: ['act'],
  // --- objetivos y calendario (v0.12.0) ---
  // `metas` son objetivos con fecha: bajar a 74 kg, comer 2.400 kcal, hacer
  // press de banca a 80 kg × 8, o batir el récord de una máquina. El progreso
  // NO se guarda: se calcula de las series y las pesadas que ya hay, porque un
  // progreso guardado se queda viejo en cuanto apuntas algo.
  metas: ['tipo', 'act'],
  // `calendario` es qué toca cada día: una rutina, descanso, o nada dicho. Una
  // fila por día, y solo de los días que Carlos ha tocado.
  calendario: ['fecha', 'act'],
  // --- perfil (v0.15.0) ---
  // UNA sola fila, con id fijo 'yo'. Alias, bio, anotaciones y qué medallas
  // quiere lucir. Lo que se GANA (insignias, racha, veteranía) NO se guarda:
  // se calcula de las series cada vez, igual que el progreso de las metas. Un
  // logro guardado se queda viejo el día que se corrige una serie mal apuntada.
  perfil: ['act'],
  // --- vestuario (v0.32.0) ---
  // UNA sola fila, id fijo 'yo'. Qué piezas tienes, cuál llevas puesta, cuánto
  // magnesio y cuántas cajas has ABIERTO. Cuántas te has GANADO no se guarda:
  // sale de tus series, como la racha (ver `cajas.js`).
  vestuario: ['act'],
  ajustes: [],
};

// La cola de fotos NO se sincroniza: son JPEG de 1-2 MB que solo tienen sentido
// hasta que se analizan. Viven aquí a propósito, fuera de ALMACENES_SYNC.
const ALMACEN_COLA = 'colaFotos';
ALMACENES[ALMACEN_COLA] = ['creado'];

// Los efectos del vestuario ya renderizados, en WebP animado (0.37.0). TAMPOCO
// se sincronizan, y por el mismo motivo de siempre: **los Blob no sobreviven al
// sync**, que manda JSON. Y aunque sobrevivieran no tendría sentido: no son un
// dato de Carlos, son ARTE de la app — se vuelven a bajar del servidor y ya.
// Por eso están aquí abajo y no en `ALMACENES`, igual que la cola de fotos y el
// avatar.
export const ALMACEN_PELIS = 'peliculas';
ALMACENES[ALMACEN_PELIS] = ['act'];

// La foto de perfil, por el mismo motivo que la cola: es un Blob y el sync
// manda JSON. Ver más abajo.
const ALMACEN_AVATAR = 'avatar';
ALMACENES[ALMACEN_AVATAR] = [];

let _bd = null;

export function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function ahora() {
  return Date.now();
}

/** Abre (y migra) la base de datos. Idempotente. */
export function abrir() {
  if (_bd) return Promise.resolve(_bd);
  return new Promise((res, rej) => {
    const req = indexedDB.open(NOMBRE_BD, VERSION_BD);
    req.onupgradeneeded = (e) => {
      const bd = e.target.result;
      for (const [nombre, indices] of Object.entries(ALMACENES)) {
        if (bd.objectStoreNames.contains(nombre)) continue;
        const claveP = nombre === 'ajustes' ? 'clave' : 'id';
        const store = req.transaction.objectStore
          ? bd.createObjectStore(nombre, { keyPath: claveP })
          : bd.createObjectStore(nombre, { keyPath: claveP });
        for (const idx of indices) store.createIndex(idx, idx, { unique: false });
      }
    };
    req.onsuccess = () => {
      _bd = req.result;
      res(_bd);
    };
    req.onerror = () => rej(req.error);
  });
}

function tx(almacenes, modo = 'readonly') {
  return _bd.transaction(almacenes, modo);
}

function comoPromesa(req) {
  return new Promise((res, rej) => {
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}

/* --------------------------------------------------------------------------
 * Operaciones genéricas
 * ------------------------------------------------------------------------ */

/** Guarda (crea o actualiza) marcando la hora para la sincronización. */
export async function guardar(almacen, registro, { marcar = true } = {}) {
  await abrir();
  const r = { ...registro };
  if (!r.id && almacen !== 'ajustes') r.id = uuid();
  if (marcar) r.act = ahora();
  if (r.del === undefined && almacen !== 'ajustes') r.del = 0;
  const t = tx([almacen], 'readwrite');
  await comoPromesa(t.objectStore(almacen).put(r));
  return r;
}

/** Borrado LÓGICO: lo marca como borrado para que el PC se entere. */
export async function borrar(almacen, id) {
  await abrir();
  const t = tx([almacen], 'readwrite');
  const store = t.objectStore(almacen);
  const actual = await comoPromesa(store.get(id));
  if (!actual) return null;
  actual.del = 1;
  actual.act = ahora();
  await comoPromesa(store.put(actual));
  return actual;
}

export async function obtener(almacen, id) {
  await abrir();
  return comoPromesa(tx([almacen]).objectStore(almacen).get(id));
}

/** Todos los registros vivos (sin los borrados lógicamente). */
export async function todos(almacen, { incluirBorrados = false } = {}) {
  await abrir();
  const filas = await comoPromesa(tx([almacen]).objectStore(almacen).getAll());
  return incluirBorrados ? filas : filas.filter((f) => !f.del);
}

/** Consulta por índice (p.ej. todas las series de una máquina). */
export async function porIndice(almacen, indice, valor, { incluirBorrados = false } = {}) {
  await abrir();
  const store = tx([almacen]).objectStore(almacen);
  const filas = await comoPromesa(store.index(indice).getAll(valor));
  return incluirBorrados ? filas : filas.filter((f) => !f.del);
}

/* --------------------------------------------------------------------------
 * Ajustes (clave/valor simple, no se sincroniza)
 * ------------------------------------------------------------------------ */

export async function ajuste(clave, valorSiFalta = null) {
  await abrir();
  const r = await comoPromesa(tx(['ajustes']).objectStore('ajustes').get(clave));
  return r ? r.valor : valorSiFalta;
}

export async function ponAjuste(clave, valor) {
  await abrir();
  const t = tx(['ajustes'], 'readwrite');
  await comoPromesa(t.objectStore('ajustes').put({ clave, valor }));
  return valor;
}

/* --------------------------------------------------------------------------
 * Sincronización — qué ha cambiado desde la última vez
 * ------------------------------------------------------------------------ */

export const ALMACENES_SYNC = [
  'gimnasios', 'maquinas', 'series', 'sesiones', 'rutinas',
  'alimentos', 'comidas', 'objetivos', 'pesos', 'platos', 'vinculos', 'momentos',
  'metas', 'calendario',
  // El perfil sí sincroniza: son cuatro campos de texto y el PC tiene que
  // saber cómo se llama Carlos y qué se ha apuntado él mismo.
  'perfil',
  // El vestuario también, y sobre todo por la COPIA de seguridad
  // (`ALMACENES_COPIA` es esta misma lista): perder el móvil no puede
  // llevarse por delante una colección de dos años. Son unos pocos KB de
  // identificadores, no piezas: los dibujos viven en el código.
  'vestuario',
];

/** Registros modificados después de `marca` (incluidos los borrados). */
export async function cambiosDesde(marca) {
  await abrir();
  const salida = {};
  for (const almacen of ALMACENES_SYNC) {
    const filas = await comoPromesa(tx([almacen]).objectStore(almacen).getAll());
    salida[almacen] = filas.filter((f) => (f.act || 0) > marca);
  }
  return salida;
}

/**
 * Aplica lo que viene del PC. Last-write-wins: solo pisa si lo de fuera es
 * MÁS NUEVO que lo de aquí. Así da igual el orden en que se sincronice.
 */
export async function aplicarRemoto(paquete) {
  await abrir();
  let aplicados = 0;
  for (const [almacen, filas] of Object.entries(paquete)) {
    if (!ALMACENES_SYNC.includes(almacen) || !Array.isArray(filas)) continue;
    const t = tx([almacen], 'readwrite');
    const store = t.objectStore(almacen);
    for (const fila of filas) {
      if (!fila || !fila.id) continue;
      const mio = await comoPromesa(store.get(fila.id));
      if (!mio || (fila.act || 0) > (mio.act || 0)) {
        await comoPromesa(store.put(fila));
        aplicados++;
      }
    }
  }
  return aplicados;
}

/* --------------------------------------------------------------------------
 * Medios (fotos de máquinas y vídeos-chuleta). Blobs, no viajan en el sync
 * normal: se suben aparte y bajo demanda porque pesan.
 * ------------------------------------------------------------------------ */

export async function guardarMedio({ maquinaId, tipo, blob, mime }) {
  return guardar('medios', { id: uuid(), maquinaId, tipo, blob, mime, subido: 0 });
}

export async function mediosDe(maquinaId) {
  return porIndice('medios', 'maquinaId', maquinaId);
}

/* --------------------------------------------------------------------------
 * Las películas del vestuario (0.37.0)
 *
 * Cada fila es UN efecto ya renderizado: `{ id, pack, sha, blob, act }`. Se
 * bajan del servidor la primera vez que la app abre con cobertura y se quedan
 * aquí para siempre. `sha` es lo que dice si lo que hay guardado sigue siendo
 * lo que el servidor tiene: si no coincide, se vuelve a bajar esa pieza y solo
 * esa. Ver `peliculas.js`.
 * ------------------------------------------------------------------------ */

export async function guardarPelicula(id, pack, sha, blob) {
  await abrir();
  const t = tx([ALMACEN_PELIS], 'readwrite');
  await comoPromesa(t.objectStore(ALMACEN_PELIS).put({ id, pack, sha, blob, act: ahora() }));
  return true;
}

export async function peliculas() {
  await abrir();
  try {
    return await comoPromesa(tx([ALMACEN_PELIS]).objectStore(ALMACEN_PELIS).getAll());
  } catch {
    return [];    // base vieja sin el almacén: se usa el pack del APK y ya
  }
}

export async function borrarPeliculas() {
  await abrir();
  const t = tx([ALMACEN_PELIS], 'readwrite');
  await comoPromesa(t.objectStore(ALMACEN_PELIS).clear());
  return true;
}

/* --------------------------------------------------------------------------
 * La foto de perfil (una sola, id fijo)
 *
 * Va APARTE de la fila del perfil, y fuera del sync, por lo mismo que los
 * `medios`: el intercambio con el PC manda JSON, y un Blob dentro de un JSON se
 * convierte en `{}`. La fila del perfil guarda `fotoUrl` (la de Supabase, que
 * sí es texto) y el original vive aquí, en el móvil.
 * ------------------------------------------------------------------------ */

export async function guardarAvatar(blob, mime) {
  await abrir();
  const t = tx([ALMACEN_AVATAR], 'readwrite');
  await comoPromesa(t.objectStore(ALMACEN_AVATAR).put({ id: 'yo', blob, mime, act: ahora() }));
  return true;
}

export async function avatar() {
  await abrir();
  try {
    return await comoPromesa(tx([ALMACEN_AVATAR]).objectStore(ALMACEN_AVATAR).get('yo'));
  } catch {
    return null;   // base vieja sin el almacén: no es grave, es que no hay foto
  }
}

export async function borrarAvatar() {
  await abrir();
  const t = tx([ALMACEN_AVATAR], 'readwrite');
  await comoPromesa(t.objectStore(ALMACEN_AVATAR).delete('yo'));
  return true;
}

/* --------------------------------------------------------------------------
 * Cola de fotos pendientes de analizar.
 *
 * En el restaurante hay 4G pero el PC de casa puede estar apagado, y el que
 * tiene la clave de Google es el PC. Así que la foto se guarda AQUÍ y se
 * analiza cuando el servidor conteste. Es la misma regla que rige toda la app:
 * el dato nace en el móvil y espera; nunca se pierde por no haber conexión.
 *
 * No viaja en el sync (un JPEG son 1-2 MB y deja de importar en cuanto se
 * analiza), por eso `colaFotos` no está en ALMACENES_SYNC.
 * ------------------------------------------------------------------------ */

export async function encolarFoto({ blob, fecha, momento }) {
  await abrir();
  const r = { id: uuid(), blob, fecha, momento, creado: ahora(), intentos: 0 };
  const t = tx([ALMACEN_COLA], 'readwrite');
  await comoPromesa(t.objectStore(ALMACEN_COLA).put(r));
  return r;
}

export async function fotosEnCola() {
  await abrir();
  const filas = await comoPromesa(tx([ALMACEN_COLA]).objectStore(ALMACEN_COLA).getAll());
  return filas.sort((a, b) => (a.creado || 0) - (b.creado || 0));
}

/** Aquí sí se borra de verdad: la foto ya no sirve y ocupa megas. */
export async function sacarDeCola(id) {
  await abrir();
  const t = tx([ALMACEN_COLA], 'readwrite');
  await comoPromesa(t.objectStore(ALMACEN_COLA).delete(id));
}

/**
 * Anota un intento fallido. A los 5 se rinde y se marca, para que una foto
 * ilegible no se quede reintentando para siempre cada vez que hay wifi.
 */
export async function falloDeFoto(id, motivo) {
  await abrir();
  const t = tx([ALMACEN_COLA], 'readwrite');
  const store = t.objectStore(ALMACEN_COLA);
  const f = await comoPromesa(store.get(id));
  if (!f) return null;
  f.intentos = (f.intentos || 0) + 1;
  f.ultimoError = String(motivo || '').slice(0, 200);
  f.rendida = f.intentos >= 5;
  await comoPromesa(store.put(f));
  return f;
}

/**
 * Vacía TODO (reset desde ajustes, y al cambiar de dueño el móvil).
 *
 * `conservarAjustesPrivados` deja en pie lo que es del APARATO y no de la
 * persona: a qué nube habla y a qué PC. Sin eso, cambiar de cuenta dejaba el
 * móvil sin saber ni con qué Supabase hablar, y la pantalla siguiente era «no
 * hay nube configurada» — o sea, la app rota justo después de entrar.
 */
export async function borrarTodo({ conservarAjustesPrivados = false } = {}) {
  await abrir();
  let guardados = [];
  if (conservarAjustesPrivados) {
    const filas = await comoPromesa(tx(['ajustes']).objectStore('ajustes').getAll());
    guardados = filas.filter((f) => f && esAjustePrivado(f.clave));
  }
  const nombres = Object.keys(ALMACENES);
  const t = tx(nombres, 'readwrite');
  for (const n of nombres) t.objectStore(n).clear();
  await new Promise((res) => (t.oncomplete = () => res(true)));
  for (const f of guardados) await ponAjuste(f.clave, f.valor);
  return true;
}

/* --------------------------------------------------------------------------
 * VOLCAR Y RESTAURAR — la copia de seguridad de la cuenta  (1-sep-2026)
 *
 * Carlos: *«la idea es que te fuerce a crear una cuenta, porque si no pierdes
 * todo… y si ya tienes una cuenta, pues que entres y se vuelvan a meter todos
 * tus datos»*.
 *
 * Eso no se puede cumplir sin sacar los datos del móvil, y hasta hoy la regla
 * del proyecto era que las series NO salen de aquí. La regla no se rompe, se
 * PRECISA: lo que prohíbe es que los vea OTRA GENTE. Una copia que solo puede
 * leer su dueño —eso lo decide la base con RLS, no la app— no enseña nada a
 * nadie. Sigue prohibido publicar series; empezar a permitirse es guardarlas
 * para ti.
 *
 * QUÉ NO VIAJA, Y POR QUÉ
 * -----------------------
 * · `nube_sesion` — lleva el testigo de acceso. Meter una sesión dentro de una
 *   copia sería guardar la llave dentro de la caja fuerte.
 * · `nube_url` / `nube_anon` / `sync_*` — son de ESTE aparato: a qué PC habla
 *   y por dónde. Restaurarlos en otro móvil lo mandaría a una IP que no existe.
 * · Los Blob (fotos de máquinas, avatar, cola de fotos). La copia es JSON, y un
 *   JPEG de 2 MB en base64 se come el límite de la fila él solo. Se dice en la
 *   pantalla: la copia guarda lo que has LEVANTADO, no las fotos.
 * ------------------------------------------------------------------------ */

/** Los ajustes que son de este móvil y no de la persona. */
export function esAjustePrivado(clave) {
  const c = String(clave || '');
  return c.startsWith('nube_') || c.startsWith('sync_') || c === 'dueno';
}

/** Almacenes que caben en la copia: los del sync, que ya son JSON puro. */
export const ALMACENES_COPIA = ALMACENES_SYNC;

/**
 * Todo lo tuyo en un objeto plano, listo para subir.
 *
 * Incluye los BORRADOS lógicos a propósito: si no fueran, restaurar una copia
 * resucitaría una máquina que borraste, y eso se lee como que la app se ha
 * vuelto loca.
 */
export async function volcar() {
  await abrir();
  const almacenes = {};
  for (const nombre of ALMACENES_COPIA) {
    almacenes[nombre] = await comoPromesa(tx([nombre]).objectStore(nombre).getAll());
  }
  const filas = await comoPromesa(tx(['ajustes']).objectStore('ajustes').getAll());
  const ajustes = {};
  for (const f of filas) if (f && !esAjustePrivado(f.clave)) ajustes[f.clave] = f.valor;
  return { v: 1, hecho: ahora(), almacenes, ajustes };
}

/** Cuántas filas trae un volcado, para poder decirlo antes de tocar nada. */
export function contarVolcado(volcado) {
  const a = (volcado && volcado.almacenes) || {};
  const cuenta = {};
  let total = 0;
  for (const [nombre, filas] of Object.entries(a)) {
    const vivas = (filas || []).filter((f) => f && !f.del).length;
    cuenta[nombre] = vivas;
    total += vivas;
  }
  return { total, cuenta, series: cuenta.series || 0, hecho: (volcado && volcado.hecho) || 0 };
}

/**
 * Mete un volcado en la base.
 *
 * `modo: 'fusionar'` (por defecto) respeta lo más nuevo, fila a fila, igual que
 * el sync con el PC: así entrar en un móvil que ya tiene datos no pierde los de
 * hoy. `modo: 'pisar'` vacía primero — es lo que se usa al aceptar «estos datos
 * son de otra cuenta», y ESO se pregunta antes, nunca se hace solo.
 */
export async function restaurar(volcado, { modo = 'fusionar' } = {}) {
  await abrir();
  if (!volcado || !volcado.almacenes) return { ok: false, motivo: 'la copia venía vacía' };
  if (modo === 'pisar') await borrarTodo({ conservarAjustesPrivados: true });

  let filas = 0;
  for (const nombre of ALMACENES_COPIA) {
    const lote = volcado.almacenes[nombre];
    if (!Array.isArray(lote)) continue;
    const t = tx([nombre], 'readwrite');
    const store = t.objectStore(nombre);
    for (const fila of lote) {
      if (!fila || !fila.id) continue;
      const mio = await comoPromesa(store.get(fila.id));
      if (!mio || (fila.act || 0) > (mio.act || 0)) {
        await comoPromesa(store.put(fila));
        filas++;
      }
    }
  }
  for (const [clave, valor] of Object.entries(volcado.ajustes || {})) {
    if (esAjustePrivado(clave)) continue;   // por si la copia venía de una versión vieja
    await ponAjuste(clave, valor);
  }
  return { ok: true, filas };
}
