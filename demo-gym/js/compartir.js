/* =============================================================================
 * compartir.js — Mandar una rutina o un gimnasio por WhatsApp. Y recibirlos.
 *
 * Carlos, 30-ago-2026: *«que se pueda enviar un enlace (por ejemplo WhatsApp)
 * para que la gente se envíe rutinas, máquinas de x gym (ejemplo gym Manolo con
 * las máquinas que ya ha añadido el chico o rutinas que tenga él etc…)»*.
 *
 * LO ÚNICO QUE HAY QUE ENTENDER DE ESTE FICHERO
 * ---------------------------------------------
 * Un plan de rutina guarda `maquinaId`: el uuid de una fila del móvil de quien
 * comparte. En el móvil del que recibe ese uuid NO EXISTE. Si el paquete
 * viajara con ids, la rutina llegaría con seis filas vacías y parecería rota
 * sin estar rota.
 *
 * Por eso todo se comparte POR NOMBRE, y al recibir se casa contra las máquinas
 * del que recibe (mismo criterio de comparación que las medallas: minúsculas,
 * sin tildes y sin signos). Lo que no exista, se crea; lo que ya tenga, se
 * respeta — nadie quiere acabar con dos «press de banca» y el historial
 * partido en dos.
 *
 * DOS CLASES DE ENLACE, Y LAS DOS FUNCIONAN
 * -----------------------------------------
 *  · CORTO   `…/#/c/k3f9a2b7c1` — el paquete vive en Supabase. Bonito de
 *            mandar y de teclear. Necesita cuenta y red.
 *  · LARGO   `…/#/i/eyJ0aXBv…`  — el paquete va DENTRO del propio enlace, en
 *            base64. Feo (una rutina de 8 ejercicios son ~600 caracteres), pero
 *            no necesita ni cuenta ni nube ni que nadie tenga nada montado. Es
 *            la red de seguridad.
 *
 * Siempre se intenta el corto y se cae al largo. Que compartir dependa de que
 * Supabase esté en pie sería un punto de fallo evitable para algo tan tonto
 * como mandarle a un amigo la rutina de pecho.
 *
 * EL FRAGMENTO (#) NO ES CASUAL: lo que va detrás de la almohadilla NO se manda
 * al servidor. Ni el que sirve la app ni WhatsApp ven la rutina que va dentro
 * del enlace largo.
 * ========================================================================== */

import * as db from './db.js';
import * as nube from './nube.js';
import { normalizarNombre } from './perfil.js';
import { CATALOGO } from './catalogo.js';

/** Versión del formato. Si algún día cambia, un paquete viejo se reconoce. */
export const VERSION = 1;

const CLAVE_BASE = 'compartir_base';

/* --------------------------------------------------------------------------
 * La dirección pública
 * ------------------------------------------------------------------------ */

/**
 * Donde vive la app en internet.
 *
 * ESTO ES EL ARREGLO DE «LOS ENLACES NO FUNCIONAN» (Carlos, 31-ago-2026).
 *
 * Dentro del APK la app NO se sirve desde `file://` —eso ya lo sabíamos— sino
 * desde `http://appassets.androidplatform.net/assets/`, que es un origen
 * perfectamente normal para el navegador y por eso pasaba el filtro de abajo.
 * El problema es que ese dominio **solo existe dentro del móvil de Carlos**: lo
 * inventa `WebViewAssetLoader` (ver `android/.../MainActivity.java`). Un enlace
 * colgado de ahí se manda por WhatsApp, el amigo lo abre y le sale «no se puede
 * acceder a este sitio». El enlace no estaba roto: apuntaba a una casa que solo
 * tiene puerta por dentro.
 *
 * Así que hace falta una dirección de verdad. La trae `app/nube.json`, y NO va
 * escrita a fuego aquí por una razón que costó una tarde: la primera vez se
 * puso la de GitHub Pages, y resultó que Pages **es de pago en un repositorio
 * privado**. Cambiar de sitio de alojamiento no puede obligar a publicar una
 * versión nueva de la app.
 */
export function webPublica() {
  return nube.webPublica();
}

/**
 * ¿Se puede abrir esta dirección desde OTRO móvil?
 *
 * No basta con «tiene http». El WebView del APK, un `python -m http.server` en
 * el portátil y el servidor de casa en `192.168.68.107` son los tres orígenes
 * normales y los tres invisibles desde fuera. Se listan por lo que son:
 * dominios inventados, `localhost` y el rango privado de una red doméstica.
 */
export function esPublica(origen) {
  const o = String(origen || '');
  if (!o || o === 'null' || o.startsWith('file:')) return false;
  let host;
  try { host = new URL(o).hostname.toLowerCase(); } catch { return false; }
  if (host === 'appassets.androidplatform.net') return false;      // el APK
  if (host === 'localhost' || host.endsWith('.localhost')) return false;
  if (host.endsWith('.local')) return false;                        // mDNS de casa
  if (host === '127.0.0.1' || host === '::1' || host === '0.0.0.0') return false;
  // Rangos privados de la RFC 1918: la WiFi de casa y la del gimnasio.
  if (/^10\./.test(host)) return false;
  if (/^192\.168\./.test(host)) return false;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return false;
  if (/^169\.254\./.test(host)) return false;                       // sin DHCP
  return true;
}

/**
 * De dónde cuelgan los enlaces que se mandan.
 *
 * Orden, y cada escalón está por un motivo:
 *   1. Lo que Carlos haya fijado a mano en Ajustes (manda siempre: si un día
 *      pone la app en su propio dominio, no hay que tocar código).
 *   2. La dirección actual, PERO solo si de verdad se puede abrir desde fuera.
 *   3. GitHub Pages. Es el caso del APK y del PWA instalado, o sea el normal.
 *
 * Ya no devuelve nunca cadena vacía: un enlace sin raíz era un enlace roto que
 * además no lo parecía.
 */
export async function base() {
  const guardada = await db.ajuste(CLAVE_BASE, '');
  if (guardada) return String(guardada).replace(/\/+$/, '');
  if (esPublica(location.origin)) {
    return `${location.origin}${location.pathname}`.replace(/\/index\.html$/, '').replace(/\/+$/, '');
  }
  // Y si tampoco hay dirección pública configurada, cadena vacía: un enlace sin
  // raíz es un enlace roto, pero al menos `enlaceDe` puede detectarlo y avisar
  // en vez de devolver algo que no abre.
  return webPublica();
}

export async function fijarBase(url) {
  await db.ponAjuste(CLAVE_BASE, String(url || '').trim().replace(/\/+$/, ''));
  return base();
}

/* --------------------------------------------------------------------------
 * Empaquetar
 * ------------------------------------------------------------------------ */

/**
 * Una rutina lista para viajar.
 *
 * Se guarda el nombre del ejercicio, su grupo y el `series × reps`. Lo que NO
 * viaja: pesos, series apuntadas ni nada del historial. Se comparte el PLAN,
 * no el diario — los kilos de otro no significan nada en tu máquina, y además
 * no es asunto de quien recibe.
 */
export function empaquetarRutina(rutina, plan, maquinasPorId, autor = '') {
  return {
    v: VERSION,
    tipo: 'rutina',
    nombre: rutina.nombre || 'Rutina',
    autor,
    nota: rutina.nota || '',
    ejercicios: plan
      .map((p) => {
        const m = maquinasPorId.get(p.maquinaId);
        if (!m) return null;
        return {
          nombre: m.nombre,
          grupo: m.grupo || 'otro',
          series: p.series,
          reps: p.reps,
          // Las notas del AUTOR viajan. Las tuyas sobre la rutina de otro, no:
          // esas se quedan en tu móvil (`notasMias`), que es donde tienen que
          // estar. No le interesan a nadie más y no tienen por qué salir del
          // teléfono.
          ...(p.nota ? { nota: p.nota } : {}),
          ...(p.video ? { video: p.video } : {}),
          ...(p.foto ? { foto: p.foto } : {}),
        };
      })
      .filter(Boolean),
  };
}

/**
 * Un gimnasio con sus máquinas: «el gym Manolo, con lo que hay dentro».
 *
 * Viaja la UNIDAD de cada máquina (kg o lb) porque es de la placa, no de la
 * persona: si el gimnasio va en libras, va en libras para todo el que entre.
 * El incremento también, que es cómo están hechos los discos de esa máquina.
 */
export function empaquetarGimnasio(gimnasio, maquinas, autor = '') {
  return {
    v: VERSION,
    tipo: 'gimnasio',
    nombre: gimnasio.nombre || 'Gimnasio',
    ciudad: gimnasio.ciudad || '',
    autor,
    maquinas: maquinas.map((m) => ({
      nombre: m.nombre,
      grupo: m.grupo || 'otro',
      tipo: m.tipo || 'maquina',
      icono: m.icono || '',
      unidad: m.unidad || 'kg',
      incremento: m.incremento || (m.unidad === 'lb' ? 5 : 2.5),
      notas: m.notas || '',
    })),
  };
}

/* --------------------------------------------------------------------------
 * Enlaces
 * ------------------------------------------------------------------------ */

/** Código de 10 caracteres del alfabeto de la base (a-z0-9). */
export function codigoNuevo() {
  const abc = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => abc[b % abc.length]).join('');
}

/**
 * base64 seguro para URL, con el texto en UTF-8.
 *
 * `btoa` de una cadena con acentos revienta («Búlgaras», «Elíptica»…), así que
 * primero se pasa a bytes de verdad. Y se quitan `+`, `/` y `=`, que en una URL
 * que va a pasar por WhatsApp dan problemas.
 */
export function aBase64(texto) {
  const bytes = new TextEncoder().encode(texto);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function deBase64(b64) {
  const s = String(b64).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(s + '='.repeat((4 - (s.length % 4)) % 4));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/**
 * El enlace de un paquete.
 *
 * @returns {{url, codigo, corto, motivo}} — `corto` dice cuál de los dos salió,
 *          para poder explicarlo en pantalla en vez de dar un enlace larguísimo
 *          sin decir por qué.
 */
export async function enlaceDe(paquete) {
  const raiz = await base();
  // SIN RAÍZ NO HAY ENLACE, y hay que decirlo. Devolver `/#/i/eyJ0…` es
  // devolver algo que parece un enlace, se copia tan ricamente y no abre en
  // ninguna parte. Pasa cuando la app va dentro del APK y `nube.json` todavía
  // no tiene la dirección pública puesta.
  if (!raiz) {
    return {
      url: '', codigo: null, corto: false,
      motivo: 'falta la dirección pública de la app (Ajustes → Configurar la nube)',
      sinRaiz: true,
    };
  }
  const largo = () => ({
    url: `${raiz}/#/i/${aBase64(JSON.stringify(paquete))}`,
    codigo: null,
    corto: false,
  });

  if (!nube.usuario() || !(await nube.hayNube())) {
    return { ...largo(), motivo: 'sin cuenta: enlace largo' };
  }
  // Y aunque haya cuenta: si esta nube no es la que trae la app, el que reciba
  // el enlace corto no sabrá a qué proyecto ir a buscarlo. Un enlace largo es
  // más feo, pero lo abre cualquiera.
  if (!(await nube.esLaDeLaApp())) {
    return { ...largo(), motivo: 'tu nube no es la de la app: enlace largo' };
  }

  const codigo = codigoNuevo();
  const r = await nube.guardarCompartido({
    codigo,
    tipo: paquete.tipo,
    titulo: paquete.nombre || '',
    datos: paquete,
  });
  if (!r.ok) return { ...largo(), motivo: r.motivo };
  return { url: `${raiz}/#/c/${codigo}`, codigo, corto: true };
}

/** El enlace de un perfil público. */
export async function enlacePerfil(alias) {
  return `${await base()}/#/p/${encodeURIComponent(String(alias || '').toLowerCase())}`;
}

/**
 * Manda el enlace.
 *
 * Se intenta primero `navigator.share`, que abre el selector del móvil (con
 * WhatsApp, Telegram, correo… lo que tenga instalado) — es lo que espera
 * cualquiera en un móvil, y no obliga a elegir por él. Si no existe (navegador
 * de escritorio) se cae al enlace directo de WhatsApp, y si tampoco, se copia.
 *
 * OJO: `navigator.share` EXIGE venir de un toque del usuario. Por eso esta
 * función se llama desde el `onclick` y nunca desde un `await` posterior a otra
 * cosa lenta — si se pierde el gesto, Android la rechaza sin decir nada.
 */
export async function mandar({ url, texto }) {
  const mensaje = `${texto}\n${url}`;

  if (navigator.share) {
    try {
      await navigator.share({ title: 'GYM', text: texto, url });
      return { ok: true, como: 'compartir' };
    } catch (e) {
      // Cancelar no es un fallo: se sale sin decir nada, que es lo que espera
      // quien acaba de pulsar «atrás».
      if (e && e.name === 'AbortError') return { ok: true, como: 'cancelado' };
    }
  }

  if (await copiar(url)) return { ok: true, como: 'copiado' };
  return { ok: true, como: 'whatsapp', whatsapp: enlaceWhatsApp(mensaje) };
}

export function enlaceWhatsApp(mensaje) {
  return `https://wa.me/?text=${encodeURIComponent(mensaje)}`;
}

export async function copiar(texto) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(texto);
      return true;
    }
  } catch (_) { /* sin permiso: se prueba lo de abajo */ }
  // Respaldo para el WebView del APK, que sirve la app por http y ahí
  // `navigator.clipboard` no existe.
  try {
    const ta = document.createElement('textarea');
    ta.value = texto;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const bien = document.execCommand('copy');
    ta.remove();
    return bien;
  } catch (_) {
    return false;
  }
}

/* --------------------------------------------------------------------------
 * Recibir
 * ------------------------------------------------------------------------ */

/**
 * Lee el `#` de la dirección: qué han abierto.
 * @returns {{que:'compartido'|'incrustado'|'perfil', ...}|null}
 */
export function leerHash(hash = location.hash) {
  const h = String(hash || '').replace(/^#\/?/, '');
  const corte = h.indexOf('/');
  if (corte < 0) return null;
  const que = h.slice(0, corte);
  const resto = h.slice(corte + 1);
  if (!resto) return null;
  if (que === 'c') return { que: 'compartido', codigo: resto };
  if (que === 'i') return { que: 'incrustado', datos: resto };
  if (que === 'p') return { que: 'perfil', alias: decodeURIComponent(resto) };
  return null;
}

/** Deja limpia la dirección sin recargar ni añadir una entrada al historial. */
export function limpiarHash() {
  history.replaceState(null, '', location.pathname + location.search);
}

/**
 * Saca el paquete de lo que sea que hayan abierto.
 *
 * Un paquete llega de INTERNET, así que se comprueba antes de tocarlo: tipo
 * conocido, versión conocida y listas que sean listas. Sin esto, un enlace
 * manipulado podría meter basura en la base de Carlos.
 */
export async function abrir(ruta) {
  try {
    if (ruta.que === 'incrustado') {
      return validar(JSON.parse(deBase64(ruta.datos)));
    }
    if (ruta.que === 'compartido') {
      const r = await nube.leerCompartido(ruta.codigo);
      if (!r.ok) return { ok: false, motivo: r.motivo };
      return validar(r.paquete.datos);
    }
    return { ok: false, motivo: 'ese enlace no es de una rutina ni de un gimnasio' };
  } catch (_) {
    return { ok: false, motivo: 'el enlace está roto o incompleto' };
  }
}

const GRUPOS_VALIDOS = new Set(['pecho', 'espalda', 'hombro', 'biceps', 'triceps',
  'pierna', 'gluteo', 'core', 'cardio', 'otro']);
const TIPOS_VALIDOS = new Set(['maquina', 'polea', 'mancuerna', 'barra', 'libre', 'peso_corporal']);

/** Un número dentro de unos límites, o el de por defecto. */
function num(v, min, max, pd) {
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? n : pd;
}

function texto(v, max) {
  return String(v ?? '').slice(0, max).trim();
}

/* --------------------------------------------------------------------------
 * ENLACES QUE VIENEN DE FUERA
 *
 * Un paquete de rutina puede llegar de cualquiera: por WhatsApp, por un enlace
 * pegado, de la nube. Así que sus enlaces no se pintan tal cual — un
 * `javascript:` metido en un `href` es la forma más vieja que hay de que la app
 * ejecute lo que quiera el que te mandó la rutina.
 *
 * Solo pasa `https:`, y para el vídeo solo de sitios donde de verdad hay
 * vídeos. Lo que no pasa el filtro NO se avisa como error: se ignora y la
 * rutina entra igual, porque perder una rutina entera por un enlace raro sería
 * peor que quedarse sin el enlace.
 * ------------------------------------------------------------------------ */

/** Los sitios de vídeo que se aceptan. */
const VIDEO_DE = [
  'youtube.com', 'youtu.be', 'm.youtube.com',
  'instagram.com', 'www.instagram.com',
  'tiktok.com', 'www.tiktok.com', 'vm.tiktok.com',
];

function httpsSano(v, maxLargo = 400) {
  const s = String(v || '').trim();
  if (!s || s.length > maxLargo) return '';
  try {
    const u = new URL(s);
    return u.protocol === 'https:' ? u.href : '';
  } catch (_) {
    return '';
  }
}

export function enlaceDeVideo(v) {
  const s = httpsSano(v);
  if (!s) return '';
  try {
    const h = new URL(s).hostname.toLowerCase();
    return VIDEO_DE.includes(h) ? s : '';
  } catch (_) {
    return '';
  }
}

/** Una foto alojada por nosotros. Cualquier `https` vale: la sube la app. */
export function enlaceDeFoto(v) {
  return httpsSano(v);
}

export function validar(p) {
  if (!p || typeof p !== 'object') return { ok: false, motivo: 'el enlace no lleva nada dentro' };
  if (Number(p.v) > VERSION) {
    return { ok: false, motivo: 'ese enlace lo hizo una versión más nueva de la app. Actualiza' };
  }

  if (p.tipo === 'rutina') {
    const ejercicios = (Array.isArray(p.ejercicios) ? p.ejercicios : [])
      .filter((e) => e && texto(e.nombre, 80))
      .slice(0, 60)     // una rutina de 60 ejercicios ya no es una rutina
      .map((e) => ({
        nombre: texto(e.nombre, 80),
        grupo: GRUPOS_VALIDOS.has(e.grupo) ? e.grupo : 'otro',
        series: num(e.series, 1, 20, 3),
        reps: num(e.reps, 1, 100, 12),
        // LO QUE DEJÓ ESCRITO QUIEN LA HIZO (1-sep-2026). Carlos: «que si
        // alguien se la descarga se puedan ver las notas de la persona».
        // Es lo que convierte una lista de ejercicios en una rutina de
        // alguien: «en esta polea empieza flojo, engaña».
        nota: texto(e.nota, 300),
        // Un ENLACE a un vídeo, no un vídeo. Ver la cuenta entera en
        // supabase/schema-6-notas-fotos.sql: alojar vídeo en el plan gratis se
        // come la cuota de salida de TODA la app en 640 reproducciones.
        video: enlaceDeVideo(e.video),
        // La foto sí se aloja, pero solo su dirección viaja aquí.
        foto: enlaceDeFoto(e.foto),
      }));
    if (!ejercicios.length) return { ok: false, motivo: 'esa rutina llega vacía' };
    return {
      ok: true,
      paquete: {
        v: VERSION, tipo: 'rutina',
        nombre: texto(p.nombre, 60) || 'Rutina',
        autor: texto(p.autor, 40),
        nota: texto(p.nota, 600),
        ejercicios,
      },
    };
  }

  if (p.tipo === 'gimnasio') {
    const maquinas = (Array.isArray(p.maquinas) ? p.maquinas : [])
      .filter((m) => m && texto(m.nombre, 80))
      .slice(0, 200)
      .map((m) => ({
        nombre: texto(m.nombre, 80),
        grupo: GRUPOS_VALIDOS.has(m.grupo) ? m.grupo : 'otro',
        tipo: TIPOS_VALIDOS.has(m.tipo) ? m.tipo : 'maquina',
        icono: texto(m.icono, 30),
        unidad: m.unidad === 'lb' ? 'lb' : 'kg',
        incremento: num(m.incremento, 0.5, 50, m.unidad === 'lb' ? 5 : 2.5),
        notas: texto(m.notas, 400),
      }));
    if (!maquinas.length) return { ok: false, motivo: 'ese gimnasio llega sin máquinas' };
    return {
      ok: true,
      paquete: { v: VERSION, tipo: 'gimnasio', nombre: texto(p.nombre, 60) || 'Gimnasio', ciudad: texto(p.ciudad, 60), autor: texto(p.autor, 40), maquinas },
    };
  }

  return { ok: false, motivo: 'no reconozco lo que lleva ese enlace' };
}

/* --------------------------------------------------------------------------
 * Importar
 * ------------------------------------------------------------------------ */

/** El dibujo del catálogo para un nombre, si lo hay. Así una máquina que llega
 *  de fuera no aparece con el hueco vacío mientras no tenga foto. */
function iconoDelCatalogo(nombre) {
  const clave = normalizarNombre(nombre);
  const e = CATALOGO.find((x) => normalizarNombre(x.n) === clave);
  return e ? { icono: e.i, tipo: e.t, grupo: e.g } : null;
}

/**
 * Mete las máquinas de un paquete en un gimnasio, sin duplicar.
 *
 * @returns {{ids:Map<string,string>, creadas:number, reusadas:number}}
 *          `ids` va de nombre normalizado → id, que es lo que necesita luego la
 *          rutina para armar su plan.
 */
export async function importarMaquinas(maquinas, gimnasioId, existentes) {
  const porNombre = new Map(
    existentes.filter((m) => m.gimnasioId === gimnasioId)
      .map((m) => [normalizarNombre(m.nombre), m.id]));

  const ids = new Map();
  let creadas = 0;
  let reusadas = 0;

  for (const m of maquinas) {
    const clave = normalizarNombre(m.nombre);
    if (porNombre.has(clave)) {
      // Ya la tiene: se REUSA, y no se le toca ni la unidad ni las notas. Lo
      // que hay en su móvil es su verdad, y su historial cuelga de esa fila.
      ids.set(clave, porNombre.get(clave));
      reusadas++;
      continue;
    }
    const delCat = iconoDelCatalogo(m.nombre);
    const fila = await db.guardar('maquinas', {
      gimnasioId,
      nombre: m.nombre,
      grupo: m.grupo || (delCat && delCat.grupo) || 'otro',
      tipo: m.tipo || (delCat && delCat.tipo) || 'maquina',
      icono: m.icono || (delCat && delCat.icono) || '',
      unidad: m.unidad || 'kg',
      incremento: m.incremento || (m.unidad === 'lb' ? 5 : 2.5),
      notas: m.notas || '',
      foto: null,
    });
    porNombre.set(clave, fila.id);
    ids.set(clave, fila.id);
    creadas++;
  }
  return { ids, creadas, reusadas };
}

/**
 * Importa una rutina compartida al gimnasio elegido.
 *
 * Las máquinas que falten se dan de alta: una rutina de pecho a la que le
 * faltan tres ejercicios no sirve, y obligar a darlos de alta uno a uno antes
 * de poder usarla es justo la fricción que hace que nadie use la función.
 */
export async function importarRutina(paquete, gimnasioId, { maquinas = [], rutinas = [] } = {}) {
  const { ids, creadas, reusadas } = await importarMaquinas(
    paquete.ejercicios.map((e) => ({ nombre: e.nombre, grupo: e.grupo })),
    gimnasioId, maquinas);

  const plan = paquete.ejercicios
    .map((e) => {
      const id = ids.get(normalizarNombre(e.nombre));
      return id ? {
        maquinaId: id,
        series: e.series,
        reps: e.reps,
        // LO QUE ESCRIBIÓ EL AUTOR se guarda tal cual y no se toca nunca más:
        // si tú escribes encima, lo tuyo va a `notaMia`. Son dos voces
        // distintas y mezclarlas sería borrarle la suya a quien la hizo.
        ...(e.nota ? { nota: e.nota } : {}),
        ...(e.video ? { video: e.video } : {}),
        ...(e.foto ? { foto: e.foto } : {}),
      } : null;
    })
    .filter(Boolean);

  const rutina = await db.guardar('rutinas', {
    nombre: nombreLibre(paquete.nombre, rutinas),
    plan,
    maquinas: plan.map((p) => p.maquinaId),
    grupos: [],
    ...(paquete.nota ? { nota: paquete.nota } : {}),
    // Quién la escribió, para que se sepa de quién son las notas de dentro.
    ...(paquete.autor ? { autorNota: paquete.autor } : {}),
    // De dónde vino, para que dentro de tres meses se sepa por qué está ahí.
    origen: paquete.autor ? `compartida por ${paquete.autor}` : 'compartida',
  });

  return { rutina, creadas, reusadas, ejercicios: plan.length };
}

/**
 * Importa un gimnasio entero con sus máquinas.
 *
 * Siempre crea un gimnasio NUEVO, aunque ya haya uno con el mismo nombre. Dos
 * «Basic-Fit» son dos sitios distintos con máquinas distintas, y mezclarlos
 * partiría el historial de las dos. Renombrar es un toque; deshacer una mezcla,
 * imposible.
 */
export async function importarGimnasio(paquete, { gimnasios = [] } = {}) {
  const gimnasio = await db.guardar('gimnasios', {
    nombre: nombreLibre(paquete.nombre, gimnasios),
    ciudad: paquete.ciudad || '',
    notas: paquete.autor ? `Compartido por ${paquete.autor}` : 'Compartido',
  });
  const { creadas } = await importarMaquinas(paquete.maquinas, gimnasio.id, []);
  return { gimnasio, creadas };
}

/** «Push» → «Push (2)» si ya hay un «Push». Nadie distingue dos «Push». */
function nombreLibre(nombre, lista) {
  const usados = new Set(lista.map((x) => String(x.nombre || '').toLowerCase()));
  let candidato = nombre;
  let n = 1;
  while (usados.has(candidato.toLowerCase())) {
    n++;
    candidato = `${nombre} (${n})`;
  }
  return candidato;
}

/** El texto que acompaña al enlace en WhatsApp. */
export function textoDe(paquete, autor = '') {
  const de = autor ? ` de ${autor}` : '';
  if (paquete.tipo === 'rutina') {
    return `Mira la rutina «${paquete.nombre}»${de}: ${paquete.ejercicios.length} ejercicios. Ábrela con la app GYM.`;
  }
  return `Te paso las máquinas de «${paquete.nombre}»${de}: ${paquete.maquinas.length} máquinas ya apuntadas. Ábrelo con la app GYM.`;
}
