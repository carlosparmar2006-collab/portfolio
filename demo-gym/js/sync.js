/* =============================================================================
 * sync.js — Sincronización móvil → PC (y vuelta).
 *
 * CÓMO FUNCIONA, EN CORTO
 * -----------------------
 * En el gimnasio no hay que hacer NADA: se apunta y punto. Los cambios se
 * quedan en el móvil con su marca de tiempo. Cuando el móvil vuelve a estar
 * en la WiFi de casa (o por Tailscale desde fuera) la app llama al PC y cruzan
 * lo que cada uno tenga nuevo. Gana siempre el cambio MÁS RECIENTE.
 *
 * No hay "nube" de terceros: la nube es el PC de Carlos. Gratis y privado.
 *
 * Es un intercambio en UNA sola llamada:
 *   → POST /api/gym/sync  {desde, cambios:{...}}
 *   ← {ahora, cambios:{...}}       (lo que el PC tiene más nuevo que `desde`)
 *
 * Nunca lanza excepción hacia arriba: si el PC no está, se apunta como
 * "pendiente" y ya se intentará. Un fallo de red jamás debe estorbar a alguien
 * que está entrenando.
 * ========================================================================== */

import * as db from './db.js';

const CLAVE_MARCA = 'sync_marca';
const CLAVE_URL = 'sync_url';
const CLAVE_TOKEN = 'sync_token';

/** Por defecto, el PC de casa en la red local. Editable en Ajustes.
 *  (8770 es el servidor del robot MK JARVIS; el gym usa el 8772). */
export const URL_POR_DEFECTO = 'http://127.0.0.1:8772';

let _enCurso = false;
const _oyentes = new Set();

export function alCambiarEstado(fn) {
  _oyentes.add(fn);
  return () => _oyentes.delete(fn);
}

function avisar(estado) {
  for (const fn of _oyentes) {
    try {
      fn(estado);
    } catch (_) {
      /* un oyente roto no puede tumbar la sincronización */
    }
  }
}

export async function configuracion() {
  return {
    url: (await db.ajuste(CLAVE_URL, URL_POR_DEFECTO)) || URL_POR_DEFECTO,
    token: await db.ajuste(CLAVE_TOKEN, ''),
    marca: Number(await db.ajuste(CLAVE_MARCA, 0)) || 0,
  };
}

/**
 * Busca el PC por toda la red local.
 *
 * ESTO ES LO QUE DE VERDAD ARREGLA EL PROBLEMA DE CARLOS. Su queja: «a veces se
 * me olvida la ip y no me puedo conectar». Y no es que se le olvide: **el router
 * se la cambia** (el 27-jul era .107 y el 28 ya era .102). Enseñar la IP en la
 * app no vale para nada en ese caso, porque la app tampoco llega al PC.
 *
 * Así que se prueba TODA la subred /24. Son 254 direcciones, pero en paralelo y
 * con un corte de 1,2 s tarda un par de segundos: cada intento que no es el PC
 * falla al instante (no hay nadie escuchando en ese puerto).
 *
 * De dónde sale la subred: de la URL que hubiera configurada. Si Carlos tenía
 * `192.168.68.107`, se barre `192.168.68.1` … `.254`. El router no suele cambiar
 * de subred, solo de último número.
 */
export async function buscarPC({ alProbar = null, puerto = 8772 } = {}) {
  const { url } = await configuracion();
  const m = String(url || '').match(/(\d{1,3}\.\d{1,3}\.\d{1,3})\.\d{1,3}/);
  if (!m) return { ok: false, motivo: 'no sé por qué subred empezar' };
  const base = m[1];

  const probar = async (n) => {
    const candidata = `http://${base}.${n}:${puerto}`;
    const corte = new AbortController();
    const reloj = setTimeout(() => corte.abort(), 1200);
    try {
      const r = await fetch(`${candidata}/api/gym/ping`, { signal: corte.signal });
      if (!r.ok) return null;
      const d = await r.json();
      return d && d.ok ? { url: candidata, servidor: d.servidor } : null;
    } catch {
      return null;
    } finally {
      clearTimeout(reloj);
    }
  };

  // De 20 en 20: lanzar 254 peticiones de golpe satura la cola de red del móvil
  // y empiezan a caducar por atasco, no porque no haya nadie.
  for (let inicio = 1; inicio <= 254; inicio += 20) {
    const tanda = [];
    for (let n = inicio; n < inicio + 20 && n <= 254; n++) tanda.push(probar(n));
    const encontrados = (await Promise.all(tanda)).filter(Boolean);
    alProbar?.(Math.min(inicio + 19, 254));
    if (encontrados.length) {
      await configurar({ url: encontrados[0].url });
      return { ok: true, ...encontrados[0] };
    }
  }
  return { ok: false, motivo: 'no encontré el PC en esta red' };
}

export async function configurar({ url, token }) {
  if (url !== undefined) await db.ponAjuste(CLAVE_URL, String(url).replace(/\/+$/, ''));
  if (token !== undefined) await db.ponAjuste(CLAVE_TOKEN, token);
  return configuracion();
}

/** Cuántos registros están esperando a que haya WiFi. */
export async function pendientes() {
  const { marca } = await configuracion();
  const cambios = await db.cambiosDesde(marca);
  return Object.values(cambios).reduce((a, filas) => a + filas.length, 0);
}

/**
 * Intercambia cambios con el PC.
 * @returns {{ok:boolean, enviados:number, recibidos:number, motivo?:string}}
 */
export async function sincronizar({ silencioso = true, forzar = false } = {}) {
  // EL GUARDARRAÍL VA AQUÍ, no solo en `automatico()`.
  //
  // Ya nos mordió una vez: probando la app en el navegador se colaron 12
  // gimnasios y 8 máquinas falsas en la base REAL de Carlos. Entonces se tapó
  // en `automatico()`, pero eso solo cerraba una puerta: CADA guardado de la
  // app llama a `sincronizar()` directamente, y esta función coge la IP del PC
  // de casa por defecto. O sea que apuntar una comida de prueba en localhost
  // seguía empujándola a sus datos de verdad.
  //
  // Desde Ajustes se sincroniza con `forzar: true`, que es cuando Carlos lo
  // pide a propósito y sí debe salir.
  const enDesarrollo = ['localhost', '127.0.0.1'].includes(location.hostname);
  if (enDesarrollo && !forzar) {
    console.info('[sync] bloqueado en localhost (desarrollo). Usa Ajustes para forzarlo.');
    return { ok: false, enviados: 0, recibidos: 0, motivo: 'desarrollo' };
  }

  if (_enCurso) return { ok: false, enviados: 0, recibidos: 0, motivo: 'ya en curso' };
  _enCurso = true;
  avisar({ estado: 'sincronizando' });

  try {
    const { url, token, marca } = await configuracion();
    if (!url) throw new Error('sin dirección del PC configurada');

    const cambios = await db.cambiosDesde(marca);
    const enviados = Object.values(cambios).reduce((a, f) => a + f.length, 0);

    const ctrl = new AbortController();
    const corte = setTimeout(() => ctrl.abort(), 12000); // el gym no espera

    const resp = await fetch(`${url}/api/gym/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { 'X-Gym-Token': token } : {}) },
      body: JSON.stringify({ desde: marca, cambios }),
      signal: ctrl.signal,
    });
    clearTimeout(corte);

    if (!resp.ok) throw new Error(`el PC respondió ${resp.status}`);
    const datos = await resp.json();

    const recibidos = await db.aplicarRemoto(datos.cambios || {});
    await db.ponAjuste(CLAVE_MARCA, Number(datos.ahora) || Date.now());

    const res = { ok: true, enviados, recibidos };
    avisar({ estado: 'ok', ...res, cuando: Date.now() });
    return res;
  } catch (e) {
    const motivo = e.name === 'AbortError' ? 'el PC no responde' : e.message;
    const res = { ok: false, enviados: 0, recibidos: 0, motivo };
    avisar({ estado: 'pendiente', ...res });
    if (!silencioso) console.warn('[sync]', motivo);
    return res;
  } finally {
    _enCurso = false;
  }
}

/** ¿Está el PC al otro lado? Para el botón "probar conexión" de Ajustes. */
export async function probar(urlPrueba) {
  const { url, token } = await configuracion();
  const destino = (urlPrueba || url).replace(/\/+$/, '');
  try {
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 6000);
    const r = await fetch(`${destino}/api/gym/ping`, {
      headers: token ? { 'X-Gym-Token': token } : {},
      signal: ctrl.signal,
    });
    if (!r.ok) return { ok: false, motivo: `respondió ${r.status}` };
    const j = await r.json();
    return { ok: true, servidor: j.servidor || 'PC', version: j.version };
  } catch (e) {
    return { ok: false, motivo: e.name === 'AbortError' ? 'sin respuesta (¿PC apagado o fuera de la WiFi?)' : e.message };
  }
}

/**
 * Arranca la sincronización automática: al recuperar red, al volver a la app
 * y cada 5 minutos si está abierta. Silenciosa: nunca molesta.
 */
export function automatico() {
  // En DESARROLLO (localhost) NO se sincroniza sola. Nos mordió de verdad: al
  // abrir la app en el navegador para probar, se sembraban los tres gimnasios y
  // el automático los empujaba al PC de casa, ensuciando los datos REALES de
  // Carlos con basura de pruebas. En el móvil y en el APK sí se sincroniza,
  // que es donde importa. Desde Ajustes se puede forzar a mano igualmente.
  const enDesarrollo = ['localhost', '127.0.0.1'].includes(location.hostname);
  if (enDesarrollo) {
    console.info('[sync] automático desactivado en localhost (desarrollo)');
    return;
  }
  const intentar = () => {
    if (navigator.onLine) sincronizar({ silencioso: true });
  };
  window.addEventListener('online', intentar);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') intentar();
  });
  setInterval(intentar, 5 * 60 * 1000);
  intentar();
}
