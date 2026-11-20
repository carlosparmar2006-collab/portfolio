/* =============================================================================
 * vestuario.js — La pantalla del vestuario: las cajas, la colección y la
 * tienda. Y la escena de abrir una caja, que es la que tiene que engancharse.
 *
 * Carlos, 3-sep-2026: *«cuando le des, salga como una línea selectora y fuese
 * rotando los diferentes cosméticos (…) cúrratela que esté guapo así, rollo un
 * juego, que tenga animaciones (…) no me hagas una animación de mierda»*.
 *
 * POR QUÉ ESTO NO VIVE EN `app.js`
 * --------------------------------
 * `app.js` va por las 10.000 líneas y es la pantalla ENTERA de la app. El
 * vestuario es una pantalla con su propia escena, sus tiempos y su sonido: si
 * se mete ahí, en dos sesiones nadie sabe dónde empieza. Aquí entra con un
 * PUENTE (`ctx`): la app le pasa sus cuatro utilidades (pintar una hoja, un
 * aviso, un icono, guardar) y este fichero no sabe nada más de ella.
 *
 * CÓMO SE CONSTRUYE UNA ESCENA QUE ENGANCHE (y no es el confeti)
 * -------------------------------------------------------------
 * 1. **Se hace esperar, pero poco.** Tres segundos de cinta es lo que dura la
 *    tensión; a los cinco es un peaje. Y a la tercera caja seguida se puede
 *    saltar tocando, porque quien abre diez no quiere ver diez veces lo mismo.
 * 2. **La cinta frena de verdad.** Una curva que va perdiendo velocidad (y un
 *    tic por pieza que pasa) es lo que hace creer que el resultado se está
 *    decidiendo ahí. Está decidido ANTES —lo decide `cajas.js`, que es quien se
 *    puede probar—, pero la cinta se dibuja para que termine justo ahí.
 * 3. **La rareza se anuncia antes de leerla**: el color del fogonazo, el número
 *    de rayos, cuánto tiembla la pantalla y el acorde. Cuando por fin se lee
 *    «Legendario», ya se sabía.
 * 4. **Nada de esto es obligatorio.** Con `prefers-reduced-motion` no hay cinta
 *    ni temblor: la pieza aparece y ya. Y sin sonido, también funciona.
 *
 * LO QUE AQUÍ NO SE DECIDE: qué toca. Eso es `cajas.js`, y se prueba en Node.
 * Esta pantalla solo lo enseña.
 * ========================================================================== */

import * as COS from './cosmeticos.js';
import * as CAJ from './cajas.js';
import * as SON from './sonido.js';
import * as MOT from './motor.js';

const $ = (sel, raiz = document) => raiz.querySelector(sel);
const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];

function esc(t) {
  return String(t ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function menosMovimiento() {
  try {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  } catch { return false; }
}

/** El número con puntos de millar: 12.400 se lee, 12400 se cuenta. */
export function numero(n) {
  return new Intl.NumberFormat('es-ES').format(Math.round(n || 0));
}

/* --------------------------------------------------------------------------
 * EL MAGNESIO — la moneda.
 *
 * Es el polvo blanco del bote de la sala, el que se echa en las manos antes de
 * una serie fuerte para que no resbale la barra. Se llama así porque es lo que
 * hay en un gimnasio de verdad; una moneda con nombre de fantasía habría
 * chocado con una app que va de hierro y de días que has ido a entrenar.
 *
 * TERCER ICONO (4-sep-2026). Carlos: *«cambia el icono del magnesio, que es
 * horrible ahora, parece una caja de mierda»*. Y tenía razón otra vez: la
 * «bolsita con cordel» de la 0.32.0 era un trapecio con una línea arriba, y a
 * 18 px un trapecio es un cubo. Con eso, el precio de una caja quedaba escrito
 * en cajas — que es exactamente lo que ya se había arreglado una vez.
 *
 * AHORA ES LA BOLA DE MAGNESIO: la de malla que hay en cualquier bote de la
 * sala. Se eligió por la SILUETA, que es lo único que queda a 18 px: **un
 * círculo se lee como moneda**, que es lo que tiene que parecer una moneda.
 *
 * Y la malla no es adorno. El primer intento de esta bola llevaba un nudo en
 * pico arriba y a 24 px, dentro de un botón que pone «Comprar», eso se leía
 * como una BOMBA con su mecha. Ahora el remate de arriba es una atadura PLANA
 * y la bola va cruzada por la red — dos rectas y dos arcos—, que es lo que la
 * ata a lo que es. Las tres motas de polvo dicen de qué está hecha.
 * ------------------------------------------------------------------------ */
export function magnesioSVG(tam = 18) {
  return `<svg viewBox="0 0 24 24" width="${tam}" height="${tam}" aria-hidden="true"
    class="mg-icono" fill="none" stroke="currentColor" stroke-width="1.5"
    stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="13.8" r="7" fill="currentColor" opacity=".2" stroke="none"/>
    <circle cx="12" cy="13.8" r="7" stroke-width="1.7"/>
    <path d="M5.4 12.1h13.2M6.4 17.1h11.2" opacity=".75"/>
    <path d="M9.6 7.3a13 13 0 0 0 0 13M14.4 7.3a13 13 0 0 1 0 13" opacity=".75"/>
    <path d="M9.9 6.2h4.2" stroke-width="1.9"/>
    <circle cx="19.6" cy="6.6" r="1.05" fill="currentColor" stroke="none" opacity=".9"/>
    <circle cx="4.6" cy="7.9" r=".85" fill="currentColor" stroke="none" opacity=".7"/>
    <circle cx="16.9" cy="3.4" r=".6" fill="currentColor" stroke="none" opacity=".55"/>
  </svg>`;
}

export function magnesioHTML(n, { grande = false } = {}) {
  return `<span class="mg ${grande ? 'mg-grande' : ''}">${magnesioSVG(grande ? 24 : 17)}<b>${
    numero(n)}</b></span>`;
}

/* --------------------------------------------------------------------------
 * LA CAJA — el dibujo del bulto que se abre.
 * ------------------------------------------------------------------------ */
export function cajaSVG(tipoId = 'entreno', tam = 96, { animada = true } = {}) {
  const record = tipoId === 'record';
  const c = record ? '#ff9a3d' : '#6fa8ff';
  const c2 = record ? '#ffd08a' : '#d9e8ff';
  const q = animada ? '' : ' cos-quieto';
  return `<svg viewBox="0 0 100 100" width="${tam}" height="${tam}" aria-hidden="true"
    class="caja-svg${q}" fill="none">
    <defs>
      <linearGradient id="cj-${tipoId}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${c2}"/><stop offset="1" stop-color="${c}"/>
      </linearGradient>
    </defs>
    <g class="caja-cuerpo${q}">
      <path d="M18 44h64v34a6 6 0 0 1-6 6H24a6 6 0 0 1-6-6z" fill="#1f2731"/>
      <path d="M18 44h64v34a6 6 0 0 1-6 6H24a6 6 0 0 1-6-6z" stroke="${c}" stroke-width="2.2"/>
      <path d="M46 44h8v40h-8z" fill="url(#cj-${tipoId})" opacity=".85"/>
    </g>
    <g class="caja-tapa${q}">
      <path d="M14 30h72a4 4 0 0 1 4 4v10H10V34a4 4 0 0 1 4-4z" fill="#2a333f"/>
      <path d="M14 30h72a4 4 0 0 1 4 4v10H10V34a4 4 0 0 1 4-4z" stroke="${c}" stroke-width="2.2"/>
      <path d="M46 30h8v14h-8z" fill="url(#cj-${tipoId})"/>
      <path d="M50 30c-6-10-18-10-18-2 0 5 10 4 18 2zM50 30c6-10 18-10 18-2 0 5-10 4-18 2z"
        fill="url(#cj-${tipoId})" opacity=".9"/>
    </g>
    <g class="caja-polvo${q}" opacity=".9">
      <circle cx="32" cy="24" r="2.6" fill="${c}" opacity=".5"/>
      <circle cx="50" cy="16" r="3.4" fill="${c}" opacity=".7"/>
      <circle cx="68" cy="26" r="2.2" fill="${c}" opacity=".45"/>
    </g>
  </svg>`;
}

/* --------------------------------------------------------------------------
 * LA TARJETA DE PERFIL
 *
 * Lo que se está personalizando, siempre a la vista. Es la misma tarjeta que
 * luego se ve en el perfil: si aquí se enseñara una maqueta distinta, elegir a
 * ciegas.
 * ------------------------------------------------------------------------ */
/** Las iniciales, igual que en el perfil: un muñeco gris se lee como «vacío». */
function iniciales(nombre) {
  return String(nombre || '?').split(/\s+/).filter(Boolean).slice(0, 2)
    .map((t) => t[0].toUpperCase()).join('') || '?';
}

export function tarjetaPerfilHTML(estado, { nombre = 'Tu nombre', alias = '', foto = null,
                                            animado = true, heroe = false } = {}) {
  const e = CAJ.normalizar(estado);
  const marco = COS.pieza(e.puesto.marco);
  const fondo = COS.pieza(e.puesto.fondo);
  const placa = COS.pieza(e.puesto.placa);
  const aura = COS.pieza(e.puesto.aura);
  const titulo = COS.pieza(e.puesto.titulo);
  const f = COS.estiloFondo(fondo);
  const p = COS.estiloPlaca(placa);
  const mueve = animado && !menosMovimiento();

  return `<div class="vp" style="${f.css ? `background:${f.css}` : ''}">
    ${fondo ? COS.escenaFondo(fondo, { animado: mueve, ancho: 520, alto: 120, heroe }) : ''}
    ${aura ? COS.dibujarAura(aura, { animado: mueve, ancho: 520, alto: 120, heroe }) : ''}
    <div class="vp-fila">
      <span class="vp-foto">
        ${foto ? `<img src="${esc(foto)}" alt="">`
          : `<b class="vp-iniciales">${esc(iniciales(nombre))}</b>`}
        ${marco ? COS.dibujarMarco(marco, { tam: 88, animado: mueve, heroe }) : ''}
      </span>
      <span class="vp-quien">
        <span class="vp-nombre ${p.clase && mueve ? p.clase : ''}" style="${p.css}"
          data-texto="${esc(nombre)}">${esc(nombre)}</span>
        ${titulo ? COS.tituloHTML(titulo, { clase: 'vp-titulo' }) : ''}
        ${alias ? `<span class="vp-alias">@${esc(alias)}</span>` : ''}
      </span>
    </div>
  </div>`;
}

/* ==========================================================================
 * LA PANTALLA — rediseñada en la 0.36.0
 *
 * Carlos: *«vamos a trabajar en el rediseño completo del apartado de
 * personalización inspirado en Discord (…) lo nuestro es bastante horrible y se
 * aleja mucho de lo que yo deseo»*.
 *
 * LO QUE SE LE HA COGIDO A SU TIENDA (que es de organización, no de dibujo):
 *
 * 1. **Una barra fija con la moneda siempre a la vista.** Si para saber cuánto
 *    tienes hay que subir hasta arriba, la tienda miente sobre lo que puedes.
 * 2. **La rejilla es de TARJETAS, no de iconos.** Cada una enseña la pieza
 *    grande y su nombre debajo. Un azulejo de 40 px con el nombre cortado no
 *    vende nada — y aquí lo único que se «vende» es la ilusión de tenerla.
 * 3. **Todo se abre en una HOJA con la pieza a tamaño completo**, un botón
 *    principal y una línea que dice qué hace. Nada de decidir desde el azulejo.
 * 4. **El corazón.** Con setenta piezas, «la que me gustaba» se pierde. Es el
 *    único añadido suyo que resuelve un problema de verdad.
 * 5. **Los lotes.** Sus colecciones se enseñan juntas, con las miniaturas de lo
 *    que llevan dentro. Aquí eso ya existía —las cinco colecciones— y no se
 *    veía por ningún lado.
 *
 * LO QUE NO SE LE COGE: la caja de pago. Aquí no se compra con dinero.
 * ======================================================================== */

let _pestana = 'cajas';
let _filtro = 'todo';
let _coleccion = null;      // el «lote» abierto, si hay uno

/** Monta los lienzos de un trozo de pantalla. Se llama después de CADA pintada:
 *  el motor se salta los que ya están montados, así que repetir no cuesta. */
function animar(raiz) {
  try { MOT.motor.montar(raiz, COS.pintorDe); } catch { /* sin canvas, sin arte */ }
}

const CORAZON = (lleno) => `<svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true"
  fill="${lleno ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.9"
  stroke-linejoin="round"><path d="M12 20.2 4.6 13a4.6 4.6 0 0 1 6.5-6.5l.9.9.9-.9A4.6 4.6 0 1 1 19.4 13z"/></svg>`;

export function pintarVestuario(raiz, ctx) {
  const e = CAJ.normalizar(ctx.estado());
  const pend = CAJ.pendientes(e, ctx.resumen());
  const col = CAJ.coleccion(e);

  raiz.innerHTML = `
    <div class="vest-barra">
      <!-- Aquí NO va otra vez «Vestuario»: eso ya lo pone la cabecera de la app,
           y dos títulos iguales uno encima del otro se leen como un error. Lo
           que va es lo que hace falta tener siempre delante en una tienda: qué
           llevas de la colección y cuánto puedes gastar. -->
      <span class="vest-barra-cuenta">${col.mias}<i>/</i>${col.total} piezas</span>
      <button class="vest-pildora" id="vest-mg" aria-label="Qué es el magnesio">
        ${magnesioSVG(18)}<b>${numero(e.magnesio)}</b>
      </button>
    </div>

    <div class="ficha vest-cabeza">
      ${tarjetaPerfilHTML(e, { nombre: ctx.nombre(), alias: ctx.alias(), foto: ctx.foto() })}
      <div class="vest-progreso">
        <div class="vest-barra-p"><i style="width:${col.porcentaje}%"></i></div>
        <small>${col.mias} de ${col.total} piezas · ${col.porcentaje} %</small>
      </div>
    </div>

    <div class="seg" role="tablist" aria-label="Vestuario">
      <button class="seg-b" data-pes="cajas" role="tab">Cajas${
        pend.total ? `<b class="seg-pin">${pend.total}</b>` : ''}</button>
      <button class="seg-b" data-pes="coleccion" role="tab">Colección</button>
      <button class="seg-b" data-pes="tienda" role="tab">Tienda</button>
    </div>
    <div id="vest-zona"></div>`;

  $$('.seg-b', raiz).forEach((b) => {
    b.setAttribute('aria-selected', b.dataset.pes === _pestana);
    b.onclick = () => {
      if (_pestana === b.dataset.pes) return;
      _pestana = b.dataset.pes;
      _coleccion = null;
      ctx.tocar();
      SON.toque();
      pintarVestuario(raiz, ctx);
    };
  });
  $('#vest-mg', raiz).onclick = () => hojaMagnesio(ctx);

  const zona = $('#vest-zona', raiz);
  if (_pestana === 'cajas') pintarCajas(zona, ctx, e, pend);
  else if (_pestana === 'coleccion') pintarColeccion(zona, ctx, e);
  else pintarTienda(zona, ctx, e);
  animar(raiz);
}

/* --------------------------------------------------------------------------
 * LA TARJETA DE UNA PIEZA — el ladrillo de todas las rejillas.
 * ------------------------------------------------------------------------ */
function cartaHTML(c, e, { precio = null } = {}) {
  const mia = !!e.tengo[c.id];
  const puesta = e.puesto[c.familia] === c.id;
  const fav = !!e.favoritos[c.id];
  const r = COS.rareza(c.rareza);
  // El nombre, la rareza y los puntos ya los pone `vistaPreviaHTML`: es EL
  // MISMO azulejo que gira en la cinta y que se ve en el perfil. Repetirlos
  // aquí sería tener dos sitios donde arreglar lo mismo.
  return `<div class="tw-carta rar-${c.rareza} ${mia ? '' : 'tw-bloq'} ${puesta ? 'tw-puesta' : ''}">
    <button class="tw-toca" data-pieza="${c.id}"
      aria-label="${esc(c.nombre)}, ${esc(r.nombre)}${mia ? '' : ', aún no la tienes'}">
      ${COS.vistaPreviaHTML(c, { tam: 160 })}
    </button>
    <button class="tw-fav ${fav ? 'on' : ''}" data-fav="${c.id}"
      aria-label="${fav ? 'Quitar de favoritos' : 'Guardar en favoritos'}"
      aria-pressed="${fav}">${CORAZON(fav)}</button>
    ${puesta ? '<span class="tw-etiqueta">Puesta</span>' : ''}
    ${mia ? '' : precio != null
      // EL PRECIO OCUPA EL SITIO DEL CANDADO. Una pieza que está a la venta no
      // necesita que además le digan que no la tienes; y abajo, donde estaba, se
      // comía los puntos de rareza.
      ? `<span class="tw-precio">${magnesioHTML(precio)}</span>`
      : `<span class="tw-candado" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor"
        stroke-width="2"><rect x="4" y="10" width="16" height="10" rx="3"/>
        <path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg></span>`}
  </div>`;
}

/** Engancha los botones de una rejilla de tarjetas. Siempre los mismos dos. */
function engancharCartas(zona, ctx) {
  $$('[data-pieza]', zona).forEach((b) => (b.onclick = () => hojaPieza(ctx, COS.pieza(b.dataset.pieza))));
  $$('[data-fav]', zona).forEach((b) => (b.onclick = async (ev) => {
    ev.stopPropagation();
    await ctx.guardar(CAJ.favorito(ctx.estado(), b.dataset.fav));
    SON.toque(); ctx.tocar(8);
    const ahora = !!CAJ.normalizar(ctx.estado()).favoritos[b.dataset.fav];
    b.classList.toggle('on', ahora);
    b.setAttribute('aria-pressed', String(ahora));
    b.innerHTML = CORAZON(ahora);
  }));
}

/* --------------------------------------------------------------- las cajas */
function pintarCajas(zona, ctx, e, pend) {
  const g = pend.ganadas;
  zona.innerHTML = CAJ.TIPOS.map((t) => {
    const n = pend[t.id] || 0;
    return `<div class="ficha caja-tarjeta ${n ? 'tiene' : 'vacia'}" data-caja="${t.id}">
      <div class="caja-arte">${cajaSVG(t.id, 108, { animada: !!n })}
        ${n ? `<span class="caja-pin">${n}</span>` : ''}</div>
      <div class="caja-texto">
        <h3>${esc(t.nombre)}</h3>
        <p class="campo-nota">${esc(t.pie)}</p>
        <p class="caja-cuenta">${n
          ? `<b>${n}</b> sin abrir`
          : 'Ninguna ahora mismo'}</p>
      </div>
      <button class="boton ${n ? '' : 'boton-2'}" data-abrir="${t.id}" ${n ? '' : 'disabled'}>
        ${n ? 'Abrir' : 'Sin cajas'}</button>
    </div>`;
  }).join('') + `
    <div class="ficha vest-comogana">
      <h3 class="seccion-titulo" style="margin-top:0">Cómo se ganan</h3>
      <ul class="vest-lista">
        <li><span>${cajaSVG('entreno', 34, { animada: false })}</span>
          <div><b>Una por cada día que entrenas.</b> Con apuntar una serie ya cuenta.
          Llevas ${g.entreno} ${g.entreno === 1 ? 'ganada' : 'ganadas'}.</div></li>
        <li><span>${cajaSVG('record', 34, { animada: false })}</span>
          <div><b>Una por cada récord</b>, hasta ${CAJ.TOPE_RECORD_DIA} al día.
          Llevas ${g.record}.</div></li>
      </ul>
      <p class="campo-nota">Las cajas cuentan desde el ${esc(fechaBonita(e.desde))}, que es
        cuando estrenaste el vestuario. Lo de antes ya lo hiciste sin saber que contaba.</p>
      <button class="boton-plano" id="vest-probs">Ver las probabilidades</button>
    </div>
    ${!ctx.modoPersonal || !ctx.modoPersonal() ? '' : `
    <div class="ficha vest-banco">
      <h3 class="seccion-titulo" style="margin-top:0">Banco de pruebas</h3>
      <p class="campo-nota">Solo lo ves tú, con el modo personal encendido. Sirve para probar
        las piezas y las animaciones sin esperar a ganarlas.</p>
      <button class="boton boton-2" id="vest-banco">Desbloquear para probar</button>
    </div>`}
    ${e.historial.length ? `
    <h3 class="seccion-titulo">Lo último que ha salido</h3>
    <div class="ficha"><div class="vest-historial">
      ${e.historial.slice(0, 8).map((h) => {
        const p = COS.pieza(h.pieza);
        if (!p) return '';
        const r = COS.rareza(h.rareza);
        return `<div class="vest-hist rar-${h.rareza}">
          <span class="vest-hist-punto" style="background:${r.color}"></span>
          <b>${esc(p.nombre)}</b>
          <small>${esc(r.nombre)}${h.repetida ? ' · repetida' : ''}</small></div>`;
      }).join('')}
    </div></div>` : ''}`;

  $$('[data-abrir]', zona).forEach((b) => (b.onclick = () => escenaAbrir(ctx, b.dataset.abrir)));
  $('#vest-probs', zona).onclick = () => hojaProbabilidades(ctx);
  const banco = $('#vest-banco', zona);
  if (banco) banco.onclick = () => hojaBanco(ctx);
}

function fechaBonita(iso) {
  try {
    return new Date(`${String(iso).slice(0, 10)}T12:00:00`)
      .toLocaleDateString('es-ES', { day: 'numeric', month: 'long' });
  } catch { return String(iso || ''); }
}

/* ---------------------------------------------------------- la colección */
function pintarColeccion(zona, ctx, e) {
  const familias = [{ id: 'todo', nombre: 'Todo' },
    ...COS.FAMILIAS.map((f) => ({ id: f.id, nombre: f.plural })),
    { id: 'fav', nombre: '♥ Favoritas' }];
  const lista = COS.COSMETICOS
    .filter((c) => (_filtro === 'todo' ? true
      : _filtro === 'fav' ? !!e.favoritos[c.id]
      : c.familia === _filtro))
    .sort((a, b) => {
      const ta = !!e.tengo[a.id], tb = !!e.tengo[b.id];
      if (ta !== tb) return ta ? -1 : 1;                       // lo que tienes, delante
      return COS.nivelDeRareza(b.rareza) - COS.nivelDeRareza(a.rareza); // y lo mejor primero
    });

  zona.innerHTML = `
    <div class="chips" role="tablist">
      ${familias.map((f) => `<button class="chip" data-fam="${f.id}"
        aria-pressed="${_filtro === f.id}">${esc(f.nombre)}</button>`).join('')}
    </div>
    ${lista.length ? `<div class="tw-rejilla">${lista.map((c) => cartaHTML(c, e)).join('')}</div>`
      : `<div class="ficha vacio-ficha"><p>Aquí no hay nada todavía.
         ${_filtro === 'fav' ? 'Toca el corazón de una pieza para guardarla.' : ''}</p></div>`}`;

  $$('[data-fam]', zona).forEach((b) => (b.onclick = () => {
    _filtro = b.dataset.fam; ctx.tocar();
    MOT.motor.desmontar(zona);
    pintarColeccion(zona, ctx, e);
    animar(zona);
  }));
  engancharCartas(zona, ctx);
}

/* ------------------------------------------------------------- la tienda */
function pintarTienda(zona, ctx, e) {
  const hoy = new Date().toISOString().slice(0, 10);
  const escap = CAJ.escaparate(hoy, e);

  // LOS LOTES. Son las cinco colecciones, que ya existían y no se veían en
  // ningún sitio: una pieza pertenece a un mundo, y verlas juntas es lo que
  // hace que un conjunto parezca un conjunto.
  const lotes = COS.COLECCIONES.map((col) => {
    const piezas = COS.deColeccion(col.id);
    const mias = piezas.filter((c) => e.tengo[c.id]).length;
    return { col, piezas, mias };
  });

  zona.innerHTML = `
    <h3 class="seccion-titulo" style="margin-top:0">El escaparate de hoy</h3>
    <p class="campo-nota tw-nota">Cuatro piezas, las mismas para todo el mundo. Cambian mañana.</p>
    <div class="tw-rejilla">
      ${escap.map(({ pieza, precio }) => cartaHTML(pieza, e, { precio })).join('')}
    </div>

    <h3 class="seccion-titulo">Lotes</h3>
    <p class="campo-nota tw-nota">Cinco mundos. Las piezas de uno están hechas para verse juntas.</p>
    <div class="tw-lotes">
      ${lotes.map(({ col, piezas, mias }) => `
        <button class="tw-lote" data-lote="${col.id}"
          style="--l1:${col.c1};--l2:${col.c2};--l3:${col.c3}">
          <span class="tw-lote-miniaturas">
            ${piezas.slice(0, 3).map((c) => `<span class="tw-mini">${
              COS.vistaPreviaHTML(c, { tam: 62, animado: false })}</span>`).join('')}
          </span>
          <span class="tw-lote-texto">
            <b>${esc(col.nombre)}</b>
            <small>El lote incluye ${piezas.length} piezas · tienes ${mias}</small>
          </span>
        </button>`).join('')}
    </div>

    <h3 class="seccion-titulo">Cajas</h3>
    <div class="ficha">
      <div class="tienda-caja">
        ${cajaSVG('entreno', 72, { animada: false })}
        <div>
          <b>Caja de entreno</b>
          <p class="campo-nota">Las mismas probabilidades que la que te ganas entrenando.</p>
        </div>
        <button class="boton ${e.magnesio >= CAJ.PRECIO_CAJA ? '' : 'boton-2'}" id="tienda-caja"
          ${e.magnesio >= CAJ.PRECIO_CAJA ? '' : 'disabled'}>${magnesioHTML(CAJ.PRECIO_CAJA)}</button>
      </div>
      <p class="campo-nota">Aquí <b>no se paga con dinero</b>. El magnesio sale de abrir cajas y de
        deshacer las piezas repetidas, y no se vende. Las exóticas no están a la venta: solo salen
        de una caja.</p>
    </div>`;

  engancharCartas(zona, ctx);
  $$('[data-lote]', zona).forEach((b) => (b.onclick = () => hojaLote(ctx, b.dataset.lote)));
  $('#tienda-caja', zona).onclick = async () => {
    const nuevo = CAJ.comprarCaja(ctx.estado(), 'entreno');
    if (!nuevo) return ctx.aviso('No te llega el magnesio');
    await ctx.guardar(nuevo);
    SON.monedas(); ctx.tocar(18);
    _pestana = 'cajas';
    ctx.repintar();
  };
}

/* ==========================================================================
 * LAS HOJAS
 * ======================================================================== */

function hojaMagnesio(ctx) {
  ctx.hoja('El magnesio', `
    <p>Es el polvo blanco del bote de la sala: el que te echas en las manos antes de
      una serie fuerte para que no resbale la barra. Aquí es lo que se gasta en la tienda.</p>
    <ul class="vest-lista-simple">
      <li>Cada caja que abres trae ${CAJ.TIPOS[0].magnesio} (las de récord, ${CAJ.TIPOS[1].magnesio}).</li>
      <li>Una pieza <b>repetida</b> se deshace sola y te da magnesio: desde
        ${CAJ.polvoDe('comun')} de una común hasta ${numero(CAJ.polvoDe('exotico'))} de una exótica.</li>
      <li>No se compra con dinero. No hay ninguna forma de pagar por él.</li>
    </ul>`);
}

function hojaProbabilidades(ctx) {
  const filas = (tipo) => COS.RAREZAS.map((r) => {
    const p = tipo.tabla[r.id] || 0;
    return `<tr>
      <td><span class="prob-punto" style="background:${r.color}"></span>${esc(r.nombre)}
        ${COS.puntosHTML(r.id)}</td>
      <td class="prob-n">${p >= 1 ? p.toFixed(1) : p.toFixed(2)} %</td>
      <td class="prob-n prob-piezas">${COS.deRareza(r.id).length}</td></tr>`;
  }).join('');

  ctx.hoja('Las probabilidades', `
    <p class="campo-nota">Están aquí porque es lo honrado y porque publicar una app con cajas
      obliga a enseñarlas. Son las de verdad: salen del mismo sitio del que sale el sorteo.</p>
    ${CAJ.TIPOS.map((t) => `
      <h4 class="pf-familia">${esc(t.nombre)}</h4>
      <table class="prob-tabla">
        <thead><tr><th>Rareza</th><th class="prob-n">Probabilidad</th><th class="prob-n">Piezas</th></tr></thead>
        <tbody>${filas(t)}</tbody>
      </table>`).join('')}
    <h4 class="pf-familia">Dos cosas más</h4>
    <ul class="vest-lista-simple">
      <li><b>Dentro de una rareza, todas las piezas tienen la misma probabilidad.</b></li>
      <li><b>Suerte pendiente.</b> Si llevas ${CAJ.SUERTE.epico} cajas sin nada épico o mejor, la
        siguiente lo es seguro. Y si llevas ${CAJ.SUERTE.legendario} sin nada legendario o mejor,
        la siguiente es legendaria como poco.</li>
      <li>Una pieza que ya tienes se deshace en magnesio; nunca se pierde.</li>
    </ul>`);
}

/** Un lote: las piezas de una colección, juntas. */
function hojaLote(ctx, colId) {
  const col = COS.COLECCION_POR_ID.get(colId);
  if (!col) return;
  const e = CAJ.normalizar(ctx.estado());
  const piezas = COS.deColeccion(colId);
  ctx.hoja(col.nombre, `
    <p class="campo-nota">${esc(col.pie)} · ${piezas.length} piezas · tienes
      ${piezas.filter((c) => e.tengo[c.id]).length}.</p>
    <div class="tw-rejilla">${piezas.map((c) => cartaHTML(c, e)).join('')}</div>`,
  (cuerpo) => { engancharCartas(cuerpo, ctx); animar(cuerpo); });
}

/* --------------------------------------------------------------------------
 * LA HOJA DE UNA PIEZA
 *
 * Es la pantalla que más se mira, así que aquí la pieza va GRANDE y a 60 fps
 * (`heroe`), que es lo que el motor reserva para una sola escena.
 *
 * EL BOTÓN DEL OJO es lo mejor que tiene la tienda de Discord: enseña la pieza
 * puesta en TU perfil, no suelta sobre un fondo neutro. Un marco se elige por
 * cómo queda con tu cara dentro; suelto, todos valen.
 * ------------------------------------------------------------------------ */
function hojaPieza(ctx, pieza) {
  if (!pieza) return;
  const e = CAJ.normalizar(ctx.estado());
  const mia = !!e.tengo[pieza.id];
  const puesta = e.puesto[pieza.familia] === pieza.id;
  const r = COS.rareza(pieza.rareza);
  const veces = e.tengo[pieza.id] || 0;
  const precio = CAJ.precio(pieza.rareza);
  const fam = COS.FAMILIA_POR_ID.get(pieza.familia);
  // SOLO SE COMPRA LO QUE HAY HOY EN EL ESCAPARATE. `CAJ.comprar` aceptaría
  // cualquier pieza que no sea exótica, y poner aquí ese botón sin más
  // convertiría el escaparate diario en un adorno: con magnesio de sobra se
  // compraría la colección entera de una tarde. La regla es la que ya había.
  const hoy = new Date().toISOString().slice(0, 10);
  const enEscaparate = CAJ.escaparate(hoy, e).some((x) => x.pieza.id === pieza.id);
  const puedoComprar = !mia && enEscaparate && precio != null && e.magnesio >= precio;

  let enPerfil = false;

  const heroHTML = (conPerfil) => conPerfil
    ? tarjetaPerfilHTML({ ...e, puesto: { ...e.puesto, [pieza.familia]: pieza.id } },
        { nombre: ctx.nombre(), alias: ctx.alias(), foto: ctx.foto(), heroe: true })
    : COS.vistaPreviaHTML(pieza, { tam: 260, heroe: true });

  ctx.hoja(pieza.nombre, `
    <div class="pz rar-${pieza.rareza}">
      <div class="pz-hero" id="pz-hero">${heroHTML(false)}</div>
      <div class="pz-mandos">
        <button class="pz-redondo" id="pz-ojo" aria-pressed="false"
          aria-label="Verla puesta en tu perfil">
          <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor"
            stroke-width="1.9"><path d="M2 12s3.8-6.4 10-6.4S22 12 22 12s-3.8 6.4-10 6.4S2 12 2 12z"/>
            <circle cx="12" cy="12" r="2.8"/></svg></button>
        <button class="pz-redondo ${e.favoritos[pieza.id] ? 'on' : ''}" id="pz-fav"
          aria-pressed="${!!e.favoritos[pieza.id]}"
          aria-label="Guardar en favoritos">${CORAZON(!!e.favoritos[pieza.id])}</button>
      </div>
      <p class="pz-rareza"><b style="color:${r.color}">${esc(r.nombre)}</b>
        ${COS.puntosHTML(pieza.rareza)}</p>
      <p class="pz-que">${esc(fam ? fam.pie : '')}. Colección ${esc(COS.coleccionDe(pieza).nombre)}.</p>
      ${mia
        ? `<p class="campo-nota">La tienes${veces > 1 ? `, y te ha salido ${veces} veces` : ''}.</p>`
        : `<p class="campo-nota">Todavía no la tienes. Sale de las cajas${
            precio === null ? ' — y solo de ahí: las exóticas no se venden'
              : enEscaparate ? `, y hoy está en el escaparate por ${numero(precio)} de magnesio`
              : `, o por ${numero(precio)} de magnesio los días que salga en el escaparate`}.</p>`}
      <div class="pz-acciones">
        <!-- UN SOLO BOTÓN, EL QUE TOCA. Antes salían los dos y «Ponérmela»
             aparecía apagado al lado de «Comprar» encendido: un botón apagado
             que nunca se va a poder pulsar solo sirve para dudar. Si la tienes,
             se pone o se quita; si no, se compra (cuando está en el escaparate)
             y si no, se dice de dónde sale. -->
        ${mia ? `<button class="boton pz-principal" id="pz-poner">
          ${puesta ? 'Quitármela' : 'Ponérmela'}</button>`
        : enEscaparate && precio !== null
          ? `<button class="boton pz-principal ${puedoComprar ? '' : 'boton-2'}" id="pz-comprar"
              ${puedoComprar ? '' : 'disabled'}>Comprar ${magnesioHTML(precio)}</button>`
          : `<p class="pz-solocajas">${precio === null
              ? 'Solo sale de una caja' : 'Hoy no está en el escaparate'}</p>`}
      </div>
    </div>`, (cuerpo, cerrar) => {
    animar(cuerpo);
    const hero = $('#pz-hero', cuerpo);

    $('#pz-ojo', cuerpo).onclick = () => {
      enPerfil = !enPerfil;
      MOT.motor.desmontar(hero);
      hero.innerHTML = heroHTML(enPerfil);
      hero.classList.toggle('pz-hero-perfil', enPerfil);
      $('#pz-ojo', cuerpo).setAttribute('aria-pressed', String(enPerfil));
      animar(hero);
      SON.toque();
    };

    $('#pz-fav', cuerpo).onclick = async () => {
      await ctx.guardar(CAJ.favorito(ctx.estado(), pieza.id));
      const ahora = !!CAJ.normalizar(ctx.estado()).favoritos[pieza.id];
      const b = $('#pz-fav', cuerpo);
      b.classList.toggle('on', ahora);
      b.setAttribute('aria-pressed', String(ahora));
      b.innerHTML = CORAZON(ahora);
      SON.toque(); ctx.tocar(8);
    };

    // OJO CON EL `null`: desde que la hoja enseña UN SOLO botón, `#pz-poner`
    // no existe cuando la pieza no es tuya. Sin esta guarda, el `.onclick`
    // sobre `null` lanza y se lleva por delante el enganche de TODO lo que
    // viene detrás — que es justo el botón de comprar. No daba error visible:
    // el botón simplemente no hacía nada.
    const poner = $('#pz-poner', cuerpo);
    if (poner) poner.onclick = async () => {
      const actual = ctx.estado();
      const nuevo = puesta ? CAJ.quitarse(actual, pieza.familia) : CAJ.ponerse(actual, pieza.id);
      await ctx.guardar(nuevo);
      SON.toque(); ctx.tocar(12);
      cerrar();
      ctx.repintar();
    };

    const comprar = $('#pz-comprar', cuerpo);
    if (comprar) comprar.onclick = async () => {
      const nuevo = CAJ.comprar(ctx.estado(), pieza.id);
      if (!nuevo) return ctx.aviso('No te llega el magnesio');
      await ctx.guardar(nuevo);
      SON.monedas(); ctx.tocar(18);
      ctx.aviso('Comprada. Está en tu colección');
      cerrar();
      ctx.repintar();
    };
  });
}

const ANCHO_FICHA = 116;   // px; tiene que casar con el CSS (.cinta .cos-ficha)
const HUECO_FICHA = 12;
const PASO = ANCHO_FICHA + HUECO_FICHA;
/* CUÁNTO DURA LA CINTA. (Carlos, 3-sep-2026: *«haz la ruleta bastante más
 * larga, y que haya opción de saltar»*.) Con 3,4 s la tensión no llegaba a
 * montarse; con 6,4 s y ochenta piezas pasando, sí — y por eso mismo hace falta
 * un botón de saltar de verdad, no solo «toca donde sea»: quien abre diez
 * cajas seguidas no quiere ver diez veces lo mismo. */
const FICHAS = 82;         // cuántas fichas TIENE la cinta (de mentira)
const RANURAS = 7;         // cuántas hay de verdad en el DOM: las que caben + 2

/**
 * La misma curva que `cubic-bezier(x1,y1,x2,y2)` de CSS, resuelta a mano.
 *
 * Hace falta porque la cinta ya no la mueve una transición: la mueve un
 * `requestAnimationFrame`, y para reciclar las fichas hay que SABER en qué
 * punto va sin preguntárselo al navegador. Newton sobre la coordenada X, seis
 * vueltas, que para una curva monótona sobra.
 */
function curvaBezier(x1, y1, x2, y2) {
  const A = (a, b) => 1 - 3 * b + 3 * a;
  const B = (a, b) => 3 * b - 6 * a;
  const C = (a) => 3 * a;
  const en = (t, a, b) => ((A(a, b) * t + B(a, b)) * t + C(a)) * t;
  const pendiente = (t, a, b) => 3 * A(a, b) * t * t + 2 * B(a, b) * t + C(a);
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 6; i++) {
      const d = pendiente(t, x1, x2);
      if (Math.abs(d) < 1e-6) break;
      t -= (en(t, x1, x2) - x) / d;
    }
    return en(t, y1, y2);
  };
}
/* --------------------------------------------------------------------------
 * UNA FICHA DIBUJADA A MANO EN EL LIENZO DE LA CINTA
 *
 * POR QUÉ NO SON LOS MISMOS AZULEJOS DE LA COLECCIÓN. La 0.35.0 ya arregló lo
 * peor (pintaba las 82 fichas seguidas, 10.496 px de ancho) reciclando siete
 * ranuras de DOM. Pero seguía cambiando el HTML de una ranura cada pocos
 * fotogramas, y con el dibujo en `<canvas>` eso significa crear un contexto y
 * MEDIR el hueco —o sea, rehacer el layout— en mitad del bucle. Un
 * `getBoundingClientRect` por fotograma es exactamente lo que ya costó una
 * versión.
 *
 * Así que la cinta entera es UN lienzo: se mide una vez al empezar y en cada
 * fotograma se dibujan las cuatro o cinco fichas que se ven. Cero DOM mientras
 * gira, y el coste no depende de lo rápido que vaya.
 * ------------------------------------------------------------------------ */
function redondeado(g, x, y, w, h, r) {
  // `roundRect` existe desde Chrome 99; en un WebView viejo no, y la cinta se
  // quedaría en negro sin decir por qué.
  if (typeof g.roundRect === 'function') { g.beginPath(); g.roundRect(x, y, w, h, r); return; }
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function fichaEnLienzo(g, item, x, y, w, h) {
  if (!item) return;
  const r = COS.rareza(item.rareza);
  const arte = Math.round(h * 0.66);

  redondeado(g, x, y, w, h, 14);
  g.fillStyle = '#151a21';
  g.fill();
  g.save();
  g.clip();

  // El dibujo de la pieza, en su hueco y recortado por él.
  const caja = { x: x + 6, y: y + 6, w: w - 12, h: arte - 6 };
  g.save();
  g.beginPath();
  g.rect(caja.x, caja.y, caja.w, caja.h);
  g.clip();
  g.translate(caja.x, caja.y);
  const e = { t: 0, w: caja.w, h: caja.h, calidad: 1, quieto: true, heroe: false,
              semilla: MOT.hash(item.id) };

  if (item.familia === 'fondo') {
    const pin = COS.pintorDe(item.id);
    if (pin) pin(g, e);
  } else if (item.familia === 'marco' || item.familia === 'aura') {
    // La cara de mentira, para que un marco se vea como lo que rodea algo.
    const cx = caja.w / 2, cy = caja.h / 2, rf = Math.min(caja.w, caja.h) * 0.29;
    g.fillStyle = '#2b333d';
    g.beginPath(); g.arc(cx, cy, rf, 0, Math.PI * 2); g.fill();
    const pin = COS.pintorDe(item.id);
    if (pin) {
      if (item.familia === 'marco') {
        // El marco se compone en un cuadrado; aquí el hueco es apaisado.
        const lado = Math.min(caja.w, caja.h);
        g.save();
        g.translate((caja.w - lado) / 2, (caja.h - lado) / 2);
        pin(g, { ...e, w: lado, h: lado });
        g.restore();
      } else {
        pin(g, e);
      }
    }
  } else if (item.familia === 'placa') {
    g.fillStyle = '#2a323d';
    redondeado(g, caja.w * 0.12, caja.h * 0.38, caja.w * 0.76, caja.h * 0.26, caja.h * 0.13);
    g.fill();
    g.fillStyle = '#dfe7f2';
    g.font = `600 ${Math.round(caja.h * 0.15)}px system-ui, sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('Tu nombre', caja.w / 2, caja.h * 0.51);
  } else {
    g.fillStyle = r.color;
    g.font = `800 ${Math.round(caja.h * 0.2)}px system-ui, sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(item.nombre, caja.w / 2, caja.h / 2, caja.w * 0.92);
  }
  g.restore();

  // El pie: el nombre y el punto de la rareza.
  g.fillStyle = '#f2f6fb';
  g.font = `700 ${Math.round(h * 0.088)}px system-ui, sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'top';
  g.fillText(item.nombre, x + w / 2, y + arte + 4, w - 14);
  g.fillStyle = r.color;
  g.beginPath();
  g.arc(x + w / 2, y + h - 10, 3, 0, Math.PI * 2);
  g.fill();
  g.restore();

  // El borde, del color de la rareza: es lo que hace que pasar una legendaria
  // se NOTE aunque no dé tiempo a leer el nombre.
  redondeado(g, x + 0.5, y + 0.5, w - 1, h - 1, 14);
  g.strokeStyle = r.color;
  g.globalAlpha = 0.55;
  g.lineWidth = 1.5;
  g.stroke();
  g.globalAlpha = 1;
}

const GANADORA = 74;       // dónde cae la buena: deja cola por detrás
const DURA_CINTA = 6400;   // ms

export async function escenaAbrir(ctx, tipoId) {
  const pend = CAJ.pendientes(ctx.estado(), ctx.resumen());
  if (!pend[tipoId]) return ctx.aviso('No te queda ninguna caja de esas');

  // El sorteo se hace AQUÍ, antes de la animación, con la semilla del reloj y
  // de `crypto`. La cinta solo dibuja lo que ya ha salido: si se decidiera al
  // final de la animación, un cierre de la app a mitad se quedaría a medias.
  const semilla = semillaFuerte();
  const { estado: nuevoEstado, premio } = CAJ.abrir(ctx.estado(), tipoId, CAJ.azarCon(semilla));
  await ctx.guardar(nuevoEstado);

  const quedan = CAJ.pendientes(nuevoEstado, ctx.resumen());
  montarEscena(ctx, tipoId, premio, quedan);
}

function semillaFuerte() {
  try {
    const a = new Uint32Array(1);
    crypto.getRandomValues(a);
    return a[0] ^ (Date.now() >>> 0);
  } catch {
    return (Math.random() * 4294967295) >>> 0;
  }
}

function montarEscena(ctx, tipoId, premio, quedan) {
  const suave = menosMovimiento();
  const r = COS.rareza(premio.rareza);
  const escena = document.createElement('div');
  escena.className = 'escena';
  escena.setAttribute('role', 'dialog');
  escena.setAttribute('aria-modal', 'true');
  escena.setAttribute('aria-label', 'Abriendo una caja');
  escena.style.setProperty('--luz', r.luz);
  escena.style.setProperty('--rar', r.color);
  const tipo = CAJ.TIPO_POR_ID.get(tipoId) || CAJ.TIPOS[0];
  escena.innerHTML = `
    <div class="escena-luz"></div>
    <div class="escena-rayos" aria-hidden="true"></div>
    <h2 class="escena-titulo">${esc(tipo.nombre)}
      <small>${quedan.total ? `te quedan ${quedan.total} después de esta` : 'la última que te queda'}</small></h2>
    <button class="escena-cerrar" id="escena-cerrar" aria-label="Cerrar">
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor"
        stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
    <div class="escena-acto acto-caja">
      ${cajaSVG(tipoId, 190)}
      <p class="escena-pie">Toca la caja</p>
    </div>
    <div class="escena-acto acto-cinta oculto">
      <div class="cinta-marco">
        <div class="cinta-linea" aria-hidden="true"></div>
        <canvas class="cinta-lienzo" id="cinta" aria-hidden="true"></canvas>
      </div>
      <button class="boton boton-2 escena-saltar" id="escena-saltar">Saltar</button>
    </div>
    <div class="escena-acto acto-premio oculto"></div>`;
  document.body.appendChild(escena);
  document.body.style.overflow = 'hidden';

  const cerrar = () => {
    MOT.motor.desmontar(escena);
    escena.remove();
    document.body.style.overflow = '';
    ctx.repintar();
  };

  let acto = 0;
  let saltar = null;
  // Salir a media escena: la pieza ya está sorteada y guardada, así que cerrar
  // aquí no pierde nada. Sin este botón, la única salida sería esperar.
  $('#escena-cerrar', escena).onclick = (ev) => { ev.stopPropagation(); cerrar(); };

  const alTocar = () => {
    if (acto === 0) empezarCinta();
    else if (acto === 1 && saltar) saltar();
  };
  escena.addEventListener('click', alTocar);

  /* --- Acto 1: la caja tiembla y se abre ------------------------------- */
  function empezarCinta() {
    acto = 1;
    ctx.tocar(20);
    SON.despertar();
    const caja = $('.acto-caja', escena);
    caja.classList.add('caja-abriendo');
    SON.subida(suave ? 0.5 : 1.9);

    setTimeout(() => {
      caja.classList.add('oculto');
      $('.acto-cinta', escena).classList.remove('oculto');
      girarCinta();
    }, suave ? 220 : 620);
  }

  /* --- Acto 2: la cinta ------------------------------------------------ */
  /**
   * LA CINTA NO SE MUEVE ENTERA: SE RECICLAN SIETE FICHAS.
   *
   * Antes se pintaban las 82 fichas seguidas en un `flex` y se movía el bloque
   * con una transición de CSS. Eso es una capa de **10.496 × 158 píxeles** con
   * `will-change: transform`, y encima el marco le pone una máscara. Un móvil
   * no puede tener una textura de ese ancho: se pasa del máximo, así que el
   * navegador deja de componerla y vuelve a PINTARLA entera en cada fotograma.
   * De ahí *«la apertura de cajas va ultra lag, como a 1 fps»*.
   *
   * Ahora en el DOM hay SIETE fichas —las que caben en el hueco más un par de
   * margen— y en cada fotograma se colocan en su sitio; cuando una se sale por
   * la izquierda se le pone el contenido de la que entra por la derecha. La
   * capa mide lo que el hueco, y lo que se dibuja son cuatro azulejos.
   *
   * Y el movimiento lo lleva un `requestAnimationFrame` con la MISMA curva que
   * tenía la transición (resuelta a mano, ver `curvaBezier`): así se puede
   * saber en qué punto va la cinta sin preguntárselo al DOM, que era lo que
   * obligaba a un `getBoundingClientRect` por fotograma.
   */
  function girarCinta() {
    const marco = $('.cinta-marco', escena);
    const cv = $('#cinta', escena);
    // UNA sola medida, aquí. Preguntarle al DOM dónde está algo dentro del
    // bucle obliga al navegador a rehacer el layout en cada fotograma, y eso
    // ya costó una versión.
    const caja = marco.getBoundingClientRect();
    const W = Math.max(120, Math.round(caja.width));
    const H = Math.max(80, Math.round(caja.height));
    const centro = W / 2;
    const dpr = Math.min(typeof devicePixelRatio === 'number' ? devicePixelRatio : 1, 2);
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
    cv.style.width = `${W}px`;
    cv.style.height = `${H}px`;
    const g = cv.getContext('2d');

    // El relleno son piezas de verdad, elegidas al azar: si fueran siempre las
    // mismas, la segunda caja ya no engaña a nadie. La ganadora va en su sitio.
    const relleno = Array.from({ length: FICHAS }, () =>
      COS.COSMETICOS[Math.floor(Math.random() * COS.COSMETICOS.length)]);
    relleno[GANADORA] = premio.pieza;

    // Un pelín descentrada a propósito (±26 px): parada perfectamente centrada
    // = parada de mentira.
    const desvio = (Math.random() * 52) - 26;
    const total = GANADORA * PASO + ANCHO_FICHA / 2 - centro + desvio;
    const alto = Math.min(H - 12, ANCHO_FICHA * 1.24);
    const arriba = (H - alto) / 2;

    let ultimoTic = -1;
    const dibujar = (x, conTic) => {
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, W, H);
      const i0 = Math.floor(x / PASO) - 1;
      for (let r = 0; r < RANURAS; r++) {
        const i = i0 + r;
        if (i < 0 || i >= FICHAS) continue;
        fichaEnLienzo(g, relleno[i], i * PASO - x, arriba, ANCHO_FICHA, alto);
      }
      // Un tic por ficha que cruza la línea. Cuanto más cerca del final, más
      // agudo: el tono cuenta cuánto queda.
      const cruzadas = Math.floor((x + centro - ANCHO_FICHA / 2) / PASO);
      if (conTic && cruzadas !== ultimoTic) {
        if (ultimoTic >= 0) SON.tic(0.85 + (cruzadas / GANADORA) * 1.1);
        ultimoTic = cruzadas;
      }
    };

    if (suave) {
      dibujar(total, false);
      return revelar();
    }

    // La curva importa tanto como la duración: arranca disparada, se mantiene
    // rápida más de la mitad del camino y frena al final. Un `ease-out` normal
    // frena desde el primer segundo y parece que se ha quedado sin pila.
    const curva = curvaBezier(0.06, 0.52, 0.06, 1);
    const t0 = performance.now();
    let vivo = true;
    let x = 0;

    const paso = (ahora) => {
      if (!vivo) return;
      const t = Math.min(1, (ahora - t0) / DURA_CINTA);
      x = total * curva(t);
      dibujar(x, true);
      if (t < 1) requestAnimationFrame(paso);
      else { vivo = false; setTimeout(revelar, 240); }
    };
    dibujar(0, false);
    requestAnimationFrame(paso);

    const botonSaltar = $('#escena-saltar', escena);
    if (botonSaltar) botonSaltar.onclick = (ev) => { ev.stopPropagation(); if (saltar) saltar(); };
    saltar = () => {
      if (!vivo) return;
      vivo = false;
      // Saltar no es hacer trampa: la pieza ya está decidida y guardada. Solo
      // se corta la espera. Se frena desde DONDE VA, no desde el principio.
      const desde = x;
      const s0 = performance.now();
      const frena = curvaBezier(0.2, 0, 0, 1);
      const cerrarCinta = (ahora) => {
        const t = Math.min(1, (ahora - s0) / 260);
        dibujar(desde + (total - desde) * frena(t), false);
        if (t < 1) requestAnimationFrame(cerrarCinta);
        else revelar();
      };
      requestAnimationFrame(cerrarCinta);
    };
  }

  /* --- Acto 3: la pieza ------------------------------------------------ */
  function revelar() {
    acto = 2;
    saltar = null;
    const grande = ['legendario', 'mitico', 'exotico'].includes(premio.rareza);
    escena.classList.add('escena-revela', `rar-${premio.rareza}`);
    if (grande && !suave) escena.classList.add('escena-tiembla');
    SON.celebrarRareza(premio.rareza);

    $('.acto-cinta', escena).classList.add('oculto');
    const zona = $('.acto-premio', escena);
    zona.classList.remove('oculto');
    zona.innerHTML = `
      <span class="premio-rareza" style="color:${r.color}">${esc(r.nombre)}
        ${COS.puntosHTML(premio.rareza)}</span>
      <div class="premio-pieza">${COS.vistaPreviaHTML(premio.pieza, { tam: 210, heroe: true })}</div>
      <h2 class="premio-nombre">${esc(premio.pieza.nombre)}</h2>
      <p class="premio-familia">${esc(COS.familiaDe(premio.pieza))}</p>
      ${premio.repetida
        ? `<p class="premio-nota">Ya la tenías: se deshace en
             ${magnesioHTML(premio.polvo)}</p>`
        : '<p class="premio-nota premio-nueva">¡Nueva!</p>'}
      <p class="premio-mg">La caja traía ${magnesioHTML(premio.magnesio)}</p>
      <div class="premio-botones">
        ${premio.repetida ? '' : '<button class="boton" id="premio-poner">Ponérmela</button>'}
        <button class="boton ${premio.repetida ? '' : 'boton-2'}" id="premio-seguir">
          ${quedan.total ? `Abrir otra (${quedan.total})` : 'Listo'}</button>
      </div>`;

    animar(zona);
    if (!suave) chispas(escena, premio.rareza);

    const poner = $('#premio-poner', zona);
    if (poner) poner.onclick = async (ev) => {
      ev.stopPropagation();
      await ctx.guardar(CAJ.ponerse(ctx.estado(), premio.pieza.id));
      SON.toque(); ctx.tocar(12);
      ctx.aviso(`${premio.pieza.nombre}, puesta`);
      cerrar();
    };
    $('#premio-seguir', zona).onclick = (ev) => {
      ev.stopPropagation();
      if (!quedan.total) return cerrar();
      // La siguiente: la de este tipo si quedan, y si no, la que haya.
      const siguiente = quedan[tipoId] ? tipoId : (quedan.entreno ? 'entreno' : 'record');
      MOT.motor.desmontar(escena);
      escena.remove();
      document.body.style.overflow = '';
      escenaAbrir(ctx, siguiente);
    };
    // A partir de aquí, tocar el fondo cierra: ya no hay nada que saltar.
    escena.removeEventListener('click', alTocar);
    escena.addEventListener('click', (ev) => { if (ev.target === escena) cerrar(); });
  }
}

/** Las chispas del final. Se pintan una vez y se van solas. */
function chispas(escena, rarezaId) {
  const r = COS.rareza(rarezaId);
  const n = { comun: 10, pococomun: 14, raro: 18, epico: 26, legendario: 34, mitico: 44, exotico: 60 }[rarezaId] || 12;
  const caja = document.createElement('div');
  caja.className = 'chispas';
  caja.setAttribute('aria-hidden', 'true');
  const iris = r.iris || [r.color, r.luz];
  caja.innerHTML = Array.from({ length: n }, (_, i) => {
    const ang = (i / n) * 360 + Math.random() * 14;
    const dist = 90 + Math.random() * 190;
    const tam = 4 + Math.random() * 7;
    const dur = 700 + Math.random() * 900;
    const col = iris[i % iris.length];
    return `<i style="--a:${ang}deg;--d:${dist}px;--t:${tam}px;--v:${dur}ms;--c:${col}"></i>`;
  }).join('');
  escena.appendChild(caja);
  setTimeout(() => caja.remove(), 2200);
}

/* ==========================================================================
 * EL BANCO DE PRUEBAS
 *
 * Carlos, 3-sep-2026: *«me abres una cuenta de mentira con dinero para yo
 * testear cómo funcionan las animaciones»*.
 *
 * Vive detrás del interruptor de desarrollador (siete toques en la versión, en
 * Ajustes), en el mismo sitio donde ya vive lo del PC. No es una cuenta aparte:
 * es esta, con magnesio y cajas regaladas, y con una marca (`pruebas`) para que
 * se sepa. Sirve para ver las animaciones sin tener que ir 40 días al gimnasio.
 * ======================================================================== */
export function hojaBanco(ctx) {
  const e = CAJ.normalizar(ctx.estado());
  ctx.hoja('Banco de pruebas', `
    <p class="campo-nota">Para probar las animaciones sin esperar. Lo que dé de aquí queda
      marcado como de pruebas: no es magnesio ganado entrenando.</p>
    <div class="hoja-lista">
      <button class="hoja-op" data-banco="todo-y-mas"><span>Desbloquearlo TODO
        <small>las ${COS.COSMETICOS.length} piezas, 50.000 de magnesio y 30 cajas, de una vez</small></span></button>
      <button class="hoja-op" data-banco="cajas"><span>+10 cajas de entreno y +5 de récord
        <small>para ver la cinta y las rarezas</small></span></button>
      <button class="hoja-op" data-banco="magnesio"><span>+20.000 de magnesio
        <small>para probar la tienda</small></span></button>
      <button class="hoja-op" data-banco="todo"><span>Darme la colección entera
        <small>para ver cómo se ve cada pieza puesta</small></span></button>
      <button class="hoja-op" data-banco="borrar"><span>Empezar de cero
        <small>borra la colección, el magnesio y las cajas abiertas</small></span></button>
    </div>
    <p class="campo-nota">Ahora mismo: ${numero(e.magnesio)} de magnesio,
      ${CAJ.coleccion(e).mias} piezas${e.pruebas ? ' · <b>con datos de pruebas</b>' : ''}.</p>`,
    (cuerpo, cerrar) => {
    $$('[data-banco]', cuerpo).forEach((b) => (b.onclick = async () => {
      const actual = CAJ.normalizar(ctx.estado());
      let nuevo = actual;
      if (b.dataset.banco === 'cajas') {
        nuevo = { ...actual, pruebas: true,
          sueltas: { entreno: (actual.sueltas.entreno || 0) + 10,
                     record: (actual.sueltas.record || 0) + 5 } };
      } else if (b.dataset.banco === 'magnesio') {
        nuevo = { ...actual, pruebas: true, magnesio: (actual.magnesio || 0) + 20000 };
      } else if (b.dataset.banco === 'todo-y-mas') {
        // Lo que pidió Carlos: todo desbloqueado de una vez para poder probar.
        const tengo = { ...actual.tengo };
        for (const c of COS.COSMETICOS) tengo[c.id] = tengo[c.id] || 1;
        nuevo = { ...actual, pruebas: true, tengo,
          magnesio: (actual.magnesio || 0) + 50000,
          sueltas: { entreno: (actual.sueltas.entreno || 0) + 20,
                     record: (actual.sueltas.record || 0) + 10 } };
      } else if (b.dataset.banco === 'todo') {
        const tengo = { ...actual.tengo };
        for (const c of COS.COSMETICOS) tengo[c.id] = tengo[c.id] || 1;
        nuevo = { ...actual, pruebas: true, tengo };
      } else if (b.dataset.banco === 'borrar') {
        if (!confirm('Se borra la colección entera, el magnesio y la cuenta de cajas abiertas.\n\n¿Seguro?')) return;
        nuevo = CAJ.estadoInicial();
      }
      await ctx.guardar(nuevo);
      cerrar();
      ctx.aviso('Listo');
      ctx.repintar();
    }));
  });
}
