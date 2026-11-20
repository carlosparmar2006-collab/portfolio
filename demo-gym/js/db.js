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
// Subir este número crea los almacenes que falten SIN tocar los datos que Carlos
// ya tiene: `onupgradeneeded` solo crea los que no existen. Se probó ABRIENDO
// una base v2 con datos dentro, no una recién hecha — que es justo el error que
// dejó pasar el `no such column: speaker` de JARVIS.
const VERSION_BD = 4;

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
  ajustes: [],
};

// La cola de fotos NO se sincroniza: son JPEG de 1-2 MB que solo tienen sentido
// hasta que se analizan. Viven aquí a propósito, fuera de ALMACENES_SYNC.
const ALMACEN_COLA = 'colaFotos';
ALMACENES[ALMACEN_COLA] = ['creado'];

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

/** Vacía TODO (solo para pruebas / reset desde ajustes). */
export async function borrarTodo() {
  await abrir();
  const nombres = Object.keys(ALMACENES);
  const t = tx(nombres, 'readwrite');
  for (const n of nombres) t.objectStore(n).clear();
  return new Promise((res) => (t.oncomplete = () => res(true)));
}
