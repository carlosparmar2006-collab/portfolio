/* =============================================================================
 * nube.js — La cuenta de Supabase: registro, sesión y perfil publicado.
 *
 * Carlos, 30-ago-2026: *«creo que aquí podríamos aprovechar supabase para la
 * creación de las cuentas (evidentemente con correo y contraseña funcionales)»*.
 *
 * POR QUÉ SUPABASE Y NO EL PC DE CASA
 * -----------------------------------
 * El resto de la app tiene una regla firme: «la nube es el PC de Carlos». Aquí
 * NO sirve, y por un motivo concreto: el PC está en una red doméstica detrás de
 * un router. Un amigo al que le llegue un enlace por WhatsApp no puede abrir
 * `http://192.168.68.107:8772` desde su casa. Compartir con OTRA gente necesita
 * algo con dirección pública, y Supabase da cuentas + base + almacén gratis.
 *
 * LO QUE SIGUE SIENDO DEL PC, Y NO SE MUEVE
 * -----------------------------------------
 * Las series, los pesos, las comidas, los gimnasios. Los datos de entrenar
 * siguen naciendo en el móvil y sincronizando con el PC, exactamente igual que
 * antes. A Supabase solo sube lo que hay que ENSEÑAR A OTROS: el perfil
 * público (foto, alias, bio, insignias, medallas) y los paquetes compartidos.
 * Si un día Supabase cierra, la app sigue funcionando entera: se queda sin
 * compartir, nada más. Esa es la prueba de que la frontera está bien puesta.
 *
 * SIN DEPENDENCIAS
 * ----------------
 * Ni `@supabase/supabase-js` ni npm: la app no tiene empaquetador y se sirve
 * como ficheros sueltos dentro de un APK. Esto habla con la API REST a pelo
 * (GoTrue para las cuentas, PostgREST para las tablas, Storage para el avatar),
 * que es HTTP normal y corriente y se puede leer entero de un vistazo.
 *
 * NUNCA LANZA HACIA ARRIBA. Igual que `sync.js`: devuelve `{ok:false, motivo}`.
 * Que Supabase esté caído no puede impedir apuntar una serie.
 * ========================================================================== */

import * as db from './db.js';

const CLAVE_URL = 'nube_url';
const CLAVE_ANON = 'nube_anon';
const CLAVE_SESION = 'nube_sesion';

/* --------------------------------------------------------------------------
 * La configuración QUE VIAJA CON LA APP  (`app/nube.json`)
 *
 * Esto es la otra mitad del arreglo de «los enlaces no funcionan».
 *
 * Un enlace corto (`…/#/c/k3f9a2b7c1`) no lleva la rutina dentro: lleva un
 * código, y el paquete vive en Supabase. Para ir a buscarlo hace falta la URL
 * del proyecto y la clave `anon`. Carlos las tecleó en SU móvil, así que su
 * móvil sabe abrirlos — pero el amigo que recibe el enlace abre la app en
 * GitHub Pages recién estrenada, sin nada configurado, y lo único que podía
 * pasar es lo que pasaba: «la nube no está configurada».
 *
 * Por eso las dos las trae la app. La clave `anon` es PÚBLICA por diseño: va
 * dentro de cualquier web hecha con Supabase y sola no abre nada — quien manda
 * son las políticas RLS del `schema.sql`. La que no puede salir de la consola
 * de Supabase jamás es la `service_role`.
 * ------------------------------------------------------------------------ */

let _porDefecto = null;   // {url, anon} de nube.json, o null si aún no hay
let _web = '';            // la dirección pública de la app, de nube.json
let _cargado = false;     // ya se leyó el fichero (aunque viniera medio vacío)
let _cargando = null;

export async function cargarPorDefecto() {
  // Se mira `_cargado` y no `_porDefecto`: un `nube.json` con dirección pública
  // pero sin Supabase es perfectamente válido —los enlaces largos no necesitan
  // nube— y con la comprobación anterior se releía el fichero en cada llamada.
  if (_cargado) return _porDefecto;
  if (_cargando) return _cargando;
  _cargando = (async () => {
    try {
      // Ruta relativa al módulo, no a la página: dentro del APK la app cuelga
      // de `/assets/` y una ruta absoluta se iría a la raíz del dominio.
      const resp = await fetch(new URL('../nube.json', import.meta.url));
      if (!resp.ok) return null;
      const d = await resp.json();
      const url = String((d && d.url) || '').trim().replace(/\/+$/, '');
      const anon = String((d && d.anon) || '').trim();
      // La dirección pública se guarda SIEMPRE, aunque falte lo de Supabase:
      // son dos cosas independientes. Los enlaces largos (que llevan la rutina
      // dentro) necesitan una raíz pero no necesitan nube ninguna.
      _web = String((d && d.web) || '').trim().replace(/\/+$/, '');
      // De la nube sí se exigen las dos: media configuración es peor que
      // ninguna, porque la app creería que puede hablar con ella.
      if (url && anon) _porDefecto = { url, anon };
      _cargado = true;
      return _porDefecto;
    } catch {
      _cargado = true;   // no hay fichero: no se vuelve a intentar en cada toque
      return null;       // se sigue sin nube y ya está
    } finally {
      _cargando = null;
    }
  })();
  return _cargando;
}

/** Lo que trae la app de fábrica, sin ir a buscarlo (ya se cargó al arrancar). */
export function porDefecto() {
  return _porDefecto;
}

/**
 * La dirección pública de la app, la que viaja en `nube.json`.
 *
 * Vive aquí y no en `compartir.js` porque es un dato de configuración como los
 * otros dos, y porque la necesitan los dos módulos: `compartir` para la raíz de
 * los enlaces y `nube` para decirle a Supabase a dónde devolver los correos.
 * Antes estaba escrita a fuego en el código, y eso obligaba a publicar una
 * versión nueva de la app solo para cambiar de sitio de alojamiento.
 */
export function webPublica() {
  return _web;
}

/**
 * ¿La nube que usa este móvil es la MISMA que trae la app?
 *
 * De esto depende que un enlace corto se pueda mandar. Si Carlos apunta su
 * móvil a un proyecto propio que la app no conoce, sus enlaces cortos no los
 * podría abrir nadie más, así que `compartir.js` se cae al enlace largo. Es
 * preferible un enlace feo que uno que no abre.
 */
export async function esLaDeLaApp() {
  const [guardada, porDef] = await Promise.all([
    db.ajuste(CLAVE_URL, ''),
    cargarPorDefecto(),
  ]);
  if (!porDef) return false;
  if (!guardada) return true;                       // no hay override: es la de la app
  return String(guardada).replace(/\/+$/, '') === porDef.url;
}

/** Margen para refrescar el testigo ANTES de que caduque (5 min). Refrescar
 *  justo al expirar deja una ventana en la que las peticiones fallan solas. */
const MARGEN_REFRESCO = 5 * 60 * 1000;

let _sesion = null;      // {access_token, refresh_token, expira, usuario}
let _refrescando = null; // promesa en curso, para no pedir dos refrescos a la vez
const _oyentes = new Set();

/* --------------------------------------------------------------------------
 * Configuración
 * ------------------------------------------------------------------------ */

/**
 * La URL y la clave `anon` del proyecto de Supabase.
 *
 * La clave `anon` es PÚBLICA por diseño: va en cualquier app web que use
 * Supabase y no da acceso a nada por sí sola — quien manda son las políticas
 * RLS de la base (ver `gym/supabase/schema.sql`). La que NO puede aparecer
 * jamás por aquí es la `service_role`.
 */
export async function configuracion() {
  const [url, anon] = await Promise.all([db.ajuste(CLAVE_URL, ''), db.ajuste(CLAVE_ANON, '')]);
  // Lo tecleado a mano manda sobre lo que trae la app: si un día hay que mover
  // el proyecto, se cambia desde Ajustes sin esperar a una versión nueva.
  const porDef = _porDefecto || (await cargarPorDefecto());
  return {
    url: String(url || (porDef && porDef.url) || '').replace(/\/+$/, ''),
    anon: String(anon || (porDef && porDef.anon) || ''),
  };
}

export async function configurar({ url, anon }) {
  if (url !== undefined) await db.ponAjuste(CLAVE_URL, String(url || '').trim().replace(/\/+$/, ''));
  if (anon !== undefined) await db.ponAjuste(CLAVE_ANON, String(anon || '').trim());
  return configuracion();
}

/** ¿Está la nube configurada? Sin esto, toda la pantalla de cuenta se esconde. */
export async function hayNube() {
  const c = await configuracion();
  return !!(c.url && c.anon);
}

export function alCambiarSesion(fn) {
  _oyentes.add(fn);
  return () => _oyentes.delete(fn);
}

function avisar() {
  for (const fn of _oyentes) {
    try { fn(_sesion); } catch (_) { /* un oyente roto no tumba la sesión */ }
  }
}

/* --------------------------------------------------------------------------
 * Sesión
 * ------------------------------------------------------------------------ */

/** Recupera la sesión guardada al arrancar la app. */
export async function arrancar() {
  // Antes que nada, la configuración que trae la app: si llegara después, la
  // primera pintada del perfil diría «no hay nube» y eso se lee como que la
  // cuenta no existe.
  await cargarPorDefecto();
  _sesion = await db.ajuste(CLAVE_SESION, null);
  if (_sesion) avisar();
  return _sesion;
}

export function sesion() {
  return _sesion;
}

export function usuario() {
  return _sesion ? _sesion.usuario : null;
}

async function guardarSesion(s) {
  _sesion = s;
  await db.ponAjuste(CLAVE_SESION, s);
  avisar();
  return s;
}

function deRespuesta(d) {
  return {
    access_token: d.access_token,
    refresh_token: d.refresh_token,
    // `expires_in` viene en segundos; se guarda ya convertido a instante para
    // no tener que acordarse de la resta en cada llamada.
    expira: Date.now() + (Number(d.expires_in) || 3600) * 1000,
    usuario: d.user ? { id: d.user.id, email: d.user.email } : (_sesion && _sesion.usuario) || null,
  };
}

/* --------------------------------------------------------------------------
 * Llamadas
 * ------------------------------------------------------------------------ */

/**
 * Traduce lo que dice Supabase (en inglés y para programadores) a algo que se
 * pueda leer de pie en un vestuario. Lo que no se reconoce se deja tal cual:
 * inventar un mensaje bonito para un error desconocido esconde el problema.
 */
function enCristiano(estado, cuerpo) {
  const msg = String((cuerpo && (cuerpo.msg || cuerpo.message || cuerpo.error_description || cuerpo.error)) || '');
  const m = msg.toLowerCase();
  if (m.includes('invalid login credentials')) return 'El correo o la contraseña no son correctos';
  if (m.includes('email not confirmed')) return 'Te ha llegado un correo para confirmar la cuenta: ábrelo primero';
  if (m.includes('user already registered') || m.includes('already been registered')) return 'Ese correo ya tiene cuenta. Entra en vez de registrarte';
  if (m.includes('password should be at least')) return 'La contraseña es muy corta (mínimo 6 caracteres)';
  if (m.includes('unable to validate email') || m.includes('invalid email')) return 'Ese correo no parece válido';
  if (m.includes('duplicate key') && m.includes('alias')) return 'Ese alias ya lo tiene otra persona. Prueba con otro';
  if (m.includes('rate limit') || estado === 429) return 'Demasiados intentos seguidos. Espera un minuto';
  if (estado === 401 || estado === 403) return 'La sesión ha caducado. Vuelve a entrar';
  return msg || `Supabase respondió ${estado}`;
}

async function pedir(camino, { metodo = 'GET', cuerpo, cabeceras = {}, conSesion = false, corte = 15000 } = {}) {
  const { url, anon } = await configuracion();
  if (!url || !anon) return { ok: false, motivo: 'la nube no está configurada' };

  if (conSesion) {
    const r = await asegurarSesion();
    if (!r.ok) return r;
  }

  const ctrl = new AbortController();
  const reloj = setTimeout(() => ctrl.abort(), corte);
  try {
    const resp = await fetch(`${url}${camino}`, {
      method: metodo,
      headers: {
        apikey: anon,
        Authorization: `Bearer ${conSesion && _sesion ? _sesion.access_token : anon}`,
        ...(cuerpo instanceof Blob ? {} : { 'Content-Type': 'application/json' }),
        ...cabeceras,
      },
      body: cuerpo === undefined ? undefined : (cuerpo instanceof Blob ? cuerpo : JSON.stringify(cuerpo)),
      signal: ctrl.signal,
    });

    const texto = await resp.text();
    let datos = null;
    try { datos = texto ? JSON.parse(texto) : null; } catch { datos = texto; }

    if (!resp.ok) return { ok: false, estado: resp.status, motivo: enCristiano(resp.status, datos) };
    return { ok: true, datos };
  } catch (e) {
    return {
      ok: false,
      motivo: e.name === 'AbortError' ? 'la nube no responde' : 'sin conexión con la nube',
    };
  } finally {
    clearTimeout(reloj);
  }
}

/** Refresca el testigo si hace falta. Una sola vez aunque lo pidan diez sitios. */
async function asegurarSesion() {
  if (!_sesion) return { ok: false, motivo: 'no has entrado en tu cuenta' };
  if (_sesion.expira - Date.now() > MARGEN_REFRESCO) return { ok: true };
  if (_refrescando) return _refrescando;

  _refrescando = (async () => {
    const { url, anon } = await configuracion();
    try {
      const resp = await fetch(`${url}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST',
        headers: { apikey: anon, 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: _sesion.refresh_token }),
      });
      if (!resp.ok) {
        // El refresco caducado es el ÚNICO caso en el que se tira la sesión.
        // Un fallo de red no puede desloguear a nadie: mañana en la WiFi
        // volvería a funcionar y haberla borrado sería una pérdida gratuita.
        if (resp.status === 400 || resp.status === 401) {
          await guardarSesion(null);
          return { ok: false, motivo: 'la sesión ha caducado, vuelve a entrar' };
        }
        return { ok: false, motivo: 'no pude renovar la sesión' };
      }
      await guardarSesion(deRespuesta(await resp.json()));
      return { ok: true };
    } catch {
      return { ok: false, motivo: 'sin conexión para renovar la sesión' };
    } finally {
      _refrescando = null;
    }
  })();

  return _refrescando;
}

/* --------------------------------------------------------------------------
 * Cuenta
 * ------------------------------------------------------------------------ */

/**
 * Registro con correo y contraseña.
 *
 * El alias viaja en `data` y un disparador de la base crea la fila de
 * `perfiles` (ver schema.sql). Se hace ALLÍ y no aquí porque si la app creara
 * el perfil en una segunda llamada, un móvil que se queda sin batería entre
 * las dos dejaría una cuenta sin perfil, y eso no hay quien lo arregle desde
 * el móvil.
 *
 * Si el proyecto tiene activada la confirmación por correo, Supabase devuelve
 * el usuario SIN sesión: hay que ir al buzón. Se distingue con `confirmar`.
 */
/* --------------------------------------------------------------------------
 * EL ALIAS Y EL NOMBRE SON DOS COSAS DISTINTAS
 *
 * Carlos, 31-ago-2026: *«tampoco se puede poner el nombre de usuario que
 * quieras ni en mayúsculas ni con símbolos»*.
 *
 * Tenía media razón y la mitad que faltaba es importante, así que se separan:
 *
 *   · EL NOMBRE es libre del todo. Mayúsculas, acentos, espacios, símbolos,
 *     lo que sea. Es lo que se ve en grande en el perfil.
 *   · EL ALIAS es la DIRECCIÓN (`.../#/p/carlos`). Ahí no se puede meter lo que
 *     uno quiera y no es una limitación nuestra: un espacio, un `#` o un `/`
 *     parten la URL, y entonces el enlace de tu perfil deja de abrir. Lo que sí
 *     se ha ampliado es el guion, que faltaba y lo usa media internet.
 *
 * Y las MAYÚSCULAS del alias se guardan: se busca por «anagarcia» pero se
 * enseña «AnaGarcia», que es lo que echaba en falta. La comparación va siempre
 * en minúsculas para que dos personas no puedan coger «Ana» y «ana».
 * ------------------------------------------------------------------------ */

export const ALIAS_MIN = 3;
export const ALIAS_MAX = 20;

/** El alias tal y como se guarda para buscar: minúsculas y nada raro. */
export function normalizarAlias(alias) {
  return String(alias || '').trim().toLowerCase().replace(/[^a-z0-9_.-]/g, '').slice(0, ALIAS_MAX);
}

/**
 * Qué le pasa a un alias, dicho de forma que se pueda arreglar.
 *
 * Devuelve `null` si está bien. Un «no válido» a secas obliga a adivinar; aquí
 * se dice exactamente qué sobra.
 */
export function quePasaConElAlias(alias) {
  const bruto = String(alias || '').trim();
  if (!bruto) return 'Ponte un nombre de usuario';
  if (bruto.length < ALIAS_MIN) return `Necesita al menos ${ALIAS_MIN} caracteres`;
  if (bruto.length > ALIAS_MAX) return `Como mucho ${ALIAS_MAX} caracteres`;
  const malos = [...new Set(bruto.toLowerCase().split('').filter((c) => !/[a-z0-9_.-]/.test(c)))];
  if (malos.length) {
    return `Aquí no cabe ${malos.map((c) => (c === ' ' ? 'el espacio' : `«${c}»`)).join(', ')}: `
      + 'el nombre de usuario es tu dirección. Letras, números, punto, guion y guion bajo.';
  }
  if (!/^[a-z0-9]/i.test(bruto)) return 'Tiene que empezar por una letra o un número';
  return null;
}

/** Un alias propuesto a partir del nombre: «Ana Ló+pez» → «analopez». */
export function aliasDesdeNombre(nombre) {
  const s = String(nombre || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '');
  return s.slice(0, ALIAS_MAX);
}

/* --------------------------------------------------------------------------
 * LA CONTRASEÑA
 *
 * Carlos: *«cuando hagas contraseñas acuérdate de que deben estar cifradas de
 * extremo a extremo»*. Aquí hay que ser exacto, porque la idea es buena pero el
 * nombre no encaja y creerse protegido sin estarlo es peor que saberlo:
 *
 *   · Una contraseña NO se cifra de extremo a extremo. Un cifrado tiene la
 *     vuelta (se descifra), y una contraseña guardada de forma que se pueda
 *     descifrar es una contraseña que alguien puede leer. Lo que se hace —y lo
 *     que hace Supabase— es un RESUMEN de un solo sentido (bcrypt) con sal:
 *     de la base no se puede sacar la contraseña ni teniéndola entera delante.
 *   · Por el cable va cifrada, eso sí: TLS. Y desde aquí no se guarda NUNCA,
 *     ni en IndexedDB ni en `localStorage`. Lo único que se guarda es el
 *     testigo de sesión, que caduca.
 *   · Lo que sí se cifra de extremo a extremo es el CONTENIDO, y ahí el GYM ya
 *     va más lejos que eso: las series, los pesos y las comidas **no salen del
 *     móvil**. No hace falta cifrarlas para la nube porque no hay nube.
 *
 * Lo que sí se puede hacer aquí, y se hace, es no dejar pasar una contraseña
 * mala. Está en `fuerzaContrasena`.
 * ------------------------------------------------------------------------ */

/** Las que se ven en cualquier lista de contraseñas filtradas. */
const CONTRASENAS_OBVIAS = [
  '123456', '123456789', 'password', 'contrasena', 'qwerty', '111111', '12345678',
  'abc123', '1234567', 'iloveyou', '000000', 'admin', 'gimnasio', 'gym', 'barcelona',
  'футбол', 'letmein', 'monkey', 'dragon', 'football', 'princess', 'sunshine',
];

/**
 * Cuánto aguanta una contraseña. 0 = no vale, 1 = floja, 2 = vale, 3 = buena.
 *
 * No se pide «una mayúscula, un número y un símbolo»: esa regla produce
 * «Passw0rd!» —que está en todas las listas— y hace que la gente apunte la
 * contraseña en un papel. Se mide lo que de verdad cuesta adivinar: LARGO
 * primero, variedad después, y fuera lo obvio.
 */
export function fuerzaContrasena(pass, pistas = []) {
  const p = String(pass || '');
  if (p.length < 8) return { nivel: 0, texto: 'Necesita 8 caracteres como mínimo' };

  const plano = p.toLowerCase();
  for (const mala of CONTRASENAS_OBVIAS) {
    if (plano.includes(mala)) return { nivel: 0, texto: 'Esa es de las primeras que se prueban' };
  }
  // Que no sea tu propio correo o tu alias: es lo primero que prueba quien te
  // conoce, y es exactamente el dato que el atacante ya tiene.
  for (const pista of pistas) {
    const t = String(pista || '').toLowerCase().split(/[@.\s]/)[0];
    if (t && t.length >= 3 && plano.includes(t)) {
      return { nivel: 0, texto: 'No uses tu correo ni tu nombre de usuario' };
    }
  }
  if (/^(.)\1+$/.test(p)) return { nivel: 0, texto: 'Todo el mismo carácter no cuenta' };

  let puntos = 0;
  if (p.length >= 10) puntos++;
  if (p.length >= 14) puntos++;
  const variedad = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9]/].filter((r) => r.test(p)).length;
  if (variedad >= 2) puntos++;
  if (variedad >= 3) puntos++;

  const nivel = Math.min(3, Math.max(1, Math.round(puntos * 0.9)));
  return {
    nivel,
    texto: ['', 'Floja: alárgala un poco', 'Aguanta', 'Buena'][nivel],
  };
}

/**
 * A dónde vuelve el correo de confirmación.
 *
 * ESTE ERA EL FALLO DE «NO TE DEJA CONFIRMAR EL CORREO».
 *
 * Supabase manda un enlace que apunta a su `/auth/v1/verify`, y de ahí rebota a
 * la dirección que le digas. Si no le dices ninguna, usa la «Site URL» del
 * panel, que de fábrica es `http://localhost:3000` — o sea, el ordenador de
 * quien abre el correo. Se pulsaba el enlace y no llegaba a ninguna parte.
 *
 * Ahora se le dice, y es la misma dirección pública de la que cuelgan los
 * enlaces compartidos. OJO: además hay que meterla en «Redirect URLs» del
 * panel de Supabase, o la rechaza. Está en `supabase/PASOS-CARLOS.md`.
 */
export function dondeVuelve() {
  // Se pide a `compartir.js` a través de una función suelta para no crear una
  // dependencia circular entre los dos módulos.
  return _dondeVuelve;
}

let _dondeVuelve = '';

export function fijarDondeVuelve(url) {
  _dondeVuelve = String(url || '').replace(/\/+$/, '');
}

function conVuelta(camino) {
  const v = dondeVuelve();
  return v ? `${camino}${camino.includes('?') ? '&' : '?'}redirect_to=${encodeURIComponent(v + '/')}` : camino;
}

export async function registrar({ email, password, alias, nombre }) {
  const limpio = normalizarAlias(alias);
  const problema = quePasaConElAlias(alias);
  if (problema) return { ok: false, motivo: problema };
  const fuerza = fuerzaContrasena(password, [email, alias]);
  if (fuerza.nivel === 0) return { ok: false, motivo: fuerza.texto };

  const r = await pedir(conVuelta('/auth/v1/signup'), {
    metodo: 'POST',
    cuerpo: {
      email: String(email || '').trim(),
      password,
      // Lo que viaja aquí lo recoge el disparador `crear_perfil_al_registrarse`
      // de la base. Se hace ALLÍ y no en una segunda llamada porque un móvil
      // que se queda sin batería entre las dos dejaría una cuenta sin perfil.
      data: { alias: limpio, alias_visible: String(alias || '').trim(), nombre: String(nombre || '').trim() },
    },
  });
  if (!r.ok) return r;

  if (r.datos && r.datos.access_token) {
    await guardarSesion(deRespuesta(r.datos));
    await completarPerfilNuevo({ alias: limpio, aliasVisible: String(alias || '').trim(), nombre });
    return { ok: true, confirmar: false, usuario: _sesion.usuario };
  }
  return { ok: true, confirmar: true, email: String(email || '').trim() };
}

/**
 * Reenviar el correo de confirmación.
 *
 * Faltaba y es la mitad del problema: el primero se pierde en spam, o se borra,
 * o caduca, y sin esto la única salida era registrarse otra vez — que además
 * falla, porque el correo «ya tiene cuenta». Un callejón sin salida.
 */
export async function reenviarConfirmacion(email) {
  return pedir(conVuelta('/auth/v1/resend'), {
    metodo: 'POST',
    cuerpo: { type: 'signup', email: String(email || '').trim() },
  });
}

/**
 * El nombre visible y las mayúsculas del alias, en cuanto hay sesión.
 *
 * El disparador de la base solo pone el alias en minúsculas (es lo único que
 * puede validar). Lo demás se escribe aquí, y si falla no pasa nada: se puede
 * cambiar en el perfil.
 */
async function completarPerfilNuevo({ alias, aliasVisible, nombre }) {
  const u = usuario();
  if (!u) return;
  await pedir(`/rest/v1/perfiles?id=eq.${u.id}`, {
    metodo: 'PATCH',
    conSesion: true,
    cuerpo: {
      alias_visible: aliasVisible || alias,
      ...(nombre ? { nombre: String(nombre).trim() } : {}),
    },
  });
}

export async function entrar({ email, password }) {
  const r = await pedir('/auth/v1/token?grant_type=password', {
    metodo: 'POST',
    cuerpo: { email: String(email || '').trim(), password },
  });
  if (!r.ok) return r;
  await guardarSesion(deRespuesta(r.datos));
  return { ok: true, usuario: _sesion.usuario };
}

export async function salir() {
  // Se avisa a Supabase, pero la sesión LOCAL se borra pase lo que pase: si
  // «Salir» dependiera de tener red, en el gimnasio no se podría salir nunca.
  if (_sesion) await pedir('/auth/v1/logout', { metodo: 'POST', conSesion: true, corte: 6000 });
  await guardarSesion(null);
  return { ok: true };
}

export async function recuperarContrasena(email) {
  return pedir(conVuelta('/auth/v1/recover'), {
    metodo: 'POST',
    cuerpo: { email: String(email || '').trim() },
  });
}

/**
 * LO QUE LLEGA DE VUELTA DEL CORREO.
 *
 * Supabase rebota a la app con el testigo DETRÁS DE LA ALMOHADILLA:
 *
 *     .../gym/#access_token=ey...&refresh_token=...&type=signup
 *
 * Y ahí está la trampa que ya nos costó una vez con los enlaces compartidos:
 * `pintar()` reescribe el `#` con el nombre de la vista en CADA pintada, así
 * que si esto no se lee LO PRIMERO en `arrancar()`, el testigo desaparece y la
 * confirmación del correo no sirve de nada — que es exactamente lo que se veía
 * desde fuera: «no te deja confirmar el correo».
 *
 * Los tres `type` que llegan:
 *   · `signup` / `magiclink` / `invite` → cuenta confirmada, ya hay sesión.
 *   · `recovery`                        → hay que pedir la contraseña nueva.
 *   · `email_change`                    → correo cambiado.
 *
 * Y también puede volver un ERROR (`#error=access_denied&error_code=otp_expired`),
 * que es el caso del enlace caducado. Se devuelve para poder ofrecer el reenvío
 * en vez de dejar a la persona mirando una pantalla que no dice nada.
 */
export function leerVueltaDeCorreo(hash = location.hash) {
  const h = String(hash || '').replace(/^#\/?/, '');
  if (!h.includes('access_token=') && !h.includes('error=')) return null;
  const p = new URLSearchParams(h);
  if (p.get('error') || p.get('error_code')) {
    return {
      que: 'error',
      codigo: p.get('error_code') || p.get('error') || '',
      texto: (p.get('error_description') || '').replace(/\+/g, ' '),
    };
  }
  const access = p.get('access_token');
  if (!access) return null;
  return {
    que: p.get('type') || 'signup',
    access_token: access,
    refresh_token: p.get('refresh_token') || '',
    expires_in: Number(p.get('expires_in')) || 3600,
  };
}

/** Deja entrar con el testigo que vino en el enlace del correo. */
export async function entrarConTestigo(v) {
  if (!v || !v.access_token) return { ok: false, motivo: 'el enlace no traía sesión' };
  await guardarSesion({
    access_token: v.access_token,
    refresh_token: v.refresh_token,
    expira: Date.now() + v.expires_in * 1000,
    usuario: null,
  });
  // El testigo no dice quién eres; hay que preguntarlo. Sin esto, la app
  // tendría sesión pero no sabría de quién, y el perfil saldría vacío.
  const r = await pedir('/auth/v1/user', { conSesion: true });
  if (!r.ok) {
    await guardarSesion(null);
    return r;
  }
  await guardarSesion({ ..._sesion, usuario: { id: r.datos.id, email: r.datos.email } });
  return { ok: true, usuario: _sesion.usuario };
}

/** Cambiar la contraseña. Con sesión: es lo que hace la pantalla de recuperar. */
export async function cambiarContrasena(nueva) {
  const f = fuerzaContrasena(nueva, [usuario() && usuario().email]);
  if (f.nivel === 0) return { ok: false, motivo: f.texto };
  return pedir('/auth/v1/user', { metodo: 'PUT', conSesion: true, cuerpo: { password: nueva } });
}

/** Cambiar el correo. Manda una confirmación al nuevo (y al viejo, si toca). */
export async function cambiarCorreo(nuevo) {
  return pedir(conVuelta('/auth/v1/user'), {
    metodo: 'PUT', conSesion: true, cuerpo: { email: String(nuevo || '').trim() },
  });
}

/* --------------------------------------------------------------------------
 * Dar de baja: dos cosas distintas
 *
 * Carlos: *«ni poderla desactivar ni poderla borrar»*. Son dos, y hay que poder
 * hacer las dos:
 *   · DESACTIVAR — te escondes. No sales en búsquedas, ni en perfiles, ni en
 *     clasificaciones. Tus datos siguen. Vuelves cuando quieras.
 *   · BORRAR — se va todo y no hay vuelta.
 *
 * Borrar NO se puede hacer con la clave `anon` (haría falta la `service_role`,
 * que no puede salir de la consola de Supabase). Va por una función de la base
 * que solo sabe borrar UNA cuenta: la de quien llama.
 * ------------------------------------------------------------------------ */

export async function desactivarCuenta(desactivar = true) {
  const r = await pedir('/rest/v1/rpc/desactivar_cuenta', {
    metodo: 'POST', conSesion: true, cuerpo: { p_desactivar: !!desactivar },
  });
  if (r.ok && desactivar) await guardarSesion(null);   // al esconderte, se sale
  return r;
}

export async function borrarCuenta() {
  const r = await pedir('/rest/v1/rpc/borrar_mi_cuenta', { metodo: 'POST', conSesion: true });
  if (!r.ok) return r;
  await guardarSesion(null);
  return { ok: true };
}

/* --------------------------------------------------------------------------
 * Las dos puertas de la API, para que `social.js` no repita todo esto.
 * ------------------------------------------------------------------------ */

/** Llama a una función de la base. `conSesion` en falso para lo que es público. */
export async function rpc(nombre, argumentos = {}, { conSesion = true } = {}) {
  return pedir(`/rest/v1/rpc/${nombre}`, { metodo: 'POST', conSesion, cuerpo: argumentos });
}

/** Una consulta a PostgREST tal cual. `camino` empieza por `/rest/v1/...`. */
export async function rest(camino, opciones = {}) {
  return pedir(camino, opciones);
}

/* --------------------------------------------------------------------------
 * Perfil publicado
 * ------------------------------------------------------------------------ */

/**
 * Sube (o actualiza) el perfil público.
 *
 * Es un `upsert` sobre la clave primaria, que es el id del usuario: siempre
 * hay como mucho UNA fila por persona, y da igual cuántas veces se llame.
 */
export async function publicarPerfil(perfil) {
  const u = usuario();
  if (!u) return { ok: false, motivo: 'no has entrado en tu cuenta' };

  return pedir('/rest/v1/perfiles', {
    metodo: 'POST',
    conSesion: true,
    cabeceras: { Prefer: 'resolution=merge-duplicates,return=representation' },
    cuerpo: [{
      id: u.id,
      alias: perfil.alias,
      nombre: perfil.nombre || '',
      bio: perfil.bio || '',
      foto_url: perfil.fotoUrl || null,
      publico: perfil.publico ? true : false,
      // El resumen viaja YA CALCULADO. La alternativa sería subir las series y
      // que la nube calculase, y eso obligaría a un tercer gemelo de `datos.js`
      // en SQL: tres sitios donde el mismo número puede salir distinto.
      resumen: perfil.resumen || {},
      insignias: perfil.insignias || [],
      medallas: perfil.medallas || [],
      rutinas: perfil.rutinas || [],
      notas: perfil.notas || [],
      act: new Date().toISOString(),
    }],
  });
}

/** El perfil público de un alias. Sin sesión: para eso es público. */
/**
 * TU PROPIO perfil, el de la cuenta con la que has entrado.
 *
 * Esto faltaba y era la mitad del bug que Carlos describió así: *«cuando entras
 * te sale sin nombre, como si no estuviese configurado, y te hace volver a
 * meter el nombre, el usuario, las anotaciones»*.
 *
 * El motivo: al registrarte, el alias y el nombre se escribían en Supabase (los
 * pone el disparador `crear_perfil_al_registrarse`) y NO en el móvil. La ficha
 * local del perfil se quedaba vacía, así que la pantalla enseñaba un perfil en
 * blanco aunque la cuenta tuviera nombre desde el primer minuto. Y al entrar en
 * OTRO móvil, o con OTRA cuenta, pasaba lo mismo.
 *
 * `perfilDe(alias)` no vale para esto: filtra por `publico=eq.true`, o sea que
 * un perfil en privado —que es como nacen todos— no se encuentra ni a sí mismo.
 */
export async function miPerfil() {
  const u = usuario();
  if (!u) return { ok: false, motivo: 'no has entrado en tu cuenta' };
  const r = await pedir(`/rest/v1/perfiles?id=eq.${u.id}&select=*`, { conSesion: true });
  if (!r.ok) return r;
  const fila = Array.isArray(r.datos) ? r.datos[0] : null;
  if (!fila) return { ok: false, motivo: 'tu cuenta todavía no tiene perfil' };
  return { ok: true, perfil: fila };
}

/* --------------------------------------------------------------------------
 * LA COPIA DE SEGURIDAD  (esquema 7)
 *
 * Lo que hace verdad la frase «crea una cuenta o lo pierdes todo». Sin esto la
 * cuenta no guardaba ni una serie: un móvil perdido se llevaba los entrenos.
 *
 * Solo la lee su dueño, y eso lo decide la BASE (política RLS `copia_leer_la_mia`),
 * no este fichero. Aquí no hay ninguna regla de privacidad que valga.
 * ------------------------------------------------------------------------ */

/** Sube el volcado. `filas` es solo para poder enseñarlo; los bytes los mide la base. */
export async function subirCopia(volcado, { aparato = '', filas = 0 } = {}) {
  const s = await asegurarSesion();
  if (!s.ok) return s;
  const r = await pedir('/rest/v1/rpc/guardar_copia', {
    metodo: 'POST', conSesion: true, corte: 30000,
    cuerpo: { p_datos: volcado, p_aparato: aparato, p_filas: filas },
  });
  if (!r.ok) return r;
  const fila = Array.isArray(r.datos) ? r.datos[0] : r.datos;
  return { ok: true, ...(fila || {}) };
}

/** ¿Hay copia, de cuándo y de qué móvil? Sin bajarse los megas. */
export async function infoCopia() {
  const s = await asegurarSesion();
  if (!s.ok) return s;
  const r = await pedir('/rest/v1/rpc/hay_copia', { metodo: 'POST', conSesion: true, cuerpo: {} });
  if (!r.ok) return r;
  const fila = Array.isArray(r.datos) ? r.datos[0] : r.datos;
  return { ok: true, hay: !!fila, ...(fila || {}) };
}

/** Baja la copia entera. Corte largo: pueden ser un par de megas por 3G. */
export async function bajarCopia() {
  const s = await asegurarSesion();
  if (!s.ok) return s;
  const r = await pedir('/rest/v1/copias?select=datos,actualizado,filas', {
    conSesion: true, corte: 45000,
  });
  if (!r.ok) return r;
  const fila = Array.isArray(r.datos) ? r.datos[0] : null;
  if (!fila) return { ok: true, hay: false };
  return { ok: true, hay: true, volcado: fila.datos, actualizado: fila.actualizado };
}

export async function perfilDe(alias) {
  const a = encodeURIComponent(String(alias || '').trim().toLowerCase());
  const r = await pedir(`/rest/v1/perfiles?alias=eq.${a}&publico=eq.true&select=*`);
  if (!r.ok) return r;
  const fila = Array.isArray(r.datos) ? r.datos[0] : null;
  return fila ? { ok: true, perfil: fila } : { ok: false, motivo: 'no encontré ese perfil' };
}

/**
 * ¿Está libre este alias? Para avisar ANTES de intentar registrarse.
 *
 * Va por función y no por consulta a la tabla porque la política de lectura
 * esconde los perfiles que no son públicos: un alias cogido por alguien en
 * privado parecería libre, y el registro fallaría después con un error feo.
 */
export async function aliasLibre(alias) {
  const r = await pedir('/rest/v1/rpc/alias_libre', {
    metodo: 'POST',
    cuerpo: { p_alias: String(alias || '').trim().toLowerCase() },
  });
  if (!r.ok) return r;
  return { ok: true, libre: r.datos === true };
}

/**
 * Sube la foto de perfil y devuelve su URL pública.
 *
 * El nombre lleva la marca de tiempo a propósito: las URL de Storage las
 * cachea el navegador con ganas, y reusar el nombre dejaba la foto vieja en
 * pantalla después de cambiarla.
 */
export async function subirAvatar(blob) {
  const u = usuario();
  if (!u) return { ok: false, motivo: 'no has entrado en tu cuenta' };

  const ext = (blob.type || '').includes('png') ? 'png' : 'jpg';
  const camino = `${u.id}/avatar-${Date.now()}.${ext}`;
  const r = await pedir(`/storage/v1/object/avatares/${camino}`, {
    metodo: 'POST',
    conSesion: true,
    cabeceras: { 'Content-Type': blob.type || 'image/jpeg', 'x-upsert': 'true' },
    cuerpo: blob,
    corte: 30000,
  });
  if (!r.ok) return r;

  const { url } = await configuracion();
  return { ok: true, url: `${url}/storage/v1/object/public/avatares/${camino}` };
}

/**
 * Sube una foto de un ejercicio de tu rutina y devuelve su URL pública.
 *
 * POR QUÉ FOTOS SÍ Y VÍDEO NO. El plan gratis de Supabase da 1 GB de sitio y
 * 5 GB de salida al mes. Una foto comprimida a 1080 px en WebP son ~150 KB:
 * caben 6.800 y se pueden mirar 34.000 veces al mes. Un vídeo de 30 segundos a
 * 720p son 8 MB: 125 vídeos llenan el GB y 640 reproducciones agotan la salida
 * — y cuando la salida se agota no se cae el vídeo, se cae LA APP ENTERA, que
 * usa la misma cuota. La cuenta completa está en
 * supabase/schema-6-notas-fotos.sql. Para vídeo se guarda un ENLACE a YouTube,
 * Instagram o TikTok, que cuesta cero.
 *
 * El nombre lleva la marca de tiempo por lo mismo que el avatar: las URL de
 * Storage se cachean con ganas y reusar el nombre deja la foto vieja en
 * pantalla después de cambiarla.
 */
export async function subirFotoRutina(blob) {
  const u = usuario();
  if (!u) return { ok: false, motivo: 'no has entrado en tu cuenta' };
  // El cajón acepta hasta 1 MB. Se comprueba aquí también para poder decirlo
  // con palabras en vez de recibir un 413 del servidor.
  if (blob.size > 1048576) {
    return { ok: false, motivo: 'esa foto pesa demasiado; prueba con otra' };
  }

  const ext = (blob.type || '').includes('webp') ? 'webp'
    : (blob.type || '').includes('png') ? 'png' : 'jpg';
  const camino = `${u.id}/rutina-${Date.now()}.${ext}`;
  const r = await pedir(`/storage/v1/object/rutinas/${camino}`, {
    metodo: 'POST',
    conSesion: true,
    cabeceras: { 'Content-Type': blob.type || 'image/webp', 'x-upsert': 'true' },
    cuerpo: blob,
    corte: 30000,
  });
  if (!r.ok) return r;

  const { url } = await configuracion();
  return { ok: true, url: `${url}/storage/v1/object/public/rutinas/${camino}` };
}

/** Cuánto sitio están ocupando tus fotos de rutina. */
export async function miGastoDeFotos() {
  const r = await rpc('mi_gasto_de_fotos', {});
  if (!r.ok) return r;
  const f = Array.isArray(r.datos) ? r.datos[0] : r.datos;
  return { ok: true, cuantas: (f && f.cuantas) || 0, bytes: (f && f.bytes) || 0 };
}

/* --------------------------------------------------------------------------
 * Paquetes compartidos
 * ------------------------------------------------------------------------ */

/**
 * Guarda un paquete para compartir y devuelve su código corto.
 *
 * El código lo pone la app y no la base: así el enlace se puede enseñar (y
 * copiar al portapapeles) SIN esperar a que la nube conteste. Es un código de
 * 10 caracteres de un alfabeto de 32 — mil millones de billones de
 * combinaciones — y además la fila lleva quién la creó.
 */
export async function guardarCompartido({ codigo, tipo, titulo, datos }) {
  const u = usuario();
  // Pide cuenta, igual que la política de la base. Quien no la tenga comparte
  // igual: `compartir.js` le da el enlace autocontenido, más largo pero que no
  // necesita a nadie.
  if (!u) return { ok: false, motivo: 'para el enlace corto hace falta cuenta' };
  return pedir('/rest/v1/compartidos', {
    metodo: 'POST',
    conSesion: true,
    cabeceras: { Prefer: 'return=representation' },
    cuerpo: [{ codigo, tipo, titulo, datos, autor: u.id }],
  });
}

/** Abre un paquete por su código. La función de la base suma la visita. */
export async function leerCompartido(codigo) {
  const r = await pedir('/rest/v1/rpc/abrir_compartido', {
    metodo: 'POST',
    cuerpo: { p_codigo: String(codigo || '').trim().toLowerCase() },
  });
  if (!r.ok) return r;
  const fila = Array.isArray(r.datos) ? r.datos[0] : r.datos;
  return fila && fila.codigo
    ? { ok: true, paquete: fila }
    : { ok: false, motivo: 'ese enlace ya no existe' };
}

/** Los paquetes que ha compartido esta persona, para poder borrarlos. */
export async function misCompartidos() {
  const u = usuario();
  if (!u) return { ok: false, motivo: 'no has entrado en tu cuenta' };
  return pedir(`/rest/v1/compartidos?autor=eq.${u.id}&select=*&order=creado.desc`, { conSesion: true });
}

export async function borrarCompartido(codigo) {
  const c = encodeURIComponent(String(codigo || '').trim());
  return pedir(`/rest/v1/compartidos?codigo=eq.${c}`, { metodo: 'DELETE', conSesion: true });
}

/** ¿Contesta el proyecto y la clave vale? Para el botón «Probar» de Ajustes. */
/**
 * ¿Está la nube en pie y con TODO puesto?
 *
 * Comprueba las tres cosas por separado y las distingue, porque son tres
 * problemas con tres arreglos distintos y confundirlos hace perder media tarde
 * buscando en el sitio equivocado:
 *
 *   1. ¿Contesta el proyecto?            → si no, es la URL, la clave o la red.
 *   2. ¿Está `schema.sql`?               → falta la tabla `perfiles`.
 *   3. ¿Está `schema-2-social.sql`?      → falta lo de la gente.
 *
 * Lo tercero se añadió el 31-ago-2026 porque el esquema son ya DOS ficheros y
 * un «la nube contesta y el esquema está puesto» que solo miraba el primero
 * estaba diciendo una verdad a medias: con el segundo sin pasar, la app abre,
 * la cuenta va, y luego buscar gente devuelve un 404 sin explicación.
 */
export async function probar() {
  const c = await configuracion();
  if (!c.url || !c.anon) return { ok: false, motivo: 'falta la dirección o la clave' };

  const r = await pedir('/rest/v1/perfiles?select=alias&limit=1', { corte: 8000 });
  if (!r.ok) {
    if (r.estado === 404) {
      return { ok: false, motivo: 'el proyecto contesta, pero le falta la tabla «perfiles». Pasa supabase/schema.sql' };
    }
    return r;
  }

  // La segunda parte se pregunta por una FUNCIÓN y no por una tabla: una
  // función que no existe da 404 limpio, mientras que una tabla escondida por
  // el RLS devuelve una lista vacía y parecería que está cuando no está.
  const social = await pedir('/rest/v1/rpc/buscar_gente', {
    metodo: 'POST', cuerpo: { p_texto: '__comprobacion__' }, corte: 8000,
  });
  if (!social.ok && (social.estado === 404 || social.estado === 400)) {
    return { ok: false, motivo: 'falta la segunda mitad del esquema. Pasa supabase/schema-2-social.sql' };
  }
  if (!social.ok) return social;

  return { ok: true, completo: true };
}
