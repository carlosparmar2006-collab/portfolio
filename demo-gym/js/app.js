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
import * as fotos from './fotos.js';
import * as N from './nutricion.js';
import * as C from './comida.js';
import * as P from './plan.js';
// OJO: se llama `geo` y no `mapa` porque más abajo ya hay un ayudante local
// `mapa()` que convierte listas en Map. Llamarlo igual rompía toda la app con
// «Identifier 'mapa' has already been declared».
import * as geo from './mapa.js';

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
  cache: { gimnasios: [], maquinas: [], series: [], sesiones: [], rutinas: [],
           alimentos: [], comidas: [], objetivos: [], pesos: [], platos: [],
           vinculos: [], momentos: [] },
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
         pesos, platos, vinculos, momentos] =
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
    ]);
  // Las rutinas mandan en el orden en que se rotan: se ordenan SIEMPRE por
  // `orden` (las que vengan de una base vieja, sin él, van al final por nombre).
  // Las rutinas mandan en el orden en que se rotan: se ordenan SIEMPRE por
  // `orden` (ver plan.js). Las de una base vieja, sin él, van al final.
  S.cache = { gimnasios, maquinas, series, sesiones, rutinas: P.ordenar(rutinas),
              alimentos, comidas, objetivos, pesos, platos, vinculos, momentos };
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
function comprimir(archivo, maxLado = 900, calidad = 0.75) {
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
      c.toBlob((b) => (b ? res(b) : rej(new Error('no pude comprimir'))), 'image/jpeg', calidad);
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

function limpiarUrls() {
  for (const u of S.urlsBlob) URL.revokeObjectURL(u);
  S.urlsBlob.clear();
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
    fondo.remove();
    document.body.style.overflow = '';
  };
  const hayTrabajo = () => {
    try { return !!(opciones.hayTrabajo && opciones.hayTrabajo()); } catch { return false; }
  };
  fondo.addEventListener('click', (e) => {
    const esFondo = e.target === fondo;
    const esBoton = e.target.hasAttribute('data-cerrar');
    if (!esFondo && !esBoton) return;
    if (!hayTrabajo()) return cerrar();
    // Un toque en el fondo con trabajo dentro NO cierra: se avisa y punto. Que
    // haya que apuntar a un botón de 44 px para tirar diez minutos de trabajo
    // es exactamente la fricción que hace falta aquí.
    if (esFondo) return aviso('Toca «Cerrar» si de verdad quieres salir', 2400);
    if (confirm(`${opciones.avisoSalir || 'Vas a perder lo que has metido aquí.'}\n\n¿Salir igualmente?`)) cerrar();
  });
  document.body.appendChild(fondo);
  document.body.style.overflow = 'hidden';
  if (alMontar) alMontar($('.hoja-cuerpo', fondo), cerrar);
  return cerrar;
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
  const { rutina, elegida } = rutinaDeHoy();
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
            <span class="dia-cuantas">${planDe(r).length} ejercicios</span>
          </button>
          <button class="boton-plano" data-renombrar="${r.id}" aria-label="Renombrar ${esc(r.nombre)}">${icono('lapiz', 18)}</button>
          <button class="boton-plano" data-borrar-dia="${r.id}" aria-label="Borrar ${esc(r.nombre)}">${icono('papelera', 18)}</button>
        </div>`).join('');

      $$('[data-dia]', cuerpo).forEach((b) => (b.onclick = async () => {
        await fijarRutinaDeHoy(b.dataset.dia);
        cerrar();
        pintar();
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
        if (!confirm(`¿Borrar el día «${r.nombre}»? Las series apuntadas NO se tocan.`)) return;
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
function abrirEditorPlan(rutinaId) {
  const rutina = S.cache.rutinas.find((r) => r.id === rutinaId);
  if (!rutina) return;
  let plan = planDe(rutina).map((p) => ({ ...p }));
  // Solo se pregunta al salir si de verdad se ha tocado algo. Preguntar siempre
  // enseña a decir «sí» sin leer, y entonces el aviso deja de proteger nada.
  let tocado = false;
  const porId = mapa(S.cache.maquinas);

  hoja(
    `Editar ${rutina.nombre}`,
    `<div id="plan-lista"></div>
     <div class="botonera"><button class="boton boton-2" id="plan-anadir">+ Añadir máquina</button></div>
     <button class="boton" id="plan-guardar">Guardar el día</button>`,
    (cuerpo, cerrar) => {
      const lista = $('#plan-lista', cuerpo);

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
              </div>
              <button class="boton-plano" data-quita="${i}" aria-label="Quitar">${icono('cerrar', 18)}</button>
            </div>`;
        }).join('');

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
        const dentro = new Set(plan.map((p) => p.maquinaId));
        const libres = S.cache.maquinas
          .filter((m) => m.gimnasioId === S.gimnasioId && !dentro.has(m.id))
          .sort((a, b) => a.nombre.localeCompare(b.nombre));
        if (!libres.length) {
          aviso('Ya están todas las máquinas de este gimnasio');
          return;
        }
        hoja(
          'Añadir al día',
          `<div class="lista">${libres.map((m) => `
             <button class="elige-maquina" data-add="${m.id}">
               <span>${esc(m.nombre)}</span>
               <span class="elige-grupo">${esc((D.GRUPOS.find((g) => g.id === m.grupo) || {}).nombre || '')}</span>
             </button>`).join('')}</div>`,
          (c2, cerrar2) => {
            $$('[data-add]', c2).forEach((b) => (b.onclick = () => {
              plan.push({ maquinaId: b.dataset.add, ...PLAN_POR_DEFECTO });
              tocado = true;
              cerrar2();
              pintarLista();
            }));
          }
        );
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
    <h3 class="seccion-titulo">Todas las máquinas</h3>
    <div class="chips">${chips}</div>
    <input class="buscador" type="search" placeholder="Buscar máquina…" value="${esc(S.busqueda)}" id="buscador">
    <div class="lista" id="lista-maquinas"></div>
    <div class="botonera" style="margin-top:18px">
      <button class="boton" id="del-catalogo">+ Añadir del catálogo</button>
    </div>
    <div class="botonera" style="margin-top:8px">
      <button class="boton boton-2" id="nueva-maquina">Crear una a mano</button>
    </div>
    <div style="margin-top:10px"><button class="boton-plano" id="marcar-dia" style="width:100%">
      ${sesionHoyExcluida() ? 'Hoy está marcado como día flojo (no cuenta)' : 'Marcar hoy como día flojo'}
    </button></div>`;

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
  $('#nueva-maquina', raiz).onclick = () => editarMaquina(null);
  $('#del-catalogo', raiz).onclick = abrirCatalogo;
  $('#marcar-dia', raiz).onclick = alternarDiaFlojo;
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
  if (src) return `<img class="ej-foto" src="${src}" alt="" loading="lazy" decoding="async">`;
  if (!m.icono) return icono('camara', 26);
  return `<span class="maquina-pict" style="color:${cat.COLOR_GRUPO[m.grupo] || 'var(--texto-2)'}">${
    cat.pictograma(m.icono)
  }</span>`;
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
    `Catálogo · ${gim.nombre}`,
    `
    <p class="campo-nota" style="margin-top:0">
      Toca las que tengas en este gimnasio y añádelas todas de una vez. Luego, si
      quieres, les haces la foto real desde su ficha.</p>
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
      <button class="contador-boton" data-p="-">−</button>
      <div class="contador-valor">
        <input class="contador-numero" id="c-peso" type="number" inputmode="decimal" step="any">
        <div class="contador-unidad">${unidad}</div>
      </div>
      <button class="contador-boton" data-p="+">+</button>
    </div>

    <div class="contador-etiqueta" style="margin-top:14px">Repeticiones</div>
    <div class="contador">
      <button class="contador-boton" data-r="-">−</button>
      <div class="contador-valor">
        <input class="contador-numero" id="c-reps" type="number" inputmode="numeric" step="1">
        <div class="contador-unidad">reps</div>
      </div>
      <button class="contador-boton" data-r="+">+</button>
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
      };

      $('#guardar-serie', cuerpo).onclick = async () => {
        await guardar();
        cerrar();
        aviso(`Guardado: ${D.formatearPeso(peso, unidad)} × ${reps}`);
        pintar();
      };
      $('#guardar-otra', cuerpo).onclick = async () => {
        await guardar();
        aviso(`Serie guardada · ${D.formatearPeso(peso, unidad)} × ${reps}`, 1300);
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
           <span class="ficha-sinfoto-img"><img class="ej-foto" src="${cat.rutaFoto(m.nombre)}" alt="" loading="lazy"></span>
           <div class="ficha-sinfoto-texto">
             Foto de ejemplo. Si tu máquina es distinta, hazle una foto y la reconocerás de un vistazo.
           </div>
         </div>`
      : ''}

    <div class="ficha" id="ej-tecnica">
      <h3 class="ficha-titulo">Cómo se hace</h3>
      <div class="cargando">Buscando los pasos…</div>
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
    <div class="campo">
      <label>Foto de la máquina</label>
      <div id="previa" style="margin-bottom:8px"></div>
      <button class="boton boton-2" id="btn-foto" type="button">${icono('camara')} Hacer o elegir foto</button>
      <input type="file" id="f-foto" accept="image/*" capture="environment" class="oculto">
    </div>
    <button class="boton" id="f-guardar">${m ? 'Guardar cambios' : 'Crear máquina'}</button>
    ${m ? '<div class="botonera"><button class="boton boton-peligro" id="f-borrar">Borrar máquina</button></div>' : ''}`,
    (cuerpo, cerrar) => {
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
          if (!confirm(`¿Borrar "${m.nombre}" y su historial?`)) return;
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

    <h3 class="seccion-titulo">Evolución por máquina</h3>
    <div class="campo"><select id="sel-maquina" aria-label="Máquina"></select></div>
    <div class="ficha"><div id="g-maquina"></div></div>
    <div class="analisis" id="metricas"></div>

    <h3 class="seccion-titulo">Atención: estancadas</h3>
    <div id="estancadas"></div>

    <h3 class="seccion-titulo">De propina</h3>
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
  const sel = $('#sel-maquina', raiz);
  sel.innerHTML = conDatos.length
    ? conDatos.map((m) => `<option value="${m.id}" ${m.id === S.maquinaGrafica ? 'selected' : ''}>${esc(m.nombre)}</option>`).join('')
    : '<option>— sin datos en este periodo —</option>';

  const pintarMaquina = () => {
    const m = conDatos.find((x) => x.id === sel.value) || conDatos[0];
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
        extra: `${p.nSeries} serie(s) · mejor × ${p.repsMejor}`,
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
  sel.onchange = pintarMaquina;
  pintarMaquina();

  // --- estancadas ---
  const est = D.estancadas(maquinas, spm);
  const ce = $('#estancadas', raiz);
  ce.innerHTML = est.length
    ? ''
    : '<p class="grafica-vacia">Nada estancado. O eso, o todavía faltan datos.</p>';
  for (const e of est.slice(0, 8)) {
    const d = document.createElement('div');
    d.className = 'ficha';
    d.style.padding = '12px 14px';
    d.innerHTML = `<div style="display:flex;justify-content:space-between;gap:10px;align-items:center">
      <div><div style="font-weight:650">${esc(e.maquina.nombre)}</div>
      <div style="font-size:.85rem;color:var(--texto-2)">Tu mejor peso sigue siendo ${D.formatearPeso(
        e.mejorUnidad,
        e.unidad
      )} desde hace ${e.semanas} semanas</div></div>
      <span class="badge badge-estancada">${e.semanas} sem.</span></div>`;
    ce.appendChild(d);
  }

  // --- volumen: anecdótico. Un número, y la gráfica solo si la pide ---------
  const vol = D.evolucionVolumen(series, mPorId, sesPorId, rango.periodo);
  const total = vol.reduce((n, v) => n + v.volumen, 0);
  $('#vol-total', raiz).textContent = `${Math.round(total).toLocaleString('es-ES')} kg`;
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
 * Tres de fábrica y uno suyo. Las muestras que se ven en Ajustes llevan los
 * colores REALES del tema (no una aproximación bonita): así lo que se elige es
 * lo que se ve después.
 */
const TEMAS = [
  { id: 'oscuro', nombre: 'Oscuro', fondo: '#0e1116', borde: '#2a313c', acento: '#3987e5', texto: '#f2f5f9' },
  { id: 'claro', nombre: 'Claro', fondo: '#f4f6f9', borde: '#dde2e9', acento: '#2a78d6', texto: '#0f141b' },
  { id: 'rosa', nombre: 'Rosa', fondo: '#14090f', borde: '#3f2434', acento: '#ff9ec7', texto: '#fdf1f7' },
  { id: 'propio', nombre: 'El tuyo', fondo: '#171b22', borde: '#2a313c', acento: '#8b5cf6', texto: '#f2f5f9' },
];

const PROPIO_POR_DEFECTO = { acento: '#8b5cf6', base: 'oscuro' };

async function temaPropio() {
  const g = await db.ajuste('tema_propio', null);
  return { ...PROPIO_POR_DEFECTO, ...(g || {}) };
}

/**
 * Luminancia relativa (WCAG). Se calcula, no se mira: elegir a ojo si un botón
 * necesita letra blanca o negra es exactamente cómo salen los botones
 * ilegibles. Con el rosa de JARVIS (#ff9ec7), el blanco da 1,9:1 — ilegible —
 * y la tinta oscura 12:1.
 */
function luminancia(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
  if (!m) return 0;
  const n = parseInt(m[1], 16);
  const canal = (c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * canal((n >> 16) & 255) + 0.7152 * canal((n >> 8) & 255) + 0.0722 * canal(n & 255);
}

function rgbaDe(hex, alfa) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
  if (!m) return `rgba(57,135,229,${alfa})`;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alfa})`;
}

/**
 * Pone el tema en el documento. `propio` solo pinta cuando el tema es el suyo:
 * si no, un acento en línea se quedaría pegado al cambiar a «Claro» y el tema
 * de fábrica saldría con el color de otro.
 */
function aplicarTema(id, propio) {
  const raiz = document.documentElement;
  raiz.dataset.tema = id;
  raiz.style.removeProperty('--acento');
  raiz.style.removeProperty('--acento-tinta');
  raiz.style.removeProperty('--acento-suave');
  if (id !== 'propio') {
    raiz.removeAttribute('data-base');
  } else {
    const p = { ...PROPIO_POR_DEFECTO, ...(propio || {}) };
    raiz.dataset.base = p.base;
    raiz.style.setProperty('--acento', p.acento);
    raiz.style.setProperty('--acento-tinta', luminancia(p.acento) > 0.42 ? '#101418' : '#ffffff');
    raiz.style.setProperty('--acento-suave', rgbaDe(p.acento, 0.16));
  }
  // La barra del sistema en Android coge este color; sin actualizarlo, el móvil
  // sigue enseñando una franja del tema anterior encima de la app.
  const meta = document.querySelector('meta[name="theme-color"]');
  const t = TEMAS.find((x) => x.id === id);
  if (meta && t) {
    meta.content = id === 'propio'
      ? (propio && propio.base === 'claro' ? '#f4f6f9' : '#0e1116')
      : t.fondo;
  }
}

/* ========================================================================== *
 * VISTA: GIMNASIOS
 * ========================================================================== */
function pintarGimnasios(raiz) {
  raiz.innerHTML = `<div class="lista" id="lista-gyms"></div>
    <div class="botonera"><button class="boton" id="nuevo-gym">+ Añadir gimnasio</button></div>`;
  const cont = $('#lista-gyms', raiz);
  if (!S.cache.gimnasios.length) cont.innerHTML = '<div class="vacio"><p>Sin gimnasios todavía.</p></div>';

  for (const g of S.cache.gimnasios) {
    const nMaq = S.cache.maquinas.filter((m) => m.gimnasioId === g.id).length;
    const nSer = S.cache.series.filter((s) => s.gimnasioId === g.id).length;
    const d = document.createElement('div');
    d.className = 'ficha';
    d.innerHTML = `
      <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start">
        <div style="min-width:0">
          <div style="font-weight:700;font-size:1.05rem">${esc(g.nombre)}</div>
          <div style="font-size:.86rem;color:var(--texto-2)">${esc(g.direccion || '')}</div>
          <div style="font-size:.82rem;color:var(--texto-tenue);margin-top:4px">${nMaq} máquinas · ${nSer} series</div>
        </div>
        <button class="boton-plano" data-editar-gym="${g.id}">Editar</button>
      </div>`;
    cont.appendChild(d);
  }
  $$('[data-editar-gym]', raiz).forEach((b) => (b.onclick = () => editarGimnasio(b.dataset.editarGym)));
  $('#nuevo-gym', raiz).onclick = () => editarGimnasio(null);
}

function editarGimnasio(gimnasioId) {
  const g = gimnasioId ? S.cache.gimnasios.find((x) => x.id === gimnasioId) : null;
  hoja(
    g ? 'Editar gimnasio' : 'Nuevo gimnasio',
    `
    <div class="campo"><label for="g-nombre">Nombre</label>
      <input type="text" id="g-nombre" placeholder="Ej.: VivaGym Reus" value="${esc(g ? g.nombre : '')}"></div>
    <div class="campo"><label for="g-dir">Dirección</label>
      <input type="text" id="g-dir" placeholder="Calle, ciudad" value="${esc(g ? g.direccion || '' : '')}"></div>
    <button class="boton boton-2" id="g-buscar" type="button">${icono('lupa')} Buscar en el mapa</button>
    <p style="font-size:.8rem;color:var(--texto-tenue);margin:6px 2px 0">
      Truco: si añades el código postal, lo clava. Sin él puede proponerte una
      calle del mismo nombre en otro pueblo — por eso te enseña la dirección
      entera y el mapa, para que confirmes tú.</p>
    <div id="g-resultados" style="margin-top:8px"></div>
    <div id="g-mapa" style="margin-top:8px"></div>
    <button class="boton" id="g-guardar" style="margin-top:12px">${g ? 'Guardar' : 'Crear'}</button>
    ${g ? '<div class="botonera"><button class="boton boton-peligro" id="g-borrar">Borrar gimnasio</button></div>' : ''}`,
    (cuerpo, cerrar) => {
      // ── mapa: confirmar que la dirección es la buena ──────────────────────
      let elegido = (g && Number.isFinite(g.lat)) ? { lat: g.lat, lon: g.lon } : null;
      const cajaMapa = $('#g-mapa', cuerpo);
      const cajaRes = $('#g-resultados', cuerpo);
      if (elegido) geo.pintarMapa(cajaMapa, elegido.lat, elegido.lon);

      $('#g-buscar', cuerpo).onclick = async () => {
        const nombre = $('#g-nombre', cuerpo).value.trim();
        const dir = $('#g-dir', cuerpo).value.trim();
        if (!nombre && !dir) return aviso('Escribe el nombre o la dirección');

        cajaRes.innerHTML = '<p class="mapa-vacio">Buscando…</p>';
        const res = await geo.buscarGimnasio(nombre, dir);
        if (!res.length) {
          cajaRes.innerHTML =
            '<p class="mapa-vacio">No encontré esa dirección (o no hay cobertura ahora). ' +
            'Puedes escribirla a mano igualmente.</p>';
          return;
        }
        cajaRes.innerHTML = '';
        for (const r of res) {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'sitio';
          // Se enseña la dirección COMPLETA a propósito: es la única forma de
          // que Carlos detecte que el sitio propuesto es del pueblo de al lado.
          b.innerHTML = `<b>${esc(r.titulo)}</b><span>${esc(r.completa)}</span>`;
          b.onclick = () => {
            elegido = { lat: r.lat, lon: r.lon };
            $('#g-dir', cuerpo).value = r.direccion;
            $$('.sitio', cajaRes).forEach((x) => x.setAttribute('aria-pressed', x === b));
            geo.pintarMapa(cajaMapa, r.lat, r.lon);
          };
          cajaRes.appendChild(b);
        }
        // Si solo hay uno, se elige solo: un toque menos.
        if (res.length === 1) cajaRes.firstChild.click();
      };

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
          if (!confirm(`¿Borrar "${g.nombre}" con sus ${nMaq} máquinas y su historial?`)) return;
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
  return `
    <div class="anillo ${pct > 1 ? 'anillo-pasado' : ''}">
      <svg viewBox="0 0 128 128" aria-hidden="true">
        <circle class="anillo-carril" cx="64" cy="64" r="${R}" />
        <circle class="anillo-relleno" cx="64" cy="64" r="${R}"
          stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${(C * (1 - dentro)).toFixed(1)}" />
        ${pasado > 0
          ? `<circle class="anillo-exceso" cx="64" cy="64" r="${R}"
               stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${(C * (1 - pasado)).toFixed(1)}" />`
          : ''}
      </svg>
      <div class="anillo-centro">
        <span class="nut-kcal">${consumido.toLocaleString('es-ES')}</span>
        <span class="nut-kcal-obj">de ${objetivo.toLocaleString('es-ES')} kcal</span>
      </div>
    </div>`;
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
          if (confirm(`${motivo}\n\n¿Le hacemos una foto a la etiqueta?`)) abrirEtiqueta(alTenerCodigo, c);
          return;
        }
        const ficha = fichaDeProducto(r.producto);
        if (!ficha) {
          cerrar();
          if (confirm('Ese producto está pero SIN tabla nutricional.\n\n¿Le hacemos una foto a la etiqueta?')) {
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

  raiz.innerHTML = `
    <div class="ficha">
      <h3 class="ficha-titulo">Sincronizar con el PC</h3>
      <p style="color:var(--texto-2);font-size:.89rem;margin-top:0">
        Apuntas en el gimnasio aunque no haya cobertura. Cuando el móvil vuelve a la WiFi
        de casa, esto lo manda al PC y JARVIS ya puede analizarlo.</p>
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
    </div>

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
      </div>
      <div class="propio ${tema === 'propio' ? '' : 'oculto'}" id="zona-propio">
        <div class="propio-fila">
          <label for="a-color">Tu color</label>
          <input type="color" id="a-color" value="${esc(propio.acento)}">
        </div>
        <div class="chips" style="margin-top:8px">
          <button class="chip" data-base="oscuro" aria-pressed="${propio.base === 'oscuro'}">Sobre oscuro</button>
          <button class="chip" data-base="claro" aria-pressed="${propio.base === 'claro'}">Sobre claro</button>
        </div>
        <p class="nut-media" style="margin-bottom:0">Los colores de las <b>gráficas</b> no
          cambian: están elegidos para que se distingan también con daltonismo y con el
          móvil al sol. Lo que eliges aquí es el color de los botones y los detalles.</p>
      </div>
    </div>

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

    <p style="text-align:center;color:var(--texto-tenue);font-size:.8rem">GYM · para JARVIS · v0.8.0</p>`;

  $('#a-probar', raiz).onclick = async () => {
    const url = $('#a-url', raiz).value.trim();
    await sync.configurar({ url, token: $('#a-token', raiz).value.trim() });
    $('#a-estado', raiz).textContent = 'Probando…';
    const r = await sync.probar(url);
    $('#a-estado', raiz).innerHTML = r.ok
      ? `<span class="estado-sync ok">Conectado con ${esc(r.servidor)}</span>`
      : `<span class="estado-sync pendiente">Sin conexión: ${esc(r.motivo)}</span>`;
  };
  $('#a-sync', raiz).onclick = async () => {
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
  $('#a-buscar', raiz).onclick = async () => {
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
        ¿Está el PC encendido y en la misma WiFi? Pregúntale a JARVIS
        «dime todas las IPs» y ponla a mano arriba.</p>`;
      return;
    }
    $('#a-url', raiz).value = r.url;
    zona.innerHTML = `<p class="nut-media">Encontrado en <b>${esc(r.url)}</b>
      ${r.servidor ? `(${esc(r.servidor)})` : ''}. Ya está guardado.</p>`;
    aviso('PC encontrado y guardado');
    await mostrarDirecciones(raiz);
  };

  mostrarDirecciones(raiz);


  $$('[data-tema]', raiz).forEach(
    (b) =>
      (b.onclick = async () => {
        aplicarTema(b.dataset.tema, await temaPropio());
        await db.ponAjuste('tema', b.dataset.tema);
        pintar();
      })
  );

  // El color propio se aplica MIENTRAS se arrastra el selector (`oninput`), no
  // al soltarlo: elegir un color sin ver el resultado es elegir a ciegas.
  const iColor = $('#a-color', raiz);
  if (iColor) {
    const guardar = async (cambios) => {
      const nuevo = { ...(await temaPropio()), ...cambios };
      await db.ponAjuste('tema_propio', nuevo);
      await db.ponAjuste('tema', 'propio');
      aplicarTema('propio', nuevo);
      return nuevo;
    };
    iColor.oninput = () => aplicarTema('propio', { ...propio, acento: iColor.value });
    iColor.onchange = async () => {
      await guardar({ acento: iColor.value });
      pintar();
    };
    $$('[data-base]', raiz).forEach((b) => (b.onclick = async () => {
      await guardar({ base: b.dataset.base, acento: iColor.value });
      pintar();
    }));
  }
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
  $('#a-exportar', raiz).onclick = exportar;
  $('#a-ejemplo', raiz).onclick = async () => {
    await sembrarGimnasios();
    await recargar();
    aviso('Gimnasios cargados');
    pintar();
  };
  $('#a-borrar', raiz).onclick = async () => {
    if (!confirm('¿Borrar TODOS los datos del móvil? No se puede deshacer.')) return;
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
const VISTAS = {
  entrenar: { titulo: 'Entrenar', pintar: pintarEntrenar },
  progreso: { titulo: 'Progreso', pintar: pintarProgreso },
  nutricion: { titulo: 'Nutrición', pintar: pintarNutricion },
  gimnasios: { titulo: 'Gimnasios', pintar: pintarGimnasios },
  ajustes: { titulo: 'Ajustes', pintar: pintarAjustes },
};

function irA(vista) {
  S.vista = vista;
  pintar();
}

export function pintar() {
  limpiarUrls();
  const v = VISTAS[S.vista] || VISTAS.entrenar;

  const sel = $('#gym-selector');
  if (sel) {
    sel.innerHTML = S.cache.gimnasios.map((g) => `<option value="${g.id}" ${g.id === S.gimnasioId ? 'selected' : ''}>${esc(g.nombre)}</option>`).join('');
    sel.classList.toggle('oculto', S.vista !== 'entrenar' && S.vista !== 'progreso');
  }
  $('#titulo-vista').textContent = v.titulo;

  const raiz = $('#vista');
  raiz.innerHTML = '';
  v.pintar(raiz);

  $$('.nav-boton').forEach((b) => {
    if (b.dataset.vista === S.vista) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
  window.scrollTo(0, 0);
}

export async function arrancar() {
  await db.abrir();
  // El catálogo (1.365 ejercicios) se carga ANTES de pintar: si llegara tarde,
  // la primera pintada saldría sin figuras y luego «saltarían» al aparecer.
  await cat.cargar();
  aplicarTema((await db.ajuste('tema', 'oscuro')) || 'oscuro', await temaPropio());

  if (!(await db.todos('gimnasios')).length) await sembrarGimnasios();
  await sembrarRutinas();
  // SIN `if`, y esa es la corrección. Antes solo sembraba con el almacén vacío,
  // así que a quien ya tenía alimentos (o sea, a Carlos) no le llegaba nunca
  // una ampliación de la base. `sembrarAlimentos` es idempotente y solo escribe
  // lo que de verdad cambia, así que se puede llamar en cada arranque.
  await sembrarAlimentos();
  await recargar();

  $$('.nav-boton').forEach((b) => (b.onclick = () => irA(b.dataset.vista)));
  const sel = $('#gym-selector');
  sel.onchange = async () => {
    S.gimnasioId = sel.value;
    await db.ponAjuste('ultimo_gym', S.gimnasioId);
    pintar();
  };

  sync.alCambiarEstado((e) => {
    const chip = $('#estado-sync');
    if (!chip) return;
    if (e.estado === 'ok') {
      chip.className = 'estado-sync ok';
      chip.textContent = 'sincronizado';
      setTimeout(() => (chip.textContent = ''), 2600);
    } else if (e.estado === 'pendiente') {
      chip.className = 'estado-sync pendiente';
      chip.textContent = 'sin PC';
    }
  });

  pintar();
  sync.automatico();
  procesarFotosPendientes();
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
