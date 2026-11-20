/* =============================================================================
 * app.js — Interfaz de la app del gimnasio.
 *
 * PRINCIPIO QUE MANDA SOBRE TODO LO DEMÁS:
 * "no se debe perder muchísimo tiempo haciendo esto porque si no no es
 *  funcional" (Carlos). Apuntar una serie son DOS toques: [+] y [Guardar].
 * El peso viene ya puesto con lo que levantó la última vez, que es justo el
 * dato que se le olvida. Todo lo demás (foto, chuleta, gráficas) está a un
 * toque de distancia pero NUNCA en medio.
 * ========================================================================== */

import * as db from './db.js';
import * as D from './datos.js';
import * as G from './graficas.js';
import * as sync from './sync.js';
import * as cat from './catalogo.js';
import { icono } from './iconos.js';
import * as MET from './metas.js';
import * as CAL from './calendario.js';
import * as TEM from './temas.js';
import * as fotos from './fotos.js';
import * as N from './nutricion.js';
import * as C from './comida.js';
import * as P from './plan.js';
// OJO: se llama `geo` y no `mapa` porque más abajo ya hay un ayudante local
// `mapa()` que convierte listas en Map. Llamarlo igual rompía toda la app con
// «Identifier 'mapa' has already been declared».
import * as geo from './mapa.js';
import * as PF from './perfil.js';
import * as INS from './insignias.js';
import * as nube from './nube.js';
import * as comp from './compartir.js';
import * as social from './social.js';
import * as BV from './bienvenida.js';
import * as ID from './identidad.js';
// El vestuario (0.20.0): las cajas, los cosméticos, la tienda y el sonido. La
// pantalla vive en `vestuario.js` porque este fichero ya es la app entera; aquí
// solo se le da el puente con lo de casa (hojas, avisos, guardar).
import * as VEST from './vestuario.js';
import * as MOT from './motor.js';
import * as CAJ from './cajas.js';
import * as COS from './cosmeticos.js';
import * as SON from './sonido.js';
import * as PELIS from './peliculas.js';

/* ------------------------------------------------------------------ estado */
const S = {
  vista: 'entrenar',
  gimnasioId: null,
  filtro: 'todo', // 'todo' | grupo | 'rutina:<id>'
  busqueda: '',
  // Qué día del diario se está mirando. null = hoy. No se guarda entre
  // arranques a propósito: al abrir la app, el día es hoy.
  nutFecha: null,
  // Progreso: el rango de tiempo de las gráficas y la máquina que se está
  // mirando. 3 meses es lo que eligió Carlos como punto de partida.
  rango: '3m',
  ambito: 'gym',
  maquinaGrafica: null,
  // Por qué lado entra la pantalla al cambiar de pestaña. Lo pone `irA`.
  direccion: 'derecha',
  // Si el siguiente `pintar()` es un CAMBIO DE PESTAÑA (y por tanto se cruza)
  // o un simple repintado (y por tanto no se mueve nada).
  transicion: false,
  cache: { gimnasios: [], maquinas: [], series: [], sesiones: [], rutinas: [],
           alimentos: [], comidas: [], objetivos: [], pesos: [], platos: [],
           vinculos: [], momentos: [], metas: [], calendario: [], perfil: null },
  urlsBlob: new Set(),
};

const $ = (sel, raiz = document) => raiz.querySelector(sel);
const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];

function esc(t) {
  return String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/**
 * Para buscar sin que las tildes estorben: «platano» encuentra «plátano».
 *
 * Vive en `nutricion.js` y aquí solo se le pone un nombre corto. Regla de
 * paridad: cuando JARVIS busque alimentos por voz tiene que normalizar IGUAL
 * que la pantalla, o encontrará cosas distintas para la misma frase.
 */
const quitarTildes = N.normalizar;

function aviso(texto, ms = 2100) {
  $$('.aviso').forEach((a) => a.remove());
  const d = document.createElement('div');
  d.className = 'aviso';
  d.setAttribute('role', 'status');
  d.setAttribute('aria-live', 'polite');
  d.textContent = texto;
  document.body.appendChild(d);
  setTimeout(() => d.remove(), ms);
}

function hoyISO() {
  return new Date().toISOString();
}

/* --------------------------------------------------------------- recargar */
async function recargar() {
  const [gimnasios, maquinas, series, sesiones, rutinas, alimentos, comidas, objetivos,
         pesos, platos, vinculos, momentos, metas, calendario, perfiles, vestuarios] =
    await Promise.all([
      db.todos('gimnasios'),
      db.todos('maquinas'),
      db.todos('series'),
      db.todos('sesiones'),
      db.todos('rutinas'),
      db.todos('alimentos'),
      db.todos('comidas'),
      db.todos('objetivos'),
      db.todos('pesos'),
      db.todos('platos'),
      db.todos('vinculos'),
      db.todos('momentos'),
      db.todos('metas'),
      db.todos('calendario'),
      db.todos('perfil'),
      db.todos('vestuario'),
    ]);
  // Las rutinas mandan en el orden en que se rotan: se ordenan SIEMPRE por
  // `orden` (ver plan.js). Las de una base vieja, sin él, van al final.
  S.cache = { gimnasios, maquinas, series, sesiones, rutinas: P.ordenar(rutinas),
              alimentos, comidas, objetivos, pesos, platos, vinculos, momentos,
              metas, calendario,
              // Una sola fila, con id fijo. Si la base viene de una versión
              // anterior no hay ninguna: se crea la primera vez que se guarda.
              perfil: perfiles[0] || null,
              // Igual que el perfil: una sola fila. Si no existe, el vestuario
              // se estrena la primera vez que se abre (y ahí queda escrito
              // desde cuándo cuentan las cajas).
              vestuario: vestuarios[0] || null };
  if (!S.gimnasioId || !gimnasios.some((g) => g.id === S.gimnasioId)) {
    S.gimnasioId = (await db.ajuste('ultimo_gym')) || (gimnasios[0] && gimnasios[0].id) || null;
    if (S.gimnasioId && !gimnasios.some((g) => g.id === S.gimnasioId)) S.gimnasioId = gimnasios[0] ? gimnasios[0].id : null;
  }
}

const mapa = (arr) => new Map(arr.map((x) => [x.id, x]));

function seriesDe(maquinaId) {
  return S.cache.series.filter((s) => s.maquinaId === maquinaId);
}

function seriesPorMaquina() {
  const m = new Map();
  for (const s of S.cache.series) {
    if (!m.has(s.maquinaId)) m.set(s.maquinaId, []);
    m.get(s.maquinaId).push(s);
  }
  return m;
}

/* -------------------------------------------------------------- sesiones */
/**
 * Devuelve (creándola si hace falta) la sesión de HOY en este gimnasio.
 * Existe para poder marcar "esta semana estaba reventado" sobre un día entero
 * en vez de serie a serie.
 */
async function sesionDeHoy(gimnasioId) {
  const dia = new Date().toISOString().slice(0, 10);
  let ses = S.cache.sesiones.find((x) => x.gimnasioId === gimnasioId && x.fecha.slice(0, 10) === dia);
  if (!ses) {
    ses = await db.guardar('sesiones', { gimnasioId, fecha: hoyISO(), rutina: '', energia: 3, excluir: 0, nota: '' });
    S.cache.sesiones.push(ses);
  }
  return ses;
}

/* ========================================================================== *
 * FOTOS — se comprimen antes de guardarlas: una foto de móvil son 4 MB y en
 * una ficha de máquina con 300 px de ancho no se nota la diferencia.
 * ========================================================================== */
function comprimir(archivo, maxLado = 900, calidad = 0.75, tipo = 'image/jpeg') {
  return new Promise((res, rej) => {
    const img = new Image();
    const url = URL.createObjectURL(archivo);
    img.onload = () => {
      const escala = Math.min(1, maxLado / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * escala);
      c.height = Math.round(img.height * escala);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      // El TIPO es un parámetro desde el 1-sep-2026: las fotos de rutina van en
      // WebP, que a igualdad de vista pesa la mitad que JPEG — y con 1 GB para
      // todo el mundo, la mitad es la diferencia entre 3.400 fotos y 6.800.
      // Si el navegador no supiera WebP, `toBlob` cae solo a PNG y sigue
      // funcionando; por eso no hace falta comprobarlo.
      c.toBlob((b) => (b ? res(b) : rej(new Error('no pude comprimir'))), tipo, calidad);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      rej(new Error('imagen no válida'));
    };
    img.src = url;
  });
}

function urlDe(blob) {
  const u = URL.createObjectURL(blob);
  S.urlsBlob.add(u);
  return u;
}

/**
 * Suelta las direcciones de los blob de la pintada ANTERIOR — pero no ahora.
 *
 * (2-sep-2026) Se soltaban en el acto, al empezar cada pintada, y eso CANCELA
 * las imágenes que todavía se estaban cargando: la foto de perfil, que llega
 * de IndexedDB y por tanto siempre va un poco por detrás del HTML. En la
 * consola salía un `ERR_FILE_NOT_FOUND` por cada una, y en pantalla el
 * fantasma de la vista que se va —que sigue ahí durante el empujón— perdía sus
 * fotos y dejaba huecos grises justo mientras se mira.
 *
 * Kilómetro y medio de segundo después ya no hay ni fantasma ni carga en
 * curso, y soltarlas no le quita nada a nadie.
 */
function limpiarUrls() {
  const viejas = [...S.urlsBlob];
  S.urlsBlob.clear();
  setTimeout(() => { for (const u of viejas) URL.revokeObjectURL(u); }, 1500);
}

/* ========================================================================== *
 * HOJA INFERIOR genérica
 * ========================================================================== */
/**
 * Hoja inferior genérica.
 *
 * `opciones.hayTrabajo` es una función que devuelve true cuando cerrar tiraría
 * algo a la basura. Existe por un fallo que Carlos vio y yo no supe reproducir
 * a la primera: «si quieres añadir otra cosa se borran todas» en el creador de
 * platos. La causa es este mismo método — un toque en el FONDO cerraba la hoja
 * y se llevaba por delante los ingredientes, sin preguntar y sin deshacer. En
 * el móvil la hoja no ocupa toda la pantalla, así que la franja de fondo de
 * arriba está justo donde uno apoya el pulgar al estirarse a buscar.
 *
 * Con trabajo dentro: el fondo YA NO cierra (solo el botón, y preguntando).
 */
function hoja(titulo, contenidoHTML, alMontar, opciones = {}) {
  const fondo = document.createElement('div');
  fondo.className = 'hoja-fondo';
  fondo.innerHTML = `
    <div class="hoja" role="dialog" aria-modal="true" aria-label="${esc(titulo)}">
      <div class="hoja-asa"></div>
      <div class="hoja-cabecera">
        <h2 class="hoja-titulo">${esc(titulo)}</h2>
        <button class="boton-plano" data-cerrar>Cerrar</button>
      </div>
      <div class="hoja-cuerpo">${contenidoHTML}</div>
    </div>`;
  const cerrar = () => {
    MOT.motor.desmontar(fondo);
    fondo.remove();
    document.body.style.overflow = '';
  };
  const hayTrabajo = () => {
    try { return !!(opciones.hayTrabajo && opciones.hayTrabajo()); } catch { return false; }
  };
  fondo.addEventListener('click', async (e) => {
    const esFondo = e.target === fondo;
    const esBoton = e.target.hasAttribute('data-cerrar');
    if (!esFondo && !esBoton) return;
    if (!hayTrabajo()) return cerrar();
    // Un toque en el fondo con trabajo dentro NO cierra: se avisa y punto. Que
    // haya que apuntar a un botón de 44 px para tirar diez minutos de trabajo
    // es exactamente la fricción que hace falta aquí.
    if (esFondo) return aviso('Toca «Cerrar» si de verdad quieres salir', 2400);
    if (await preguntar(`${opciones.avisoSalir || 'Vas a perder lo que has metido aquí.'}\n\n¿Salir igualmente?`)) cerrar();
  });
  document.body.appendChild(fondo);
  document.body.style.overflow = 'hidden';
  if (alMontar) alMontar($('.hoja-cuerpo', fondo), cerrar);
  // Una hoja puede traer piezas del vestuario dentro (la ficha de una pieza, un
  // lote). Se montan aquí, después de `alMontar`, que es quien puede haber
  // cambiado el contenido.
  MOT.motor.montar(fondo, COS.pintorDe);
  return cerrar;
}

/* ========================================================================== *
 * PREGUNTAR — la pregunta de sí o no, DENTRO de la app
 *
 * Carlos, 3-sep-2026: *«cuando inicio sesión me sale un menú superralo de
 * Android, feo, y me pone: hay mil no sé cuántos datos, ¿quieres traerlo hasta
 * aquí? No me gusta nada que salga eso»*.
 *
 * Era `confirm()`. Dentro de un WebView eso lo pinta ANDROID, no la app: otra
 * letra, otros colores, y de título el origen desde el que se sirve la app
 * (`appassets.androidplatform.net`). En mitad de entrar en tu cuenta eso no
 * parece tu app: parece un aviso del sistema, y a un aviso del sistema que
 * aparece solo uno le da a cancelar.
 *
 * Y ESO ES LO QUE LE COSTÓ LOS DATOS. Después de reinstalar, ese diálogo era la
 * ÚNICA forma de recuperar la copia; se ofrecía una vez, y la respuesta de la
 * izquierda dejaba el móvil en cero sin decir nada más.
 *
 * Se usa igual que el de antes, pero con `await`:
 *     if (!await preguntar('¿Borrar esto?\n\nNo se puede deshacer.')) return;
 *
 * La PRIMERA línea es el título y el resto el cuerpo — que es justo como ya
 * estaban escritos los textos, así que no hay que reescribir ninguno.
 */
let _nDialogo = 0;

function preguntar(texto, { si = 'Sí', no = 'No', peligro = false } = {}) {
  const trozos = String(texto).split('\n\n');
  let titulo = trozos.shift();
  // Y si el texto venía de una sola línea («¿Borrar X? Las series no se
  // tocan.»), el título es la pregunta y lo de detrás es el cuerpo. Un título
  // de tres renglones no es un título.
  const corte = titulo.indexOf('? ');
  if (!trozos.length && corte > 0) {
    trozos.push(titulo.slice(corte + 2));
    titulo = titulo.slice(0, corte + 1);
  }
  const cuerpo = trozos.filter((t) => t.trim());
  const n = ++_nDialogo;
  return new Promise((responder) => {
    // A dónde vuelve el foco al cerrar. Sin esto, quien navega con teclado o
    // con TalkBack se queda al principio de la página después de contestar.
    const antes = document.activeElement;
    const desbordeAntes = document.body.style.overflow;
    const fondo = document.createElement('div');
    fondo.className = 'hoja-fondo fondo-centro';
    fondo.innerHTML = `
      <div class="dialogo" role="alertdialog" aria-modal="true"
           aria-labelledby="dlg-t${n}"${cuerpo.length ? ` aria-describedby="dlg-c${n}"` : ''}>
        <h2 class="dialogo-titulo" id="dlg-t${n}">${esc(titulo)}</h2>
        ${cuerpo.length ? `<div class="dialogo-cuerpo" id="dlg-c${n}">${
          cuerpo.map((t) => `<p>${esc(t).replace(/\n/g, '<br>')}</p>`).join('')}</div>` : ''}
        <div class="botonera">
          <button type="button" class="boton boton-2" data-di="no">${esc(no)}</button>
          <button type="button" class="boton${peligro ? ' boton-peligro' : ''}"
                  data-di="si">${esc(si)}</button>
        </div>
      </div>`;

    let contestado = false;
    const cerrar = (r) => {
      if (contestado) return;
      contestado = true;
      document.removeEventListener('keydown', teclas, true);
      fondo.remove();
      document.body.style.overflow = desbordeAntes;
      if (antes && antes.focus) { try { antes.focus(); } catch (_) { /* ya no está */ } }
      responder(r);
    };
    // Escapar y tocar fuera son NO. Nunca un sí: lo que se pregunta aquí suele
    // borrar algo, y un toque perdido no puede ser una respuesta afirmativa.
    function teclas(e) {
      if (e.key === 'Escape') { e.preventDefault(); cerrar(false); return; }
      if (e.key !== 'Tab') return;
      // El foco no se sale del diálogo: es lo que lo hace modal de verdad.
      const focos = [...fondo.querySelectorAll('button')];
      if (!focos.length) return;
      const i = focos.indexOf(document.activeElement);
      e.preventDefault();
      const paso = e.shiftKey ? -1 : 1;
      focos[(i + paso + focos.length) % focos.length].focus();
    }
    fondo.addEventListener('click', (e) => {
      const b = e.target.closest('[data-di]');
      if (b) return cerrar(b.dataset.di === 'si');
      if (e.target === fondo) cerrar(false);
    });
    document.addEventListener('keydown', teclas, true);
    document.body.appendChild(fondo);
    document.body.style.overflow = 'hidden';
    // Lo que borra empieza con el foco en la salida; lo demás, en la respuesta
    // que la pregunta espera.
    $(peligro ? '[data-di="no"]' : '[data-di="si"]', fondo).focus();
  });
}

/**
 * Cierra TODAS las hojas abiertas, sin preguntar.
 *
 * Lo usa cerrar sesión: al salir, cualquier hoja que quedara detrás sería la de
 * la persona que se acaba de ir, encima de la pantalla de entrada. Aquí no se
 * respeta `hayTrabajo` a propósito — ya se preguntó una vez, y volver a
 * preguntar por cada hoja abierta convierte «salir» en un interrogatorio.
 */
function cerrarHojas() {
  $$('.hoja-fondo').forEach((h) => h.remove());
  document.body.style.overflow = '';
}

/* ========================================================================== *
 * PLANIFICADOR DE ENTRENOS  (v0.8.0)
 * ========================================================================== *
 * Carlos, 31-jul-2026: *«añade un planificador de entrenos, así si tienes un
 * día llamado pecho, ya te saldrán las máquinas de ese día (…) También añade
 * que te indique lo que debes hacer que te hayas apuntado (ej 3x12, 2x8)»*.
 * Y eligió **rotación por rutina, con series objetivo y registro serie a
 * serie**.
 *
 * DÓNDE VIVE EL PLAN: dentro de la propia rutina (`rutinas.plan`), que ya
 * existía y ya se sincroniza. Un almacén nuevo habría obligado a tocar la
 * sincronización, y lo que se guarda es exactamente «las máquinas de este día
 * y qué toca hacer en cada una»: es la rutina, no otra cosa.
 *
 * LA ROTACIÓN NO SE ADIVINA, SE MIRA: qué día toca sale de la ÚLTIMA sesión
 * que tenga rutina apuntada, y se pasa a la siguiente de la lista. Nada de
 * calendario ni de «los lunes toca pecho»: si se salta el martes, el martes
 * sigue tocando lo mismo. Y en cuanto Carlos elige otro día a mano, ese queda
 * escrito en la sesión y la rotación continúa desde ahí.
 */
const PLAN_POR_DEFECTO = P.POR_DEFECTO;

/**
 * Cuántas series y repeticiones proponer al meter una máquina en un día.
 *
 * Manda lo que tenga escrito la propia rutina (lo pone la bienvenida al
 * crearla); si no, lo que sale del ESTUDIO con las respuestas guardadas; y si
 * tampoco, el 3×12 de siempre. Tres escalones, del más concreto al más general.
 *
 * Antes esto llamaba a `BV.experienciaDe`, que dejó de existir con el rediseño
 * de la bienvenida (0.17.0): la experiencia sola ya no decide nada, porque el
 * volumen depende también del objetivo, de los días y del tiempo por sesión.
 * Se quedó un `TypeError` en la consola cada vez que se metía una máquina en un
 * día sin que se notara en la pantalla. Lo cazó `pc/test_perfil_real.py`, que
 * mira la consola: por eso ese test comprueba que no haya NI UN error.
 */
async function seriesRepsPorDefecto(rutina) {
  if (rutina && rutina.seriesPorDefecto && rutina.repsPorDefecto) {
    return { series: rutina.seriesPorDefecto, reps: rutina.repsPorDefecto };
  }
  try {
    const e = await BV.estudioGuardado();
    // El estudio da series POR SEMANA de cada músculo; aquí hace falta por
    // sesión. La misma cuenta que usa la bienvenida al crear las rutinas.
    return {
      series: Math.max(2, Math.round(e.seriesPorGrupo / 2)),
      reps: e.reps.tipico,
    };
  } catch {
    return { series: PLAN_POR_DEFECTO.series, reps: PLAN_POR_DEFECTO.reps };
  }
}

/** El plan de la rutina, con las máquinas del gimnasio en el que está. */
function planDe(rutina, gimnasioId = S.gimnasioId) {
  return P.planDe(rutina, S.cache.maquinas.filter((m) => m.gimnasioId === gimnasioId));
}

/** La sesión de hoy en este gimnasio, si existe (sin crearla). */
function sesionHoy(gimnasioId = S.gimnasioId) {
  const d = P.dia(new Date().toISOString());
  return S.cache.sesiones.find((x) => x.gimnasioId === gimnasioId && P.dia(x.fecha) === d) || null;
}

function rutinaDeHoy() {
  // LO QUE DIGA EL CALENDARIO MANDA. La rotación automática sigue existiendo
  // para quien no quiere planificar nada, pero si Carlos ha puesto que hoy toca
  // Pull, hoy toca Pull —y si ha puesto descanso, hoy no toca nada—. Una app
  // que te propone entrenar el día que dijiste que descansabas no está
  // ayudando, está estorbando.
  const hoy = CAL.iso(new Date());
  const puesto = CAL.delDia(hoy, { calendario: S.cache.calendario, sesiones: [] });
  if (puesto.fuente === 'calendario') {
    if (puesto.rutinaId === CAL.DESCANSO) return { rutina: null, elegida: true, descanso: true };
    const r = S.cache.rutinas.find((x) => x.id === puesto.rutinaId);
    if (r) return { rutina: r, elegida: true, delCalendario: true };
  }
  // Solo las sesiones DE ESTE GIMNASIO: entrenar en Reus no debe mover la
  // rotación de Barcelona.
  const suyas = S.cache.sesiones.filter((s) => s.gimnasioId === S.gimnasioId);
  return P.rutinaDeHoy(S.cache.rutinas, suyas, new Date().toISOString());
}

function seriesHoyDe(maquinaId) {
  return P.seriesHoyDe(S.cache.series, maquinaId, new Date().toISOString());
}

async function fijarRutinaDeHoy(rutinaId) {
  const ses = await sesionDeHoy(S.gimnasioId);
  ses.rutina = rutinaId;
  await db.guardar('sesiones', ses);
  await recargar();
  sync.sincronizar({ silencioso: true });
}

/** Pinta la tarjeta «lo que toca hoy» encima de la lista de máquinas. */
function pintarPlanDeHoy(zona) {
  const { rutina, elegida, descanso } = rutinaDeHoy();
  if (descanso) {
    // Hoy toca descansar y lo dijiste tú. Se dice, y se deja la puerta abierta
    // por si al final te apetece: prohibir no es el trabajo de la app.
    zona.innerHTML = `
      <div class="plan plan-descanso">
        <div class="plan-etiqueta">Hoy en tu calendario</div>
        <div class="plan-dia">Descanso</div>
        <p class="plan-progreso" style="margin:6px 0 14px">Lo pusiste tú. Si al final entrenas, apunta lo que quieras: cuenta igual.</p>
        <button class="boton boton-2" id="ver-calendario">Ver el calendario</button>
      </div>`;
    const b = $('#ver-calendario', zona);
    if (b) b.onclick = () => irA('plan');
    return;
  }
  if (!rutina) {
    zona.innerHTML = '';
    return;
  }
  const plan = planDe(rutina);
  const porId = mapa(S.cache.maquinas);

  const filas = plan.map((p) => {
    const m = porId.get(p.maquinaId);
    const hechas = seriesHoyDe(p.maquinaId);
    const ult = D.ultimaSerie(seriesDe(p.maquinaId).filter((s) => !hechas.includes(s)));
    const unidad = (m && m.unidad) || 'kg';
    const completo = hechas.length >= p.series;
    // Los puntos son la lectura de un vistazo, pero el texto «2 de 3» va
    // SIEMPRE al lado: si la información dependiera solo de unos círculos, con
    // el móvil al sol o de reojo no se entendería nada.
    const puntos = Array.from({ length: p.series }, (_, i) =>
      `<i class="ps-punto ${i < hechas.length ? 'ps-hecha' : ''}"></i>`).join('');
    return `
      <div class="plan-fila ${completo ? 'plan-hecha' : ''}">
        <button class="plan-cuerpo" data-plan-ficha="${p.maquinaId}">
          <div class="plan-nombre">${esc(m ? m.nombre : '—')}${completo ? ' <span class="badge badge-hecho">hecho</span>' : ''}</div>
          <div class="plan-detalle">
            <span class="plan-objetivo">${p.series}×${p.reps}</span>
            <span class="plan-puntos">${puntos}</span>
            <span class="plan-cuenta">${hechas.length} de ${p.series}</span>
            ${ult ? `<span class="plan-ultimo">último ${esc(D.formatearPeso(ult.peso, unidad))}</span>` : '<span class="plan-ultimo">sin registros</span>'}
          </div>
        </button>
        <button class="boton-anadir" data-plan-registrar="${p.maquinaId}" aria-label="Apuntar serie en ${esc(m ? m.nombre : '')}">+</button>
      </div>`;
  }).join('');

  const { hechas, total } = P.progresoDelDia(plan, S.cache.series, new Date().toISOString());

  zona.innerHTML = `
    <div class="ficha plan">
      <div class="plan-cabeza">
        <div>
          <div class="plan-etiqueta">${elegida ? 'Hoy entrenas' : 'Hoy te toca'}</div>
          <div class="plan-dia">${esc(rutina.nombre)}</div>
        </div>
        <button class="boton-plano" id="plan-cambiar">Cambiar</button>
      </div>
      <div class="plan-barra"><i style="width:${total ? Math.round((hechas / total) * 100) : 0}%"></i></div>
      <div class="plan-progreso">${hechas} de ${total} series${hechas >= total && total ? ' · día completo' : ''}</div>
      ${plan.length ? filas : `<p class="grafica-vacia">Este día todavía no tiene máquinas.
        Dale a «Editar el día» y añádelas.</p>`}
      <div class="botonera" style="margin-top:10px">
        <button class="boton boton-2" id="plan-editar">Editar el día</button>
      </div>
    </div>`;

  $('#plan-cambiar', zona).onclick = () => abrirElegirDia();
  $('#plan-editar', zona).onclick = () => abrirEditorPlan(rutina.id);
  $$('[data-plan-registrar]', zona).forEach((b) => (b.onclick = () => {
    const p = plan.find((x) => x.maquinaId === b.dataset.planRegistrar);
    abrirRegistro(b.dataset.planRegistrar, p);
  }));
  $$('[data-plan-ficha]', zona).forEach((b) => (b.onclick = () => abrirFicha(b.dataset.planFicha)));
}

/** Elegir qué día se entrena hoy (y crear/renombrar/borrar días). */
function abrirElegirDia() {
  const { rutina } = rutinaDeHoy();
  hoja(
    'Qué entrenas hoy',
    `<div class="lista" id="dias"></div>
     <div class="botonera"><button class="boton boton-2" id="nuevo-dia">+ Crear un día</button></div>
     <p class="nut-media">El orden de esta lista es el de la rotación: al acabar
       uno, mañana te propondré el siguiente.</p>`,
    (cuerpo, cerrar) => {
      const lista = $('#dias', cuerpo);
      lista.innerHTML = S.cache.rutinas.map((r) => `
        <div class="dia-fila">
          <button class="dia-elegir ${rutina && r.id === rutina.id ? 'dia-actual' : ''}" data-dia="${r.id}">
            <span class="dia-nombre">${esc(r.nombre)}</span>
            <span class="dia-cuantas">${planDe(r).length} ${planDe(r).length === 1 ? 'ejercicio' : 'ejercicios'}</span>
          </button>
          <button class="boton-plano" data-compartir-dia="${r.id}" aria-label="Compartir ${esc(r.nombre)}">${icono('enviar', 18)}</button>
          <button class="boton-plano" data-publicar-dia="${r.id}" aria-label="Publicar ${esc(r.nombre)} para todos">${icono('nube', 18)}</button>
          <button class="boton-plano" data-renombrar="${r.id}" aria-label="Renombrar ${esc(r.nombre)}">${icono('lapiz', 18)}</button>
          <button class="boton-plano" data-borrar-dia="${r.id}" aria-label="Borrar ${esc(r.nombre)}">${icono('papelera', 18)}</button>
        </div>`).join('');

      $$('[data-dia]', cuerpo).forEach((b) => (b.onclick = async () => {
        await fijarRutinaDeHoy(b.dataset.dia);
        cerrar();
        pintar();
      }));
      $$('[data-compartir-dia]', cuerpo).forEach((b) => (b.onclick = () => {
        cerrar();
        compartirRutina(b.dataset.compartirDia);
      }));
      $$('[data-publicar-dia]', cuerpo).forEach((b) => (b.onclick = () => {
        cerrar();
        publicarRutina(b.dataset.publicarDia);
      }));
      $$('[data-renombrar]', cuerpo).forEach((b) => (b.onclick = async () => {
        const r = S.cache.rutinas.find((x) => x.id === b.dataset.renombrar);
        const nombre = prompt('Nombre del día', r.nombre);
        if (!nombre || !nombre.trim()) return;
        await db.guardar('rutinas', { ...r, nombre: nombre.trim() });
        await recargar();
        cerrar();
        pintar();
      }));
      $$('[data-borrar-dia]', cuerpo).forEach((b) => (b.onclick = async () => {
        const r = S.cache.rutinas.find((x) => x.id === b.dataset.borrarDia);
        if (!await preguntar(`¿Borrar el día «${r.nombre}»? Las series apuntadas NO se tocan.`)) return;
        await db.borrar('rutinas', r.id);
        await recargar();
        cerrar();
        pintar();
      }));
      $('#nuevo-dia', cuerpo).onclick = async () => {
        const nombre = prompt('Nombre del día nuevo (Pecho, Espalda, Pierna…)');
        if (!nombre || !nombre.trim()) return;
        const r = await db.guardar('rutinas', { nombre: nombre.trim(), grupos: [], maquinas: [], plan: [] });
        await recargar();
        await fijarRutinaDeHoy(r.id);
        cerrar();
        pintar();
        abrirEditorPlan(r.id);
      };
    }
  );
}

/**
 * Editor del día: qué máquinas y qué toca hacer en cada una.
 *
 * El estado se lleva en memoria y se guarda al pulsar «Guardar». Con guardado
 * automático por cada toque, subir una fila de orden dispararía cuatro
 * escrituras y cuatro sincronizaciones.
 */
/* --------------------------------------------------------------------------
 * LAS NOTAS DE UN EJERCICIO  (1-sep-2026)
 *
 * Carlos: *«que si alguien se la descarga (…) se puedan ver las notas de la
 * persona (tú también deberías poder añadir tus notas aunque no fuese tu rutina
 * una vez te la descargas) y los vídeos o fotos que me haya añadido»*.
 *
 * SON DOS VOCES Y NO SE MEZCLAN.
 *   · `nota`    — la escribió quien hizo la rutina. Se LEE, no se toca. Si la
 *                 pudieras editar, mañana le estarías atribuyendo a otro algo
 *                 que has escrito tú.
 *   · `notaMia` — la tuya. Se escribe encima de la suya, no en su lugar, y no
 *                 sale de este móvil ni cuando compartes la rutina.
 *
 * El vídeo es un ENLACE, no un vídeo alojado. La cuenta está en
 * supabase/schema-6-notas-fotos.sql: alojarlo en el plan gratis agota la cuota
 * de salida de TODA la app en 640 reproducciones.
 * ------------------------------------------------------------------------ */
function notasDeEjercicio(p, i, propia = false) {
  return `
    <div class="ed-notas ${p.notaMia ? 'abierta' : ''}">
      ${p.foto ? `<img class="ed-foto" src="${esc(p.foto)}" alt="" loading="lazy">` : ''}
      ${p.nota ? `<p class="ed-nota-suya">${icono('comentario', 15)} ${esc(p.nota)}</p>` : ''}
      ${p.video
        ? `<a class="ed-video" href="${esc(p.video)}" target="_blank" rel="noopener">
             ${icono('video', 15)} Ver el vídeo que dejó</a>` : ''}
      <textarea class="ed-nota-mia" rows="2" maxlength="300" data-nota-mia="${i}"
                placeholder="Tu nota: el agujero del asiento, cómo te sale…"
                aria-label="Tu nota para este ejercicio">${esc(p.notaMia || '')}</textarea>
      <div class="ed-nota-botones">
        <button type="button" class="boton-plano ed-nota-abre" data-abre-nota="${i}">
          ${icono('lapiz', 15)} ${p.notaMia ? 'Tu nota' : 'Añadir tu nota'}</button>
        ${propia ? `
          <button type="button" class="boton-plano" data-nota-autor="${i}">
            ${icono('comentario', 15)} ${p.nota ? 'Cambiar la explicación' : 'Explicarlo'}</button>
          <button type="button" class="boton-plano" data-foto="${i}">
            ${icono('camara', 15)} ${p.foto ? 'Cambiar la foto' : 'Foto'}</button>
          <button type="button" class="boton-plano" data-video="${i}">
            ${icono('video', 15)} ${p.video ? 'Cambiar el vídeo' : 'Vídeo'}</button>` : ''}
      </div>
    </div>`;
}

function abrirEditorPlan(rutinaId) {
  const rutina = S.cache.rutinas.find((r) => r.id === rutinaId);
  if (!rutina) return;
  let plan = planDe(rutina).map((p) => ({ ...p }));
  // Las series y reps que salieron de «¿cuánto llevas entrenando?» en la
  // bienvenida. Se leen UNA vez, al abrir: si no se usaran, esa pregunta no
  // habría servido para nada, que es peor que no haberla hecho. Empieza con el
  // 3×12 de siempre y se afina en cuanto conteste la base — para cuando alguien
  // pulse «añadir» ya está, y si no, el valor de partida es el correcto.
  let porDefecto = { ...PLAN_POR_DEFECTO };
  seriesRepsPorDefecto(rutina).then((v) => { porDefecto = v; });
  // Solo se pregunta al salir si de verdad se ha tocado algo. Preguntar siempre
  // enseña a decir «sí» sin leer, y entonces el aviso deja de proteger nada.
  let tocado = false;
  // `let` y no `const` a propósito: desde el propio editor se pueden crear
  // máquinas nuevas del catálogo, y entonces este índice se queda viejo y las
  // filas recién añadidas se pintarían como «—».
  let porId = mapa(S.cache.maquinas);

  hoja(
    `Editar ${rutina.nombre}`,
    `<div id="plan-lista"></div>
     <div class="botonera"><button class="boton boton-2" id="plan-anadir">+ Añadir máquinas</button></div>
     <button class="boton" id="plan-guardar">Guardar el día</button>`,
    (cuerpo, cerrar) => {
      const lista = $('#plan-lista', cuerpo);

      // UNA RUTINA TRAÍDA DE OTRO NO SE REESCRIBE POR DENTRO. Puedes cambiarle
      // las series, las reps y ponerle TUS notas, pero la explicación, la foto
      // y el vídeo son de quien la hizo: si los pudieras editar, mañana le
      // estarías atribuyendo a otro algo que has escrito tú.
      const esMia = !rutina.autorNota;

      const pintarLista = () => {
        if (!plan.length) {
          lista.innerHTML = '<p class="grafica-vacia">Sin máquinas todavía.</p>';
          return;
        }
        lista.innerHTML = plan.map((p, i) => {
          const m = porId.get(p.maquinaId);
          return `
            <div class="ed-fila">
              <div class="ed-orden">
                <button class="boton-plano" data-sube="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Subir">${icono('arriba', 18)}</button>
                <button class="boton-plano" data-baja="${i}" ${i === plan.length - 1 ? 'disabled' : ''} aria-label="Bajar">${icono('abajo', 18)}</button>
              </div>
              <div class="ed-cuerpo">
                <div class="ed-nombre">${esc(m ? m.nombre : '—')}</div>
                <div class="ed-objetivo">
                  <input type="number" inputmode="numeric" min="1" max="20" value="${p.series}" data-series="${i}" aria-label="Series">
                  <span>×</span>
                  <input type="number" inputmode="numeric" min="1" max="100" value="${p.reps}" data-reps="${i}" aria-label="Repeticiones">
                  <span class="ed-pista">series × reps</span>
                </div>
                ${notasDeEjercicio(p, i, esMia)}
              </div>
              <button class="boton-plano" data-quita="${i}" aria-label="Quitar">${icono('cerrar', 18)}</button>
            </div>`;
        }).join('');

        // Las notas: la del autor se lee, la tuya se escribe.
        $$('[data-nota-mia]', lista).forEach((c) => (c.oninput = () => {
          plan[Number(c.dataset.notaMia)].notaMia = c.value.slice(0, 300);
          tocado = true;
        }));
        $$('[data-abre-nota]', lista).forEach((b) => (b.onclick = () => {
          const caja = $(`[data-nota-mia="${b.dataset.abreNota}"]`, lista);
          if (!caja) return;
          caja.closest('.ed-notas').classList.add('abierta');
          caja.focus();
        }));

        // Y lo del autor, solo si la rutina es tuya.
        $$('[data-nota-autor]', lista).forEach((b) => (b.onclick = async () => {
          const i = Number(b.dataset.notaAutor);
          const texto = prompt('¿Qué hay que saber de este ejercicio?\n\n'
            + 'Esto lo lee quien se lleve tu rutina.', plan[i].nota || '');
          if (texto === null) return;
          plan[i].nota = texto.trim().slice(0, 300);
          if (!plan[i].nota) delete plan[i].nota;
          tocado = true;
          pintarLista();
        }));

        $$('[data-video]', lista).forEach((b) => (b.onclick = () => {
          const i = Number(b.dataset.video);
          const url = prompt('Pega el enlace del vídeo (YouTube, Instagram o TikTok).\n\n'
            + 'Un enlace y no el vídeo: alojar vídeo se comería la cuota de la app entera.',
            plan[i].video || '');
          if (url === null) return;
          const limpio = comp.enlaceDeVideo(url);
          if (url.trim() && !limpio) {
            return aviso('Ese enlace no vale. Tiene que ser https de YouTube, Instagram o TikTok', 3600);
          }
          if (limpio) plan[i].video = limpio; else delete plan[i].video;
          tocado = true;
          pintarLista();
        }));

        $$('[data-foto]', lista).forEach((b) => (b.onclick = async () => {
          const i = Number(b.dataset.foto);
          if (!nube.usuario()) {
            return aviso('Para que la foto la vea quien se lleve tu rutina hace falta cuenta', 3600);
          }
          const archivo = await pedirFoto({ camara: true });
          if (!archivo) return;
          // 1080 px y WebP: son ~150 KB. Ver la cuenta en
          // supabase/schema-6-notas-fotos.sql — el cajón acepta 1 MB, y un
          // límite generoso «por si acaso» es lo que hace que un día alguien
          // suba cuarenta fotos de 2 MB y se acabe el gigabyte de todos.
          const blob = await comprimir(archivo, 1080, 0.8, 'image/webp');
          aviso('Subiendo la foto…', 2000);
          const r = await nube.subirFotoRutina(blob);
          if (!r.ok) return aviso(r.motivo, 3600);
          plan[i].foto = r.url;
          tocado = true;
          pintarLista();
        }));

        $$('[data-sube]', lista).forEach((b) => (b.onclick = () => {
          const i = Number(b.dataset.sube);
          [plan[i - 1], plan[i]] = [plan[i], plan[i - 1]];
          tocado = true;
          pintarLista();
        }));
        $$('[data-baja]', lista).forEach((b) => (b.onclick = () => {
          const i = Number(b.dataset.baja);
          [plan[i + 1], plan[i]] = [plan[i], plan[i + 1]];
          tocado = true;
          pintarLista();
        }));
        $$('[data-quita]', lista).forEach((b) => (b.onclick = () => {
          plan.splice(Number(b.dataset.quita), 1);
          tocado = true;
          pintarLista();
        }));
        // `onchange` y no `oninput`: repintar en cada tecla robaría el foco a
        // mitad de escribir «12» y dejaría un «1». Ya nos pasó en los platos.
        $$('[data-series]', lista).forEach((i) => (i.onchange = () => {
          plan[Number(i.dataset.series)].series = Math.max(1, Number(i.value) || 1);
          tocado = true;
        }));
        $$('[data-reps]', lista).forEach((i) => (i.onchange = () => {
          plan[Number(i.dataset.reps)].reps = Math.max(1, Number(i.value) || 1);
          tocado = true;
        }));
      };
      pintarLista();

      $('#plan-anadir', cuerpo).onclick = () => {
        abrirAnadirAlDia({
          yaEnElDia: plan.map((p) => p.maquinaId),
          alElegir: async (ids) => {
            // `porDefecto` se lee al abrir el editor, no aquí. Ponerle un
            // `await` a esta función dejaba un hueco entre cerrar la hoja de
            // elegir y repintar la lista, y en ese hueco la lista todavía
            // enseñaba lo de antes. Lo cazó `test_perfil_real.py` («se añaden
            // LAS TRES de una vez: 1 -> 1»).
            for (const id of ids) plan.push({ maquinaId: id, ...porDefecto });
            tocado = true;
            // El índice se rehace porque `alElegir` puede traer máquinas que
            // acaban de nacer en el catálogo y que no estaban en la caché
            // cuando se abrió este editor.
            porId = mapa(S.cache.maquinas);
            pintarLista();
          },
        });
      };

      $('#plan-guardar', cuerpo).onclick = async () => {
        // Se guardan también `maquinas`, que es lo que usa el filtro de chips
        // de la pantalla de entrenar: si solo se guardara `plan`, el chip del
        // día seguiría enseñando las máquinas viejas y serían dos verdades
        // distintas para la misma pregunta.
        await db.guardar('rutinas', {
          ...rutina,
          plan,
          maquinas: plan.map((p) => p.maquinaId),
          grupos: [],
        });
        await recargar();
        sync.sincronizar({ silencioso: true });
        cerrar();
        aviso(`${rutina.nombre}: ${plan.length} ejercicios guardados`);
        pintar();
      };
    },
    { hayTrabajo: () => tocado, avisoSalir: 'Vas a perder los cambios del día.' }
  );
}

/* ========================================================================== *
 * VISTA: ENTRENAR — la pantalla donde se vive
 * ========================================================================== */
function maquinasVisibles() {
  const spm = seriesPorMaquina();
  let lista = S.cache.maquinas.filter((m) => m.gimnasioId === S.gimnasioId);

  if (S.filtro.startsWith('rutina:')) {
    const r = S.cache.rutinas.find((x) => x.id === S.filtro.slice(7));
    if (r) {
      const permitidos = new Set(r.maquinas || []);
      const grupos = new Set(r.grupos || []);
      lista = lista.filter((m) => permitidos.has(m.id) || grupos.has(m.grupo));
    }
  } else if (S.filtro !== 'todo') {
    lista = lista.filter((m) => m.grupo === S.filtro);
  }

  if (S.busqueda.trim()) {
    const q = S.busqueda.trim().toLowerCase();
    lista = lista.filter((m) => m.nombre.toLowerCase().includes(q));
  }

  // Orden: lo más reciente arriba. Lo que usa hoy es lo que quiere tocar.
  return lista.sort((a, b) => {
    const ua = D.ultimaSerie(spm.get(a.id) || []);
    const ub = D.ultimaSerie(spm.get(b.id) || []);
    if (!ua && !ub) return a.nombre.localeCompare(b.nombre);
    if (!ua) return 1;
    if (!ub) return -1;
    return ub.fecha.localeCompare(ua.fecha);
  });
}

function pintarEntrenar(raiz) {
  const gim = S.cache.gimnasios.find((g) => g.id === S.gimnasioId);
  if (!S.cache.gimnasios.length) {
    raiz.innerHTML = `<div class="vacio"><span class="vacio-icono">${icono('pesa', 34)}</span>
      <p>Todavía no hay gimnasios.<br>Añade el primero para empezar.</p>
      <button class="boton" id="ir-gimnasios">Añadir gimnasio</button></div>`;
    $('#ir-gimnasios', raiz).onclick = () => irA('gimnasios');
    return;
  }

  const gruposUsados = [...new Set(S.cache.maquinas.filter((m) => m.gimnasioId === S.gimnasioId).map((m) => m.grupo))];
  const chips = [
    `<button class="chip" data-filtro="todo" aria-pressed="${S.filtro === 'todo'}">Todo</button>`,
    ...S.cache.rutinas.map(
      (r) => `<button class="chip" data-filtro="rutina:${r.id}" aria-pressed="${S.filtro === `rutina:${r.id}`}">${esc(r.nombre)}</button>`
    ),
    ...D.GRUPOS.filter((g) => gruposUsados.includes(g.id)).map(
      (g) => `<button class="chip" data-filtro="${g.id}" aria-pressed="${S.filtro === g.id}">${esc(g.nombre)}</button>`
    ),
  ].join('');

  const lista = maquinasVisibles();
  const spm = seriesPorMaquina();
  const estanc = new Set(D.estancadas(S.cache.maquinas.filter((m) => m.gimnasioId === S.gimnasioId), spm).map((e) => e.maquina.id));

  raiz.innerHTML = `
    <div id="plan-hoy"></div>
    <h2 class="seccion-titulo">Todas las máquinas</h2>
    <div class="chips">${chips}</div>
    <input class="buscador" type="search" placeholder="Buscar máquina…" value="${esc(S.busqueda)}" id="buscador">
    <div class="lista" id="lista-maquinas"></div>
    ${sesionHoyExcluida()
      ? `<p class="chip-explica" style="margin-top:14px">Hoy está marcado como <b>día flojo</b>: no contará en las gráficas.
         <button class="boton-plano" id="marcar-dia">Que sí cuente</button></p>`
      : ''}`;

  // El plan de hoy va ARRIBA del todo: es lo que se mira nada más entrar al
  // gimnasio, y lo de abajo (todas las máquinas) es para lo que no estaba
  // planeado.
  pintarPlanDeHoy($('#plan-hoy', raiz));

  const cont = $('#lista-maquinas', raiz);
  if (!lista.length) {
    // Una pantalla vacía sin salida es un callejón. Siempre lleva qué hacer.
    const filtrando = S.busqueda || S.filtro !== 'todo';
    cont.innerHTML = `<div class="vacio">
      <span class="vacio-icono">${icono(filtrando ? 'lupa' : 'pesa', 34)}</span>
      <p>${
        filtrando
          ? 'Nada con ese filtro.<br>Prueba con una palabra suelta o quita el filtro.'
          : 'Este gimnasio todavía no tiene máquinas.<br>Elígelas del catálogo y en un minuto lo tienes montado.'
      }</p>
      ${filtrando
        ? '<button class="boton boton-2" id="vacio-limpiar">Quitar el filtro</button>'
        : '<button class="boton" id="vacio-catalogo">Elegir del catálogo</button>'}
    </div>`;
    const bLimpiar = $('#vacio-limpiar', cont);
    if (bLimpiar) {
      bLimpiar.onclick = () => {
        S.busqueda = '';
        S.filtro = 'todo';
        pintar();
      };
    }
    const bCat = $('#vacio-catalogo', cont);
    if (bCat) bCat.onclick = abrirCatalogo;
  }

  lista.forEach((m, indice) => {
    const ss = spm.get(m.id) || [];
    const ult = D.ultimaSerie(ss);
    const rec = D.record(ss, m.unidad || 'kg');
    const esRecord = ult && rec && ult.id === rec.id && ss.length > 2;

    // La barra de carga: dónde queda el último peso respecto a tu récord. Es
    // lo único que cuenta si vas subiendo o si te has quedado corto sin tener
    // que abrir la ficha. Sin récord no se dibuja: no hay contra qué comparar.
    const carga = ult && rec && rec.peso > 0 ? Math.max(0, Math.min(1, ult.peso / rec.peso)) : 0;

    const fila = document.createElement('div');
    fila.className = 'maquina';
    fila.style.setProperty('--i', indice);
    fila.innerHTML = `
      <button class="maquina-foto" data-foto="${m.id}" aria-label="Foto de ${esc(m.nombre)}">${
        m.foto ? '' : iconoDe(m)
      }</button>
      <button class="maquina-cuerpo" data-ficha="${m.id}">
        <div class="maquina-nombre">${esc(m.nombre)}</div>
        ${
          ult
            ? `<div class="maquina-ultimo">
                 <span class="maquina-peso">${esc(D.formatearPeso(ult.peso, m.unidad || 'kg'))}</span>
                 <span>× ${esc(ult.reps)}</span>
                 <span class="maquina-cuando">${esc(D.haceCuanto(ult.fecha))}</span>
                 ${esRecord ? '<span class="badge badge-record">récord</span>' : ''}
                 ${estanc.has(m.id) ? '<span class="badge badge-estancada">estancada</span>' : ''}
               </div>`
            : '<div class="maquina-sin">Sin registros todavía</div>'
        }
      </button>
      <button class="boton-anadir" data-registrar="${m.id}" aria-label="Registrar serie en ${esc(m.nombre)}">${icono('mas', 22)}</button>
      ${carga ? `<span class="maquina-carga" style="--carga:${carga.toFixed(3)}"></span>` : ''}`;
    cont.appendChild(fila);

    if (m.foto) {
      const btn = $(`[data-foto="${m.id}"]`, fila);
      const img = document.createElement('img');
      img.className = 'maquina-foto';
      img.alt = m.nombre;
      img.src = urlDe(m.foto);
      img.onclick = () => abrirFicha(m.id);
      btn.replaceWith(img);
    }
  });

  // eventos
  $$('.chip', raiz).forEach((c) => (c.onclick = () => {
    S.filtro = c.dataset.filtro;
    pintar();
  }));
  const buscador = $('#buscador', raiz);
  buscador.oninput = () => {
    S.busqueda = buscador.value;
    const pos = buscador.selectionStart;
    pintarEntrenar(raiz);
    const nuevo = $('#buscador', raiz);
    nuevo.focus();
    nuevo.setSelectionRange(pos, pos);
  };
  $$('[data-registrar]', raiz).forEach((b) => (b.onclick = () => abrirRegistro(b.dataset.registrar)));
  $$('[data-ficha]', raiz).forEach((b) => (b.onclick = () => abrirFicha(b.dataset.ficha)));
  $$('[data-foto]', raiz).forEach((b) => (b.onclick = () => abrirFicha(b.dataset.foto)));
  const bFlojo = $('#marcar-dia', raiz);
  if (bFlojo) bFlojo.onclick = alternarDiaFlojo;
}

/**
 * Imagen de la máquina cuando Carlos todavía no le ha hecho SU foto.
 *
 * Orden: foto propia (la pone quien llama) > foto del catálogo > pictograma.
 * La del catálogo se busca por el NOMBRE de la máquina, que es el que se copió
 * al darla de alta, así que también la heredan las que ya estaban creadas.
 */
function iconoDe(m) {
  const src = cat.rutaFoto(m.nombre);
  if (src) return `<img class="ej-foto" src="${src}" alt="" width="64" height="64" loading="lazy" decoding="async">`;
  if (!m.icono) return icono('camara', 26);
  return `<span class="maquina-pict" style="color:${cat.COLOR_GRUPO[m.grupo] || 'var(--texto-2)'}">${
    cat.pictograma(m.icono)
  }</span>`;
}


/* ========================================================================== *
 * PLAN — el calendario y los objetivos
 *
 * Carlos, 29-ago-2026: *«un calendario (…) para organizar los días y que la
 * gente se pueda montar sus entrenamientos allí y verlo de manera muy clara»* y
 * *«objetivos de pesos, calorías, kg levantados a x repes o simplemente pr»*.
 *
 * Las dos cosas viven juntas porque responden a la misma pregunta —qué voy a
 * hacer— mientras que Entrenar y Progreso responden a qué estoy haciendo y qué
 * he hecho. Las cuentas están en `calendario.js` y `metas.js`; aquí solo se
 * pinta y se guarda.
 * ========================================================================== */

/** El mes que se está mirando. Empieza en el de hoy y se mueve con las flechas. */
let _mesVisible = null;
/** El día del que se está viendo el detalle. Empieza en hoy. */
let _diaElegido = null;

/**
 * Qué tiene un día, con TODO lo que hace falta para contarlo: la rutina, sus
 * máquinas con el objetivo de cada una, y lo que se hizo de verdad.
 *
 * Carlos, 30-ago-2026: *«que en el calendario se vea más información de la
 * rutina que te toca (…) ahora solo se ve el día y eso no sirve de nada»*.
 * Un calendario que solo dice «lunes: Push» te obliga a acordarte de qué es
 * Push, que es justamente lo que la app tenía que quitarte de la cabeza.
 */
function detalleDelDia(fecha) {
  const datos = datosCalendario();
  const d = CAL.mes(fecha, datos).find((x) => x.fecha === fecha)
    || { fecha, dia: Number(fecha.slice(-2)), series: 0 };
  const rutina = S.cache.rutinas.find((r) => r.id === d.rutinaId) || null;
  const plan = rutina ? planDe(rutina) : [];
  const porId = mapa(S.cache.maquinas);
  const ejercicios = plan.map((p) => ({
    ...p,
    nombre: (porId.get(p.maquinaId) || {}).nombre || 'Máquina borrada',
  }));
  // Las series de ESE día en esas máquinas: no vale el total del día, porque
  // media hora de bici no es haber hecho el plan.
  const delDia = S.cache.series.filter((x) => !x.del && P.dia(x.fecha) === fecha);
  const hechasPorMaquina = new Map();
  for (const x of delDia) hechasPorMaquina.set(x.maquinaId, (hechasPorMaquina.get(x.maquinaId) || 0) + 1);
  const objetivo = ejercicios.reduce((n, e) => n + e.series, 0);
  const hechasDelPlan = ejercicios.reduce(
    (n, e) => n + Math.min(e.series, hechasPorMaquina.get(e.maquinaId) || 0), 0);
  return {
    ...d,
    rutina,
    ejercicios: ejercicios.map((e) => ({ ...e, hechas: hechasPorMaquina.get(e.maquinaId) || 0 })),
    objetivo,
    hechasDelPlan,
    seriesDelDia: delDia.length,
  };
}

function datosCalendario() {
  return {
    calendario: S.cache.calendario,
    sesiones: S.cache.sesiones,
    series: S.cache.series,
    rutinas: S.cache.rutinas,
    hoy: CAL.iso(new Date()),
  };
}

/** El color de cada rutina, estable: la misma rutina, el mismo color siempre. */
function colorRutina(rutinaId) {
  if (rutinaId === CAL.DESCANSO) return 'var(--texto-tenue)';
  const i = S.cache.rutinas.findIndex((r) => r.id === rutinaId);
  if (i < 0) return 'var(--acento)';
  return `var(--serie-${(i % 5) + 1})`;
}

function pintarPlan(raiz) {
  const hoy = CAL.iso(new Date());
  if (!_mesVisible) _mesVisible = hoy;

  // El día del detalle vuelve a HOY cada vez que se entra en la pestaña: si se
  // quedara en el que miraste ayer, abrirías Plan y verías el día equivocado.
  if (!_diaElegido) _diaElegido = hoy;

  raiz.innerHTML = `
    <div id="zona-semana"></div>
    <div id="zona-dia"></div>
    <h2 class="seccion-titulo">Calendario</h2>
    <div class="cal" id="zona-mes"></div>
    <h2 class="seccion-titulo">Objetivos</h2>
    <div id="zona-metas"></div>`;

  pintarSemana($('#zona-semana', raiz));
  pintarDia($('#zona-dia', raiz));
  pintarMes($('#zona-mes', raiz));
  pintarMetas($('#zona-metas', raiz));
}

/* --------------------------------------------------------------------------
 * LA SEMANA — la tira de arriba, que es lo que se mira a diario
 * ------------------------------------------------------------------------ */
function pintarSemana(zona) {
  const hoy = CAL.iso(new Date());
  const lunes = CAL.lunesDe(hoy);
  const datos = datosCalendario();
  const delMes = CAL.mes(lunes, datos);
  const porFecha = new Map(delMes.map((d) => [d.fecha, d]));
  const r = CAL.resumenSemana(lunes, datos);

  // Cuántos ejercicios trae cada rutina, para poder decirlo en la tira. Se
  // calcula una vez por rutina y no una por día: siete llamadas a `planDe` con
  // el catálogo entero por medio se notan al pintar.
  const ejerciciosDe = new Map(S.cache.rutinas.map((r) => [r.id, planDe(r).length]));

  const dias = Array.from({ length: 7 }, (_, i) => {
    const f = CAL.sumarDias(lunes, i);
    const d = porFecha.get(f) || { fecha: f, dia: Number(f.slice(-2)) };
    const clases = ['sem-dia'];
    if (d.esHoy) clases.push('sem-hoy');
    if (f === _diaElegido) clases.push('sem-elegido');
    if (d.entrenado) clases.push('sem-entrenado');
    if (d.descanso) clases.push('sem-descanso');
    if (d.saltado) clases.push('sem-saltado');
    // La tercera línea es la que hacía falta: un día que solo dice «Push» te
    // obliga a acordarte de qué es Push. Si entrenaste manda lo HECHO —es el
    // dato— y si no, lo que te espera.
    const nEj = ejerciciosDe.get(d.rutinaId) || 0;
    const pie = d.entrenado ? `${d.series} ser.` : d.descanso ? '' : nEj ? `${nEj} ej.` : '';
    return `
      <button class="${clases.join(' ')}" data-dia="${f}" style="--color:${colorRutina(d.rutinaId)}"
        aria-pressed="${f === _diaElegido}"
        aria-label="${CAL.DIAS[i]} ${d.dia}${d.nombre ? ', ' + esc(d.nombre) : ''}${
          d.entrenado ? `, ${d.series} series hechas` : nEj ? `, ${nEj} ejercicios` : ''}">
        <span class="sem-letra">${CAL.DIAS[i]}</span>
        <span class="sem-num">${d.dia}</span>
        <span class="sem-marca">${d.rutinaId ? (d.descanso ? 'Libre' : esc(d.nombre || '?')) : '—'}</span>
        <span class="sem-pie">${pie}</span>
      </button>`;
  }).join('');

  zona.innerHTML = `
    <div class="ficha semana-tarjeta">
      <div class="semana-cabeza">
        <div class="plan-etiqueta">Esta semana</div>
        <button class="boton-plano" id="repetir-semana">Repetir</button>
      </div>
      <div class="semana-resumen">
        <span><b>${r.entrenados}</b> ${r.entrenados === 1 ? 'día entrenado' : 'días entrenados'}</span>
        ${r.planeados ? `<span>${r.planeados} en el plan</span>` : ''}
        ${r.saltados ? `<span class="semana-saltados">${r.saltados} saltado${r.saltados === 1 ? '' : 's'}</span>` : ''}
      </div>
      <div class="semana-tira">${dias}</div>
    </div>`;

  // Tocar un día de la TIRA lo elige y enseña su detalle debajo; el editor se
  // abre desde ahí. En el MES sigue abriendo el editor directamente, que es
  // donde se monta la semana y donde un toque de más por día se nota.
  $$('[data-dia]', zona).forEach((b) => (b.onclick = () => {
    _diaElegido = b.dataset.dia;
    tocar(6);
    pintarSemana(zona);
    pintarDia($('#zona-dia'));
  }));
  $('#repetir-semana', zona).onclick = () => abrirRepetirSemana(lunes);
}

/* --------------------------------------------------------------------------
 * EL DÍA — qué toca de verdad, no solo cómo se llama
 * ------------------------------------------------------------------------ *
 * Carlos, 30-ago-2026: *«que en el calendario se vea más información de la
 * rutina que te toca (…) ahora solo se ve el día y eso no sirve de nada»*.
 *
 * Aquí sale la rutina del día elegido CON SUS MÁQUINAS y el objetivo de cada
 * una (3×12), y si ya entrenaste, cuánto llevas hecho de eso. Es la diferencia
 * entre «el lunes toca Push» y «el lunes toca Push: press militar 3×12,
 * elevaciones 3×12, press de banca 3×12».
 * ------------------------------------------------------------------------ */
function pintarDia(zona) {
  if (!zona) return;
  const fecha = _diaElegido || CAL.iso(new Date());
  const hoy = CAL.iso(new Date());
  const d = detalleDelDia(fecha);
  const f = CAL.fechaDe(fecha);
  const cuando = fecha === hoy ? 'Hoy'
    : fecha === CAL.sumarDias(hoy, 1) ? 'Mañana'
    : fecha === CAL.sumarDias(hoy, -1) ? 'Ayer'
    : CAL.DIAS_LARGOS[CAL.diaSemana(fecha)];
  const titulo = `${cuando} · ${d.dia} de ${CAL.MESES[f.getMonth()].toLowerCase()}`;

  // Sin nada puesto: un hueco no es un error, pero tampoco puede ser una
  // tarjeta vacía. Se dice y se ofrece el botón que lo arregla.
  if (!d.rutinaId) {
    zona.innerHTML = `
      <div class="ficha dia-tarjeta dia-vacio">
        <div class="dia-cabeza">
          <div><div class="plan-etiqueta">${esc(titulo)}</div>
            <div class="dia-nombre dia-nombre-vacio">Sin nada puesto</div></div>
          <button class="boton-plano" data-editar>Poner rutina</button>
        </div>
        ${d.seriesDelDia
          ? `<p class="dia-nota">Ese día entrenaste igualmente: <b>${d.seriesDelDia} series</b>.</p>`
          : '<p class="dia-nota">Elige qué toca y la app te lo recuerda al llegar el día.</p>'}
      </div>`;
    cablearDia(zona, fecha);
    return;
  }

  if (d.descanso) {
    zona.innerHTML = `
      <div class="ficha dia-tarjeta plan-descanso">
        <div class="dia-cabeza">
          <div><div class="plan-etiqueta">${esc(titulo)}</div>
            <div class="dia-nombre">Descanso</div></div>
          <button class="boton-plano" data-editar>Cambiar</button>
        </div>
        <p class="dia-nota">Ni te lo propongo ese día. Descansar es parte del plan.</p>
      </div>`;
    cablearDia(zona, fecha);
    return;
  }

  const pct = d.objetivo ? Math.round((d.hechasDelPlan / d.objetivo) * 100) : 0;
  const MAX = 5;   // más de cinco filas y la tarjeta deja de leerse de un vistazo
  const filas = d.ejercicios.slice(0, MAX).map((e) => `
    <li class="dia-ej ${e.hechas >= e.series ? 'dia-ej-hecho' : ''}">
      <span class="dia-ej-nombre">${esc(e.nombre)}</span>
      <span class="dia-ej-obj">${e.series}×${e.reps}</span>
      ${e.hechas ? `<span class="dia-ej-hechas">${Math.min(e.hechas, e.series)}/${e.series}</span>` : ''}
    </li>`).join('');
  const restan = d.ejercicios.length - MAX;

  zona.innerHTML = `
    <div class="ficha dia-tarjeta" style="--color:${colorRutina(d.rutinaId)}">
      <div class="dia-cabeza">
        <div>
          <div class="plan-etiqueta">${esc(titulo)}</div>
          <div class="dia-nombre">${esc(d.nombre)}</div>
        </div>
        <button class="boton-plano" data-editar>Cambiar</button>
      </div>
      <div class="dia-resumen">
        <span><b>${d.ejercicios.length}</b> ${d.ejercicios.length === 1 ? 'ejercicio' : 'ejercicios'}</span>
        <span><b>${d.objetivo}</b> series objetivo</span>
        ${d.entrenado ? `<span class="dia-hechas"><b>${d.hechasDelPlan}</b> hechas</span>` : ''}
        ${d.saltado ? '<span class="semana-saltados">saltado</span>' : ''}
      </div>
      ${d.objetivo ? `<div class="dia-barra"><i style="width:${Math.min(100, pct)}%"></i></div>` : ''}
      ${filas ? `<ul class="dia-lista">${filas}</ul>` : '<p class="dia-nota">Esta rutina no tiene máquinas en este gimnasio.</p>'}
      ${restan > 0 ? `<p class="dia-mas">y ${restan} ${restan === 1 ? 'ejercicio más' : 'ejercicios más'}</p>` : ''}
      ${fecha === hoy ? '<button class="boton" data-entrenar style="margin-top:12px">Entrenar esto</button>' : ''}
    </div>`;
  cablearDia(zona, fecha);
}

function cablearDia(zona, fecha) {
  const ed = $('[data-editar]', zona);
  if (ed) ed.onclick = () => abrirDia(fecha);
  const en = $('[data-entrenar]', zona);
  if (en) en.onclick = () => irA('entrenar');
}

/* --------------------------------------------------------------------------
 * EL MES
 * ------------------------------------------------------------------------ */
function pintarMes(zona) {
  const datos = datosCalendario();
  const dias = CAL.mes(_mesVisible, datos);
  const f = CAL.fechaDe(_mesVisible);
  const titulo = `${CAL.MESES[f.getMonth()]} ${f.getFullYear()}`;

  const celdas = dias.map((d, i) => {
    const clases = ['cal-dia'];
    if (!d.delMes) clases.push('cal-fuera');
    if (d.esHoy) clases.push('cal-hoy');
    if (d.entrenado) clases.push('cal-entrenado');
    if (d.descanso) clases.push('cal-descanso');
    if (d.saltado) clases.push('cal-saltado');
    if (d.rutinaId && !d.descanso) clases.push('cal-planeado');
    return `
      <button class="${clases.join(' ')}" data-dia="${d.fecha}" style="--color:${colorRutina(d.rutinaId)};--i:${i}"
        aria-label="${d.dia} de ${CAL.MESES[CAL.fechaDe(d.fecha).getMonth()]}${d.nombre ? ', ' + esc(d.nombre) : ''}${d.entrenado ? ', entrenado' : ''}">
        <span class="cal-num">${d.dia}</span>
        ${d.rutinaId && !d.descanso ? `<span class="cal-etiqueta">${esc((d.nombre || '').slice(0, 4))}</span>` : ''}
        ${d.descanso ? '<span class="cal-etiqueta cal-desc">descanso</span>' : ''}
        ${d.entrenado ? '<span class="cal-punto"></span>' : ''}
      </button>`;
  }).join('');

  zona.innerHTML = `
    <div class="cal-cabeza">
      <button class="cal-flecha" id="mes-antes" aria-label="Mes anterior">${icono('izquierda', 20)}</button>
      <div class="cal-titulo">${titulo}</div>
      ${_mesVisible.slice(0, 7) !== CAL.iso(new Date()).slice(0, 7)
        ? '<button class="boton-plano" id="mes-hoy">Hoy</button>'
        : ''}
      <button class="cal-flecha" id="mes-despues" aria-label="Mes siguiente">${icono('derecha', 20)}</button>
    </div>
    <div class="cal-semana">${CAL.DIAS.map((d) => `<span>${d}</span>`).join('')}</div>
    <div class="cal-rejilla">${celdas}</div>
    <div class="cal-leyenda">
      <span class="cal-ley"><i class="ley-entrenado"></i> entrenado</span>
      <span class="cal-ley"><i class="ley-planeado"></i> en el plan</span>
      <span class="cal-ley"><i class="ley-saltado"></i> saltado</span>
    </div>`;

  $('#mes-antes', zona).onclick = () => { _mesVisible = CAL.sumarMeses(_mesVisible, -1); pintarMes(zona); tocar(6); };
  $('#mes-despues', zona).onclick = () => { _mesVisible = CAL.sumarMeses(_mesVisible, 1); pintarMes(zona); tocar(6); };
  // Volver al mes de hoy sin ir tocando la flecha nueve veces. Solo aparece
  // cuando estás en otro mes, que es cuando sirve.
  const bHoy = $('#mes-hoy', zona);
  if (bHoy) bHoy.onclick = () => { _mesVisible = CAL.iso(new Date()); pintarMes(zona); tocar(6); };
  $$('[data-dia]', zona).forEach((b) => (b.onclick = () => abrirDia(b.dataset.dia)));
}

/** Poner (o quitar) lo que toca un día. */
function abrirDia(fecha) {
  // El día que se toca pasa a ser el del detalle: al cerrar la hoja, la tarjeta
  // de abajo enseña justo el día que acabas de tocar, no el de antes.
  _diaElegido = fecha;
  const d = CAL.fechaDe(fecha);
  const puesto = S.cache.calendario.find((c) => !c.del && c.fecha === fecha);
  const hoy = CAL.iso(new Date());
  const cuando = fecha === hoy ? 'Hoy' : fecha === CAL.sumarDias(hoy, 1) ? 'Mañana' : null;
  const titulo = cuando || `${CAL.DIAS[CAL.diaSemana(fecha)]} ${d.getDate()} de ${CAL.MESES[d.getMonth()]}`;

  // Lo que YA hay puesto ese día, arriba del todo y con detalle: desde el mes se
  // llega aquí sin haber visto nada del día, y elegir a ciegas es cómo se acaba
  // pisando un plan que ya estaba bien.
  const det = detalleDelDia(fecha);
  const resumen = det.rutinaId && !det.descanso
    ? `<div class="hoja-dia">
         <span class="hoja-dia-color" style="background:${colorRutina(det.rutinaId)}"></span>
         <div>
           <b>${esc(det.nombre)}</b>
           <small>${det.ejercicios.length} ${det.ejercicios.length === 1 ? 'ejercicio' : 'ejercicios'} ·
             ${det.objetivo} series${det.entrenado ? ` · ${det.hechasDelPlan} hechas` : ''}</small>
           ${det.ejercicios.length
             ? `<small class="hoja-dia-ejs">${det.ejercicios.map((e) => esc(e.nombre)).join(' · ')}</small>`
             : ''}
         </div>
       </div>`
    : det.descanso
      ? '<div class="hoja-dia"><span class="hoja-dia-color" style="background:var(--texto-tenue)"></span><div><b>Descanso</b><small>ese día no te propongo nada</small></div></div>'
      : '';

  hoja(titulo, `
    ${resumen}
    <div class="hoja-lista">
      ${S.cache.rutinas.map((r) => {
        const n = planDe(r).length;
        return `
        <button class="hoja-op" data-poner="${r.id}" aria-current="${puesto && puesto.rutinaId === r.id}">
          <span class="op-color" style="background:${colorRutina(r.id)}"></span>
          <span>${esc(r.nombre)}<small>${n} ${n === 1 ? 'máquina' : 'máquinas'}${
            n ? ' · ' + planDe(r).reduce((a, x) => a + x.series, 0) + ' series' : ''}</small></span>
          ${puesto && puesto.rutinaId === r.id ? icono('tic', 20) : ''}
        </button>`;
      }).join('')}
      <button class="hoja-op" data-poner="${CAL.DESCANSO}" aria-current="${puesto && puesto.rutinaId === CAL.DESCANSO}">
        <span class="op-color" style="background:var(--texto-tenue)"></span>
        <span>Descanso<small>ni te lo propongo ese día</small></span>
        ${puesto && puesto.rutinaId === CAL.DESCANSO ? icono('tic', 20) : ''}
      </button>
    </div>
    ${puesto ? '<button class="boton boton-2" id="quitar-dia" style="margin-top:14px">Quitar del calendario</button>' : ''}`,
    (cuerpo, cerrar) => {
      $$('[data-poner]', cuerpo).forEach((b) => (b.onclick = async () => {
        const rutinaId = b.dataset.poner;
        // Volver a tocar lo que ya estaba puesto lo quita: es lo que espera
        // cualquiera y evita tener que buscar el botón de borrar.
        if (puesto && puesto.rutinaId === rutinaId) {
          await db.guardar('calendario', { ...puesto, del: 1 });
        } else if (puesto) {
          await db.guardar('calendario', { ...puesto, rutinaId });
        } else {
          await db.guardar('calendario', { fecha, rutinaId, nota: '' });
        }
        await recargar();
        cerrar();
        tocar();
        pintar();
        sync.sincronizar({ silencioso: true });
      }));
      const bQuitar = $('#quitar-dia', cuerpo);
      if (bQuitar) bQuitar.onclick = async () => {
        await db.guardar('calendario', { ...puesto, del: 1 });
        await recargar();
        cerrar();
        pintar();
        sync.sincronizar({ silencioso: true });
      };
    });
}

/** Copiar la semana montada a las siguientes. */
function abrirRepetirSemana(lunes) {
  hoja('Repetir esta semana', `
    <p class="campo-nota" style="margin:0 0 16px">Se copia lo que hayas puesto de lunes a domingo a las semanas
      siguientes. Lo que ya tengas puesto en esas semanas <b>no se toca</b>.</p>
    <div class="chips chips-compacto" style="margin-left:0;margin-right:0;padding-left:0">
      ${[1, 2, 3, 4].map((n) => `<button class="chip" data-semanas="${n}">${n} ${n === 1 ? 'semana' : 'semanas'}</button>`).join('')}
    </div>`, (cuerpo, cerrar) => {
    $$('[data-semanas]', cuerpo).forEach((b) => (b.onclick = async () => {
      const semanas = Number(b.dataset.semanas);
      const nuevos = CAL.repetirSemana(lunes, { calendario: S.cache.calendario, semanas });
      let puestos = 0;
      for (const n of nuevos) {
        // Lo que ya esté puesto NO se pisa: repetir no puede borrar un plan que
        // ya habías hecho a mano para la semana que viene.
        if (S.cache.calendario.some((c) => !c.del && c.fecha === n.fecha)) continue;
        await db.guardar('calendario', n);
        puestos++;
      }
      await recargar();
      cerrar();
      pintar();
      aviso(puestos ? `${puestos} días copiados` : 'Esas semanas ya estaban montadas');
      sync.sincronizar({ silencioso: true });
    }));
  });
}

/* --------------------------------------------------------------------------
 * LOS OBJETIVOS
 * ------------------------------------------------------------------------ */
function datosMetas() {
  return {
    series: S.cache.series,
    pesos: S.cache.pesos,
    comidas: S.cache.comidas,
    maquinas: S.cache.maquinas,
  };
}

function pintarMetas(zona) {
  const vivas = S.cache.metas.filter((m) => !m.del);
  if (!vivas.length) {
    zona.innerHTML = `<div class="vacio">
      <span class="vacio-icono">${icono('fuego', 34)}</span>
      <p>Ponte un objetivo y la app te dice sola cuánto llevas.<br>
         Bajar a 74 kg, hacer press de banca a 80×8, batir un récord…</p>
      <button class="boton" id="meta-nueva">Ponerme un objetivo</button>
    </div>`;
    $('#meta-nueva', zona).onclick = () => editarMeta(null);
    return;
  }

  const datos = datosMetas();
  const progresos = new Map(vivas.map((m) => [m.id, MET.progreso(m, datos)]));
  const orden = MET.ordenar(vivas, progresos);
  const hoy = CAL.iso(new Date());

  zona.innerHTML = orden.map((m, i) => {
    const p = progresos.get(m.id);
    const dias = MET.diasQueQuedan(m, hoy);
    const R = 26, C = 2 * Math.PI * R;
    return `
      <button class="meta ${p.hecha ? 'meta-hecha' : ''}" data-meta="${m.id}" style="--i:${i}">
        <span class="meta-aro">
          <svg viewBox="0 0 64 64" aria-hidden="true">
            <circle class="meta-carril" cx="32" cy="32" r="${R}"></circle>
            <circle class="meta-relleno" cx="32" cy="32" r="${R}"
              stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${C.toFixed(1)}"
              data-hasta="${(C * (1 - p.pct)).toFixed(1)}"></circle>
          </svg>
          <span class="meta-pct">${p.hecha ? icono('tic', 18) : Math.round(p.pct * 100) + '%'}</span>
        </span>
        <span class="meta-txt">
          <span class="meta-titulo">${esc(m.titulo || tituloDeMeta(m))}</span>
          <span class="meta-detalle">${esc(p.texto)}</span>
          ${dias !== null && !p.hecha
            ? `<span class="meta-plazo ${dias < 0 ? 'meta-tarde' : ''}">${
                dias < 0 ? `se pasó hace ${-dias} días` : dias === 0 ? 'se acaba hoy' : `quedan ${dias} días`}</span>`
            : ''}
        </span>
      </button>`;
  }).join('');

  $$('[data-meta]', zona).forEach((b) => (b.onclick = () => {
    const m = S.cache.metas.find((x) => x.id === b.dataset.meta);
    if (m) editarMeta(m);
  }));
}

/** El título por defecto de una meta, si no le pusiste uno. */
function tituloDeMeta(m) {
  const maq = S.cache.maquinas.find((x) => x.id === m.maquinaId);
  const nombre = maq ? maq.nombre : 'una máquina';
  if (m.tipo === 'peso') return `Llegar a ${m.objetivo} kg`;
  if (m.tipo === 'kcal') return `${m.objetivo} kcal al día`;
  if (m.tipo === 'levantamiento') return `${nombre}: ${m.objetivo} × ${m.reps}`;
  if (m.tipo === 'pr') return `Batir mi récord en ${nombre}`;
  return 'Objetivo';
}

/** Crear o cambiar un objetivo. */
function editarMeta(meta) {
  const nuevo = !meta;
  let tipo = meta ? meta.tipo : 'peso';
  let maquinaId = meta ? meta.maquinaId : null;

  const cuerpoHTML = () => {
    const t = MET.tipoDe(tipo);
    const maq = S.cache.maquinas.find((x) => x.id === maquinaId);
    const pesoUlt = [...S.cache.pesos].filter((p) => !p.del).sort((a, b) => a.fecha.localeCompare(b.fecha)).pop();
    return `
      <div class="chips chips-compacto" style="margin-left:0;margin-right:0;padding-left:0" id="tipos">
        ${MET.TIPOS.map((x) => `<button class="chip" data-tipo="${x.id}" aria-pressed="${x.id === tipo}">${x.nombre}</button>`).join('')}
      </div>
      <p class="campo-nota" style="margin:0 0 16px">${MET.tipoDe(tipo).explica}</p>

      ${t.pide.includes('maquinaId') ? `
        <button class="selector-linea" id="meta-maquina" type="button">
          <span class="sel-nombre">${maq ? esc(maq.nombre) : 'Elegir máquina'}</span>
          <span class="sel-pista">${maq ? 'cambiar' : 'obligatorio'}</span>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
        </button>` : ''}

      ${t.pide.includes('objetivo') ? `
        <div class="campo-fila">
          <div class="campo">
            <label for="meta-obj">${tipo === 'kcal' ? 'Calorías al día' : tipo === 'peso' ? 'Peso al que quiero llegar' : 'Peso a levantar'}</label>
            <input id="meta-obj" type="number" inputmode="decimal" step="any"
              value="${meta ? meta.objetivo : tipo === 'kcal' ? 2400 : tipo === 'peso' && pesoUlt ? Math.round(pesoUlt.kg - 3) : ''}">
          </div>
          ${t.pide.includes('reps') ? `
            <div class="campo">
              <label for="meta-reps">Repeticiones</label>
              <input id="meta-reps" type="number" inputmode="numeric" step="1" value="${meta ? meta.reps || 8 : 8}">
            </div>` : ''}
        </div>` : ''}

      <div class="campo">
        <label for="meta-fecha">Para cuándo <small style="font-weight:400;color:var(--texto-tenue)">(opcional)</small></label>
        <input id="meta-fecha" type="date" value="${meta && meta.fecha_limite ? meta.fecha_limite : ''}">
      </div>
      <div class="campo">
        <label for="meta-titulo">Cómo llamarlo <small style="font-weight:400;color:var(--texto-tenue)">(opcional)</small></label>
        <input id="meta-titulo" type="text" placeholder="Se pone solo si lo dejas vacío"
          value="${meta && meta.titulo ? esc(meta.titulo) : ''}">
      </div>

      <button class="boton" id="meta-guardar">${nuevo ? 'Ponerme el objetivo' : 'Guardar'}</button>
      ${nuevo ? '' : '<button class="boton boton-peligro" id="meta-borrar" style="margin-top:10px">Borrar el objetivo</button>'}`;
  };

  hoja(nuevo ? 'Nuevo objetivo' : 'El objetivo', cuerpoHTML(), function montar(cuerpo, cerrar) {
    const rehacer = () => {
      cuerpo.innerHTML = cuerpoHTML();
      montar(cuerpo, cerrar);
    };

    $$('[data-tipo]', cuerpo).forEach((b) => (b.onclick = () => {
      tipo = b.dataset.tipo;
      rehacer();
    }));

    const bMaq = $('#meta-maquina', cuerpo);
    if (bMaq) bMaq.onclick = () => {
      const suyas = S.cache.maquinas.filter((m) => m.gimnasioId === S.gimnasioId);
      hoja('¿Qué máquina?', `
        <input class="buscador" type="search" id="bm" placeholder="Buscar máquina…" autocomplete="off">
        <div class="hoja-lista" id="lm"></div>`, (c2, cerrar2) => {
        const lista = $('#lm', c2);
        const pinta = (q = '') => {
          const filtro = quitarTildes(q.trim().toLowerCase());
          const vistas = suyas.filter((m) => !filtro || quitarTildes(m.nombre.toLowerCase()).includes(filtro));
          lista.innerHTML = vistas.length
            ? vistas.map((m) => `<button class="hoja-op" data-m="${m.id}"><span>${esc(m.nombre)}</span></button>`).join('')
            : '<p class="grafica-vacia">Ninguna con ese nombre.</p>';
          $$('[data-m]', lista).forEach((b) => (b.onclick = () => {
            maquinaId = b.dataset.m;
            cerrar2();
            rehacer();
          }));
        };
        pinta();
        $('#bm', c2).oninput = (e) => pinta(e.target.value);
      });
    };

    $('#meta-guardar', cuerpo).onclick = async () => {
      const t = MET.tipoDe(tipo);
      const objetivo = Number(($('#meta-obj', cuerpo) || {}).value) || 0;
      if (t.pide.includes('maquinaId') && !maquinaId) return aviso('Elige la máquina');
      if (t.pide.includes('objetivo') && objetivo <= 0) return aviso('Pon el número al que quieres llegar');

      const pesos = S.cache.pesos.filter((p) => !p.del).sort((a, b) => a.fecha.localeCompare(b.fecha));
      const series = S.cache.series.filter((s) => !s.del && s.maquinaId === maquinaId);
      const datos = {
        ...(meta || {}),
        tipo,
        titulo: ($('#meta-titulo', cuerpo).value || '').trim(),
        objetivo,
        unidad: t.unidad,
        maquinaId: t.pide.includes('maquinaId') ? maquinaId : null,
        reps: t.pide.includes('reps') ? Number($('#meta-reps', cuerpo).value) || 8 : null,
        fecha_limite: $('#meta-fecha', cuerpo).value || '',
        hecha: 0,
        creado: meta ? meta.creado : Date.now(),
        // DE DÓNDE SALES. Sin esto, «bajar a 74» se vería al 95 % desde el
        // primer día, y batir un récord se daría por hecho con el récord que ya
        // tenías. El punto de partida se congela al crear el objetivo.
        partida: meta ? meta.partida
          : tipo === 'peso' ? (pesos.length ? pesos[pesos.length - 1].kg : objetivo)
          : tipo === 'pr' ? series.reduce((a, x) => Math.max(a, Number(x.peso) || 0), 0)
          : null,
      };
      await db.guardar('metas', datos);
      await recargar();
      cerrar();
      tocar();
      aviso(nuevo ? 'Objetivo puesto' : 'Objetivo guardado');
      pintar();
      sync.sincronizar({ silencioso: true });
    };

    const bBorrar = $('#meta-borrar', cuerpo);
    if (bBorrar) bBorrar.onclick = async () => {
      if (!await preguntar('¿Borrar este objetivo?')) return;
      await db.guardar('metas', { ...meta, del: 1 });
      await recargar();
      cerrar();
      pintar();
      sync.sincronizar({ silencioso: true });
    };
  });
}

/* ========================================================================== *
 * CATÁLOGO — dar de alta varias máquinas de golpe
 * ========================================================================== */
function abrirCatalogo() {
  const gim = S.cache.gimnasios.find((g) => g.id === S.gimnasioId);
  if (!gim) return aviso('Elige un gimnasio primero');

  // Unidad por defecto: la que más usa este gimnasio (Basic-Fit va en libras).
  const suyas = S.cache.maquinas.filter((m) => m.gimnasioId === S.gimnasioId);
  const enLb = suyas.filter((m) => m.unidad === 'lb').length;
  let unidad = suyas.length && enLb > suyas.length / 2 ? 'lb' : 'kg';

  const elegidas = new Set();
  let grupo = '';
  let consulta = '';

  hoja(
    'Catálogo de ejercicios',
    `
    <p class="campo-nota" style="margin:0 0 16px">
      Toca las que tengas en <b>${esc(gim.nombre)}</b> y añádelas todas de una vez.
      Luego, si quieres, les haces la foto real desde su ficha.</p>
    <div class="campo" style="margin-bottom:8px">
      <label>Unidad de las placas de este gimnasio</label>
      <div class="chips" style="margin:0;padding-left:0;padding-right:0">
        <button class="chip" data-u="kg">Kilos (kg)</button>
        <button class="chip" data-u="lb">Libras (lb)</button>
      </div>
    </div>
    <input class="buscador" type="search" id="cat-buscar" placeholder="Buscar entre 1.365 ejercicios…">
    <div class="chips" id="cat-grupos"></div>
    <p class="chip-explica" id="cat-cuenta"></p>
    <div class="catalogo-rejilla" id="cat-lista"></div>
    <div class="barra-accion">
      <button class="boton" id="cat-anadir" disabled>Añadir</button>
    </div>`,
    (cuerpo, cerrar) => {
      const lista = $('#cat-lista', cuerpo);
      const botonAnadir = $('#cat-anadir', cuerpo);
      const yaTengo = new Set(suyas.map((m) => m.nombre.toLowerCase()));

      $('#cat-grupos', cuerpo).innerHTML =
        `<button class="chip" data-g="">Todos</button>` +
        cat.GRUPOS_CATALOGO.map((g) => {
          const nom = (D.GRUPOS.find((x) => x.id === g) || {}).nombre || g;
          return `<button class="chip" data-g="${g}">${esc(nom)}</button>`;
        }).join('');

      const refrescarBoton = () => {
        botonAnadir.disabled = elegidas.size === 0;
        botonAnadir.textContent = elegidas.size
          ? `Añadir ${elegidas.size} máquina${elegidas.size > 1 ? 's' : ''}`
          : 'Añadir';
      };

      // El catálogo tiene 1.365 ejercicios. Pintarlos todos de golpe son ~1.365
      // SVG en el DOM y casi un segundo de hilo bloqueado en un móvil normal:
      // se pinta A TROZOS y el resto llega al llegar abajo.
      const TROZO = 60;
      let visibles = TROZO;
      let resultados = [];

      const pintarTrozo = (desde) => {
        const trozo = resultados.slice(desde, visibles);
        const frag = document.createDocumentFragment();
        for (const e of trozo) {
          const repetida = yaTengo.has(e.n.toLowerCase());
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'cat-item';
          b.setAttribute('aria-pressed', elegidas.has(e.n));
          if (repetida) b.classList.add('cat-item-repe');
          b.innerHTML = `
            <span class="cat-medallon">${cat.imagenEjercicio(e.n, e.i, e.g)}</span>
            <span class="cat-nombre">${esc(e.n)}</span>
            <span class="cat-grupo">${repetida ? 'ya la tienes' : esc((D.GRUPOS.find((x) => x.id === e.g) || {}).nombre || e.g)}</span>`;
          b.onclick = () => {
            if (elegidas.has(e.n)) elegidas.delete(e.n);
            else elegidas.add(e.n);
            b.setAttribute('aria-pressed', elegidas.has(e.n));
            refrescarBoton();
          };
          frag.appendChild(b);
        }
        lista.appendChild(frag);
        pintarPie();
      };

      const pintarPie = () => {
        const pie = $('#cat-mas', cuerpo);
        if (pie) pie.remove();
        const quedan = resultados.length - visibles;
        if (quedan <= 0) return;
        const b = document.createElement('button');
        b.id = 'cat-mas';
        b.type = 'button';
        b.className = 'boton boton-2 cat-mas';
        b.textContent = `Ver ${Math.min(quedan, TROZO)} más (quedan ${quedan})`;
        b.onclick = () => {
          const desde = visibles;
          visibles += TROZO;
          pintarTrozo(desde);
        };
        lista.appendChild(b);
      };

      const pintarLista = () => {
        resultados = cat.buscar(consulta, grupo);
        visibles = TROZO;
        lista.innerHTML = '';
        const cuenta = $('#cat-cuenta', cuerpo);
        if (cuenta) {
          cuenta.textContent = resultados.length
            ? `${resultados.length.toLocaleString('es-ES')} ejercicio${resultados.length > 1 ? 's' : ''}`
            : '';
        }
        if (!resultados.length) {
          lista.innerHTML =
            '<p class="grafica-vacia cat-mas">Nada con ese filtro. Prueba con una palabra suelta: «press», «curl», «femoral».</p>';
          return;
        }
        pintarTrozo(0);
      };

      $$('[data-u]', cuerpo).forEach((b) => {
        b.setAttribute('aria-pressed', b.dataset.u === unidad);
        b.onclick = () => {
          unidad = b.dataset.u;
          $$('[data-u]', cuerpo).forEach((x) => x.setAttribute('aria-pressed', x.dataset.u === unidad));
        };
      });
      $$('[data-g]', cuerpo).forEach((b) => {
        b.setAttribute('aria-pressed', b.dataset.g === grupo);
        b.onclick = () => {
          grupo = b.dataset.g;
          $$('[data-g]', cuerpo).forEach((x) => x.setAttribute('aria-pressed', x.dataset.g === grupo));
          pintarLista();
        };
      });
      const buscador = $('#cat-buscar', cuerpo);
      buscador.oninput = () => {
        consulta = buscador.value;
        pintarLista();
      };

      botonAnadir.onclick = async () => {
        let n = 0;
        for (const nombre of elegidas) {
          const e = cat.CATALOGO.find((x) => x.n === nombre);
          if (!e) continue;
          await db.guardar('maquinas', {
            gimnasioId: S.gimnasioId,
            nombre: e.n,
            grupo: e.g,
            tipo: e.t,
            icono: e.i,                       // dibujo hasta que haya foto real
            unidad,
            incremento: unidad === 'lb' ? 5 : 2.5,
            notas: '',
            foto: null,
          });
          n++;
        }
        await recargar();
        cerrar();
        aviso(`${n} máquina${n > 1 ? 's' : ''} añadida${n > 1 ? 's' : ''}`);
        pintar();
        sync.sincronizar({ silencioso: true });
      };

      pintarLista();
      refrescarBoton();
    }
  );
}

function sesionHoyExcluida() {
  const dia = new Date().toISOString().slice(0, 10);
  const s = S.cache.sesiones.find((x) => x.gimnasioId === S.gimnasioId && x.fecha.slice(0, 10) === dia);
  return !!(s && s.excluir);
}

async function alternarDiaFlojo() {
  const ses = await sesionDeHoy(S.gimnasioId);
  ses.excluir = ses.excluir ? 0 : 1;
  await db.guardar('sesiones', ses);
  await recargar();
  aviso(ses.excluir ? 'Hoy no contará en las tendencias' : 'Hoy vuelve a contar');
  pintar();
}

/* ========================================================================== *
 * REGISTRAR SERIE — el camino corto
 * ========================================================================== */
/**
 * `objetivo` = {series, reps} del plan del día, si se ha entrado desde ahí.
 * Con él, la hoja deja de ser «apunta un número» y pasa a ser «vas por la 2 de
 * 3, te tocan 12», que es lo que pidió Carlos. Sin él funciona igual que antes:
 * desde la lista de todas las máquinas no hay plan que enseñar.
 */
async function abrirRegistro(maquinaId, objetivo = null) {
  const m = S.cache.maquinas.find((x) => x.id === maquinaId);
  if (!m) return;
  const unidad = m.unidad || 'kg';
  const paso = Number(m.incremento) || (unidad === 'lb' ? 5 : 2.5);
  const ss = seriesDe(maquinaId);
  const hoyYa = seriesHoyDe(maquinaId);
  // La «última vez» tiene que ser la de OTRO día: si no, tras la primera serie
  // del día la pista pasaría a decir «hace un momento» y dejaría de servir para
  // lo que existe — saber cuánto levantaste la vez anterior.
  const ult = D.ultimaSerie(ss.filter((s) => !hoyYa.includes(s))) || D.ultimaSerie(ss);
  const rec = D.record(ss, unidad);

  let peso = ult ? Number(ult.peso) : 0;
  let reps = objetivo ? objetivo.reps : ult ? Number(ult.reps) : 10;

  hoja(
    m.nombre,
    `
    ${objetivo ? `<div class="objetivo" id="objetivo"></div>` : ''}
    <div class="contador-etiqueta">Peso</div>
    <div class="contador">
      <button class="contador-boton" data-p="-" aria-label="Quitar ${paso} ${unidad}">−</button>
      <div class="contador-valor">
        <input class="contador-numero" id="c-peso" type="number" inputmode="decimal" step="any">
        <div class="contador-unidad">${unidad}</div>
      </div>
      <button class="contador-boton" data-p="+" aria-label="Añadir ${paso} ${unidad}">+</button>
    </div>

    <div class="contador-etiqueta" style="margin-top:14px">Repeticiones</div>
    <div class="contador">
      <button class="contador-boton" data-r="-" aria-label="Una repetición menos">−</button>
      <div class="contador-valor">
        <input class="contador-numero" id="c-reps" type="number" inputmode="numeric" step="1">
        <div class="contador-unidad">reps</div>
      </div>
      <button class="contador-boton" data-r="+" aria-label="Una repetición más">+</button>
    </div>

    <p class="pista-anterior" id="pista"></p>
    <button class="boton" id="guardar-serie">Guardar serie</button>
    <div class="botonera">
      <button class="boton boton-2" id="guardar-otra">Guardar y otra</button>
      <button class="boton boton-2" id="ver-ficha">Ver ficha</button>
    </div>`,
    (cuerpo, cerrar) => {
      const iPeso = $('#c-peso', cuerpo);
      const iReps = $('#c-reps', cuerpo);
      const pista = $('#pista', cuerpo);
      const cajaObj = $('#objetivo', cuerpo);

      const refrescar = () => {
        iPeso.value = peso;
        iReps.value = reps;
        const partes = [];
        if (ult) partes.push(`Última vez: <b>${D.formatearPeso(ult.peso, unidad)} × ${ult.reps}</b> (${D.haceCuanto(ult.fecha)})`);
        if (rec && (!ult || rec.id !== ult.id)) partes.push(`Récord: <b>${D.formatearPeso(rec.peso, unidad)} × ${rec.reps}</b>`);
        if (!ult) partes.push('Primera vez en esta máquina.');
        pista.innerHTML = partes.join('<br>');

        if (cajaObj && objetivo) {
          const hechas = seriesHoyDe(maquinaId).length;
          const va = Math.min(hechas + 1, objetivo.series);
          const listo = hechas >= objetivo.series;
          cajaObj.innerHTML = listo
            ? `<div class="objetivo-titulo">Ya has hecho las ${objetivo.series} series</div>
               <div class="objetivo-pie">Puedes seguir apuntando si haces alguna más.</div>`
            : `<div class="objetivo-titulo">Serie ${va} de ${objetivo.series}</div>
               <div class="objetivo-pie">Objetivo del día: ${objetivo.series}×${objetivo.reps} repeticiones</div>`;
          cajaObj.classList.toggle('objetivo-listo', listo);
        }
      };
      refrescar();

      $$('[data-p]', cuerpo).forEach(
        (b) =>
          (b.onclick = () => {
            peso = Math.max(0, Math.round((peso + (b.dataset.p === '+' ? paso : -paso)) * 100) / 100);
            refrescar();
          })
      );
      $$('[data-r]', cuerpo).forEach(
        (b) =>
          (b.onclick = () => {
            reps = Math.max(1, reps + (b.dataset.r === '+' ? 1 : -1));
            refrescar();
          })
      );
      iPeso.oninput = () => (peso = Number(iPeso.value) || 0);
      iReps.oninput = () => (reps = Math.max(1, Number(iReps.value) || 1));

      const guardar = async () => {
        // La foto de ANTES, para saber si esta serie desbloquea algo. Se hace
        // aquí y no después: `recargar()` ya deja el cálculo nuevo, y sin el
        // anterior no hay con qué comparar.
        const medallasAntes = fotoDeMedallas(calculoPerfil());
        const ses = await sesionDeHoy(m.gimnasioId);
        // La rotación avanza cuando se ENTRENA, no cuando pasa un día. Si hoy
        // se apunta algo y no se ha elegido día a mano, queda escrito el que
        // tocaba: mañana se propondrá el siguiente. Sin esto, la rotación se
        // quedaría clavada en el mismo día para siempre.
        if (!ses.rutina) {
          const prop = rutinaDeHoy().rutina;
          if (prop) {
            ses.rutina = prop.id;
            await db.guardar('sesiones', ses);
          }
        }
        await db.guardar('series', {
          maquinaId: m.id,
          gimnasioId: m.gimnasioId,
          sesionId: ses.id,
          fecha: hoyISO(),
          peso: Number(iPeso.value) || 0,
          reps: Math.max(1, Number(iReps.value) || 1),
          nota: '',
        });
        await recargar();
        // La tarjeta del plan que queda DETRÁS de la hoja también cuenta series.
        // Sin esto, tras tres «Guardar y otra» y cerrar, seguía diciendo «0 de
        // 3»: el dato estaba bien y la pantalla mentía, que para el que la mira
        // es exactamente lo mismo que estar mal.
        const zonaPlan = $('#plan-hoy');
        if (zonaPlan) pintarPlanDeHoy(zonaPlan);
        sync.sincronizar({ silencioso: true });
        // Las MEDALLAS las celebra `celebrarSiHayNuevas` con la foto de antes
        // (la fiesta de la 0.22.0). Las INSIGNIAS no las celebraba nadie, y se
        // enseñan en la siguiente pintada que no tenga una hoja delante.
        await comprobarLogros();
        return medallasAntes;
      };

      $('#guardar-serie', cuerpo).onclick = async () => {
        const antes = await guardar();
        cerrar();
        pintar();
        // La celebración manda sobre el aviso: si ha caído una medalla, el
        // «Guardado: 100 kg × 8» sobra y encima taparía la pieza.
        if (!celebrarSiHayNuevas(antes, calculoPerfil())) {
          aviso(`Guardado: ${D.formatearPeso(peso, unidad)} × ${reps}`);
        }
      };
      $('#guardar-otra', cuerpo).onclick = async () => {
        const antes = await guardar();
        if (!celebrarSiHayNuevas(antes, calculoPerfil())) {
          aviso(`Serie guardada · ${D.formatearPeso(peso, unidad)} × ${reps}`, 1300);
        }
        refrescar();
      };
      $('#ver-ficha', cuerpo).onclick = () => {
        cerrar();
        abrirFicha(m.id);
      };
    }
  );
}

/* ========================================================================== *
 * FICHA DE MÁQUINA — foto, chuleta, historial y evolución
 * ========================================================================== */
async function abrirFicha(maquinaId) {
  const m = S.cache.maquinas.find((x) => x.id === maquinaId);
  if (!m) return;
  const unidad = m.unidad || 'kg';
  const ss = seriesDe(maquinaId).sort((a, b) => b.fecha.localeCompare(a.fecha));
  const medios = await db.mediosDe(maquinaId);
  const consulta = encodeURIComponent(`${m.nombre} técnica ejercicio`);
  // Qué músculo trabaja. El nombre va SIEMPRE escrito: el rojo de la figura es
  // el acompañante, no el indicador — con daltonismo el color solo no dice nada.
  const musculo = cat.musculoDe(cat.patronDe(m.nombre));

  hoja(
    m.nombre,
    `
    <!-- El movimiento, en marcha. Es lo primero que se ve al abrir el ejercicio
         porque es lo que resuelve la duda: «¿este cuál era?». -->
    <div class="ej-escena" id="ej-escena">
      ${cat.figuraDe(m.nombre)}
      ${musculo ? `<span class="ej-musculo">${esc(musculo.nombre)}</span>` : ''}
      <button class="ej-pausa" id="ej-pausa" type="button" aria-label="Pausar la animación" aria-pressed="false">
        ${icono('pausa', 18)}
      </button>
    </div>

    ${m.foto ? '<div id="ficha-foto" style="margin-bottom:12px"></div>' : ''}
    ${!m.foto && cat.rutaFoto(m.nombre)
      ? `<div class="ficha-sinfoto">
           <span class="ficha-sinfoto-img"><img class="ej-foto" src="${cat.rutaFoto(m.nombre)}" alt="" width="76" height="76" loading="lazy"></span>
           <div class="ficha-sinfoto-texto">
             Foto de ejemplo. Si tu máquina es distinta, hazle una foto y la reconocerás de un vistazo.
           </div>
         </div>`
      : ''}

    <div class="ficha" id="ej-tecnica">
      <h3 class="ficha-titulo">Cómo se hace</h3>
      <div class="esqueleto-lista" aria-label="Buscando los pasos" aria-busy="true">
        <span class="esqueleto" style="width:92%"></span>
        <span class="esqueleto" style="width:78%"></span>
        <span class="esqueleto" style="width:85%"></span>
      </div>
    </div>

    <div class="ficha">
      <h3 class="ficha-titulo">Evolución del peso</h3>
      <div id="ficha-grafica"></div>
    </div>

    <div class="ficha">
      <h3 class="ficha-titulo">Chuleta</h3>
      <div class="chuleta-enlaces">
        <a class="enlace-btn" target="_blank" rel="noopener" href="https://www.youtube.com/results?search_query=${consulta}">${icono('video', 17)} YouTube</a>
        <a class="enlace-btn" target="_blank" rel="noopener" href="https://www.instagram.com/explore/tags/${encodeURIComponent(
          m.nombre.replace(/[^a-zA-Z0-9áéíóúñ]/g, '').toLowerCase()
        )}/">${icono('camara_social', 17)} Instagram</a>
        <a class="enlace-btn" target="_blank" rel="noopener" href="https://www.google.com/search?tbm=isch&q=${consulta}">${icono('imagen', 17)} Fotos</a>
      </div>
      <div class="campo">
        <label for="notas">Mis notas de técnica (funcionan sin cobertura)</label>
        <textarea id="notas" placeholder="Ej.: codo alto, no pasar del hombro, asiento en el 4">${esc(m.notas || '')}</textarea>
      </div>
      <div class="botonera" style="margin-top:0">
        <button class="boton boton-2" id="guardar-notas">Guardar notas</button>
        <button class="boton boton-2" id="anadir-medio">+ Foto/vídeo</button>
      </div>
      <input type="file" id="archivo-medio" accept="image/*,video/*" class="oculto">
      <div class="medios" id="medios" style="margin-top:12px"></div>
    </div>

    <div class="ficha">
      <h3 class="ficha-titulo">Historial (${ss.length})</h3>
      <div id="historial"></div>
    </div>

    <div class="botonera">
      <button class="boton boton-2" id="editar-maq">Editar</button>
      <button class="boton boton-2" id="copiar-maq">Copiar a otro gym</button>
    </div>`,
    async (cuerpo, cerrar) => {
      // Pausar la animación. Existe porque mirar un bucle mientras se lee la
      // técnica cansa, y porque con `prefers-reduced-motion` no debe moverse.
      const escena = $('#ej-escena', cuerpo);
      const btnPausa = $('#ej-pausa', cuerpo);
      if (btnPausa) {
        btnPausa.onclick = () => {
          const quieta = escena.classList.toggle('ej-quieta');
          btnPausa.setAttribute('aria-pressed', String(quieta));
          btnPausa.setAttribute('aria-label', quieta ? 'Reanudar la animación' : 'Pausar la animación');
          btnPausa.innerHTML = icono(quieta ? 'reproducir' : 'pausa', 18);
        };
      }

      // Los pasos de la técnica. Vienen del catálogo y NO se inventan: si el
      // ejercicio no los tiene, se dice, y se ofrece escribirlos a mano.
      const zonaTecnica = $('#ej-tecnica', cuerpo);
      cat.pasosDe(m.nombre).then((pasos) => {
        if (!zonaTecnica.isConnected) return;
        if (pasos && pasos.length) {
          zonaTecnica.innerHTML =
            '<h3 class="ficha-titulo">Cómo se hace</h3><ol class="ej-pasos">' +
            pasos.map((t) => `<li>${esc(t)}</li>`).join('') +
            '</ol>';
        } else {
          zonaTecnica.innerHTML =
            '<h3 class="ficha-titulo">Cómo se hace</h3>' +
            '<p class="campo-nota">De este ejercicio no tengo los pasos. Escríbelos tú abajo, en «Mis notas de técnica».</p>';
        }
      });

      if (m.foto) {
        const img = document.createElement('img');
        img.src = urlDe(m.foto);
        img.alt = m.nombre;
        img.style.cssText = 'width:100%;border-radius:14px;max-height:230px;object-fit:cover';
        $('#ficha-foto', cuerpo).appendChild(img);
      }

      // gráfica de evolución (peso máximo por día)
      const sesionesPorId = mapa(S.cache.sesiones);
      const puntos = D.evolucionMaquina(seriesDe(maquinaId), m, sesionesPorId, 'dia').map((p) => ({
        etiqueta: p.etiqueta,
        valor: p.mejorPesoUnidad,
        enCurso: p.enCurso,
        extra: `${p.nSeries} serie${p.nSeries > 1 ? 's' : ''} · mejor × ${p.repsMejor}`,
      }));
      G.lineaTemporal($('#ficha-grafica', cuerpo), puntos, {
        unidad,
        titulo: `Evolución de ${m.nombre}`,
        vacio: 'Registra un par de series y aquí verás si subes o te estancas.',
      });

      // historial
      const hist = $('#historial', cuerpo);
      if (!ss.length) hist.innerHTML = '<p class="grafica-vacia">Sin series todavía.</p>';
      for (const s of ss.slice(0, 40)) {
        const ses = sesionesPorId.get(s.sesionId);
        const f = document.createElement('div');
        f.className = 'historial-fila';
        f.innerHTML = `
          <span class="historial-peso">${esc(D.formatearPeso(s.peso, unidad))} × ${esc(s.reps)}</span>
          <span class="historial-fecha">${new Date(s.fecha).toLocaleDateString('es-ES')}
            ${ses && ses.excluir ? '<span class="badge">flojo</span>' : ''}</span>
          <button class="boton-plano" data-borrar-serie="${s.id}" style="color:var(--mal)">Borrar</button>`;
        hist.appendChild(f);
      }
      $$('[data-borrar-serie]', hist).forEach(
        (b) =>
          (b.onclick = async () => {
            await db.borrar('series', b.dataset.borrarSerie);
            await recargar();
            cerrar();
            abrirFicha(maquinaId);
            pintar();
          })
      );

      // medios (chuleta guardada)
      const cm = $('#medios', cuerpo);
      const pintarMedios = async () => {
        const lista = await db.mediosDe(maquinaId);
        cm.innerHTML = '';
        for (const md of lista) {
          const d = document.createElement('div');
          d.className = 'medio';
          const et = (md.mime || '').startsWith('video') ? 'video' : 'img';
          d.innerHTML = `<${et} src="${urlDe(md.blob)}" ${et === 'video' ? 'controls playsinline' : ''}></${et}>
            <button class="medio-borrar" data-borrar-medio="${md.id}" aria-label="Borrar">×</button>`;
          cm.appendChild(d);
        }
        $$('[data-borrar-medio]', cm).forEach(
          (b) =>
            (b.onclick = async () => {
              await db.borrar('medios', b.dataset.borrarMedio);
              pintarMedios();
            })
        );
      };
      pintarMedios();

      const inputArchivo = $('#archivo-medio', cuerpo);
      $('#anadir-medio', cuerpo).onclick = () => inputArchivo.click();
      inputArchivo.onchange = async () => {
        const f = inputArchivo.files[0];
        if (!f) return;
        try {
          const esVideo = f.type.startsWith('video');
          const blob = esVideo ? f : await comprimir(f);
          await db.guardarMedio({ maquinaId, tipo: esVideo ? 'video' : 'foto', blob, mime: esVideo ? f.type : 'image/jpeg' });
          aviso('Guardado en la chuleta');
          pintarMedios();
        } catch (e) {
          aviso('No pude guardarlo: ' + e.message);
        }
      };

      $('#guardar-notas', cuerpo).onclick = async () => {
        m.notas = $('#notas', cuerpo).value;
        await db.guardar('maquinas', m);
        await recargar();
        aviso('Notas guardadas');
      };
      $('#editar-maq', cuerpo).onclick = () => {
        cerrar();
        editarMaquina(m.id);
      };
      $('#copiar-maq', cuerpo).onclick = () => {
        cerrar();
        copiarMaquina(m.id);
      };
    }
  );
}

/* ========================================================================== *
 * CREAR / EDITAR MÁQUINA
 * ========================================================================== */
/** «banca» → «Press de banca». Sin levantamiento, «nada». */
function nombreLevantamiento(id) {
  const l = INS.LEVANTAMIENTO_POR_ID.get(id);
  return l ? l.nombre : 'no cuenta para medallas';
}

function editarMaquina(maquinaId) {
  const m = maquinaId ? S.cache.maquinas.find((x) => x.id === maquinaId) : null;
  const gimnasios = S.cache.gimnasios;

  hoja(
    m ? 'Editar máquina' : 'Nueva máquina',
    `
    <div class="campo">
      <label for="f-nombre">Nombre</label>
      <input type="text" id="f-nombre" placeholder="Ej.: Elevaciones laterales en polea" value="${esc(m ? m.nombre : '')}">
    </div>
    <div class="campo">
      <label for="f-gym">Gimnasio</label>
      <select id="f-gym">${gimnasios
        .map((g) => `<option value="${g.id}" ${(m ? m.gimnasioId : S.gimnasioId) === g.id ? 'selected' : ''}>${esc(g.nombre)}</option>`)
        .join('')}</select>
    </div>
    <div class="campo-fila">
      <div class="campo">
        <label for="f-grupo">Grupo</label>
        <select id="f-grupo">${D.GRUPOS.map((g) => `<option value="${g.id}" ${m && m.grupo === g.id ? 'selected' : ''}>${g.nombre}</option>`).join(
          ''
        )}</select>
      </div>
      <div class="campo">
        <label for="f-tipo">Tipo</label>
        <select id="f-tipo">${D.TIPOS.map((t) => `<option value="${t.id}" ${m && m.tipo === t.id ? 'selected' : ''}>${t.nombre}</option>`).join(
          ''
        )}</select>
      </div>
    </div>
    <div class="campo-fila">
      <div class="campo">
        <label for="f-unidad">Unidad de la placa</label>
        <select id="f-unidad">
          <option value="kg" ${!m || m.unidad !== 'lb' ? 'selected' : ''}>Kilos (kg)</option>
          <option value="lb" ${m && m.unidad === 'lb' ? 'selected' : ''}>Libras (lb)</option>
        </select>
      </div>
      <div class="campo">
        <label for="f-inc">Salto del peso</label>
        <input type="number" id="f-inc" step="any" placeholder="2.5" value="${m && m.incremento ? m.incremento : ''}">
      </div>
    </div>
    <!-- QUÉ LEVANTAMIENTO ES, para las medallas.
         Carlos, 31-ago-2026: «con algunas máquinas si cumples los requisitos no
         lo detecta». La app lo adivina por el nombre y acierta casi siempre,
         pero «casi» no vale cuando lo que está en juego es una medalla: aquí se
         puede decir a mano, y lo dicho a mano gana. -->
    <div class="campo">
      <label for="f-lev">Cuenta como</label>
      <select id="f-lev">
        <option value="auto">Automático${m ? ` — ahora: ${esc(nombreLevantamiento(PF.levantamientoDe({ nombre: m.nombre })))}` : ''}</option>
        <option value="">Ninguno · no cuenta para medallas</option>
        ${INS.LEVANTAMIENTOS.map((l) => `<option value="${l.id}">${esc(l.nombre)}</option>`).join('')}
      </select>
      <p class="campo-nota">Solo sirve para las medallas de récord. Si tu press de banca
        se llama de otra forma, dilo aquí y empezará a contar.</p>
    </div>
    <div class="campo">
      <label>Foto de la máquina</label>
      <div id="previa" style="margin-bottom:8px"></div>
      <button class="boton boton-2" id="btn-foto" type="button">${icono('camara')} Hacer o elegir foto</button>
      <input type="file" id="f-foto" accept="image/*" capture="environment" class="oculto">
    </div>
    <button class="boton" id="f-guardar">${m ? 'Guardar cambios' : 'Crear máquina'}</button>
    ${m ? '<div class="botonera"><button class="boton boton-peligro" id="f-borrar">Borrar máquina</button></div>' : ''}`,
    (cuerpo, cerrar) => {
      // El `select` no se puede preseleccionar en el HTML porque hay que
      // distinguir «no lo he dicho» (auto) de «he dicho que ninguno» (''), y en
      // un atributo `selected` las dos cosas se escriben igual.
      $('#f-lev', cuerpo).value =
        m && m.levantamiento !== undefined && m.levantamiento !== null ? m.levantamiento : 'auto';

      let fotoBlob = m ? m.foto : null;
      const previa = $('#previa', cuerpo);
      const pintarPrevia = () => {
        previa.innerHTML = '';
        if (!fotoBlob) return;
        const img = document.createElement('img');
        img.src = urlDe(fotoBlob);
        img.style.cssText = 'width:100%;max-height:190px;object-fit:cover;border-radius:12px';
        previa.appendChild(img);
      };
      pintarPrevia();

      const inp = $('#f-foto', cuerpo);
      $('#btn-foto', cuerpo).onclick = () => inp.click();
      inp.onchange = async () => {
        const f = inp.files[0];
        if (!f) return;
        try {
          fotoBlob = await comprimir(f);
          pintarPrevia();
        } catch (e) {
          aviso('Foto no válida');
        }
      };

      $('#f-guardar', cuerpo).onclick = async () => {
        const nombre = $('#f-nombre', cuerpo).value.trim();
        if (!nombre) return aviso('Ponle un nombre');
        const datos = {
          ...(m || {}),
          nombre,
          gimnasioId: $('#f-gym', cuerpo).value,
          grupo: $('#f-grupo', cuerpo).value,
          tipo: $('#f-tipo', cuerpo).value,
          unidad: $('#f-unidad', cuerpo).value,
          incremento: Number($('#f-inc', cuerpo).value) || null,
          foto: fotoBlob,
          notas: m ? m.notas || '' : '',
        };
        const lev = $('#f-lev', cuerpo).value;
        // «Automático» se guarda BORRANDO el campo, no poniéndolo a null: el
        // campo ausente es lo que hace que la regla del nombre vuelva a mandar.
        if (lev === 'auto') delete datos.levantamiento;
        else datos.levantamiento = lev;
        await db.guardar('maquinas', datos);
        await recargar();
        cerrar();
        aviso(m ? 'Máquina actualizada' : 'Máquina creada');
        pintar();
        sync.sincronizar({ silencioso: true });
      };

      const bBorrar = $('#f-borrar', cuerpo);
      if (bBorrar)
        bBorrar.onclick = async () => {
          if (!await preguntar(`¿Borrar "${m.nombre}" y su historial?`)) return;
          for (const s of seriesDe(m.id)) await db.borrar('series', s.id);
          await db.borrar('maquinas', m.id);
          await recargar();
          cerrar();
          aviso('Máquina borrada');
          pintar();
        };
    }
  );
}

/** Añadido rápido: la misma máquina existe en otro gimnasio. */
function copiarMaquina(maquinaId) {
  const m = S.cache.maquinas.find((x) => x.id === maquinaId);
  const otros = S.cache.gimnasios.filter((g) => g.id !== m.gimnasioId);
  if (!otros.length) return aviso('Solo tienes un gimnasio');

  hoja(
    `Copiar "${m.nombre}"`,
    `
    <p style="color:var(--texto-2);margin-top:0">Se copia la ficha (foto, grupo, notas) pero <b>no el historial</b>:
    el peso de la misma máquina cambia de un gimnasio a otro, así que cada una lleva sus números.</p>
    <div class="campo">
      <label for="c-gym">¿A qué gimnasio?</label>
      <select id="c-gym">${otros.map((g) => `<option value="${g.id}">${esc(g.nombre)}</option>`).join('')}</select>
    </div>
    <div class="campo">
      <label for="c-unidad">Unidad en ese gimnasio</label>
      <select id="c-unidad">
        <option value="kg" ${m.unidad !== 'lb' ? 'selected' : ''}>Kilos (kg)</option>
        <option value="lb" ${m.unidad === 'lb' ? 'selected' : ''}>Libras (lb)</option>
      </select>
    </div>
    <button class="boton" id="c-ok">Copiar</button>`,
    (cuerpo, cerrar) => {
      $('#c-ok', cuerpo).onclick = async () => {
        const copia = { ...m };
        delete copia.id;
        delete copia.act;
        copia.gimnasioId = $('#c-gym', cuerpo).value;
        copia.unidad = $('#c-unidad', cuerpo).value;
        await db.guardar('maquinas', copia);
        await recargar();
        cerrar();
        aviso('Copiada');
        pintar();
      };
    }
  );
}

/* ========================================================================== *
 * VISTA: PROGRESO
 * ========================================================================== */
/**
 * Los rangos de tiempo de la vista de Progreso.
 *
 * Carlos, 31-jul-2026: *«me interesa que salga más la gráfica de la evolución
 * por máquinas en un periodo determinado de tiempo»*, y eligió **3 meses,
 * cambiable**. Así que el rango manda y la GRANULARIDAD se deduce de él: un
 * año por días son 300 puntos ilegibles, y un mes por meses es un solo punto.
 * Elegir dos cosas (rango y agrupación) para que solo una combinación tenga
 * sentido es cargarle a él una decisión que ya está tomada.
 */
const RANGOS = [
  { id: '1m', nombre: '1 mes', meses: 1, periodo: 'dia' },
  { id: '3m', nombre: '3 meses', meses: 3, periodo: 'semana' },
  { id: '6m', nombre: '6 meses', meses: 6, periodo: 'semana' },
  { id: '1a', nombre: '1 año', meses: 12, periodo: 'mes' },
  { id: 'todo', nombre: 'Todo', meses: 0, periodo: 'mes' },
];

function rangoActual() {
  return RANGOS.find((r) => r.id === (S.rango || '3m')) || RANGOS[1];
}

function pintarProgreso(raiz) {
  const rango = rangoActual();
  const ambito = S.ambito || 'gym';
  const desde = rango.meses ? D.isoDesplazado(new Date().toISOString(), { meses: -rango.meses }) : '';
  const enRango = (s) => !desde || s.fecha >= desde;

  raiz.innerHTML = `
    <div class="chips">
      ${RANGOS.map((r) => `<button class="chip" data-rango="${r.id}" aria-pressed="${rango.id === r.id}">${r.nombre}</button>`).join('')}
    </div>
    <div class="chips">
      <button class="chip" data-ambito="gym" aria-pressed="${ambito === 'gym'}">Este gimnasio</button>
      <button class="chip" data-ambito="todos" aria-pressed="${ambito === 'todos'}">Todos</button>
    </div>

    <h2 class="seccion-titulo">Evolución por máquina</h2>
    <button class="selector-linea" id="sel-maquina" aria-haspopup="dialog">
      <span class="sel-nombre">—</span>
      <span class="sel-pista">cambiar</span>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
    </button>
    <div id="g-maquina"></div>
    <div class="analisis" id="metricas"></div>

    <h2 class="seccion-titulo">Atención: estancadas</h2>
    <div id="estancadas"></div>

    <h2 class="seccion-titulo">De propina</h2>
    <div class="ficha">
      <div class="volumen-linea">
        <div>
          <div class="volumen-etiqueta">Peso total movido · ${rango.nombre.toLowerCase()}</div>
          <div class="volumen-valor" id="vol-total">—</div>
        </div>
        <button class="boton-plano" id="ver-volumen">Ver gráfica</button>
      </div>
      <p class="nut-media" style="margin:6px 0 0">Sube al hacer más series aunque no
        levantes más peso, así que sirve para ver si has entrenado mucho o poco —
        no para saber si progresas. Eso lo dice la gráfica de arriba.</p>
      <div class="oculto" id="g-volumen" style="margin-top:10px"></div>
    </div>`;

  const maquinas = ambito === 'gym' ? S.cache.maquinas.filter((m) => m.gimnasioId === S.gimnasioId) : S.cache.maquinas;
  const idsM = new Set(maquinas.map((m) => m.id));
  const series = S.cache.series.filter((s) => idsM.has(s.maquinaId) && enRango(s));
  const mPorId = mapa(S.cache.maquinas);
  const sesPorId = mapa(S.cache.sesiones);

  // --- evolución de una máquina concreta: LA PROTAGONISTA -------------------
  // Se ofrece primero la que MÁS historial tiene EN EL RANGO: es la que dice algo.
  const spm = seriesPorMaquina();
  const enRangoDe = (id) => (spm.get(id) || []).filter(enRango);
  const conDatos = maquinas
    .filter((m) => enRangoDe(m.id).length > 0)
    .sort((a, b) => enRangoDe(b.id).length - enRangoDe(a.id).length);
  // El selector de máquina era un <select> nativo: en Android lo pinta el
  // fabricante, así que ni respetaba el tema ni se parecía al resto de la app.
  // Ahora es un botón que enseña la máquina y abre una hoja con buscador — que
  // además hace falta, porque con 40 máquinas un desplegable no se navega.
  const sel = $('#sel-maquina', raiz);
  sel.disabled = !conDatos.length;

  const pintarMaquina = () => {
    const m = conDatos.find((x) => x.id === S.maquinaGrafica) || conDatos[0];
    $('.sel-nombre', sel).textContent = m ? m.nombre : '— sin datos en este periodo —';
    $('.sel-pista', sel).textContent = m ? `${enRangoDe(m.id).length} series · cambiar` : '';
    const caja = $('#g-maquina', raiz);
    const met = $('#metricas', raiz);
    if (!m) {
      G.lineaTemporal(caja, [], { vacio: `Nada apuntado en ${rango.nombre.toLowerCase()}. Prueba con un periodo más largo.` });
      met.innerHTML = '';
      return;
    }
    S.maquinaGrafica = m.id;
    const unidad = m.unidad || 'kg';
    const evo = D.evolucionMaquina(enRangoDe(m.id), m, sesPorId, rango.periodo);
    G.lineaTemporal(
      caja,
      evo.map((p) => ({
        etiqueta: p.etiqueta,
        valor: p.mejorPesoUnidad,
        enCurso: p.enCurso,
        extra: `${p.nSeries} ${p.nSeries === 1 ? 'serie' : 'series'} · mejor × ${p.repsMejor}`,
      })),
      { unidad, titulo: m.nombre }
    );

    // Las métricas hablan de ESTA máquina y de ESTE rango: antes hablaban de
    // volumen general, que es justo lo que él no quería mirar.
    const cerrados = evo.filter((p) => !p.enCurso);
    const primero = cerrados[0] || evo[0];
    const ultimo = evo[evo.length - 1];
    const mejor = evo.reduce((a, b) => (b.mejorPesoUnidad > a.mejorPesoUnidad ? b : a), evo[0]);
    // Con un solo punto NO hay diferencia que enseñar. Es la regla de la casa:
    // sin datos suficientes, «no lo sé» — no un 0 % que parece un estancamiento.
    const dif = cerrados.length >= 2 && primero.mejorPesoUnidad > 0
      ? ((ultimo.mejorPesoUnidad - primero.mejorPesoUnidad) / primero.mejorPesoUnidad) * 100
      : null;
    met.innerHTML = `
      <div class="metrica">
        <div class="metrica-etiqueta">Tu mejor peso</div>
        <div class="metrica-valor">${esc(D.formatearPeso(mejor.mejorPesoUnidad, unidad))}</div>
        <div class="metrica-pie">× ${mejor.repsMejor} · ${esc(mejor.etiqueta)}</div>
      </div>
      <div class="metrica">
        <div class="metrica-etiqueta">Desde ${esc(primero.etiqueta)}</div>
        <div class="metrica-valor">${
          dif === null
            ? '<span style="font-size:1rem;color:var(--texto-tenue)">aún no lo sé</span>'
            : `<span class="${dif >= 0 ? 'sube' : 'baja'}">${dif >= 0 ? '+' : ''}${dif.toFixed(1)}%</span>`
        }</div>
        <div class="metrica-pie">${dif === null ? 'hacen falta 2 periodos' : `de ${esc(D.formatearPeso(primero.mejorPesoUnidad, unidad))} a ${esc(D.formatearPeso(ultimo.mejorPesoUnidad, unidad))}`}</div>
      </div>
      <div class="metrica">
        <div class="metrica-etiqueta">Series apuntadas</div>
        <div class="metrica-valor">${evo.reduce((n, p) => n + p.nSeries, 0)}</div>
        <div class="metrica-pie">en ${evo.length} ${rango.periodo === 'dia' ? 'días' : rango.periodo === 'semana' ? 'semanas' : 'meses'}</div>
      </div>`;
  };
  sel.onclick = () => {
    if (!conDatos.length) return;
    hoja('¿Qué máquina?', `
      <input class="buscador" type="search" id="bm" placeholder="Buscar máquina…" autocomplete="off">
      <div class="hoja-lista" id="lm"></div>`, (cuerpo, cerrar) => {
      const lista = $('#lm', cuerpo);
      const pintarLista = (q = '') => {
        const filtro = quitarTildes(q.trim().toLowerCase());
        const vistas = conDatos.filter((m) => !filtro || quitarTildes(m.nombre.toLowerCase()).includes(filtro));
        lista.innerHTML = vistas.length
          ? vistas.map((m) => `<button class="hoja-op" data-m="${m.id}" aria-current="${m.id === S.maquinaGrafica}">
               <span>${esc(m.nombre)}<small>${enRangoDe(m.id).length} series en ${esc(rango.nombre.toLowerCase())}</small></span>
               ${m.id === S.maquinaGrafica ? icono('tic', 20) : ''}</button>`).join('')
          : '<p class="grafica-vacia">Ninguna con ese nombre.</p>';
        $$('[data-m]', lista).forEach((b) => (b.onclick = () => {
          S.maquinaGrafica = b.dataset.m;
          cerrar();
          pintarMaquina();
        }));
      };
      pintarLista();
      $('#bm', cuerpo).oninput = (e) => pintarLista(e.target.value);
    });
  };
  pintarMaquina();

  // --- estancadas ---
  const est = D.estancadas(maquinas, spm);
  const ce = $('#estancadas', raiz);
  ce.innerHTML = est.length
    ? ''
    : '<p class="grafica-vacia">Nada estancado. O eso, o todavía faltan datos.</p>';
  est.slice(0, 8).forEach((e, indice) => {
    const d = document.createElement('div');
    d.className = 'estancada';
    d.style.setProperty('--i', indice);
    d.innerHTML = `
      <div class="estancada-txt">
        <div class="estancada-nombre">${esc(e.maquina.nombre)}</div>
        <div class="estancada-det">Sigues en <b>${D.formatearPeso(e.mejorUnidad, e.unidad)}</b>
          desde hace ${e.semanas} semanas</div>
      </div>
      <span class="badge badge-estancada">${e.semanas} sem.</span>`;
    ce.appendChild(d);
  });

  // --- volumen: anecdótico. Un número, y la gráfica solo si la pide ---------
  const vol = D.evolucionVolumen(series, mPorId, sesPorId, rango.periodo);
  const total = vol.reduce((n, v) => n + v.volumen, 0);
  contarHasta($('#vol-total', raiz), Math.round(total), { sufijo: ' kg' });
  const btnVol = $('#ver-volumen', raiz);
  btnVol.onclick = () => {
    const caja = $('#g-volumen', raiz);
    const abierta = !caja.classList.contains('oculto');
    caja.classList.toggle('oculto', abierta);
    btnVol.textContent = abierta ? 'Ver gráfica' : 'Ocultar';
    // Se dibuja al ABRIR, no antes: dentro de un `.oculto` el hueco mide 0 y la
    // gráfica saldría de 0 px de ancho (el bug de la esfera invisible).
    if (!abierta) {
      G.barras(
        caja,
        vol.map((v) => ({ etiqueta: v.etiqueta, valor: v.volumen, enCurso: v.enCurso, extra: `${v.nSeries} series · ${v.nMaquinas} máquinas` })),
        { vacio: 'Apunta unas cuantas series y aquí verás la tendencia.' }
      );
    }
  };

  $$('[data-rango]', raiz).forEach((b) => (b.onclick = () => {
    S.rango = b.dataset.rango;
    pintar();
  }));
  $$('[data-ambito]', raiz).forEach((b) => (b.onclick = () => {
    S.ambito = b.dataset.ambito;
    pintar();
  }));
}

/* ========================================================================== *
 * TEMAS DE COLOR
 * ========================================================================== *
 * Tres de fábrica y todos los suyos.
 *
 * Carlos, 29-ago-2026: *«en el color personalizado, añade una opción de
 * personalización más amplia y más controlable para el usuario con la opción de
 * poder importa y exportar las diferentes personalizaciones»*.
 *
 * La aritmética de los temas vive en `temas.js` y se prueba con `node`. Aquí
 * solo está lo que toca el DOCUMENTO: aplicar, guardar y el estudio.
 *
 * POR QUÉ LAS VARIABLES SE QUITAN UNA A UNA AL CAMBIAR DE TEMA:
 * `style.cssText = ''` se llevaría por delante cualquier otro estilo en línea
 * de la raíz. Y dejar puesta una sola variable del tema anterior es peor que
 * no poner ninguna: el tema de fábrica saldría con el fondo de otro y nadie
 * entendería por qué.
 */
// Los colores de aquí son los MISMOS que los del CSS: la muestra de cada tema
// tiene que enseñar el tema de verdad, y `fondo` es además lo que se le pasa a
// Android para pintar su barra de estado.
const TEMAS = [
  { id: 'oscuro', nombre: 'Oscuro', fondo: '#0b0d11', borde: '#283039', acento: '#d2fa55', texto: '#f2f6fb' },
  { id: 'claro', nombre: 'Claro', fondo: '#f2f4f8', borde: '#dbe1ea', acento: '#4d7a00', texto: '#0d1117' },
  { id: 'rosa', nombre: 'Rosa', fondo: '#120810', borde: '#3f2434', acento: '#ff9ec7', texto: '#fdf1f7' },
];

/** El tema propio que está puesto ahora. Lee también el formato viejo. */
async function temaPropio() {
  return TEM.normalizar((await db.ajuste('tema_propio', null)) || {});
}

/** Los temas que Carlos ha guardado con nombre. */
async function temasGuardados() {
  const l = await db.ajuste('temas_propios', null);
  return Array.isArray(l) ? l.map((t) => TEM.normalizar(t)) : [];
}

async function guardarTemas(lista) {
  await db.ponAjuste('temas_propios', lista.map((t) => TEM.normalizar(t)));
}

// Todo lo que un tema propio puede escribir en la raíz. Se guarda para poder
// borrarlo entero después: si un día `variables()` devuelve una clave menos,
// la de antes se quedaría pegada para siempre.
let _varsPuestas = [];

/**
 * Pone el tema en el documento. `propio` solo pinta cuando el tema es el suyo:
 * si no, un acento en línea se quedaría pegado al cambiar a «Claro» y el tema
 * de fábrica saldría con el color de otro.
 */
let _finCruce = null;

/**
 * El cruce de colores al cambiar de tema.
 *
 * Se enciende SOLO al elegir un tema (un botón, un preset), nunca mientras se
 * arrastra un mando: con la transición puesta, la vista previa iría siempre
 * 260 ms por detrás del dedo y parecería que el mando no responde.
 */
function cruzarColores() {
  const raiz = document.documentElement;
  raiz.classList.add('cruzando');
  clearTimeout(_finCruce);
  _finCruce = setTimeout(() => raiz.classList.remove('cruzando'), 320);
}

function aplicarTema(id, propio, { suave = false } = {}) {
  const raiz = document.documentElement;
  if (suave) cruzarColores();
  raiz.dataset.tema = id;
  _varsPuestas.forEach((k) => raiz.style.removeProperty(k));
  _varsPuestas = [];
  raiz.style.removeProperty('font-size');

  let colorBarra;
  if (id !== 'propio') {
    raiz.removeAttribute('data-base');
    colorBarra = (TEMAS.find((x) => x.id === id) || TEMAS[0]).fondo;
  } else {
    const t = TEM.normalizar(propio || {});
    const vars = TEM.variables(t);
    raiz.dataset.base = t.base;
    Object.entries(vars).forEach(([k, v]) => raiz.style.setProperty(k, v));
    _varsPuestas = Object.keys(vars);
    // El tamaño de letra NO es una variable: es el `font-size` de la raíz, del
    // que cuelgan todos los `rem` de la app. Cambiarlo aquí escala la app
    // entera —espacios incluidos—, que es lo que se pide cuando se pide letra
    // más grande. Escalar solo la letra deja los botones igual de pequeños.
    raiz.style.setProperty('font-size', TEM.tamanoLetra(t));
    colorBarra = vars['--fondo'];
  }
  // La barra del sistema en Android coge este color; sin actualizarlo, el móvil
  // sigue enseñando una franja del tema anterior encima de la app.
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta && colorBarra) meta.content = colorBarra;
}

/** Pone un tema propio, lo guarda y lo deja como el elegido. */
async function ponerTemaPropio(tema) {
  const t = TEM.normalizar(tema);
  await db.ponAjuste('tema_propio', t);
  await db.ponAjuste('tema', 'propio');
  aplicarTema('propio', t, { suave: true });
  return t;
}

/* --------------------------------------------------------------------------
 * EL ESTUDIO DE TEMAS
 * ------------------------------------------------------------------------ *
 * Una hoja con vista previa VIVA: los mandos de arriba y, debajo, un trozo de
 * app de verdad —una tarjeta, una cifra, un botón, la pestaña activa— pintado
 * con el tema que se está tocando. Enseñar cuatro cuadraditos de color y
 * llamarlo vista previa es lo que hace que uno elija un tema y luego descubra
 * que los números no se leen.
 *
 * El tema se aplica AL DOCUMENTO mientras se arrastra el mando, no solo a la
 * vista previa. Es la única forma de ver si el color va bien con la barra, con
 * las sombras y con la foto de una máquina.
 * ------------------------------------------------------------------------ */
function estudioDeTemas(temaInicial, alSalir) {
  // El tema de antes, para poder devolverlo si se cierra sin guardar. Sin esto,
  // trastear con los mandos y arrepentirse deja la app de otro color.
  const eraTema = document.documentElement.dataset.tema || 'oscuro';
  let t = TEM.normalizar(temaInicial);
  let guardado = false;

  const mando = (id, etiqueta, min, max, valor, pista) => `
    <div class="mando">
      <label for="${id}">${esc(etiqueta)} <b id="${id}-v">${valor}</b></label>
      <input type="range" id="${id}" min="${min}" max="${max}" value="${valor}" step="1">
      <span class="mando-pista">${esc(pista)}</span>
    </div>`;

  const cerrar = hoja('Estudio de temas', `
    <div class="estudio">
      <div class="estudio-pegada">
      <div class="estudio-previa" id="e-previa">
        <div class="previa-barra"><span class="previa-punto"></span><b>GYM</b></div>
        <div class="previa-ficha">
          <span class="previa-eti">Press banca</span>
          <div class="previa-cifra"><b>82,5</b><span>kg × 8</span></div>
          <div class="previa-linea"><i style="width:72%"></i></div>
          <div class="previa-pie">
            <button class="previa-boton" type="button">Guardar serie</button>
            <span class="previa-chip">Récord</span>
          </div>
        </div>
        <div class="previa-nav">
          <span class="previa-tab activa">Entrenar</span>
          <span class="previa-tab">Progreso</span>
          <span class="previa-tab">Plan</span>
        </div>
      </div>
      </div>

      <div class="estudio-mandos">
        <div class="campo"><label for="e-nombre">Nombre del tema</label>
          <input type="text" id="e-nombre" maxlength="40" value="${esc(t.nombre)}" placeholder="El mío"></div>

        <div class="propio-fila">
          <label for="e-acento">Tu color</label>
          <input type="color" id="e-acento" value="${esc(t.acento)}">
        </div>

        <div class="chips" id="e-presets">
          ${TEM.PRESETS.map((p) => `
            <button class="chip chip-tema" data-preset="${esc(p.nombre)}"
              style="--muestra:${esc(p.acento)}"><i></i>${esc(p.nombre)}</button>`).join('')}
        </div>

        <div class="chips">
          <button class="chip" data-base="oscuro" aria-pressed="${t.base === 'oscuro'}">Sobre oscuro</button>
          <button class="chip" data-base="claro" aria-pressed="${t.base === 'claro'}">Sobre claro</button>
        </div>

        ${mando('e-intensidad', 'Fondo', 0, 100, t.intensidad, '')}
        ${mando('e-radio', 'Esquinas', 60, 140, t.radio, 'De cuadrado a muy redondo')}
        ${mando('e-escala', 'Tamaño de la letra', 90, 115, t.escala, 'Escala la app entera, no solo el texto')}

        <p class="estudio-avisos" id="e-avisos"></p>
        <p class="nut-media">Los colores de las <b>gráficas</b> no cambian: están elegidos
          para que se distingan también con daltonismo y con el móvil al sol.</p>
      </div>

      <div class="botonera">
        <button class="boton boton-2" id="e-copiar">Copiar código</button>
        <button class="boton boton-2" id="e-pegar">Pegar código</button>
      </div>
      <div class="botonera">
        <button class="boton boton-2" id="e-fichero">Exportar a fichero</button>
        <button class="boton boton-2" id="e-importar">Importar fichero</button>
        <input type="file" id="e-fich" accept="application/json,.json" hidden>
      </div>
      <div class="botonera">
        <button class="boton" id="e-guardar">Guardar y usar</button>
      </div>
    </div>`, (cuerpo, cerrarHoja) => {

    const previa = $('#e-previa', cuerpo);
    const refrescar = () => {
      const vars = TEM.variables(t);
      // A la vista previa se le ponen las variables encima: así enseña el tema
      // que se está tocando aunque el documento tarde un frame en pintarlo.
      Object.entries(vars).forEach(([k, v]) => previa.style.setProperty(k, v));
      aplicarTema('propio', t);
      const fuera = TEM.avisos(t);
      const zona = $('#e-avisos', cuerpo);
      zona.innerHTML = fuera.length
        ? fuera.map((a) => `<span class="aviso-tema">${esc(a)}</span>`).join('')
        : '<span class="aviso-tema ok">Se lee bien: contraste comprobado.</span>';
      $$('[data-base]', cuerpo).forEach((b) =>
        b.setAttribute('aria-pressed', String(b.dataset.base === t.base)));
      // La pista del fondo depende de la base: en claro no se va «a casi
      // negro», se va a casi blanco. Una pista que miente estorba más que
      // ninguna.
      $('#e-intensidad ~ .mando-pista', cuerpo).textContent = t.base === 'oscuro'
        ? 'De gris carbón a casi negro'
        : 'De blanco puro a gris papel';
    };

    const cambiar = (parte, suave = false) => {
      t = TEM.normalizar({ ...t, ...parte });
      if (suave) cruzarColores();
      refrescar();
    };

    $('#e-acento', cuerpo).oninput = (e) => cambiar({ acento: e.target.value });
    $('#e-nombre', cuerpo).oninput = (e) => { t.nombre = e.target.value.slice(0, 40); };
    $$('[data-base]', cuerpo).forEach((b) => (b.onclick = () => { tocar(); cambiar({ base: b.dataset.base }, true); }));
    $$('[data-preset]', cuerpo).forEach((b) => (b.onclick = () => {
      const p = TEM.PRESETS.find((x) => x.nombre === b.dataset.preset);
      if (!p) return;
      tocar();
      // Un preset trae color, base y fondo; las esquinas y la letra son de
      // Carlos y no se le tocan por elegir otro color.
      cambiar({ ...p, nombre: p.nombre, radio: t.radio, escala: t.escala }, true);
      $('#e-acento', cuerpo).value = t.acento;
      $('#e-nombre', cuerpo).value = t.nombre;
    }));

    [['e-intensidad', 'intensidad'], ['e-radio', 'radio'], ['e-escala', 'escala']].forEach(([id, clave]) => {
      const m = $(`#${id}`, cuerpo);
      m.oninput = () => {
        $(`#${id}-v`, cuerpo).textContent = m.value;
        cambiar({ [clave]: Number(m.value) });
      };
    });

    $('#e-copiar', cuerpo).onclick = async () => {
      const codigo = TEM.aCodigo(t);
      try {
        await navigator.clipboard.writeText(codigo);
        aviso('Código copiado: pégalo donde quieras');
      } catch {
        // Sin permiso de portapapeles el código no se pierde: se enseña para
        // poder copiarlo a mano. Un «no he podido» a secas sería inútil.
        prompt('Copia este código:', codigo);
      }
    };

    $('#e-pegar', cuerpo).onclick = async () => {
      let texto = '';
      try { texto = await navigator.clipboard.readText(); } catch { /* pedimos a mano */ }
      if (!texto) texto = prompt('Pega aquí el código del tema:') || '';
      if (!texto.trim()) return;
      try {
        const [primero] = TEM.deCodigo(texto);
        t = primero;
        $('#e-acento', cuerpo).value = t.acento;
        $('#e-nombre', cuerpo).value = t.nombre;
        $('#e-intensidad', cuerpo).value = t.intensidad;
        $('#e-intensidad-v', cuerpo).textContent = t.intensidad;
        $('#e-radio', cuerpo).value = t.radio;
        $('#e-radio-v', cuerpo).textContent = t.radio;
        $('#e-escala', cuerpo).value = t.escala;
        $('#e-escala-v', cuerpo).textContent = t.escala;
        refrescar();
        aviso(`Tema «${t.nombre}» cargado`);
      } catch (e) {
        aviso(`No pude leerlo: ${e.message}`, 3200);
      }
    };

    $('#e-fichero', cuerpo).onclick = async () => {
      const todos = await temasGuardados();
      const juntos = [t, ...todos.filter((x) => x.nombre !== t.nombre)];
      const blob = new Blob([TEM.aFichero(juntos)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `temas-gym-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      aviso(`Exportados ${juntos.length} temas`);
    };

    const fich = $('#e-fich', cuerpo);
    $('#e-importar', cuerpo).onclick = () => fich.click();
    fich.onchange = async () => {
      const f = fich.files && fich.files[0];
      if (!f) return;
      try {
        const temas = TEM.deCodigo(await f.text());
        const antes = await temasGuardados();
        // Se fusiona por nombre: importar dos veces el mismo fichero no deja
        // ocho copias de «Fuego» en la lista.
        const mapa = new Map(antes.map((x) => [x.nombre, x]));
        temas.forEach((x) => mapa.set(x.nombre, x));
        await guardarTemas([...mapa.values()]);
        t = temas[0];
        aviso(`Importados ${temas.length} temas`);
        guardado = true;
        await ponerTemaPropio(t);
        cerrarHoja();
        if (alSalir) alSalir();
      } catch (e) {
        aviso(`Ese fichero no vale: ${e.message}`, 3200);
      }
      fich.value = '';
    };

    $('#e-guardar', cuerpo).onclick = async () => {
      t.nombre = ($('#e-nombre', cuerpo).value || '').trim() || 'El mío';
      const lista = await temasGuardados();
      const i = lista.findIndex((x) => x.nombre === t.nombre);
      if (i >= 0) lista[i] = t; else lista.push(t);
      await guardarTemas(lista);
      await ponerTemaPropio(t);
      guardado = true;
      tocar(14);
      aviso(`Tema «${t.nombre}» guardado`);
      cerrarHoja();
      if (alSalir) alSalir();
    };

    refrescar();
  });

  // Cerrar sin guardar devuelve la app a como estaba. El navegador no avisa de
  // que una hoja se ha cerrado, así que se vigila con un observador del nodo.
  // La ÚLTIMA, no la primera: `querySelector` devolvería una hoja anterior si
  // hubiera dos abiertas, y entonces el observador vigilaría la que no es.
  const fondos = document.querySelectorAll('.hoja-fondo');
  const fondo = fondos[fondos.length - 1];
  if (fondo) {
    const obs = new MutationObserver(() => {
      if (document.body.contains(fondo)) return;
      obs.disconnect();
      if (!guardado) {
        aplicarTema(eraTema, eraTema === 'propio' ? temaInicial : null, { suave: true });
        if (alSalir) alSalir();
      }
    });
    obs.observe(document.body, { childList: true });
  }
  return cerrar;
}

/* ========================================================================== *
 * VISTA: GIMNASIOS
 * ========================================================================== */
function pintarGimnasios(raiz) {
  // BUSCAR GIMNASIOS DE LA APP.  Faltaba entero: solo se podía buscar uno
  // público durante la bienvenida, y quien ya la hubiera pasado no tenía forma
  // de encontrar el suyo nunca más. Y es lo que pidió Carlos: poder mirar la
  // gente, las máquinas y las rutinas de un gimnasio ANTES de apuntarse.
  raiz.innerHTML = `
    <div class="botonera" style="margin-bottom:var(--e3)">
      <button class="boton boton-2" id="gym-buscar-pub">${icono('lupa')} Buscar gimnasios</button>
    </div>
    <div class="lista" id="lista-gyms"></div>`;
  const cont = $('#lista-gyms', raiz);
  $('#gym-buscar-pub', raiz).onclick = () => buscarGimnasiosPublicos();
  if (!S.cache.gimnasios.length) cont.innerHTML = '<div class="vacio"><p>Sin gimnasios todavía.</p></div>';

  S.cache.gimnasios.forEach((g, indice) => {
    const nMaq = S.cache.maquinas.filter((m) => m.gimnasioId === g.id).length;
    const nSer = S.cache.series.filter((s) => s.gimnasioId === g.id).length;
    const aqui = g.id === S.gimnasioId;
    const d = document.createElement('div');
    d.className = `sitio ${aqui ? 'sitio-aqui' : ''}`;
    d.style.setProperty('--i', indice);
    d.innerHTML = `
      <button class="sitio-cuerpo" data-ir-gym="${g.id}">
        <span class="sitio-nombre">${esc(g.nombre)}</span>
        ${g.direccion ? `<span class="sitio-donde">${esc(g.direccion)}</span>` : ''}
        <span class="sitio-cifras">
          <span class="sitio-cifra"><b>${nMaq}</b> ${nMaq === 1 ? 'máquina' : 'máquinas'}</span>
          <span class="sitio-cifra"><b>${nSer.toLocaleString('es-ES')}</b> ${nSer === 1 ? 'serie' : 'series'}</span>
          ${aqui ? '<span class="badge badge-hecho">estás aquí</span>' : ''}
        </span>
      </button>
      <div class="sitio-botones">
        <button class="nut-editar" data-compartir-gym="${g.id}" ${nMaq ? '' : 'disabled'}
                aria-label="Compartir las máquinas de ${esc(g.nombre)}">${icono('enviar', 20)}</button>
        <button class="nut-editar" data-gente-gym="${g.id}"
                aria-label="Ver quién entrena en ${esc(g.nombre)}">${icono('gente', 20)}</button>
        <button class="nut-editar" data-editar-gym="${g.id}" aria-label="Editar ${esc(g.nombre)}">${icono('lapiz', 20)}</button>
      </div>`;
    cont.appendChild(d);
  });
  // Tocar la tarjeta cambia de gimnasio: es lo que se quiere hacer al llegar a
  // uno, y antes había que subir a la cabecera a buscarlo en el desplegable.
  $$('[data-ir-gym]', raiz).forEach((b) => (b.onclick = async () => {
    S.gimnasioId = b.dataset.irGym;
    await db.ponAjuste('ultimo_gym', S.gimnasioId);
    irA('entrenar');
  }));
  $$('[data-editar-gym]', raiz).forEach((b) => (b.onclick = () => editarGimnasio(b.dataset.editarGym)));
  // «El gym Manolo con las máquinas que ya ha añadido el chico»: es literalmente
  // el ejemplo que puso Carlos, y el sitio donde uno lo busca es la ficha del
  // gimnasio, no un menú aparte.
  $$('[data-compartir-gym]', raiz).forEach((b) => (b.onclick = () => compartirGimnasio(b.dataset.compartirGym)));
  // «Ver al resto de miembros, sus records en las máquinas del gym,
  // clasificaciones» (Carlos, 31-ago-2026). Se llega desde la ficha del
  // gimnasio, que es donde uno lo busca.
  $$('[data-gente-gym]', raiz).forEach((b) => (b.onclick = () =>
    abrirGimnasioSocial(S.cache.gimnasios.find((x) => x.id === b.dataset.genteGym))));
}

function editarGimnasio(gimnasioId, dePartida = {}) {
  const g = gimnasioId ? S.cache.gimnasios.find((x) => x.id === gimnasioId) : null;
  // `dePartida` es lo que ya se había escrito en otra pantalla (el buscador de
  // gimnasios de la app). Volver a teclear el nombre que acabas de escribir es
  // justo la clase de cosa que hace que una app parezca que no te escucha.
  hoja(
    g ? 'Editar gimnasio' : 'Nuevo gimnasio',
    `
    <div class="campo"><label for="g-nombre">Nombre</label>
      <input type="text" id="g-nombre" placeholder="Ej.: VivaGym Reus" value="${
        esc(g ? g.nombre : (dePartida.nombre || ''))}"></div>
    <div class="campo"><label for="g-dir">Dirección</label>
      <input type="text" id="g-dir" placeholder="Calle, número, ciudad" value="${
        esc(g ? g.direccion || '' : (dePartida.direccion || ''))}"></div>
    <!-- El orden importa: lo que sale al escribir va PEGADO a lo que escribes,
         y el mapa justo debajo. Antes entre la caja y sus resultados había un
         botón y un párrafo de cinco líneas, así que las coincidencias
         aparecían fuera de la pantalla y parecía que no salía nada. -->
    <div id="g-resultados" style="margin-top:8px"></div>
    <div id="g-mapa" style="margin-top:8px"></div>
    <p style="font-size:.8rem;color:var(--texto-tenue);margin:8px 2px 0">
      Vale el nombre («El Corte Inglés Diagonal») o la calle; con el código
      postal lo clava. Lo que dejes en el centro del mapa es lo que se guarda.</p>
    <button class="boton boton-2" id="g-buscar" type="button"
            style="margin-top:8px">${icono('lupa')} Buscar más a fondo</button>
    <button class="boton" id="g-guardar" style="margin-top:12px">${g ? 'Guardar' : 'Crear'}</button>
    ${g ? '<div class="botonera"><button class="boton boton-peligro" id="g-borrar">Borrar gimnasio</button></div>' : ''}`,
    (cuerpo, cerrar) => {
      // ── mapa: confirmar que la dirección es la buena ──────────────────────
      let elegido = (g && Number.isFinite(g.lat)) ? { lat: g.lat, lon: g.lon } : null;
      const cajaMapa = $('#g-mapa', cuerpo);
      const cajaRes = $('#g-resultados', cuerpo);
      // Arrastrar el mapa CAMBIA lo que se guarda. Es lo que hace que sirva de
      // algo: si el buscador te deja en la acera de enfrente, lo corriges tú.
      // `centro` es solo POR DÓNDE SE ABRE el mapa cuando aún no hay
      // coordenadas: el último gimnasio con dirección conocida, que casi
      // siempre está en la misma ciudad. No es un dato del gimnasio nuevo y no
      // se guarda: `alMover` solo salta cuando se fija el sitio de verdad.
      const cerca = S.cache.gimnasios.find((x) => Number.isFinite(x.lat)
        && Number.isFinite(x.lon) && !(Math.abs(x.lat) < 0.01 && Math.abs(x.lon) < 0.01));
      // Lo que se vuelve a preguntar en cuanto se sabe dónde estás. Se rellena
      // más abajo (necesita las cajas y el reloj) y se declara AQUÍ, antes de
      // `verMapa`, porque un `let` leído antes de su línea revienta con un
      // ReferenceError en vez de valer `undefined`.
      let repetirBusqueda = null;
      const verMapa = (la, lo) => geo.pintarMapa(cajaMapa, la, lo, {
        centro: cerca ? { lat: cerca.lat, lon: cerca.lon } : null,
        alMover: (nLa, nLo) => {
          elegido = { lat: nLa, lon: nLo };
          /* Y AHORA YA SABEMOS DESDE DÓNDE BUSCAR.  (3-sep-2026)
           *
           * La captura de Carlos: el mapa ya centrado en su calle de Reus —con
           * un gimnasio VISIBLE en el propio mapa— y encima el mensaje «No
           * encuentro ese sitio», que era el de la búsqueda de ANTES, cuando el
           * móvil todavía no sabía dónde estaba. La respuesta se quedaba
           * congelada en pantalla contradiciendo al mapa de debajo.
           *
           * El setup ya repetía la búsqueda al llegar la ubicación (0.24.0);
           * esta hoja, no. Mismas palabras, otro orden, y ahora con Overpass —
           * que sin un punto de partida no se puede ni preguntar. */
          if (repetirBusqueda) repetirBusqueda();
        },
      });
      // EL MAPA SALE DESDE EL PRINCIPIO, aunque no haya coordenadas. Antes este
      // hueco estaba vacío hasta que una búsqueda saliera bien, y si el
      // buscador no encontraba la calle no había NINGUNA forma de poner el
      // gimnasio en el sitio. Ahora sale el botón de «usar mi ubicación», que
      // es la salida honrada: estás dentro del gimnasio cuando lo das de alta.
      verMapa(elegido ? elegido.lat : NaN, elegido ? elegido.lon : NaN);

      /** Pinta una lista de sitios del mapa. Devuelve cuántos ha pintado. */
      const pintarSitios = (res) => {
        cajaRes.innerHTML = '';
        const lista = document.createElement('div');
        lista.className = 'lista-elegible';
        for (const r of res) {
          const b = document.createElement('button');
          b.type = 'button';
          // `fila-elegible` y no `sitio`: `sitio` es la TARJETA de un gimnasio
          // tuyo (rejilla con cifras) y aquí dejaba el nombre en una columna
          // estrecha partido en tres líneas. Esto es una fila de elegir, que es
          // lo que ya usan las demás listas de la app.
          b.className = 'pf-elegible fila-elegible';
          // Se enseña la dirección COMPLETA a propósito: es la única forma de
          // que Carlos detecte que el sitio propuesto es del pueblo de al lado.
          // Un sitio que está a 200 m y una calle que existe en algún sitio no
          // son lo mismo, y quien elige tiene que poder distinguirlos.
          const cerca = r.deCerca && Number.isFinite(r.metros)
            ? `<span class="chip-cerca">${r.metros < 1000
                ? `a ${r.metros} m` : `a ${(r.metros / 1000).toFixed(1)} km`}</span>`
            : '';
          b.innerHTML = `<span class="fila-elegible-t">${esc(r.titulo)}${cerca}</span>`
            + `<span class="fila-elegible-s">${esc(r.completa || r.direccion)}</span>`;
          b.onclick = () => {
            elegido = { lat: r.lat, lon: r.lon };
            $('#g-dir', cuerpo).value = r.completa || r.direccion;
            $$('.fila-elegible', cajaRes).forEach((x) => x.setAttribute('aria-pressed', x === b));
            verMapa(r.lat, r.lon);
          };
          lista.appendChild(b);
        }
        cajaRes.appendChild(lista);
        return res.length;
      };

      /** Qué decir cuando no sale nada, que no es siempre lo mismo. */
      const nadaQueEnsenar = () => {
        const fallo = geo.ultimoFallo();
        cajaRes.innerHTML = `<p class="mapa-vacio">${esc(fallo
          ? `${fallo}. Escribe la dirección a mano y coloca el mapa con «usar mi ubicación»: `
            + 'el gimnasio se guarda igual.'
          : 'No encuentro ese sitio. Prueba con la calle y el código postal, o pon el '
            + 'mapa donde estás y arrástralo hasta la puerta.')}</p>`;
      };

      // BUSCAR A FONDO (el botón): la cascada entera, que prueba de lo concreto
      // a lo general. Tarda más y por eso no se dispara sola al teclear.
      $('#g-buscar', cuerpo).onclick = async () => {
        const nombre = $('#g-nombre', cuerpo).value.trim();
        const dir = $('#g-dir', cuerpo).value.trim();
        if (!nombre && !dir) return aviso('Escribe el nombre o la dirección');

        cajaRes.innerHTML = '<p class="mapa-vacio">Buscando…</p>';
        const res = await geo.buscarGimnasio(nombre, dir);
        if (!pintarSitios(res)) return nadaQueEnsenar();
        // Si solo hay uno, se elige solo: un toque menos.
        if (res.length === 1) $('.fila-elegible', cajaRes).click();
      };

      /* --------------------------------------------------------------------
       * SUGERENCIAS AL ESCRIBIR, COMO UN MAPA DE VERDAD  (1-sep-2026)
       *
       * Carlos: *«que tú no puedas poner la dirección manualmente y veas que te
       * vayan saliendo diferentes opciones no tiene sentido»*. Lo que había
       * disparaba la CASCADA completa (hasta cinco búsquedas con 1,1 s de
       * espera entre ellas) y solo desde la caja de la dirección, y con cinco
       * letras mínimo. Desde una caja de texto eso es una pantalla quieta
       * durante ocho segundos: parece que no hace nada.
       *
       * Ahora es un solo tiro de texto libre con lo que haya escrito en las DOS
       * cajas —el nombre también: «El Corte Inglés Diagonal» es un sitio, no
       * una calle— y se aborta la anterior en cuanto llega otra tecla.
       * ------------------------------------------------------------------ */
      let relojDir = null;
      /**
       * QUÉ SE BUSCA: LO QUE ESTÁS ESCRIBIENDO, NO LAS DOS CAJAS PEGADAS.
       *
       * (2-sep-2026) Esto juntaba nombre y dirección con un espacio. En la
       * captura de Carlos eso era «Viva gym reus Viva gym», que no es un sitio
       * de ningún mapa del mundo, y por eso salía «no encuentro ese sitio»
       * mientras las dos cajas por separado sí tenían sentido. Ahora se busca
       * la caja en la que se está escribiendo, como en cualquier buscador de
       * mapas, y si esa está vacía se prueba la otra.
       */
      const sugerirAhora = (cual) => {
        const nom = $('#g-nombre', cuerpo).value.trim();
        const dir = $('#g-dir', cuerpo).value.trim();
        const texto = cual === 'nombre' ? (nom || dir)
          : cual === 'dir' ? (dir || nom)
            : (dir || nom);
        if (texto.length < 3) { cajaRes.innerHTML = ''; return; }
        clearTimeout(relojDir);
        // 400 ms: lo justo para no disparar en cada tecla. La política de
        // Nominatim pide un tiro por segundo y esto es UNO por pausa, no la
        // cascada de cinco que había antes.
        relojDir = setTimeout(async () => {
          cajaRes.innerHTML = '<p class="mapa-vacio">Buscando…</p>';
          const res = await geo.sugerir(texto, 6);
          if (!res.length) return nadaQueEnsenar();
          pintarSitios(res);
        }, 400);
      };
      $('#g-dir', cuerpo).oninput = () => sugerirAhora('dir');
      $('#g-nombre', cuerpo).oninput = () => sugerirAhora('nombre');
      // Se busca la caja que tenga algo escrito, igual que al teclear.
      repetirBusqueda = () => {
        const nom = $('#g-nombre', cuerpo).value.trim();
        const dir = $('#g-dir', cuerpo).value.trim();
        if ((nom + dir).length < 3) return;
        sugerirAhora(dir.length >= 3 ? 'dir' : 'nombre');
      };
      // Si se llega aquí con el nombre ya escrito (desde el buscador de
      // gimnasios de la app), se busca solo: lo que quiere quien acaba de
      // escribirlo es ver dónde está, no volver a tocar la caja.
      if (!g && (dePartida.nombre || dePartida.direccion)) sugerirAhora();

      /* Y SE PREGUNTA DÓNDE ESTÁS NADA MÁS ABRIR.  (0.30.0)
       *
       * Sin esto, la primera búsqueda sale a ciegas siempre: escribir en una
       * caja no es pulsar el botón de la ubicación ni arrastrar el mapa, que
       * eran las dos únicas formas de que la app supiera desde dónde preguntar.
       * No bloquea nada y no mueve el mapa —mover el mapa es elegir un sitio y
       * eso lo decide Carlos—; solo deja puesto el punto de partida y repite lo
       * que ya se hubiera preguntado. */
      geo.situarme().then((sabido) => {
        if (sabido && cuerpo.isConnected) repetirBusqueda();
      });


      $('#g-guardar', cuerpo).onclick = async () => {
        const nombre = $('#g-nombre', cuerpo).value.trim();
        if (!nombre) return aviso('Ponle un nombre');
        const nuevo = await db.guardar('gimnasios', {
          ...(g || {}),
          nombre,
          direccion: $('#g-dir', cuerpo).value.trim(),
          lat: elegido ? elegido.lat : (g ? g.lat : null),
          lon: elegido ? elegido.lon : (g ? g.lon : null),
        });
        if (!g) {
          S.gimnasioId = nuevo.id;
          await db.ponAjuste('ultimo_gym', nuevo.id);
        }
        await recargar();
        cerrar();
        aviso('Guardado');
        pintar();
        sync.sincronizar({ silencioso: true });
      };
      const bb = $('#g-borrar', cuerpo);
      if (bb)
        bb.onclick = async () => {
          const nMaq = S.cache.maquinas.filter((m) => m.gimnasioId === g.id).length;
          if (!await preguntar(`¿Borrar "${g.nombre}" con sus ${nMaq} máquinas y su historial?`)) return;
          for (const m of S.cache.maquinas.filter((x) => x.gimnasioId === g.id)) {
            for (const s of seriesDe(m.id)) await db.borrar('series', s.id);
            await db.borrar('maquinas', m.id);
          }
          await db.borrar('gimnasios', g.id);
          S.gimnasioId = null;
          await recargar();
          cerrar();
          pintar();
        };
    }
  );
}

/* ========================================================================== *
 * VISTA: AJUSTES
 * ========================================================================== */
/* ========================================================================== *
 * VISTA: NUTRICIÓN — calorías y macros del día
 *
 * Primera entrega del apartado que pidió Carlos. Mismo principio que el resto
 * de la app: apuntar tiene que costar DOS toques, si no, no se usa. Por eso lo
 * primero que se ve al añadir es lo que ya comió otras veces, no un formulario.
 * ========================================================================== */
function objetivoActual() {
  return S.cache.objetivos[0] || N.OBJETIVO_POR_DEFECTO;
}

function comidasDe(fecha) {
  return S.cache.comidas.filter((c) => (c.fecha || '').slice(0, 10) === fecha);
}

/** Barra de un macro: consumido / objetivo, con el sobrante marcado. */
/**
 * Las calorías del día, dibujadas SOBRE su objetivo.
 *
 * Un «1.240 kcal» suelto no dice nada: no se sabe si vas corto o pasado sin
 * hacer la resta mentalmente. El anillo enseña el número dentro de su rango, y
 * el umbral que se dibuja es EL MISMO con el que se avisa de que te has pasado.
 * Si se separaran, lo que se ve y lo que dice el texto dejarían de coincidir.
 *
 * El aro que sobresale se pinta en ámbar y además el texto lo dice: el color
 * nunca es el único indicador.
 */
function anilloKcal(consumido, objetivo) {
  const R = 52;
  const C = 2 * Math.PI * R;
  const pct = objetivo > 0 ? consumido / objetivo : 0;
  const dentro = Math.min(pct, 1);
  const pasado = Math.max(0, Math.min(pct - 1, 1));
  // El aro se pinta VACÍO y se llena en cuanto está en pantalla: el dato es
  // «cuánto llevas de lo tuyo», y verlo llegar cuenta esa historia. Aparecer ya
  // hecho no cuenta nada. El relleno lo hace una transición de CSS sobre
  // `stroke-dashoffset`, que no obliga a recalcular la página en cada cuadro.
  return `
    <div class="anillo ${pct > 1 ? 'anillo-pasado' : ''}">
      <svg viewBox="0 0 128 128" aria-hidden="true">
        <circle class="anillo-carril" cx="64" cy="64" r="${R}" />
        <circle class="anillo-relleno" cx="64" cy="64" r="${R}"
          stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${C.toFixed(1)}"
          data-hasta="${(C * (1 - dentro)).toFixed(1)}" />
        ${pasado > 0
          ? `<circle class="anillo-exceso" cx="64" cy="64" r="${R}"
               stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${C.toFixed(1)}"
               data-hasta="${(C * (1 - pasado)).toFixed(1)}" />`
          : ''}
      </svg>
      <div class="anillo-centro">
        <span class="nut-kcal" data-contar="${consumido}">0</span>
        <span class="nut-kcal-obj">de ${objetivo.toLocaleString('es-ES')} kcal</span>
      </div>
    </div>`;
}

/**
 * Arranca lo que tiene que moverse al pintar una pantalla: los aros se llenan y
 * las cifras de titular suben contando.
 *
 * Va en un `requestAnimationFrame` porque si se cambia el valor en el mismo
 * fotograma en que se inserta el elemento, el navegador no ve ningún cambio que
 * animar: pinta directamente el estado final. Es el fallo clásico de las
 * transiciones que «no funcionan».
 */
function animarEntrada(raiz = document) {
  requestAnimationFrame(() => {
    raiz.querySelectorAll('[data-hasta]').forEach((c) => {
      c.style.strokeDashoffset = c.dataset.hasta;
    });
    raiz.querySelectorAll('[data-contar]').forEach((el) => {
      contarHasta(el, Number(el.dataset.contar) || 0);
    });
  });
}

function barraMacro(etiqueta, consumido, objetivo, unidad, clase) {
  const pct = N.porcentaje(consumido, objetivo);
  const pasado = pct > 100;
  return `
    <div class="macro">
      <div class="macro-fila">
        <span class="macro-nombre">${etiqueta}</span>
        <span class="macro-cifra ${pasado ? 'macro-pasado' : ''}">${consumido}<span class="macro-obj"> / ${objetivo} ${unidad}</span></span>
      </div>
      <div class="macro-barra"><i class="${clase} ${pasado ? 'macro-relleno-pasado' : ''}"
        style="width:${Math.min(pct, 100)}%"></i></div>
    </div>`;
}

/**
 * Días con algo apuntado, seguidos hacia atrás desde hoy.
 *
 * La racha la tienen Yazio y Cronometer y funciona: lo que sostiene un diario de
 * comidas no es la fuerza de voluntad, es no querer romper el número. Se cuenta
 * desde AYER si hoy todavía está vacío — a las 8 de la mañana nadie ha apuntado
 * nada y decirle que ha perdido la racha sería mentira y encima desmotivador.
 */
function rachaDeDias(comidas, hoy) {
  const dias = new Set((comidas || []).map((c) => (c.fecha || '').slice(0, 10)));
  const menos = (f, n) => {
    const d = new Date(`${f}T12:00:00`);
    d.setDate(d.getDate() - n);
    return d.toISOString().slice(0, 10);
  };
  let n = 0;
  let i = dias.has(hoy) ? 0 : 1;
  while (dias.has(menos(hoy, i))) { n++; i++; }
  return n;
}

/** Cómo se lee una fecha en la cabecera: «hoy», «ayer» o «mié, 22 jul». */
function fechaEnCristiano(fecha, hoy) {
  if (fecha === hoy) return 'hoy';
  const d = new Date(`${fecha}T12:00:00`);
  const h = new Date(`${hoy}T12:00:00`);
  const dif = Math.round((h - d) / 86400000);
  if (dif === 1) return 'ayer';
  if (dif === -1) return 'mañana';
  return d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
}

async function pintarNutricion(raiz) {
  const hoy = N.HOY();
  // El día que se está mirando. Hasta ahora SOLO se podía apuntar en el de hoy:
  // si Carlos cenaba y se acordaba de apuntarlo por la mañana, ya no había
  // manera de meterlo en su sitio. Es la primera cosa que tiene cualquier app de
  // nutrición y aquí no estaba.
  const fecha = S.nutFecha || hoy;
  const obj = objetivoActual();
  const hoyComidas = comidasDe(fecha);
  const t = N.total(hoyComidas);
  const falta = N.restante(obj, t);
  const serie = N.ultimosDias(S.cache.comidas, 7, hoy);
  const media = N.mediaDiaria(serie);
  const maxSerie = Math.max(obj.kcal || 0, ...serie.map((d) => d.kcal), 1);
  const racha = rachaDeDias(S.cache.comidas, hoy);

  raiz.innerHTML = `
    <div class="nut-dias">
      <button class="boton-plano nut-dia-nav" id="n-ayer" aria-label="Día anterior">${icono('izquierda', 18)}</button>
      <button class="boton-plano nut-dia-hoy" id="n-hoy-btn">${esc(fechaEnCristiano(fecha, hoy))}</button>
      <button class="boton-plano nut-dia-nav" id="n-manana" aria-label="Día siguiente"
        ${fecha >= hoy ? 'disabled' : ''}>${icono('derecha', 18)}</button>
    </div>
    <div class="nut-cabecera">
      <button class="boton-plano nut-objetivo-btn" id="n-objetivo">Objetivo</button>
      ${anilloKcal(t.kcal, obj.kcal)}
      <div class="nut-restante ${falta.kcal < 0 ? 'nut-pasado' : ''}">
        ${falta.kcal >= 0 ? `Te quedan <b>${falta.kcal}</b> kcal` : `Te has pasado <b>${Math.abs(falta.kcal)}</b> kcal`}
      </div>
      <div class="macro-lista">
        ${barraMacro('Proteína', t.prot, obj.prot, 'g', 'macro-prot')}
        ${barraMacro('Carbohidratos', t.carb, obj.carb, 'g', 'macro-carb')}
        ${barraMacro('Grasas', t.gras, obj.gras, 'g', 'macro-gras')}
      </div>
    </div>

    <div class="nut-acciones">
      <button class="boton" id="n-foto">${icono('camara')} Foto del plato</button>
      <button class="boton boton-2" id="n-anadir">+ A mano</button>
    </div>
    <div id="n-repetir"></div>
    <div id="n-platos-rapidos"></div>

    <div id="n-lista"></div>

    <div class="ficha" id="n-ficha-peso"></div>

    <div class="ficha">
      <h3 class="ficha-titulo">Últimos 7 días</h3>
      <div class="nut-semana">
        ${serie
          .map((d) => {
            const alto = Math.round((d.kcal / maxSerie) * 100);
            const esHoy = d.fecha === hoy;
            const dia = new Date(`${d.fecha}T12:00:00`).toLocaleDateString('es-ES', { weekday: 'narrow' });
            return `<div class="nut-dia" title="${d.fecha}: ${d.kcal} kcal">
                      <div class="nut-columna"><i style="height:${Math.max(alto, 2)}%"
                        class="${esHoy ? 'nut-hoy' : ''}"></i></div>
                      <span class="nut-dia-letra">${esc(dia)}</span>
                    </div>`;
          })
          .join('')}
      </div>
      <p class="nut-media">${
        media === null
          ? 'Todavía no hay días registrados.'
          : `Media de los días registrados: <b>${media} kcal</b>`
      }${racha >= 2 ? ` · <b>${racha} días seguidos</b> apuntando` : ''}</p>
    </div>`;

  // --- lista del día, agrupada por momento ---
  const lista = $('#n-lista', raiz);
  const grupos = N.porMomento(hoyComidas, S.cache.momentos);
  if (!grupos.length) {
    lista.innerHTML = `<div class="vacio">
      <span class="vacio-icono">${icono('carro', 34)}</span>
      <p>${fecha === hoy ? 'Hoy no has apuntado nada todavía.' : 'Ese día no apuntaste nada.'}<br>
        <small>Lo que añadas queda guardado en el móvil y se sincroniza con el PC.</small></p>
      <button class="boton" id="n-vacio-anadir">Apuntar la primera comida</button>
    </div>`;
    const bv = $('#n-vacio-anadir', lista);
    if (bv) bv.onclick = () => abrirAnadirComida(fecha);
  } else {
    lista.innerHTML = grupos
      .map(
        (g) => `
        <div class="ficha">
          <h3 class="ficha-titulo">${esc(g.nombre)}
            <span class="nut-grupo-kcal">${g.total.kcal} kcal</span></h3>
          ${g.comidas
            .map((c) => {
              const a = S.cache.alimentos.find((x) => x.id === c.alimentoId);
              const medida = c.unidad === 'ud' ? N.nombreUd(a, c.cantidad) : (c.unidad || 'g');
              // La línea entera es un botón: tocarla abre la corrección. Antes
              // solo se podía BORRAR y volver a apuntar, y con eso se perdía el
              // momento del día y había que buscar el alimento otra vez.
              return `<div class="nut-item">
                  <button class="nut-item-txt nut-item-editar" data-editar-comida="${c.id}">
                    <div class="nut-item-nombre">${esc(c.nombre)}</div>
                    <div class="nut-item-det">${esc(c.cantidad)} ${esc(medida)} ·
                      P ${c.prot} · C ${c.carb} · G ${c.gras}</div>
                  </button>
                  <div class="nut-item-kcal">${c.kcal}</div>
                  <button class="boton-plano nut-quitar" data-quitar="${c.id}"
                    aria-label="Quitar ${esc(c.nombre)}">${icono('cerrar', 18)}</button>
                </div>`;
            })
            .join('')}
        </div>`
      )
      .join('');
  }

  $$('[data-quitar]', raiz).forEach((b) => (b.onclick = async () => {
    await db.borrar('comidas', b.dataset.quitar);
    await recargar();
    pintar();
    sync.sincronizar({ silencioso: true });
  }));
  $$('[data-editar-comida]', raiz).forEach((b) => (b.onclick = () =>
    editarComidaApuntada(S.cache.comidas.find((c) => c.id === b.dataset.editarComida))));

  const irA = (f) => { S.nutFecha = f; pintar(); };
  const mover = (n) => {
    const d = new Date(`${fecha}T12:00:00`);
    d.setDate(d.getDate() + n);
    const nueva = d.toISOString().slice(0, 10);
    // Al futuro no se va: apuntar la cena de pasado mañana no significa nada.
    if (nueva <= hoy) irA(nueva);
  };
  $('#n-ayer', raiz).onclick = () => mover(-1);
  $('#n-manana', raiz).onclick = () => mover(1);
  $('#n-hoy-btn', raiz).onclick = () => irA(hoy);

  $('#n-anadir', raiz).onclick = () => abrirAnadirComida(fecha);
  $('#n-objetivo', raiz).onclick = abrirObjetivo;
  $('#n-foto', raiz).onclick = () => abrirFoto(fecha);

  pintarRepetir($('#n-repetir', raiz), fecha);
  pintarPlatosRapidos($('#n-platos-rapidos', raiz), fecha);
  pintarFichaPeso($('#n-ficha-peso', raiz));
}

/**
 * «Lo de siempre»: los últimos alimentos distintos, con su cantidad de la última
 * vez, para apuntarlos de UN toque.
 *
 * Es la función más usada de MyFitnessPal y de Yazio, y con razón: casi todo lo
 * que uno come lo ha comido ya. Sin esto, apuntar el desayuno de todos los días
 * eran cuatro búsquedas idénticas cada mañana.
 */
function pintarRepetir(zona, fecha) {
  if (!zona) return;
  const yaHoy = new Set(comidasDe(fecha).map((c) => `${c.alimentoId}`));
  const vistos = new Map();
  // De lo más reciente a lo más viejo, quedándose con la primera aparición: esa
  // es la última cantidad que usó, que es la que va a volver a usar.
  for (const c of [...S.cache.comidas].sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''))) {
    if (!c.alimentoId || vistos.has(c.alimentoId) || yaHoy.has(`${c.alimentoId}`)) continue;
    if (!S.cache.alimentos.some((a) => a.id === c.alimentoId && !a.del)) continue;
    vistos.set(c.alimentoId, c);
    if (vistos.size >= 8) break;
  }
  if (!vistos.size) { zona.innerHTML = ''; return; }

  zona.innerHTML = `<h3 class="nut-repetir-titulo">Lo de siempre</h3>
    <div class="platos-fila">${[...vistos.values()].map((c) => {
      const a = S.cache.alimentos.find((x) => x.id === c.alimentoId);
      const medida = c.unidad === 'ud' ? N.nombreUd(a, c.cantidad) : (c.unidad || 'g');
      return `<button class="plato-chip" data-rep="${c.id}">
        ${esc(c.nombre)} <small>${esc(c.cantidad)} ${esc(medida)}</small></button>`;
    }).join('')}</div>`;

  $$('[data-rep]', zona).forEach((b) => (b.onclick = async () => {
    const c = S.cache.comidas.find((x) => x.id === b.dataset.rep);
    const a = S.cache.alimentos.find((x) => x.id === c.alimentoId);
    if (!a) return aviso('Ese alimento ya no está en tu despensa');
    // Se recalculan los macros con la ficha ACTUAL, no se copian los de aquel
    // día: si Carlos corrigió la etiqueta, manda la corregida.
    const m = N.macrosDe(a, c.cantidad, c.unidad);
    // Se repite también el MOMENTO de la última vez, no el de la hora actual:
    // el café con leche que siempre fue «desayuno» sigue siendo desayuno aunque
    // lo apunte a mediodía porque se le olvidó.
    await db.guardar('comidas', {
      fecha, momento: c.momento || 'otro',
      alimentoId: a.id, nombre: a.nombre, cantidad: c.cantidad, unidad: c.unidad, ...m,
    });
    await recargar();
    aviso(`${a.nombre} · ${m.kcal} kcal`);
    pintar();
    sync.sincronizar({ silencioso: true });
  }));
}

/**
 * Corregir una comida ya apuntada: cantidad, medida y momento del día.
 *
 * Faltaba del todo. Lo único que se podía hacer con un apunte equivocado era
 * borrarlo y empezar de cero, y eso hace que uno acabe no corrigiéndolo.
 */
function editarComidaApuntada(comida) {
  if (!comida) return;
  const a = S.cache.alimentos.find((x) => x.id === comida.alimentoId);
  let unidad = comida.unidad || 'g';
  let momento = comida.momento || 'otro';

  hoja(
    comida.nombre,
    `
    <div class="chips" id="ec-momentos" style="margin-top:0"></div>
    <div class="campo-fila">
      <div class="campo">
        <label for="ec-cant">Cuánto</label>
        <input type="number" id="ec-cant" inputmode="decimal" min="0" step="1"
          value="${esc(comida.cantidad)}">
      </div>
      <div class="campo">
        <label>Medida</label>
        <div class="chips chips-compacto" id="ec-unidades"></div>
      </div>
    </div>
    <p id="ec-previo" class="nut-previo"></p>
    <div class="botonera">
      <button class="boton boton-2" id="ec-borrar">Borrar</button>
      <button class="boton" id="ec-guardar">Guardar</button>
    </div>`,
    (cuerpo, cerrar) => {
      const inp = $('#ec-cant', cuerpo);
      const previo = $('#ec-previo', cuerpo);

      $('#ec-momentos', cuerpo).innerHTML = N.todosLosMomentos(S.cache.momentos).map(
        (m) => `<button class="chip" data-m="${m.id}" aria-pressed="${m.id === momento}">${esc(m.nombre)}</button>`
      ).join('');
      $$('[data-m]', cuerpo).forEach((b) => (b.onclick = () => {
        momento = b.dataset.m;
        $$('[data-m]', cuerpo).forEach((x) => x.setAttribute('aria-pressed', x.dataset.m === momento));
      }));

      const refrescar = () => {
        const m = a ? N.macrosDe(a, inp.value, unidad) : null;
        previo.innerHTML = !m ? '<span class="fo-pendiente">Ese alimento ya no está.</span>'
          : m.incierto ? '<span class="fo-pendiente">Falta el peso de una pieza.</span>'
          : `<b>${m.kcal} kcal</b> · P ${m.prot} · C ${m.carb} · G ${m.gras}`;
      };
      const pintarU = () => {
        const ops = N.unidadesDe(a);
        if (!ops.includes(unidad)) unidad = ops[0];
        $('#ec-unidades', cuerpo).innerHTML = ops.map((u) =>
          `<button class="chip" data-u="${u}" aria-pressed="${u === unidad}">${esc(N.nombreUnidad(a, u))}</button>`
        ).join('');
        $$('[data-u]', cuerpo).forEach((b) => (b.onclick = () => {
          const conv = N.convertir(Number(inp.value) || 0, unidad, b.dataset.u, a);
          unidad = b.dataset.u;
          // Igual que en la hoja de apuntar: sin puente, cantidad segura.
          inp.value = conv !== null ? conv : (unidad === 'ud' ? 1 : 100);
          inp.step = unidad === 'ud' ? '0.5' : '1';
          pintarU();
          refrescar();
        }));
        inp.step = unidad === 'ud' ? '0.5' : '1';
      };
      inp.oninput = refrescar;
      pintarU();
      refrescar();

      $('#ec-borrar', cuerpo).onclick = async () => {
        await db.borrar('comidas', comida.id);
        await recargar();
        cerrar();
        pintar();
        sync.sincronizar({ silencioso: true });
      };
      $('#ec-guardar', cuerpo).onclick = async () => {
        const cantidad = Number(inp.value) || 0;
        if (cantidad <= 0) return aviso('Pon la cantidad');
        const m = a ? N.macrosDe(a, cantidad, unidad) : null;
        if (!m || m.incierto) return aviso('No puedo calcular esos macros');
        await db.guardar('comidas', { ...comida, cantidad, unidad, momento, ...m });
        await recargar();
        cerrar();
        aviso(`${comida.nombre} · ${m.kcal} kcal`);
        pintar();
        sync.sincronizar({ silencioso: true });
      };
    }
  );
}

/* --------------------------------------------------------------------------
 * PESO CORPORAL
 *
 * La regla de esta ficha: lo que manda es la MEDIA, no la báscula de hoy. Un
 * peso suelto no significa nada (oscila 1-2 kg por agua y sal), así que el
 * número grande es la media de 7 días y el del día va debajo, pequeño.
 * ------------------------------------------------------------------------ */
function pintarFichaPeso(ficha) {
  if (!ficha) return;
  const obj = objetivoActual();
  const actual = N.pesoActual(S.cache.pesos);
  // La ventana se ajusta a las pesadas que haya: con 90 fijos y solo un mes
  // de datos, la gráfica dejaba dos tercios vacíos.
  const serie = N.serieDePeso(S.cache.pesos, N.ventanaDePeso(S.cache.pesos, 90));
  const tendencia = N.tendenciaDePeso(serie);
  const falta = actual ? N.faltaParaObjetivo(actual.kg, obj.pesoObjetivo) : null;
  const ultimaMedia = [...serie].reverse().find((d) => d.media !== null);

  ficha.innerHTML = `
    <div class="nut-cabecera">
      <div>
        <h3 class="ficha-titulo" style="margin:0 0 2px">Peso</h3>
        ${ultimaMedia
          ? `<div class="peso-media">${ultimaMedia.media} <small>kg de media</small></div>`
          : `<div class="peso-media peso-sin">—</div>`}
        <div class="peso-detalle">
          ${actual ? `Última pesada: ${actual.kg} kg` : 'Todavía no te has pesado'}
          ${falta !== null
            ? ` · ${falta === 0 ? 'estás en tu objetivo'
                 : falta < 0 ? `te sobran ${Math.abs(falta)} kg` : `te faltan ${falta} kg`}`
            : ''}
        </div>
      </div>
      <button class="boton-plano" id="n-pesarme">Pesarme</button>
    </div>
    <div id="n-gr-peso"></div>
    <p class="nut-media">${
      tendencia
        ? `${tendencia.kgPorSemana === 0 ? 'Estable'
            : tendencia.kgPorSemana < 0
              ? `Bajando <b>${Math.abs(tendencia.kgPorSemana)} kg</b> por semana`
              : `Subiendo <b>${tendencia.kgPorSemana} kg</b> por semana`} · ${tendencia.dias} días`
        : 'Con dos semanas de pesadas te diré si subes o bajas. Antes de eso sería adivinar.'
    }</p>`;

  G.pesoCorporal($('#n-gr-peso', ficha), serie, { objetivoKg: obj.pesoObjetivo || null });
  $('#n-pesarme', ficha).onclick = abrirPeso;
}

/** Apuntar el peso. Un solo campo: si cuesta más, no se usa a diario. */
function abrirPeso() {
  const hoy = N.HOY();
  const yaHoy = S.cache.pesos.find((p) => !p.del && (p.fecha || '').slice(0, 10) === hoy);
  const ultimo = N.pesoActual(S.cache.pesos);
  hoja(
    'Pesarme',
    `
    <p style="color:var(--texto-2);font-size:.88rem;margin-top:0">
      Mejor por la mañana, en ayunas y después de ir al baño: es la única forma
      de que dos pesadas se puedan comparar.</p>
    <div class="campo"><label for="pe-kg">Peso (kg)</label>
      <input type="number" id="pe-kg" inputmode="decimal" step="0.1" min="20" max="400"
        value="${esc(yaHoy ? yaHoy.kg : ultimo ? ultimo.kg : '')}" autofocus></div>
    <p id="pe-aviso" class="nut-aviso oculto"></p>
    <button class="boton" id="pe-guardar">${yaHoy ? 'Corregir el de hoy' : 'Guardar'}</button>
    ${yaHoy ? '<button class="boton boton-2" id="pe-borrar" style="margin-top:10px">Borrar el de hoy</button>' : ''}`,
    (cuerpo, cerrar) => {
      const inp = $('#pe-kg', cuerpo);
      const avisoEl = $('#pe-aviso', cuerpo);

      // Un salto enorme casi siempre es un dedazo (78 -> 87). Se avisa, pero se
      // deja guardar: quien manda es Carlos, no la app.
      inp.oninput = () => {
        const kg = Number(inp.value);
        const salto = ultimo && kg > 0 ? Math.abs(kg - ultimo.kg) : 0;
        const raro = salto > 5;
        avisoEl.classList.toggle('oculto', !raro);
        if (raro) avisoEl.textContent = `Son ${salto.toFixed(1)} kg de diferencia con tu última pesada (${ultimo.kg} kg). ¿Seguro?`;
      };

      $('#pe-guardar', cuerpo).onclick = async () => {
        const kg = Number(inp.value);
        if (!(kg >= 20 && kg <= 400)) return aviso('Ese peso no puede ser');
        // Una pesada por día: se pisa la de hoy en vez de acumular varias, que
        // desvirtuarían la media de ese día.
        await db.guardar('pesos', { ...(yaHoy || {}), fecha: hoy, kg, del: 0 });
        await recargar();
        await recalcularObjetivoSiProcede();
        cerrar();
        aviso('Peso guardado');
        pintar();
        sync.sincronizar({ silencioso: true });
      };

      const btnBorrar = $('#pe-borrar', cuerpo);
      if (btnBorrar) btnBorrar.onclick = async () => {
        await db.borrar('pesos', yaHoy.id);
        await recargar();
        cerrar();
        aviso('Borrada la pesada de hoy');
        pintar();
        sync.sincronizar({ silencioso: true });
      };
    }
  );
}

/**
 * Recalcula el objetivo cuando cambia el peso — pero SOLO si Carlos no lo ha
 * puesto a mano. Ese es el trato que eligió: «las dos». La fórmula propone y él
 * puede pisarla; si la pisa, no se le vuelve a tocar el número a su espalda.
 */
async function recalcularObjetivoSiProcede() {
  const o = S.cache.objetivos[0];
  if (!o || o.aMano) return;
  const peso = N.pesoActual(S.cache.pesos);
  if (!peso) return;
  const prop = N.objetivoPropuesto({
    pesoKg: peso.kg, alturaCm: o.alturaCm, edad: o.edad, sexo: o.sexo,
    actividad: o.actividad, meta: o.meta, gPorKg: o.gPorKg,
  });
  if (!prop) {
    // Sin los datos personales no hay fórmula, pero la proteína sí depende solo
    // del peso: eso sí se puede actualizar sin inventar nada.
    const prot = N.proteinaObjetivo(peso.kg, o.gPorKg || 2.0);
    if (prot) await db.guardar('objetivos', { ...o, prot });
    await recargar();
    return;
  }
  await db.guardar('objetivos', {
    ...o, kcal: prop.kcal, prot: prop.prot, carb: prop.carb, gras: prop.gras,
  });
  await recargar();
}

/**
 * Busca en la base un alimento GENÉRICO que sirva para un producto sin tabla.
 *
 * Es la pieza que pidió Carlos para su aguacate: «el aguacate mercadona no
 * tiene una tabla con todo lo que lleva sabes? pues ahi utilizarias los
 * estudios que me has dicho antes de las calorias y el aporte nutriconal».
 *
 * Va al revés que el buscador normal: aquí se mira qué parte del nombre del
 * GENÉRICO aparece en el del producto. «Aguacate congelado en dados» contiene
 * «aguacate» entero, así que el aguacate de USDA vale. Se exige que aparezca al
 * menos la mitad del nombre genérico para no casar «Pan de molde» con
 * «Panceta».
 */
function genericoPara(nombreProducto) {
  const trozos = new Set(N.normalizar(nombreProducto).split(/[^a-z0-9]+/).filter(Boolean));
  let mejor = null;
  let mejorPunto = 0;
  for (const a of S.cache.alimentos) {
    if (a.del || a.origen !== 'base') continue;
    const suyas = N.normalizar(a.nombre).split(/[^a-z0-9]+/).filter((w) => w.length > 3);
    if (!suyas.length) continue;
    const casan = suyas.filter((w) => trozos.has(w)).length;
    if (!casan) continue;
    const punto = casan / suyas.length;
    if (punto > mejorPunto || (punto === mejorPunto && mejor && a.nombre.length < mejor.nombre.length)) {
      mejorPunto = punto;
      mejor = a;
    }
  }
  return mejorPunto >= 0.5 ? mejor : null;
}

/**
 * Convierte un producto de Open Food Facts en una ficha de la despensa.
 *
 * Lo importante es la RACIÓN. Carlos: «en mi proteina no me sirve de nada que
 * pongas 100 g, me serviria por los scoops de la marca que pone en su paquete
 * detras». Pues eso viene en el dato: Open Food Facts guarda la ración tal cual
 * la declara el fabricante («1 scoop (30 g)»). Cuando la ración es una PIEZA
 * contable, el alimento se guarda en unidades con ese peso, y entonces apuntar
 * un batido es escribir «1» en vez de pesar el polvo.
 */
/**
 * Lo que pesa el ENVASE entero, sacado del «200 ml» / «500 g» de la etiqueta.
 *
 * Es la respuesta a lo que faltaba en el colajet: no trae ración, así que al
 * elegir «unidades» la app no sabía cuánto es una. Pero el tamaño del envase SÍ
 * viene en el dato, y un colajet es literalmente un envase. Los mililitros se
 * pasan a gramos con densidad 1 (agua), que es la regla que ya usa la app, y se
 * DICE de dónde sale para que Carlos pueda corregirlo si es aceite o algo espeso.
 *
 * Devuelve null si no se entiende: nunca se adivina un peso.
 */
function pesoDelEnvase(cantidad) {
  const m = String(cantidad || '').match(/([\d]+[.,]?[\d]*)\s*(kg|g|gr|l|ml|cl)\b/i);
  if (!m) return null;
  const n = parseFloat(m[1].replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) return null;
  const factor = { kg: 1000, l: 1000, cl: 10, g: 1, gr: 1, ml: 1 }[m[2].toLowerCase()];
  const g = N.redondea(n * factor, 1);
  // Un envase de más de 5 kg no es una ración de nada: probablemente sea un
  // formato de hostelería mal etiquetado. Mejor no ofrecerlo que ofrecer un
  // «1 envase = 25.000 kcal».
  return g >= 1 && g <= 5000 ? g : null;
}

function fichaDeProducto(p) {
  const r = p.racion;
  const esPieza = !!(r && r.esPieza && r.gramos);
  const base = {
    nombre: p.etiqueta, barras: p.barras || '', foto: p.foto || '',
    origen: 'openfoodfacts',
  };
  if (p.sinTabla) {
    const g = genericoPara(p.nombre);
    if (!g) return null;                    // sin macros y sin genérico: no se puede
    return {
      ...base,
      kcal: g.kcal, prot: g.prot, carb: g.carb, gras: g.gras, fibra: g.fibra,
      unidad: g.unidad || 'g', gramosUd: g.gramosUd,
      factoresPropios: g.factoresPropios,
      // Que quede escrito de dónde salen: NO son de la etiqueta de ese envase.
      prestadoDe: g.nombre,
    };
  }
  // Los macros de Open Food Facts vienen SIEMPRE por 100 g. Si el alimento se
  // va a medir en piezas hay que escalarlos a UNA pieza — es el convenio de la
  // app y es lo que evita que un scoop cuente como 100 g de polvo.
  const escala = esPieza ? r.gramos / 100 : 1;
  return {
    ...base,
    kcal: Math.round((p.kcal || 0) * escala),
    prot: N.redondea((p.prot || 0) * escala),
    carb: N.redondea((p.carb || 0) * escala),
    gras: N.redondea((p.gras || 0) * escala),
    fibra: N.redondea((p.fibra || 0) * escala) || undefined,
    unidad: esPieza ? 'ud' : 'g',
    // El puente se pone SIEMPRE que el fabricante declare una ración, no solo
    // cuando la llama «scoop». Su bote de Real Whey Isolate declara «25 g» a
    // secas: es su dosis, así que contar dosis vale, y con esto el producto ya
    // se puede apuntar en gramos Y en dosis en vez de solo en gramos. Es lo que
    // pedía Carlos: «cualquier tipo de comida deberia dejarte poner por gramos
    // y por unidad TODOS, tanto si es de internet como si no».
    // Primero la ración del fabricante; si no la declara, el ENVASE entero. Con
    // eso, un producto como el colajet —que no trae ración— ya se puede apuntar
    // en unidades («1 envase de 200 ml») además de en gramos, que era justo lo
    // que Carlos echaba en falta: «si le pones por unidad tampoco lo sabes».
    gramosUd: (r && r.gramos) || pesoDelEnvase(p.cantidad) || undefined,
    nombreUd: (r && r.nombre) || (pesoDelEnvase(p.cantidad) ? 'envase' : undefined),
    racion: r ? r.texto : (pesoDelEnvase(p.cantidad) ? `envase de ${p.cantidad}` : ''),
  };
}

/* ========================================================================== *
 * DAR DE ALTA UN PRODUCTO SIN TECLEAR: ETIQUETA Y CÓDIGO DE BARRAS (v0.8.0)
 * ========================================================================== *
 * Carlos eligió «las dos, empezando por la foto». Y las dos hacen falta, porque
 * fallan por motivos distintos:
 *   · El CÓDIGO DE BARRAS es exacto y gratis, va directo desde el móvil sin PC…
 *     pero solo funciona si ese producto está en Open Food Facts. Sus dos
 *     «Colajet» ni siquiera traen el tamaño del envase.
 *   · La FOTO DE LA ETIQUETA funciona con cualquier envase del mundo, incluido
 *     el que nadie ha dado de alta… pero necesita el PC (la clave de Gemini no
 *     puede viajar dentro del APK) y hay que revisar lo leído.
 * El orden que se ofrece es ese: primero el código, y si no está, la foto.
 */

/** Pide una foto con la cámara trasera. Devuelve el File o null. */
function pedirFoto({ camara = true } = {}) {
  return new Promise((res) => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'image/*';
    if (camara) inp.capture = 'environment';
    inp.onchange = () => res(inp.files && inp.files[0] ? inp.files[0] : null);
    // Si cierra el selector sin elegir no salta ningún evento en algunos
    // WebView, así que la promesa se quedaría colgada para siempre. No pasa
    // nada: el usuario simplemente no ve ninguna hoja nueva.
    inp.click();
  });
}

/**
 * Lee el código de barras con la cámara si el navegador sabe hacerlo, y si no,
 * lo pide tecleado.
 *
 * `BarcodeDetector` existe en el WebView de Android (que es donde vive el APK)
 * pero NO en todos los navegadores de escritorio. En vez de esconder el botón
 * donde no hay cámara —que es el error que ya cometimos con las unidades— se
 * ofrece siempre y se cae a teclear los números, que también sirve.
 */
async function abrirEscaner(alTenerCodigo) {
  const hayDetector = typeof window.BarcodeDetector !== 'undefined';
  let formatos = [];
  if (hayDetector) {
    try { formatos = await window.BarcodeDetector.getSupportedFormats(); } catch { formatos = []; }
  }
  const puedeCamara = hayDetector && formatos.includes('ean_13')
    && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);

  hoja(
    'Código de barras',
    `${puedeCamara
        ? `<video id="es-video" playsinline muted class="escaner-video"></video>
           <p class="nut-media" id="es-estado">Enfoca el código de barras del envase.</p>`
        : `<p class="nut-media">Este navegador no puede leer el código con la cámara.
             Tecléalo: son los números que hay debajo de las rayas.</p>`}
     <div class="campo"><label for="es-codigo">Código (EAN)</label>
       <input type="text" id="es-codigo" inputmode="numeric" placeholder="8410076472106"></div>
     <button class="boton" id="es-buscar">Buscar el producto</button>`,
    (cuerpo, cerrar) => {
      const inp = $('#es-codigo', cuerpo);
      let flujo = null;
      let vivo = true;

      const soltarCamara = () => {
        vivo = false;
        if (flujo) flujo.getTracks().forEach((t) => t.stop());
        flujo = null;
      };

      const buscar = async (codigo) => {
        const c = String(codigo || '').replace(/\D/g, '');
        if (c.length < 8) return aviso('Un código de barras tiene 8 o 13 cifras');
        soltarCamara();
        const est = $('#es-estado', cuerpo);
        if (est) est.textContent = 'Buscando el producto…';
        const r = await C.productoPorBarras(c);
        if (!r.ok) {
          const motivo = r.noExiste
            ? 'Ese código no está en Open Food Facts.'
            : r.saturado ? 'Open Food Facts no contesta ahora mismo.'
            : 'No he podido preguntarlo.';
          cerrar();
          // Y aquí está el otro camino: si el código no lo resuelve, la foto sí.
          if (await preguntar(`${motivo}\n\n¿Le hacemos una foto a la etiqueta?`)) abrirEtiqueta(alTenerCodigo, c);
          return;
        }
        const ficha = fichaDeProducto(r.producto);
        if (!ficha) {
          cerrar();
          if (await preguntar('Ese producto está pero SIN tabla nutricional.\n\n¿Le hacemos una foto a la etiqueta?')) {
            abrirEtiqueta(alTenerCodigo, c);
          }
          return;
        }
        const guardado = await db.guardar('alimentos', { ...ficha, barras: c });
        await recargar();
        sync.sincronizar({ silencioso: true });
        cerrar();
        aviso(`${guardado.nombre} guardado en tus alimentos`, 3000);
        alTenerCodigo(guardado);
      };

      $('#es-buscar', cuerpo).onclick = () => buscar(inp.value);
      inp.onkeydown = (e) => { if (e.key === 'Enter') buscar(inp.value); };

      if (puedeCamara) {
        const video = $('#es-video', cuerpo);
        const detector = new window.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] });
        navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
          .then(async (f) => {
            flujo = f;
            video.srcObject = f;
            await video.play();
            const mirar = async () => {
              if (!vivo || !flujo) return;
              try {
                const codigos = await detector.detect(video);
                if (codigos.length) {
                  inp.value = codigos[0].rawValue;
                  return buscar(codigos[0].rawValue);
                }
              } catch { /* un fotograma malo no es motivo para parar */ }
              // 4 lecturas por segundo: más es gastar batería para nada, menos
              // se nota como que «no lee».
              setTimeout(mirar, 250);
            };
            mirar();
          })
          .catch(() => {
            const est = $('#es-estado', cuerpo);
            if (est) est.textContent = 'No me dejas usar la cámara. Puedes teclear el código.';
          });
      }

      // La cámara se suelta SIEMPRE al cerrar: dejarla abierta mantiene el
      // piloto encendido y se come la batería en el bolsillo.
      const fondo = cuerpo.closest('.hoja-fondo');
      new MutationObserver((_, obs) => {
        if (!document.body.contains(fondo)) { soltarCamara(); obs.disconnect(); }
      }).observe(document.body, { childList: true });
    }
  );
}

/**
 * Foto de la etiqueta → ficha del alimento, para revisar antes de guardar.
 *
 * NUNCA se guarda directamente lo que lee el modelo. No es desconfianza
 * gratuita: es la misma regla del plato. El modelo copia números impresos y casi
 * siempre acierta, pero cuando falla lo hace con total seguridad, y unos macros
 * mal copiados contaminan cada comida futura de ese producto.
 */
async function abrirEtiqueta(alGuardar, barras = '') {
  const archivo = await pedirFoto();
  if (!archivo) return;

  const cerrarEspera = hoja('Leyendo la etiqueta',
    `<p class="nut-media">Mandando la foto al PC y leyendo la tabla…</p>
     <div class="cargando"></div>`, () => {});

  // 1600 px y no 1024 como el plato: aquí hay que leer un «7,6» de cuerpo 6, y
  // con la foto encogida al tamaño del plato los decimales se pierden.
  const blob = await C.encoger(archivo, 1600, 0.88);
  const r = await C.leerEtiqueta(blob);
  cerrarEspera();

  if (!r.ok) {
    return aviso(r.sinServidor
      ? 'Para leer una etiqueta necesito el PC encendido (la clave de Google vive allí). '
        + 'Prueba con el código de barras, que ese va directo.'
      : `No he podido leerla: ${r.error || 'no reconocí la tabla'}`, 5000);
  }

  const esMl = r.base === '100ml';
  const url = urlDe(blob);
  hoja(
    'Revisa la etiqueta',
    `
    <p class="nut-media" style="margin-top:0">Esto es lo que he leído del envase.
      <b>Compruébalo</b> antes de guardar: si algo está mal, se quedaría mal para
      siempre en cada comida que apuntes con este producto.</p>
    <img src="${url}" alt="La etiqueta fotografiada" class="etiqueta-foto">
    <div class="campo"><label for="et-nombre">Nombre</label>
      <input type="text" id="et-nombre" value="${esc([r.nombre, r.marca].filter(Boolean).join(' '))}"></div>
    <p class="nut-media">Por 100 ${esMl ? 'ml' : 'g'}:</p>
    <div class="campo-fila">
      <div class="campo"><label for="et-kcal">kcal</label>
        <input type="number" id="et-kcal" inputmode="decimal" value="${r.kcal ?? ''}"></div>
      <div class="campo"><label for="et-prot">Proteína (g)</label>
        <input type="number" id="et-prot" inputmode="decimal" step="0.1" value="${r.prot ?? ''}"></div>
    </div>
    <div class="campo-fila">
      <div class="campo"><label for="et-carb">Hidratos (g)</label>
        <input type="number" id="et-carb" inputmode="decimal" step="0.1" value="${r.carb ?? ''}"></div>
      <div class="campo"><label for="et-gras">Grasas (g)</label>
        <input type="number" id="et-gras" inputmode="decimal" step="0.1" value="${r.gras ?? ''}"></div>
    </div>
    <div class="campo-fila">
      <div class="campo"><label for="et-fibra">Fibra (g)</label>
        <input type="number" id="et-fibra" inputmode="decimal" step="0.1" value="${r.fibra ?? ''}"></div>
      <div class="campo"><label for="et-racion">1 ${esc(r.racionNombre || 'ración')} pesa (g)</label>
        <input type="number" id="et-racion" inputmode="decimal" step="0.1"
          value="${r.racionG ?? (r.envaseUnidad ? r.envaseCantidad ?? '' : '')}"></div>
    </div>
    <p id="et-aviso" class="nut-aviso oculto"></p>
    <p class="nut-media">Leído con ${esc(r.motor || '—')}${r.barras ? ` · código ${esc(r.barras)}` : ''}.</p>
    <button class="boton" id="et-guardar">Guardar el alimento</button>`,
    (cuerpo, cerrar) => {
      const val = (id) => {
        const v = Number($(`#${id}`, cuerpo).value);
        return Number.isFinite(v) ? v : null;
      };
      const avisoEl = $('#et-aviso', cuerpo);

      const revisar = () => {
        // El mismo control de coherencia que ya existe para los alimentos a
        // mano: si los macros no dan las kcal, algo se ha copiado mal.
        const kcal = val('et-kcal');
        const suma = (val('et-prot') || 0) * 4 + (val('et-carb') || 0) * 4
                   + (val('et-gras') || 0) * 9 + (val('et-fibra') || 0) * 2;
        const desvia = kcal ? Math.abs(suma - kcal) / kcal : 0;
        avisoEl.classList.toggle('oculto', !(kcal && desvia > 0.2));
        if (kcal && desvia > 0.2) {
          avisoEl.textContent = `Ojo: tus macros dan ${Math.round(suma)} kcal y la etiqueta dice `
            + `${kcal}. Repasa los números o vuelve a fotografiar.`;
        }
      };
      $$('input[type="number"]', cuerpo).forEach((i) => (i.oninput = revisar));
      revisar();

      $('#et-guardar', cuerpo).onclick = async () => {
        const nombre = $('#et-nombre', cuerpo).value.trim();
        const kcal = val('et-kcal');
        if (!nombre || kcal === null) return aviso('Hace falta al menos el nombre y las kcal');
        const racion = val('et-racion');
        const guardado = await db.guardar('alimentos', {
          nombre,
          kcal,
          prot: val('et-prot') ?? 0,
          carb: val('et-carb') ?? 0,
          gras: val('et-gras') ?? 0,
          fibra: val('et-fibra') ?? undefined,
          // La unidad de la ficha sigue siendo por 100: los ml se convierten con
          // densidad 1 como en el resto de la app, y se DICE.
          unidad: 'g',
          gramosUd: racion || undefined,
          nombreUd: racion ? (r.racionNombre || 'ración') : undefined,
          racion: racion ? `${r.racionNombre || 'ración'} de ${racion} g` : '',
          barras: barras || r.barras || '',
          // `mio` para que la siembra de cada arranque NO le pise sus números:
          // esto lo ha leído de SU envase, y manda sobre cualquier genérico.
          origen: 'mio',
          liquido: esMl || undefined,
        });
        await recargar();
        sync.sincronizar({ silencioso: true });
        cerrar();
        aviso(`${guardado.nombre} guardado`, 3000);
        alGuardar(guardado);
      };
    },
    { hayTrabajo: () => true, avisoSalir: 'Perderás la etiqueta que acabo de leer.' }
  );
}

/**
 * El buscador de «el súper (internet)», montado sobre una zona cualquiera.
 *
 * Está sacado aparte porque hace falta en DOS sitios: al apuntar una comida y
 * al montar un plato con ingredientes. Carlos: «ademas aqui no funciona el
 * buscador de comida no se porque» — en el creador de platos no fallaba, es que
 * NO ESTABA: allí solo se buscaba en su despensa. Duplicar el código habría
 * garantizado que los dos se separasen a la primera corrección.
 *
 * `alElegir(alimentoGuardado)` recibe el alimento ya metido en la despensa.
 */
function montarBuscadorSuper(zona, alElegir) {
  let estado = 'quieto';       // quieto | buscando | ok | vacio | saturado | sinServidor
  let productos = [];
  let ultima = '';
  let consulta = '';
  let reloj = null;

  const pintar = () => {
    const q = consulta.trim();
    if (q.length < 3) { zona.innerHTML = ''; return; }
    const cab = '<h4 class="nut-seccion">En el súper (internet)</h4>';
    const mensajes = {
      buscando: 'Buscando productos…',
      sinServidor: 'Para buscar productos del súper necesito el PC encendido. '
                 + 'Puedes seguir con tus alimentos.',
      saturado: 'Open Food Facts no contesta ahora mismo (admite pocas búsquedas '
              + 'por minuto). Prueba en un rato.',
      vacio: 'Ningún producto con ese nombre. Si lo tienes delante, créalo copiando su etiqueta.',
    };
    if (mensajes[estado]) {
      zona.innerHTML = `${cab}<p class="nut-media">${mensajes[estado]}</p>`;
      return;
    }
    if (estado !== 'ok') { zona.innerHTML = ''; return; }

    zona.innerHTML = cab + productos.map((p, i) => {
      const r = p.racion;
      // Los macros COMPLETOS, no solo las kcal. Carlos: «si busco colajet me
      // salen 100 g pero no salen los macros». Estaban en el dato desde el
      // principio; lo que faltaba era enseñarlos.
      const detalle = p.sinTabla
        ? 'Sin tabla en el envase'
        : `${Math.round(p.kcal)} kcal/100 g · P ${p.prot} · C ${p.carb} · G ${p.gras}`
          + (r ? ` · ${esc(r.texto)}` : p.cantidad ? ` · envase de ${esc(p.cantidad)}` : '');
      // Sin `loading="lazy"`: dentro de una hoja que se abre con `transform` el
      // navegador da las imágenes por fuera de pantalla y NO las pide nunca.
      // Medido en su día: con lazy 0 px, sin lazy 138 px.
      return `<button class="nut-op nut-op-foto" data-off="${i}">
        ${p.foto ? `<img src="${esc(p.foto)}" alt="" referrerpolicy="no-referrer">`
                 : `<span class="nut-sinfoto">${icono('carro', 22)}</span>`}
        <span class="nut-op-txt">
          <span class="nut-op-nombre">${esc(p.nombre)}</span>
          <span class="nut-op-det">${esc(p.marca || 'sin marca')} · ${detalle}</span>
        </span></button>`;
    }).join('');

    $$('[data-off]', zona).forEach((b) => (b.onclick = async () => {
      const p = productos[Number(b.dataset.off)];
      const ficha = fichaDeProducto(p);
      if (!ficha) {
        return aviso('Ese producto no trae tabla y no sé a qué alimento se parece. '
                   + 'Créalo a mano copiando la etiqueta.', 4200);
      }
      // Se guarda en su despensa: la próxima vez está sin internet y sin PC.
      const guardado = await db.guardar('alimentos', ficha);
      await recargar();
      aviso(ficha.prestadoDe
        ? `Guardado con los valores de «${ficha.prestadoDe}»`
        : `${guardado.nombre} guardado en tus alimentos`, 3000);
      sync.sincronizar({ silencioso: true });
      alElegir(guardado);
    }));
  };

  const buscar = async () => {
    const q = consulta.trim();
    if (q.length < 3 || q === ultima) return;
    ultima = q;
    estado = 'buscando';
    pintar();
    const r = await C.buscarProducto(q);
    if (q !== consulta.trim()) return;      // ya está escribiendo otra cosa
    productos = r.productos || [];
    estado = r.sinServidor ? 'sinServidor'
           : r.saturado ? 'saturado'
           : productos.length ? 'ok' : 'vacio';
    pintar();
  };

  return {
    /** Le llega cada tecla del buscador de arriba. */
    escribe(texto) {
      consulta = texto;
      // Con freno: Open Food Facts admite pocas búsquedas por minuto y una
      // palabra de 8 letras dispararía 8 llamadas.
      clearTimeout(reloj);
      estado = 'quieto';
      pintar();
      reloj = setTimeout(buscar, 750);
    },
    repinta: pintar,
  };
}

/** Hoja para apuntar una comida: la despensa y, debajo, el súper. */
function abrirAnadirComida(fecha) {
  // El momento se propone por la hora: a las 9 de la mañana casi seguro que es
  // desayuno. Ahorra un toque en el caso normal y se puede cambiar.
  const h = new Date().getHours();
  let momento = h < 11 ? 'desayuno' : h < 16 ? 'comida' : h < 19 ? 'merienda' : h < 23 ? 'cena' : 'otro';
  let elegido = null;
  let unidad = 'g';
  let consulta = '';
  // La cantidad que no se pudo convertir por falta de puente, para rehacerla en
  // cuanto se sepa lo que pesa una pieza.
  let pendiente = null;

  hoja(
    'Añadir comida',
    `
    <div class="chips" id="n-momentos" style="margin-top:0"></div>
    <input class="buscador" type="search" id="n-buscar"
      placeholder="Buscar: zanahoria, butifarra, naranjas mercadona…">
    <div class="botonera" style="margin-top:0">
      <button class="boton boton-2" id="n-barras">${icono('codigo')} Código de barras</button>
      <button class="boton boton-2" id="n-etiqueta">${icono('camara')} Foto de la etiqueta</button>
    </div>
    <div id="n-resultados" class="nut-resultados"></div>
    <div id="n-net"></div>
    <div id="n-cantidad" class="oculto">
      <div class="nut-elegido" id="n-elegido"></div>
      <div class="campo-fila">
        <div class="campo">
          <label for="n-gramos" id="n-gramos-label">Cantidad</label>
          <input type="number" id="n-gramos" inputmode="decimal" min="0" step="1" value="100">
        </div>
        <div class="campo">
          <label>Medida</label>
          <div class="chips chips-compacto" id="n-unidades"></div>
        </div>
      </div>
      <div id="n-puente"></div>
      <p id="n-previo" class="nut-previo"></p>
      <button class="boton" id="n-guardar">Añadir</button>
    </div>
    <div class="botonera">
      <button class="boton boton-2" id="n-nuevo">Crear alimento</button>
      <button class="boton boton-2" id="n-receta">Crear plato con ingredientes</button>
    </div>`,
    (cuerpo, cerrar) => {
      const res = $('#n-resultados', cuerpo);
      const zonaNet = $('#n-net', cuerpo);
      const zonaCant = $('#n-cantidad', cuerpo);
      const inpCant = $('#n-gramos', cuerpo);
      const previo = $('#n-previo', cuerpo);

      // El chip «+» va aquí y no escondido en Ajustes: el momento en que uno
      // echa en falta «preentreno» es justo cuando está apuntando la comida.
      $('#n-momentos', cuerpo).innerHTML = N.todosLosMomentos(S.cache.momentos).map(
        (m) => `<button class="chip" data-m="${m.id}" aria-pressed="${m.id === momento}">${esc(m.nombre)}</button>`
      ).join('') + '<button class="chip chip-mas" data-nuevo-momento>+</button>';
      $('[data-nuevo-momento]', cuerpo).onclick = () => { cerrar(); abrirMomentos(); };
      $$('[data-m]', cuerpo).forEach((b) => (b.onclick = () => {
        momento = b.dataset.m;
        $$('[data-m]', cuerpo).forEach((x) => x.setAttribute('aria-pressed', x.dataset.m === momento));
      }));

      const refrescarPrevio = () => {
        if (!elegido) return;
        const m = N.macrosDe(elegido, inpCant.value, unidad);
        // `incierto` = falta el puente. Enseñar «0 kcal» sin más parecería que el
        // alimento no engorda; se dice que falta el dato.
        previo.innerHTML = m.incierto
          ? '<span class="fo-pendiente">Me falta lo que pesa una pieza para calcularlo.</span>'
          : `<b>${m.kcal} kcal</b> · P ${m.prot} · C ${m.carb} · G ${m.gras}`;
      };

      /** Enseña el alimento elegido y sus medidas posibles. */
      const pintarElegido = () => {
        if (!elegido) return;
        zonaCant.classList.remove('oculto');
        const opciones = N.unidadesDe(elegido);
        if (!opciones.includes(unidad)) unidad = opciones[0];
        const falta = N.faltaPuente(elegido, unidad);

        $('#n-elegido', cuerpo).innerHTML = `
          <b>${esc(elegido.nombre)}</b>
          <small>${esc(N.resumenAlimento(elegido))}</small>
          ${elegido.prestadoDe
            ? `<small class="nut-prestado">Su envase no trae tabla: uso los valores de
               «${esc(elegido.prestadoDe)}» (USDA, medido en laboratorio)</small>` : ''}
          ${elegido.racion ? `<small>Ración del fabricante: ${esc(elegido.racion)}</small>` : ''}`;

        $('#n-unidades', cuerpo).innerHTML = opciones.map((u) =>
          `<button class="chip" data-u="${u}" aria-pressed="${u === unidad}">${esc(N.nombreUnidad(elegido, u))}</button>`
        ).join('');
        $$('[data-u]', cuerpo).forEach((b) => (b.onclick = () => {
          // Se CONVIERTE la cantidad al cambiar de medida. Dejar el número tal
          // cual al pasar de «2 ud» a «2 g» es el bug de las 8.994 kcal al revés.
          const antes = { cantidad: Number(inpCant.value) || 0, unidad };
          const convertida = N.convertir(antes.cantidad, unidad, b.dataset.u, elegido);
          unidad = b.dataset.u;
          if (convertida !== null) {
            inpCant.value = convertida;
            pendiente = null;
          } else {
            // Sin puente NO se puede convertir, y dejar el número puesto es
            // justo el desastre: pasar de «100 g» a unidades dejaba un 100 que
            // significaba 100 PECHUGAS — 27.370 kcal, medido en un test. Se
            // pone una cantidad segura y se guarda la de antes para rehacer la
            // conversión en cuanto Carlos diga lo que pesa una pieza.
            pendiente = antes;
            inpCant.value = unidad === 'ud' ? 1 : 100;
          }
          pintarElegido();
          refrescarPrevio();
        }));
        inpCant.step = unidad === 'ud' ? '0.5' : '1';
        $('#n-gramos-label', cuerpo).textContent =
          `Cuánto${unidad === 'ud' ? ` (en ${N.nombreUd(elegido, 2)})` : ''}`;

        // El puente que falta se PIDE aquí mismo. Antes la unidad simplemente no
        // se ofrecía, y el resultado era que su proteína solo se dejaba apuntar
        // en gramos. Preguntar una vez es mejor que esconder la función, y muy
        // mejor que inventarse lo que pesa un scoop.
        const zonaP = $('#n-puente', cuerpo);
        if (falta === 'peso') {
          zonaP.innerHTML = `
            <div class="nut-puente">
              <label for="n-peso-ud">¿Cuánto pesa 1 ${esc(N.nombreUd(elegido, 1))} de
                ${esc(elegido.nombre)}?</label>
              <div class="nut-puente-fila">
                <input type="number" id="n-peso-ud" inputmode="decimal" min="0" step="1"
                  placeholder="gramos"><span>g</span>
                <button class="boton-plano" id="n-peso-ok">Guardar</button>
              </div>
              <small>Lo pregunto una vez y ya se queda en la ficha. No me lo invento:
                un scoop y una rebanada no pesan lo mismo.</small>
            </div>`;
          const inp = $('#n-peso-ud', cuerpo);
          $('#n-peso-ok', cuerpo).onclick = async () => {
            const g = Number(inp.value) || 0;
            if (g <= 0) return aviso('Dime los gramos');
            // Se guarda en la ficha: es un dato del alimento, no de este apunte.
            elegido = await db.guardar('alimentos', { ...elegido, gramosUd: g });
            await recargar();
            // Ya hay puente: se rehace la conversión que antes no se pudo hacer.
            // Si venía de «100 g», ahora se ve «0,5 unidades», que es lo que
            // quería decir desde el principio.
            if (pendiente) {
              const conv = N.convertir(pendiente.cantidad, pendiente.unidad, unidad, elegido);
              if (conv !== null) inpCant.value = conv;
              pendiente = null;
            }
            pintarRes();
            pintarElegido();
            refrescarPrevio();
            sync.sincronizar({ silencioso: true });
          };
        } else if (falta === 'densidad') {
          // Se puede suponer (es agua), pero hay que decirlo. Un número que sale
          // de una suposición callada es el que luego nadie sabe explicar.
          zonaP.innerHTML = `<p class="nut-media">Supongo 1 g por ml, como el agua.
            Si es aceite o algo espeso, dímelo editando el alimento.</p>`;
        } else {
          zonaP.innerHTML = '';
        }
      };

      const seleccionar = (a) => {
        elegido = a;
        unidad = a.unidad || 'g';
        inpCant.value = a.porcion || (unidad === 'ud' ? 1 : 100);
        pintarElegido();
        refrescarPrevio();
        $$('[data-a]', cuerpo).forEach((x) => x.setAttribute('aria-pressed', x.dataset.a === a.id));
      };

      const pintarRes = () => {
        // Lo que más repite, arriba: es lo que va a volver a comer.
        const veces = new Map();
        for (const c of S.cache.comidas) {
          if (c.alimentoId) veces.set(c.alimentoId, (veces.get(c.alimentoId) || 0) + 1);
        }
        const lista = N.buscarAlimentos(consulta, S.cache.alimentos, { limite: 30, veces });
        res.innerHTML = lista.length
          ? lista.map((a) => `<div class="nut-op-fila">
              <button class="nut-op" data-a="${a.id}"
                aria-pressed="${!!elegido && elegido.id === a.id}">
                <span class="nut-op-nombre">${esc(a.nombre)}${a.ingredientes ? ' <small>· plato</small>' : ''}</span>
                <span class="nut-op-det">${esc(N.resumenAlimento(a))}</span>
              </button>
              <button class="boton-plano nut-editar" data-editar="${a.id}"
                aria-label="Editar ${esc(a.nombre)}">${icono('lapiz', 18)}</button>
            </div>`).join('')
          : `<p class="grafica-vacia">Nada tuyo con ese nombre${consulta.trim() ? '. Mira abajo en el súper' : ''}.</p>`;
        $$('[data-a]', res).forEach((b) => (b.onclick = () =>
          seleccionar(S.cache.alimentos.find((x) => x.id === b.dataset.a))));
        // Los platos se abren en su pantalla (con los ingredientes dentro); el
        // resto, en la de macros. Mandar un plato a la hoja de macros dejaría
        // sus ingredientes ahí colgados sin poder tocarlos.
        $$('[data-editar]', res).forEach((b) => (b.onclick = () => {
          const a = S.cache.alimentos.find((x) => x.id === b.dataset.editar);
          cerrar();
          if (a.ingredientes) editarReceta(a, fecha);
          else editarAlimento(a, fecha);
        }));
      };

      const superNet = montarBuscadorSuper(zonaNet, (guardado) => {
        pintarRes();
        seleccionar(guardado);
      });

      // Las dos vías para dar de alta un producto sin teclear la etiqueta.
      // Al volver, el alimento ya está en la despensa y queda seleccionado, así
      // que Carlos solo tiene que poner la cantidad.
      const alTenerlo = (guardado) => {
        pintarRes();
        seleccionar(guardado);
      };
      $('#n-barras', cuerpo).onclick = () => abrirEscaner(alTenerlo);
      $('#n-etiqueta', cuerpo).onclick = () => abrirEtiqueta(alTenerlo);

      const buscador = $('#n-buscar', cuerpo);
      buscador.oninput = () => {
        consulta = buscador.value;
        pintarRes();                      // lo suyo, al instante
        superNet.escribe(consulta);       // internet, con freno
      };
      inpCant.oninput = refrescarPrevio;

      $('#n-guardar', cuerpo).onclick = async () => {
        if (!elegido) return aviso('Elige un alimento');
        const cantidad = Number(inpCant.value) || 0;
        if (cantidad <= 0) return aviso('Pon la cantidad');
        const m = N.macrosDe(elegido, cantidad, unidad);
        // Apuntar 0 kcal en silencio es peor que no apuntar: la cuenta del día
        // queda mal y nada lo dice.
        if (m.incierto) return aviso(`Dime primero cuánto pesa ${N.nombreUd(elegido, 1)}`, 3500);
        await db.guardar('comidas', {
          fecha, momento, alimentoId: elegido.id, nombre: elegido.nombre,
          cantidad, unidad, ...m,
        });
        await recargar();
        cerrar();
        aviso(`${elegido.nombre} · ${m.kcal} kcal`);
        pintar();
        sync.sincronizar({ silencioso: true });
      };

      $('#n-nuevo', cuerpo).onclick = () => { cerrar(); editarAlimento(null, fecha); };
      $('#n-receta', cuerpo).onclick = () => { cerrar(); editarReceta(null, fecha); };

      pintarRes();
    }
  );
}

/**
 * Alta/edición de un alimento (macros por 100 g, 100 ml o por unidad).
 *
 * Los mililitros los pidió Carlos por su nombre: «Tambien añade militros o
 * gramos para los liquidos». Y el peso de la pieza no es un adorno: sin él no
 * se puede pasar de gramos a unidades, y es lo que hizo que la foto contara
 * 110 huevos.
 */
function editarAlimento(alimento, fechaVolver) {
  const a = alimento || { nombre: '', kcal: '', prot: '', carb: '', gras: '', unidad: 'g', porcion: '' };
  hoja(
    alimento ? 'Editar alimento' : 'Alimento nuevo',
    `
    <div class="campo"><label for="al-nombre">Nombre</label>
      <input type="text" id="al-nombre" value="${esc(a.nombre)}" placeholder="Pechuga de pollo"></div>
    <div class="campo">
      <label>Los valores son por…</label>
      <div class="chips chips-compacto" style="margin:0;padding-left:0;padding-right:0">
        <button class="chip" data-u="g">100 gramos</button>
        <button class="chip" data-u="ml">100 mililitros</button>
        <button class="chip" data-u="ud">una unidad</button>
      </div>
    </div>
    <div class="campo" id="al-puente-campo">
      <label for="al-puente" id="al-puente-label">¿Cuánto pesa una unidad? (g)</label>
      <input type="number" id="al-puente" inputmode="decimal" step="0.01" min="0"
        value="${esc(a.gramosUd || '')}" placeholder="p. ej. 50">
      <small class="campo-nota" id="al-puente-nota"></small>
    </div>
    <div class="campo" id="al-nombreud-campo">
      <label for="al-nombreud">¿Cómo se llama una unidad?</label>
      <input type="text" id="al-nombreud" value="${esc(a.nombreUd || '')}"
        placeholder="scoop, rebanada, loncha, huevo…">
      <small class="campo-nota">Es lo que aparecerá en el botón al apuntar. Con «scoop»,
        tu proteína se apunta en scoops en vez de en «unidades».</small>
    </div>
    <div class="campo"><label for="al-kcal">Calorías (kcal)</label>
      <input type="number" id="al-kcal" inputmode="decimal" value="${esc(a.kcal)}"></div>
    <div class="campo"><label for="al-prot">Proteína (g)</label>
      <input type="number" id="al-prot" inputmode="decimal" step="0.1" value="${esc(a.prot)}"></div>
    <div class="campo"><label for="al-carb">Carbohidratos (g)</label>
      <input type="number" id="al-carb" inputmode="decimal" step="0.1" value="${esc(a.carb)}"></div>
    <div class="campo"><label for="al-gras">Grasas (g)</label>
      <input type="number" id="al-gras" inputmode="decimal" step="0.1" value="${esc(a.gras)}"></div>
    <p id="al-aviso" class="nut-aviso oculto"></p>
    <button class="boton" id="al-guardar">Guardar</button>`,
    (cuerpo, cerrar) => {
      let unidad = a.unidad || 'g';
      const campoPuente = $('#al-puente-campo', cuerpo);

      const pintarUnidad = () => {
        $$('[data-u]', cuerpo).forEach((x) => x.setAttribute('aria-pressed', x.dataset.u === unidad));
        // El peso de la pieza ya NO se esconde cuando los valores van por 100 g:
        // ahora cualquier alimento se puede contar en piezas, y este es el dato
        // que lo hace posible. En mililitros lo que se pide es la densidad.
        campoPuente.classList.remove('oculto');
        $('#al-nombreud-campo', cuerpo).classList.toggle('oculto', unidad === 'ml');
        if (unidad === 'ml') {
          $('#al-puente-label', cuerpo).textContent = '¿Cuánto pesa 1 ml? (g)';
          $('#al-puente-nota', cuerpo).textContent =
            'Déjalo en 1 para bebidas (agua, leche, zumo). El aceite es 0,92.';
          if (!$('#al-puente', cuerpo).value) $('#al-puente', cuerpo).value = 1;
        } else if (unidad === 'ud') {
          $('#al-puente-label', cuerpo).textContent = '¿Cuánto pesa una unidad? (g)';
          $('#al-puente-nota', cuerpo).textContent =
            'Obligatorio: los valores de arriba son POR PIEZA y sin esto no se puede '
            + 'pasar a gramos. Un huevo M son 50 g, un scoop de proteína 25-30 g.';
        } else {
          $('#al-puente-label', cuerpo).textContent = '¿Cuánto pesa una pieza? (g, opcional)';
          $('#al-puente-nota', cuerpo).textContent =
            'Si lo pones, además de en gramos podrás apuntarlo en piezas: una rebanada '
            + '(30 g), un scoop (25 g), una loncha (20 g).';
        }
      };
      $$('[data-u]', cuerpo).forEach((b) => (b.onclick = () => { unidad = b.dataset.u; pintarUnidad(); }));
      pintarUnidad();

      const leer = () => {
        const puente = Number($('#al-puente', cuerpo).value) || 0;
        return {
          nombre: $('#al-nombre', cuerpo).value.trim(),
          kcal: Number($('#al-kcal', cuerpo).value) || 0,
          prot: Number($('#al-prot', cuerpo).value) || 0,
          carb: Number($('#al-carb', cuerpo).value) || 0,
          gras: Number($('#al-gras', cuerpo).value) || 0,
          unidad,
          gramosUd: puente || undefined,
          nombreUd: unidad === 'ml' ? undefined
                  : ($('#al-nombreud', cuerpo).value.trim().toLowerCase() || undefined),
        };
      };

      // Aviso EN VIVO si los macros no cuadran con las kcal: teclear 4 en vez
      // de 40 de proteína arruina el seguimiento y no se nota hasta semanas
      // después.
      const avisoEl = $('#al-aviso', cuerpo);
      const revisar = () => {
        const problema = N.revisarCoherencia(leer());
        avisoEl.classList.toggle('oculto', !problema);
        if (problema) avisoEl.textContent = problema;
      };
      ['al-kcal', 'al-prot', 'al-carb', 'al-gras'].forEach((id) => ($(`#${id}`, cuerpo).oninput = revisar));

      $('#al-guardar', cuerpo).onclick = async () => {
        const nuevo = leer();
        if (!nuevo.nombre) return aviso('Ponle nombre');
        if (nuevo.unidad === 'ud' && !nuevo.gramosUd) {
          return aviso('Dime lo que pesa una unidad: sin eso no puedo pasar de gramos a piezas');
        }
        // `origen: 'mio'` para que la base de partida NO se lo pise nunca al
        // actualizarse, aunque se llame igual que uno de los nuestros.
        //
        // Y si lo que estaba editando era uno de la base, PASA A SER SUYO. Si
        // no, el siguiente arranque le devolvería mis números encima de los que
        // acaba de corregir, sin decirle nada — y encima parecería que la app
        // no guarda.
        const previo = alimento && alimento.origen;
        const guardado = await db.guardar('alimentos', {
          ...(alimento || {}), ...nuevo,
          origen: previo === 'receta' ? 'receta' : 'mio',
        });
        await recargar();
        cerrar();
        aviso(`${guardado.nombre} guardado`);
        if (fechaVolver) abrirAnadirComida(fechaVolver);
        else pintar();
        sync.sincronizar({ silencioso: true });
      };
    }
  );
}

/**
 * PLATO CON INGREDIENTES — «mi bol de preentreno».
 *
 * Carlos, con toda la razón: «no has entendido lo de crear alimentos
 * personizados (…) si yo me he hecho un bol de preentreno quiero crear un
 * alimento que se llame preentreno y que le puedas añadir alli los ingredientes
 * y que con eso te calcule ya los macros (añade que se pueda guardar)».
 *
 * Sale un alimento normal: se guarda en la despensa, aparece en el buscador y
 * se apunta de un toque. Por dentro guarda sus ingredientes, así que se puede
 * volver a abrir y cambiar la avena de 60 a 80 g sin rehacerlo entero.
 */
function editarReceta(receta, fechaVolver) {
  let nombre = receta ? receta.nombre : '';
  // Copia, no referencia: si Carlos se arrepiente y cierra, el plato guardado
  // tiene que quedarse como estaba.
  let ingredientes = receta && receta.ingredientes
    ? receta.ingredientes.map((i) => ({ ...i })) : [];
  let consulta = '';

  hoja(
    receta ? `Editar «${receta.nombre}»` : 'Plato con ingredientes',
    `
    <p style="color:var(--texto-2);font-size:.88rem;margin-top:0">
      Mete lo que lleva y yo sumo los macros. Se guarda como un alimento más:
      la próxima vez lo apuntas de un toque.</p>
    <div class="campo"><label for="re-nombre">Cómo se llama</label>
      <input type="text" id="re-nombre" value="${esc(nombre)}" placeholder="Bol de preentreno"></div>
    <div id="re-lista"></div>
    <p id="re-total" class="nut-previo"></p>
    <h4 class="nut-seccion">Añadir ingrediente</h4>
    <input class="buscador" type="search" id="re-buscar" placeholder="Buscar: avena, plátano, proteína…">
    <div id="re-res" class="nut-resultados"></div>
    <div id="re-net"></div>
    <button class="boton" id="re-guardar">Guardar el plato</button>`,
    (cuerpo, cerrar) => {
      const lista = $('#re-lista', cuerpo);
      const totalEl = $('#re-total', cuerpo);
      const res = $('#re-res', cuerpo);

      const recalcular = () => {
        const t = N.macrosDeReceta(ingredientes, S.cache.alimentos);
        totalEl.innerHTML = ingredientes.length
          ? `<b>${t.kcal} kcal</b> · P ${t.prot} · C ${t.carb} · G ${t.gras}`
            + (t.gramos ? ` · pesa ${t.gramos} g` : '')
            + (t.faltan.length ? `<br><span class="fo-pendiente">Faltan por resolver:
               ${t.faltan.map(esc).join(', ')}</span>` : '')
          : '<span class="nut-media">Todavía no lleva nada.</span>';
        return t;
      };

      const pintarLista = () => {
        lista.innerHTML = ingredientes.map((ing, i) => {
          const a = S.cache.alimentos.find((x) => x.id === ing.alimentoId);
          const m = a ? N.macrosDe(a, ing.cantidad, ing.unidad) : null;
          // El selector de medida POR INGREDIENTE es lo que faltaba: Carlos
          // pedía «ni elegir por unidad», y aquí la unidad era un `<span>`
          // muerto. Va como `<select>` y no como chips porque en una fila de
          // 343 px tres chips dejarían la casilla del número en nada.
          const opciones = N.unidadesDe(a);
          const selector = a
            ? `<select class="fo-unidad-sel" data-u="${i}"
                 aria-label="Medida de ${esc(ing.nombre)}">
                 ${opciones.map((u) => `<option value="${u}" ${u === ing.unidad ? 'selected' : ''}
                   >${esc(u === 'ud' ? N.nombreUd(a, 2) : u)}</option>`).join('')}
               </select>`
            : `<span class="fo-unidad">${esc(ing.unidad)}</span>`;
          const incierto = m && m.incierto;
          return `<div class="fo-fila">
            <div class="fo-txt">
              <div class="fo-nombre">${esc(ing.nombre)}</div>
              <small class="${incierto ? 'fo-pendiente' : ''}">${
                !m ? 'ya no está en tus alimentos'
                   : incierto ? 'no sé lo que pesa una pieza'
                   : `${m.kcal} kcal · P ${m.prot}`}</small>
            </div>
            <input class="fo-gramos" type="number" inputmode="decimal" min="0"
              step="${ing.unidad === 'ud' ? '0.5' : '1'}" value="${esc(ing.cantidad)}"
              data-cant="${i}" aria-label="Cantidad de ${esc(ing.nombre)}">
            ${selector}
            <button class="boton-plano fo-quitar" data-quita="${i}"
              aria-label="Quitar ${esc(ing.nombre)}">${icono('cerrar', 18)}</button>
          </div>`;
        }).join('');

        // `oninput` Y `onchange`: en el WebView de Android las flechitas del
        // teclado numérico no siempre disparan `input`.
        $$('[data-cant]', lista).forEach((el) => {
          const aplicar = () => {
            ingredientes[Number(el.dataset.cant)].cantidad = Number(el.value) || 0;
            // Solo se recalcula el total: repintar la lista entera aquí le
            // quitaría el foco a la casilla en mitad de un número.
            recalcular();
            const fila = el.closest('.fo-fila');
            const ing = ingredientes[Number(el.dataset.cant)];
            const a = S.cache.alimentos.find((x) => x.id === ing.alimentoId);
            const m = a ? N.macrosDe(a, ing.cantidad, ing.unidad) : null;
            const peq = fila && fila.querySelector('small');
            if (peq && m) peq.textContent = m.incierto
              ? 'no sé lo que pesa una pieza' : `${m.kcal} kcal · P ${m.prot}`;
          };
          el.oninput = aplicar;
          el.onchange = aplicar;
        });

        $$('[data-u]', lista).forEach((sel) => (sel.onchange = () => {
          const i = Number(sel.dataset.u);
          const ing = ingredientes[i];
          const a = S.cache.alimentos.find((x) => x.id === ing.alimentoId);
          // Se convierte la cantidad, igual que en la hoja de apuntar. Cambiar
          // «100 g» por «100 uds» sin convertir es el bug de las 8.994 kcal.
          const conv = N.convertir(ing.cantidad, ing.unidad, sel.value, a);
          ing.unidad = sel.value;
          // Sin puente no se arrastra el número: 100 g pasando a «unidades»
          // serían 100 piezas. Se pone 1 y la fila avisa de que falta el peso.
          ing.cantidad = conv !== null ? conv : (sel.value === 'ud' ? 1 : 100);
          pintarLista();
        }));

        $$('[data-quita]', lista).forEach((b) => (b.onclick = () => {
          ingredientes.splice(Number(b.dataset.quita), 1);
          pintarLista();
        }));
        recalcular();
      };

      /**
       * Mete un alimento en el plato.
       *
       * Si ya estaba, SUMA en vez de crear otra fila. Antes se apilaban dos
       * «Avena en copos» de 100 g y desde fuera parecía que la app había
       * registrado dos toques cuando solo hubo uno.
       */
      const anadir = (a) => {
        if (!a) return;
        const ya = ingredientes.find((i) => i.alimentoId === a.id);
        if (ya) {
          const paso = ya.unidad === 'ud' ? 1 : 100;
          ya.cantidad = N.redondea((Number(ya.cantidad) || 0) + paso);
          aviso(`${a.nombre}: ahora ${ya.cantidad} ${ya.unidad}`);
        } else {
          const u = a.unidad || 'g';
          ingredientes.push({
            alimentoId: a.id, nombre: a.nombre, unidad: u,
            cantidad: u === 'ud' ? 1 : 100,
          });
          aviso(`${a.nombre} añadido al plato`);
        }
        // La búsqueda NO se borra. Borrarla hacía que la lista pasara de 2
        // resultados a 12 justo debajo del dedo, y el siguiente toque caía en
        // otro alimento: es lo que Carlos vio como «se seleccionan las 3».
        pintarRes();
        pintarLista();
      };

      const pintarRes = () => {
        // Un plato NO puede llevarse a sí mismo dentro: sería una suma infinita.
        const candidatos = S.cache.alimentos.filter((a) => !receta || a.id !== receta.id);
        const encontrados = N.buscarAlimentos(consulta, candidatos, { limite: 12 });
        const dentro = new Set(ingredientes.map((i) => i.alimentoId));
        res.innerHTML = encontrados.map((a) => `<button class="nut-op" data-add="${a.id}"
            aria-pressed="${dentro.has(a.id)}">
            <span class="nut-op-nombre">${esc(a.nombre)}${
              dentro.has(a.id) ? ' <small>· ya está</small>' : ''}</span>
            <span class="nut-op-det">${esc(N.resumenAlimento(a))}</span></button>`).join('')
          || `<p class="nut-media">Nada tuyo con ese nombre${
               consulta.trim().length >= 3 ? '. Mira abajo en el súper' : ''}.</p>`;
        $$('[data-add]', res).forEach((b) => (b.onclick = () =>
          anadir(S.cache.alimentos.find((x) => x.id === b.dataset.add))));
      };

      // El buscador del súper TAMBIÉN aquí. Antes solo miraba en su despensa, y
      // por eso «no funcionaba»: para montar un bol con su proteína hacía falta
      // salir, buscarla en la otra pantalla y volver.
      const superNet = montarBuscadorSuper($('#re-net', cuerpo), (guardado) => {
        pintarRes();
        anadir(guardado);
      });

      $('#re-buscar', cuerpo).oninput = (e) => {
        consulta = e.target.value;
        pintarRes();
        superNet.escribe(consulta);
      };

      $('#re-guardar', cuerpo).onclick = async () => {
        nombre = $('#re-nombre', cuerpo).value.trim();
        if (!nombre) return aviso('Ponle nombre al plato');
        if (!ingredientes.length) return aviso('Métele algún ingrediente');
        const t = recalcular();
        if (t.faltan.length) return aviso('Hay ingredientes que ya no existen: quítalos');

        // Se guarda con `unidad: 'ud'` = una ración es el plato entero, y sus
        // macros YA sumados (el convenio: en 'ud' los macros son por pieza).
        // `gramosUd` es lo que pesa, así que también se puede apuntar medio bol
        // en gramos. Si algún ingrediente no se pudo pasar a gramos, no se
        // inventa el peso: se queda sin él y entonces solo se mide en raciones.
        const guardado = await db.guardar('alimentos', {
          ...(receta || {}),
          nombre, grupo: 'otro', unidad: 'ud',
          gramosUd: t.gramos || undefined,
          kcal: t.kcal, prot: t.prot, carb: t.carb, gras: t.gras,
          ingredientes, origen: 'receta',
        });
        await recargar();
        cerrar();
        aviso(`«${guardado.nombre}» guardado · ${t.kcal} kcal la ración`);
        if (fechaVolver) abrirAnadirComida(fechaVolver);
        else pintar();
        sync.sincronizar({ silencioso: true });
      };

      pintarLista();
      pintarRes();
    },
    {
      // Con ingredientes dentro, un toque en el fondo ya no tira el plato.
      hayTrabajo: () => ingredientes.length > 0,
      avisoSalir: 'El plato no está guardado: perderías los ingredientes.',
    }
  );
}

/** Objetivo diario. Una sola fila que se pisa a sí misma. */
function abrirObjetivo() {
  const o = objetivoActual();
  const peso = N.pesoActual(S.cache.pesos);
  const chips = (id, lista, activo, campo = 'id') => lista.map((x) =>
    `<button class="chip" data-${id}="${x[campo]}" aria-pressed="${x[campo] === activo}"
       title="${esc(x.nota || '')}">${esc(x.nombre)}</button>`).join('');

  hoja(
    'Objetivo diario',
    `
    <p style="color:var(--texto-2);font-size:.88rem;margin-top:0">
      Dime tus datos una vez y calculo el objetivo. Si prefieres poner tus
      números, escríbelos abajo y dejaré de tocarlos.</p>

    <h3 class="ficha-titulo">Tus datos</h3>
    <div class="campo-fila">
      <div class="campo"><label for="ob-altura">Altura (cm)</label>
        <input type="number" id="ob-altura" inputmode="numeric" min="120" max="230"
          value="${esc(o.alturaCm || '')}"></div>
      <div class="campo"><label for="ob-edad">Edad</label>
        <input type="number" id="ob-edad" inputmode="numeric" min="12" max="100"
          value="${esc(o.edad || '')}"></div>
    </div>
    <label class="etiqueta-grupo">Sexo <small>(cambia la fórmula del metabolismo)</small></label>
    <div class="chips" id="ob-sexo">
      <button class="chip" data-sexo="hombre" aria-pressed="${(o.sexo || 'hombre') === 'hombre'}">Hombre</button>
      <button class="chip" data-sexo="mujer" aria-pressed="${o.sexo === 'mujer'}">Mujer</button>
    </div>
    <label class="etiqueta-grupo">Actividad</label>
    <div class="chips" id="ob-actividad">${chips('act', N.ACTIVIDADES, o.actividad || 'moderado')}</div>
    <p class="chip-explica" id="ob-explica-act"></p>
    <label class="etiqueta-grupo">Qué buscas</label>
    <div class="chips" id="ob-meta">${chips('meta', N.METAS, o.meta || 'mantener')}</div>
    <p class="chip-explica" id="ob-explica-meta"></p>
    <label class="etiqueta-grupo">Proteína por kilo de peso</label>
    <div class="chips" id="ob-prot-regla">
      ${N.REGLAS_PROTEINA.map((r) => `<button class="chip" data-gkg="${r.gPorKg}"
        aria-pressed="${Number(o.gPorKg || 2.0) === r.gPorKg}" title="${esc(r.nota)}"
        >${r.gPorKg} g/kg · ${esc(r.nombre)}</button>`).join('')}
    </div>
    <p class="chip-explica" id="ob-explica-prot"></p>
    <div class="campo"><label for="ob-peso-obj">Peso objetivo (kg) <small>opcional</small></label>
      <input type="number" id="ob-peso-obj" inputmode="decimal" step="0.5" min="30" max="300"
        value="${esc(o.pesoObjetivo || '')}"></div>

    <div class="ficha" id="ob-propuesta" style="margin:14px 0"></div>

    <h3 class="ficha-titulo">El objetivo</h3>
    <div class="campo"><label for="ob-kcal">Calorías (kcal)</label>
      <input type="number" id="ob-kcal" inputmode="numeric" value="${esc(o.kcal)}"></div>
    <div class="campo"><label for="ob-prot">Proteína (g)</label>
      <input type="number" id="ob-prot" inputmode="numeric" value="${esc(o.prot)}"></div>
    <div class="campo"><label for="ob-carb">Carbohidratos (g)</label>
      <input type="number" id="ob-carb" inputmode="numeric" value="${esc(o.carb)}"></div>
    <div class="campo"><label for="ob-gras">Grasas (g)</label>
      <input type="number" id="ob-gras" inputmode="numeric" value="${esc(o.gras)}"></div>
    <p id="ob-aviso" class="nut-aviso oculto"></p>
    <button class="boton" id="ob-guardar">Guardar</button>`,
    (cuerpo, cerrar) => {
      // Estado de la hoja. `aMano` empieza como estaba: si Carlos ya había
      // escrito sus números, no se los pisamos por abrir la pantalla.
      const est = {
        sexo: o.sexo || 'hombre',
        actividad: o.actividad || 'moderado',
        meta: o.meta || 'mantener',
        gPorKg: Number(o.gPorKg || 2.0),
        aMano: !!o.aMano,
      };

      const inp = (id) => $(`#${id}`, cuerpo);
      const leerObjetivo = () => ({
        kcal: Number(inp('ob-kcal').value) || 0,
        prot: Number(inp('ob-prot').value) || 0,
        carb: Number(inp('ob-carb').value) || 0,
        gras: Number(inp('ob-gras').value) || 0,
      });

      const calcular = () => N.objetivoPropuesto({
        pesoKg: peso ? peso.kg : null,
        alturaCm: Number(inp('ob-altura').value) || null,
        edad: Number(inp('ob-edad').value) || null,
        sexo: est.sexo, actividad: est.actividad, meta: est.meta, gPorKg: est.gPorKg,
      });

      const zona = $('#ob-propuesta', cuerpo);
      const pintarPropuesta = () => {
        const p = calcular();
        if (!p) {
          // Se dice QUÉ falta. «No se puede calcular» a secas deja al usuario
          // adivinando cuál de los cuatro datos es el que falta.
          const faltan = [];
          if (!peso) faltan.push('pesarte una vez');
          if (!Number(inp('ob-altura').value)) faltan.push('tu altura');
          if (!Number(inp('ob-edad').value)) faltan.push('tu edad');
          zona.innerHTML = `<p class="nut-media" style="margin:0">Para calcularlo me falta
            ${faltan.join(' y ')}. Sin eso no me lo invento.</p>`;
          return;
        }
        zona.innerHTML = `
          <div class="prop-cabecera">
            <div>
              <div class="prop-kcal">${p.kcal} <small>kcal/día</small></div>
              <div class="prop-detalle">Basal ${p.basal} · gastas ~${p.gasto} · P ${p.prot} · C ${p.carb} · G ${p.gras}</div>
              <div class="prop-detalle">Proteína = ${peso.kg} kg × ${est.gPorKg} g/kg</div>
            </div>
            <button class="boton-plano" id="ob-usar">Usar</button>
          </div>
          ${est.aMano ? '<p class="nut-media" style="margin:8px 0 0">Ahora mismo mandan tus números; esto es solo la propuesta.</p>' : ''}`;
        $('#ob-usar', zona).onclick = () => {
          inp('ob-kcal').value = p.kcal;
          inp('ob-prot').value = p.prot;
          inp('ob-carb').value = p.carb;
          inp('ob-gras').value = p.gras;
          est.aMano = false;          // vuelve a mandar la fórmula
          pintarPropuesta();
          revisar();
          aviso('Objetivo puesto con la fórmula');
        };
      };

      const avisoEl = $('#ob-aviso', cuerpo);
      const revisar = () => {
        const problema = N.revisarCoherencia(leerObjetivo());
        avisoEl.classList.toggle('oculto', !problema);
        if (problema) avisoEl.textContent = problema.replace('has puesto', 'has puesto de objetivo');
      };

      /**
       * Qué significa lo que acabas de elegir, DEBAJO y en números.
       *
       * Carlos: «falta en actividad que salga debajo de cada dia o que salga si
       * lo seleccionas la informacion de cuentos dias equivale o impacto del
       * entreno o duracion».
       *
       * La explicación ya existía... en un `title=`. O sea, en un tooltip del
       * ratón: en un móvil eso NO SE PUEDE VER. Estaba escrita y no la leyó
       * nadie nunca. Ahora sale en pantalla, y además con el número concreto:
       * entre «moderado» y «fuerte» hay ~300 kcal al día, y ese salto se
       * entiende mucho mejor viéndolo que leyendo un adjetivo.
       */
      const pintarExplicaciones = () => {
        const basal = N.metabolismoBasal({
          pesoKg: peso ? peso.kg : null,
          alturaCm: Number(inp('ob-altura').value) || null,
          edad: Number(inp('ob-edad').value) || null,
          sexo: est.sexo,
        });

        const act = N.ACTIVIDADES.find((x) => x.id === est.actividad) || N.ACTIVIDADES[2];
        const sed = N.ACTIVIDADES[0];
        let textoAct = `<b>${act.nombre}:</b> ${act.nota}.`;
        if (basal) {
          const gasto = Math.round(basal * act.factor);
          const extra = gasto - Math.round(basal * sed.factor);
          textoAct += ` Con tu metabolismo son <b>${gasto} kcal/día</b>`
            + (extra > 0 ? `, ${extra} más que si no entrenases.` : '.');
        }
        $('#ob-explica-act', cuerpo).innerHTML = textoAct;

        const meta = N.METAS.find((x) => x.id === est.meta) || N.METAS[1];
        let textoMeta = `<b>${meta.nombre}:</b> ${meta.nota}.`;
        if (basal) {
          const gasto = Math.round(basal * act.factor);
          const objetivo = Math.round(gasto * (1 + meta.ajuste));
          const dif = objetivo - gasto;
          textoMeta += ` Comerías <b>${objetivo} kcal/día</b>`
            + (dif ? ` (${dif > 0 ? '+' : ''}${dif} sobre lo que gastas).` : '.');
        }
        $('#ob-explica-meta', cuerpo).innerHTML = textoMeta;

        const regla = N.REGLAS_PROTEINA.find((r) => r.gPorKg === est.gPorKg) || N.REGLAS_PROTEINA[1];
        $('#ob-explica-prot', cuerpo).innerHTML = `<b>${regla.nombre}:</b> ${regla.nota}.`
          + (peso ? ` Para tus ${peso.kg} kg son <b>${Math.round(peso.kg * est.gPorKg)} g de
             proteína al día</b>.` : '');
      };

      // Grupos de chips: uno solo activo, y al cambiar se recalcula la propuesta.
      const grupo = (contenedorId, attr, alElegir) => {
        const cont = $(`#${contenedorId}`, cuerpo);
        $$(`[data-${attr}]`, cont).forEach((b) => (b.onclick = () => {
          alElegir(b.dataset[attr]);
          $$(`[data-${attr}]`, cont).forEach((x) =>
            x.setAttribute('aria-pressed', x === b));
          pintarPropuesta();
          pintarExplicaciones();
        }));
      };
      grupo('ob-sexo', 'sexo', (v) => (est.sexo = v));
      grupo('ob-actividad', 'act', (v) => (est.actividad = v));
      grupo('ob-meta', 'meta', (v) => (est.meta = v));
      grupo('ob-prot-regla', 'gkg', (v) => (est.gPorKg = Number(v)));

      ['ob-altura', 'ob-edad'].forEach((id) => (inp(id).oninput = () => {
        pintarPropuesta();
        pintarExplicaciones();     // el gasto en kcal depende de estos dos
      }));
      // Tocar los números de abajo es la señal de «lo pongo yo»: a partir de ahí
      // la fórmula deja de reescribirlos cuando cambie el peso.
      ['ob-kcal', 'ob-prot', 'ob-carb', 'ob-gras'].forEach((id) => (inp(id).oninput = () => {
        est.aMano = true;
        revisar();
        pintarPropuesta();
      }));

      pintarPropuesta();
      pintarExplicaciones();

      $('#ob-guardar', cuerpo).onclick = async () => {
        const actual = S.cache.objetivos[0];
        await db.guardar('objetivos', {
          ...(actual || {}),
          ...leerObjetivo(),
          alturaCm: Number(inp('ob-altura').value) || null,
          edad: Number(inp('ob-edad').value) || null,
          pesoObjetivo: Number(inp('ob-peso-obj').value) || null,
          sexo: est.sexo, actividad: est.actividad, meta: est.meta,
          gPorKg: est.gPorKg, aMano: est.aMano,
        });
        await recargar();
        cerrar();
        aviso(est.aMano ? 'Objetivo guardado (tus números)' : 'Objetivo guardado (se recalcula al pesarte)');
        pintar();
        sync.sincronizar({ silencioso: true });
      };
    }
  );
}

/* --------------------------------------------------------------------------
 * FOTO DEL PLATO
 *
 * El reparto de papeles, que es lo único importante de todo esto:
 *   · la FOTO dice qué hay y cuántos gramos (aproximados, y se corrigen);
 *   · la DESPENSA de Carlos pone los macros (exactos, de etiqueta).
 * El modelo no calcula ni una caloría. Si lo hiciera, se las inventaría con una
 * seguridad pasmosa y no habría forma de auditarlo.
 * ------------------------------------------------------------------------ */
function momentoPorLaHora() {
  const h = new Date().getHours();
  return h < 11 ? 'desayuno' : h < 16 ? 'comida' : h < 19 ? 'merienda' : h < 23 ? 'cena' : 'otro';
}

function abrirFoto(fecha) {
  const entrada = document.createElement('input');
  entrada.type = 'file';
  entrada.accept = 'image/*';
  // `capture` abre la cámara directamente en el móvil. En el PC lo ignora y
  // sale el explorador de archivos, que es lo que se quiere allí.
  entrada.capture = 'environment';
  entrada.onchange = async () => {
    const archivo = entrada.files && entrada.files[0];
    if (archivo) await analizarYPreguntar(archivo, fecha);
  };
  entrada.click();
}

async function analizarYPreguntar(archivo, fecha) {
  const momento = momentoPorLaHora();
  aviso('Mirando el plato…', 60000);
  let blob;
  try {
    blob = await C.encoger(archivo);
  } catch {
    blob = archivo;              // si el navegador no puede encoger, va tal cual
  }

  let resultado = null;
  try {
    resultado = await C.analizar(blob);
  } catch (e) {
    // No se pierde NADA: la foto queda encolada y se analiza cuando haya PC.
    // Es la misma regla que las series del gimnasio.
    await db.encolarFoto({ blob, fecha, momento });
    aviso('Sin servidor ahora mismo. La foto queda guardada y la analizo cuando vuelvas a casa.', 5000);
    pintar();
    return;
  }
  aviso('', 1);
  hojaRevisarFoto(resultado, fecha, momento);
}

/**
 * La pantalla de revisar lo detectado. Es OBLIGATORIA: nada entra en la cuenta
 * sin que Carlos lo vea. El modelo se equivoca (llamó pavo a un pollo en las
 * pruebas) y una app que apunta sola lo que cree ver es una app que miente.
 */
function hojaRevisarFoto(resultado, fecha, momentoInicial) {
  let momento = momentoInicial;
  const filas = C.cruzar(resultado.alimentos, {
    alimentos: S.cache.alimentos, vinculos: S.cache.vinculos,
  });

  hoja(
    'Lo que veo en el plato',
    `
    <p style="color:var(--texto-2);font-size:.88rem;margin-top:0">
      Los gramos son una estimación mía: corrígelos, que tú lo estás viendo.
      Las calorías salen de la ficha de cada alimento, no de la foto.</p>
    <p class="nut-media" style="margin-top:0">Debajo de cada uno pone dónde dice
      que lo ha visto. Si eso no está en tu plato, quítalo con la equis: alguna vez
      se inventa un acompañamiento.</p>
    <div class="chips" id="fo-momentos"></div>
    <div id="fo-filas"></div>
    <p class="nut-media" id="fo-total"></p>
    <button class="boton" id="fo-guardar">Añadir al día</button>`,
    (cuerpo, cerrar) => {
      // El chip «+» va aquí y no escondido en Ajustes: el momento en que uno
      // echa en falta «preentreno» es justo cuando está apuntando la comida.
      $('#fo-momentos', cuerpo).innerHTML = N.todosLosMomentos(S.cache.momentos).map(
        (m) => `<button class="chip" data-m="${m.id}" aria-pressed="${m.id === momento}">${esc(m.nombre)}</button>`
      ).join('') + '<button class="chip chip-mas" data-nuevo-momento>+</button>';
      $('[data-nuevo-momento]', cuerpo).onclick = () => { cerrar(); abrirMomentos(); };
      $$('[data-m]', cuerpo).forEach((b) => (b.onclick = () => {
        momento = b.dataset.m;
        $$('[data-m]', cuerpo).forEach((x) => x.setAttribute('aria-pressed', x.dataset.m === momento));
      }));

      const zona = $('#fo-filas', cuerpo);
      const totalEl = $('#fo-total', cuerpo);
      const botonGuardar = $('#fo-guardar', cuerpo);

      const recalcular = () => {
        for (const f of filas) {
          f.macros = f.alimento && f.incluir !== false
            ? N.macrosDe(f.alimento, f.cantidad, f.unidad) : null;
        }
        const t = N.total(filas.filter((f) => f.incluir !== false).map((f) => f.macros).filter(Boolean));
        const pendientes = filas.filter((f) => f.incluir !== false && !f.alimento);
        totalEl.innerHTML = `<b>${t.kcal} kcal</b> · P ${t.prot} · C ${t.carb} · G ${t.gras}` +
          (pendientes.length
            ? `<br><span class="fo-pendiente">Sin identificar: ${pendientes.map((f) => esc(f.detectado)).join(', ')}.
               Toca su nombre para decirme qué es, o quítalo con la equis.</span>`
            : '');
        // El botón dice lo que va a hacer. Antes ponía «Añadir al día» y luego
        // añadía solo la mitad de las líneas: Carlos vio que sus huevos no
        // entraban y no había forma de saber por qué.
        const van = filas.filter((f) => f.incluir !== false && f.alimento && f.cantidad > 0).length;
        botonGuardar.textContent = van === filas.length
          ? 'Añadir al día'
          : `Añadir ${van} de ${filas.length}`;
        botonGuardar.disabled = van === 0;
      };

      const pintarFilas = () => {
        zona.innerHTML = filas.map((f, i) => {
          // El selector de unidad SOLO aparece cuando hay más de una posible.
          // Un botón que no hace nada es peor que no tenerlo.
          const opciones = N.unidadesDe(f.alimento);
          const unidad = f.unidad || opciones[0];
          const selector = opciones.length > 1
            ? `<select class="fo-unidad-sel" data-unidad="${i}"
                 aria-label="Unidad de ${esc(f.detectado)}">
                 ${opciones.map((u) => `<option value="${u}" ${u === unidad ? 'selected' : ''}>${u}</option>`).join('')}
               </select>`
            : `<span class="fo-unidad">${esc(unidad)}</span>`;
          return `
          <div class="fo-fila ${f.incluir === false ? 'fo-fuera' : ''}">
            <div class="fo-txt">
              <div class="fo-nombre">${esc(f.detectado)}</div>
              <button class="fo-alimento ${f.alimento ? '' : 'fo-falta'}" data-elegir="${i}">
                ${f.alimento
                  ? `${esc(f.alimento.nombre)}${f.origen === 'sugerido' ? ' <small>(¿es este?)</small>' : ''}`
                  : 'Dime qué es y lo sumo'}
              </button>
              ${f.donde ? `<small class="fo-donde">lo ve ${esc(f.donde)}</small>` : ''}
              ${f.incierta ? '<small class="fo-falta">No sé lo que pesa una unidad: corrige la cantidad</small>' : ''}
            </div>
            <input class="fo-gramos" type="number" inputmode="decimal" min="0"
              step="${unidad === 'ud' ? '0.5' : '1'}"
              value="${esc(f.cantidad)}" data-cantidad="${i}"
              aria-label="Cantidad de ${esc(f.detectado)}">
            ${selector}
            <button class="boton-plano fo-quitar" data-fuera="${i}"
              aria-label="Quitar ${esc(f.detectado)}">${f.incluir === false ? icono('deshacer', 18) : icono('cerrar', 18)}</button>
          </div>`;
        }).join('');

        $$('[data-cantidad]', zona).forEach((el) => (el.oninput = () => {
          filas[Number(el.dataset.cantidad)].cantidad = Number(el.value) || 0;
          recalcular();
        }));
        $$('[data-unidad]', zona).forEach((sel) => (sel.onchange = () => {
          // Al cambiar de unidad se CONVIERTE la cantidad, no se deja el número
          // tal cual: pasar de «3 ud» a «3 g» de huevo sería otro desastre como
          // el de las 8.994 kcal, pero al revés.
          const f = filas[Number(sel.dataset.unidad)];
          const nueva = sel.value;
          const convertida = N.convertir(f.cantidad, f.unidad, nueva, f.alimento);
          f.cantidad = convertida === null ? f.cantidad : convertida;
          f.unidad = nueva;
          pintarFilas();
        }));
        $$('[data-fuera]', zona).forEach((b) => (b.onclick = () => {
          const f = filas[Number(b.dataset.fuera)];
          f.incluir = f.incluir === false ? true : false;
          pintarFilas();
          recalcular();
        }));
        $$('[data-elegir]', zona).forEach((b) => (b.onclick = () => {
          const i = Number(b.dataset.elegir);
          elegirAlimentoPara(filas[i], () => {
            pintarFilas();
            recalcular();
          });
        }));
        recalcular();
      };

      pintarFilas();

      botonGuardar.onclick = async () => {
        const buenas = filas.filter((f) => f.incluir !== false && f.alimento && f.cantidad > 0);
        if (!buenas.length) return aviso('No hay nada que añadir');

        // Lo que se queda fuera se DICE. El fallo que reportó Carlos: la foto
        // detectó huevos y zumo, él le dio a «Añadir al día», y solo entró el
        // aguacate. Nada avisaba de que faltaban dos y el total mentía por
        // debajo. Ahora, o los identifica, o al menos sabe lo que no ha sumado.
        const fuera = filas.filter((f) => f.incluir !== false && (!f.alimento || !(f.cantidad > 0)));

        for (const f of buenas) {
          const m = N.macrosDe(f.alimento, f.cantidad, f.unidad);
          await db.guardar('comidas', {
            fecha, momento, nombre: f.alimento.nombre, alimentoId: f.alimento.id,
            cantidad: f.cantidad, unidad: f.unidad || f.alimento.unidad || 'g',
            ...m, origen: 'foto',
          });
          // Se aprende el vínculo: la próxima foto que diga «crema de arroz» ya
          // sabrá que la suya es la de Hero, sin preguntar otra vez.
          await C.vincular(f.detectado, f.alimento.id, S.cache.vinculos);
        }
        await recargar();
        cerrar();
        aviso(fuera.length
          ? `Añadidos ${buenas.length}. Sin identificar y NO sumados: ${fuera.map((f) => f.detectado).join(', ')}`
          : `${buenas.length} ${buenas.length === 1 ? 'alimento añadido' : 'alimentos añadidos'}`,
          fuera.length ? 5200 : 2100);
        pintar();
        sync.sincronizar({ silencioso: true });
      };
    }
  );
}

/**
 * Elegir qué es de verdad un alimento detectado: de la despensa o de Open Food
 * Facts. Aquí es donde Carlos dice «esa crema de arroz es la de Hero» y a
 * partir de entonces la app deja de preguntarlo.
 */
function elegirAlimentoPara(fila, alElegir) {
  let consulta = fila.detectado;

  hoja(
    `¿Qué es «${fila.detectado}»?`,
    `
    <input class="buscador" type="search" id="el-buscar" placeholder="Buscar…" value="${esc(consulta)}">
    <div class="chips" style="margin-top:0">
      <button class="chip" id="el-mios" aria-pressed="true">Mis alimentos</button>
      <button class="chip" id="el-off" aria-pressed="false">Productos del súper</button>
    </div>
    <div id="el-res" class="nut-resultados"></div>
    <button class="boton boton-2" id="el-nuevo" style="margin-top:10px">Crear uno nuevo</button>`,
    (cuerpo, cerrar) => {
      let fuente = 'mios';
      const res = $('#el-res', cuerpo);
      const inp = $('#el-buscar', cuerpo);

      const elegir = (alimento) => {
        fila.alimento = alimento;
        fila.origen = 'elegido';
        // RECONVERTIR. Aquí es donde saltaban las 8.994 kcal: la foto dice
        // «110 g de huevo frito», Carlos elige «Huevo» (que va por unidades) y
        // el 110 se quedaba tal cual = 110 huevos. Se recalcula desde lo que
        // dijo la FOTO, no desde lo que hubiera en el campo, porque el campo ya
        // puede estar en otra unidad de un cambio anterior.
        const r = C.acomodar(
          fila.cantidadDetectada ?? fila.cantidad,
          fila.unidadDetectada || 'g',
          alimento
        );
        fila.cantidad = r.cantidad;
        fila.unidad = r.unidad;
        fila.incierta = r.incierta;
        cerrar();
        alElegir();
        if (r.incierta) {
          aviso(`No sé lo que pesa una unidad de ${alimento.nombre}: he puesto 1, corrígelo`, 4200);
        }
      };

      const pintarMios = () => {
        const lista = N.buscarAlimentos(consulta, S.cache.alimentos, { limite: 40 });
        res.innerHTML = lista.length
          ? lista.map((a) => `<button class="nut-op" data-mio="${a.id}">
              <span class="nut-op-nombre">${esc(a.nombre)}</span>
              <span class="nut-op-det">${esc(N.resumenAlimento(a))}</span></button>`).join('')
          : '<p class="nut-media">Nada con ese nombre en tus alimentos.</p>';
        $$('[data-mio]', res).forEach((b) => (b.onclick = () =>
          elegir(S.cache.alimentos.find((a) => a.id === b.dataset.mio))));
      };

      const pintarOff = async () => {
        res.innerHTML = '<p class="nut-media">Buscando en Open Food Facts…</p>';
        const r = await C.buscarProducto(consulta);
        if (r.sinServidor) {
          res.innerHTML = `<p class="nut-media">Necesito el servidor del PC para buscar
            productos. Puedes elegir de tus alimentos o crear uno nuevo.</p>`;
          return;
        }
        if (r.saturado) {
          // La verdad, no un «no encontrado» que sería mentira.
          res.innerHTML = `<p class="nut-media">Open Food Facts está saturado ahora mismo
            (admite pocas búsquedas por minuto). Prueba en un rato, o crea el alimento
            copiando la etiqueta.</p>`;
          return;
        }
        if (!r.productos.length) {
          res.innerHTML = '<p class="nut-media">Ningún producto con ese nombre.</p>';
          return;
        }
        res.innerHTML = r.productos.map((p, i) => `<button class="nut-op nut-op-foto" data-off="${i}">
          ${p.foto ? `<img src="${esc(p.foto)}" alt="" referrerpolicy="no-referrer">`
                   : `<span class="nut-sinfoto">${icono('carro', 22)}</span>`}
          <span class="nut-op-txt">
            <span class="nut-op-nombre">${esc(p.nombre)}</span>
            <span class="nut-op-det">${esc(p.marca || 'sin marca')} · ${
              p.sinTabla ? 'sin tabla en el envase' : `${Math.round(p.kcal)} kcal/100 g`
            }${p.racion ? ` · ${esc(p.racion.texto)}` : ''}</span>
          </span></button>`).join('');
        $$('[data-off]', res).forEach((b) => (b.onclick = async () => {
          const p = r.productos[Number(b.dataset.off)];
          // Misma conversión que en «Añadir comida»: un solo sitio decide cómo
          // se traduce un producto del súper a una ficha (con su ración, su
          // scoop y, si no trae tabla, los macros del genérico de USDA).
          const ficha = fichaDeProducto(p);
          if (!ficha) {
            return aviso('Ese producto no trae tabla y no sé a qué se parece. '
                       + 'Créalo copiando la etiqueta.', 4200);
          }
          // Se guarda en la despensa de Carlos: así funciona sin cobertura la
          // próxima vez y no depende de que Open Food Facts esté disponible.
          const guardado = await db.guardar('alimentos', ficha);
          await recargar();
          elegir(guardado);
        }));
      };

      const refrescar = () => (fuente === 'mios' ? pintarMios() : pintarOff());

      inp.oninput = () => {
        consulta = inp.value;
        // Freno: Open Food Facts admite 10 búsquedas por minuto. Sin esto, una
        // palabra de 8 letras dispararía 8 llamadas y nos capaba la IP.
        clearTimeout(inp._reloj);
        inp._reloj = setTimeout(refrescar, fuente === 'off' ? 550 : 60);
      };

      $('#el-mios', cuerpo).onclick = () => {
        fuente = 'mios';
        $('#el-mios', cuerpo).setAttribute('aria-pressed', 'true');
        $('#el-off', cuerpo).setAttribute('aria-pressed', 'false');
        refrescar();
      };
      $('#el-off', cuerpo).onclick = () => {
        fuente = 'off';
        $('#el-mios', cuerpo).setAttribute('aria-pressed', 'false');
        $('#el-off', cuerpo).setAttribute('aria-pressed', 'true');
        refrescar();
      };
      $('#el-nuevo', cuerpo).onclick = () => {
        cerrar();
        editarAlimento({ nombre: fila.detectado, kcal: 0, prot: 0, carb: 0, gras: 0, unidad: 'g' });
      };

      pintarMios();
    }
  );
}

/* --------------------------------------------------------------------------
 * PLATOS GUARDADOS
 *
 * Lo que pidió Carlos con su desayuno: crema de arroz + avena + 2 scoops de
 * proteína + una cucharada de miel. Se guarda una vez y entra de un toque, con
 * los macros de los productos REALES que él eligió.
 * ------------------------------------------------------------------------ */
function pintarPlatosRapidos(zona, fecha) {
  if (!zona) return;
  const platos = (S.cache.platos || []).filter((p) => !p.del);
  const hoyComidas = comidasDe(fecha);
  if (!platos.length && hoyComidas.length < 2) {
    zona.innerHTML = '';
    return;
  }
  zona.innerHTML = `
    <div class="platos-fila">
      ${platos.map((p) => `<button class="plato-chip" data-plato="${p.id}">
          <b>${esc(p.nombre)}</b><small>${p.kcal || 0} kcal</small></button>`).join('')}
      ${hoyComidas.length >= 2
        ? '<button class="plato-chip plato-nuevo" id="pl-guardar">+ Guardar lo de hoy</button>'
        : ''}
    </div>`;

  $$('[data-plato]', zona).forEach((b) => (b.onclick = () =>
    abrirPlato(platos.find((p) => p.id === b.dataset.plato), fecha)));

  const btn = $('#pl-guardar', zona);
  if (btn) btn.onclick = () => guardarPlatoDeHoy(fecha);
}

/** Añade un plato guardado, dejando corregir las cantidades antes. */
function abrirPlato(plato, fecha) {
  if (!plato) return;
  let momento = momentoPorLaHora();
  // Se resuelven contra la despensa ACTUAL: si Carlos cambió la ficha de un
  // producto, el plato usa la nueva. Y si borró un alimento, esa línea sale
  // marcada en vez de desaparecer sin más.
  const filas = (plato.lineas || []).map((l) => {
    const alimento = S.cache.alimentos.find((a) => !a.del && a.id === l.alimentoId);
    return { detectado: l.nombre, gramos: l.cantidad, alimento, origen: 'plato', macros: null };
  });

  hoja(
    plato.nombre,
    `
    <div class="chips" id="pp-momentos" style="margin-top:0"></div>
    <div id="pp-filas"></div>
    <p class="nut-media" id="pp-total"></p>
    <button class="boton" id="pp-anadir">Añadir al día</button>
    <button class="boton boton-2" id="pp-borrar" style="margin-top:10px">Borrar este plato</button>`,
    (cuerpo, cerrar) => {
      // El chip «+» va aquí y no escondido en Ajustes: el momento en que uno
      // echa en falta «preentreno» es justo cuando está apuntando la comida.
      $('#pp-momentos', cuerpo).innerHTML = N.todosLosMomentos(S.cache.momentos).map(
        (m) => `<button class="chip" data-m="${m.id}" aria-pressed="${m.id === momento}">${esc(m.nombre)}</button>`
      ).join('') + '<button class="chip chip-mas" data-nuevo-momento>+</button>';
      $('[data-nuevo-momento]', cuerpo).onclick = () => { cerrar(); abrirMomentos(); };
      $$('[data-m]', cuerpo).forEach((b) => (b.onclick = () => {
        momento = b.dataset.m;
        $$('[data-m]', cuerpo).forEach((x) => x.setAttribute('aria-pressed', x.dataset.m === momento));
      }));

      const zona = $('#pp-filas', cuerpo);
      const totalEl = $('#pp-total', cuerpo);
      const recalcular = () => {
        for (const f of filas) f.macros = f.alimento ? N.macrosDe(f.alimento, f.gramos) : null;
        const t = N.total(filas.map((f) => f.macros).filter(Boolean));
        totalEl.innerHTML = `<b>${t.kcal} kcal</b> · P ${t.prot} · C ${t.carb} · G ${t.gras}`;
      };
      zona.innerHTML = filas.map((f, i) => `
        <div class="fo-fila">
          <div class="fo-txt">
            <div class="fo-nombre">${esc(f.detectado)}</div>
            ${f.alimento ? '' : '<small class="fo-falta">Ese alimento ya no está en tu lista</small>'}
          </div>
          <input class="fo-gramos" type="number" inputmode="decimal" min="0" step="1"
            value="${esc(f.gramos)}" data-g="${i}" ${f.alimento ? '' : 'disabled'}
            aria-label="Cantidad de ${esc(f.detectado)}">
          <span class="fo-unidad">${f.alimento && f.alimento.unidad === 'ud' ? 'ud' : 'g'}</span>
        </div>`).join('');
      $$('[data-g]', zona).forEach((el) => (el.oninput = () => {
        filas[Number(el.dataset.g)].gramos = Number(el.value) || 0;
        recalcular();
      }));
      recalcular();

      $('#pp-anadir', cuerpo).onclick = async () => {
        const buenas = filas.filter((f) => f.alimento && f.gramos > 0);
        if (!buenas.length) return aviso('Este plato no tiene nada que añadir');
        for (const f of buenas) {
          await db.guardar('comidas', {
            fecha, momento, nombre: f.alimento.nombre, alimentoId: f.alimento.id,
            cantidad: f.gramos, unidad: f.alimento.unidad || 'g',
            ...N.macrosDe(f.alimento, f.gramos), origen: 'plato',
          });
        }
        await recargar();
        cerrar();
        aviso(`${plato.nombre} añadido`);
        pintar();
        sync.sincronizar({ silencioso: true });
      };

      $('#pp-borrar', cuerpo).onclick = async () => {
        await db.borrar('platos', plato.id);
        await recargar();
        cerrar();
        aviso('Plato borrado');
        pintar();
        sync.sincronizar({ silencioso: true });
      };
    }
  );
}

/** Convierte lo comido hoy (o un momento del día) en un plato reutilizable. */
function guardarPlatoDeHoy(fecha) {
  const hoyComidas = comidasDe(fecha);
  const grupos = N.porMomento(hoyComidas, S.cache.momentos);

  hoja(
    'Guardar como plato',
    `
    <p style="color:var(--texto-2);font-size:.88rem;margin-top:0">
      Para no volver a apuntar lo mismo cada mañana. Elige qué guardar y ponle
      nombre.</p>
    <div class="chips" id="gp-que" style="margin-top:0">
      <button class="chip" data-q="todo" aria-pressed="true">Todo el día</button>
      ${grupos.map((g) => `<button class="chip" data-q="${g.id}" aria-pressed="false">${esc(g.nombre)}</button>`).join('')}
    </div>
    <div class="campo"><label for="gp-nombre">Nombre</label>
      <input type="text" id="gp-nombre" placeholder="Mi desayuno" autocomplete="off"></div>
    <p class="nut-media" id="gp-previo"></p>
    <button class="boton" id="gp-guardar">Guardar plato</button>`,
    (cuerpo, cerrar) => {
      let que = 'todo';
      const previo = $('#gp-previo', cuerpo);
      const nombreInp = $('#gp-nombre', cuerpo);

      const seleccionadas = () =>
        que === 'todo' ? hoyComidas : hoyComidas.filter((c) => (c.momento || 'otro') === que);

      const refrescar = () => {
        const cs = seleccionadas();
        const t = N.total(cs);
        previo.innerHTML = `${cs.length} ${cs.length === 1 ? 'alimento' : 'alimentos'} ·
          <b>${t.kcal} kcal</b> · P ${t.prot} · C ${t.carb} · G ${t.gras}`;
        if (!nombreInp.value && que !== 'todo') {
          const m = N.todosLosMomentos(S.cache.momentos).find((x) => x.id === que);
          nombreInp.placeholder = `Mi ${(m ? m.nombre : '').toLowerCase()}`;
        }
      };

      $$('[data-q]', cuerpo).forEach((b) => (b.onclick = () => {
        que = b.dataset.q;
        $$('[data-q]', cuerpo).forEach((x) => x.setAttribute('aria-pressed', x === b));
        refrescar();
      }));
      refrescar();

      $('#gp-guardar', cuerpo).onclick = async () => {
        const cs = seleccionadas();
        if (!cs.length) return aviso('No hay nada que guardar');
        const nombre = nombreInp.value.trim() || nombreInp.placeholder || 'Mi plato';
        const t = N.total(cs);
        await db.guardar('platos', {
          nombre, kcal: t.kcal, prot: t.prot, carb: t.carb, gras: t.gras,
          // Se guardan las LÍNEAS (alimento + cantidad), no los macros, para que
          // el plato siga la ficha del producto si Carlos la corrige. Los macros
          // de arriba son solo para enseñarlos en el botón sin recalcular.
          lineas: cs.map((c) => ({ alimentoId: c.alimentoId, nombre: c.nombre, cantidad: c.cantidad })),
        });
        await recargar();
        cerrar();
        aviso(`Plato «${nombre}» guardado`);
        pintar();
        sync.sincronizar({ silencioso: true });
      };
    }
  );
}

/* --------------------------------------------------------------------------
 * MOMENTOS DEL DÍA PROPIOS
 *
 * Carlos: «crea la nueva categoria preentreno o algo asi, y el usuario dice
 * vale este preentreno se llama bol pregym y lleva x gramos de arroz…».
 *
 * O sea, dos cosas: poder inventarse un momento del día, y poder guardar un
 * plato dentro de él. Lo segundo ya funcionaba (los platos guardan su momento);
 * lo que faltaba era lo primero.
 * ------------------------------------------------------------------------ */
function abrirMomentos() {
  hoja(
    'Momentos del día',
    `
    <p style="color:var(--texto-2);font-size:.88rem;margin-top:0">
      Los tuyos, para lo que la app no trae: preentreno, postentreno, batido de
      la noche… Luego puedes guardar platos dentro de cada uno.</p>
    <div id="mo-lista"></div>
    <div class="campo"><label for="mo-nombre">Nombre del momento</label>
      <input type="text" id="mo-nombre" placeholder="Preentreno" autocomplete="off"></div>
    <label class="etiqueta-grupo">¿Cuándo, más o menos?</label>
    <div class="chips" id="mo-cuando"></div>
    <button class="boton" id="mo-crear">Crear momento</button>`,
    (cuerpo, cerrar) => {
      // El «cuándo» no es cosmético: coloca el momento en su hueco del día. Sin
      // esto, «preentreno» saldría después de la cena solo por haberlo creado
      // el último, y la lista del día dejaría de leerse en orden.
      const HUECOS = [
        { id: 'manana', nombre: 'Por la mañana', orden: 15 },
        { id: 'mediodia', nombre: 'Al mediodía', orden: 25 },
        { id: 'tarde', nombre: 'Por la tarde', orden: 45 },
        { id: 'noche', nombre: 'Por la noche', orden: 55 },
      ];
      let hueco = 'tarde';

      $('#mo-cuando', cuerpo).innerHTML = HUECOS.map(
        (h) => `<button class="chip" data-h="${h.id}" aria-pressed="${h.id === hueco}">${esc(h.nombre)}</button>`
      ).join('');
      $$('[data-h]', cuerpo).forEach((b) => (b.onclick = () => {
        hueco = b.dataset.h;
        $$('[data-h]', cuerpo).forEach((x) => x.setAttribute('aria-pressed', x.dataset.h === hueco));
      }));

      const pintarLista = () => {
        const mios = (S.cache.momentos || []).filter((m) => !m.del);
        const lista = $('#mo-lista', cuerpo);
        lista.innerHTML = mios.length
          ? mios.map((m) => `<div class="fo-fila">
              <div class="fo-txt"><div class="fo-nombre">${esc(m.nombre)}</div></div>
              <button class="boton-plano fo-quitar" data-borrar="${m.id}"
                aria-label="Borrar ${esc(m.nombre)}">${icono('cerrar', 18)}</button></div>`).join('')
          : '<p class="nut-media">Todavía no has creado ninguno.</p>';
        $$('[data-borrar]', lista).forEach((b) => (b.onclick = async () => {
          // Borrado lógico: las comidas ya apuntadas en ese momento siguen
          // existiendo y siguen sumando en el total del día. Solo desaparece
          // como opción para lo nuevo.
          await db.borrar('momentos', b.dataset.borrar);
          await recargar();
          pintarLista();
          pintar();
          sync.sincronizar({ silencioso: true });
        }));
      };
      pintarLista();

      $('#mo-crear', cuerpo).onclick = async () => {
        const nombre = $('#mo-nombre', cuerpo).value.trim();
        if (!nombre) return aviso('Ponle un nombre');
        const yaEsta = N.todosLosMomentos(S.cache.momentos)
          .some((m) => quitarTildes(m.nombre) === quitarTildes(nombre));
        if (yaEsta) return aviso(`Ya tienes un momento llamado «${nombre}»`);
        await db.guardar('momentos', {
          nombre,
          orden: (HUECOS.find((h) => h.id === hueco) || HUECOS[2]).orden,
        });
        await recargar();
        $('#mo-nombre', cuerpo).value = '';
        pintarLista();
        aviso(`Momento «${nombre}» creado`);
        pintar();
        sync.sincronizar({ silencioso: true });
      };
    }
  );
}

/**
 * Pone al día la base de alimentos. Se ejecuta EN CADA ARRANQUE, a propósito.
 *
 * EL FALLO QUE ARREGLA (y que costó toda una versión)
 * ---------------------------------------------------
 * Antes esto solo se llamaba con el almacén VACÍO:
 *     if (!(await db.todos('alimentos')).length) await sembrarAlimentos();
 * Carlos ya tenía los 34 alimentos de la v0.3.0 —los hechos a ojo—, así que su
 * almacén nunca estaba vacío y los 88 de USDA NO LLEGARON A SU MÓVIL JAMÁS. Él
 * lo vio desde fuera y con razón: «no hay ni zanahoria ni longaniza ni
 * butifarra» y «no se siquiera de donde coño lo has sacado». La zanahoria
 * llevaba semanas en el código; lo que fallaba era el reparto.
 *
 * Y buscando «zanahoria» le salían manzana y merluza porque «manZANAhoria» no,
 * pero al teclear «zana» **man-zana** casa, y «za» casa con merlu-**za**. Con
 * 34 alimentos y sin el que buscas, el buscador solo puede enseñar basura.
 *
 * CÓMO NO PISAR LO SUYO
 * ---------------------
 * Los de la base se marcan con `origen: 'base'`. Se actualiza una ficha solo si
 * es de la base (o si es una de las 34 viejas, que no llevan marca). Lo que
 * Carlos crea a mano va con `origen: 'mio'` y NO SE TOCA NUNCA, aunque se llame
 * igual que uno de los nuestros: sus números mandan sobre los míos.
 *
 * SOLO SE ESCRIBE SI ALGO CAMBIA. Si no, cada arranque marcaría 170 fichas como
 * modificadas y la sincronización mandaría la base entera al PC cada vez.
 */
const CAMPOS_BASE = ['grupo', 'kcal', 'prot', 'carb', 'gras', 'unidad',
                     'gramosUd', 'nombreUd', 'fibra', 'alcohol', 'factoresPropios',
                     'noSoloMacros', 'fuentes', 'marca'];

export async function sembrarAlimentos() {
  const hay = await db.todos('alimentos', { incluirBorrados: true });
  const porNombre = new Map(hay.map((a) => [quitarTildes(a.nombre || ''), a]));
  let nuevos = 0;
  let puestosAlDia = 0;

  for (const base of N.ALIMENTOS_BASE) {
    const mio = porNombre.get(quitarTildes(base.nombre));

    if (!mio) {
      await db.guardar('alimentos', { ...base, origen: 'base' });
      nuevos++;
      continue;
    }
    // Suyo = intocable. Un alimento que él haya creado o escaneado del súper
    // manda sobre la base aunque coincida el nombre.
    if (mio.origen && mio.origen !== 'base') continue;

    // Si lo borró a posta, se queda borrado: resucitarlo en cada arranque sería
    // pelearse con él.
    if (mio.del) continue;

    const cambios = {};
    for (const c of CAMPOS_BASE) {
      const nuevo = base[c] === undefined ? null : base[c];
      const viejo = mio[c] === undefined ? null : mio[c];
      if (nuevo !== viejo) cambios[c] = base[c];
    }
    if (mio.origen !== 'base') cambios.origen = 'base';
    if (!Object.keys(cambios).length) continue;

    // `undefined` no se puede guardar en IndexedDB, y además dejaría el campo
    // viejo puesto: los alimentos que dejan de tener fibra tienen que perderla.
    const puesto = { ...mio, ...cambios };
    for (const c of CAMPOS_BASE) if (puesto[c] === undefined) delete puesto[c];
    await db.guardar('alimentos', puesto);
    puestosAlDia++;
  }
  return { nuevos, puestosAlDia };
}

/**
 * Ajustes.
 *
 * OJO con `#a-direcciones`: va FUERA de la botonera, y ese era el bug visual
 * que vio Carlos. La botonera es una fila flex que le da `flex:1` a todos sus
 * hijos, así que la lista de direcciones metida dentro se convertía en una
 * columna estrujada al lado de los botones: las URLs se partían letra a letra
 * («htt p://19 2.168.») y la tarjeta se salía de la pantalla. No era el texto
 * largo, era estar colgada donde no iba.
 */
async function pintarAjustes(raiz) {
  const cfg = await sync.configuracion();
  const pend = await sync.pendientes();
  const tema = document.documentElement.dataset.tema || 'oscuro';
  const propio = await temaPropio();
  const mios = await temasGuardados();
  // La muestra de un tema propio se calcula con el MISMO motor que lo pinta:
  // así el cuadradito de la lista es el tema de verdad y no una aproximación.
  const muestraDe = (t) => {
    const v = TEM.variables(t);
    return { fondo: v['--fondo'], borde: v['--borde'], acento: v['--acento'], texto: v['--texto'] };
  };

  // EL APARTADO DEL PC YA NO SALE DE FÁBRICA.  (1-sep-2026)
  //
  // Carlos: *«cuando entras a la app sigues viendo lo de JARVIS; me gustaría
  // que quitases todas esas referencias a ese proyecto, porque no tiene sentido
  // si vamos a publicar la app. Déjalo para mí, para uso personal, para poder
  // configurar mis datos»*.
  //
  // Tenía dos razones y las dos son buenas: el nombre de otro proyecto suyo no
  // pinta nada en Google Play, y un apartado que pide «la dirección del PC» y
  // barre la red local es, para cualquiera que no sea él, una pantalla rota que
  // además pide permisos raros.
  //
  // POR QUÉ NO ES UNA RAMA APARTE, que es lo que pidió. Una rama con una
  // pantalla de más se separa de la buena en cuanto se toque otra cosa, y
  // acabaríamos manteniendo dos apps y compilando dos APK — y ya hubo un
  // 30-ago-2026 en el que se construyó una versión entera sobre la rama
  // equivocada. Es la MISMA app con un interruptor: siete toques en la línea de
  // la versión, como los ajustes de desarrollador de Android. Nadie lo
  // encuentra sin que se lo digan, y no hay dos códigos que mantener.
  const modoPersonal = !!(await db.ajuste(CLAVE_MODO_PERSONAL, false));
  const sonidoOn = !!(await db.ajuste(CLAVE_SONIDO, true));
  raiz.innerHTML = `
    ${!modoPersonal ? '' : `
    <div class="ficha">
      <h3 class="ficha-titulo">Sincronizar con el PC</h3>
      <p style="color:var(--texto-2);font-size:.89rem;margin-top:0">
        Apuntas en el gimnasio aunque no haya cobertura. Cuando el móvil vuelve a la WiFi
        de casa, esto lo manda al PC.</p>
      <div class="campo"><label for="a-url">Dirección del PC</label>
        <input type="url" id="a-url" value="${esc(cfg.url)}" placeholder="http://192.168.1.39:8770"></div>
      <div class="campo"><label for="a-token">Clave (opcional)</label>
        <input type="text" id="a-token" value="${esc(cfg.token || '')}" placeholder="deja vacío si no usas clave"></div>
      <div class="botonera" style="margin-top:0">
        <button class="boton boton-2" id="a-probar">Probar conexión</button>
        <button class="boton" id="a-sync">Sincronizar ya</button>
      </div>
      <div class="botonera">
        <button class="boton boton-2" id="a-buscar">Buscar el PC en la red</button>
      </div>
      <div id="a-direcciones"></div>
      <p id="a-estado" style="font-size:.88rem;color:var(--texto-2);margin-bottom:0">
        ${pend ? `<span class="estado-sync pendiente">${pend} cambios esperando WiFi</span>` : '<span class="estado-sync ok">Todo sincronizado</span>'}
      </p>
    </div>`}

    <div class="ficha">
      <h3 class="ficha-titulo">Aspecto</h3>
      <div class="temas">
        ${TEMAS.map((t) => `
          <button class="tema" data-tema="${t.id}" aria-pressed="${tema === t.id}">
            <span class="tema-muestra" style="background:${t.fondo};border-color:${t.borde}">
              <span style="background:${t.acento}"></span>
              <span style="background:${t.texto}"></span>
            </span>
            <span class="tema-nombre">${t.nombre}</span>
          </button>`).join('')}
        ${mios.map((t, i) => {
          const m = muestraDe(t);
          return `
          <button class="tema" data-mio="${i}" aria-pressed="${tema === 'propio' && propio.nombre === t.nombre}">
            <span class="tema-muestra" style="background:${m.fondo};border-color:${m.borde}">
              <span style="background:${m.acento}"></span>
              <span style="background:${m.texto}"></span>
            </span>
            <span class="tema-nombre">${esc(t.nombre)}</span>
            <span class="tema-borrar" data-borrar="${i}" role="button" tabindex="0"
              aria-label="Borrar el tema ${esc(t.nombre)}">×</span>
          </button>`;
        }).join('')}
        <button class="tema tema-nuevo" id="a-estudio">
          <span class="tema-muestra tema-mas">+</span>
          <span class="tema-nombre">Hacer uno</span>
        </button>
      </div>
      <p class="nut-media" style="margin-bottom:0">Colores, fondo, esquinas y tamaño de la
        letra. Los temas se pueden <b>guardar, exportar e importar</b>: toca «Hacer uno».</p>
    </div>

    <!-- ESTA VERSIÓN, Y SI EL MAPA LLEGA A OPENSTREETMAP.  (1-sep-2026)
         Existe por dos motivos concretos, los dos de esta semana:

         1. «El mapa está roto» se arregló en la 0.18.0, pero no había forma de
            saber QUÉ VERSIÓN tiene puesta el móvil, así que no se podía
            distinguir «sigue roto» de «todavía no has instalado el arreglo».
            Ahora se ve el número, y el de la caché del service worker al lado:
            si el APK es nuevo y la caché es vieja, es que abrió sin cobertura.

         2. El mapa habla con OpenStreetMap, y desde el ordenador donde se
            programa esa salida está BLOQUEADA: los tests usan un Nominatim y
            unas teselas fingidas. O sea que el único sitio del mundo donde se
            puede saber si el mapa funciona de verdad es este móvil. -->
    <div class="ficha">
      <h3 class="ficha-titulo">Esta versión</h3>
      <p class="nut-media" style="margin-top:0" id="a-linea-version">App <b id="a-version">…</b> ·
        caché <b id="a-cache">…</b>${modoPersonal ? ' · <b>modo personal</b>' : ''}</p>
      <div class="botonera" style="margin-top:0">
        <button class="boton boton-2" id="a-probar-mapa">Probar el mapa</button>
        <button class="boton boton-2" id="a-efectos">Efectos en alta</button>
      </div>
      <div id="a-mapa-resultado"></div>
      <p class="nut-media" id="a-efectos-estado" style="margin-bottom:0"></p>
      <p class="nut-media" style="margin-bottom:0">Si el mapa no va, dale y pásame lo que
        salga: dice si el problema es la conexión, el buscador de direcciones o las
        imágenes del mapa. Sin eso solo se puede adivinar.</p>
    </div>

    <!-- La cola vive en su propia pantalla (Perfil › Moderación). Aquí solo
         está la puerta, y solo si esta cuenta modera — lo dice la BASE
         (soy_moderador), no este HTML: esconder un botón no es un permiso. -->
    <div class="ficha" id="a-moderacion" hidden>
      <h3 class="ficha-titulo">Moderación</h3>
      <p class="nut-media" style="margin-top:0">Solicitudes de gimnasio y denuncias.</p>
      <button class="boton boton-2" id="a-mod-abrir">Abrir el panel</button>
    </div>

    <div class="ficha">
      <h3 class="ficha-titulo">Sonido y vibración</h3>
      <div class="cfg-opcion">
        <div class="cfg-opcion-texto">
          <b>Sonido</b>
          <span>Los golpes de abrir una caja y de desbloquear una medalla. Se sintetizan en el
            momento: no se descarga nada y no pesan nada.</span>
        </div>
        <button type="button" class="interruptor" id="a-sonido" role="switch"
                aria-checked="${sonidoOn}" aria-label="Sonido"><span></span></button>
      </div>
      <p class="campo-nota" style="margin-bottom:0">La vibración la manda tu móvil: si la tienes
        apagada en los ajustes del sistema, aquí tampoco vibrará.</p>
    </div>
${!modoPersonal ? '' : `
    <div class="ficha">
      <h3 class="ficha-titulo">Banco de pruebas</h3>
      <p style="color:var(--texto-2);font-size:.89rem;margin-top:0">
        Magnesio y cajas de mentira para ver las animaciones del vestuario sin esperar
        cuarenta días. Queda marcado como de pruebas.</p>
      <button class="boton boton-2" id="a-banco">Abrir el banco de pruebas</button>
    </div>`}

    <div class="ficha">
      <h3 class="ficha-titulo">Datos</h3>
      <div class="botonera" style="margin-top:0">
        <button class="boton boton-2" id="a-exportar">Exportar copia</button>
        <button class="boton boton-2" id="a-ejemplo">Cargar gimnasios</button>
      </div>
      <div class="botonera">
        <button class="boton boton-peligro" id="a-borrar">Borrar TODO</button>
      </div>
    </div>

    <div class="ficha">
      <h3 class="ficha-titulo">Créditos de las fotos</h3>
      <p style="color:var(--texto-2);font-size:.89rem;margin-top:0">
        Las ${fotos.CREDITOS.length} fotos del catálogo salen de Wikimedia Commons, con licencia
        libre. Las CC&nbsp;BY y CC&nbsp;BY-SA obligan a citar al autor: aquí están.</p>
      <button class="boton boton-2" id="a-creditos">Ver los ${fotos.CREDITOS.length} autores</button>
    </div>

    <p style="text-align:center;color:var(--texto-tenue);font-size:.8rem">GYM · <span id="a-pie-version">…</span></p>`;

  $('#a-sonido', raiz).onclick = async () => {
    const nuevo = !sonidoOn;
    await db.ponAjuste(CLAVE_SONIDO, nuevo);
    SON.configurar({ sonido: nuevo });
    // Se oye al encenderlo: un interruptor de sonido que no suena al darle deja
    // con la duda de si ha hecho algo.
    if (nuevo) SON.toque();
    pintar();
  };
  const banco = $('#a-banco', raiz);
  if (banco) banco.onclick = () => VEST.hojaBanco(puenteVestuario());

  // El interruptor del modo personal: siete toques en la línea de la versión.
  // Va aquí y no en un ajuste visible porque el ajuste visible sería justo la
  // referencia que Carlos quiere que no exista.
  const lineaVersion = $('#a-linea-version', raiz);
  if (lineaVersion) {
    let toques = 0;
    let reloj = null;
    lineaVersion.onclick = async () => {
      clearTimeout(reloj);
      reloj = setTimeout(() => { toques = 0; }, 1800);
      toques++;
      if (toques < 7) {
        if (toques >= 4) aviso(`${7 - toques} más…`, 900);
        return;
      }
      toques = 0;
      const nuevoModo = !modoPersonal;
      await db.ponAjuste(CLAVE_MODO_PERSONAL, nuevoModo);
      _modoPersonal = nuevoModo;
      aviso(nuevoModo ? 'Modo personal activado' : 'Modo personal desactivado', 2600);
      pintar();
    };
  }

  if (modoPersonal) $('#a-probar', raiz).onclick = async () => {
    const url = $('#a-url', raiz).value.trim();
    await sync.configurar({ url, token: $('#a-token', raiz).value.trim() });
    $('#a-estado', raiz).textContent = 'Probando…';
    const r = await sync.probar(url);
    $('#a-estado', raiz).innerHTML = r.ok
      ? `<span class="estado-sync ok">Conectado con ${esc(r.servidor)}</span>`
      : `<span class="estado-sync pendiente">Sin conexión: ${esc(r.motivo)}</span>`;
  };
  if (modoPersonal) $('#a-sync', raiz).onclick = async () => {
    await sync.configurar({ url: $('#a-url', raiz).value.trim(), token: $('#a-token', raiz).value.trim() });
    // `forzar`: este botón es el único sitio donde Carlos pide sincronizar a
    // propósito, así que salta el bloqueo de localhost. Todo lo demás (cada
    // guardado de la app) NO lo salta, para no sembrar sus datos reales cuando
    // probamos en el navegador.
    const r = await sync.sincronizar({ silencioso: false, forzar: true });
    aviso(r.ok ? `Sincronizado (${r.enviados} enviados, ${r.recibidos} recibidos)` : `No pude: ${r.motivo}`);
    await recargar();
    pintar();
  };

  // Buscar el PC: la respuesta al «se me olvida la ip». No hace falta que la
  // recuerde — la app la encuentra sola barriendo la subred.
  if (modoPersonal) $('#a-buscar', raiz).onclick = async () => {
    const btn = $('#a-buscar', raiz);
    const zona = $('#a-direcciones', raiz);
    btn.disabled = true;
    zona.innerHTML = '<p class="nut-media">Buscando…</p>';
    const r = await sync.buscarPC({
      alProbar: (n) => (zona.innerHTML = `<p class="nut-media">Buscando… ${Math.round((n / 254) * 100)} %</p>`),
    });
    btn.disabled = false;
    if (!r.ok) {
      zona.innerHTML = `<p class="nut-media">No lo encontré: ${esc(r.motivo)}.
        ¿Está el PC encendido y en la misma WiFi? Mira su IP en la red local y
        ponla a mano arriba.</p>`;
      return;
    }
    $('#a-url', raiz).value = r.url;
    zona.innerHTML = `<p class="nut-media">Encontrado en <b>${esc(r.url)}</b>
      ${r.servidor ? `(${esc(r.servidor)})` : ''}. Ya está guardado.</p>`;
    aviso('PC encontrado y guardado');
    await mostrarDirecciones(raiz);
  };

  if (modoPersonal) mostrarDirecciones(raiz);


  $$('[data-tema]', raiz).forEach(
    (b) =>
      (b.onclick = async () => {
        tocar();
        aplicarTema(b.dataset.tema, await temaPropio(), { suave: true });
        await db.ponAjuste('tema', b.dataset.tema);
        pintar();
      })
  );

  // Elegir uno de los suyos: se pone y ya. Editarlo es entrar al estudio, que
  // es donde están los mandos; una lista con siete mandos por fila no es una
  // lista, es un panel de control.
  $$('[data-mio]', raiz).forEach((b) => (b.onclick = async (e) => {
    if (e.target.hasAttribute('data-borrar')) return;
    tocar();
    await ponerTemaPropio(mios[Number(b.dataset.mio)]);
    pintar();
  }));

  $$('[data-borrar]', raiz).forEach((x) => (x.onclick = async (e) => {
    e.stopPropagation();
    const t = mios[Number(x.dataset.borrar)];
    if (!await preguntar(`¿Borrar el tema «${t.nombre}»?`)) return;
    await guardarTemas(mios.filter((_, i) => i !== Number(x.dataset.borrar)));
    // Si el que se borra es el que está puesto, la app vuelve al oscuro: dejar
    // puesto un tema que ya no está en la lista es cómo se llega a un ajuste
    // que no se puede volver a elegir.
    if (tema === 'propio' && propio.nombre === t.nombre) {
      await db.ponAjuste('tema', 'oscuro');
      aplicarTema('oscuro', null, { suave: true });
    }
    pintar();
  }));

  $('#a-estudio', raiz).onclick = () => {
    tocar();
    estudioDeTemas(tema === 'propio' ? propio : { ...propio, nombre: 'El mío' }, () => pintar());
  };

  $('#a-creditos', raiz).onclick = () => {
    // Cada línea enlaza a la página del archivo en Commons: es donde vive la
    // licencia completa, que es lo que de verdad exige la atribución.
    hoja(
      'Fotos del catálogo',
      `<p style="color:var(--texto-2);font-size:.88rem;margin-top:0">
         Fuente: Wikimedia Commons. Las versiones recortadas para la app se
         comparten con la misma licencia que la original.</p>
       <div class="creditos">${fotos.CREDITOS.map(
         (c) => `<div class="credito">
             <div class="credito-ej">${esc(c.ejercicio)}</div>
             <div class="credito-det">${esc(c.autor || 'autor desconocido')} · ${esc(c.licencia)}</div>
             <a class="credito-enlace" href="${esc(c.pagina)}" target="_blank" rel="noopener">${esc(c.archivo)}</a>
           </div>`
       ).join('')}</div>`
    );
  };
  /* ------------------------------------------------- versión y prueba del mapa */
  (async () => {
    const v = $('#a-version', raiz);
    const c = $('#a-cache', raiz);
    if (!v) return;
    // La versión de la app la dice el propio manifiesto, para que no haya un
    // número escrito a mano en dos sitios que se puedan separar.
    const pie = $('#a-pie-version', raiz);
    try {
      const r = await fetch('./manifest.webmanifest', { cache: 'no-store' });
      const m = await r.json();
      v.textContent = m.version || '—';
      // El pie sale del MISMO sitio. Antes decía «GYM · para JARVIS · v0.15.0»
      // escrito a mano, o sea que llevaba tres versiones mintiendo.
      if (pie) pie.textContent = `v${m.version || '—'}`;
    } catch (_) {
      v.textContent = '—';
      if (pie) pie.textContent = '';
    }
    // Y la de la caché la dice el service worker que esté MANDANDO ahora, que
    // es lo que de verdad decide qué código se está ejecutando.
    try {
      const cs = await caches.keys();
      const gym = cs.filter((x) => x.startsWith('gym-v'));
      c.textContent = gym.length ? gym.join(', ').replace(/gym-/g, '') : 'sin caché';
    } catch (_) {
      c.textContent = '—';
    }
  })();

  const bMapa = $('#a-probar-mapa', raiz);
  if (bMapa) bMapa.onclick = async () => {
    const zona = $('#a-mapa-resultado', raiz);
    bMapa.disabled = true;
    zona.innerHTML = '<p class="mapa-vacio">Probando…</p>';
    const r = await geo.probar();
    bMapa.disabled = false;
    zona.innerHTML = `
      <div class="diag">
        <div class="diag-fila"><span>Buscador de calles</span><b>${esc(r.buscador)}</b></div>
        <div class="diag-fila"><span>Buscar por nombre</span><b>${esc(r.sitios || '')}</b></div>
        <div class="diag-fila"><span>Qué dice cada uno</span><b>${esc(r.fuentes || '')}</b></div>
        <div class="diag-fila"><span>Imágenes del mapa</span><b>${esc(r.teselas)}</b></div>
        <div class="diag-fila"><span>Tu ubicación la da</span><b>${esc(r.ubicacion || '')}</b></div>
        <div class="diag-fila"><span>Y contesta</span><b>${esc(r.donde || '')}</b></div>
        <div class="diag-fila"><span>Origen de la app</span><b>${esc(r.origen)}</b></div>
        <div class="diag-fila"><span>Servidores del mapa</span><b>${esc(r.de || '')}</b></div>
      </div>`;
  };

  /* --------------------------------------------------------------- efectos
   * Los efectos del vestuario en alta (0.37.0).
   *
   * La descarga va sola en el primer arranque con red, así que este botón es
   * para los dos casos en que hace falta a mano: el día que se instaló sin
   * cobertura, y cuando salen piezas nuevas sin publicar una versión del APK.
   * Y dice CUÁNTAS hay, porque un botón que no cuenta lo que ha hecho no se
   * puede usar para saber si funcionó.
   * --------------------------------------------------------------------- */
  const bEfe = $('#a-efectos', raiz);
  const zEfe = $('#a-efectos-estado', raiz);
  const contarEfectos = () => {
    if (!zEfe) return;
    const v = PELIS.comoVa();
    const hay = v.descargadas;
    zEfe.textContent = v.bajando
      ? `Bajando los efectos… ${v.hechas}/${v.total}`
      : hay
        ? `${hay} efecto${hay === 1 ? '' : 's'} en alta calidad guardados en el móvil.`
        : 'Lo que llevas puesto se guarda solo. Este botón se baja TODO (unos 127 MB) '
          + 'para que el vestuario entero se vea en alta también sin cobertura.';
  };
  contarEfectos();
  if (bEfe) bEfe.onclick = async () => {
    bEfe.disabled = true;
    const base = await comp.base();
    if (!base) {
      if (zEfe) zEfe.textContent = 'No hay dirección de la app en nube.json: no hay de dónde bajarlos.';
      bEfe.disabled = false;
      return;
    }
    // Aquí SÍ se baja todo: lo ha pedido Carlos a mano y sabe lo que pesa.
    await PELIS.descargar(base, { alAvanzar: contarEfectos });
    const v = PELIS.comoVa();
    contarEfectos();
    if (v.error && zEfe) zEfe.textContent += ` (algo falló: ${v.error})`;
    bEfe.disabled = false;
    // Se repinta para que las piezas nuevas se vean sin salir y volver.
    pintar();
  };

  // La puerta al panel, solo si la base dice que esta cuenta modera.
  (async () => {
    const caja = $('#a-moderacion', raiz);
    if (!caja || !nube.usuario() || !(await nube.hayNube())) return;
    if (!(await social.soyModerador())) return;
    caja.hidden = false;
    $('#a-mod-abrir', caja).onclick = () => abrirModeracion();
  })();

  $('#a-exportar', raiz).onclick = exportar;
  $('#a-ejemplo', raiz).onclick = async () => {
    await sembrarGimnasios();
    await recargar();
    aviso('Gimnasios cargados');
    pintar();
  };
  $('#a-borrar', raiz).onclick = async () => {
    if (!await preguntar('¿Borrar TODOS los datos del móvil? No se puede deshacer.')) return;
    await db.borrarTodo();
    S.gimnasioId = null;
    await recargar();
    pintar();
  };
}

async function exportar() {
  const datos = {};
  for (const a of db.ALMACENES_SYNC) datos[a] = await db.todos(a, { incluirBorrados: true });
  const blob = new Blob([JSON.stringify(datos, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `gym-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/**
 * Los tres gimnasios de Carlos, con su dirección real. Editables.
 *
 * LOS IDS SON FIJOS, NO ALEATORIOS — y es lo importante de esta función.
 * Antes se generaba un uuid nuevo cada vez, así que CADA instalación nueva (o
 * cada vez que se borran los datos, o cada navegador de desarrollo) creaba
 * «VivaGym Reus» otra vez con otro id. Al sincronizar, el PC no tenía forma de
 * saber que era el mismo y lo guardaba aparte: de ahí los gimnasios duplicados
 * que vio Carlos en la v0.2.0. Con un id derivado del nombre, dos siembras
 * distintas producen el MISMO registro y la fusión los une en vez de sumarlos.
 */
const ID_SEMILLA = (nombre) =>
  'semilla-' + quitarTildes(nombre).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export async function sembrarGimnasios() {
  const yaHay = await db.todos('gimnasios');
  const nombres = new Set(yaHay.map((g) => g.nombre));
  const semilla = [
    { nombre: 'VivaGym Reus', direccion: 'Pl. Evarist Fàbregas i Pam, 1 · Reus' },
    { nombre: 'Basic-Fit Barcelona Tarradellas', direccion: 'Av. Josep Tarradellas, 133 · Barcelona' },
    { nombre: 'La Cochera', direccion: 'Sant Feliu de Guíxols' },
  ];
  for (const g of semilla) {
    if (nombres.has(g.nombre)) continue;
    await db.guardar('gimnasios', { id: ID_SEMILLA(g.nombre), ...g });
  }
}

/**
 * Los días de entreno. Va SUELTA de `sembrarGimnasios` y se llama en CADA
 * arranque, no solo con la base vacía: Carlos ya tiene sus tres rutinas, así
 * que la migración de `orden` nunca le habría llegado. Es la misma lección de
 * los 88 alimentos que se quedaron en el repositorio.
 */
export async function sembrarRutinas() {
  const rutinas = await db.todos('rutinas');
  if (!rutinas.length) {
    // `orden` NO es decorativo: es la ROTACIÓN. Sin él, las rutinas salían en
    // el orden en que IndexedDB devuelve las claves (alfabético por id), o sea
    // Leg → Pull → Push, y el planificador proponía empezar la semana por
    // pierna. El orden lo pone Carlos moviendo los días, no el azar del id.
    const semilla = [
      { nombre: 'Push', grupos: ['pecho', 'hombro', 'triceps'] },
      { nombre: 'Pull', grupos: ['espalda', 'biceps'] },
      { nombre: 'Leg', grupos: ['pierna', 'gluteo'] },
    ];
    for (const [i, r] of semilla.entries()) {
      await db.guardar('rutinas', { id: ID_SEMILLA(r.nombre), maquinas: [], plan: [], orden: i, ...r });
    }
  } else if (rutinas.some((r) => r.orden === undefined)) {
    // MIGRACIÓN sobre datos VIEJOS, que es la única que importa: Carlos ya tenía
    // sus tres rutinas de la v0.1.0 y esas no pasan por la siembra. Sin esto, su
    // rotación sería la que devuelve IndexedDB (alfabética: Leg, Pull, Push).
    for (const r of P.ordenInicial(rutinas, quitarTildes)) {
      const antes = rutinas.find((x) => x.id === r.id);
      if (antes.orden === r.orden) continue;
      await db.guardar('rutinas', r);
    }
  }
}

/* ========================================================================== *
 * ARMAZÓN
 * ========================================================================== */
/**
 * Añadir VARIAS máquinas al día de una tacada.
 *
 * Carlos, 30-ago-2026: *«a la hora de añadir máquinas del día de la rutina se
 * puedan añadir varias a la vez, como cuando añades las máquinas por gym»*.
 * Antes cada toque metía UNA y cerraba la hoja: montar un día de seis
 * ejercicios eran seis aperturas, seis búsquedas y seis cierres.
 *
 * Se copia el patrón que ya funciona en `abrirCatalogo`: se van marcando, el
 * botón cuenta cuántas llevas y se añaden todas al pulsar.
 *
 * LAS DOS PESTAÑAS SON LO QUE DE VERDAD AHORRA TIEMPO. Montando un día nuevo lo
 * normal es descubrir que la máquina ni siquiera está dada de alta en el
 * gimnasio. Antes había que salir del editor, ir al selector de gimnasio, abrir
 * el catálogo, añadirla y volver. Aquí, elegir una del catálogo la da de alta
 * en el gimnasio Y la mete en el día, en el mismo gesto.
 *
 * @param yaEnElDia ids que ya están en el plan (no se pueden volver a elegir)
 * @param alElegir  recibe la lista de ids —los nuevos ya creados en la base—
 */
function abrirAnadirAlDia({ yaEnElDia = [], alElegir }) {
  const dentro = new Set(yaEnElDia);
  const gim = S.cache.gimnasios.find((g) => g.id === S.gimnasioId);
  const suyas = S.cache.maquinas.filter((m) => m.gimnasioId === S.gimnasioId);
  const nombresDelGym = new Set(suyas.map((m) => m.nombre.toLowerCase()));

  // La unidad para las que nazcan del catálogo: la que más usa este gimnasio,
  // igual que en `abrirCatalogo` (Basic-Fit va en libras).
  const enLb = suyas.filter((m) => m.unidad === 'lb').length;
  const unidad = suyas.length && enLb > suyas.length / 2 ? 'lb' : 'kg';

  const misElegidas = new Set();     // ids de máquinas que ya tiene el gimnasio
  const nuevasElegidas = new Set();  // nombres del catálogo, aún sin crear
  let pestana = 'mias';
  let consulta = '';

  const nombreGrupo = (g) => (D.GRUPOS.find((x) => x.id === g) || {}).nombre || '';

  hoja(
    'Añadir al día',
    `
    <div class="chips" id="ad-pestanas" role="tablist">
      <button class="chip" data-p="mias" role="tab">En este gimnasio</button>
      <button class="chip" data-p="catalogo" role="tab">Del catálogo</button>
    </div>
    <input class="buscador" type="search" id="ad-buscar" placeholder="Buscar ejercicio…" aria-label="Buscar ejercicio">
    <p class="campo-nota" id="ad-nota" hidden></p>
    <div class="lista" id="ad-lista"></div>
    <div class="barra-accion">
      <button class="boton" id="ad-anadir" disabled>Añadir</button>
    </div>`,
    (cuerpo, cerrar) => {
      const lista = $('#ad-lista', cuerpo);
      const boton = $('#ad-anadir', cuerpo);
      const buscador = $('#ad-buscar', cuerpo);
      const nota = $('#ad-nota', cuerpo);

      const cuantas = () => misElegidas.size + nuevasElegidas.size;

      const refrescarBoton = () => {
        const n = cuantas();
        boton.disabled = n === 0;
        boton.textContent = n ? `Añadir ${n} ${n === 1 ? 'ejercicio' : 'ejercicios'}` : 'Añadir';
      };

      /**
       * Una fila marcable.
       *
       * La marca va a la IZQUIERDA y ocupa un hueco fijo aunque esté vacía. Si
       * apareciera y desapareciera, el nombre bailaría a cada toque, y con seis
       * toques seguidos eso marea. El estado no se fía solo del color: hay un
       * check dibujado, el borde de acento y `aria-pressed` para TalkBack.
       */
      const fila = (nombre, grupo, marcada, dibujo) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'elige-multi';
        b.setAttribute('aria-pressed', marcada);
        b.innerHTML = `
          <span class="elige-marca" aria-hidden="true">${icono('tic', 16)}</span>
          <span class="elige-dibujo">${dibujo}</span>
          <span class="elige-texto">
            <span class="elige-nombre">${esc(nombre)}</span>
            <span class="elige-grupo">${esc(nombreGrupo(grupo))}</span>
          </span>`;
        return b;
      };

      const pintarMias = () => {
        const libres = suyas
          .filter((m) => !dentro.has(m.id))
          .filter((m) => !consulta || quitarTildes(m.nombre).includes(quitarTildes(consulta)))
          .sort((a, b) => a.nombre.localeCompare(b.nombre));

        if (!libres.length) {
          // Vacío CON SALIDA: decir «no hay» y dejar ahí el botón que lo
          // resuelve. Una pantalla en blanco obliga a adivinar qué hacer.
          lista.innerHTML = `
            <p class="grafica-vacia">${suyas.length
              ? 'Ya has metido en el día todas las máquinas de este gimnasio.'
              : `${esc(gim ? gim.nombre : 'Este gimnasio')} todavía no tiene máquinas.`}<br>
              <button class="boton-plano" id="ad-ir-catalogo">Buscar en el catálogo →</button></p>`;
          const ir = $('#ad-ir-catalogo', lista);
          if (ir) ir.onclick = () => elegirPestana('catalogo');
          return;
        }

        lista.innerHTML = '';
        for (const m of libres) {
          const b = fila(m.nombre, m.grupo, misElegidas.has(m.id),
            cat.imagenEjercicio(m.nombre, m.icono, m.grupo));
          b.onclick = () => {
            if (misElegidas.has(m.id)) misElegidas.delete(m.id);
            else misElegidas.add(m.id);
            b.setAttribute('aria-pressed', misElegidas.has(m.id));
            refrescarBoton();
          };
          lista.appendChild(b);
        }
      };

      // El catálogo tiene 1.365 ejercicios. Pintarlos de golpe son 1.365 SVG en
      // el DOM y casi un segundo de hilo bloqueado en un móvil normal, así que
      // se pinta a trozos igual que en `abrirCatalogo`.
      const TROZO = 60;
      let visibles = TROZO;
      let resultados = [];

      const pintarPie = () => {
        const viejo = $('#ad-mas', cuerpo);
        if (viejo) viejo.remove();
        const quedan = resultados.length - visibles;
        if (quedan <= 0) return;
        const b = document.createElement('button');
        b.id = 'ad-mas';
        b.className = 'boton boton-2';
        b.textContent = `Ver ${Math.min(quedan, TROZO)} más (quedan ${quedan})`;
        b.onclick = () => {
          const desde = visibles;
          visibles += TROZO;
          pintarTrozoCatalogo(desde);
        };
        lista.appendChild(b);
      };

      const pintarTrozoCatalogo = (desde) => {
        const frag = document.createDocumentFragment();
        for (const e of resultados.slice(desde, visibles)) {
          const b = fila(e.n, e.g, nuevasElegidas.has(e.n),
            cat.imagenEjercicio(e.n, e.i, e.g));
          b.classList.add('elige-nueva');
          b.onclick = () => {
            if (nuevasElegidas.has(e.n)) nuevasElegidas.delete(e.n);
            else nuevasElegidas.add(e.n);
            b.setAttribute('aria-pressed', nuevasElegidas.has(e.n));
            refrescarBoton();
          };
          frag.appendChild(b);
        }
        lista.appendChild(frag);
        pintarPie();
      };

      const pintarCatalogo = () => {
        // Las que el gimnasio YA tiene no se repiten aquí: para esas está la
        // otra pestaña, y dar de alta dos «press de banca» ensucia el historial
        // (cada máquina se compara solo consigo misma).
        resultados = cat.buscar(consulta, '').filter((e) => !nombresDelGym.has(e.n.toLowerCase()));
        visibles = TROZO;
        lista.innerHTML = '';
        if (!resultados.length) {
          lista.innerHTML = `<p class="grafica-vacia">Nada con ese nombre en el catálogo.
            Puedes crearla a mano desde el selector de gimnasio.</p>`;
          return;
        }
        pintarTrozoCatalogo(0);
      };

      const pintarLo = () => (pestana === 'mias' ? pintarMias() : pintarCatalogo());

      const elegirPestana = (p) => {
        pestana = p;
        $$('[data-p]', cuerpo).forEach((x) => x.setAttribute('aria-pressed', x.dataset.p === p));
        buscador.placeholder = p === 'mias' ? 'Buscar entre las tuyas…' : 'Buscar entre 1.365 ejercicios…';
        // El aviso de que se darán de alta va UNA vez aquí arriba y no en cada
        // fila: repetirlo 1.365 veces es ruido que hay que leer y saltar en
        // cada línea.
        nota.hidden = p !== 'catalogo';
        nota.innerHTML = `Las que marques aquí se darán de alta en
          <b>${esc(gim ? gim.nombre : 'el gimnasio')}</b> y entrarán en el día.`;
        pintarLo();
      };

      $$('[data-p]', cuerpo).forEach((b) => (b.onclick = () => elegirPestana(b.dataset.p)));
      buscador.oninput = () => {
        consulta = buscador.value;
        pintarLo();
      };

      boton.onclick = async () => {
        const ids = [...misElegidas];
        // Las del catálogo se crean AQUÍ, no al marcarlas: si Carlos cierra la
        // hoja sin darle a «Añadir», el gimnasio no se queda con máquinas que
        // no pidió.
        for (const nombre of nuevasElegidas) {
          const e = cat.ejercicio(nombre);
          if (!e) continue;
          const m = await db.guardar('maquinas', {
            gimnasioId: S.gimnasioId,
            nombre: e.n,
            grupo: e.g,
            tipo: e.t,
            icono: e.i,
            unidad,
            incremento: unidad === 'lb' ? 5 : 2.5,
            notas: '',
            foto: null,
          });
          ids.push(m.id);
        }
        if (nuevasElegidas.size) {
          await recargar();
          sync.sincronizar({ silencioso: true });
        }
        cerrar();
        await alElegir(ids);
        const n = ids.length;
        aviso(`${n} ${n === 1 ? 'ejercicio' : 'ejercicios'} al día${nuevasElegidas.size
          ? ` · ${nuevasElegidas.size} ${nuevasElegidas.size === 1 ? 'dada' : 'dadas'} de alta en el gimnasio` : ''}`);
      };

      elegirPestana('mias');
      refrescarBoton();
    },
    {
      hayTrabajo: () => misElegidas.size + nuevasElegidas.size > 0,
      avisoSalir: 'Vas a perder los ejercicios que has marcado.',
    }
  );
}


/* ========================================================================== *
 * VISTA: PERFIL  (v0.15.0)
 * ========================================================================== *
 * Carlos, 30-ago-2026: *«un sistema de perfiles para que la gente pueda ponerse
 * foto de perfil, que se vea la racha que lleva, pequeños logros, veteranía,
 * insignias (…) que la gente pueda compartir las rutinas que él sigue, sus
 * series, sus repeticiones, una descripción de la persona, sus propias
 * anotaciones, medallas en función de PR»*.
 *
 * QUÉ SE GUARDA Y QUÉ SE CALCULA — la decisión que sostiene toda la pantalla.
 * Se GUARDA solo lo que Carlos escribe: alias, nombre, bio, anotaciones y qué
 * medallas quiere lucir. NO se guarda ni una insignia ni la racha: se calculan
 * de las series cada vez que se abre. Es la misma regla que ya rige el progreso
 * de las metas en `metas.js`, y por el mismo motivo: un logro guardado se queda
 * viejo el día que se corrige una serie mal apuntada, y te quedarías con una
 * medalla que ya no te corresponde.
 *
 * EL ORDEN DE LA PANTALLA no es decorativo. Arriba, quién eres y la racha: es
 * lo que se mira al abrirla. Después las cifras, las medallas y las insignias.
 * La cuenta y los ajustes, abajo del todo: se tocan una vez al año.
 */

/** El perfil, con los huecos rellenos. Nunca devuelve null. */
function perfilActual() {
  const p = S.cache.perfil || {};
  return {
    id: p.id || 'yo',
    alias: p.alias || '',
    // Las mayúsculas del nombre de usuario, tal y como se escribieron. El
    // `alias` de arriba va siempre en minúsculas porque es la dirección; este
    // es el que se ENSEÑA. Carlos, 31-ago-2026: «ni en mayúsculas».
    aliasVisible: p.aliasVisible || p.alias || '',
    nombre: p.nombre || '',
    bio: p.bio || '',
    fotoUrl: p.fotoUrl || '',
    publico: p.publico ? 1 : 0,
    medallasElegidas: Array.isArray(p.medallasElegidas) ? p.medallasElegidas : [],
    notas: Array.isArray(p.notas) ? p.notas : [],
  };
}

async function guardarPerfil(cambios) {
  const p = { ...perfilActual(), ...cambios, id: 'yo' };
  await db.guardar('perfil', p);
  await recargar();
  sync.sincronizar({ silencioso: true });
  return p;
}

/** Todo lo que se ha ganado, calculado de las series. */
function calculoPerfil() {
  return PF.calcular(S.cache);
}

/* ==========================================================================
 * CUANDO SE DESBLOQUEA UNA MEDALLA  (v0.23.0)
 *
 * Carlos: *«me gustaría que cuando desbloqueas una medalla haciendo un
 * ejercicio saliese una animación, como agitando la medalla que tuvieses, y
 * que se fuese transformando en la siguiente medalla»*.
 *
 * Es exactamente eso y en ese orden: la pieza que TENÍAS —la silueta apagada
 * si la medalla es nueva, o la piedra del material viejo si lo que ha subido
 * es el material— tiembla, y de ahí sale la nueva.
 *
 * POR QUÉ NO HAY LIBRERÍA DE ANIMACIÓN
 * ------------------------------------
 * Porque la regla del proyecto es CERO peticiones a internet en la interfaz, y
 * las librerías de animación viven en un CDN. Esto son fotogramas de CSS: pesan
 * cero, no bloquean nada y las mueve el compositor del navegador.
 *
 * LOS TIEMPOS NO SON A OJO. Cada golpe está por debajo de 300 ms —que es el
 * techo de una micro-interacción— y encadenados con retardo, no alargados:
 *   0-180   la pantalla entra
 *   180-620 la pieza vieja TIEMBLA (cinco golpes de 88 ms)
 *   620-900 se encoge, destella y sale la nueva
 *   900+    el nombre sube
 * Se va sola a los 3,4 s, o antes si se toca.
 *
 * Y CON `prefers-reduced-motion` NO TIEMBLA NADA: se funde una en otra y ya.
 * Quien pide menos movimiento no está pidiendo perderse la medalla.
 * ========================================================================== */

/** Una foto de lo ganado: id de medalla → material. Para comparar después. */
function fotoDeMedallas(calc) {
  const m = new Map();
  for (const x of calc.medallasGanadas) m.set(x.id, x.material || 'hierro');
  return m;
}

/**
 * Compara dos fotos y celebra el primer cambio que encuentre.
 *
 * SOLO EL PRIMERO a propósito: si alguien apunta una serie que desbloquea tres
 * medallas de golpe, encadenar tres celebraciones de tres segundos y medio es
 * castigar a quien acaba de hacerlo bien. Se enseña la mejor —la de más nivel—
 * y el resto ya están en el perfil.
 */
function celebrarSiHayNuevas(antes, calc) {
  const ahora = fotoDeMedallas(calc);
  const cambios = [];
  for (const [id, mat] of ahora) {
    const matAntes = antes.get(id);
    if (matAntes === undefined) cambios.push({ id, material: mat, nueva: true });
    else if (matAntes !== mat) cambios.push({ id, material: mat, antes: matAntes, nueva: false });
  }
  if (!cambios.length) return false;
  // Primero las medallas nuevas, y de esas la de más nivel: es la que más
  // cuesta y la que uno quiere ver.
  cambios.sort((a, b) => (Number(b.nueva) - Number(a.nueva))
    || ((INS.MEDALLA_POR_ID.get(b.id)?.nivel || 0) - (INS.MEDALLA_POR_ID.get(a.id)?.nivel || 0)));
  const c = cambios[0];
  const medalla = calc.medallasGanadas.find((x) => x.id === c.id);
  if (!medalla) return false;
  celebrarMedalla(medalla, c);
  return true;
}

/**
 * La pantalla de celebración. Se cierra sola, o al tocarla.
 *
 * Se EXPORTA para poder dispararla desde `pc/test_medalla_fiesta.py` en los tres
 * instantes que la definen: con la serie de verdad no se puede elegir el
 * momento de la captura, y una animación que no se ha visto no está terminada.
 */
export function celebrarMedalla(medalla, cambio) {
  // La pieza de ANTES: la silueta apagada si la medalla es nueva, o la misma
  // piedra con el material viejo si lo que ha subido es el material.
  const svgAntes = cambio.nueva
    ? INS.dibujarMedalla(medalla, false, 132)
    : INS.dibujarMedalla({ ...medalla, material: cambio.antes }, true, 132);
  const svgAhora = INS.dibujarMedalla(medalla, true, 132);
  const mat = INS.MATERIAL_POR_ID.get(cambio.material);
  const lev = INS.LEVANTAMIENTO_POR_ID.get(medalla.levantamiento);

  const capa = document.createElement('div');
  capa.className = 'fiesta';
  capa.setAttribute('role', 'dialog');
  capa.setAttribute('aria-live', 'assertive');
  capa.innerHTML = `
    <div class="fiesta-caja">
      <div class="fiesta-pieza">
        <span class="fiesta-rayos" aria-hidden="true"></span>
        <span class="fiesta-antes" aria-hidden="true">${svgAntes}</span>
        <span class="fiesta-ahora">${svgAhora}</span>
      </div>
      <p class="fiesta-titulo">${cambio.nueva ? 'Medalla desbloqueada' : 'Material mejorado'}</p>
      <p class="fiesta-nombre">${esc(medalla.nombre)}</p>
      <p class="fiesta-pie">${esc([lev ? lev.nombre : '',
        medalla.kg ? `${medalla.kg} kg` : '',
        mat ? mat.nombre : ''].filter(Boolean).join(' · '))}</p>
      <p class="fiesta-toca">Toca para cerrar</p>
    </div>`;
  document.body.appendChild(capa);
  // EL SONIDO Y LA VIBRACIÓN (3-sep-2026). Carlos: *«si puedes pulir la de
  // cuando desbloqueas nuevas medallas (…) le falta sonido, que vibre más. Es
  // que subir el sonido estaría muy bien, así como satisfactorio»*. La
  // animación ya estaba desde la 0.22.0; lo que faltaba era esto, y va DENTRO
  // del mismo instante en que la pieza nueva sale: separarlos medio segundo es
  // lo que hace que un móvil parezca estropeado.
  SON.celebrarLogro();

  let fuera = false;
  const cerrar = () => {
    if (fuera) return;
    fuera = true;
    clearTimeout(reloj);
    capa.classList.add('fiesta-fin');
    // Se quita cuando termina de irse; si la animación no llega a dispararse
    // (pestaña en segundo plano) el reloj de reserva lo saca igual.
    setTimeout(() => capa.remove(), 320);
  };
  capa.onclick = cerrar;
  const reloj = setTimeout(cerrar, 3400);
}

/* ==========================================================================
 * EL VESTUARIO  (v0.32.0)
 *
 * Aquí solo está el PUENTE: leer y guardar el estado, y las cuatro utilidades
 * de la app que la pantalla del vestuario necesita. Todo lo demás —qué toca,
 * cuánto cuesta, cómo se anima— vive en `vestuario.js` y en `cajas.js`.
 * ======================================================================== */
function vestuarioActual() {
  return CAJ.normalizar(S.cache.vestuario || CAJ.estadoInicial(hoyISO()));
}

async function guardarVestuario(nuevo) {
  const v = { ...CAJ.normalizar(nuevo, hoyISO()), id: 'yo' };
  await db.guardar('vestuario', v);
  await recargar();
  sync.sincronizar({ silencioso: true });
  return v;
}

/**
 * Estrenar el vestuario: deja escrito DESDE CUÁNDO cuentan las cajas.
 *
 * Se hace al entrar por primera vez y no antes, y es lo que impide que alguien
 * con dos años de historial abra la pantalla y se encuentre 300 cajas: eso
 * sería la colección entera en una tarde y ni una razón para volver mañana.
 */
async function estrenarVestuario() {
  if (S.cache.vestuario) return vestuarioActual();
  return guardarVestuario(CAJ.estadoInicial(hoyISO()));
}

/* La foto para las vistas previas del vestuario. Se rehace en cada pintada
 * porque `pintar()` revoca todas las URL de Blob al empezar: guardarla entre
 * pintadas daría una foto rota, que es peor que ninguna. */
let _fotoVest = null;

async function pintarVestuarioVista(raiz) {
  await estrenarVestuario();
  const guardada = await db.avatar();
  _fotoVest = guardada && guardada.blob ? urlDe(guardada.blob) : (perfilActual().fotoUrl || null);
  VEST.pintarVestuario(raiz, puenteVestuario());
}

/* El modo personal se lee de la base (es un ajuste) y la pantalla del vestuario
 * necesita saberlo para enseñar el banco de pruebas. Se cachea al arrancar y al
 * cambiarlo: leerlo en cada pintada sería una consulta a IndexedDB por cada
 * repintado de una pantalla que se repinta mucho. */
let _modoPersonal = false;

/** El puente que se le pasa a `vestuario.js`. */
function puenteVestuario() {
  const p = perfilActual();
  return {
    modoPersonal: () => _modoPersonal,
    estado: () => vestuarioActual(),
    guardar: (nuevo) => guardarVestuario(nuevo),
    resumen: () => calculoPerfil().resumen,
    nombre: () => p.nombre || p.aliasVisible || p.alias || 'Tu nombre',
    alias: () => p.aliasVisible || p.alias || '',
    foto: () => _fotoVest,
    hoja: (titulo, html, montar, opciones) => hoja(titulo, html, montar, opciones),
    aviso: (texto, ms) => aviso(texto, ms),
    tocar: (ms) => tocar(ms),
    repintar: () => pintar(),
  };
}

/* --------------------------------------------------------------------------
 * LOS LOGROS NUEVOS
 *
 * Carlos, 3-sep-2026: *«si puedes pulir la de cuando desbloqueas nuevas
 * medallas (…) le falta sonido, que vibre más»*.
 *
 * Lo que se guarda es qué logros SE HAN ENSEÑADO ya, no cuáles se tienen —eso
 * se sigue calculando de las series, como manda la casa—. Y la primera vez no
 * se celebra nada: quien instala la app con dos años de historial tiene veinte
 * insignias de golpe, y veinte celebraciones seguidas no celebran nada.
 * ------------------------------------------------------------------------ */
const CLAVE_LOGROS = 'logros_vistos';
let _logrosPendientes = [];

async function comprobarLogros() {
  try {
    const c = calculoPerfil();
    // SOLO INSIGNIAS. Las medallas tienen su propia fiesta desde la 0.22.0
    // (`celebrarSiHayNuevas`), con la pieza vieja transformándose en la nueva.
    // Celebrar las dos cosas sería celebrar la misma medalla dos veces.
    const ganados = c.ganadas.map((i) => ({ tipo: 'insignia', id: `i:${i.id}`, pieza: i }));
    const guardados = await db.ajuste(CLAVE_LOGROS, null);
    if (!Array.isArray(guardados)) {
      await db.ponAjuste(CLAVE_LOGROS, ganados.map((g) => g.id));
      return;
    }
    const vistos = new Set(guardados);
    const nuevos = ganados.filter((g) => !vistos.has(g.id));
    if (!nuevos.length) return;
    await db.ponAjuste(CLAVE_LOGROS, [...vistos, ...nuevos.map((g) => g.id)]);
    _logrosPendientes.push(...nuevos);
  } catch { /* una celebración no puede tumbar un guardado */ }
}

/** Se enseña cuando no hay ninguna hoja abierta: si no, taparía lo que se estaba haciendo. */
function mostrarLogrosPendientes() {
  if (!_logrosPendientes.length) return;
  // Ni encima de una hoja, ni de la escena de una caja, ni de la fiesta de una
  // medalla: dos celebraciones a la vez no son el doble de celebración.
  if ($('.hoja-fondo') || $('.escena') || $('.logro-capa') || $('.fiesta')) return;
  // MÁS DE TRES A LA VEZ SE CUENTAN EN UNA SOLA TARJETA. Pasa de verdad: al
  // restaurar una copia o al sincronizar con el PC pueden aparecer veinte
  // insignias de golpe, y veinte tarjetas seguidas no se celebran, se cierran a
  // toda prisa.
  if (_logrosPendientes.length > 3) return mostrarMuchosLogros();
  const logro = _logrosPendientes.shift();
  const quedan = _logrosPendientes.length;

  const capa = document.createElement('div');
  capa.className = 'logro-capa';
  capa.setAttribute('role', 'dialog');
  capa.setAttribute('aria-modal', 'true');
  capa.setAttribute('aria-label', 'Logro nuevo');
  const dibujo = INS.dibujarInsignia(logro.pieza, true, 132);
  capa.innerHTML = `
    <div class="logro-tarjeta">
      <p class="logro-que">Insignia nueva</p>
      <div class="logro-pieza">${dibujo}</div>
      <h2 class="logro-nombre">${esc(logro.pieza.nombre)}</h2>
      <p class="logro-pie">${esc(logro.pieza.pie || logro.pieza.descripcion || '')}</p>
      <button class="boton" id="logro-ok">${quedan ? `Siguiente (${quedan})` : 'Genial'}</button>
      ${quedan ? `<p class="logro-mas">Te quedan ${quedan} por ver</p>` : ''}
    </div>`;
  document.body.appendChild(capa);
  SON.celebrarLogro();

  const cerrar = () => {
    capa.remove();
    // La siguiente entra sola: encadenar es lo que hace que ganar tres cosas a
    // la vez se sienta como tres cosas y no como una lista.
    if (_logrosPendientes.length) setTimeout(mostrarLogrosPendientes, 180);
  };
  $('#logro-ok', capa).onclick = cerrar;
  capa.addEventListener('click', (e) => { if (e.target === capa) cerrar(); });
}

/** Una sola tarjeta para «te han caído doce de golpe». */
function mostrarMuchosLogros() {
  const lista = _logrosPendientes.slice();
  _logrosPendientes = [];
  const capa = document.createElement('div');
  capa.className = 'logro-capa';
  capa.setAttribute('role', 'dialog');
  capa.setAttribute('aria-modal', 'true');
  capa.setAttribute('aria-label', 'Logros nuevos');
  capa.innerHTML = `
    <div class="logro-tarjeta">
      <p class="logro-que">Cosecha nueva</p>
      <div class="logro-pieza logro-monton">${lista.slice(0, 3)
        .map((l) => INS.dibujarInsignia(l.pieza, true, 84)).join('')}</div>
      <h2 class="logro-nombre">${lista.length} insignias nuevas</h2>
      <p class="logro-pie">Están todas en tu perfil.</p>
      <button class="boton" id="logro-ok">Verlos</button>
    </div>`;
  document.body.appendChild(capa);
  SON.celebrarLogro();
  const cerrar = () => capa.remove();
  $('#logro-ok', capa).onclick = () => { cerrar(); irA('perfil'); };
  capa.addEventListener('click', (e) => { if (e.target === capa) cerrar(); });
}

/* --------------------------------------------------------------------------
 * Trozos que se repiten
 * ------------------------------------------------------------------------ */

/**
 * El avatar. Sin foto NO se pone un muñeco gris genérico: se ponen las
 * INICIALES sobre el acento. Un muñeco anónimo se lee como «esto está vacío»;
 * unas iniciales se leen como «este eres tú».
 */
function avatarHTML(perfil, urlFoto, tam = 76) {
  const iniciales = inicialesDe(perfil.nombre || perfil.alias);
  const estilo = `width:${tam}px;height:${tam}px;font-size:${Math.round(tam * 0.36)}px`;
  return urlFoto
    ? `<img class="pf-foto" style="${estilo}" src="${esc(urlFoto)}" alt="Tu foto de perfil">`
    : `<span class="pf-foto pf-iniciales" style="${estilo}" aria-hidden="true">${esc(iniciales)}</span>`;
}

/** Un número grande con su etiqueta. Cifras condensadas, como el resto de la app. */
function cifraHTML(valor, etiqueta, pista = '') {
  return `<div class="pf-cifra"${pista ? ` title="${esc(pista)}"` : ''}>
    <b class="cifra">${esc(valor)}</b><span>${esc(etiqueta)}</span></div>`;
}

function redondear(n, decimales = 0) {
  const f = 10 ** decimales;
  return String(Math.round((Number(n) || 0) * f) / f).replace('.', ',');
}

/* --------------------------------------------------------------------------
 * La pantalla
 * ------------------------------------------------------------------------ */

async function pintarPerfil(raiz) {
  const perfil = perfilActual();
  const c = calculoPerfil();
  const r = c.resumen;

  // La foto vive como Blob en el móvil; la URL de Supabase solo se usa cuando
  // no hay original (por ejemplo, después de reinstalar la app).
  const guardada = await db.avatar();
  const urlFoto = guardada && guardada.blob ? urlDe(guardada.blob) : perfil.fotoUrl;

  const conCuenta = !!nube.usuario();
  const hayNube = await nube.hayNube();

  // Lo que lleva puesto del vestuario. Se pinta aquí, en su propio perfil, que
  // es para lo que sirve: una pieza que solo se viera en la pantalla donde se
  // compra no sería una pieza, sería un cromo.
  const V = vestuarioActual();
  const cajasPend = S.cache.vestuario ? CAJ.pendientes(V, c.resumen) : null;
  const cosFondo = COS.estiloFondo(COS.pieza(V.puesto.fondo));
  const cosPlaca = COS.estiloPlaca(COS.pieza(V.puesto.placa));
  const cosMarco = COS.pieza(V.puesto.marco);
  const cosAura = COS.pieza(V.puesto.aura);
  const cosTitulo = COS.pieza(V.puesto.titulo);

  const elegidas = perfil.medallasElegidas
    .map((id) => c.medallas.find((m) => m.id === id))
    .filter((m) => m && m.ganada);

  // Las insignias del escaparate: las de más nivel primero. Enseñar las de
  // nivel 1 cuando ya hay de nivel 3 sería enseñar lo peor que tienes.
  const escaparate = [...c.ganadas].sort((a, b) => b.nivel - a.nivel).slice(0, 6);
  const conRutinas = S.cache.rutinas.filter((x) => planDe(x).length);

  raiz.innerHTML = `
    <!-- ---------------------------------------------------------------- yo -->
    <div class="ficha pf-cabeza ${cosFondo.css ? 'pf-conestilo' : ''}"
         style="${cosFondo.css ? `background:${cosFondo.css}` : ''}">
      ${V.puesto.fondo ? COS.escenaFondo(COS.pieza(V.puesto.fondo), { ancho: 520, alto: 140 }) : ''}
      ${cosAura ? COS.dibujarAura(cosAura, { ancho: 520, alto: 140 }) : ''}
      <button class="pf-avatar" id="pf-foto" aria-label="Cambiar la foto de perfil">
        ${avatarHTML(perfil, urlFoto)}
        ${cosMarco ? COS.dibujarMarco(cosMarco, { tam: 96 }) : ''}
        <span class="pf-camara" aria-hidden="true">${icono('camara', 15)}</span>
      </button>
      <div class="pf-quien">
        <!-- «Sin nombre» era el último sitio donde asomaba el bug de Carlos: si
             te registraste con usuario pero sin nombre, la pantalla te llamaba
             «Sin nombre» teniendo tu @ escrito justo debajo. Manda el nombre si
             lo hay; si no, el usuario; y solo si no hay ninguno de los dos se
             dice que falta. -->
        <h2 class="pf-nombre"><span class="pf-nombre-placa ${cosPlaca.clase}"
          style="${cosPlaca.css}" data-texto="${esc(perfil.nombre
          || perfil.aliasVisible || perfil.alias || 'Sin nombre')}">${esc(perfil.nombre
          || perfil.aliasVisible || perfil.alias || 'Sin nombre')}</span></h2>
        ${cosTitulo ? COS.tituloHTML(cosTitulo, { etiqueta: 'div', clase: 'pf-titulo-cos' }) : ''}
        ${perfil.alias && perfil.nombre
          // Se ENSEÑA con sus mayúsculas y se BUSCA en minúsculas. Son dos usos
          // del mismo dato y confundirlos es lo que hacía que escribir
          // «CarlosPerez» se viera como «carlosperez».
          ? `<div class="pf-alias">@${esc(perfil.aliasVisible || perfil.alias)}</div>` : ''}
        <div class="pf-nivel">
          <span class="pf-galon">${esc(c.veterania.nombre)}</span>
          ${r.diasDesdeLaPrimera ? `<span>${r.diasDesdeLaPrimera} días con la app</span>` : ''}
        </div>
      </div>
    </div>
    ${perfil.bio ? `<p class="pf-bio">${esc(perfil.bio)}</p>` : ''}
    <div class="pf-acciones">
      <button class="boton boton-2" id="pf-editar">Editar perfil</button>
      <button class="boton boton-2" id="pf-compartir-perfil">${icono('enviar', 17)} Compartir</button>
    </div>

    <!-- ---------------------------------------------------------- vestuario -->
    <button class="ficha vest-entrada ${cajasPend && cajasPend.total ? 'tiene' : ''}" id="pf-vestuario">
      <span class="vest-entrada-arte">${VEST.cajaSVG('entreno', 56, { animada: !!(cajasPend && cajasPend.total) })}
        ${cajasPend && cajasPend.total ? `<span class="caja-pin">${cajasPend.total}</span>` : ''}</span>
      <span class="vest-entrada-texto">
        <b>Vestuario</b>
        <small>${cajasPend && cajasPend.total
          ? `${cajasPend.total} ${cajasPend.total === 1 ? 'caja sin abrir' : 'cajas sin abrir'}`
          : `${CAJ.coleccion(V).mias} de ${CAJ.coleccion(V).total} piezas · ${VEST.numero(V.magnesio)} de magnesio`}</small>
      </span>
      <span class="vest-entrada-flecha" aria-hidden="true">${icono('derecha', 20)}</span>
    </button>

    <!-- ------------------------------------------------------------- racha -->
    <div class="ficha pf-racha ${r.rachaViva ? 'pf-racha-viva' : ''}">
      <div class="pf-racha-fila">
        <span class="pf-llama ${r.rachaViva ? '' : 'pf-llama-apagada'}" aria-hidden="true">${icono('fuego', 32)}</span>
        <div>
          <div class="pf-racha-num cifra">${r.rachaDias || r.mejorRachaDias || 0}<small>días</small></div>
          <div class="pf-racha-pie">${
            !r.diasEntrenados
              ? 'Apunta tu primera serie y empieza la racha'
              : r.rachaViva
                ? (r.diasParaRomper > 0
                    ? `Racha viva. Te ${r.diasParaRomper === 1 ? 'queda 1 día' : `quedan ${r.diasParaRomper} días`} para no romperla.`
                    : 'Hoy toca, o se rompe.')
                : `Racha rota. La mejor fueron ${r.mejorRachaDias} días: vuelve a por ella.`
          }</div>
        </div>
      </div>
      <div class="pf-semanas">
        <div class="pf-semanas-num"><b class="cifra">${r.rachaSemanas}</b> <span>semanas seguidas</span></div>
        <div class="pf-semanas-pie">${r.diasEstaSemana} ${r.diasEstaSemana === 1 ? 'día' : 'días'}
          esta semana · récord ${r.mejorRachaSemanas}</div>
      </div>
      <p class="campo-nota" style="margin-bottom:0">Una racha aguanta hasta ${PF.HUECO_MAX} días
        de descanso: descansar no la rompe, desaparecer sí.</p>
    </div>

    <!-- ------------------------------------------------------------ cifras -->
    <div class="ficha">
      <div class="pf-cifras">
        ${cifraHTML(r.diasEntrenados, 'días', 'Días distintos con al menos una serie apuntada')}
        ${cifraHTML(r.seriesTotales, 'series')}
        ${cifraHTML(r.prs, 'récords', 'Veces que has superado tu propia marca en una máquina')}
        ${cifraHTML(redondear(r.volumenTon, 1), 'toneladas', 'Peso × repeticiones de todo lo que has levantado')}
      </div>
    </div>

    <!-- -------------------------------------------------------------- gente -->
    <h3 class="seccion-titulo">Gente</h3>
    <div class="ficha">
      <div class="pf-social">
        <button class="pf-social-c" id="pf-ver-seguidores">
          <b id="pf-n-seg">·</b><span>seguidores</span></button>
        <button class="pf-social-c" id="pf-ver-siguiendo">
          <b id="pf-n-sig">·</b><span>siguiendo</span></button>
        <button class="pf-social-c" id="pf-ver-rutinas-pub">
          <b id="pf-n-rut">·</b><span>rutinas</span></button>
      </div>
      <div class="botonera">
        <button class="boton boton-2" id="pf-gente">${icono('gente', 17)} Buscar gente</button>
        <button class="boton boton-2" id="pf-comunidad">${icono('carro', 17)} Rutinas de la gente</button>
      </div>
      <div id="pf-exclusivas"></div>
    </div>

    <!-- ---------------------------------------------------------- medallas -->
    <h3 class="seccion-titulo">Medallas</h3>
    <div class="ficha">
      <div class="pf-titulo-fila">
        <p class="campo-nota" style="margin:0">${c.medallasGanadas.length} de ${c.medallas.length}.
          Elige hasta ${INS.MEDALLAS_EN_PERFIL} para lucirlas aquí.</p>
        <button class="boton-plano" id="pf-elegir-medallas">Elegir</button>
      </div>
      <div class="pf-vitrina">
        ${elegidas.length
          ? elegidas.map((m) => `
              <!-- Tocarla vuelve a poner la animación de cuando la sacaste.
                   Carlos: «aún no he visto la animación, no sé cómo hacerla
                   saltar» — y no se puede pedir que desbloquee una medalla
                   para verla. Aquí está, a un toque, cuando quiera. -->
              <button type="button" class="pf-pieza pf-pieza-toca" data-revivir="${esc(m.id)}"
                      aria-label="Ver otra vez cómo se desbloqueó ${esc(m.nombre)}">
                ${INS.dibujarMedalla(m, true, 60)}
                <figcaption>${esc(m.nombre)}
                  ${m.materialInfo
                    ? `<span class="pf-material-nota ${m.materialInfo.clase === 'exotico'
                        ? 'es-exotico' : ''}">${esc(INS.explicarMaterial(m.materialInfo))}</span>`
                    : ''}</figcaption>
              </button>`).join('')
          : `<p class="grafica-vacia">${c.medallasGanadas.length
              ? 'Todavía no has elegido cuáles enseñar.'
              : 'Aún no tienes ninguna. Se ganan levantando en banca, sentadilla, peso muerto, militar, remo o hip thrust.'}</p>`}
      </div>
    </div>

    <!-- --------------------------------------------------------- insignias -->
    <h3 class="seccion-titulo">Insignias</h3>
    <div class="ficha">
      <div class="pf-titulo-fila">
        <p class="campo-nota" style="margin:0">${c.ganadas.length} de ${c.insignias.length} conseguidas.</p>
        <button class="boton-plano" id="pf-vitrina">Ver todas</button>
      </div>
      <div class="pf-vitrina">
        ${escaparate.length
          ? escaparate.map((i) => `
              <figure class="pf-pieza">
                ${INS.dibujarInsignia(i, true, 60)}
                <figcaption>${esc(i.nombre)}</figcaption>
              </figure>`).join('')
          : '<p class="grafica-vacia">Ninguna todavía. La primera cae a los 5 días entrenados.</p>'}
      </div>
    </div>

    <!-- ----------------------------------------------------------- rutinas -->
    <h3 class="seccion-titulo">Mis rutinas</h3>
    <div class="ficha">
      <p class="campo-nota">Con sus series y sus repeticiones. Se comparte el plan, nunca tus pesos.</p>
      ${conRutinas.length ? `<div class="lista">${conRutinas.map((x) => {
        const pl = planDe(x);
        return `
        <div class="pf-fila">
          <div class="pf-fila-texto">
            <div class="pf-fila-nombre">${esc(x.nombre)}</div>
            <div class="pf-fila-detalle">${pl.length} ${pl.length === 1 ? 'ejercicio' : 'ejercicios'} ·
              ${pl.reduce((a, y) => a + y.series, 0)} series</div>
          </div>
          <button class="boton-plano pf-enviar" data-compartir-rutina="${x.id}"
                  aria-label="Compartir la rutina ${esc(x.nombre)}">${icono('enviar', 19)}</button>
        </div>`;
      }).join('')}</div>` : '<p class="grafica-vacia">Todavía no tienes ningún día con máquinas.</p>'}
    </div>

    <!-- ------------------------------------------------------- anotaciones -->
    <h3 class="seccion-titulo">Mis anotaciones</h3>
    <div class="ficha">
      <div class="pf-titulo-fila">
        <p class="campo-nota" style="margin:0">Una lesión, una técnica, un objetivo.</p>
        <button class="boton-plano" id="pf-nueva-nota">+ Añadir</button>
      </div>
      ${perfil.notas.length
        ? `<div class="lista">${perfil.notas.map((n, i) => `
            <div class="pf-fila">
              <div class="pf-fila-texto pf-nota-texto">${esc(n.texto)}<span class="pf-nota-fecha">${esc(n.fecha || '')}</span></div>
              <button class="boton-plano" data-borrar-nota="${i}" aria-label="Borrar esta anotación">${icono('papelera', 18)}</button>
            </div>`).join('')}</div>`
        : '<p class="grafica-vacia">Ninguna todavía.</p>'}
    </div>

    <!-- ------------------------------------------------------------ cuenta -->
    <!-- LA PANTALLA PRINCIPAL YA NO ADMINISTRA NADA.  (1-sep-2026)
         Carlos: «hay que pulir todo el apartado del perfil como si fuese una red
         social de verdad; lo de publicar perfil no me gusta nada. Estaría bien
         que en perfil hubiese una pestaña de configuración y allí tocas todo lo
         de la privacidad, contraseña, seguridad, datos... Lo que sí se queda en
         la pestaña principal es lo de editar perfil y tal».

         Tenía razón y el motivo es de fondo: aquí había un botón «Publicar mi
         perfil» del tamaño de un botón principal, o sea que la acción más
         irreversible de la app —sacar tus datos a internet— estaba al lado de
         «Editar perfil», que no compromete nada. En una red social de verdad la
         privacidad vive en ajustes, se toca a propósito y se toca una vez.

         Aquí se queda quién eres y qué has hecho. Todo lo demás, dentro. -->
    <h3 class="seccion-titulo">Tu cuenta</h3>
    <div class="ficha">
      ${!hayNube
        ? `<p class="campo-nota">Sin cuenta la app funciona ENTERA: apuntar, gráficas, plan,
             metas y nutrición. La cuenta solo sirve para que tu perfil tenga una
             dirección pública y para que los enlaces que mandes sean cortos.</p>
           <button class="boton boton-2" id="pf-config-nube">${icono('nube', 17)} Configurar la nube</button>`
        : conCuenta
          ? `<p class="campo-nota">Dentro como <b>${esc(nube.usuario().email)}</b>.
               Tu perfil está ${perfil.publico
                 ? '<b>publicado</b>' : '<b>en privado</b>'}${
                 perfil.publico ? '' : ' · nadie puede verlo'}.</p>
             <div class="botonera">
               <button class="boton boton-2" id="pf-config">${icono('rueda', 17)} Configuración</button>
               <button class="boton boton-2" id="pf-salir">${icono('salir', 17)} Cerrar sesión</button>
             </div>`
          : `<p class="campo-nota">Entra o crea una cuenta para publicar tu perfil y mandar
               enlaces cortos.</p>
             <button class="boton" id="pf-entrar">Entrar o crear cuenta</button>`}
    </div>

    <!-- Solo sale si LA BASE dice que esta cuenta modera. Se pinta después,
         cuando conteste, y con el número de cosas pendientes: una cola sin
         número es una cola que no se abre. -->
    <div class="botonera" id="pf-mod-fila" hidden style="margin-bottom:var(--e3)">
      <button class="boton boton-2" id="pf-moderar">${icono('escudo', 17)} Moderación
        <span class="chip-cola" id="pf-mod-n"></span></button>
    </div>

    <div class="botonera" style="margin-bottom:var(--e6)">
      <button class="boton boton-2" id="pf-ajustes">${icono('rueda', 17)} Ajustes de la app</button>
    </div>`;

  /* ------------------------------------------------------------- enganches */
  $('#pf-foto', raiz).onclick = () => cambiarFoto();
  $('#pf-editar', raiz).onclick = () => abrirEditarPerfil();
  $('#pf-compartir-perfil', raiz).onclick = () => compartirPerfil();
  $('#pf-vitrina', raiz).onclick = () => abrirVitrina();
  // Volver a ver cómo se desbloqueó una medalla que ya tienes.
  $$('[data-revivir]', raiz).forEach((b) => (b.onclick = () => {
    const m = c.medallasGanadas.find((x) => x.id === b.dataset.revivir);
    if (m) celebrarMedalla(m, { nueva: true, material: m.material || 'hierro' });
  }));
  $('#pf-elegir-medallas', raiz).onclick = () => abrirElegirMedallas();
  $('#pf-vestuario', raiz).onclick = () => { SON.toque(); irA('vestuario'); };
  $('#pf-nueva-nota', raiz).onclick = () => abrirNota();
  $('#pf-ajustes', raiz).onclick = () => irA('ajustes');
  $('#pf-moderar', raiz).onclick = () => abrirModeracion();
  ofrecerModeracion(raiz);
  $('#pf-gente', raiz).onclick = () => abrirGente();
  $('#pf-comunidad', raiz).onclick = () => abrirRutinasComunidad();
  $('#pf-ver-seguidores', raiz).onclick = () => abrirListaDeGente(perfil.alias, 'seguidores');
  $('#pf-ver-siguiendo', raiz).onclick = () => abrirListaDeGente(perfil.alias, 'siguiendo');
  $('#pf-ver-rutinas-pub', raiz).onclick = () => abrirMisRutinasPublicadas();
  cargarMisNumerosSociales(raiz);

  $$('[data-borrar-nota]', raiz).forEach((b) => (b.onclick = async () => {
    const i = Number(b.dataset.borrarNota);
    const notas = perfilActual().notas.slice();
    if (!await preguntar(`¿Borrar «${notas[i].texto.slice(0, 60)}»?`)) return;
    notas.splice(i, 1);
    await guardarPerfil({ notas });
    pintar();
  }));
  $$('[data-compartir-rutina]', raiz).forEach((b) => (b.onclick = () =>
    compartirRutina(b.dataset.compartirRutina)));

  const bConfig = $('#pf-config-nube', raiz);
  if (bConfig) bConfig.onclick = () => abrirConfigNube();
  const bEntrar = $('#pf-entrar', raiz);
  if (bEntrar) bEntrar.onclick = () => abrirCuenta();
  const bSalir = $('#pf-salir', raiz);
  if (bSalir) bSalir.onclick = () => cerrarSesion();
  // Todo lo de administrar la cuenta se ha ido a la hoja de Configuración.
  // Aquí solo queda la puerta.
  const bAjustesPerfil = $('#pf-config', raiz);
  if (bAjustesPerfil) bAjustesPerfil.onclick = () => abrirConfiguracion();
}

/* ==========================================================================
 * CONFIGURACIÓN — privacidad, seguidores, mis rutinas, cuenta y datos
 *
 * Carlos, 1-sep-2026: *«estaría bien que en perfil hubiese una pestaña de
 * configuración y allí tocas todo lo de la privacidad, contraseña, seguridad,
 * datos etc.. lo que sí se queda en la pestaña principal es lo de editar perfil
 * y tal»*. Y antes: *«lo de publicar perfil no me gusta nada»*.
 *
 * POR SECCIONES Y PLEGADAS, no todo a la vez. Aquí dentro conviven la cosa más
 * inocente de la app (cambiar tu nombre) y la más irreversible (borrar la
 * cuenta). Enseñarlas juntas en una lista es lo que hace que un día se toque la
 * que no era. Cada sección se abre a propósito, y la de borrar va la última y
 * en rojo.
 * ========================================================================== */
function abrirConfiguracion() {
  const p = perfilActual();
  hoja(
    'Configuración',
    `<div class="cfg">
       <details class="cfg-bloque" open>
         <summary>${icono('candado', 18)} Privacidad</summary>
         <div class="cfg-cuerpo" id="cfg-privacidad"></div>
       </details>
       <details class="cfg-bloque">
         <summary>${icono('gente', 18)} Quién te sigue</summary>
         <div class="cfg-cuerpo" id="cfg-seguidores"><p class="grafica-vacia">Cargando…</p></div>
       </details>
       <details class="cfg-bloque">
         <summary>${icono('lista', 18)} Tus rutinas publicadas</summary>
         <div class="cfg-cuerpo" id="cfg-rutinas"><p class="grafica-vacia">Cargando…</p></div>
       </details>
       <details class="cfg-bloque">
         <summary>${icono('nube', 18)} Copia de seguridad</summary>
         <div class="cfg-cuerpo" id="cfg-copia"><p class="grafica-vacia">Cargando…</p></div>
       </details>
       <details class="cfg-bloque">
         <summary>${icono('llave', 18)} Cuenta y seguridad</summary>
         <div class="cfg-cuerpo" id="cfg-cuenta"></div>
       </details>
       <details class="cfg-bloque cfg-peligro">
         <summary>${icono('aviso', 18)} Tus datos</summary>
         <div class="cfg-cuerpo" id="cfg-datos"></div>
       </details>
     </div>`,
    (cuerpo, cerrar) => {
      const c = calculoPerfil();

      /* ---------------------------------------------------------- privacidad */
      const pintarPrivacidad = () => {
        const perfil = perfilActual();
        $('#cfg-privacidad', cuerpo).innerHTML = `
          <div class="cfg-opcion">
            <div class="cfg-opcion-texto">
              <b>Perfil público</b>
              <span>${perfil.publico
                ? 'Cualquiera con tu enlace ve tu nombre, tus insignias y las medallas que hayas elegido.'
                : 'Nadie te ve. No sales en las búsquedas ni tienes enlace que mandar.'}</span>
            </div>
            <button type="button" class="interruptor" id="cfg-publico"
                    role="switch" aria-checked="${!!perfil.publico}"
                    aria-label="Perfil público"><span></span></button>
          </div>
          <p class="campo-nota">Lo que NUNCA ve nadie, estés como estés: tus series, tu peso
            corporal y lo que comes. Publicarte enseña tu nombre, tus insignias y tus medallas,
            y nada más. Lo de entrenar solo va a <b>tu copia</b>, que solo abres tú.</p>
          ${perfil.publico
            ? `<button class="boton boton-2" id="cfg-actualizar">Actualizar lo publicado</button>
               <p class="campo-nota">Tu perfil publicado es una foto del momento en que lo
                 publicaste. Esto la vuelve a hacer con tus números de hoy.</p>` : ''}`;

        $('#cfg-publico', cuerpo).onclick = async () => {
          const perfilAhora = perfilActual();
          if (perfilAhora.publico) {
            if (!await preguntar('¿Quitar tu perfil de internet?\n\nDeja de verse para todo el mundo. '
              + 'Puedes volver a publicarlo cuando quieras.')) return;
            await guardarPerfil({ publico: 0 });
            const r = await nube.publicarPerfil({
              ...perfilActual(), publico: false, resumen: {}, insignias: [], medallas: [],
            });
            aviso(r.ok ? 'Tu perfil ya no se ve' : `No pude quitarlo: ${r.motivo}`, 3200);
          } else {
            await publicar(c);
          }
          pintarPrivacidad();
          pintar();
        };
        const bAct = $('#cfg-actualizar', cuerpo);
        if (bAct) bAct.onclick = () => publicar(c);
      };
      pintarPrivacidad();

      /* ---------------------------------------------------------- la copia */
      const pintarCopia = async () => {
        const zona = $('#cfg-copia', cuerpo);
        if (!nube.usuario()) {
          zona.innerHTML = '<p class="grafica-vacia">Entra en tu cuenta para tener copia.</p>';
          return;
        }
        const encendida = await copiaEncendida();
        const info = await nube.infoCopia();
        const mio = db.contarVolcado(await db.volcar());
        const cuando = (info.ok && info.hay && info.actualizado)
          ? new Date(info.actualizado).toLocaleString('es-ES', {
            day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
          : '';
        zona.innerHTML = `
          <div class="cfg-opcion">
            <div class="cfg-opcion-texto">
              <b>Guardar mis entrenos en la nube</b>
              <span>${encendida
                ? 'Se sube una vez al día. Si pierdes el móvil, entras en otro y vuelven.'
                : 'Apagada. Si pierdes el móvil, pierdes lo apuntado.'}</span>
            </div>
            <button type="button" class="interruptor" id="cfg-copia-sw"
                    role="switch" aria-checked="${encendida}"
                    aria-label="Copia de seguridad"><span></span></button>
          </div>
          <p class="campo-nota">Solo la puedes leer tú: lo decide la base de datos, no la app.
            No sale en tu perfil, ni para tus seguidores, ni en las clasificaciones. Van los
            entrenos, las máquinas, la comida y el calendario; <b>las fotos no</b> (pesan
            demasiado y se quedan en el móvil).</p>
          <div class="fg-cifras">
            <div><b>${mio.total}</b><span>apuntes aquí</span></div>
            <div><b>${info.ok && info.hay ? (Number(info.filas) || 0) : 0}</b><span>en la copia</span></div>
            <div><b>${info.ok && info.hay ? `${(Number(info.bytes) / 1048576).toFixed(2)} MB` : '—'}</b><span>ocupa</span></div>
          </div>
          <p class="campo-nota">${info.ok && info.hay
            ? `Última copia: ${esc(cuando)}${info.aparato ? ` · desde ${esc(info.aparato)}` : ''}.`
            : 'Todavía no hay ninguna copia.'}</p>
          <div class="botonera">
            <button class="boton boton-2" id="cfg-copiar">Copiar ahora</button>
            <button class="boton boton-2" id="cfg-traer" ${info.ok && info.hay ? '' : 'disabled'}>Traer la copia</button>
          </div>`;

        $('#cfg-copia-sw', cuerpo).onclick = async () => {
          const nueva = !(await copiaEncendida());
          if (!nueva && !await preguntar('¿Apagar la copia?\n\nDejará de subirse. La que ya hay se queda '
            + 'en la nube hasta que borres la cuenta.')) return;
          await db.ponAjuste(CLAVE_COPIA_ACTIVA, nueva);
          if (nueva) await copiaAutomatica({ forzar: true });
          pintarCopia();
        };
        $('#cfg-copiar', cuerpo).onclick = async (e) => {
          e.target.disabled = true;
          const r = await copiaAutomatica({ forzar: true });
          aviso(r.ok ? `Copia guardada: ${r.filas} apuntes` : `No pude: ${r.motivo}`, 3400);
          pintarCopia();
        };
        $('#cfg-traer', cuerpo).onclick = async () => {
          await ofrecerRestaurar();
          pintarCopia();
        };
      };
      pintarCopia();

      /* --------------------------------------------------------- seguidores */
      const pintarSeguidores = async () => {
        const zona = $('#cfg-seguidores', cuerpo);
        const r = await social.misSeguidores();
        if (!r.ok) { zona.innerHTML = `<p class="grafica-vacia">${esc(r.motivo)}</p>`; return; }
        if (!r.seguidores.length) {
          zona.innerHTML = '<p class="grafica-vacia">Todavía no te sigue nadie.</p>';
          return;
        }
        zona.innerHTML = `
          <p class="campo-nota" style="margin-top:0">${r.seguidores.length}
            ${r.seguidores.length === 1 ? 'persona te sigue' : 'personas te siguen'}.
            Quitar a alguien es silencioso: no se le avisa.</p>
          <div class="lista">${r.seguidores.map((x) => `
            <div class="pf-fila">
              <div class="pf-fila-texto">
                <div class="pf-fila-nombre">${esc(x.alias_visible || x.alias)}</div>
                <div class="pf-fila-sub">${esc(x.nombre || '')}${
                  x.le_sigo ? ' · tú también le sigues' : ''}</div>
              </div>
              <button class="boton-plano cfg-quitar" data-id="${x.id}"
                      data-alias="${esc(x.alias_visible || x.alias)}">Quitar</button>
            </div>`).join('')}</div>`;
        $$('.cfg-quitar', zona).forEach((b) => (b.onclick = async () => {
          if (!await preguntar(`¿Quitar a ${b.dataset.alias} de tus seguidores?\n\n`
            + 'Dejará de ver lo que publicas. No se le avisa, y puede volver a seguirte.')) return;
          const r2 = await social.quitarSeguidor(b.dataset.id);
          if (!r2.ok) return aviso(r2.motivo, 3200);
          aviso('Quitado');
          pintarSeguidores();
        }));
      };
      pintarSeguidores();

      /* ------------------------------------------------------- mis rutinas */
      const pintarRutinas = async () => {
        const zona = $('#cfg-rutinas', cuerpo);
        const r = await social.misRutinas();
        if (!r.ok) { zona.innerHTML = `<p class="grafica-vacia">${esc(r.motivo)}</p>`; return; }
        if (!r.rutinas.length) {
          zona.innerHTML = `<p class="grafica-vacia">No has publicado ninguna. Se publican desde
            Plan, en la rutina que quieras compartir.</p>`;
          return;
        }
        zona.innerHTML = `
          <p class="campo-nota" style="margin-top:0"><b>Esconder</b> no es <b>borrar</b>:
            escondida deja de verse y de poder copiarse, pero si te arrepientes mañana sigue
            entera con sus me gusta. Borrar se lleva por delante los me gusta y los comentarios
            de otra gente, y eso no tiene vuelta.</p>
          <div class="lista">${r.rutinas.map((x) => `
            <div class="pf-fila ${x.visible ? '' : 'cfg-escondida'}">
              <div class="pf-fila-texto">
                <div class="pf-fila-nombre">${esc(x.nombre)}${
                  x.visible ? '' : ' <span class="fila-marca">escondida</span>'}</div>
                <div class="pf-fila-sub">${x.dias} ${x.dias === 1 ? 'día' : 'días'} ·
                  ${x.n_likes} me gusta · ${x.n_copias}
                  ${x.n_copias === 1 ? 'copia' : 'copias'}</div>
              </div>
              <button class="boton-plano cfg-rut-editar" data-id="${x.id}"
                      aria-label="Editar ${esc(x.nombre)}">${icono('lapiz', 18)}</button>
            </div>`).join('')}</div>`;
        $$('.cfg-rut-editar', zona).forEach((b) => (b.onclick = () => {
          const x = r.rutinas.find((y) => y.id === b.dataset.id);
          if (x) editarRutinaPublicada(x, pintarRutinas);
        }));
      };
      pintarRutinas();

      /* ----------------------------------------------------------- cuenta */
      $('#cfg-cuenta', cuerpo).innerHTML = `
        <p class="campo-nota" style="margin-top:0">Dentro como
          <b>${esc((nube.usuario() || {}).email || '')}</b>.</p>
        <div class="botonera">
          <button class="boton boton-2" id="cfg-pass">Cambiar la contraseña</button>
          <button class="boton boton-2" id="cfg-correo">Cambiar el correo</button>
        </div>
        <p class="campo-nota">La contraseña no la sabe ni la app ni yo: Supabase guarda solo
          un resumen del que no se puede sacar, y viaja siempre cifrada. Por eso no hay ningún
          sitio donde «verla»: solo se puede cambiar.</p>`;
      $('#cfg-pass', cuerpo).onclick = () => hojaContrasenaNueva();
      $('#cfg-correo', cuerpo).onclick = () => hojaCambiarCorreo();

      /* ------------------------------------------------------------ datos */
      $('#cfg-datos', cuerpo).innerHTML = `
        <button class="boton boton-2" id="cfg-desactivar">Desactivar la cuenta</button>
        <p class="campo-nota">Te esconde de las búsquedas, de los perfiles y de las
          clasificaciones. Tus datos siguen y vuelves entrando otra vez.</p>
        <div class="botonera">
          <button class="boton boton-peligro" id="cfg-borrar">Borrar la cuenta para siempre</button>
        </div>
        <p class="campo-nota">Borrar se lleva tu perfil, tus rutinas publicadas, tus seguidores
          y tus marcas de las clasificaciones. <b>Lo que tienes apuntado en este móvil no se
          toca</b>: eso nunca ha estado en la nube.</p>`;
      $('#cfg-desactivar', cuerpo).onclick = async () => {
        if (!await preguntar('¿Desactivar tu cuenta?\n\nDejas de salir en búsquedas, perfiles y '
          + 'clasificaciones. Vuelves entrando otra vez. Lo que tienes en el móvil no se toca.')) return;
        const r = await nube.desactivarCuenta(true);
        aviso(r.ok ? 'Cuenta desactivada. Entra otra vez cuando quieras' : r.motivo, 3400);
        cerrar();
        pintar();
      };
      $('#cfg-borrar', cuerpo).onclick = () => { cerrar(); hojaBorrarCuenta(); };
    }
  );
}

/** Cambiar el nombre, la descripción o si se ve una rutina que has publicado. */
function editarRutinaPublicada(x, alTerminar) {
  hoja(
    'Tu rutina publicada',
    `<div class="campo"><label for="er-nombre">Nombre</label>
       <input type="text" id="er-nombre" maxlength="80" value="${esc(x.nombre)}"></div>
     <div class="campo"><label for="er-desc">Descripción</label>
       <textarea id="er-desc" rows="3" maxlength="600">${esc(x.descripcion || '')}</textarea></div>
     <div class="cfg-opcion">
       <div class="cfg-opcion-texto"><b>Se ve</b>
         <span>Escondida, sale de las listas y no se puede copiar. Sus ${x.n_likes}
           me gusta y sus ${x.n_copias} ${x.n_copias === 1 ? 'copia' : 'copias'} se quedan.</span>
       </div>
       <button type="button" class="interruptor" id="er-visible" role="switch"
               aria-checked="${!!x.visible}" aria-label="Se ve"><span></span></button>
     </div>
     <button class="boton" id="er-guardar">Guardar</button>
     <div class="botonera"><button class="boton boton-peligro" id="er-borrar">Borrarla</button></div>
     <p class="campo-nota">Borrarla se lleva sus me gusta y los comentarios que le haya dejado
       la gente. Si solo quieres dejar de enseñarla, escóndela: eso sí tiene vuelta.</p>`,
    (cuerpo, cerrar) => {
      let visible = !!x.visible;
      const sw = $('#er-visible', cuerpo);
      sw.onclick = () => {
        visible = !visible;
        sw.setAttribute('aria-checked', String(visible));
      };
      $('#er-guardar', cuerpo).onclick = async () => {
        const nombre = $('#er-nombre', cuerpo).value.trim();
        if (!nombre) return aviso('Ponle un nombre');
        const r = await social.editarRutinaPublicada(x.id, {
          nombre, descripcion: $('#er-desc', cuerpo).value.trim(), visible,
        });
        if (!r.ok) return aviso(r.motivo, 3200);
        cerrar();
        aviso('Guardada');
        if (alTerminar) alTerminar();
      };
      $('#er-borrar', cuerpo).onclick = async () => {
        if (!await preguntar(`¿Borrar «${x.nombre}» de la comunidad?\n\nSe lleva sus ${x.n_likes} `
          + 'me gusta y sus comentarios. No tiene vuelta.')) return;
        const r = await social.borrarRutinaPublicada(x.id);
        if (!r.ok) return aviso(r.motivo, 3200);
        cerrar();
        aviso('Borrada');
        if (alTerminar) alTerminar();
      };
    }
  );
}

/* --------------------------------------------------------------------------
 * Editar
 * ------------------------------------------------------------------------ */

/**
 * La foto.
 *
 * Se comprime a 512 px ANTES de guardarla. Una foto de móvil son 3-4 MB y aquí
 * se ve a 76: guardarla entera llenaría IndexedDB para nada y tardaría un mundo
 * en subir con los datos del móvil.
 */
async function cambiarFoto() {
  const archivo = await pedirFoto({ camara: false });
  if (!archivo) return;
  const blob = await comprimir(archivo, 512, 0.82);
  await db.guardarAvatar(blob, blob.type || 'image/jpeg');

  // Si hay cuenta, sube también: si no, al abrir tu perfil desde otro móvil la
  // foto no estaría. Y si falla la subida NO se deshace lo local — en el móvil
  // ya la tiene, que es donde la mira el 99 % del tiempo.
  if (nube.usuario()) {
    const r = await nube.subirAvatar(blob);
    if (r.ok) await guardarPerfil({ fotoUrl: r.url });
    else aviso(`Foto guardada aquí, pero no pude subirla: ${r.motivo}`, 3200);
  }
  pintar();
}

function abrirEditarPerfil() {
  const p = perfilActual();
  let tocado = false;
  hoja(
    'Editar perfil',
    `<div class="campo"><label for="pe-nombre">Cómo te llamas</label>
       <input type="text" id="pe-nombre" maxlength="40" value="${esc(p.nombre)}" placeholder="Carlos"></div>
     <div class="campo"><label for="pe-alias">Nombre de usuario</label>
       <div class="cu-alias-caja">
         <span class="cu-arroba" aria-hidden="true">@</span>
         <input type="text" id="pe-alias" maxlength="20" value="${esc(p.aliasVisible)}" placeholder="Carlos"
                autocapitalize="none" autocomplete="username" spellcheck="false">
       </div>
       <p class="campo-nota" id="pe-alias-pista">Es la dirección de tu perfil. Las mayúsculas se
         respetan; lo que no cabe son espacios y signos, porque partirían el enlace.</p></div>
     <div class="campo"><label for="pe-bio">Sobre ti</label>
       <textarea id="pe-bio" rows="4" maxlength="300"
                 placeholder="Empecé en 2024. Push/Pull/Leg. Voy a por los 100 en banca.">${esc(p.bio)}</textarea>
       <p class="campo-nota"><span id="pe-cuenta">${p.bio.length}</span>/300</p></div>
     <div class="barra-accion"><button class="boton" id="pe-guardar">Guardar</button></div>`,
    (cuerpo, cerrar) => {
      const iAlias = $('#pe-alias', cuerpo);
      const iBio = $('#pe-bio', cuerpo);
      $$('input,textarea', cuerpo).forEach((x) => (x.oninput = () => { tocado = true; }));
      // ANTES SE COMÍA LAS MAYÚSCULAS MIENTRAS SE ESCRIBÍA. Carlos, 31-ago-2026:
      // «tampoco se puede poner el nombre de usuario que quieras ni en
      // mayúsculas ni con símbolos». Lo primero era un error nuestro y ya está:
      // las mayúsculas se guardan y se enseñan, y la comparación va aparte, en
      // minúsculas, para que no existan un «Ana» y un «ana» distintos.
      //
      // Lo segundo no se puede arreglar del todo y por eso se EXPLICA en vez de
      // borrarlo a la brava: un espacio o una barra en el alias parten la URL
      // del perfil. Los símbolos que sí caben en una URL (punto, guion y guion
      // bajo) ahora entran.
      const pista = $('#pe-alias-pista', cuerpo);
      iAlias.oninput = () => {
        tocado = true;
        const problema = nube.quePasaConElAlias(iAlias.value);
        pista.className = `campo-nota ${problema ? 'cu-mal' : ''}`;
        pista.textContent = problema
          || (iAlias.value.trim()
            ? `Tu perfil será @${nube.normalizarAlias(iAlias.value)}`
            : 'Es la dirección de tu perfil.');
      };
      iBio.oninput = () => {
        tocado = true;
        $('#pe-cuenta', cuerpo).textContent = String(iBio.value.length);
      };

      $('#pe-guardar', cuerpo).onclick = async () => {
        const escrito = iAlias.value.trim();
        if (escrito) {
          const problema = nube.quePasaConElAlias(escrito);
          if (problema) return aviso(problema, 3600);
        }
        await guardarPerfil({
          nombre: $('#pe-nombre', cuerpo).value.trim(),
          alias: nube.normalizarAlias(escrito),
          aliasVisible: escrito,
          bio: iBio.value.trim(),
        });
        tocado = false;
        cerrar();
        aviso('Perfil guardado');
        pintar();
      };
    },
    { hayTrabajo: () => tocado, avisoSalir: 'Vas a perder lo que has escrito.' }
  );
}

function abrirNota() {
  let tocado = false;
  hoja(
    'Nueva anotación',
    `<div class="campo"><label for="pn-texto">Qué quieres recordar</label>
       <textarea id="pn-texto" rows="4" maxlength="280"
         placeholder="El hombro derecho se queja en press militar: bajar el peso y subir reps."></textarea></div>
     <div class="barra-accion"><button class="boton" id="pn-guardar">Guardar</button></div>`,
    (cuerpo, cerrar) => {
      const t = $('#pn-texto', cuerpo);
      t.oninput = () => { tocado = true; };
      t.focus();
      $('#pn-guardar', cuerpo).onclick = async () => {
        const texto = t.value.trim();
        if (!texto) return aviso('Escribe algo primero');
        const notas = perfilActual().notas.slice();
        // La más nueva arriba: es la que se va a mirar.
        notas.unshift({ texto, fecha: new Date().toISOString().slice(0, 10) });
        await guardarPerfil({ notas });
        tocado = false;
        cerrar();
        pintar();
      };
    },
    { hayTrabajo: () => tocado, avisoSalir: 'Vas a perder la anotación.' }
  );
}

/* --------------------------------------------------------------------------
 * Vitrinas
 * ------------------------------------------------------------------------ */

/**
 * Todas las insignias, ganadas y por ganar.
 *
 * Las pendientes salen apagadas CON su pista y su anillo de progreso. Una
 * vitrina donde solo se ven las conseguidas no dice a dónde ir, y las insignias
 * sirven justamente para eso.
 */
function abrirVitrina() {
  const c = calculoPerfil();
  const porFamilia = new Map();
  for (const i of c.insignias) {
    if (!porFamilia.has(i.familia)) porFamilia.set(i.familia, []);
    porFamilia.get(i.familia).push(i);
  }

  hoja(
    `Insignias · ${c.ganadas.length} de ${c.insignias.length}`,
    [...porFamilia.entries()].map(([familia, lista]) => `
      <h4 class="pf-familia">${esc(INS.FAMILIAS[familia] || familia)}</h4>
      <div class="pf-rejilla">
        ${lista.map((i) => `
          <figure class="pf-pieza pf-pieza-ancha">
            ${INS.dibujarInsignia(i, i.ganada, 56, i.progreso)}
            <figcaption>
              <b>${esc(i.nombre)}</b>
              <span>${i.ganada
                ? `${esc(INS.METALES[i.nivel].nombre)} · conseguida`
                : `${esc(i.pista)} · te ${i.falta === 1 ? 'falta' : 'faltan'} ${redondear(i.falta, 1)}`}</span>
            </figcaption>
          </figure>`).join('')}
      </div>`).join(''),
    () => {}
  );
}

/**
 * «¿Cuál de tus máquinas es el press de banca?»
 *
 * La salida de una medalla en estado `sin_maquina`. Se ofrecen primero las
 * candidatas (las que comparten alguna palabra con el levantamiento) y debajo
 * TODAS, porque una máquina puede llamarse «la del fondo» y no parecerse en
 * nada al nombre del ejercicio.
 *
 * Se puede marcar más de una: el press de banca de Reus y el de Barcelona son
 * dos máquinas distintas y las dos son press de banca. La medalla mira el mejor
 * peso de todas ellas, que es lo que hace un hito absoluto.
 */
function elegirMaquinaDeLevantamiento(levId) {
  const lev = INS.LEVANTAMIENTO_POR_ID.get(levId);
  if (!lev) return;
  const todas = S.cache.maquinas;
  const candidatas = PF.candidatasA(levId, todas);
  const idsCandidatas = new Set(candidatas.map((m) => m.id));
  const resto = todas.filter((m) => !idsCandidatas.has(m.id));
  const marcadas = new Set(todas.filter((m) => PF.levantamientoDe(m) === levId).map((m) => m.id));

  const fila = (m) => `
    <button class="pf-elegible fila-elegible" data-id="${m.id}"
            aria-pressed="${marcadas.has(m.id)}">
      <span class="fila-elegible-t">${esc(m.nombre)}</span>
      <span class="fila-elegible-s">${esc((S.cache.gimnasios.find((g) => g.id === m.gimnasioId) || {}).nombre || '')}</span>
    </button>`;

  hoja(
    `¿Cuál es tu ${lev.nombre.toLowerCase()}?`,
    `
    <p class="campo-nota" style="margin-top:0">Marca las máquinas que sean
      <b>${esc(lev.nombre)}</b>. Solo se usa para las medallas de récord: tu progreso
      sigue comparando cada máquina consigo misma.</p>
    ${candidatas.length ? `<h4 class="pf-familia">Se parecen</h4>
      <div class="lista-elegible">${candidatas.map(fila).join('')}</div>` : ''}
    ${resto.length ? `<h4 class="pf-familia">Todas las demás</h4>
      <div class="lista-elegible">${resto.map(fila).join('')}</div>` : ''}
    ${todas.length ? '' : '<p class="grafica-vacia">Todavía no tienes máquinas.</p>'}
    <button class="boton" id="lv-ok">Guardar</button>`,
    (cuerpo, cerrar) => {
      $$('.pf-elegible', cuerpo).forEach((b) => (b.onclick = () => {
        const id = b.dataset.id;
        if (marcadas.has(id)) marcadas.delete(id); else marcadas.add(id);
        b.setAttribute('aria-pressed', marcadas.has(id));
      }));

      $('#lv-ok', cuerpo).onclick = async () => {
        for (const m of todas) {
          const antes = PF.levantamientoDe(m);
          const ahora = marcadas.has(m.id);
          if (ahora && antes === levId) continue;              // ya estaba bien
          if (!ahora && antes !== levId) continue;             // no le tocaba
          // Al DESMARCAR una que la regla sí reconocía hay que escribir '' a
          // mano: borrar el campo devolvería el mando a la regla y volvería a
          // marcarse sola en la siguiente pintada.
          await db.guardar('maquinas', { ...m, levantamiento: ahora ? levId : '' });
        }
        await recargar();
        cerrar();
        aviso('Listo. Mira otra vez tus medallas');
        pintar();
        sync.sincronizar({ silencioso: true });
      };
    }
  );
}

/* --------------------------------------------------------------------------
 * LOS MATERIALES, CONTADOS  (31-ago-2026)
 *
 * `perfil.js` devuelve DATOS («falta: {dias: 87}») y la frase se pone aquí.
 * Es a propósito: JARVIS lo dirá a su manera y con los mismos números, y así no
 * hay dos textos que puedan decir cosas distintas.
 * ------------------------------------------------------------------------ */

/** «Acero · la sacaste con un 12 % de margen». */
function notaMaterial(m) {
  const mat = m.materialInfo;
  if (!mat) return '';
  const h = mat.hoja || {};
  const como =
    mat.regla === 'margen' ? `le sacas un ${Math.round((h.margen - 1) * 100)} % al listón`
    : mat.regla === 'gimnasios' ? `ese peso en ${h.gimnasios} gimnasios distintos`
    : mat.regla === 'veterana' ? `un año con ella y la has vuelto a batir`
    : mat.regla === 'dias' ? `${h.dias} días con ella`
    : 'la tienes';
  return `${INS.explicarMaterial(mat)} · ${como}`;
}

/** «Para el lapislázuli: 120 kg» — lo que le queda a una medalla que ya tienes. */
function notaSiguienteMaterial(m, c) {
  const s = PF.siguienteMaterial(m, c.resumen.historialLevantamientos, c.resumen.hoy);
  if (!s) return 'El material más raro que hay. No queda nada por encima.';
  const f = s.falta || {};
  if (f.kg && !f.gimnasios) return `Para ${s.nombre.toLowerCase()}: ${redondear(f.kg, 1)} kg`;
  if (f.gimnasios) {
    return `Para ${s.nombre.toLowerCase()}: ${redondear(f.kg, 1)} kg en `
      + `${f.gimnasios} gimnasio${f.gimnasios === 1 ? '' : 's'} más`;
  }
  if (f.batir) {
    return f.dias
      ? `Para ${s.nombre.toLowerCase()}: ${f.dias} días más, y volver a batirla`
      : `Para ${s.nombre.toLowerCase()}: vuelve a batirla`;
  }
  if (f.dias) return `Para ${s.nombre.toLowerCase()}: ${f.dias} días más`;
  return '';
}

/** La tabla de los seis, para que se sepa qué hay y cómo se saca cada uno. */
function tablaDeMateriales() {
  return `<details class="pf-materiales">
    <summary>De qué están hechas las medallas</summary>
    <p class="campo-nota">El nivel dice cuánto pesa el hito. El material dice CÓMO lo
      sacaste, y se recalcula solo de tus series: no se guarda en ningún sitio.</p>
    ${INS.MATERIALES.map((mat) => `
      <div class="pf-material ${mat.clase === 'exotico' ? 'es-exotico' : ''}">
        ${INS.dibujarMedalla({ nombre: mat.nombre, kg: 100, nivel: 2, material: mat.id }, true, 40)}
        <span><b>${esc(mat.nombre)}</b>${mat.clase === 'exotico'
          ? ' <span class="pf-exotico">exótico</span>' : ''}
        <span>${esc(mat.pista)}</span></span>
      </div>`).join('')}
  </details>`;
}

/**
 * Elegir qué medallas se lucen.
 *
 * Solo se pueden marcar las GANADAS. Dejar elegir una que no tienes sería dejar
 * mentir en el perfil, y entonces las medallas de nadie valdrían nada.
 */
function abrirElegirMedallas() {
  const c = calculoPerfil();
  const p = perfilActual();
  const elegidas = new Set(p.medallasElegidas.filter((id) =>
    c.medallas.some((m) => m.id === id && m.ganada)));
  let tocado = false;

  const ganadas = c.medallas.filter((m) => m.ganada);
  const resto = c.medallas.filter((m) => !m.ganada);

  hoja(
    'Elegir medallas',
    `<p class="campo-nota">Hasta ${INS.MEDALLAS_EN_PERFIL} en tu perfil.
       Solo se pueden lucir las que has conseguido.</p>
     <div class="pf-rejilla" id="pm-ganadas"></div>
     <h4 class="pf-familia">Por conseguir</h4>
     <div class="pf-rejilla" id="pm-resto"></div>
     ${tablaDeMateriales()}
     <div class="barra-accion"><button class="boton" id="pm-guardar">Guardar</button></div>`,
    (cuerpo, cerrar) => {
      const zonaG = $('#pm-ganadas', cuerpo);
      const boton = $('#pm-guardar', cuerpo);

      const refrescar = () => {
        boton.textContent = `Guardar (${elegidas.size} de ${INS.MEDALLAS_EN_PERFIL})`;
      };

      if (!ganadas.length) {
        zonaG.innerHTML = `<p class="grafica-vacia">Todavía no tienes ninguna medalla.
          Se ganan en banca, sentadilla, peso muerto, press militar, remo con barra
          y hip thrust.</p>`;
      }
      for (const m of ganadas) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'pf-pieza pf-pieza-ancha pf-elegible';
        b.setAttribute('aria-pressed', elegidas.has(m.id));
        b.innerHTML = `${INS.dibujarMedalla(m, true, 56)}
          <span class="pf-pieza-texto"><b>${esc(m.nombre)}</b>
          <span>${esc(INS.explicarMedalla(m))}</span>
          <span class="pf-material-nota ${m.materialInfo && m.materialInfo.clase === 'exotico'
            ? 'es-exotico' : ''}">${esc(notaMaterial(m))}</span>
          <span class="pf-material-falta">${esc(notaSiguienteMaterial(m, c))}</span></span>`;
        b.onclick = () => {
          if (elegidas.has(m.id)) elegidas.delete(m.id);
          else if (elegidas.size >= INS.MEDALLAS_EN_PERFIL) {
            return aviso(`Solo caben ${INS.MEDALLAS_EN_PERFIL}. Quita una primero.`);
          } else elegidas.add(m.id);
          b.setAttribute('aria-pressed', elegidas.has(m.id));
          tocado = true;
          refrescar();
        };
        zonaG.appendChild(b);
      }

      // POR QUÉ UNA MEDALLA APAGADA TIENE QUE EXPLICARSE
      // Carlos: «con algunas máquinas si cumples los requisitos no lo detecta».
      // El fallo de fondo ya está arreglado (ver LEVANTAMIENTOS en insignias.js),
      // pero queda la mitad visible: cuando la app no encuentra ninguna máquina
      // que sea ese levantamiento, antes salía «pendiente, 0 %» —que se lee como
      // «no levantas bastante»— en vez de «no sé cuál es tu press de banca».
      // Ahora lo dice, y se arregla ahí mismo.
      $('#pm-resto', cuerpo).innerHTML = resto.map((m) => `
        <figure class="pf-pieza pf-pieza-ancha">
          ${INS.dibujarMedalla(m, false, 56, m.progreso)}
          <figcaption><b>${esc(m.nombre)}</b>
            <span>${m.estado === 'sin_peso'
              ? 'Apunta tu peso corporal para poder medirla'
              : m.estado === 'sin_maquina'
                ? `Ninguna de tus máquinas cuenta como ${esc(nombreLevantamiento(m.levantamiento))}`
                : `${esc(INS.explicarMedalla(m))} · vas por ${redondear(m.mejorKg, 1)} kg`}</span>
            ${m.estado === 'sin_maquina'
              ? `<button class="boton-plano pm-asignar" data-lev="${m.levantamiento}">Decir cuál es</button>`
              : m.estado === 'sin_peso'
                // Igual que con la máquina: decir qué falta y arreglarlo ahí
                // mismo. Una medalla apagada sin salida es una medalla rota.
                ? '<button class="boton-plano pm-peso">Apuntar mi peso</button>'
                : ''}</figcaption>
        </figure>`).join('');

      $$('.pm-asignar', cuerpo).forEach((b) => (b.onclick = () => {
        cerrar();
        elegirMaquinaDeLevantamiento(b.dataset.lev);
      }));
      $$('.pm-peso', cuerpo).forEach((b) => (b.onclick = () => { cerrar(); abrirPeso(); }));

      boton.onclick = async () => {
        await guardarPerfil({ medallasElegidas: [...elegidas] });
        tocado = false;
        cerrar();
        pintar();
      };
      refrescar();
    },
    { hayTrabajo: () => tocado, avisoSalir: 'Vas a perder la selección.' }
  );
}

/* --------------------------------------------------------------------------
 * La cuenta (Supabase)
 * ------------------------------------------------------------------------ */

/**
 * Dónde se pegan la dirección y la clave del proyecto.
 *
 * Se piden en la app y no van escritas en el código a propósito: el repositorio
 * es público y, aunque la clave `anon` está pensada para ser pública, meter las
 * credenciales de un proyecto concreto dentro del código obliga a recompilar el
 * APK para cambiar de proyecto. Aquí se pegan una vez y ya está.
 */
function abrirConfigNube() {
  let tocado = false;
  hoja(
    'Configurar la nube',
    `<p class="campo-nota">Estos dos datos salen del panel de Supabase, en
       <b>Project Settings → API</b>. Pega la <b>Project URL</b> y la clave
       <b>anon / public</b> — nunca la <code>service_role</code>.</p>
     <div class="campo"><label for="cn-url">Project URL</label>
       <input type="url" id="cn-url" placeholder="https://xxxxxxxx.supabase.co"
              autocapitalize="none" autocomplete="off" spellcheck="false"></div>
     <div class="campo"><label for="cn-anon">Clave anon / public</label>
       <input type="text" id="cn-anon" placeholder="eyJhbGciOi…"
              autocapitalize="none" autocomplete="off" spellcheck="false"></div>
     <div class="campo"><label for="cn-base">Dirección pública de la app (opcional)</label>
       <input type="url" id="cn-base" placeholder="https://…"
              autocapitalize="none" autocomplete="off" spellcheck="false">
       <p class="campo-nota">Es la raíz de los enlaces que mandes. Si la dejas vacía
         se usa la dirección desde la que abras la app, que dentro del APK no le
         sirve a nadie de fuera.</p></div>
     <div class="botonera" style="margin-top:0">
       <button class="boton boton-2" id="cn-probar">Probar</button>
       <button class="boton" id="cn-guardar">Guardar</button>
     </div>
     <p id="cn-estado" class="campo-nota"></p>`,
    (cuerpo, cerrar) => {
      const estado = $('#cn-estado', cuerpo);
      $$('input', cuerpo).forEach((x) => (x.oninput = () => { tocado = true; }));

      (async () => {
        const c = await nube.configuracion();
        $('#cn-url', cuerpo).value = c.url;
        $('#cn-anon', cuerpo).value = c.anon;
        $('#cn-base', cuerpo).value = (await db.ajuste('compartir_base', '')) || '';
      })();

      const aplicar = async () => {
        await nube.configurar({
          url: $('#cn-url', cuerpo).value,
          anon: $('#cn-anon', cuerpo).value,
        });
        await comp.fijarBase($('#cn-base', cuerpo).value);
      };

      $('#cn-probar', cuerpo).onclick = async () => {
        await aplicar();
        estado.textContent = 'Probando…';
        const r = await nube.probar();
        estado.innerHTML = r.ok
          ? '<span class="estado-sync ok">La nube contesta y los DOS esquemas están puestos</span>'
          : `<span class="estado-sync pendiente">${esc(r.motivo)}</span>`;
      };
      $('#cn-guardar', cuerpo).onclick = async () => {
        await aplicar();
        tocado = false;
        cerrar();
        aviso('Nube configurada');
        pintar();
      };
    },
    { hayTrabajo: () => tocado, avisoSalir: 'Vas a perder lo que has pegado.' }
  );
}

/**
 * «Ya está: ahora ve a tu correo.»
 *
 * Sustituye al formulario en cuanto la cuenta se crea. Tres cosas y ninguna
 * sobra: qué ha pasado, qué tiene que hacer ahora, y la salida por si el correo
 * no llega — que es el caso que antes dejaba a la gente encerrada, porque
 * volver a registrarse falla con «ese correo ya tiene cuenta».
 */
function pantallaRevisaElCorreo(cuerpo, cerrar, email) {
  cuerpo.innerHTML = `
    <div class="cu-hecho">
      <span class="cu-hecho-icono" aria-hidden="true">${icono('enviar', 30)}</span>
      <h3 class="cu-hecho-t">Cuenta creada</h3>
      <p class="cu-hecho-s">Te hemos mandado un correo a <b>${esc(email)}</b>.
        Ábrelo y pulsa el enlace para confirmarla.</p>
    </div>
    <ol class="cu-pasos">
      <li>Abre tu correo (mira también en <b>spam</b>).</li>
      <li>Pulsa el enlace. Se abrirá <b>el navegador</b>, no esta app: es normal.</li>
      <li>Vuelve aquí y entra con tu correo y tu contraseña.</li>
    </ol>
    <button class="boton" id="cu-hecho-entrar">Ya lo he confirmado, entrar</button>
    <button class="boton-plano" id="cu-hecho-reenviar" style="width:100%;margin-top:10px">
      No me ha llegado el correo</button>
    <p id="cu-hecho-estado" class="campo-nota" aria-live="polite"></p>`;

  const estado = $('#cu-hecho-estado', cuerpo);
  $('#cu-hecho-entrar', cuerpo).onclick = () => {
    cerrar();
    abrirCuenta({ modoInicial: 'entrar' });
  };
  $('#cu-hecho-reenviar', cuerpo).onclick = async (e) => {
    e.target.disabled = true;
    const r = await nube.reenviarConfirmacion(email);
    e.target.disabled = false;
    estado.innerHTML = r.ok
      ? `<span class="estado-sync ok">Mandado otra vez a ${esc(email)}.</span>`
      : `<span class="estado-sync pendiente">${esc(r.motivo)}</span>`;
  };
}

/** Cambiar el correo. Supabase manda una confirmación al nuevo. */
function hojaCambiarCorreo() {
  hoja(
    'Cambiar el correo',
    `<p class="campo-nota" style="margin-top:0">Ahora entras con
       <b>${esc((nube.usuario() || {}).email || '')}</b>. Te mandaremos un correo al nuevo para
       confirmar que es tuyo; hasta que lo abras, sigues entrando con el de siempre.</p>
     <div class="campo"><label for="cc-email">Correo nuevo</label>
       <input type="email" id="cc-email" autocomplete="email" inputmode="email"
              autocapitalize="none" spellcheck="false" placeholder="elnuevo@ejemplo.com"></div>
     <button class="boton" id="cc-ir">Mandar la confirmación</button>
     <p id="cc-estado" class="campo-nota" aria-live="polite"></p>`,
    (cuerpo) => {
      const estado = $('#cc-estado', cuerpo);
      $('#cc-ir', cuerpo).onclick = async () => {
        const email = $('#cc-email', cuerpo).value.trim();
        if (!email) return aviso('Escribe el correo nuevo');
        const r = await nube.cambiarCorreo(email);
        estado.innerHTML = r.ok
          ? `<span class="estado-sync ok">Mandado a ${esc(email)}. Ábrelo para terminar.</span>`
          : `<span class="estado-sync pendiente">${esc(r.motivo)}</span>`;
      };
    }
  );
}

/**
 * Borrar la cuenta. La única pantalla de la app con fricción a propósito.
 *
 * Hay que escribir el nombre de usuario. No es por gusto: un botón rojo se
 * pulsa sin querer con el móvil en el bolsillo del pantalón corto, y esto no
 * tiene vuelta. Lo que NO se borra —lo apuntado en el móvil— se dice antes de
 * pulsar, no después.
 */
function hojaBorrarCuenta() {
  const alias = perfilActual().aliasVisible || perfilActual().alias || '';
  hoja(
    'Borrar la cuenta',
    `<p class="campo-nota" style="margin-top:0">Esto <b>no se puede deshacer</b>. Se va:</p>
     <ul class="bv-lista">
       <li>tu perfil público y tu foto</li>
       <li>las rutinas que hayas publicado, con sus me gusta y comentarios</li>
       <li>tus seguidores y a quién sigues</li>
       <li>tus marcas en las clasificaciones de los gimnasios</li>
     </ul>
     <p class="campo-nota"><b>Lo que tienes apuntado en este móvil no se toca</b>: series,
       pesos, máquinas, fotos y comida nunca han salido de aquí. La app te sigue funcionando
       entera sin cuenta.</p>
     <div class="campo"><label for="bc-alias">Escribe <b>${esc(alias || 'tu nombre de usuario')}</b> para confirmar</label>
       <input type="text" id="bc-alias" autocapitalize="none" autocomplete="off" spellcheck="false"></div>
     <button class="boton boton-peligro" id="bc-ir" disabled>Borrar mi cuenta</button>
     <p id="bc-estado" class="campo-nota" aria-live="polite"></p>`,
    (cuerpo, cerrar) => {
      const caja = $('#bc-alias', cuerpo);
      const boton = $('#bc-ir', cuerpo);
      const estado = $('#bc-estado', cuerpo);
      caja.oninput = () => {
        boton.disabled = caja.value.trim().toLowerCase() !== String(alias).toLowerCase() || !alias;
      };
      boton.onclick = async () => {
        boton.disabled = true;
        estado.textContent = 'Borrando…';
        const r = await nube.borrarCuenta();
        if (!r.ok) {
          boton.disabled = false;
          estado.innerHTML = `<span class="estado-sync pendiente">${esc(r.motivo)}</span>`;
          return;
        }
        // El perfil LOCAL se queda: es suyo y vive en su móvil. Lo que se borra
        // es la cuenta de la nube. Borrarle también lo local sería tomar por él
        // una decisión que no ha pedido.
        await guardarPerfil({ publico: 0 });
        cerrar();
        aviso('Cuenta borrada. La app sigue funcionando entera', 3600);
        pintar();
      };
    }
  );
}

/**
 * Entrar o registrarse, en la misma hoja.
 *
 * REHECHA EL 31-AGO-2026. Carlos: *«la creación de usuario está súper mal, va
 * fatal y no te deja confirmar el correo, tampoco se puede poner el nombre de
 * usuario que quieras ni en mayúsculas ni con símbolos ni poder recuperar tu
 * cuenta»*. Eran cuatro cosas distintas y ninguna era una opinión:
 *
 *  1. EL CORREO NO SE PODÍA CONFIRMAR. El enlace de Supabase volvía a la «Site
 *     URL» del panel —de fábrica, `localhost:3000`— y, aunque volviera aquí, la
 *     app se comía el testigo al reescribir el `#` en la primera pintada. Las
 *     dos mitades arregladas: `nube.dondeVuelve()` y la lectura en `arrancar()`.
 *     Y ahora, además, se puede pedir otro correo: sin eso, uno que se pierde en
 *     spam era un callejón sin salida, porque volver a registrarse falla con
 *     «ese correo ya tiene cuenta».
 *  2. EL NOMBRE. Se pedía un «alias» y se le quitaban las mayúsculas delante de
 *     tus ojos. Ahora son DOS campos: el nombre es libre del todo y el nombre de
 *     usuario guarda las mayúsculas que escribas (se compara en minúsculas para
 *     que no haya un «Ana» y un «ana» distintos). Lo que no puede llevar son
 *     espacios ni signos raros, y no es un capricho: es tu dirección.
 *  3. RECUPERAR. Estaba el botón que manda el correo, pero no la pantalla para
 *     escribir la contraseña nueva al volver. O sea, no estaba.
 *  4. LA CONTRASEÑA. Seis caracteres y a correr. Ahora se mide y se dice.
 *
 * Sigue siendo UNA hoja con dos pestañas: dos pantallas separadas obligan a
 * acertar a la primera cuál es la tuya, y quien no se acuerda de si tenía
 * cuenta acaba en la equivocada.
 */
function abrirCuenta({ modoInicial = 'entrar' } = {}) {
  let modo = modoInicial;
  let tocado = false;
  let relojAlias = null;

  hoja(
    'Tu cuenta',
    `<div class="chips" role="tablist">
       <button class="chip" data-modo="entrar" role="tab">Entrar</button>
       <button class="chip" data-modo="registro" role="tab">Crear cuenta</button>
     </div>

     <div class="campo oculto" id="cu-zona-nombre"><label for="cu-nombre">Tu nombre</label>
       <input type="text" id="cu-nombre" maxlength="60" autocomplete="name"
              placeholder="Como quieras que te vean">
       <p class="campo-nota">Aquí cabe todo: mayúsculas, acentos, espacios y signos.</p></div>

     <div class="campo oculto" id="cu-zona-alias"><label for="cu-alias">Nombre de usuario</label>
       <div class="cu-alias-caja">
         <span class="cu-arroba" aria-hidden="true">@</span>
         <input type="text" id="cu-alias" maxlength="20" autocapitalize="none"
                autocomplete="username" spellcheck="false" placeholder="TuNombre">
       </div>
       <p class="campo-nota" id="cu-alias-pista">Es la dirección de tu perfil, la que compartes.</p></div>

     <div class="campo"><label for="cu-email">Correo</label>
       <input type="email" id="cu-email" autocomplete="email" inputmode="email"
              autocapitalize="none" spellcheck="false" placeholder="tucorreo@ejemplo.com"></div>

     <div class="campo"><label for="cu-pass">Contraseña</label>
       <div class="cu-pass-caja">
         <input type="password" id="cu-pass" autocomplete="current-password" placeholder="Tu contraseña">
         <button type="button" class="boton-plano cu-ojo" id="cu-ver" aria-pressed="false">Ver</button>
       </div>
       <div class="cu-fuerza oculto" id="cu-fuerza" aria-live="polite">
         <div class="cu-barra"><span></span></div>
         <p class="campo-nota" id="cu-fuerza-t"></p>
       </div></div>

     <button class="boton" id="cu-ir">Entrar</button>
     <button class="boton-plano" id="cu-olvide" style="width:100%;margin-top:10px">
       He olvidado la contraseña</button>
     <button class="boton-plano oculto" id="cu-reenviar" style="width:100%;margin-top:2px">
       No me ha llegado el correo</button>
     <p id="cu-estado" class="campo-nota" aria-live="polite"></p>

     <p class="campo-nota cu-legal">Tu contraseña no se guarda aquí ni viaja en claro: va cifrada
       por la red y en el servidor se guarda un resumen del que no se puede sacar de vuelta.
       Lo que apuntas entrenando —series, pesos y comida— sube a <b>tu copia de seguridad</b>,
       que <b>solo puedes leer tú</b>: no sale en ningún perfil, ni en las clasificaciones, ni
       para tus seguidores. Se puede apagar en Perfil › Configuración.</p>`,
    (cuerpo, cerrar) => {
      const estado = $('#cu-estado', cuerpo);
      const boton = $('#cu-ir', cuerpo);
      const zonaAlias = $('#cu-zona-alias', cuerpo);
      const zonaNombre = $('#cu-zona-nombre', cuerpo);
      const iAlias = $('#cu-alias', cuerpo);
      const iNombre = $('#cu-nombre', cuerpo);
      const iPass = $('#cu-pass', cuerpo);
      const iEmail = $('#cu-email', cuerpo);
      const pista = $('#cu-alias-pista', cuerpo);
      const zonaFuerza = $('#cu-fuerza', cuerpo);
      const bReenviar = $('#cu-reenviar', cuerpo);

      const p = perfilActual();
      iAlias.value = p.aliasVisible || p.alias || '';
      iNombre.value = p.nombre || '';

      const ponModo = (m) => {
        modo = m;
        $$('[data-modo]', cuerpo).forEach((x) => x.setAttribute('aria-pressed', x.dataset.modo === m));
        zonaAlias.classList.toggle('oculto', m !== 'registro');
        zonaNombre.classList.toggle('oculto', m !== 'registro');
        zonaFuerza.classList.toggle('oculto', m !== 'registro');
        boton.textContent = m === 'entrar' ? 'Entrar' : 'Crear la cuenta';
        iPass.setAttribute('autocomplete', m === 'entrar' ? 'current-password' : 'new-password');
        estado.textContent = '';
        bReenviar.classList.add('oculto');
      };
      $$('[data-modo]', cuerpo).forEach((b) => (b.onclick = () => ponModo(b.dataset.modo)));
      $$('input', cuerpo).forEach((x) => (x.oninput = () => { tocado = true; }));

      $('#cu-ver', cuerpo).onclick = (e) => {
        const ver = iPass.type === 'password';
        iPass.type = ver ? 'text' : 'password';
        e.target.setAttribute('aria-pressed', String(ver));
        e.target.textContent = ver ? 'Ocultar' : 'Ver';
      };

      // El nombre propone el nombre de usuario, pero solo mientras no se haya
      // tocado a mano: si alguien escribe su usuario y luego corrige el nombre,
      // pisárselo sería robarle lo que acaba de escribir.
      let aliasTocado = false;
      iNombre.addEventListener('input', () => {
        if (aliasTocado || !iNombre.value.trim()) return;
        iAlias.value = nube.aliasDesdeNombre(iNombre.value);
        comprobarAlias();
      });

      function comprobarAlias() {
        clearTimeout(relojAlias);
        const problema = nube.quePasaConElAlias(iAlias.value);
        if (problema) {
          pista.className = 'campo-nota cu-mal';
          pista.textContent = problema;
          return;
        }
        pista.className = 'campo-nota';
        pista.textContent = 'Comprobando si está libre…';
        relojAlias = setTimeout(async () => {
          const r = await nube.aliasLibre(nube.normalizarAlias(iAlias.value));
          if (!r.ok) {
            pista.className = 'campo-nota';
            pista.textContent = 'Es la dirección de tu perfil, la que compartes.';
            return;
          }
          pista.className = `campo-nota ${r.libre ? 'cu-bien' : 'cu-mal'}`;
          pista.textContent = r.libre
            ? `Libre. Tu perfil será @${nube.normalizarAlias(iAlias.value)}`
            : 'Ese ya lo tiene otra persona. Prueba con otro';
        }, 420);
      }

      iAlias.oninput = () => { tocado = true; aliasTocado = true; comprobarAlias(); };

      iPass.addEventListener('input', () => {
        if (modo !== 'registro') return;
        const f = nube.fuerzaContrasena(iPass.value, [iEmail.value, iAlias.value]);
        const barra = $('.cu-barra span', cuerpo);
        barra.style.width = `${[8, 40, 72, 100][f.nivel]}%`;
        barra.dataset.nivel = String(f.nivel);
        $('#cu-fuerza-t', cuerpo).textContent = iPass.value ? f.texto : '';
      });

      // «No me ha llegado» se ofrece SOLO después de haber creado la cuenta o
      // de haber fallado por falta de confirmación. Antes de eso es ruido.
      bReenviar.onclick = async () => {
        const email = iEmail.value.trim();
        if (!email) return aviso('Escribe primero tu correo');
        bReenviar.disabled = true;
        const r = await nube.reenviarConfirmacion(email);
        bReenviar.disabled = false;
        estado.innerHTML = r.ok
          ? `<span class="estado-sync ok">Mandado otra vez a ${esc(email)}. Mira también en spam.</span>`
          : `<span class="estado-sync pendiente">${esc(r.motivo)}</span>`;
      };

      boton.onclick = async () => {
        const email = iEmail.value.trim();
        const password = iPass.value;
        if (!email || !password) return aviso('Faltan el correo o la contraseña');

        boton.disabled = true;
        estado.textContent = modo === 'entrar' ? 'Entrando…' : 'Creando la cuenta…';

        let r;
        if (modo === 'entrar') {
          r = await nube.entrar({ email, password });
        } else {
          const problema = nube.quePasaConElAlias(iAlias.value);
          if (problema) {
            boton.disabled = false;
            estado.innerHTML = `<span class="estado-sync pendiente">${esc(problema)}</span>`;
            return;
          }
          // Se comprueba ANTES de crear la cuenta: descubrir que el nombre de
          // usuario está cogido después deja media cuenta hecha y un mensaje
          // que no se entiende.
          const libre = await nube.aliasLibre(nube.normalizarAlias(iAlias.value));
          if (libre.ok && !libre.libre) {
            boton.disabled = false;
            estado.innerHTML = '<span class="estado-sync pendiente">Ese nombre de usuario ya lo tiene otra persona</span>';
            return;
          }
          r = await nube.registrar({
            email, password, alias: iAlias.value.trim(), nombre: iNombre.value.trim(),
          });
        }

        boton.disabled = false;
        if (!r.ok) {
          estado.innerHTML = `<span class="estado-sync pendiente">${esc(r.motivo)}</span>`;
          // Si lo que falta es confirmar, la salida se ofrece AQUÍ mismo.
          if (/confirmar/i.test(r.motivo)) bReenviar.classList.remove('oculto');
          return;
        }
        if (r.confirmar) {
          // EL NOMBRE SE GUARDA AQUÍ TAMBIÉN. Antes solo se guardaba en la rama
          // de «cuenta creada y dentro»: si Supabase pedía confirmar el correo
          // —que es lo normal—, el nombre y el usuario que acababas de escribir
          // se perdían, y la app te los volvía a pedir en la pantalla siguiente.
          // Ese era, literalmente, el «te hace volver a meter el nombre, el
          // usuario» de Carlos, visto desde el otro lado.
          if (modo === 'registro') {
            await guardarPerfil({
              alias: nube.normalizarAlias(iAlias.value),
              aliasVisible: iAlias.value.trim(),
              ...(iNombre.value.trim() ? { nombre: iNombre.value.trim() } : {}),
            });
          }
          // LA PANTALLA CAMBIA ENTERA. Carlos, 31-ago-2026: «le das a crear
          // cuenta y te sale un mensaje de cuenta creada pero se queda en el
          // apartado de crear cuenta». Tenía razón: dejar el formulario debajo
          // de un mensaje de éxito se lee como que se ha colgado. Lo que ha
          // pasado es un cambio de estado, así que la pantalla tiene que
          // cambiar de estado.
          tocado = false;
          pantallaRevisaElCorreo(cuerpo, cerrar, email);
          return;
        }
        if (modo === 'registro') {
          await guardarPerfil({
            alias: nube.normalizarAlias(iAlias.value),
            aliasVisible: iAlias.value.trim(),
            ...(iNombre.value.trim() ? { nombre: iNombre.value.trim() } : {}),
          });
        }
        tocado = false;
        cerrar();
        // AQUÍ pasa todo lo que hace que entrar signifique algo: el perfil baja
        // de la nube, los datos se quedan con dueño, y si hay copia se ofrece.
        await trasEntrar();
        // Si la puerta estaba puesta, esto la quita y arranca la app detrás.
        if (_cerrarPuerta && nube.usuario()) {
          const seguir = _cerrarPuerta;
          _cerrarPuerta = null;
          await seguir();
          return;
        }
        aviso('Dentro');
        pintar();
      };

      $('#cu-olvide', cuerpo).onclick = async () => {
        const email = iEmail.value.trim();
        if (!email) return aviso('Escribe primero tu correo');
        const r = await nube.recuperarContrasena(email);
        estado.innerHTML = r.ok
          ? `<span class="estado-sync ok">Te hemos mandado un correo a ${esc(email)}.
             Ábrelo y podrás poner una contraseña nueva.</span>`
          : `<span class="estado-sync pendiente">${esc(r.motivo)}</span>`;
      };

      ponModo(modo);
      if (modo === 'registro') comprobarAlias();
    },
    { hayTrabajo: () => tocado, avisoSalir: 'Vas a perder lo que has escrito.' }
  );
}

/**
 * «Ese enlace ha caducado» — con la salida, no sin ella.
 *
 * Un enlace de confirmación caducado dejaba una pantalla que no decía nada y
 * una cuenta a medias que además impedía volver a registrarse. Aquí se pide el
 * correo y se manda otro.
 */
function hojaReenviar(titulo, texto) {
  hoja(
    titulo,
    `<p class="campo-nota" style="margin-top:0">${esc(texto)}</p>
     <div class="campo"><label for="rv-email">Tu correo</label>
       <input type="email" id="rv-email" autocomplete="email" inputmode="email"
              autocapitalize="none" spellcheck="false" placeholder="tucorreo@ejemplo.com"></div>
     <button class="boton" id="rv-ir">Mandarme otro correo</button>
     <p id="rv-estado" class="campo-nota" aria-live="polite"></p>`,
    (cuerpo) => {
      const estado = $('#rv-estado', cuerpo);
      $('#rv-ir', cuerpo).onclick = async () => {
        const email = $('#rv-email', cuerpo).value.trim();
        if (!email) return aviso('Escribe tu correo');
        const r = await nube.reenviarConfirmacion(email);
        estado.innerHTML = r.ok
          ? `<span class="estado-sync ok">Mandado a ${esc(email)}. Mira también en spam.</span>`
          : `<span class="estado-sync pendiente">${esc(r.motivo)}</span>`;
      };
    }
  );
}

/**
 * La contraseña nueva, al volver del correo de recuperación.
 *
 * Esta pantalla es la que faltaba entera: había botón para pedir el correo, y
 * al pulsar el enlace no había dónde escribir la contraseña. O sea, recuperar
 * la cuenta no existía.
 */
function hojaContrasenaNueva() {
  let tocado = false;
  hoja(
    'Pon una contraseña nueva',
    `<p class="campo-nota" style="margin-top:0">Ya estás dentro. Elige la contraseña con la que
       vas a entrar a partir de ahora.</p>
     <div class="campo"><label for="cn2-pass">Contraseña nueva</label>
       <div class="cu-pass-caja">
         <input type="password" id="cn2-pass" autocomplete="new-password" placeholder="Mínimo 8 caracteres">
         <button type="button" class="boton-plano cu-ojo" id="cn2-ver" aria-pressed="false">Ver</button>
       </div>
       <div class="cu-fuerza" id="cn2-fuerza" aria-live="polite">
         <div class="cu-barra"><span></span></div>
         <p class="campo-nota" id="cn2-fuerza-t"></p>
       </div></div>
     <button class="boton" id="cn2-ir">Guardar la contraseña</button>
     <p id="cn2-estado" class="campo-nota" aria-live="polite"></p>`,
    (cuerpo, cerrar) => {
      const iPass = $('#cn2-pass', cuerpo);
      const estado = $('#cn2-estado', cuerpo);
      iPass.oninput = () => {
        tocado = true;
        const f = nube.fuerzaContrasena(iPass.value, [(nube.usuario() || {}).email]);
        const barra = $('.cu-barra span', cuerpo);
        barra.style.width = `${[8, 40, 72, 100][f.nivel]}%`;
        barra.dataset.nivel = String(f.nivel);
        $('#cn2-fuerza-t', cuerpo).textContent = iPass.value ? f.texto : '';
      };
      $('#cn2-ver', cuerpo).onclick = (e) => {
        const ver = iPass.type === 'password';
        iPass.type = ver ? 'text' : 'password';
        e.target.setAttribute('aria-pressed', String(ver));
        e.target.textContent = ver ? 'Ocultar' : 'Ver';
      };
      $('#cn2-ir', cuerpo).onclick = async () => {
        const r = await nube.cambiarContrasena(iPass.value);
        if (!r.ok) {
          estado.innerHTML = `<span class="estado-sync pendiente">${esc(r.motivo)}</span>`;
          return;
        }
        tocado = false;
        cerrar();
        aviso('Contraseña cambiada');
        pintar();
      };
    },
    { hayTrabajo: () => tocado, avisoSalir: 'No habrás cambiado la contraseña.' }
  );
}

/**
 * Sube el perfil a internet.
 *
 * Sube el RESUMEN ya calculado, las insignias ganadas y las medallas elegidas.
 * Nunca las series: los kilos de cada día son suyos y no le interesan a nadie
 * más, y subirlos convertiría un perfil público en un diario público.
 */
async function publicar(calculo) {
  const p = perfilActual();
  if (!p.alias) {
    aviso('Antes ponte un alias en «Editar perfil»: es la dirección de tu perfil', 3200);
    return abrirEditarPerfil();
  }

  const c = calculo || calculoPerfil();
  const r = await nube.publicarPerfil({
    alias: p.alias,
    nombre: p.nombre,
    bio: p.bio,
    fotoUrl: p.fotoUrl,
    publico: true,
    resumen: {
      diasEntrenados: c.resumen.diasEntrenados,
      seriesTotales: c.resumen.seriesTotales,
      rachaDias: c.resumen.rachaDias,
      rachaSemanas: c.resumen.rachaSemanas,
      mejorRachaSemanas: c.resumen.mejorRachaSemanas,
      prs: c.resumen.prs,
      volumenTon: Math.round(c.resumen.volumenTon * 10) / 10,
      diasDesdeLaPrimera: c.resumen.diasDesdeLaPrimera,
      veterania: c.veterania.nombre,
    },
    insignias: c.ganadas.map((i) => i.id),
    medallas: p.medallasElegidas.filter((id) => c.medallasGanadas.some((m) => m.id === id)),
    // Los nombres de sus rutinas y cuántos ejercicios tiene cada una. Sin el
    // plan: para llevarse la rutina está el enlace, que es un acto voluntario.
    rutinas: S.cache.rutinas.filter((x) => planDe(x).length)
      .map((x) => ({ nombre: x.nombre, ejercicios: planDe(x).length })),
    notas: p.notas.map((n) => n.texto),
  });

  if (!r.ok) return aviso(`No pude publicarlo: ${r.motivo}`, 3400);
  await guardarPerfil({ publico: 1 });
  aviso('Perfil publicado');
  pintar();
}

/* --------------------------------------------------------------------------
 * Compartir
 * ------------------------------------------------------------------------ */

/**
 * La hoja del enlace.
 *
 * Se enseña el enlace ENTERO y se puede copiar además de mandarlo. Un botón de
 * «compartir» a secas, cuando el selector del móvil falla o no está, deja sin
 * salida — y el enlace es justo lo que se ha venido a buscar.
 */
function hojaEnlace(titulo, enlace, texto) {
  // Sin dirección pública no hay enlace que mandar, y hay que decirlo con la
  // salida delante. Enseñar `/#/i/eyJ0…` sería dar algo que parece un enlace,
  // se copia tan ricamente y no abre en ninguna parte.
  if (enlace.sinRaiz) {
    return hoja(
      'Falta dónde vive la app',
      `<p class="campo-nota" style="margin-top:0">Un enlace tiene que apuntar a algún sitio, y
         la app todavía no sabe cuál es el suyo. Dentro del móvil se sirve desde una dirección
         que <b>solo existe aquí dentro</b>, así que no le vale a nadie de fuera.</p>
       <p class="campo-nota">Pega la dirección pública de la app y los enlaces empezarán a
         funcionar. Es la que te dio Cloudflare Pages al publicarla.</p>
       <button class="boton" id="ce-config">Ponerla ahora</button>`,
      (cuerpo, cerrar) => {
        $('#ce-config', cuerpo).onclick = () => { cerrar(); abrirConfigNube(); };
      }
    );
  }
  hoja(
    titulo,
    `<p class="campo-nota">${esc(texto)}</p>
     <div class="pf-enlace"><code id="ce-url">${esc(enlace.url)}</code></div>
     ${enlace.corto ? '' : `<p class="campo-nota">Este enlace lleva la rutina dentro,
        por eso es largo. Funciona igual, y sin necesitar cuenta ni internet para
        crearlo${enlace.motivo ? ` (${esc(enlace.motivo)})` : ''}.</p>`}
     <div class="botonera">
       <button class="boton" id="ce-mandar">${icono('enviar', 17)} Mandar por WhatsApp u otra app</button>
       <button class="boton boton-2" id="ce-copiar">${icono('copiar', 17)} Copiar el enlace</button>
     </div>`,
    (cuerpo, cerrar) => {
      $('#ce-mandar', cuerpo).onclick = async () => {
        // OJO: `navigator.share` exige el gesto del usuario, así que esto se
        // llama DIRECTO desde el onclick, sin ningún await por delante.
        const r = await comp.mandar({ url: enlace.url, texto });
        if (r.como === 'copiado') aviso('Enlace copiado: pégalo en WhatsApp');
        if (r.como === 'whatsapp') window.open(r.whatsapp, '_blank', 'noopener');
        if (r.como === 'compartir') cerrar();
      };
      $('#ce-copiar', cuerpo).onclick = async () => {
        aviso(await comp.copiar(enlace.url) ? 'Enlace copiado' : 'No pude copiarlo: selecciónalo a mano');
      };
    }
  );
}

async function compartirRutina(rutinaId) {
  const rutina = S.cache.rutinas.find((x) => x.id === rutinaId);
  if (!rutina) return;
  const plan = planDe(rutina);
  if (!plan.length) return aviso('Esa rutina no tiene ejercicios todavía');

  const p = perfilActual();
  const paquete = comp.empaquetarRutina(rutina, plan, mapa(S.cache.maquinas), p.nombre || p.alias);
  aviso('Preparando el enlace…', 1200);
  const enlace = await comp.enlaceDe(paquete);
  hojaEnlace(`Compartir «${rutina.nombre}»`, enlace, comp.textoDe(paquete, p.nombre || p.alias));
}

/**
 * Publicar una rutina para que la vea todo el mundo.
 *
 * COMPARTIR Y PUBLICAR NO SON LO MISMO, y por eso son dos botones y no uno:
 *  · Compartir manda un ENLACE a quien tú eliges. No lo ve nadie más.
 *  · Publicar la pone en una lista pública que puede abrir cualquiera, con tu
 *    nombre encima.
 * Confundirlas sería el peor fallo posible de esta pantalla, así que la hoja lo
 * dice antes de que se pulse, no después.
 */
async function publicarRutina(rutinaId) {
  const rutina = S.cache.rutinas.find((x) => x.id === rutinaId);
  if (!rutina) return;
  const plan = planDe(rutina);
  if (!plan.length) return aviso('Esa rutina no tiene ejercicios todavía');
  if (!nube.usuario()) return abrirCuenta({ modoInicial: 'registro' });

  const p = perfilActual();
  const paquete = comp.empaquetarRutina(rutina, plan, mapa(S.cache.maquinas), p.nombre || p.alias);
  const exp = await db.ajuste('experiencia', 'cualquiera');
  const dias = Math.max(1, Math.min(7, S.cache.rutinas.length));

  hoja(
    `Publicar «${rutina.nombre}»`,
    `<p class="campo-nota" style="margin-top:0">Esto <b>no es compartir un enlace</b>: la rutina
       aparecerá en la lista pública con tu nombre de usuario y cualquiera podrá llevársela,
       marcarla y comentarla. La puedes quitar cuando quieras desde tu perfil.</p>
     <p class="campo-nota">Van los <b>${plan.length} ejercicios y sus series</b>. No van tus pesos,
       ni tus fotos, ni tu historial.</p>
     <div class="campo"><label for="pr-desc">Cuéntala en dos líneas (opcional)</label>
       <textarea id="pr-desc" rows="3" maxlength="600"
                 placeholder="Para quién es, cuánto dura, qué esperar"></textarea></div>
     <div class="campo"><label for="pr-nivel">¿Para quién es?</label>
       <select id="pr-nivel">
         <option value="cualquiera">Para cualquiera</option>
         <option value="empiezo" ${exp === 'empiezo' ? 'selected' : ''}>Para empezar</option>
         <option value="medio" ${exp === 'medio' ? 'selected' : ''}>Nivel medio</option>
         <option value="avanzado" ${exp === 'avanzado' ? 'selected' : ''}>Avanzada</option>
       </select></div>
     <button class="boton" id="pr-ir">Publicarla</button>
     <p id="pr-estado" class="campo-nota" aria-live="polite"></p>`,
    (cuerpo, cerrar) => {
      $('#pr-ir', cuerpo).onclick = async () => {
        const boton = $('#pr-ir', cuerpo);
        boton.disabled = true;
        const r = await social.publicarRutina({
          nombre: rutina.nombre,
          descripcion: $('#pr-desc', cuerpo).value.trim(),
          nivel: $('#pr-nivel', cuerpo).value,
          dias,
          datos: paquete,
        });
        boton.disabled = false;
        if (!r.ok) {
          $('#pr-estado', cuerpo).innerHTML = `<span class="estado-sync pendiente">${esc(r.motivo)}</span>`;
          return;
        }
        cerrar();
        aviso('Publicada. Ya sale en «Rutinas de la gente»', 3200);
        pintar();
      };
    }
  );
}

async function compartirGimnasio(gimnasioId) {
  const gim = S.cache.gimnasios.find((g) => g.id === gimnasioId);
  if (!gim) return;
  const maquinas = S.cache.maquinas.filter((m) => m.gimnasioId === gimnasioId);
  if (!maquinas.length) return aviso('Ese gimnasio no tiene máquinas todavía');

  const p = perfilActual();
  const paquete = comp.empaquetarGimnasio(gim, maquinas, p.nombre || p.alias);
  aviso('Preparando el enlace…', 1200);
  const enlace = await comp.enlaceDe(paquete);
  hojaEnlace(`Compartir «${gim.nombre}»`, enlace, comp.textoDe(paquete, p.nombre || p.alias));
}

async function compartirPerfil() {
  const p = perfilActual();
  if (!p.alias) {
    aviso('Antes ponte un alias: es la dirección de tu perfil', 3000);
    return abrirEditarPerfil();
  }
  if (!p.publico) {
    if (!await preguntar('Tu perfil está en privado: quien abra el enlace no verá nada.\n\n¿Lo publicas ahora?')) return;
    await publicar();
    if (!perfilActual().publico) return;   // la publicación falló, ya se avisó
  }
  const url = await comp.enlacePerfil(p.alias);
  hojaEnlace('Compartir tu perfil', { url, corto: true },
    `Mira mi perfil de GYM: @${p.alias}`);
}

/* --------------------------------------------------------------------------
 * Recibir un enlace
 * ------------------------------------------------------------------------ */

/**
 * Alguien ha abierto la app desde un enlace compartido.
 *
 * NUNCA se importa sin preguntar. Se enseña lo que trae (todos los ejercicios,
 * con sus series y reps), en qué gimnasio va a caer y cuántas máquinas se
 * crearían. Un enlace que mete cosas en la base con solo abrirlo es un enlace
 * peligroso, y encima quien lo abra por curiosidad se encontraría un gimnasio
 * nuevo sin saber de dónde salió.
 */
async function atenderEnlace(rutaYaLeida = null) {
  // `rutaYaLeida` viene del arranque, donde se leyó antes de que `pintar()`
  // pisara el `#`. Desde `hashchange` no hace falta: ahí el `#` acaba de
  // cambiar y todavía es el bueno.
  const ruta = rutaYaLeida || comp.leerHash();
  if (!ruta) return;
  comp.limpiarHash();     // para que recargar la página no vuelva a preguntar

  if (ruta.que === 'perfil') return abrirPerfilAjeno(ruta.alias);

  const r = await comp.abrir(ruta);
  if (!r.ok) return aviso(r.motivo, 3600);
  const paquete = r.paquete;

  if (paquete.tipo === 'rutina') return hojaImportarRutina(paquete);
  return hojaImportarGimnasio(paquete);
}

function hojaImportarRutina(paquete) {
  const gimnasios = S.cache.gimnasios;
  let destino = S.gimnasioId || (gimnasios[0] && gimnasios[0].id) || null;

  const cuantasFaltan = (gimnasioId) => {
    const tengo = new Set(S.cache.maquinas.filter((m) => m.gimnasioId === gimnasioId)
      .map((m) => PF.normalizarNombre(m.nombre)));
    return paquete.ejercicios.filter((e) => !tengo.has(PF.normalizarNombre(e.nombre))).length;
  };

  hoja(
    `Rutina «${paquete.nombre}»`,
    `<p class="campo-nota">${paquete.autor ? `Te la manda <b>${esc(paquete.autor)}</b>. ` : ''}
       ${paquete.ejercicios.length} ejercicios.</p>
     <div class="campo"><label for="ir-gym">¿En qué gimnasio la quieres?</label>
       <select id="ir-gym">${gimnasios.map((g) => `
         <option value="${g.id}" ${g.id === destino ? 'selected' : ''}>${esc(g.nombre)}</option>`).join('')}</select></div>
     <p class="campo-nota" id="ir-faltan"></p>
     <div class="lista">${paquete.ejercicios.map((e) => `
       <div class="pf-fila">
         <div class="pf-fila-texto">
           <div class="pf-fila-nombre">${esc(e.nombre)}</div>
           <div class="pf-fila-detalle">${esc((D.GRUPOS.find((g) => g.id === e.grupo) || {}).nombre || '')}</div>
         </div>
         <span class="plan-objetivo">${e.series}×${e.reps}</span>
       </div>`).join('')}</div>
     <div class="barra-accion"><button class="boton" id="ir-importar">Añadir esta rutina</button></div>`,
    (cuerpo, cerrar) => {
      const sel = $('#ir-gym', cuerpo);
      const aviso1 = $('#ir-faltan', cuerpo);

      const refrescar = () => {
        destino = sel.value;
        const n = cuantasFaltan(destino);
        aviso1.textContent = n
          ? `${n} de esos ejercicios no los tienes en ese gimnasio: se darán de alta.`
          : 'Ya tienes todas esas máquinas: no se creará ninguna.';
      };
      sel.onchange = refrescar;
      refrescar();

      if (!gimnasios.length) {
        aviso1.textContent = 'Primero crea un gimnasio en la pestaña «Gimnasios».';
        $('#ir-importar', cuerpo).disabled = true;
        return;
      }

      $('#ir-importar', cuerpo).onclick = async () => {
        const res = await comp.importarRutina(paquete, destino, {
          maquinas: S.cache.maquinas,
          rutinas: S.cache.rutinas,
        });
        await recargar();
        sync.sincronizar({ silencioso: true });
        cerrar();
        aviso(`«${res.rutina.nombre}» añadida · ${res.ejercicios} ejercicios${
          res.creadas ? `, ${res.creadas} máquinas nuevas` : ''}`, 3600);
        irA('entrenar');
      };
    }
  );
}

function hojaImportarGimnasio(paquete) {
  hoja(
    `Gimnasio «${paquete.nombre}»`,
    `<p class="campo-nota">${paquete.autor ? `Te lo manda <b>${esc(paquete.autor)}</b>. ` : ''}
       ${paquete.maquinas.length} máquinas ya apuntadas${paquete.ciudad ? ` · ${esc(paquete.ciudad)}` : ''}.</p>
     <p class="campo-nota">Se creará como un gimnasio NUEVO, aunque ya tengas uno con
       ese nombre: dos gimnasios distintos tienen máquinas distintas y juntarlos
       partiría el historial de los dos.</p>
     <div class="lista">${paquete.maquinas.slice(0, 60).map((m) => `
       <div class="pf-fila">
         <div class="pf-fila-texto">
           <div class="pf-fila-nombre">${esc(m.nombre)}</div>
           <div class="pf-fila-detalle">${esc((D.GRUPOS.find((g) => g.id === m.grupo) || {}).nombre || '')} · ${esc(m.unidad)}</div>
         </div>
       </div>`).join('')}
       ${paquete.maquinas.length > 60 ? `<p class="campo-nota">…y ${paquete.maquinas.length - 60} más.</p>` : ''}</div>
     <div class="barra-accion"><button class="boton" id="ig-importar">Añadir este gimnasio</button></div>`,
    (cuerpo, cerrar) => {
      $('#ig-importar', cuerpo).onclick = async () => {
        const res = await comp.importarGimnasio(paquete, { gimnasios: S.cache.gimnasios });
        await recargar();
        S.gimnasioId = res.gimnasio.id;
        await db.ponAjuste('ultimo_gym', S.gimnasioId);
        sync.sincronizar({ silencioso: true });
        cerrar();
        aviso(`«${res.gimnasio.nombre}» añadido con ${res.creadas} máquinas`, 3600);
        irA('entrenar');
      };
    }
  );
}

/** El perfil público de otra persona. Solo se mira: aquí no se importa nada. */
async function abrirPerfilAjeno(alias) {
  aviso('Buscando ese perfil…', 1400);
  const r = await nube.perfilDe(alias);
  if (!r.ok) return aviso(r.motivo, 3200);
  const p = r.perfil;
  const res = p.resumen || {};
  const suyas = new Set(p.insignias || []);
  const medallas = (p.medallas || []).map((id) => INS.MEDALLA_POR_ID.get(id)).filter(Boolean);
  const insignias = INS.INSIGNIAS.filter((i) => suyas.has(i.id))
    .sort((a, b) => b.nivel - a.nivel).slice(0, 8);

  hoja(
    `@${alias}`,
    `<div class="pf-cabeza">
       ${p.foto_url
         ? `<img class="pf-foto" style="width:76px;height:76px" src="${esc(p.foto_url)}" alt="Foto de ${esc(alias)}">`
         : `<span class="pf-foto pf-iniciales" style="width:76px;height:76px;font-size:27px" aria-hidden="true">${
             esc((p.nombre || alias)[0].toUpperCase())}</span>`}
       <div class="pf-quien">
         <h2 class="pf-nombre">${esc(p.nombre || alias)}</h2>
         <div class="pf-nivel"><span>${esc(res.veterania || '')}</span></div>
       </div>
     </div>
     ${p.bio ? `<p class="pf-bio">${esc(p.bio)}</p>` : ''}
     <div class="botonera" id="pa-acciones"></div>
     <div class="pf-social">
       <button class="pf-social-c" data-cuales="seguidores">
         <b>${Number(p.n_seguidores) || 0}</b><span>seguidores</span></button>
       <button class="pf-social-c" data-cuales="siguiendo">
         <b>${Number(p.n_siguiendo) || 0}</b><span>siguiendo</span></button>
       <span class="pf-social-c"><b>${Number(p.n_rutinas) || 0}</b><span>rutinas</span></span>
     </div>
     <div class="pf-cifras">
       ${cifraHTML(res.diasEntrenados ?? '—', 'días')}
       ${cifraHTML(res.rachaSemanas ?? '—', 'semanas')}
       ${cifraHTML(res.prs ?? '—', 'récords')}
       ${cifraHTML(res.volumenTon != null ? redondear(res.volumenTon, 1) : '—', 'toneladas')}
     </div>
     ${medallas.length ? `<h4 class="pf-familia">Medallas</h4>
       <div class="pf-vitrina">${medallas.map((m) => `
         <figure class="pf-pieza">${INS.dibujarMedalla(m, true, 58)}
         <figcaption>${esc(m.nombre)}</figcaption></figure>`).join('')}</div>` : ''}
     ${insignias.length ? `<h4 class="pf-familia">Insignias</h4>
       <div class="pf-vitrina">${insignias.map((i) => `
         <figure class="pf-pieza">${INS.dibujarInsignia(i, true, 58)}
         <figcaption>${esc(i.nombre)}</figcaption></figure>`).join('')}</div>` : ''}
     ${(p.rutinas || []).length ? `<h4 class="pf-familia">Sus rutinas</h4>
       <div class="lista">${p.rutinas.map((x) => `
         <div class="pf-fila"><div class="pf-fila-texto">
           <div class="pf-fila-nombre">${esc(x.nombre)}</div>
           <div class="pf-fila-detalle">${Number(x.ejercicios) || 0} ejercicios</div>
         </div></div>`).join('')}</div>
       <p class="campo-nota">Para llevarte una, pídesela: te mandará el enlace.</p>` : ''}
     ${(p.notas || []).length ? `<h4 class="pf-familia">Sus anotaciones</h4>
       <div class="lista">${p.notas.map((t) => `
         <div class="pf-fila"><div class="pf-fila-texto pf-nota-texto">${esc(t)}</div></div>`).join('')}</div>` : ''}`,
    (cuerpo) => {
      pintarExclusivasEn(cuerpo, p.exclusivas);
      pintarBotonSeguir($('#pa-acciones', cuerpo), alias);
      $$('.pf-social-c[data-cuales]', cuerpo).forEach((b) => (b.onclick = () =>
        abrirListaDeGente(alias, b.dataset.cuales)));
      // DENUNCIAR. Carlos: «se deberían poder denunciar las cuentas que tengan
      // un mal comportamiento». Va abajo del todo y en gris: es una salida, no
      // una acción que se ofrezca antes que seguir a alguien.
      if (p.id && nube.usuario() && p.id !== nube.usuario().id) {
        const pie = document.createElement('div');
        pie.className = 'pf-denunciar';
        pie.innerHTML = '<button type="button" class="boton boton-2" '
          + `id="pa-denunciar">Denunciar a @${esc(alias)}</button>`;
        cuerpo.appendChild(pie);
        $('#pa-denunciar', pie).onclick = () => abrirDenuncia('perfil', p.id, `@${alias}`);
      }
    }
  );
}

/* ==========================================================================
 * EL PANEL DEL MODERADOR  (v0.22.0)
 *
 * Carlos, 2-sep-2026: *«dame alguna interfaz para mi cuenta (…) para poder
 * gestionar una especie de panel, poder gestionar solicitudes o incidencias o
 * reportes (…) básate en precedentes, no quiero inventar la rueda: busca cómo
 * se suele moderar una app»*.
 *
 * DE DÓNDE SALE ESTE DISEÑO (no de la cabeza de nadie)
 * ---------------------------------------------------
 * Del `modqueue` de Reddit, que es el precedente con más kilómetros que hay, y
 * del trabajo que lo estudió: «"Think about it like you're a firefighter":
 * Understanding How Reddit Moderators Use the Modqueue» (CHI 2026) y «Towards a
 * Better Modqueue» (arXiv 2409.16840). Lo que se copia, punto por punto:
 *
 *   · UNA SOLA COLA. Todo lo que hay que atender vive en el mismo sitio, no
 *     repartido por siete pantallas. Aquí: solicitudes de gimnasio y denuncias.
 *   · SE ORDENA A MANO. El estudio encontró que los moderadores priorizan por
 *     ANTIGÜEDAD o por CUÁNTA GENTE lo ha reportado, y que cada uno trabaja de
 *     una manera. Así que hay un selector de orden, no un orden impuesto.
 *   · CONTEXTO EN LA PROPIA FILA. La queja número uno del estudio es que la
 *     cola no da lo suficiente para decidir sin salir de ella. Por eso cada
 *     denuncia trae el motivo, el texto, CUÁNTAS veces se ha denunciado a ese
 *     mismo objetivo, y un botón para abrir el perfil denunciado.
 *   · LAS ACCIONES, EN LA FILA. Nada de abrir un formulario para decir que sí.
 *
 * Lo que NO se copia: Reddit tiene la cola en el escritorio. Esto es un móvil
 * de 360 px, así que en vez de una tabla son tarjetas apiladas, las pestañas
 * van arriba y todos los botones pasan de 44 px.
 *
 * Y LO IMPORTANTE: esta pantalla no da permisos. Sale si la BASE contesta que
 * sí a `soy_moderador()`, y aun así cada acción lo vuelve a comprobar por su
 * cuenta en el servidor. Esconder un botón nunca ha sido un permiso.
 * ========================================================================== */

/** Si esta cuenta modera, se enseña la entrada al panel con lo que hay abierto. */
async function ofrecerModeracion(raiz) {
  const fila = $('#pf-mod-fila', raiz);
  if (!fila) return;
  if (!nube.usuario() || !(await nube.hayNube())) return;
  if (!(await social.soyModerador())) return;
  fila.hidden = false;
  const [ped, den] = await Promise.all([social.pedidosGimnasio('', 50), social.denunciasAbiertas(50)]);
  const n = ((ped.ok && ped.pedidos.length) || 0) + ((den.ok && den.denuncias.length) || 0);
  const chip = $('#pf-mod-n', raiz);
  if (chip) chip.textContent = n ? String(n) : '';
}

/** El estado del panel: qué pestaña y con qué orden. Vive entre pintadas. */
const MOD = { pestana: 'gimnasios', orden: 'apoyos' };

function abrirModeracion() {
  if (!nube.usuario()) return abrirCuenta();
  hoja(
    'Moderación',
    `<div class="mod-tabs" role="tablist">
       <button class="mod-tab" role="tab" data-tab="gimnasios">Gimnasios
         <span class="chip-cola" data-n="gimnasios"></span></button>
       <button class="mod-tab" role="tab" data-tab="denuncias">Denuncias
         <span class="chip-cola" data-n="denuncias"></span></button>
       <button class="mod-tab" role="tab" data-tab="equipo">Equipo</button>
     </div>
     <div id="mod-cuerpo" aria-live="polite">
       <p class="grafica-vacia">Cargando…</p></div>`,
    (cuerpo) => {
      const pintarTabs = () => $$('.mod-tab', cuerpo).forEach((b) => {
        const activa = b.dataset.tab === MOD.pestana;
        b.setAttribute('aria-selected', activa ? 'true' : 'false');
        b.classList.toggle('mod-tab-activa', activa);
      });
      $$('.mod-tab', cuerpo).forEach((b) => (b.onclick = () => {
        MOD.pestana = b.dataset.tab;
        pintarTabs();
        refrescarModeracion(cuerpo);
      }));
      pintarTabs();
      refrescarModeracion(cuerpo);
    },
  );
}

/** «hace 3 días» — la antigüedad, que es por lo que se prioriza media cola. */
function haceCuanto(iso) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const dias = Math.floor((Date.now() - t) / 86400000);
  if (dias <= 0) return 'hoy';
  if (dias === 1) return 'ayer';
  if (dias < 31) return `hace ${dias} días`;
  const meses = Math.round(dias / 30);
  return meses < 12 ? `hace ${meses} meses` : `hace más de un año`;
}

async function refrescarModeracion(cuerpo) {
  const zona = $('#mod-cuerpo', cuerpo);
  if (!zona) return;
  zona.innerHTML = '<p class="grafica-vacia">Cargando…</p>';

  const [ped, den] = await Promise.all([social.pedidosGimnasio('', 50), social.denunciasAbiertas(50)]);
  if (!ped.ok && !den.ok) {
    zona.innerHTML = `<p class="grafica-vacia">${esc(ped.motivo || den.motivo
      || 'No he podido leer la cola')}</p>`;
    return;
  }
  const pedidos = ped.ok ? ped.pedidos.slice() : [];
  const denuncias = den.ok ? den.denuncias.slice() : [];
  // Los contadores de las pestañas: una cola sin número no se abre.
  $$('[data-n]', cuerpo).forEach((c) => {
    const n = c.dataset.n === 'gimnasios' ? pedidos.length : denuncias.length;
    c.textContent = n ? String(n) : '';
  });

  const tras = async (promesa) => {
    const r = await promesa;
    if (!r.ok) return aviso(r.motivo, 3400);
    await refrescarModeracion(cuerpo);
  };

  if (MOD.pestana === 'equipo') return pintarEquipo(zona, cuerpo);

  if (MOD.pestana === 'denuncias') {
    if (!denuncias.length) {
      zona.innerHTML = '<p class="grafica-vacia">Ninguna denuncia abierta. '
        + 'Cuando alguien denuncie una cuenta, un gimnasio o una rutina, aparecerá aquí.</p>';
      return;
    }
    // Por VECES primero: si a alguien lo han denunciado siete personas, eso es
    // lo que hay que mirar antes que lo que llegó primero.
    denuncias.sort((a, b) => (MOD.orden === 'antiguas'
      ? Date.parse(a.creado) - Date.parse(b.creado)
      : (Number(b.veces) || 0) - (Number(a.veces) || 0)));
    zona.innerHTML = ordenHTML('Más denunciadas', 'Más antiguas')
      + denuncias.map((d) => `
      <article class="mod-caso">
        <header class="mod-caso-cab">
          <span class="mod-etiq">${esc(d.tipo)}</span>
          <span class="mod-cuando">${esc(haceCuanto(d.creado))}</span>
        </header>
        <h4 class="mod-caso-t">${esc(d.etiqueta || d.objetivo)}</h4>
        <p class="mod-caso-m"><b>${esc(motivoEnCristiano(d.motivo))}</b>
          · ${Number(d.veces) || 1} ${Number(d.veces) === 1 ? 'denuncia' : 'denuncias'}</p>
        ${d.texto ? `<blockquote class="mod-caso-cita">${esc(d.texto)}</blockquote>` : ''}
        ${d.tipo === 'perfil' && d.etiqueta
          ? `<button class="boton boton-2 mod-ver" data-perfil="${esc(d.etiqueta)}">
               ${icono('persona', 16)} Ver el perfil</button>` : ''}
        <div class="mod-acciones">
          <button class="boton boton-2" data-nada="${esc(d.id)}">Sin motivo</button>
          <button class="boton boton-2" data-aviso="${esc(d.id)}">Avisar</button>
          ${d.tipo === 'perfil'
            ? `<button class="boton boton-peligro" data-baja="${esc(d.id)}">Desactivar cuenta</button>`
            : d.tipo === 'gimnasio'
              ? `<button class="boton boton-peligro" data-borrar="${esc(d.id)}">Borrar gimnasio</button>`
              : ''}
        </div>
      </article>`).join('');
    cablearOrden(zona, cuerpo);
    $$('[data-perfil]', zona).forEach((b) => (b.onclick = () => abrirPerfilAjeno(b.dataset.perfil)));
    $$('[data-nada]', zona).forEach((b) => (b.onclick = () =>
      tras(social.resolverDenuncia(b.dataset.nada, 'nada'))));
    $$('[data-aviso]', zona).forEach((b) => (b.onclick = () =>
      tras(social.resolverDenuncia(b.dataset.aviso, 'aviso'))));
    $$('[data-baja]', zona).forEach((b) => (b.onclick = async () => {
      if (!await preguntar('¿Desactivar esa cuenta? Deja de verse, pero no se borra nada suyo.')) return;
      tras(social.resolverDenuncia(b.dataset.baja, 'desactivar'));
    }));
    $$('[data-borrar]', zona).forEach((b) => (b.onclick = async () => {
      if (!await preguntar('¿Borrar ese gimnasio público?')) return;
      tras(social.resolverDenuncia(b.dataset.borrar, 'borrar'));
    }));
    return;
  }

  /* --------------------------------------------------------- gimnasios */
  if (!pedidos.length) {
    zona.innerHTML = '<p class="grafica-vacia">No hay ningún gimnasio pendiente. '
      + 'Cuando alguien pida uno que no existe, aparecerá aquí para que lo revises.</p>';
    return;
  }
  pedidos.sort((a, b) => (MOD.orden === 'antiguas'
    ? Date.parse(a.creado) - Date.parse(b.creado)
    : (Number(b.n_apoyos) || 0) - (Number(a.n_apoyos) || 0)));
  zona.innerHTML = ordenHTML('Más pedidos', 'Más antiguos')
    + pedidos.map((x) => {
      const apoyos = Number(x.n_apoyos) || 0;
      const faltan = Number(x.faltan) || 0;
      const hayCoords = Number.isFinite(Number(x.lat)) && x.lat !== null;
      return `
      <article class="mod-caso">
        <header class="mod-caso-cab">
          <span class="mod-etiq">${apoyos} ${apoyos === 1 ? 'petición' : 'peticiones'}</span>
          <span class="mod-cuando">${esc(haceCuanto(x.creado))}</span>
        </header>
        <h4 class="mod-caso-t">${esc(x.nombre)}</h4>
        <p class="mod-caso-m">${esc([x.ciudad, x.direccion].filter(Boolean).join(' · ')
          || 'sin dirección')}</p>
        <!-- La barra dice de un vistazo si esto ya lo pide medio barrio o lo
             pide una sola persona, que es lo que cambia la decisión. -->
        <div class="mod-barra" role="img"
             aria-label="${apoyos} de ${apoyos + faltan} peticiones">
          <span style="width:${Math.min(100, (apoyos / Math.max(1, apoyos + faltan)) * 100).toFixed(0)}%"></span>
        </div>
        <p class="mod-caso-p">${faltan > 0
          ? `Faltan ${faltan} para llegar al listón`
          : 'Ya pasa del listón: esto lo pide bastante gente'}</p>
        ${hayCoords
          ? `<button class="boton boton-2 mod-ver" data-mapa="${x.lat},${x.lon}">
               ${icono('pin', 16)} Ver dónde dicen que está</button>`
          : '<p class="mod-caso-p">Sin coordenadas: solo con el nombre y la dirección.</p>'}
        <div class="mod-acciones">
          <button class="boton" data-crear="${esc(x.id)}">Crearlo</button>
          <button class="boton boton-peligro" data-negar="${esc(x.id)}">Rechazar</button>
        </div>
      </article>`;
    }).join('');
  cablearOrden(zona, cuerpo);
  $$('[data-mapa]', zona).forEach((b) => (b.onclick = () => {
    const [la, lo] = b.dataset.mapa.split(',').map(Number);
    abrirMapaSuelto(la, lo);
  }));
  $$('[data-crear]', zona).forEach((b) => (b.onclick = () =>
    tras(social.resolverPedidoGimnasio(b.dataset.crear, true))));
  $$('[data-negar]', zona).forEach((b) => (b.onclick = async () => {
    if (!await preguntar('¿Rechazar esta solicitud?')) return;
    tras(social.resolverPedidoGimnasio(b.dataset.negar, false));
  }));
}

/**
 * Los motivos, en cristiano: en la cola no puede salir un identificador.
 *
 * Es una FUNCIÓN y no una constante a propósito: `MOTIVOS_DENUNCIA` se declara
 * más abajo en el fichero, y una constante de módulo que la lea al cargar
 * revienta con un ReferenceError antes de que la app llegue a pintar nada.
 */
function motivoEnCristiano(id) {
  const fila = MOTIVOS_DENUNCIA.find(([v]) => v === id);
  return fila ? fila[1] : id;
}

/** El selector de orden. Dos, no siete: cada uno prioriza a su manera. */
function ordenHTML(porDefecto, porFecha) {
  return `<div class="mod-orden">
    <button class="mod-orden-b${MOD.orden === 'apoyos' ? ' mod-orden-on' : ''}"
            data-orden="apoyos">${esc(porDefecto)}</button>
    <button class="mod-orden-b${MOD.orden === 'antiguas' ? ' mod-orden-on' : ''}"
            data-orden="antiguas">${esc(porFecha)}</button>
  </div>`;
}

function cablearOrden(zona, cuerpo) {
  $$('[data-orden]', zona).forEach((b) => (b.onclick = () => {
    MOD.orden = b.dataset.orden;
    refrescarModeracion(cuerpo);
  }));
}

/** Un mapa a pantalla, sin nada más: para mirar dónde cae una solicitud. */
function abrirMapaSuelto(lat, lon) {
  hoja('Dónde dicen que está',
    '<div id="ms-mapa"></div>',
    (c) => geo.pintarMapa($('#ms-mapa', c), lat, lon, { z: 16 }));
}

/** La pestaña de equipo: quién modera, y cómo se nombra a otro. */
async function pintarEquipo(zona, cuerpo) {
  zona.innerHTML = `
    <p class="campo-nota" style="margin-top:0">Quién modera es <b>público</b>: si alguien
      puede desactivar tu cuenta, lo mínimo es que se sepa quién es.</p>
    <div class="campo"><label for="mod-alias">Nombrar a otro moderador</label>
      <input type="text" id="mod-alias" placeholder="su alias" autocomplete="off"
             enterkeyhint="done"></div>
    <button class="boton" id="mod-nombrar">Nombrarlo</button>
    <p class="campo-nota">No se puede quitar al último: una cola sin nadie que la
      atienda es peor que no tener cola.</p>`;
  $('#mod-nombrar', zona).onclick = async () => {
    const alias = $('#mod-alias', zona).value.trim().toLowerCase();
    if (!alias) return aviso('Escribe el alias');
    const r = await social.nombrarModerador(alias, true);
    if (!r.ok) return aviso(r.motivo, 3400);
    aviso(`@${alias} ya modera`, 3000);
    $('#mod-alias', zona).value = '';
  };
}

/* ==========================================================================
 * DENUNCIAR  (v0.21.0)
 *
 * Carlos, 2-sep-2026: *«creo que también se deberían poder denunciar las
 * cuentas que tengan un mal comportamiento»*.
 *
 * Lo que se ve aquí es un formulario; lo que decide es la base. Una denuncia la
 * leen SU AUTOR y los moderadores, y nadie más: enseñar quién ha denunciado a
 * quién convertiría la herramienta de protegerse en otra forma de acosar. Esa
 * regla vive en la política RLS de `denuncias`, no en esta pantalla.
 * ========================================================================== */
const MOTIVOS_DENUNCIA = [
  ['insultos', 'Insultos o acoso'],
  ['spam', 'Spam o publicidad'],
  ['suplantacion', 'Se hace pasar por otra persona'],
  ['datos_falsos', 'Datos falsos (marcas o gimnasio inventados)'],
  ['contenido_sexual', 'Contenido sexual'],
  ['otro', 'Otra cosa'],
];

function abrirDenuncia(tipo, objetivo, etiqueta) {
  if (!nube.usuario()) return abrirCuenta();
  hoja(
    'Denunciar',
    `<p class="campo-nota" style="margin-top:0">Vas a denunciar <b>${esc(etiqueta)}</b>.
       Lo leen los moderadores; la persona denunciada no ve quién ha sido.</p>
     <div class="campo"><label for="dn-motivo">Motivo</label>
       <select id="dn-motivo">${MOTIVOS_DENUNCIA.map(([v, t]) =>
         `<option value="${v}">${esc(t)}</option>`).join('')}</select></div>
     <div class="campo"><label for="dn-texto">Cuenta qué ha pasado (opcional)</label>
       <textarea id="dn-texto" rows="4" maxlength="1000"
                 placeholder="Lo que viste, y dónde"></textarea></div>
     <button class="boton" id="dn-enviar">Enviar la denuncia</button>`,
    (cuerpo, cerrar) => {
      $('#dn-enviar', cuerpo).onclick = async () => {
        const b = $('#dn-enviar', cuerpo);
        b.disabled = true;
        const r = await social.denunciar(tipo, objetivo,
          $('#dn-motivo', cuerpo).value, $('#dn-texto', cuerpo).value.trim());
        b.disabled = false;
        if (!r.ok) return aviso(r.motivo, 3400);
        cerrar();
        aviso('Denuncia enviada. Gracias', 3000);
      };
    },
  );
}

/* ==========================================================================
 * LA GENTE  (v0.16.0)
 *
 * Carlos, 31-ago-2026: *«que hay una opción de buscar usuarios, añadir amigos
 * etc… (…) se debería poder poner el perfil en público o privado y administrar
 * seguidores y solicitud»*.
 *
 * QUIÉN DECIDE QUÉ. Aquí no se decide nada: si seguir a alguien entra directo o
 * se queda esperando lo dice la BASE mirando si ese perfil es público (ver
 * `seguir()` en `schema-2-social.sql`). Si lo decidiera esta pantalla,
 * cualquiera podría pedir «aceptado» y colarse en un perfil privado — y el
 * móvil se puede abrir y volver a empaquetar, así que sería cuestión de tiempo.
 * ========================================================================== */

/**
 * Mis números sociales y mis medallas exclusivas, traídos aparte.
 *
 * VAN DESPUÉS DE PINTAR, y no dentro del HTML, por dos motivos: son una
 * petición a la red (el perfil no puede esperar a que conteste para verse) y
 * pueden fallar sin que eso rompa nada. Mientras llegan se enseña un punto, no
 * un cero: un cero afirma «no tienes seguidores» y eso todavía no se sabe.
 */
async function cargarMisNumerosSociales(raiz) {
  const nSeg = $('#pf-n-seg', raiz);
  const nSig = $('#pf-n-sig', raiz);
  const nRut = $('#pf-n-rut', raiz);
  if (!nSeg) return;

  const u = nube.usuario();
  if (!u) {
    [nSeg, nSig, nRut].forEach((x) => (x.textContent = '—'));
    return;
  }
  const r = await nube.rest(
    `/rest/v1/perfiles?id=eq.${u.id}&select=n_seguidores,n_siguiendo,n_rutinas,exclusivas`,
    { conSesion: true });
  const fila = r.ok && Array.isArray(r.datos) ? r.datos[0] : null;
  if (!fila) { [nSeg, nSig, nRut].forEach((x) => (x.textContent = '—')); return; }
  nSeg.textContent = String(fila.n_seguidores || 0);
  nSig.textContent = String(fila.n_siguiendo || 0);
  nRut.textContent = String(fila.n_rutinas || 0);

  // Y de paso se repasa si toca alguna exclusiva nueva. Lo decide la base:
  // una medalla que dice «fuiste de los cien primeros» tiene que concederla
  // quien lleva la cuenta, no el móvil que la luce.
  const ex = await social.repasarExclusivas();
  const zona = $('#pf-exclusivas', raiz);
  if (!zona || !ex.ok || !ex.exclusivas.length) return;
  const piezas = ex.exclusivas.map((id) => INS.EXCLUSIVA_POR_ID.get(id)).filter(Boolean);
  if (!piezas.length) return;
  zona.innerHTML = `<h4 class="pf-familia">Exclusivas</h4>
    <div class="pf-vitrina">${piezas.map((x) => `
      <figure class="pf-pieza">${INS.dibujarExclusiva(x, true, 58)}
      <figcaption>${esc(x.nombre)}</figcaption></figure>`).join('')}</div>`;
}

/** Las rutinas que he publicado, para poder quitarlas. */
async function abrirMisRutinasPublicadas() {
  if (!nube.usuario()) return abrirCuenta();
  const r = await social.misRutinasPublicadas();
  if (!r.ok) return aviso(r.motivo, 3200);
  hoja(
    'Tus rutinas publicadas',
    r.rutinas.length
      ? `${r.rutinas.map((x) => `
          <article class="rc-tarjeta">
            <header class="rc-cabeza">
              <div><h4 class="rc-nombre">${esc(x.nombre)}</h4>
                <p class="rc-autor">${x.n_likes} me gusta · ${x.n_comentarios} comentarios ·
                  ${x.n_copias} ${x.n_copias === 1 ? 'copia' : 'copias'}</p></div>
            </header>
            <footer class="rc-pie">
              <button class="boton-plano mr-com" data-id="${x.id}">Ver comentarios</button>
              <button class="boton-plano mr-quitar" data-id="${x.id}">Quitar de internet</button>
            </footer>
          </article>`).join('')}`
      : `<p class="grafica-vacia">No has publicado ninguna. Desde <b>Plan</b>, en cada día de
         entreno, tienes «Publicarla».</p>`,
    (cuerpo, cerrar) => {
      $$('.mr-com', cuerpo).forEach((b) => (b.onclick = () => abrirComentarios(b.dataset.id)));
      $$('.mr-quitar', cuerpo).forEach((b) => (b.onclick = async () => {
        if (!await preguntar('¿Quitarla de internet?\n\nSe van también sus me gusta y sus comentarios. '
          + 'La rutina sigue en tu móvil.')) return;
        await social.borrarRutinaPublicada(b.dataset.id);
        cerrar();
        aviso('Quitada');
        pintar();
      }));
    }
  );
}

/** Las medallas exclusivas de un perfil, si tiene. */
function pintarExclusivasEn(cuerpo, exclusivas) {
  const ids = Array.isArray(exclusivas) ? exclusivas : [];
  if (!ids.length) return;
  const piezas = ids.map((id) => INS.EXCLUSIVA_POR_ID.get(id)).filter(Boolean);
  if (!piezas.length) return;
  const zona = document.createElement('div');
  zona.innerHTML = `<h4 class="pf-familia">Exclusivas</h4>
    <div class="pf-vitrina">${piezas.map((x) => `
      <figure class="pf-pieza">${INS.dibujarExclusiva(x, true, 58)}
      <figcaption>${esc(x.nombre)}</figcaption></figure>`).join('')}</div>`;
  const antes = $('.pf-familia', cuerpo);
  if (antes) antes.parentNode.insertBefore(zona, antes);
  else cuerpo.appendChild(zona);
}

/**
 * El botón de seguir, con los cuatro estados que de verdad existen.
 *
 * Sin sesión no se enseña «Seguir» y ya: se enseña por qué no se puede y cómo
 * arreglarlo. Un botón que no hace nada al pulsarlo se lee como una app rota.
 */
async function pintarBotonSeguir(zona, alias) {
  if (!zona) return;
  if (!nube.usuario()) {
    zona.innerHTML = '<button class="boton boton-2" id="pa-cuenta">Entra para seguirle</button>';
    $('#pa-cuenta', zona).onclick = () => abrirCuenta();
    return;
  }
  const mio = (perfilActual().alias || '').toLowerCase() === String(alias).toLowerCase();
  if (mio) { zona.innerHTML = '<p class="campo-nota">Este eres tú.</p>'; return; }

  const r = await social.buscarGente(alias, 5);
  const suyo = (r.gente || []).find((x) => x.alias === String(alias).toLowerCase());
  const sigo = await social.aQuienSigo();
  // `buscar_gente` no devuelve el id (a propósito: es la tarjeta mínima), así
  // que el estado se deduce de lo que ya se sabe y, si no, se pinta «Seguir».
  const yaEstado = (suyo && sigo.ok && sigo.siguiendo.length)
    ? (sigo.siguiendo.find((x) => x.alias === suyo.alias) || {}).estado : null;

  const pinta = (estado) => {
    zona.innerHTML = estado === 'aceptado'
      ? '<button class="boton boton-2" id="pa-seguir" aria-pressed="true">Siguiendo</button>'
      : estado === 'pendiente'
        ? '<button class="boton boton-2" id="pa-seguir" disabled>Solicitud enviada</button>'
        : '<button class="boton" id="pa-seguir">Seguir</button>';
    const b = $('#pa-seguir', zona);
    if (!b || b.disabled) return;
    b.onclick = async () => {
      b.disabled = true;
      const r2 = await social.seguir(alias);
      b.disabled = false;
      if (!r2.ok) return aviso(r2.motivo, 3200);
      pinta(r2.estado);
      aviso(r2.estado === 'aceptado' ? 'Ya le sigues' : 'Solicitud enviada. Tiene que aceptarla');
    };
  };
  pinta(yaEstado);
}

/* --------------------------------------------------------------------------
 * LOS SEGUIDORES, COMO EN CUALQUIER RED SOCIAL  (1-sep-2026)
 *
 * Carlos: *«tendría que haber un sitio al que yo pudiese acceder a mis
 * seguidores, clicando el número de seguidores; que pudieses buscar por nombre,
 * no solo una lista, y que cuando cliques a una persona te salga su perfil.
 * Es como una red social, ¿no?»*.
 *
 * Lo que faltaba de verdad eran dos cosas: BUSCAR dentro de la lista (con
 * doscientos seguidores, una lista sin caja de búsqueda es un rollo) y la CARA
 * de cada uno — un nombre suelto no se reconoce de un vistazo, una foto sí.
 * Se filtra en el móvil y no pidiéndoselo a la nube: la lista ya está aquí,
 * así que el filtro es instantáneo y funciona aunque se caiga la cobertura.
 * ------------------------------------------------------------------------ */
async function abrirListaDeGente(alias, cuales) {
  // Sin cuenta no hay seguidores que enseñar, y una hoja vacía no lo explica.
  if (!alias) return abrirCuenta();
  const r = await social.seguidoresDe(alias, cuales);
  const titulo = cuales === 'siguiendo' ? `A quién sigue @${alias}` : `Seguidores de @${alias}`;
  if (!r.ok) return aviso(r.motivo, 3200);
  const gente = r.gente || [];

  hoja(
    titulo,
    `${gente.length > 6 ? `
      <div class="campo">
        <label for="lg-buscar">Buscar en la lista</label>
        <input type="search" id="lg-buscar" enterkeyhint="search" autocomplete="off"
               autocapitalize="none" spellcheck="false" placeholder="Nombre o usuario">
      </div>` : ''}
     <div id="lg-lista" aria-live="polite"></div>`,
    (cuerpo, cerrar) => {
      const zona = $('#lg-lista', cuerpo);
      const caja = $('#lg-buscar', cuerpo);

      const pintar = (filtro = '') => {
        const t = filtro.trim().toLowerCase();
        const vistos = t
          ? gente.filter((x) => `${x.alias} ${x.alias_visible || ''} ${x.nombre || ''}`
              .toLowerCase().includes(t))
          : gente;
        if (!vistos.length) {
          zona.innerHTML = `<p class="grafica-vacia">${t
            ? `Nadie de esta lista se llama «${esc(filtro.trim())}».`
            : (cuales === 'siguiendo'
                ? 'Todavía no sigues a nadie. Búscala en «Buscar gente».'
                : 'Todavía no te sigue nadie. Comparte tu perfil y empieza.')}</p>`;
          return;
        }
        zona.innerHTML = `<div class="lista-elegible">${vistos.map((x) => `
          <button class="pf-elegible fila-persona-b" data-alias="${esc(x.alias)}">
            ${x.foto_url
              ? `<img class="pf-foto fila-cara" src="${esc(x.foto_url)}" alt="">`
              : `<span class="pf-foto pf-iniciales fila-cara" aria-hidden="true">${
                  esc(inicialesDe(x.nombre || x.alias_visible || x.alias))}</span>`}
            <span class="fila-persona-txt">
              <span class="fila-elegible-t">${esc(x.nombre || x.alias_visible || x.alias)}</span>
              <span class="fila-elegible-s">@${esc(x.alias_visible || x.alias)}</span>
            </span>
          </button>`).join('')}</div>`;
        // Tocar a alguien abre SU perfil. Es lo que uno espera de una lista de
        // gente, y era lo que no se podía hacer.
        $$('.fila-persona-b', zona).forEach((b) => (b.onclick = () => {
          cerrar();
          abrirPerfilAjeno(b.dataset.alias);
        }));
      };

      pintar();
      if (caja) caja.oninput = () => pintar(caja.value);
    }
  );
}

/** Las iniciales de un nombre. Mismo criterio que el avatar del perfil. */
function inicialesDe(texto) {
  return String(texto || '?').split(/\s+/).filter(Boolean).slice(0, 2)
    .map((t) => t[0].toUpperCase()).join('') || '?';
}

/**
 * Buscar gente y responder solicitudes, en la misma hoja.
 *
 * Las solicitudes van ARRIBA y solo si hay: una bandeja vacía permanente enseña
 * un hueco a diario para nada, y lo que hay que ver cuando hay algo es eso.
 */
function abrirGente() {
  if (!nube.usuario()) return abrirCuenta();
  hoja(
    'Gente',
    `<div id="gt-solicitudes"></div>
     <div class="campo">
       <label for="gt-buscar">Buscar por nombre o usuario</label>
       <input type="search" id="gt-buscar" enterkeyhint="search" autocomplete="off"
              autocapitalize="none" spellcheck="false" placeholder="Dos letras bastan">
     </div>
     <div id="gt-resultados" aria-live="polite">
       <p class="grafica-vacia">Escribe un nombre para empezar.</p>
     </div>`,
    (cuerpo) => {
      const zonaSol = $('#gt-solicitudes', cuerpo);
      const zona = $('#gt-resultados', cuerpo);
      const caja = $('#gt-buscar', cuerpo);
      let reloj = null;

      const pintarSolicitudes = async () => {
        const r = await social.misSolicitudes();
        if (!r.ok || !r.solicitudes.length) { zonaSol.innerHTML = ''; return; }
        zonaSol.innerHTML = `<h4 class="pf-familia">Quieren seguirte (${r.solicitudes.length})</h4>
          <div class="lista-elegible">${r.solicitudes.map((x) => `
            <div class="fila-persona">
              <span class="fila-elegible-t">${esc(x.alias_visible || x.alias)}</span>
              <span class="fila-elegible-s">${esc(x.nombre || '')}</span>
              <span class="fila-persona-2">
                <button class="boton-plano gt-si" data-id="${esc(x.seguidor)}">Aceptar</button>
                <button class="boton-plano gt-no" data-id="${esc(x.seguidor)}">No</button>
              </span>
            </div>`).join('')}</div>`;
        $$('.gt-si, .gt-no', zonaSol).forEach((b) => (b.onclick = async () => {
          b.disabled = true;
          await social.responderSolicitud(b.dataset.id, b.classList.contains('gt-si'));
          await pintarSolicitudes();
        }));
      };
      pintarSolicitudes();

      caja.oninput = () => {
        clearTimeout(reloj);
        const t = caja.value.trim();
        if (t.length < 2) {
          zona.innerHTML = '<p class="grafica-vacia">Escribe un nombre para empezar.</p>';
          return;
        }
        zona.innerHTML = '<p class="grafica-vacia">Buscando…</p>';
        reloj = setTimeout(async () => {
          const r = await social.buscarGente(t, 20);
          if (!r.ok) { zona.innerHTML = `<p class="grafica-vacia">${esc(r.motivo)}</p>`; return; }
          if (!r.gente.length) {
            zona.innerHTML = `<p class="grafica-vacia">Nadie con «${esc(t)}».
              Puede que todavía no tenga cuenta.</p>`;
            return;
          }
          zona.innerHTML = `<div class="lista-elegible">${r.gente.map((x) => `
            <div class="fila-persona">
              <span class="fila-elegible-t">${esc(x.alias_visible || x.alias)}</span>
              <span class="fila-elegible-s">${esc(x.nombre || '')}${x.publico ? '' : ' · privado'}
                ${x.n_seguidores ? ` · ${x.n_seguidores} seg.` : ''}</span>
              <span class="fila-persona-2">
                <button class="boton-plano gt-ver" data-alias="${esc(x.alias)}">Ver</button>
                <button class="boton-plano gt-seguir" data-alias="${esc(x.alias)}">Seguir</button>
              </span>
            </div>`).join('')}</div>`;
          $$('.gt-ver', zona).forEach((b) => (b.onclick = () => abrirPerfilAjeno(b.dataset.alias)));
          $$('.gt-seguir', zona).forEach((b) => (b.onclick = async () => {
            b.disabled = true;
            const r2 = await social.seguir(b.dataset.alias);
            if (!r2.ok) { b.disabled = false; return aviso(r2.motivo, 3200); }
            b.textContent = r2.estado === 'aceptado' ? 'Siguiendo' : 'Solicitado';
          }));
        }, 300);
      };
    }
  );
}

/* ==========================================================================
 * EL GIMNASIO COMPARTIDO: LA GENTE Y LAS CLASIFICACIONES  (v0.16.0)
 *
 * Carlos, 31-ago-2026: *«cuando añadas un gimnasio puedas ver al resto de
 * miembros, sus records en las máquinas del gym, clasificaciones»*.
 *
 * LA REGLA QUE ESTO NO ROMPE, Y CÓMO
 * ----------------------------------
 * La regla número uno del proyecto es que **cada máquina solo se compara
 * consigo misma**: una polea de 40 y un press de 40 no son la misma carga. Una
 * clasificación parece que la rompe, y no la rompe si —y solo si— compara **la
 * misma máquina física**: la polea del VivaGym de Reus contra esa misma polea.
 * Por eso aquí no existe «el más fuerte de la app»: cada clasificación vive
 * dentro de un gimnasio Y de una máquina.
 *
 * LA OTRA REGLA: LOS DATOS NO SALEN DEL MÓVIL
 * -------------------------------------------
 * Sigue en pie. Lo que sube es UN NÚMERO por máquina —el mejor peso— y solo de
 * los gimnasios donde te has apuntado a la clasificación a propósito. No sube
 * cuándo entrenas, ni cuántas veces, ni lo que has bajado, ni los días que
 * fallaste. Y salirse borra lo subido.
 * ========================================================================== */

/** El mejor peso de cada máquina de un gimnasio, en kg. Lo que se publicaría. */
function mejoresDeGimnasio(gimnasioId) {
  const maquinas = S.cache.maquinas.filter((m) => m.gimnasioId === gimnasioId);
  const porId = new Map(maquinas.map((m) => [m.id, m]));
  const flojas = new Set(S.cache.sesiones.filter((x) => x.excluir).map((x) => x.id));
  const mejor = new Map();
  for (const s of S.cache.series) {
    if (flojas.has(s.sesionId)) continue;
    const m = porId.get(s.maquinaId);
    if (!m) continue;
    const kg = D.aKg(s.peso, m.unidad || 'kg');
    const antes = mejor.get(m.id);
    if (!antes || kg > antes.kg) mejor.set(m.id, { nombre: m.nombre, kg, reps: s.reps, fecha: s.fecha });
  }
  return [...mejor.values()];
}

/* --------------------------------------------------------------------------
 * BUSCAR UN GIMNASIO DE LA APP, Y VER SU FICHA ANTES DE APUNTARSE
 *
 * Carlos, 1-sep-2026: *«estaría bien que al buscar el gym inicial puedas ver la
 * gente asociada a ese gym y las máquinas que hay y rutinas etc...»*.
 *
 * Antes esto no existía en la app: buscar un gimnasio público solo se podía
 * durante la bienvenida, así que quien ya la había pasado no volvía a
 * encontrar el suyo jamás. Y para ver a la gente había que apuntarse primero,
 * que es el orden equivocado: lo que uno mira antes de entrar es si hay alguien.
 * ------------------------------------------------------------------------ */
function buscarGimnasiosPublicos() {
  hoja(
    'Buscar gimnasios',
    `<p class="campo-nota" style="margin-top:0">Los que ya ha dado de alta alguien.
       Ábrelo para ver quién entrena allí, qué máquinas tiene y qué rutinas hace su gente
       — todo eso <b>sin apuntarte</b>.</p>
     <div class="campo">
       <label for="bg-texto">Nombre o ciudad</label>
       <input type="search" id="bg-texto" enterkeyhint="search" autocomplete="off"
              placeholder="VivaGym, Reus…">
     </div>
     <div id="bg-lista" aria-live="polite"></div>
     <div class="botonera"><button class="boton boton-2" id="bg-crear">${icono('mas', 17)}
       Crear un gimnasio nuevo</button></div>`,
    (cuerpo, cerrar) => {
      const caja = $('#bg-texto', cuerpo);
      const zona = $('#bg-lista', cuerpo);
      let reloj = null;

      // CREAR DESDE AQUÍ.  Carlos, 1-sep-2026: *«en el buscador de añadir
      // gimnasios ni siquiera hace nada, ni se despliega el mapa; ves que no te
      // deja hacer nada ni añadir ni nada»*. Y era exactamente así: esta hoja
      // solo miraba los gimnasios que YA ha dado de alta alguien, y cuando no
      // había ninguno te mandaba por escrito a «Nuevo gimnasio» — un botón que
      // está en otra pantalla, detrás de cerrar esta hoja. Un callejón sin
      // salida con la respuesta impresa dentro.
      const crear = () => {
        const nombre = caja.value.trim();
        cerrar();
        editarGimnasio(null, { nombre });
      };
      $('#bg-crear', cuerpo).onclick = crear;

      caja.oninput = () => {
        clearTimeout(reloj);
        reloj = setTimeout(async () => {
          const texto = caja.value.trim();
          if (texto.length < 2) { zona.innerHTML = ''; return; }
          zona.innerHTML = '<p class="grafica-vacia">Buscando…</p>';
          // LOS QUE HAY Y LOS QUE SE ESTÁN PIDIENDO, EN LA MISMA LISTA.
          //
          // Si los pedidos no salen aquí, quien busca «Viva gym» no ve que ya
          // hay tres personas pidiéndolo y abre la solicitud número dieciséis:
          // exactamente el problema del que venimos. Apoyar el que ya existe
          // tiene que costar menos que crear otro.
          const [r, pd] = await Promise.all([
            social.buscarGimnasios(texto, 20),
            social.pedidosGimnasio(texto, 10),
          ]);
          if (!r.ok) { zona.innerHTML = `<p class="grafica-vacia">${esc(r.motivo)}</p>`; return; }
          const pedidos = pd.ok ? pd.pedidos : [];

          const pintarPedidos = () => (pedidos.length ? `
            <h4 class="pf-familia">Pedidos, esperando a un moderador</h4>
            <div class="lista-elegible">${pedidos.map((x) => `
              <div class="mod-fila">
                <div class="fila-persona-txt">
                  <div class="pf-fila-nombre">${esc(x.nombre)}</div>
                  <div class="pf-fila-detalle">${esc([x.ciudad, x.direccion]
                    .filter(Boolean).join(' · ') || 'sin dirección')}</div>
                  <div class="pf-fila-detalle"><b>${Number(x.n_apoyos) || 0}</b> ${
                    Number(x.n_apoyos) === 1 ? 'persona lo pide' : 'personas lo piden'}${
                    Number(x.faltan) > 0 ? ` · faltan ${Number(x.faltan)}` : ' · en cabeza'}</div>
                </div>
                <button class="boton boton-2" data-apoyar="${esc(x.id)}"${
                  x.apoyado ? ' disabled' : ''}>${
                  x.apoyado ? 'Ya lo has pedido' : 'Yo también entreno aquí'}</button>
              </div>`).join('')}</div>` : '');

          const cablearApoyos = () => $$('[data-apoyar]', zona).forEach((b) => (b.onclick = async () => {
            if (!nube.usuario()) return abrirCuenta();
            b.disabled = true;
            const res = await social.apoyarGimnasio(b.dataset.apoyar);
            if (!res.ok) { b.disabled = false; return aviso(res.motivo, 3400); }
            b.textContent = 'Ya lo has pedido';
            aviso(Number(res.faltan) > 0
              ? `Apuntado. Faltan ${Number(res.faltan)} para que suba a lo alto de la cola`
              : 'Apuntado. Ya está en cabeza', 3200);
          }));

          if (!r.gimnasios.length) {
            zona.innerHTML = `<p class="grafica-vacia">Nadie ha dado de alta ninguno con ese
              nombre.</p>${pintarPedidos()}
              <div class="botonera"><button class="boton" id="bg-crear-este">Pedir
                «${esc(texto)}»</button></div>`;
            $('#bg-crear-este', zona).onclick = crear;
            cablearApoyos();
            return;
          }
          zona.innerHTML = `<div class="lista-elegible">${r.gimnasios.map((g) => `
            <button type="button" class="pf-elegible fila-elegible" data-id="${g.id}">
              <span class="fila-elegible-t">${esc(g.nombre)}</span>
              <span class="fila-elegible-s">${esc(g.ciudad || g.direccion || '')}${
                g.n_miembros ? ` · ${g.n_miembros} ${g.n_miembros === 1 ? 'persona' : 'personas'}` : ''}</span>
            </button>`).join('')}</div>${pintarPedidos()}`;
          $$('.fila-elegible', zona).forEach((b, i) =>
            (b.onclick = () => abrirFichaGimnasioPublico(r.gimnasios[i])));
          cablearApoyos();
        }, 300);
      };
      caja.focus();
    }
  );
}

/**
 * La ficha de un gimnasio público: su gente, sus máquinas y sus rutinas.
 *
 * Se puede mirar SIN CUENTA y sin ser miembro — un gimnasio público es público.
 * Lo que no sale es nada que su dueño no haya publicado: el mejor peso por
 * máquina y solo de quien ha dicho que quiere salir en la clasificación.
 */
async function abrirFichaGimnasioPublico(g) {
  const idPub = g.id;
  hoja(
    g.nombre,
    '<div id="fg-cuerpo"><p class="grafica-vacia">Cargando…</p></div>',
    async (cuerpo, cerrar) => {
      const zona = $('#fg-cuerpo', cuerpo);
      const [f, ms, mq, rt] = await Promise.all([
        social.fichaGimnasio(idPub),
        social.miembrosDe(idPub, 50),
        social.maquinasDeGimnasio(idPub),
        social.rutinasDeGimnasio(idPub),
      ]);
      if (!f.ok) { zona.innerHTML = `<p class="grafica-vacia">${esc(f.motivo)}</p>`; return; }
      const ficha = f.ficha;
      const yaLoTengo = S.cache.gimnasios.some((x) => x.idPublico === idPub);

      zona.innerHTML = `
        <div class="ficha">
          ${ficha.direccion || ficha.ciudad
            ? `<p class="campo-nota" style="margin-top:0">${esc(ficha.direccion || ficha.ciudad)}</p>` : ''}
          <div class="fg-cifras">
            <div class="fg-cifra"><b>${ficha.n_miembros}</b><span>${
              ficha.n_miembros === 1 ? 'persona' : 'personas'}</span></div>
            <div class="fg-cifra"><b>${ficha.n_maquinas}</b><span>${
              ficha.n_maquinas === 1 ? 'máquina' : 'máquinas'}</span></div>
            <div class="fg-cifra"><b>${ficha.n_rutinas}</b><span>${
              ficha.n_rutinas === 1 ? 'rutina' : 'rutinas'}</span></div>
          </div>
          ${yaLoTengo
            ? '<p class="campo-nota">Ya lo tienes en tu lista.</p>'
            : `<button class="boton" id="fg-anadir">Añadirlo a mis gimnasios</button>
               <p class="campo-nota">Añadirlo <b>no publica nada tuyo</b>. Para salir en las
                 clasificaciones hay que decirlo aparte, desde su ficha.${
                   nube.usuario() ? ''
                     : ' Sin cuenta se añade igual, pero no saldrás entre su gente.'}</p>`}
        </div>

        <h4 class="pf-familia">Quién entrena aquí</h4>
        ${(ms.miembros || []).length
          ? `<div class="lista-elegible">${ms.miembros.map((x) => `
              <button class="pf-elegible fila-elegible" data-alias="${esc(x.alias)}">
                <span class="fila-elegible-t">${esc(x.alias_visible || x.alias)}</span>
                <span class="fila-elegible-s">${esc(x.nombre || '')}${
                  x.compite ? ' · en la clasificación' : ''}</span>
              </button>`).join('')}</div>`
          : '<p class="grafica-vacia">Todavía no hay nadie apuntado.</p>'}

        <h4 class="pf-familia">Qué máquinas hay</h4>
        ${(mq.maquinas || []).length
          ? `<div class="lista-elegible">${mq.maquinas.map((x) => `
              <button class="pf-elegible fila-elegible" data-maq="${esc(x.maquina)}"
                      ${x.hay_clasificacion ? '' : 'disabled'}>
                <span class="fila-elegible-t">${esc(x.maquina_n)}</span>
                <span class="fila-elegible-s">${x.cuantos} ${
                  x.cuantos === 1 ? 'persona' : 'personas'} · mejor ${redondear(x.mejor, 1)} kg${
                  x.hay_clasificacion ? ' · ver clasificación' : ''}</span>
              </button>`).join('')}</div>`
          : `<p class="grafica-vacia">Nadie ha publicado todavía sus marcas aquí, así que no se
             sabe qué máquinas hay. Se llena solo en cuanto alguien entre en la clasificación.</p>`}

        <h4 class="pf-familia">Lo que entrena su gente</h4>
        ${(rt.rutinas || []).length
          ? `<div class="lista-elegible">${rt.rutinas.map((x) => `
              <button class="pf-elegible fila-elegible" data-rut="${x.id}">
                <span class="fila-elegible-t">${esc(x.nombre)}</span>
                <span class="fila-elegible-s">${esc(x.alias_visible || x.alias)} · ${x.dias}
                  ${x.dias === 1 ? 'día' : 'días'}${x.n_likes ? ` · ${x.n_likes} me gusta` : ''}</span>
              </button>`).join('')}</div>`
          : `<p class="grafica-vacia">Nadie de aquí ha publicado una rutina todavía.</p>`}`;

      $$('.fila-elegible[data-alias]', zona).forEach((b) => (b.onclick = () =>
        abrirPerfilAjeno(b.dataset.alias)));
      $$('.fila-elegible[data-maq]', zona).forEach((b) => (b.onclick = () =>
        abrirClasificacion(idPub, b.dataset.maq, ficha.nombre)));
      $$('.fila-elegible[data-rut]', zona).forEach((b) => (b.onclick = () => {
        const x = (rt.rutinas || []).find((y) => y.id === b.dataset.rut);
        if (x) llevarseRutinaPublicada(x);
      }));

      const bAnadir = $('#fg-anadir', zona);
      if (bAnadir) bAnadir.onclick = async () => {
        // SIN CUENTA TAMBIÉN SE AÑADE. Antes esto abría el alta de cuenta y se
        // acababa ahí: te habías leído la ficha entera y el botón no hacía lo
        // que dice. Añadir un gimnasio a TU móvil no necesita permiso de nadie
        // —el nombre, la dirección y las coordenadas son públicos—; lo que sí
        // necesita cuenta es salir en su lista de miembros, y eso se dice.
        const conCuenta = !!nube.usuario();
        if (conCuenta) {
          const r = await social.entrarEnGimnasio(idPub, false);
          if (!r.ok) return aviso(r.motivo, 3400);
        }
        await db.guardar('gimnasios', {
          nombre: ficha.nombre,
          direccion: ficha.direccion || ficha.ciudad || '',
          ...(Number.isFinite(ficha.lat) ? { lat: ficha.lat, lon: ficha.lon } : {}),
          idPublico: idPub,
        });
        await recargar();
        cerrar();
        aviso(conCuenta
          ? `«${ficha.nombre}» añadido`
          : `«${ficha.nombre}» añadido. Con una cuenta saldrías entre su gente`, 3600);
        pintar();
      };
    }
  );
}

async function abrirGimnasioSocial(gimnasio) {
  if (!(await nube.hayNube())) {
    return aviso('Esto necesita la nube configurada. Está en Ajustes', 3400);
  }
  const idPub = gimnasio.idPublico || null;

  hoja(
    gimnasio.nombre,
    `<div id="gs-cuerpo"><p class="grafica-vacia">Cargando…</p></div>`,
    async (cuerpo, cerrar) => {
      const zona = $('#gs-cuerpo', cuerpo);

      if (!idPub) {
        // Todavía no está conectado con el gimnasio público. Se ofrece buscarlo
        // o darlo de alta, y se dice qué implica antes de pulsar.
        zona.innerHTML = `
          <p class="campo-nota" style="margin-top:0">Este gimnasio solo existe en tu móvil.
            Si lo conectas, verás a quién más entrena aquí y podrás comparar tus marcas
            <b>máquina a máquina</b>.</p>
          <p class="campo-nota">Conectarlo <b>no publica nada</b>: tus pesos siguen siendo
            tuyos hasta que digas que quieres salir en la clasificación.</p>
          <button class="boton" id="gs-conectar">Conectar «${esc(gimnasio.nombre)}»</button>`;
        /* ------------------------------------------------------------------
         * CONECTAR YA NO ES CREAR.  (2-sep-2026)
         *
         * Carlos: *«no puede ser que hayan 15 viva gyms asociados a una
         * dirección»*. Y era exactamente lo que hacía este botón: llamaba a
         * `gimnasio_alta`, que creaba el gimnasio público a la primera sin
         * mirar si ya había uno igual escrito de otra manera.
         *
         * Ahora la base busca primero un PARECIDO —por nombre normalizado en
         * la misma ciudad, o a menos de 250 m si hay coordenadas— y solo si no
         * existe se abre una SOLICITUD que aprueba un moderador. Son cuatro
         * respuestas distintas y cada una dice una cosa distinta.
         * --------------------------------------------------------------- */
        $('#gs-conectar', zona).onclick = async () => {
          if (!nube.usuario()) return abrirCuenta();
          const r = await social.conectarGimnasio({
            nombre: gimnasio.nombre, direccion: gimnasio.direccion || '',
            ciudad: gimnasio.ciudad || '',
            lat: Number.isFinite(gimnasio.lat) ? gimnasio.lat : null,
            lon: Number.isFinite(gimnasio.lon) ? gimnasio.lon : null,
          });
          if (!r.ok) return aviso(r.motivo, 3400);

          if (r.estado === 'existe' && r.gimnasio) {
            await social.entrarEnGimnasio(r.gimnasio.id, false);
            await db.guardar('gimnasios', { ...gimnasio, idPublico: r.gimnasio.id });
            await recargar();
            // Se dice CON QUÉ se ha conectado: si la base ha decidido que tu
            // «Viva gym reus» es el «VivaGym Reus» que ya existía, hay que
            // enseñarlo, no hacerlo a escondidas.
            aviso(`Conectado con «${r.gimnasio.nombre}»`, 3600);
            pintar();
            return;
          }

          const faltan = Number(r.faltan || 0);
          const cuantos = r.pedido ? Number(r.pedido.n_apoyos || 1) : 1;
          zona.innerHTML = `
            <p class="campo-nota" style="margin-top:0">${
              r.estado === 'ya_apoyado'
                ? 'Ya habías pedido este gimnasio.'
                : r.estado === 'apoyado'
                  ? 'Alguien ya lo había pedido: se ha sumado tu voz.'
                  : 'Este gimnasio todavía no existe en la nube, así que se ha pedido.'}</p>
            <p class="campo-nota"><b>${cuantos}</b> ${cuantos === 1 ? 'persona lo pide' : 'personas lo piden'}${
              faltan > 0 ? ` · faltan ${faltan} para que suba a lo alto de la cola` : ' · ya está en cabeza'}.</p>
            <p class="campo-nota">Lo revisa un moderador. Mientras tanto tu gimnasio
              funciona igual en el móvil: apuntar pesos no depende de esto.</p>`;
        };
        return;
      }

      const [ms, mq, mios, rt] = await Promise.all([
        social.miembrosDe(idPub, 50),
        social.maquinasConClasificacion(idPub),
        social.misGimnasios(),
        // LAS RUTINAS DE LA GENTE DE AQUÍ.  (2-sep-2026)
        // Carlos: «habrá como una especie de comunidad, y saldrá la gente que
        // pertenece a este gimnasio: tiene estas rutinas en este gimnasio y
        // estas máquinas». La ficha de un gimnasio de OTRO ya las enseñaba; la
        // del tuyo —que es la que abres cada día— no, y era la misma llamada.
        social.rutinasDeGimnasio(idPub),
      ]);
      const yo = (mios.gimnasios || []).find((g) => g.id === idPub);
      const compito = !!(yo && yo.compite);
      const mejores = mejoresDeGimnasio(gimnasio.id);

      zona.innerHTML = `
        <div class="ficha">
          <p class="campo-nota" style="margin-top:0">
            ${compito
              ? `Sales en las clasificaciones de este gimnasio con <b>${mejores.length}</b>
                 ${mejores.length === 1 ? 'máquina' : 'máquinas'}.`
              : 'No sales en las clasificaciones. Nadie ve tus pesos.'}</p>
          <div class="botonera">
            <button class="boton ${compito ? 'boton-2' : ''}" id="gs-competir">
              ${compito ? 'Salirme de las clasificaciones' : 'Entrar en las clasificaciones'}</button>
            ${compito ? '<button class="boton boton-2" id="gs-subir">Actualizar mis marcas</button>' : ''}
          </div>
          <p class="campo-nota">Si entras se publica <b>un número por máquina</b>: el peso más alto
            que has levantado en cada una. Ni cuándo entrenas, ni cuántas veces, ni tu historial.
            Al salirte se borra lo subido.</p>
        </div>

        <h4 class="pf-familia">Quién entrena aquí (${(ms.miembros || []).length})</h4>
        ${(ms.miembros || []).length
          ? `<div class="lista-elegible">${ms.miembros.map((x) => `
              <button class="pf-elegible fila-elegible" data-alias="${esc(x.alias)}">
                <span class="fila-elegible-t">${esc(x.alias_visible || x.alias)}</span>
                <span class="fila-elegible-s">${esc(x.nombre || '')}${
                  x.compite ? ' · en la clasificación' : ''}</span>
              </button>`).join('')}</div>`
          : '<p class="grafica-vacia">Todavía no hay nadie más. Manda el enlace del gimnasio a quien vaya contigo.</p>'}

        <h4 class="pf-familia">Clasificaciones</h4>
        ${(mq.maquinas || []).length
          ? `<div class="lista-elegible">${mq.maquinas.map((x) => `
              <button class="pf-elegible fila-elegible" data-maq="${esc(x.maquina)}">
                <span class="fila-elegible-t">${esc(x.maquina_n)}</span>
                <span class="fila-elegible-s">${x.cuantos} personas · mejor ${redondear(x.mejor, 1)} kg</span>
              </button>`).join('')}</div>`
          : `<p class="grafica-vacia">Hace falta que al menos <b>dos personas</b> de este gimnasio
             estén en la clasificación de la misma máquina. Con una sola no hay clasificación:
             sería enseñarte a ti mismo en el primer puesto de una lista de uno.</p>`}

        <h4 class="pf-familia">Lo que entrena su gente (${(rt.rutinas || []).length})</h4>
        ${(rt.rutinas || []).length
          ? `<div class="lista-elegible">${rt.rutinas.map((x) => `
              <button class="pf-elegible fila-elegible" data-rut="${x.id}">
                <span class="fila-elegible-t">${esc(x.nombre)}</span>
                <span class="fila-elegible-s">${esc(x.alias_visible || x.alias)} · ${x.dias}
                  ${x.dias === 1 ? 'día' : 'días'}${x.n_likes ? ` · ${x.n_likes} me gusta` : ''}</span>
              </button>`).join('')}</div>`
          : '<p class="grafica-vacia">Nadie de aquí ha publicado una rutina todavía.</p>'}
        <!-- CÓMO ENTRA UNA RUTINA AQUÍ: publicándola siendo miembro. No hay un
             botón de «añadirla a este gimnasio» porque no hace falta uno: la
             rutina no se cuelga de un sitio, se cuelga de TI, y sale en los
             gimnasios a los que perteneces. Un botón por gimnasio te obligaría
             a publicar la misma rutina tres veces. -->
        <p class="campo-nota">Tus rutinas publicadas salen aquí solas, porque entrenas
          aquí. Se publican desde <b>Plan</b>, en cada día de entreno.</p>
        <button class="boton boton-2" id="gs-publicar">${icono('mas', 16)} Publicar una rutina mía</button>`;

      $$('.fila-elegible[data-alias]', zona).forEach((b) => (b.onclick = () =>
        abrirPerfilAjeno(b.dataset.alias)));
      $$('.fila-elegible[data-maq]', zona).forEach((b) => (b.onclick = () =>
        abrirClasificacion(idPub, b.dataset.maq, gimnasio.nombre)));
      $$('.fila-elegible[data-rut]', zona).forEach((b) => (b.onclick = () => {
        const x = (rt.rutinas || []).find((y) => y.id === b.dataset.rut);
        if (x) llevarseRutinaPublicada(x);
      }));
      $('#gs-publicar', zona).onclick = () => { cerrar(); irA('plan'); };

      $('#gs-competir', zona).onclick = async () => {
        if (compito) {
          if (!await preguntar('¿Salirte de las clasificaciones?\n\nSe borran tus marcas publicadas '
            + 'de este gimnasio. Lo que tienes apuntado en el móvil no se toca.')) return;
          await social.salirDeGimnasio(idPub);
          await social.entrarEnGimnasio(idPub, false);
          aviso('Fuera. Tus marcas ya no se ven');
        } else {
          if (!await preguntar(`¿Publicar tus mejores pesos de ${mejores.length} máquinas?\n\n`
            + 'Solo el peso más alto de cada una. Puedes salirte cuando quieras.')) return;
          const r = await social.entrarEnGimnasio(idPub, true);
          if (!r.ok) return aviso(r.motivo, 3400);
          const r2 = await social.publicarRecords(idPub, mejores);
          aviso(r2.ok ? `Publicadas ${r2.subidos} marcas` : r2.motivo, 3200);
        }
        pintar();
      };

      const bSubir = $('#gs-subir', zona);
      if (bSubir) bSubir.onclick = async () => {
        const r = await social.publicarRecords(idPub, mejores);
        aviso(r.ok ? `Actualizadas ${r.subidos} marcas` : r.motivo, 3200);
      };
    }
  );
}

async function abrirClasificacion(gimnasioPub, maquina, nombreGym) {
  const r = await social.clasificacion(gimnasioPub, maquina, 50);
  if (!r.ok) return aviso(r.motivo, 3200);
  const mio = (perfilActual().alias || '').toLowerCase();
  hoja(
    `${maquina} · ${nombreGym}`,
    `<p class="campo-nota" style="margin-top:0">Peso de placa, no 1RM estimado: una clasificación
       tiene que poder discutirse mirando el hierro. A igualdad de peso, manda quien hizo más
       repeticiones.</p>
     <div class="lista">${r.puestos.map((x) => `
       <div class="pf-fila ${x.alias === mio ? 'clas-yo' : ''}">
         <span class="clas-puesto">${x.puesto}</span>
         <div class="pf-fila-texto">
           <div class="pf-fila-nombre">${esc(x.alias_visible || x.alias)}</div>
           <div class="pf-fila-detalle">${esc(x.nombre || '')}</div>
         </div>
         <span class="plan-objetivo">${redondear(x.kg, 1)} kg × ${x.reps}</span>
       </div>`).join('')}</div>`,
    () => {}
  );
}

/* ==========================================================================
 * LAS RUTINAS DE LA GENTE  (v0.16.0)
 *
 * Carlos: *«que se puedan dar likes a las rutinas, poner comentarios, dar likes
 * y que salga en el perfil (…) las rutinas creadas»*.
 *
 * El paquete que se publica es EXACTAMENTE el mismo que viaja en un enlace de
 * WhatsApp: por nombres, nunca por ids del móvil de nadie. Así una rutina de la
 * lista se importa con el mismo código y las mismas comprobaciones que una que
 * te manda un amigo, y no hay dos caminos que puedan separarse.
 * ========================================================================== */

function abrirRutinasComunidad() {
  let orden = 'populares';
  hoja(
    'Rutinas de la gente',
    `<div class="chips" role="tablist">
       <button class="chip" data-orden="populares" role="tab">Populares</button>
       <button class="chip" data-orden="nuevas" role="tab">Nuevas</button>
       <button class="chip" data-orden="amigos" role="tab">De quien sigo</button>
     </div>
     <div class="campo">
       <input type="search" id="rc-buscar" enterkeyhint="search" autocomplete="off"
              placeholder="Buscar por nombre" aria-label="Buscar rutinas">
     </div>
     <div id="rc-lista" aria-live="polite"><p class="grafica-vacia">Cargando…</p></div>`,
    (cuerpo) => {
      const zona = $('#rc-lista', cuerpo);
      const caja = $('#rc-buscar', cuerpo);
      let reloj = null;

      const cargar = async () => {
        zona.innerHTML = '<p class="grafica-vacia">Cargando…</p>';
        const r = await social.rutinasPopulares({
          orden, texto: caja.value.trim() || null, cuantos: 30,
        });
        if (!r.ok) { zona.innerHTML = `<p class="grafica-vacia">${esc(r.motivo)}</p>`; return; }
        if (!r.rutinas.length) {
          zona.innerHTML = orden === 'amigos'
            ? '<p class="grafica-vacia">La gente a la que sigues no ha publicado ninguna todavía.</p>'
            : '<p class="grafica-vacia">Todavía no hay rutinas publicadas. Publica la tuya desde Plan y serás el primero.</p>';
          return;
        }
        zona.innerHTML = r.rutinas.map((x) => `
          <article class="rc-tarjeta">
            <header class="rc-cabeza">
              <div>
                <h4 class="rc-nombre">${esc(x.nombre)}</h4>
                <p class="rc-autor">${x.oficial
                    ? '<span class="rc-oficial">La trae la app</span>'
                    : esc(x.alias_visible || x.alias)} · ${x.dias}
                  ${x.dias === 1 ? 'día' : 'días'} · ${esc(NIVEL_RUTINA[x.nivel] || x.nivel)}</p>
              </div>
              <button class="rc-like ${x.le_di ? 'dado' : ''}" data-id="${x.id}"
                      aria-pressed="${!!x.le_di}" aria-label="Me gusta">
                ${icono('corazon', 18)}<span>${x.n_likes}</span></button>
            </header>
            ${x.descripcion ? `<p class="rc-desc">${esc(x.descripcion)}</p>` : ''}
            ${x.porQueSin ? `<p class="rc-salta">${esc(x.porQueSin)}</p>` : ''}
            <footer class="rc-pie">
              <button class="boton-plano rc-com" data-id="${x.id}">
                ${x.n_comentarios} ${x.n_comentarios === 1 ? 'comentario' : 'comentarios'}</button>
              ${/* Cuántas PERSONAS se la han llevado. Solo si hay alguna: un
                    «0 copias» es verdad pero se lee como «esto no le sirve a
                    nadie», y lo que pasa es que la app acaba de nacer. Y no se
                    infla: el contador lo lleva la base, una por cuenta. */
                x.n_copias
                  ? `<span class="rc-copias">${x.n_copias} se la
                     ${x.n_copias === 1 ? 'ha' : 'han'} llevado</span>` : ''}
              ${/* Una rutina oficial no es de nadie, así que no hay perfil que
                    abrir: el botón llevaría a una pantalla vacía. */
                x.oficial ? ''
                  : `<button class="boton-plano rc-autor-b" data-alias="${esc(x.alias)}">Ver perfil</button>`}
              <button class="boton-plano rc-llevar" data-id="${x.id}">Llevármela</button>
            </footer>
          </article>`).join('');

        $$('.rc-like', zona).forEach((b) => (b.onclick = async () => {
          if (!nube.usuario()) return abrirCuenta();
          const cuenta = $('span', b);
          b.disabled = true;
          const r2 = await social.marcarRutina(b.dataset.id);
          b.disabled = false;
          if (!r2.ok) return aviso(r2.motivo, 3200);
          b.classList.toggle('dado', r2.marcada);
          b.setAttribute('aria-pressed', String(r2.marcada));
          cuenta.textContent = String(Number(cuenta.textContent) + (r2.marcada ? 1 : -1));
        }));
        $$('.rc-com', zona).forEach((b) => (b.onclick = () => abrirComentarios(b.dataset.id)));
        $$('.rc-autor-b', zona).forEach((b) => (b.onclick = () => abrirPerfilAjeno(b.dataset.alias)));
        $$('.rc-llevar', zona).forEach((b) => (b.onclick = () => {
          const x = r.rutinas.find((y) => y.id === b.dataset.id);
          llevarseRutinaPublicada(x);
        }));
      };

      $$('[data-orden]', cuerpo).forEach((b) => (b.onclick = () => {
        orden = b.dataset.orden;
        $$('[data-orden]', cuerpo).forEach((x) => x.setAttribute('aria-pressed', x.dataset.orden === orden));
        cargar();
      }));
      $$('[data-orden]', cuerpo).forEach((x) => x.setAttribute('aria-pressed', x.dataset.orden === orden));
      caja.oninput = () => { clearTimeout(reloj); reloj = setTimeout(cargar, 320); };
      cargar();
    }
  );
}

const NIVEL_RUTINA = {
  empiezo: 'para empezar', medio: 'nivel medio', avanzado: 'avanzada', cualquiera: 'para cualquiera',
};

/**
 * Trae el paquete de la rutina publicada y lo mete por el camino de siempre.
 *
 * Una sola llamada: `copiarRutina` devuelve el paquete Y cuenta la copia. Antes
 * eran dos —pedir `datos` por PostgREST y luego avisar de la copia— y el
 * contador se podía subir sin llevarse nada.
 */
async function llevarseRutinaPublicada(x) {
  if (!x) return;
  const r = await social.copiarRutina(x.id);
  if (!r.ok) return aviso(r.motivo || 'No pude traer esa rutina', 3200);
  const v = comp.validar(r.paquete);
  if (!v.ok) return aviso(v.motivo, 3400);
  hojaImportarRutina(v.paquete);
}

function abrirComentarios(rutinaId) {
  hoja(
    'Comentarios',
    `<div id="cm-lista" aria-live="polite"><p class="grafica-vacia">Cargando…</p></div>
     <div class="campo">
       <label for="cm-texto">Escribe algo</label>
       <textarea id="cm-texto" rows="3" maxlength="500" placeholder="¿Qué te ha parecido?"></textarea>
     </div>
     <button class="boton" id="cm-enviar">Comentar</button>`,
    (cuerpo) => {
      const zona = $('#cm-lista', cuerpo);
      const caja = $('#cm-texto', cuerpo);

      const cargar = async () => {
        const r = await social.comentariosDe(rutinaId, 50);
        if (!r.ok) { zona.innerHTML = `<p class="grafica-vacia">${esc(r.motivo)}</p>`; return; }
        zona.innerHTML = r.comentarios.length
          ? `<div class="lista">${r.comentarios.map((c) => `
              <div class="pf-fila">
                <div class="pf-fila-texto">
                  <div class="pf-fila-nombre">${esc(c.alias_visible || c.alias)}</div>
                  <div class="cm-texto">${esc(c.texto)}</div>
                </div>
                ${c.es_mio ? `<button class="boton-plano cm-borrar" data-id="${c.id}"
                   aria-label="Borrar mi comentario">${icono('papelera', 18)}</button>` : ''}
              </div>`).join('')}</div>`
          : '<p class="grafica-vacia">Sé el primero.</p>';
        $$('.cm-borrar', zona).forEach((b) => (b.onclick = async () => {
          await social.borrarComentario(b.dataset.id);
          cargar();
        }));
      };
      cargar();

      $('#cm-enviar', cuerpo).onclick = async () => {
        if (!nube.usuario()) return abrirCuenta();
        const r = await social.comentar(rutinaId, caja.value);
        if (!r.ok) return aviso(r.motivo, 3400);
        caja.value = '';
        cargar();
      };
    }
  );
}

const VISTAS = {
  entrenar: { titulo: 'Entrenar', pintar: pintarEntrenar },
  progreso: { titulo: 'Progreso', pintar: pintarProgreso },
  nutricion: { titulo: 'Nutrición', pintar: pintarNutricion },
  plan: { titulo: 'Plan', pintar: pintarPlan },
  // Perfil ocupa el hueco que tenía Ajustes en la barra, por el mismo criterio
  // con el que Gimnasios salió de ella en la 0.11.0: en la barra van los cinco
  // sitios que se usan A DIARIO. Los ajustes se tocan una vez al año, así que
  // se llega a ellos desde el perfil — que es donde los busca cualquiera que
  // haya usado Instagram o Strava.
  perfil: { titulo: 'Perfil', pintar: pintarPerfil },
  // El vestuario no tiene botón en la barra: se llega desde el perfil, que es
  // lo que se está personalizando. En la barra van los cinco sitios de uso
  // DIARIO y este no lo es — se entra cuando hay una caja esperando.
  vestuario: { titulo: 'Vestuario', pintar: pintarVestuarioVista },
  ajustes: { titulo: 'Ajustes', pintar: pintarAjustes },
  // Gimnasios ya no tiene botón propio en la barra: son cinco sitios y el
  // quinto lo ocupa ahora el Plan, que se usa a diario. Se llega desde el
  // selector de gimnasio de la cabecera, que es donde uno lo busca.
  gimnasios: { titulo: 'Gimnasios', pintar: pintarGimnasios },
};

/* --------------------------------------------------------------------------
 * CAMBIAR DE PESTAÑA
 *
 * La pantalla entra por el lado del que viene. Sin eso, cambiar de pestaña es
 * un parpadeo y no se entiende que te has movido: el orden de la barra deja de
 * significar nada. Y se acompaña de un toque de vibración de 8 ms, que es lo
 * que hace que un botón de cristal se sienta como un botón.
 * ------------------------------------------------------------------------ */
const ORDEN_VISTAS = ['entrenar', 'progreso', 'nutricion', 'plan', 'ajustes'];

function tocar(ms = 8) {
  // `vibrate` no existe en un navegador de escritorio y en el móvil puede estar
  // apagada: se intenta y punto, nunca se deja caer la app por esto.
  try { if (navigator.vibrate) navigator.vibrate(ms); } catch { /* da igual */ }
}

function irA(vista, { avisar = true } = {}) {
  if (vista === S.vista) return;
  const antes = ORDEN_VISTAS.indexOf(S.vista);
  const ahora = ORDEN_VISTAS.indexOf(vista);
  S.direccion = ahora > antes ? 'derecha' : 'izquierda';
  // Solo AQUÍ se enciende la transición. Antes se animaba en cada `pintar()`,
  // así que la pantalla se deslizaba también al guardar una serie o al cerrar
  // una hoja: una animación que pasa siempre no significa nada, y encima
  // estorba. Se gasta al pintar y se apaga sola.
  S.transicion = true;
  // Entrar en Plan siempre empieza por HOY: si se quedara en el día que miraste
  // el martes, abrirías la pestaña y verías el detalle del día equivocado.
  if (vista === 'plan') _diaElegido = null;
  S.vista = vista;
  if (avisar) tocar();
  pintar();
}

/**
 * La copia de la pantalla que se va, para poder cruzarla con la que entra.
 *
 * POR QUÉ UNA COPIA Y NO LA PANTALLA DE VERDAD: toda la app vive en UN solo
 * `<main id="vista">` que se vacía y se vuelve a llenar. Para que dos pantallas
 * se muevan a la vez tiene que haber dos elementos, y el segundo no puede ser
 * el bueno —lo necesitamos para pintar la nueva—. Así que se clona, se anima la
 * copia y se tira.
 *
 * Va con `position: fixed` sobre el hueco que ocupaba la vista, y por DEBAJO de
 * la cabecera (z-index 20 contra 30): así se mete debajo de la cabecera igual
 * que hace la pantalla de verdad al desplazarse, en vez de pasarle por encima.
 *
 * `scrollTop` se copia DESPUÉS de meterlo en el documento: un elemento que
 * todavía no tiene caja no se puede desplazar, y la copia saldría desde arriba
 * aunque estuvieras a mitad de la lista.
 */
const LIMITE_CLON = 900;   // nodos: más que esto y el clon costaría un fotograma

function fantasmaDeSalida(raiz) {
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (raiz.querySelectorAll('*').length > LIMITE_CLON) return;

  const caja = raiz.getBoundingClientRect();
  if (!caja.width || !caja.height) return;
  const desplazado = raiz.scrollTop;

  const f = raiz.cloneNode(true);
  f.removeAttribute('id');
  f.setAttribute('aria-hidden', 'true');
  f.classList.remove('cambia', 'desde-derecha', 'desde-izquierda');
  f.classList.add('vista-fantasma', S.direccion === 'derecha' ? 'sale-izquierda' : 'sale-derecha');
  f.style.cssText = `position:fixed;left:${caja.left}px;top:${caja.top}px;` +
    `width:${caja.width}px;height:${caja.height}px;margin:0;z-index:20;pointer-events:none;`;
  // UN `<canvas>` NO SE CLONA CON SU DIBUJO DENTRO. `cloneNode` copia el
  // elemento y sus atributos, pero el mapa de bits se queda en el original: sin
  // esto, la pantalla que se va enseñaría rectángulos vacíos donde estaban las
  // piezas. Se copian a mano, que son cuatro y cuesta un `drawImage`.
  const origen = raiz.querySelectorAll('canvas');
  const copia = f.querySelectorAll('canvas');
  for (let i = 0; i < copia.length && i < origen.length; i++) {
    const a = origen[i]; const b = copia[i];
    if (!a.width || !a.height) continue;
    b.width = a.width; b.height = a.height;
    try { b.getContext('2d').drawImage(a, 0, 0); } catch { /* lienzo sucio, da igual */ }
  }
  document.body.appendChild(f);
  f.scrollTop = desplazado;

  const fuera = () => f.remove();
  f.addEventListener('animationend', fuera);
  // Red de seguridad: si la animación no llega a dispararse (pestaña en
  // segundo plano, por ejemplo) el fantasma se quedaría tapando la app.
  setTimeout(fuera, 700);
}

export function pintar() {
  limpiarUrls();
  const v = VISTAS[S.vista] || VISTAS.entrenar;

  // El gimnasio ya no es un <select> del sistema: es un botón que enseña el
  // nombre y abre una hoja. Un <select> nativo en Android sale con la letra y
  // el gris del fabricante, y era una de las piezas que cantaban «2010».
  const sel = $('#gym-selector');
  if (sel) {
    const gim = S.cache.gimnasios.find((g) => g.id === S.gimnasioId);
    $('span', sel).textContent = gim ? gim.nombre : 'Elegir gimnasio';
    sel.classList.toggle('oculto', S.vista !== 'entrenar' && S.vista !== 'progreso');
  }
  // El título acompaña al empujón. Sin esto, la cabecera ya pone «Progreso»
  // mientras en pantalla se sigue viendo «Entrenar» yéndose: el título va por
  // delante de la app y se nota.
  const tit = $('#titulo-vista');
  tit.textContent = v.titulo;
  if (S.transicion) {
    tit.classList.remove('titulo-cambia');
    void tit.offsetWidth;
    tit.classList.add('titulo-cambia');
  }

  const raiz = $('#vista');
  /* EL BOTE DE LA BARRA DE ABAJO (Carlos, 29-ago-2026: «la barra pega un bote
   * arriba y abajo y se queda abajo»).
   *
   * Pasaba así: estando la pantalla bajada, al cambiar de pestaña se vaciaba la
   * vista PRIMERO. En ese instante el documento se quedaba en cuatro dedos de
   * alto con la página desplazada 700 px, así que el navegador recolocaba el
   * desplazamiento Y reajustaba el alto de la ventana (`innerHeight` pasaba de
   * 915 a 973 y volvía). La barra de abajo está anclada a ESA ventana: se iba
   * hacia abajo y volvía. Y si la pestaña nueva era corta, se quedaba fuera.
   *
   * La cura son dos cosas, y ninguna es una animación:
   *  1. Subir arriba ANTES de vaciar, no después: así el documento nunca se
   *     queda corto y desplazado a la vez.
   *  2. Que la vista tenga un alto mínimo (en el CSS), para que el documento no
   *     encoja de golpe al cambiar de una pestaña larga a una corta.
   */
  // El cruce: la pantalla que se va sale por su lado mientras la nueva entra
  // por el suyo. Hay que sacar la copia ANTES de vaciar, claro.
  const cruzando = S.transicion;
  S.transicion = false;
  if (cruzando) fantasmaDeSalida(raiz);

  raiz.scrollTop = 0;
  _scrollAnterior = 0;
  // LOS LIENZOS DE ESTA VISTA SE SUELTAN ANTES DE VACIAR. Si no, sus escenas
  // se quedarían en el motor apuntando a elementos que ya no están en el
  // documento: seguirían contando como visibles y pintando para nadie. Es la
  // versión de canvas de la fuga que ya tuvimos con los `blob:`.
  //
  // Y se sueltan SOLO los de `raiz`: puede haber una hoja abierta con piezas
  // dentro, y soltarlo todo la dejaría con los dibujos congelados. Lo que se
  // escape por otro camino lo recoge `podar()` en el siguiente montaje.
  MOT.motor.desmontar(raiz);
  raiz.innerHTML = '';
  // Se quita y se vuelve a poner para que la animación arranque otra vez: sin
  // esto, cambiar de pestaña por segunda vez no movía nada.
  raiz.classList.remove('cambia', 'desde-derecha', 'desde-izquierda');
  void raiz.offsetWidth;
  if (cruzando) {
    raiz.classList.add('cambia', S.direccion === 'izquierda' ? 'desde-izquierda' : 'desde-derecha');
  }
  v.pintar(raiz);
  // Y aquí se enganchan los de la pantalla nueva. El motor se salta los que ya
  // están montados, así que llamar de más no cuesta nada.
  MOT.motor.montar(raiz, COS.pintorDe);

  $$('.nav-boton').forEach((b) => {
    if (b.dataset.vista === S.vista) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
  ponerFab();
  animarEntrada(raiz);
  // Si se ha ganado algo desde la última pantalla, se celebra AQUÍ: cuando ya
  // no hay ninguna hoja abierta que tapar.
  mostrarLogrosPendientes();
  try { history.replaceState(null, '', `#${S.vista}`); } catch { /* file:// no deja */ }
  cabeceraSegunScroll();
}

/* --------------------------------------------------------------------------
 * EL BOTÓN FLOTANTE
 *
 * Una sola acción por pantalla, la que se hace de verdad, y siempre al alcance
 * del pulgar. Antes esas acciones eran tres botones apilados AL FINAL de la
 * lista: para añadir una máquina había que recorrer las que ya tienes.
 * ------------------------------------------------------------------------ */
const FAB = {
  entrenar: { texto: 'Añadir', accion: () => menuAnadirMaquina() },
  gimnasios: { texto: 'Gimnasio', accion: () => editarGimnasio(null) },
  plan: { texto: 'Objetivo', accion: () => editarMeta(null) },
};

function ponerFab() {
  const fab = $('#fab');
  if (!fab) return;
  const cfg = FAB[S.vista];
  fab.classList.toggle('oculto', !cfg);
  if (!cfg) return;
  const cambia = $('.fab-texto', fab).textContent !== cfg.texto;
  $('.fab-texto', fab).textContent = cfg.texto;
  fab.onclick = cfg.accion;
  // Solo cuando la acción CAMBIA de verdad: si en las dos pestañas pone
  // «Añadir», dar un brinco por nada llama la atención sobre nada.
  if (cambia) {
    fab.classList.remove('fab-brinca');
    void fab.offsetWidth;
    fab.classList.add('fab-brinca');
  }
}

/** Las tres formas de meter una máquina, en una hoja en vez de en tres botones. */
function menuAnadirMaquina() {
  const flojo = sesionHoyExcluida();
  hoja('Añadir a este gimnasio', `
    <div class="hoja-lista">
      <button class="hoja-op" data-op="catalogo">${icono('lupa', 20)}
        <span>Del catálogo<small>1.365 ejercicios con figura y técnica</small></span></button>
      <button class="hoja-op" data-op="mano">${icono('lapiz', 20)}
        <span>Crear una a mano<small>para una máquina rara de tu gimnasio</small></span></button>
      <button class="hoja-op" data-op="flojo">${icono('reloj', 20)}
        <span>${flojo ? 'Hoy ya está marcado como día flojo' : 'Marcar hoy como día flojo'}
        <small>${flojo ? 'toca para que vuelva a contar' : 'no contará en las gráficas'}</small></span></button>
    </div>`, (cuerpo, cerrar) => {
    $$('[data-op]', cuerpo).forEach((b) => (b.onclick = () => {
      cerrar();
      if (b.dataset.op === 'catalogo') abrirCatalogo();
      else if (b.dataset.op === 'mano') editarMaquina(null);
      else alternarDiaFlojo();
    }));
  });
}

/** La lista de gimnasios, en una hoja. */
function abrirSelectorGym() {
  hoja('¿En qué gimnasio estás?', `
    <div class="hoja-lista">
      ${S.cache.gimnasios.map((g) => {
        const n = S.cache.maquinas.filter((m) => m.gimnasioId === g.id).length;
        return `<button class="hoja-op" data-gym="${g.id}" aria-current="${g.id === S.gimnasioId}">
          <span>${esc(g.nombre)}<small>${n} ${n === 1 ? 'máquina' : 'máquinas'}${g.direccion ? ` · ${esc(g.direccion)}` : ''}</small></span>
          ${g.id === S.gimnasioId ? icono('tic', 20) : ''}</button>`;
      }).join('')}
    </div>
    <button class="boton boton-2" id="gestionar-gyms" style="margin-top:14px">Añadir o editar gimnasios</button>`,
    (cuerpo, cerrar) => {
    $$('[data-gym]', cuerpo).forEach((b) => (b.onclick = async () => {
      S.gimnasioId = b.dataset.gym;
      await db.ponAjuste('ultimo_gym', S.gimnasioId);
      cerrar();
      tocar();
      pintar();
    }));
    $('#gestionar-gyms', cuerpo).onclick = () => {
      cerrar();
      irA('gimnasios');
    };
  });
}

/* --------------------------------------------------------------------------
 * LA CABECERA QUE ENCOGE
 *
 * Arriba del todo manda el título grande; en cuanto se baja, se aparta y deja
 * la pantalla para el contenido. El botón flotante hace lo mismo: se queda en
 * icono para no tapar la lista mientras se recorre.
 * ------------------------------------------------------------------------ */
/**
 * Deslizar el dedo para cambiar de pestaña.
 *
 * REGLAS QUE NO SE SALTAN (o el gesto se vuelve un incordio):
 *  · Solo cuenta si el movimiento es CLARAMENTE horizontal (más del doble que
 *    el vertical). Si no, arrastrar la lista hacia abajo cambiaría de pestaña.
 *  · No cuenta encima de nada que se desplace de lado por su cuenta (los chips,
 *    la tira de platos, las gráficas): ahí el dedo ya tiene dueño.
 *  · No cuenta con una hoja abierta.
 *  · 60 px de recorrido mínimo. Menos que eso es un toque tembloroso.
 */
function gestoDeslizar() {
  const zona = document.body;
  let x0 = 0, y0 = 0, valido = false;
  zona.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return (valido = false);
    const t = e.touches[0];
    valido = !e.target.closest('.chips, .platos-fila, .grafica-svg, .hoja-fondo, .nut-resultados, input, textarea, select');
    x0 = t.clientX;
    y0 = t.clientY;
  }, { passive: true });
  zona.addEventListener('touchend', (e) => {
    if (!valido) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - x0;
    const dy = t.clientY - y0;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 2) return;
    const i = ORDEN_VISTAS.indexOf(S.vista);
    const siguiente = ORDEN_VISTAS[dx < 0 ? i + 1 : i - 1];
    if (siguiente) irA(siguiente);
  }, { passive: true });
}

let _scrollAnterior = 0;

function cabeceraSegunScroll() {
  const zona = $('#vista');
  const y = zona ? zona.scrollTop : 0;
  const cab = document.querySelector('.cabecera');
  if (cab) cab.classList.toggle('encogida', y > 12);

  const fab = $('#fab');
  if (fab) {
    // Encogido a icono en cuanto se baja un poco, y ESCONDIDO del todo mientras
    // se sigue bajando: en una lista de máquinas el botón flotante tapaba
    // justo el «+» de una de las filas. Al subir vuelve, que es cuando se
    // busca. Es lo que hace cualquier app decente y se nota en cuanto falta.
    fab.classList.toggle('encogido', y > 120);
    const bajando = y > _scrollAnterior + 4 && y > 220;
    const subiendo = y < _scrollAnterior - 4;
    if (bajando) fab.classList.add('escondido');
    else if (subiendo || y < 120) fab.classList.remove('escondido');
  }
  _scrollAnterior = y;
}

/* --------------------------------------------------------------------------
 * LAS CIFRAS SUBEN CONTANDO
 *
 * Solo las de titular (las calorías del día, el peso de la gráfica, el volumen
 * del periodo). Animar TODOS los números sería una feria y encima se leería
 * peor: el ojo no puede leer una cifra que cambia mientras la buscas.
 *
 * Se anima con `requestAnimationFrame` y no con transiciones de CSS porque lo
 * que cambia es el TEXTO, no un estilo. Y si el sistema pide menos movimiento,
 * se escribe el número final y ya está.
 * ------------------------------------------------------------------------ */
function contarHasta(el, valor, { decimales = 0, prefijo = '', sufijo = '', ms = 620 } = {}) {
  if (!el) return;
  const escribe = (v) => {
    el.textContent = prefijo + v.toLocaleString('es-ES', {
      minimumFractionDigits: decimales, maximumFractionDigits: decimales,
    }) + sufijo;
  };
  const quieto = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (quieto || !Number.isFinite(valor) || Math.abs(valor) < 0.01) return escribe(valor || 0);

  const t0 = performance.now();
  const paso = (ahora) => {
    const t = Math.min(1, (ahora - t0) / ms);
    // Frenada suave al final: la cifra llega, no choca.
    escribe(valor * (1 - Math.pow(1 - t, 3)));
    if (t < 1) requestAnimationFrame(paso);
    else escribe(valor);
  };
  requestAnimationFrame(paso);
}

/* --------------------------------------------------------------------------
 * LAS PELÍCULAS DEL VESTUARIO (0.37.0)
 *
 * Carlos, 5-sep-2026: *«haz que la primera vez que abras la app pues que se
 * descarguen, si de esta manera tenemos acceso a herramientas de mejor calidad
 * (…) ampliar el peso de la app a costa de poder ofrecer animaciones y
 * contenidos de calidad»*.
 *
 * Cómo se hace sin romper la regla de que la app abre en un gimnasio sin
 * cobertura: el pack ESTÁNDAR viaja dentro del APK y siempre está; esto solo
 * baja el de ALTA, que es el mismo arte al doble de resolución y al doble de
 * fotogramas. Si no hay red, no pasa nada — literalmente nada: no hay aviso, no
 * hay reintento agresivo y no hay pantalla de carga. Se intenta otra vez al
 * siguiente arranque.
 *
 * Va DESPUÉS de `pintar()` y no espera a nadie: son megas, y bloquear el
 * arranque de la app por un adorno sería exactamente el error contrario.
 * ------------------------------------------------------------------------ */
async function bajarLosEfectos() {
  try {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    const base = await comp.base();          // sale de `nube.json` → `web`
    if (!base) return;
    // SOLO LO QUE LLEVAS PUESTO. El pack entero son 127 MB y bajarlos sin
    // preguntar sería gastarle la tarifa de datos a nadie. Lo puesto son tres
    // piezas: lo justo para que TU perfil se vea bien también sin cobertura.
    // El resto se pide al servidor cuando se mira, y para bajarlo todo está el
    // botón de Ajustes, que sí dice lo que pesa.
    const puesto = Object.values(vestuarioActual().puesto || {}).filter(Boolean);
    const puestas = await PELIS.descargar(base, { soloEstas: puesto });
    // Solo se repinta si de verdad ha llegado algo Y se está mirando el perfil,
    // que es donde se ven las piezas. Repintar por sorpresa mientras Carlos
    // apunta una serie sería peor que esperar al siguiente cambio de pantalla:
    // el vestuario se abre encima y se pinta al abrirlo, así que ya las coge.
    if (puestas > 0 && S.vista === 'perfil') pintar();
  } catch { /* sin red o sin servidor: se queda el pack del APK */ }
}

export async function arrancar() {
  // El navegador guarda dónde estabas y lo restaura al volver. Aquí las
  // pantallas se pintan de cero, así que restaurar un desplazamiento viejo solo
  // sirve para dar un salto raro. Lo llevamos nosotros.
  try { history.scrollRestoration = 'manual'; } catch { /* WebView vieja */ }

  // EL ENLACE COMPARTIDO SE LEE AQUÍ, LO PRIMERO DE TODO.
  //
  // `pintar()` reescribe la dirección con `#<vista>` en CADA pintada (es lo que
  // hace que los accesos directos del icono funcionen). Si esperásemos al final
  // de `arrancar` para mirar el `#`, la primera pintada ya se habría llevado por
  // delante el `#/i/…` del enlace y la rutina compartida se perdería sin más:
  // la app abría por Entrenar y nadie se enteraba de que había un enlace.
  const enlaceDeEntrada = comp.leerHash(location.hash);
  // Y LO QUE VUELVE DEL CORREO, por lo mismo y en el mismo sitio.
  //
  // Supabase rebota de la confirmación con el testigo detrás de la almohadilla
  // (`#access_token=...&type=signup`). Si esto se leyera al final, la primera
  // pintada se lo habría llevado por delante y la cuenta no se confirmaría
  // nunca — que es exactamente lo que se veía: «no te deja confirmar el
  // correo». Se lee aquí, antes que nada, y se atiende al final.
  const vueltaDelCorreo = nube.leerVueltaDeCorreo(location.hash);

  await db.abrir();
  // LAS PELÍCULAS DEL VESTUARIO, antes de pintar (0.37.0). `cosmeticos.js`
  // decide al ESCRIBIR EL HTML si una pieza es una película o un lienzo, así
  // que si esto llegara tarde la primera pintada saldría con los dibujos viejos
  // y cambiarían al repintar. Es la misma razón por la que el catálogo y la
  // sesión se cargan aquí y no después.
  try {
    await PELIS.recuperar();
    // Y de dónde cuelga el pack grande, ANTES de la primera pintada: si llegara
    // después, la tarjeta del perfil se pintaría con la película pequeña
    // estirada y solo se arreglaría al repintar.
    PELIS.fijarBase(await comp.base());
  } catch { /* un adorno no tumba la app */ }
  // El catálogo (1.365 ejercicios) se carga ANTES de pintar: si llegara tarde,
  // la primera pintada saldría sin figuras y luego «saltarían» al aparecer.
  await cat.cargar();
  // La sesión de la nube, también antes de pintar: si no, el perfil se dibuja
  // un instante como «entra o crea una cuenta» aunque ya estés dentro, y ese
  // parpadeo se lee como que te ha echado.
  await nube.arrancar();
  aplicarTema((await db.ajuste('tema', 'oscuro')) || 'oscuro', await temaPropio());
  // El sonido, antes de pintar nada: si se leyera después, la primera caja que
  // se abriera sonaría aunque estuviese apagado.
  SON.configurar({ sonido: !!(await db.ajuste(CLAVE_SONIDO, true)) });
  _modoPersonal = !!(await db.ajuste(CLAVE_MODO_PERSONAL, false));

  // LA BIENVENIDA DECIDE. Antes se sembraban aquí los TRES GIMNASIOS DE CARLOS
  // (VivaGym Reus, Basic-Fit Tarradellas, La Cochera) a cualquiera que
  // instalara la app. A Carlos le sirven; a un desconocido le dicen que se ha
  // equivocado de app. Ahora, si toca enseñar la bienvenida, el gimnasio y los
  // días los elige quien la abre, y la siembra no corre.
  const tocaBienvenida = await BV.hayQueEnsenarla();
  if (!tocaBienvenida) {
    if (!(await db.todos('gimnasios')).length) await sembrarGimnasios();
    await sembrarRutinas();
  }
  // SIN `if`, y esa es la corrección. Antes solo sembraba con el almacén vacío,
  // así que a quien ya tenía alimentos (o sea, a Carlos) no le llegaba nunca
  // una ampliación de la base. `sembrarAlimentos` es idempotente y solo escribe
  // lo que de verdad cambia, así que se puede llamar en cada arranque.
  await sembrarAlimentos();
  await recargar();
  // Los logros también se miran AL ARRANCAR, no solo al apuntar una serie: si
  // los datos llegan de otro sitio (la sincronización con el PC, una copia
  // restaurada), las insignias nuevas aparecen sin que aquí se haya apuntado
  // nada, y nadie se enteraría.
  await comprobarLogros();

  // Los accesos directos del icono («apuntar una serie», «apuntar una comida»)
  // llegan como #entrenar / #nutricion. Sin esto abrirían la app por donde
  // toque y el acceso directo sería mentira.
  const desdeElAtajo = (location.hash || '').replace('#', '');
  if (VISTAS[desdeElAtajo]) S.vista = desdeElAtajo;

  $$('.nav-boton').forEach((b) => (b.onclick = () => irA(b.dataset.vista)));
  $('#gym-selector').onclick = abrirSelectorGym;
  gestoDeslizar();
  // El oyente va en `.vista`, que es lo que se desplaza ahora (el cuerpo mide
  // una pantalla exacta y se queda quieto). `passive` porque aquí no se cancela
  // nada: sin él, Chrome avisa de que el oyente puede frenar el desplazamiento.
  $('#vista').addEventListener('scroll', cabeceraSegunScroll, { passive: true });

  sync.alCambiarEstado((e) => {
    const chip = $('#estado-sync');
    if (!chip) return;
    chip.setAttribute('role', 'status');
    chip.setAttribute('aria-live', 'polite');
    if (e.estado === 'ok') {
      chip.className = 'estado-sync ok';
      chip.textContent = 'sincronizado';
      setTimeout(() => (chip.textContent = ''), 2600);
    } else if (e.estado === 'pendiente') {
      chip.className = 'estado-sync pendiente';
      chip.textContent = 'sin PC';
    }
  });

  // Un enlace compartido abierto con la app YA abierta (WhatsApp la trae al
  // frente sin recargar) solo cambia el `#`, así que hay que escucharlo.
  window.addEventListener('hashchange', () => {
    const r = comp.leerHash(location.hash);
    if (r) atenderEnlace(r);
  });
  nube.alCambiarSesion(() => {
    if (S.vista === 'perfil') pintar();
  });

  // Dejar de mirar la pantalla es el último aviso de que igual no vuelves. Es
  // el momento de subir lo que aún no está en la copia. `visibilitychange` y no
  // `beforeunload`: en Android la app no se «descarga», se va al fondo.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') copiaAlSalir();
  });

  pintar();
  sync.automatico();
  procesarFotosPendientes();
  bajarLosEfectos();

  // A dónde vuelven los correos de Supabase: la misma dirección pública de la
  // que cuelgan los enlaces compartidos.
  nube.fijarDondeVuelve(await comp.base());

  // Al final: primero que la app esté en pie y luego se pregunta si quiere
  // importar. Al revés, la hoja saldría sobre una pantalla a medias.
  if (vueltaDelCorreo) await atenderVueltaDelCorreo(vueltaDelCorreo);

  // LA PUERTA VA DELANTE DE LA BIENVENIDA, y ese orden es el arreglo.
  //
  // Antes la bienvenida te pedía el nombre, el gimnasio y los días ANTES de
  // saber quién eras, así que después, al crear la cuenta, te volvía a pedir el
  // nombre y el usuario. Carlos: «te sale sin nombre, como si no estuviese
  // configurado, y te hace volver a meter el nombre, el usuario, las
  // anotaciones». Primero la cuenta; la bienvenida ya la reconoce.
  if (await hayQuePasarPorLaPuerta()) {
    return abrirPuerta(async () => {
      await recargar();
      pintar();
      // Se vuelve a preguntar: si has entrado con una cuenta que tenía copia,
      // la bienvenida YA está hecha y volver a enseñarla sería tratarte de
      // nuevo cuando llevas dos años apuntando.
      if (await BV.hayQueEnsenarla()) return abrirBienvenida();
      atenderEnlace(enlaceDeEntrada);
      copiaAutomatica();
    });
  }
  // Con sesión ya guardada: la copia se intenta calladamente, y si no toca o no
  // hay red no pasa nada. Nunca bloquea el arranque.
  copiaAutomatica();
  /* Y SI AQUÍ NO HAY NADA TUYO, LA COPIA SE OFRECE OTRA VEZ.  (0.31.0)
   *
   * `trasEntrar()` solo corre cuando se entra de verdad. Si aquel día no había
   * red —o si la copia no llegó por lo que sea—, el móvil se quedaba vacío y la
   * sesión guardada: a partir de ahí no se volvía a ofrecer NUNCA, y la única
   * forma de recuperar dos años de entrenos era saber que existe un botón en
   * Ajustes. Una copia que hay que adivinar no es una copia. */
  if (nube.usuario() && !(await ID.hayDatosTuyos(db))) await ofrecerRestaurar();
  if (tocaBienvenida) return abrirBienvenida();
  atenderEnlace(enlaceDeEntrada);
}

/* --------------------------------------------------------------------------
 * LA BIENVENIDA
 * ------------------------------------------------------------------------ */

function abrirBienvenida() {
  BV.preparar({
    esc,
    icono,
    aviso,
    aplicarTema: (id, propio) => aplicarTema(id, propio, { suave: true }),
    abrirCuenta: () => abrirCuenta(),
    // Lo que ya sabemos de ti antes de empezar a preguntar. Si has entrado por
    // la puerta, `trasEntrar()` ya ha bajado tu perfil de la nube.
    nombreSabido: (() => {
      const p = perfilActual();
      return p.nombre || p.aliasVisible || p.alias || '';
    })(),
  });
  BV.abrir({
    alTerminar: async (hecho, elegido) => {
      await recargar();
      if (hecho && hecho.gimnasio) S.gimnasioId = hecho.gimnasio.id;
      pintar();
      // Y ahora lo que necesita la app entera montada: llevarse la rutina
      // elegida (el importador casa las máquinas contra las que ya tienes) y
      // apuntarse al gimnasio público.
      const extra = await BV.despues(elegido, {
        // Llega la FILA de la rutina publicada (con su id), no el paquete: la
        // lista de populares no trae los datos dentro para no cargar ocho
        // rutinas enteras solo para enseñar sus nombres. Se pide la elegida —y
        // si es una de las ocho oficiales, `copiarRutina` la saca de dentro de
        // la app cuando no hay red, así que la bienvenida no se queda a medias
        // por estar en el metro.
        importarPaquete: async (fila) => {
          const gym = S.cache.gimnasios[0];
          if (!fila || !gym) return false;   // sin gimnasio no hay dónde meter las máquinas
          const r = await social.copiarRutina(fila.id);
          const v = comp.validar(r.ok ? r.paquete : null);
          if (!v.ok || v.paquete.tipo !== 'rutina') return false;
          await comp.importarRutina(v.paquete, gym.id, {
            maquinas: S.cache.maquinas, rutinas: S.cache.rutinas,
          });
          return true;
        },
      });
      if (extra.rutina) await recargar();
      pintar();
      if (hecho && hecho.rutinas) {
        aviso('Listo. Ahora añade las máquinas de tu gimnasio', 3200);
      }
    },
  });
}

/* --------------------------------------------------------------------------
 * LO QUE VUELVE DEL CORREO
 *
 * Tres cosas distintas llegan por aquí y las tres necesitan una pantalla
 * distinta. Antes no llegaba ninguna, porque el testigo se perdía en el `#`.
 * ------------------------------------------------------------------------ */

async function atenderVueltaDelCorreo(v) {
  comp.limpiarHash();

  if (v.que === 'error') {
    // Lo normal aquí es el enlace caducado. Un «error» a secas deja a la
    // persona sin saber qué hacer; lo que hace falta es el botón de reenviar.
    return hojaReenviar(v.codigo === 'otp_expired'
      ? 'Ese enlace ha caducado'
      : 'Ese enlace ya no vale',
      v.texto || 'Los enlaces de confirmación duran un rato por seguridad. Te mando otro.');
  }

  const r = await nube.entrarConTestigo(v);
  if (!r.ok) return hojaReenviar('No pude entrar con ese enlace', r.motivo);

  if (v.que === 'recovery') return hojaContrasenaNueva();

  if (v.que === 'email_change') {
    aviso('Correo cambiado', 3000);
    pintar();
    return;
  }
  // El testigo del correo da sesión, pero no dice quién eres ni baja tu perfil.
  // Sin esto, confirmar la cuenta desde el correo dejaba la app dentro y con el
  // perfil en blanco — el mismo «sale sin nombre» por otra puerta.
  await trasEntrar();
  // El enlace del correo lo abre el NAVEGADOR, no el APK: el dominio interno de
  // la app no existe fuera del móvil, así que la vuelta cae siempre en la web.
  // Decir «ya estás dentro» a secas es verdad aquí y mentira allí, y deja a
  // quien lo lee sin saber qué hacer con la app que tiene abierta al lado.
  hoja(
    'Cuenta confirmada',
    `<p class="campo-nota" style="margin-top:0">Listo: tu cuenta
       <b>${esc((nube.usuario() || {}).email || '')}</b> ya está confirmada.</p>
     <p class="campo-nota">Si has llegado aquí desde el correo y tienes la app
       instalada en el móvil, <b>vuelve a la app y entra con tu correo y tu
       contraseña</b>. Ahora ya te dejará.</p>
     <button class="boton" data-cerrar>Entendido</button>`,
    () => {}
  );
  pintar();
}

/**
 * Las fotos que se sacaron sin servidor delante.
 *
 * Se intenta al arrancar y en segundo plano: si Carlos fotografió la comida en
 * un restaurante y el PC estaba apagado, al llegar a casa y abrir la app se
 * analizan solas y él solo tiene que confirmar. No se apunta nada sin que lo
 * vea — el modelo se equivoca y una app que apunta a ciegas miente.
 */
async function procesarFotosPendientes() {
  let pendientes;
  try {
    pendientes = (await db.fotosEnCola()).filter((f) => !f.rendida);
  } catch {
    return;                       // base vieja sin el almacén: no es grave
  }
  if (!pendientes.length) return;

  aviso(`Analizando ${pendientes.length} ${pendientes.length === 1 ? 'foto pendiente' : 'fotos pendientes'}…`, 4000);
  const resueltas = await C.procesarCola();
  if (!resueltas.length) return;

  // De una en una: una hoja encima de otra no se puede usar.
  for (const r of resueltas) {
    await new Promise((sigue) => {
      hojaRevisarFoto({ alimentos: r.alimentos, motor: r.motor }, r.fecha, r.momento);
      const observador = setInterval(() => {
        if (!document.querySelector('.hoja-fondo')) {
          clearInterval(observador);
          sigue();
        }
      }, 400);
    });
  }
}

/** Enseña las direcciones que dice el PC, para poder copiarlas o teclearlas. */
async function mostrarDirecciones(raiz) {
  const zona = $('#a-direcciones', raiz);
  if (!zona) return;
  const r = await C.direcciones();
  if (!r.ok || !r.direcciones.length) return;   // sin PC delante, no se enseña nada
  zona.innerHTML = `
    <div class="dirs">
      ${r.direcciones.map((d) => `
        <div class="dir ${d.vivo ? '' : 'dir-caida'}">
          <div class="dir-que">${esc(d.que)} ${d.vivo ? '' : '· no responde'}</div>
          <code class="dir-url">${d.url ? esc(d.url) : 'no disponible'}</code>
          <div class="dir-para">${esc(d.para)}</div>
        </div>`).join('')}
    </div>
    <p class="nut-media">La IP la reparte el router y cambia sola. Si un día no
      conecta, dale a «Buscar el PC en la red».</p>`;
}

/* ==========================================================================
 * LA PUERTA — la app empieza por saber quién eres
 *
 * Carlos, 1-sep-2026: *«la idea es que te fuerce a crear una cuenta, porque si
 * no pierdes todo, y que si cierras sesión te mande a un inicio para entrar. Si
 * ya tienes una cuenta, pues que entres y se vuelvan a meter todos tus datos.
 * No tiene sentido que cuando cierres sesión no se te salga de la aplicación
 * como para volver a iniciar sesión.»*
 *
 * DÓNDE ESTÁ EL LÍMITE DE «FORZAR», Y POR QUÉ HAY UNO
 * ---------------------------------------------------
 * Forzar la cuenta en una instalación nueva: sí, y es lo que hace esto. Pero
 * hay dos casos donde exigirla convertiría la app en un ladrillo, y los dos
 * pasan de verdad:
 *
 *   1. QUIEN YA TENÍA DATOS. Si alguien lleva meses apuntando desde antes de
 *      que hubiera cuentas, plantarle una pantalla que no deja pasar es
 *      quitarle SUS entrenos hasta que se registre. Se le pide la cuenta, se le
 *      explica para qué, y se le deja seguir.
 *   2. SIN COBERTURA. La primera regla del proyecto es que el dato nace en el
 *      móvil porque en el gimnasio no hay red. Una puerta que necesita internet
 *      para abrirse dejaría la app cerrada justo donde se usa. Con sesión ya
 *      guardada no se pregunta nada; y si no la hay y tampoco hay red, se dice
 *      y se deja entrar, que los datos son suyos.
 * ========================================================================== */

/** ¿Toca enseñar la puerta? Solo sin sesión. Con sesión, la app abre y ya. */
async function hayQuePasarPorLaPuerta() {
  if (nube.usuario()) return false;
  if (!(await nube.hayNube())) return false;   // sin Supabase configurado no hay cuentas que pedir
  return true;
}

/**
 * La pantalla de entrada. Ocupa TODO: sin cabecera, sin barra de abajo y sin
 * el mapa de vistas detrás. Que se vea que aquí no hay app todavía.
 */
async function abrirPuerta(alEntrar) {
  const yaHabiaDatos = await ID.hayDatos(db);
  const raiz = document.createElement('div');
  raiz.className = 'puerta';
  raiz.setAttribute('role', 'dialog');
  raiz.setAttribute('aria-modal', 'true');
  raiz.setAttribute('aria-label', 'Entrar en GYM');
  raiz.innerHTML = `
    <div class="puerta-cuerpo">
      <div class="puerta-marca">${icono('pesa', 40)}<span>GYM</span></div>
      <h2 class="puerta-titulo">Lo que levantas, apuntado</h2>
      <p class="puerta-texto">Cada máquina se compara consigo misma, así que la app
        sabe si estás subiendo de verdad o llevas dos meses con el mismo peso.</p>

      <ul class="puerta-lista">
        <li>${icono('nube', 18)}<span><b>Tu cuenta guarda tus entrenos.</b> Si cambias de
          móvil o lo pierdes, entras y vuelven.</span></li>
        <li>${icono('candado', 18)}<span><b>Solo los ves tú.</b> Series, peso y comida no
          los puede leer nadie más — lo decide la base de datos, no la app.</span></li>
        <li>${icono('gente', 18)}<span>Y sirve para lo de fuera: seguir a gente, compartir
          rutinas y las clasificaciones de tu gimnasio.</span></li>
      </ul>

      <div class="puerta-acciones">
        <button class="boton" id="pu-crear">Crear cuenta</button>
        <button class="boton boton-2" id="pu-entrar">Ya tengo cuenta</button>
        ${yaHabiaDatos
          ? `<button class="boton-plano" id="pu-luego">Ahora no · seguir con mis datos</button>`
          : `<button class="boton-plano oculto" id="pu-luego">Entrar sin cuenta</button>`}
      </div>
      <p class="puerta-nota" id="pu-nota" aria-live="polite">${yaHabiaDatos
        ? 'Tus entrenos siguen aquí. La cuenta solo añade la copia y lo de compartir.'
        : ''}</p>
    </div>`;
  document.body.appendChild(raiz);
  document.body.classList.add('con-puerta');

  const cerrar = () => {
    raiz.remove();
    document.body.classList.remove('con-puerta');
  };
  // Se guarda para que «entrar» desde dentro del formulario pueda cerrarla.
  _cerrarPuerta = async () => {
    cerrar();
    if (alEntrar) await alEntrar();
  };

  $('#pu-crear', raiz).onclick = () => abrirCuenta({ modoInicial: 'registro' });
  $('#pu-entrar', raiz).onclick = () => abrirCuenta({ modoInicial: 'entrar' });
  const bLuego = $('#pu-luego', raiz);
  bLuego.onclick = async () => {
    cerrar();
    if (alEntrar) await alEntrar();
  };

  // SIN RED NO SE PUEDE CREAR NINGUNA CUENTA, y la puerta tiene que decirlo en
  // vez de dejar a alguien dándole a un botón que nunca va a contestar. Si
  // además la base está vacía, se abre la salida: es preferible una app usable
  // sin cuenta a una app que no abre.
  if (!navigator.onLine) {
    $('#pu-nota', raiz).textContent = 'Ahora mismo no hay conexión, así que no se puede '
      + 'crear ni comprobar una cuenta. Puedes entrar y hacerlo luego desde Perfil.';
    bLuego.classList.remove('oculto');
    bLuego.textContent = 'Entrar sin conexión';
  }
}

let _cerrarPuerta = null;

/* --------------------------------------------------------------------------
 * LO QUE PASA JUSTO DESPUÉS DE ENTRAR
 *
 * Aquí viven los tres síntomas que contó Carlos, resueltos de una vez:
 *   · el perfil BAJA de la nube (por eso ya no sale sin nombre),
 *   · los datos tienen DUEÑO (por eso entrar con otra cuenta no enseña los
 *     ejercicios de la anterior),
 *   · y si hay copia, se ofrece traerla (por eso «entras y vuelven tus datos»).
 * ------------------------------------------------------------------------ */
async function trasEntrar() {
  const u = nube.usuario();
  if (!u) return;

  const que = await ID.decidir(db, u.id);
  if (que === 'ajeno') {
    const dueno = (await ID.aliasDelDueno(db)) || 'otra cuenta';
    // NO SE BORRA NADA SOLO. Esta es la única operación de la app que se lleva
    // por delante meses de entrenos, así que se pregunta, se dice de quién son
    // y se dice qué pasa si dices que no.
    const seguir = await preguntar(
      `En este móvil hay datos de ${dueno}.\n\n`
      + 'Si sigues, se BORRAN de aquí para dejar sitio a los tuyos. '
      + `Lo que ${dueno} tenga en su copia de la nube no se toca: puede recuperarlo `
      + 'entrando en su cuenta desde cualquier móvil.\n\n'
      + '¿Empezar de cero con tu cuenta?');
    if (!seguir) {
      await nube.salir();
      aviso('Sesión cerrada. Los datos se quedan como estaban', 3400);
      return;
    }
    await ID.empezarDeCero(db, u.id, '');
  }

  // El perfil, de la nube al móvil. Esto es lo que arregla «te sale sin nombre
  // y te hace volver a meterlo».
  const r = await nube.miPerfil();
  if (r.ok) {
    const fundido = ID.fundirPerfil(await db.obtener('perfil', 'yo'), r.perfil);
    await db.guardar('perfil', fundido);
    await ID.marcarDueno(db, u.id, fundido.aliasVisible || fundido.alias || u.email);
  } else {
    await ID.marcarDueno(db, u.id, u.email);
  }

  await recargar();
  // Y la copia vuelve. Sin preguntar si aquí no hay nada que pisar: para eso
  // es la cuenta.
  await ofrecerRestaurar();
}

/**
 * LA COPIA VUELVE SOLA CUANDO NO HAY NADA QUE PISAR.  (3-sep-2026, 0.31.0)
 *
 * Carlos: *«vuelvo a iniciar sesión y me sale un menú superralo de Android
 * feo… y entro y no hay absolutamente nada, todo lo de las máquinas y los pesos
 * está a cero»*.
 *
 * Esto preguntaba SIEMPRE, con un `confirm()` de Android, y se ofrecía UNA vez.
 * En un móvil recién instalado eso es lo peor de los dos mundos: la pregunta no
 * protege nada —no hay nada que perder, la base está vacía— y en cambio un
 * toque en el botón de la izquierda deja la app en cero sin volver a ofrecerlo.
 * La cuenta existe justamente para que al reinstalar vuelvan tus datos; que eso
 * dependa de acertar en un diálogo del sistema es no tener copia.
 *
 * Así que ahora:
 *   · MÓVIL VACÍO → se trae sola, avisando. No hay nada que decidir.
 *   · MÓVIL CON DATOS → se pregunta, porque ahí sí se juntan dos cosas y hay
 *     que saber qué va a pasar. Y se pregunta DENTRO de la app.
 *
 * Con NÚMEROS delante en los dos casos: de cuándo es y cuánto trae.
 */
async function ofrecerRestaurar() {
  const info = await nube.infoCopia();
  if (!info.ok || !info.hay) return;
  // OJO: `hayDatosTuyos`, no `hayDatos`. Los tres gimnasios que la app trae de
  // fábrica no son de nadie, y con `hayDatos` un móvil recién instalado ya
  // contaba como «aquí hay cosas» y se le preguntaba.
  const mias = await ID.hayDatosTuyos(db);
  const cuando = info.actualizado ? new Date(info.actualizado).toLocaleDateString('es-ES') : '';
  const cuantas = Number(info.filas) || 0;

  if (mias) {
    const texto = `Tu cuenta tiene una copia${cuando ? ` del ${cuando}` : ''} con ${cuantas} apuntes.`
      + '\n\nEn este móvil ya hay datos. Si la traes, se JUNTAN: de cada cosa se queda '
      + 'la versión más nueva y no se pierde lo de hoy.'
      + '\n\n¿La traigo?';
    if (!await preguntar(texto, { si: 'Traerla', no: 'Ahora no' })) return;
  } else {
    aviso(`Trayendo tus ${cuantas} apuntes…`, 4000);
  }

  const c = await nube.bajarCopia();
  if (!c.ok || !c.hay) {
    return aviso(`No pude bajar tu copia: ${c.motivo || 'no había copia'}. `
      + 'Está en Ajustes › Copia › Traer la copia', 5000);
  }
  const puesto = await db.restaurar(c.volcado, { modo: 'fusionar' });
  if (!puesto.ok) {
    return aviso(`No pude ponerla: ${puesto.motivo}. Vuelve a intentarlo en Ajustes`, 5000);
  }
  await recargar();
  pintar();
  aviso(`Listo: ${puesto.filas} apuntes recuperados`, 3600);
}

/* --------------------------------------------------------------------------
 * LA COPIA, SOLA, SIN QUE HAYA QUE ACORDARSE
 *
 * Una copia que hay que pedir a mano es una copia que no existe el día que se
 * rompe el móvil. Sube una vez cada 20 h, y solo con sesión y con red.
 * ------------------------------------------------------------------------ */
const CLAVE_MODO_PERSONAL = 'modo_personal';
// El sonido va encendido de fábrica: es la mitad de lo que hace que abrir una
// caja se sienta. Se apaga en Ajustes, y ahí se queda.
const CLAVE_SONIDO = 'sonido';
const CLAVE_ULTIMA_COPIA = 'copia_ultima';
const CLAVE_COPIA_ACTIVA = 'copia_activa';

async function copiaEncendida() {
  const v = await db.ajuste(CLAVE_COPIA_ACTIVA, null);
  return v === null ? true : !!v;   // encendida de fábrica: es para lo que se pide la cuenta
}

/** Sube la copia si toca. `forzar` para el botón de «Copiar ahora». */
async function copiaAutomatica({ forzar = false } = {}) {
  if (!nube.usuario()) return { ok: false, motivo: 'no has entrado en tu cuenta' };
  if (!forzar && !(await copiaEncendida())) return { ok: false, motivo: 'la copia está apagada' };
  if (!navigator.onLine) return { ok: false, motivo: 'no hay conexión' };
  if (!forzar && !ID.tocaCopia(await db.ajuste(CLAVE_ULTIMA_COPIA, 0))) {
    return { ok: false, motivo: 'ya hay una copia de hoy' };
  }
  /* UNA COPIA VACÍA NO PUEDE COMERSE UNA LLENA.  (3-sep-2026, 0.31.0)
   *
   * El camino que casi se lleva por delante los entrenos de Carlos: reinstalas,
   * entras, y si la copia no vuelve —porque el diálogo se contestó que no, o
   * porque en ese momento no había red— el móvil se queda vacío. Un segundo
   * después arranca la copia automática, ve que nunca se ha copiado en este
   * móvil, y SUBE ESE VACÍO encima de lo que sí había en la nube.
   *
   * Un móvil sin nada tuyo no tiene nada que guardar, así que subirlo solo
   * puede hacer daño. Se dice y no se sube — ni siquiera a mano: el botón de
   * «Copiar ahora» tampoco puede servir para borrar la copia sin querer. */
  if (!(await ID.hayDatosTuyos(db))) {
    return { ok: false, motivo: 'todavía no hay nada tuyo que copiar' };
  }
  const volcado = await db.volcar();
  const cuenta = db.contarVolcado(volcado);
  const r = await nube.subirCopia(volcado, { aparato: nombreDelAparato(), filas: cuenta.total });
  if (r.ok) await db.ponAjuste(CLAVE_ULTIMA_COPIA, Date.now());
  return { ...r, filas: cuenta.total };
}

/* --------------------------------------------------------------------------
 * Y LA COPIA TAMBIÉN SALE CUANDO DEJAS LA APP.  (3-sep-2026, 0.31.0)
 *
 * Carlos, contando lo que hace: abre la app, da de alta un gimnasio con sus
 * máquinas, y al rato desinstala para poner la versión nueva. Con la copia solo
 * una vez cada 20 h, **todo eso no había subido a ninguna parte**: la copia de
 * la nube seguía siendo la de ayer y lo de esta tarde se iba con la app.
 *
 * El momento en que dejas de mirar la pantalla es el último aviso que hay de
 * que igual no vuelves. Ahí se sube, pero solo si hace falta: con sesión, con
 * red, con la copia encendida, si HAY algo sin copiar y si no se acaba de
 * copiar hace nada (subir el volcado entero cada vez que sales de la app sería
 * gastarle los datos a Carlos por nada).
 * ------------------------------------------------------------------------ */
const ENTRE_COPIAS_AL_SALIR = 5 * 60 * 1000;

/** ¿Hay algo apuntado después de la última copia? */
async function hayCambiosSinCopiar() {
  const ultima = Number(await db.ajuste(CLAVE_ULTIMA_COPIA, 0)) || 0;
  if (!ultima) return true;                       // nunca se ha copiado nada
  const cambios = await db.cambiosDesde(ultima);
  return Object.values(cambios).some((f) => f && f.length);
}

async function copiaAlSalir() {
  if (!nube.usuario() || !navigator.onLine) return;
  if (!(await copiaEncendida())) return;
  const ultima = Number(await db.ajuste(CLAVE_ULTIMA_COPIA, 0)) || 0;
  if (ultima && Date.now() - ultima < ENTRE_COPIAS_AL_SALIR) return;
  if (!(await hayCambiosSinCopiar())) return;
  await copiaAutomatica({ forzar: true });
}

/** Un nombre corto del móvil, para poder decir «la copia es del otro». */
function nombreDelAparato() {
  const ua = String(navigator.userAgent || '');
  const m = ua.match(/\(Linux; Android [^;]+; ([^)]+?)(?: Build|\))/);
  if (m && m[1]) return m[1].trim().slice(0, 40);
  if (/Android/.test(ua)) return 'Android';
  if (/iPhone|iPad/.test(ua)) return 'iPhone';
  return 'Navegador';
}

/**
 * Cerrar sesión — y salir de verdad.
 *
 * Carlos: *«no tiene sentido que cuando cierres sesión no se te salga de la
 * aplicación como para volver a iniciar sesión»*. Antes esto borraba el testigo
 * y dejaba la app abierta con el perfil de la persona anterior en pantalla, que
 * es exactamente lo que vio: cerró la sesión de su novia y seguía saliendo ella.
 *
 * Los datos NO se borran aquí. Se quedan con su dueño puesto, así que si vuelve
 * a entrar la misma persona los encuentra tal cual, y si entra otra se le
 * pregunta antes de tocar nada (`trasEntrar`).
 */
async function cerrarSesion() {
  const copia = await db.ajuste(CLAVE_ULTIMA_COPIA, 0);
  const sinCopia = !copia;
  if (!await preguntar('¿Cerrar la sesión?\n\n'
    + 'Vuelves a la pantalla de entrada. Lo que has apuntado se queda en este móvil'
    + (sinCopia ? ', pero TODAVÍA NO HAY COPIA en la nube.' : ' y en tu copia de la nube.')
    + '\n\nCuando vuelvas a entrar con esta cuenta, lo tendrás todo igual.')) return;

  // Se intenta una última copia antes de salir: es el momento exacto en el que
  // alguien deja de usar este móvil, y perder el último día por no haber
  // esperado tres segundos sería tonto. Si no hay red, da igual y se sale.
  if (await copiaEncendida()) await copiaAutomatica({ forzar: true });

  // La última posición conocida es de quien la dio: quien entre después no la
  // hereda.
  geo.olvidarDonde();
  await nube.salir();
  cerrarHojas();
  // Y LA APP DE DETRÁS DEJA DE ENSEÑAR A QUIEN SE HA IDO. Sin esto, debajo de
  // la pantalla de entrada seguía dibujado el perfil de la persona anterior
  // —con su nombre y sus iniciales—, y bastaba con darle a «Ahora no» para
  // aterrizar otra vez en él. Es la misma queja de Carlos («cerré sesión y
  // seguía saliendo Aria Elías») por la puerta de atrás.
  S.vista = 'entrenar';
  await recargar();
  pintar();
  aviso('Sesión cerrada');
  await abrirPuerta(async () => {
    await recargar();
    pintar();
  });
}
