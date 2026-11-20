/* =============================================================================
 * comida.js — Apuntar comida por FOTO, con productos de verdad.
 *
 * LA REGLA QUE MANDA AQUÍ
 * -----------------------
 * El modelo NUNCA decide calorías. Solo dice QUÉ hay y CUÁNTOS GRAMOS. Los
 * macros salen siempre de una ficha con datos reales: la etiqueta del producto
 * (Open Food Facts) o la que Carlos haya guardado a mano.
 *
 * Por qué importa tanto: un modelo que estima kcal se las inventa con enorme
 * seguridad y no hay forma de auditarlo. Uno que estima gramos también se
 * equivoca, pero se equivoca en algo que se corrige de un vistazo («eso no son
 * 200 g de aguacate, son 100») y a partir de ahí todo lo demás es aritmética.
 *
 * POR QUÉ PASA POR EL PC
 * ----------------------
 * La clave de Google vive en el PC. Meterla en el APK sería regalarla: se saca
 * con `unzip`. Si el PC no contesta, la foto se ENCOLA en el móvil y se analiza
 * sola en cuanto haya servidor — igual que las series. El dato nace en el móvil
 * y espera; no se pierde nada por estar en un sótano sin cobertura.
 * ========================================================================== */

import * as db from './db.js';
import * as N from './nutricion.js';
import * as off from './off.js';
import * as sync from './sync.js';

/* --------------------------------------------------------------------------
 * Vínculos: «lo que ve la foto» → «lo que yo compro de verdad»
 *
 * Es la pieza que pidió Carlos: la foto detecta «crema de arroz», y él dice UNA
 * VEZ que la suya es la de Hero 0% azúcar. A partir de ahí, cada foto que
 * detecte «crema de arroz» ya sabe qué macros aplicar, sin volver a preguntar.
 * ------------------------------------------------------------------------ */

/**
 * Normaliza un nombre para poder casarlo.
 * Sin tildes, sin plural y sin las palabras de cocinado: para el vínculo, «huevo
 * frito», «huevos fritos» y «Huevo Frito» son lo mismo. Si no se normalizara,
 * Carlos tendría que vincular cada variante y el mecanismo no serviría de nada.
 */
export function clave(nombre) {
  return String(nombre || '')
    .toLowerCase()
    // ̀-ͯ son las tildes ya separadas por NFD. Escritas con el código
    // y no con el carácter literal: en el fichero real serían invisibles y el
    // primero que edite esta línea las borra sin enterarse.
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => (p.length > 3 && p.endsWith('s') ? p.slice(0, -1) : p))  // plural simple
    .join(' ')
    .trim();
}

/** Busca el alimento vinculado a un nombre detectado. null si no hay ninguno. */
export function alimentoVinculado(detectado, vinculos, alimentos) {
  const k = clave(detectado);
  const v = (vinculos || []).find((x) => !x.del && x.detectado === k);
  if (!v) return null;
  return (alimentos || []).find((a) => !a.del && a.id === v.alimentoId) || null;
}

/** Guarda (o repisa) el vínculo. Idempotente: uno por nombre detectado. */
export async function vincular(detectado, alimentoId, vinculos) {
  const k = clave(detectado);
  const previo = (vinculos || []).find((x) => x.detectado === k);
  return db.guardar('vinculos', { ...(previo || {}), detectado: k, alimentoId, del: 0 });
}

/**
 * Si no hay vínculo, se intenta adivinar por parecido con lo que ya tiene.
 * Es solo una SUGERENCIA que se muestra preseleccionada, nunca se aplica sola:
 * ya nos mordió en el gimnasio buscar máquinas por nombre («remo con mancuerna»
 * casaba con «curl bíceps mancuerna» y JARVIS soltaba pesos de otro ejercicio).
 */
export function sugerirAlimento(detectado, alimentos) {
  const palabras = clave(detectado).split(' ').filter((p) => p.length > 2);
  if (!palabras.length) return null;

  let mejorPunto = 0;
  let empatados = [];
  for (const a of alimentos || []) {
    if (a.del) continue;
    const suyas = clave(a.nombre).split(' ');
    const punto = palabras.filter((p) => suyas.includes(p)).length;
    if (punto === 0) continue;
    if (punto > mejorPunto) {
      mejorPunto = punto;
      empatados = [a];
    } else if (punto === mejorPunto) {
      empatados.push(a);
    }
  }
  if (!mejorPunto) return null;

  // EL EMPATE NO SE DESHACE: si «pan» casa igual de bien con «Pan integral» y
  // con «Pan de molde», elegir uno es apuntar 18 kcal/100 g de otro producto sin
  // avisar. Mejor preguntar. Lo cazó test_comida.mjs, que sugería el integral
  // solo por estar antes en la lista.
  if (empatados.length > 1) return null;

  // Y con una sola palabra en común solo vale si el nombre detectado ERA esa
  // palabra: «aguacate» sí, «pan integral tostado» casando solo por «pan» no.
  return mejorPunto >= 2 || palabras.length === 1 ? empatados[0] : null;
}

/* --------------------------------------------------------------------------
 * Gramos ↔ unidades
 *
 * ESTE ES EL BUG QUE MÁS CARO SALIÓ DE TODO EL CONTADOR.
 *
 * La foto SIEMPRE habla en gramos: «huevo frito, 110 g». Pero algunos alimentos
 * se guardan por unidad (un huevo son 78 kcal, no 78 kcal/100 g). Si se coge el
 * 110 tal cual y el alimento va por unidades, la app entiende **110 huevos** y
 * suelta 8.994 kcal en el desayuno. Lo cazó la prueba en la app real; en los
 * tests de laboratorio no salía porque allí las unidades ya cuadraban.
 *
 * Por eso los alimentos por unidad llevan `gramosUd` (lo que pesa UNA pieza) y
 * la conversión pasa por aquí siempre. Si no se sabe cuánto pesa la pieza, NO se
 * adivina: se devuelve 1 y se avisa, que es mejor que colar un número absurdo.
 * ------------------------------------------------------------------------ */

/**
 * Pasa una cantidad detectada en gramos a la unidad en que se mide `alimento`.
 * Devuelve `{ cantidad, convertida, incierta }`.
 */
export function aUnidadDe(gramos, alimento) {
  // Envoltorio de `acomodar` para el caso «la foto lo dio en gramos». Se queda
  // porque es como se llamaba antes y sus tests fijan el bug de las 8.994 kcal;
  // pero la conversión de verdad vive en UN solo sitio (`N.convertir`), que es
  // la regla de paridad: dos implementaciones acaban dando números distintos.
  const r = acomodar(gramos, 'g', alimento);
  const suya = (alimento && alimento.unidad) || 'g';
  return { cantidad: r.cantidad, convertida: suya !== 'g', incierta: r.incierta };
}

/* --------------------------------------------------------------------------
 * Convertir lo detectado en comidas apuntables
 * ------------------------------------------------------------------------ */

/**
 * Cruza lo que dijo la foto con la despensa de Carlos.
 *
 * Devuelve una línea por alimento detectado, con:
 *   - `alimento`: la ficha con macros REALES, si se ha podido resolver
 *   - `origen`  : 'vinculo' (él ya lo dijo), 'sugerido' (parecido) o null
 *   - `macros`  : ya calculados para esos gramos, o null si falta el alimento
 *
 * Lo que no se resuelve NO se descarta: se devuelve con `alimento: null` para
 * que la pantalla lo pregunte. Tirarlo en silencio sería restar calorías que
 * Carlos sí se ha comido.
 */
export function cruzar(detectados, { alimentos, vinculos }) {
  return (detectados || []).map((d) => {
    // Compatibilidad con las fotos encoladas antes de que existieran las
    // unidades: entonces todo venía en gramos y el campo se llamaba `gramos`.
    const unidadDetectada = d.unidad || 'g';
    const cantidadDetectada = d.cantidad !== undefined ? d.cantidad : d.gramos;

    const vinculado = alimentoVinculado(d.nombre, vinculos, alimentos);
    const alimento = vinculado || sugerirAlimento(d.nombre, alimentos);
    const r = acomodar(cantidadDetectada, unidadDetectada, alimento);

    return {
      detectado: d.nombre,
      // Dónde dice el modelo que está en la foto. Se enseña tal cual: es la
      // forma de pillarle un invento («sobre la tostada» en una foto sin
      // tostadas) sin gastar una segunda llamada a Google.
      donde: d.donde || '',
      // Lo que dijo la foto, intacto, para poder rehacer el cálculo si Carlos
      // cambia de alimento o de unidad.
      cantidadDetectada,
      unidadDetectada,
      cantidad: r.cantidad,
      unidad: r.unidad,
      incierta: r.incierta,
      alimento,
      origen: vinculado ? 'vinculo' : alimento ? 'sugerido' : null,
      macros: alimento ? N.macrosDe(alimento, r.cantidad, r.unidad) : null,
    };
  });
}

/**
 * Encaja lo que dijo la foto en las unidades del alimento elegido.
 *
 * La foto habla en g, ml o ud; el alimento se mide en lo suyo. Si coinciden, no
 * se toca nada. Si no, se convierte con `gramosUd`. Y si no se puede convertir,
 * se deja la cantidad tal cual PERO en la unidad de la foto, marcándolo: nunca
 * se cuela un número en una unidad que no es la suya, que es lo que produjo las
 * 8.994 kcal.
 */
export function acomodar(cantidad, unidadFoto, alimento) {
  const c = Number(cantidad) || 0;
  if (!alimento) return { cantidad: c, unidad: unidadFoto, incierta: false };

  const suya = alimento.unidad || 'g';
  if (unidadFoto === suya) return { cantidad: c, unidad: suya, incierta: false };

  const convertida = N.convertir(c, unidadFoto, suya, alimento);
  if (convertida !== null) return { cantidad: convertida, unidad: suya, incierta: false };

  // No hay puente. Se pone 1 pieza (o la cantidad, si va por peso) y se avisa.
  if (suya === 'ud') return { cantidad: 1, unidad: 'ud', incierta: true };
  return { cantidad: c, unidad: suya, incierta: true };
}

/* --------------------------------------------------------------------------
 * Hablar con el servidor del PC
 * ------------------------------------------------------------------------ */

/**
 * La dirección del PC sale de DONDE YA ESTABA: los ajustes de sincronización.
 *
 * Al principio esto leía su propia clave en localStorage y era un error de
 * bulto: Carlos habría tenido que escribir la IP del PC dos veces, una para
 * sincronizar y otra para las fotos, y cuando cambiara de red se le habría roto
 * la mitad de la app sin saber por qué. Hay un solo sitio donde se configura.
 */
async function servidor() {
  const { url } = await sync.configuracion();
  return (url || '').replace(/\/+$/, '');
}

async function cabeceras() {
  const { token } = await sync.configuracion();
  return token ? { 'Content-Type': 'application/json', 'X-Gym-Token': token }
               : { 'Content-Type': 'application/json' };
}

/** El JPEG en base64, sin la cabecera `data:` que mete FileReader. */
function aBase64(blob) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(String(fr.result).split(',')[1] || '');
    fr.onerror = () => rej(fr.error);
    fr.readAsDataURL(blob);
  });
}

/**
 * Encoge la foto antes de mandarla.
 *
 * Una foto de móvil son 3-4 MB y el modelo no ve más detalle por encima de
 * ~1024 px: solo tarda más y gasta cuota. Bajar a 1024 px de lado mayor deja el
 * JPEG en ~150 KB, que viaja rápido incluso por 4G flojo.
 */
export async function encoger(archivo, lado = 1024, calidad = 0.82) {
  const bitmap = await createImageBitmap(archivo);
  const escala = Math.min(1, lado / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * escala);
  const h = Math.round(bitmap.height * escala);
  const lienzo = document.createElement('canvas');
  lienzo.width = w;
  lienzo.height = h;
  lienzo.getContext('2d').drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  return new Promise((res) => lienzo.toBlob(res, 'image/jpeg', calidad));
}

/**
 * Manda la foto al PC y devuelve los alimentos detectados.
 * Lanza si no hay servidor o no contesta: quien llama decide si encolar.
 */
export async function analizar(blob, { tiempoMax = 90000 } = {}) {
  const base = await servidor();
  if (!base) throw new Error('sin servidor configurado');
  const corte = new AbortController();
  const reloj = setTimeout(() => corte.abort(), tiempoMax);
  try {
    const r = await fetch(`${base}/api/gym/comida/foto`, {
      method: 'POST',
      headers: await cabeceras(),
      signal: corte.signal,
      body: JSON.stringify({ jpeg: await aBase64(blob) }),
    });
    if (!r.ok) throw new Error(`el servidor respondió ${r.status}`);
    const d = await r.json();
    if (!d.ok) throw new Error(d.error || 'no reconoció nada en la foto');
    return d;
  } finally {
    clearTimeout(reloj);
  }
}

/**
 * La foto de la ETIQUETA de un envase → su tabla nutricional (v0.8.0).
 *
 * Esta SÍ necesita el PC, y no es un descuido: la clave de Gemini vive en el
 * `.env` del ordenador y nunca en el APK, porque metida ahí la saca cualquiera
 * con `unzip`. Es la misma razón por la que la foto del plato pasa por casa.
 *
 * A diferencia del plato, esta NO se encola: leer una etiqueta es algo que se
 * hace en la cocina para dar de alta un producto, no en un restaurante con el
 * PC apagado. Si no hay servidor se dice y se ofrece el código de barras, que
 * ese sí va directo desde el móvil.
 */
export async function leerEtiqueta(blob, { tiempoMax = 90000 } = {}) {
  const base = await servidor();
  if (!base) return { ok: false, sinServidor: true };
  const corte = new AbortController();
  const reloj = setTimeout(() => corte.abort(), tiempoMax);
  try {
    const r = await fetch(`${base}/api/gym/comida/etiqueta`, {
      method: 'POST',
      headers: await cabeceras(),
      signal: corte.signal,
      body: JSON.stringify({ jpeg: await aBase64(blob) }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, error: d.error || `el servidor respondió ${r.status}` };
    return d;
  } catch (e) {
    return { ok: false, sinServidor: true, error: e.message };
  } finally {
    clearTimeout(reloj);
  }
}

/**
 * Busca productos reales. Distingue «no hay» de «no contestan»: si Open Food
 * Facts está saturado hay que decirlo y ofrecer el código de barras, que va por
 * otro cupo. Decir «no encontrado» sería mentir.
 */
export async function buscarProducto(texto) {
  // 1) DIRECTO desde el móvil. Open Food Facts permite CORS —medido el
  //    31-jul-2026: 200 OK en 236 ms— así que buscar comida ya NO necesita el
  //    PC encendido. Era la queja de Carlos: «que la app no dependa de si está
  //    conectado el servidor (…) el apartado de nutrición falla mucho».
  const directo = await off.buscar(texto);
  if (directo.ok) return { ok: true, productos: directo.productos, via: 'directo' };

  // 2) El PC como RESPALDO, no como camino principal. Sigue aportando algo real:
  //    caché en disco de 30 días, así que puede tener la respuesta guardada
  //    aunque ahora mismo no haya internet o estén capando.
  const base = await servidor();
  if (!base) {
    return { ok: false, productos: [],
             sinServidor: !!directo.sinRed, saturado: !!directo.saturado };
  }
  try {
    const r = await fetch(`${base}/api/gym/comida/buscar?q=${encodeURIComponent(texto)}`,
      { headers: await cabeceras() });
    const d = await r.json().catch(() => ({}));
    if (r.status === 503) return { ok: false, saturado: true, productos: [] };
    if (!r.ok || !d.ok) return { ok: false, productos: [] };
    return { ok: true, productos: d.productos || [], via: 'pc' };
  } catch {
    return { ok: false, sinServidor: true, productos: [] };
  }
}

/** Las direcciones para conectarse, según el PC. */
export async function direcciones() {
  const base = await servidor();
  if (!base) return { ok: false, direcciones: [] };
  try {
    const r = await fetch(`${base}/api/gym/direcciones`, { headers: await cabeceras() });
    const d = await r.json().catch(() => ({}));
    return r.ok && d.ok ? { ok: true, direcciones: d.direcciones || [] }
                        : { ok: false, direcciones: [] };
  } catch {
    return { ok: false, direcciones: [] };
  }
}

export async function productoPorBarras(codigo) {
  // Igual que la búsqueda: primero directo, el PC de respaldo por su caché.
  const directo = await off.porBarras(codigo);
  if (directo.ok) return { ok: true, producto: directo.producto };
  if (directo.noExiste) return { ok: false, noExiste: true };

  const base = await servidor();
  if (!base) return { ok: false, sinServidor: true };
  try {
    const r = await fetch(`${base}/api/gym/comida/barras?c=${encodeURIComponent(codigo)}`,
      { headers: await cabeceras() });
    const d = await r.json().catch(() => ({}));
    if (r.status === 503) return { ok: false, saturado: true };
    if (r.status === 404) return { ok: false, noExiste: true };
    if (!r.ok || !d.ok) return { ok: false };
    return { ok: true, producto: d.producto };
  } catch {
    return { ok: false, sinServidor: true };
  }
}

/* --------------------------------------------------------------------------
 * La cola
 * ------------------------------------------------------------------------ */

/**
 * Intenta analizar las fotos que quedaron pendientes.
 *
 * Se llama al abrir la app y después de sincronizar. Devuelve las que se
 * resolvieron, para que la pantalla pregunte por ellas. Las que fallan suman un
 * intento; a los 5 se rinden (una foto movida no va a mejorar por insistir, y
 * reintentarla cada vez que hay wifi gastaría cuota para siempre).
 */
export async function procesarCola({ alSalir } = {}) {
  const pendientes = (await db.fotosEnCola()).filter((f) => !f.rendida);
  const resueltas = [];
  for (const f of pendientes) {
    try {
      const d = await analizar(f.blob);
      resueltas.push({ ...f, alimentos: d.alimentos, motor: d.motor });
      await db.sacarDeCola(f.id);
      alSalir?.(resueltas.length, pendientes.length);
    } catch (e) {
      await db.falloDeFoto(f.id, e.message);
      // Si es que no hay servidor, no tiene sentido probar con las demás:
      // fallarían todas y les gastaríamos un intento a cada una para nada.
      if (/sin servidor|Failed to fetch|NetworkError/i.test(e.message)) break;
    }
  }
  return resueltas;
}
