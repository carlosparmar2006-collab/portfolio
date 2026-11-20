/* =============================================================================
 * bienvenida.js — La primera vez: cuatro preguntas y un estudio de verdad.
 *
 * Carlos, 31-ago-2026: *«no me gusta nada lo que has hecho del setup inicial, no
 * tiene nada de ciencia respaldando lo que das en función de los días de
 * entrenamiento. La idea es ofrecer un estudio de entrenamiento personalizado
 * para el usuario en función de los datos proporcionados»*.
 *
 * QUÉ ESTABA MAL Y QUÉ CAMBIA
 * ---------------------------
 * La versión anterior preguntaba los días y devolvía un reparto con un «3×12»
 * que no salía de ningún sitio. Peor: a 3 días proponía Push/Pull/Leg, que deja
 * cada grupo a UNA vez por semana — justo lo que la evidencia dice que rinde
 * menos. Era un formulario disfrazado de consejo.
 *
 * Ahora las cuatro preguntas de entrenamiento (qué buscas, cuánto llevas,
 * cuántos días, cuánto rato) alimentan `ciencia.js`, y el asistente termina en
 * un **estudio**: series por grupo y semana, frecuencia, repeticiones, esfuerzo,
 * descanso, cómo progresar, y las fuentes de las que sale cada cosa. Si algo no
 * cabe en el tiempo que hay, se dice ahí mismo en vez de recetarlo igual.
 *
 * La regla de oro sigue siendo la misma: **ninguna pregunta que no cambie el
 * plan**. Si una respuesta no mueve un número, la pregunta sobra.
 *
 * CÓMO ESTÁN HECHAS  (`mobile-app-ui-design`)
 * -------------------------------------------
 * · UNA PREGUNTA POR PANTALLA. Un formulario de doce campos se abandona.
 * · La acción principal SIEMPRE abajo, a lo ancho y con 52 px de alto: es donde
 *   llega el pulgar en un móvil que se sostiene con una mano.
 * · TODO SE PUEDE SALTAR, y se dice. Un asistente del que no se puede salir es
 *   una trampa: lo que consigue es que se desinstale la app.
 * · Nada es irreversible: cada respuesta se cambia luego en Ajustes.
 * · Lo de la nube (gimnasios, rutinas, gente) se carga aparte y si no hay, esa
 *   parte se esconde con su motivo. La bienvenida tiene que funcionar en el metro.
 *
 * Y UNA TRAMPA YA PAGADA: la capa de la bienvenida es OPACA. Si su `z-index`
 * queda por encima del de las hojas, cualquier botón que abra una hoja parece
 * muerto — la hoja se abre debajo. Pasó con «Crear una cuenta» y tumbó medio
 * setup. El orden está fijado en `app.css` y hay un test que lo vigila.
 * ========================================================================== */

import * as db from './db.js';
import * as nube from './nube.js';
import * as social from './social.js';
import * as C from './ciencia.js';
// El mapa. Va aquí desde el 1-sep-2026: sin él, el paso del gimnasio no dejaba
// buscar una dirección de verdad. RECUERDA: cada import nuevo va TAMBIÉN en la
// lista ARMAZON de sw.js, o la app se cae sin cobertura.
import * as C_MAPA from './mapa.js';

/** Sube este número si algún día hay que volver a preguntar algo. */
export const VERSION = 2;
const CLAVE = 'bienvenida';

/* --------------------------------------------------------------------------
 * ¿Hace falta enseñarla?
 * ------------------------------------------------------------------------ */

/**
 * Solo la primera vez, y solo si de verdad es la primera.
 *
 * Lo de mirar si ya hay series es la red de seguridad que importa: a quien lleva
 * meses de datos no se le puede plantar un asistente de bienvenida porque una
 * versión nueva estrene el ajuste. Se da por bienvenido a quien ya ha apuntado
 * algo, sin preguntar.
 */
export async function hayQueEnsenarla() {
  const hecha = await db.ajuste(CLAVE, 0);
  if (Number(hecha) >= VERSION) return false;
  const series = await db.todos('series');
  if (series.length) {
    await marcarHecha({ heredada: true });
    return false;
  }
  /* ------------------------------------------------------------------------
   * ENTRAR EN UNA CUENTA QUE YA EXISTE TAMPOCO ES LA PRIMERA VEZ.
   * (2-sep-2026) Carlos: *«si entro a mi cuenta no debería saltarme el setup
   * inicial, eso está mal»*.
   *
   * La red de seguridad de arriba mira las series del MÓVIL, y en un móvil
   * recién instalado no hay ninguna aunque lleves meses usando la app: los
   * datos están en tu cuenta, no aquí. Así que se pregunta también a la nube —
   * si esa cuenta ya tiene perfil o ya tiene copia, no es un estreno.
   *
   * Se pregunta SOLO si hay sesión y hay red: sin eso no se pierde ni un
   * segundo del arranque, que es lo primero que se ve al abrir la app.
   * --------------------------------------------------------------------- */
  const enLinea = typeof navigator === 'undefined' || navigator.onLine !== false;
  if (enLinea && nube.usuario() && (await nube.hayNube())) {
    if (await laCuentaYaExistia()) {
      await marcarHecha({ heredada: true });
      return false;
    }
  }
  return true;
}

/** ¿Esta cuenta ya se usaba? Perfil publicado o copia de seguridad guardada. */
async function laCuentaYaExistia() {
  try {
    const [perfil, copia] = await Promise.all([
      nube.miPerfil().catch(() => ({ ok: false })),
      // `infoCopia` puede no existir si aún no se ha pegado el esquema 7: un
      // 404 no puede decidir que esto es un estreno, así que se ignora.
      (nube.infoCopia ? nube.infoCopia() : Promise.resolve({ ok: false })).catch(() => ({ ok: false })),
    ]);
    if (perfil.ok && perfil.perfil && perfil.perfil.alias) return true;
    if (copia.ok && copia.hay) return true;
  } catch (_) {
    // Que la nube no conteste NO puede plantarle el asistente a nadie; pero
    // tampoco puede saltárselo a quien sí lo necesita. Se sigue con lo de
    // siempre, que es mirar el móvil.
  }
  return false;
}

export async function marcarHecha(extra = {}) {
  await db.ponAjuste(CLAVE, VERSION);
  if (extra.heredada) await db.ponAjuste('bienvenida_heredada', true);
}

/** Lo que se contestó, para poder rehacer el estudio desde Ajustes. */
export async function respuestas() {
  return {
    objetivo: (await db.ajuste('objetivo_entreno', '')) || 'musculo',
    experiencia: (await db.ajuste('experiencia', '')) || 'medio',
    dias: Number(await db.ajuste('dias_semana', 0)) || 3,
    duracion: (await db.ajuste('duracion_sesion', '')) || 'media',
  };
}

/** El estudio a partir de lo guardado. Lo usan Ajustes y la pantalla de Plan. */
export async function estudioGuardado() {
  return C.estudiar(await respuestas());
}

/* --------------------------------------------------------------------------
 * LOS COLORES QUE SE OFRECEN AQUÍ
 *
 * Seis, no catorce. En Ajustes está el estudio de temas entero con la rueda de
 * color; esto es la primera pantalla, y una rejilla de catorce muestras a quien
 * acaba de instalar la app no es libertad, es un examen.
 * ------------------------------------------------------------------------ */
export const COLORES = [
  { id: 'oscuro', nombre: 'Lima', fondo: '#0b0d11', acento: '#d2fa55' },
  { id: 'claro', nombre: 'Papel', fondo: '#f2f4f8', acento: '#4d7a00' },
  { id: 'rosa', nombre: 'Rosa', fondo: '#120810', acento: '#ff9ec7' },
  { id: 'propio', nombre: 'Fuego', fondo: '#0b0d11', acento: '#ff7a2f',
    propio: { base: 'oscuro', acento: '#ff7a2f', intensidad: 70 } },
  { id: 'propio', nombre: 'Hielo', fondo: '#0b0d11', acento: '#5ad8ff',
    propio: { base: 'oscuro', acento: '#5ad8ff', intensidad: 55 } },
  { id: 'propio', nombre: 'Menta', fondo: '#0b0d11', acento: '#4ee6b0',
    propio: { base: 'oscuro', acento: '#4ee6b0', intensidad: 58 } },
];

/* ==========================================================================
 * LO QUE SE APLICA AL TERMINAR
 *
 * Va aparte del dibujo a propósito: así se puede probar en Node, sin pantalla,
 * igual que `perfil.js` y `ciencia.js`.
 * ========================================================================== */

/**
 * Escribe lo elegido: tema, respuestas, gimnasio y los días de entreno.
 *
 * Es IDEMPOTENTE y no pisa lo que ya haya: si alguien vuelve a pasar por aquí
 * (o si la app ya tenía rutinas), no se duplican ni se borran. Perder los datos
 * de alguien por volver a abrir una pantalla de bienvenida sería imperdonable.
 */
export async function aplicar(elegido, puente) {
  const hecho = { rutinas: 0, gimnasio: null, tema: null, estudio: null };

  if (elegido.tema) {
    await puente.ponAjuste('tema', elegido.tema.id || 'oscuro');
    if (elegido.tema.propio) await puente.ponAjuste('tema_propio', elegido.tema.propio);
    hecho.tema = elegido.tema.id;
  }
  if (elegido.nombre) await puente.ponAjuste('perfil_nombre', String(elegido.nombre).trim());

  // Las cuatro respuestas que alimentan el estudio. Se guardan SIEMPRE, aunque
  // se haya saltado el asistente: con los valores por defecto el estudio sigue
  // saliendo, y así Plan y Ajustes tienen de dónde tirar.
  await puente.ponAjuste('objetivo_entreno', elegido.objetivo || 'musculo');
  await puente.ponAjuste('experiencia', elegido.experiencia || 'medio');
  await puente.ponAjuste('dias_semana', Number(elegido.dias) || 3);
  await puente.ponAjuste('duracion_sesion', elegido.duracion || 'media');

  const estudio = C.estudiar({
    objetivo: elegido.objetivo, experiencia: elegido.experiencia,
    dias: elegido.dias, duracion: elegido.duracion,
  });
  hecho.estudio = estudio;

  // El gimnasio. Uno solo y con su nombre: el que quiera más los añade luego.
  if (elegido.gimnasio && elegido.gimnasio.nombre) {
    const yaHay = await puente.todos('gimnasios');
    const mismo = yaHay.find(
      (g) => g.nombre.trim().toLowerCase() === String(elegido.gimnasio.nombre).trim().toLowerCase());
    // LAS COORDENADAS TAMBIÉN. Se perdían: el mapa salía, elegías el sitio, y
    // el gimnasio se guardaba solo con el nombre y la dirección. O sea que todo
    // el trabajo de encontrarlo en el mapa se tiraba a la basura y luego había
    // que volver a buscarlo desde la ficha del gimnasio.
    const lat = Number(elegido.gimnasio.lat);
    const lon = Number(elegido.gimnasio.lon);
    hecho.gimnasio = mismo || await puente.guardar('gimnasios', {
      nombre: String(elegido.gimnasio.nombre).trim(),
      direccion: String(elegido.gimnasio.direccion || '').trim(),
      ...(Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : {}),
      ...(elegido.gimnasio.idPublico ? { idPublico: elegido.gimnasio.idPublico } : {}),
    });
  }

  // Los días de entreno, sacados del reparto QUE DECIDE LA CIENCIA, no de una
  // lista fija. Solo si no hay ninguno: si ya los tiene, mandan los suyos.
  const rutinas = await puente.todos('rutinas');
  if (!rutinas.length) {
    for (const [i, dia] of estudio.reparto.plan.entries()) {
      await puente.guardar('rutinas', {
        nombre: dia.nombre,
        grupos: dia.grupos,
        maquinas: [],
        // El plan nace vacío a propósito: sin máquinas dadas de alta, un plan
        // con seis huecos vacíos parece una app rota. `plan.js` deduce las
        // series y las reps de estos grupos hasta que haya máquinas.
        plan: [],
        // `orden` NO es decorativo: es la ROTACIÓN.
        orden: i,
        // Y estas dos son las que hacen que el estudio sirva de algo: al meter
        // una máquina en el día, se proponen ESTAS, no un 3×12 de fábrica.
        seriesPorDefecto: Math.max(2, Math.round(estudio.seriesPorGrupo / 2)),
        repsPorDefecto: estudio.reps.tipico,
      });
      hecho.rutinas++;
    }
  }

  await puente.ponAjuste(CLAVE, VERSION);
  return hecho;
}

/* ==========================================================================
 * EL DIBUJO
 *
 * `entorno` trae de `app.js` lo que es suyo y no de este módulo. Así este
 * fichero no depende de la pantalla entera y `app.js` no crece 700 líneas más.
 * ========================================================================== */

let E = null;

export function preparar(entorno) {
  E = entorno;
}

/**
 * Los pasos. Los cuatro del medio alimentan el estudio; el quinto ES el estudio.
 * Ese orden importa: se pregunta y se devuelve algo, en vez de pedir doce datos
 * y dar las gracias.
 */
const PASOS = ['hola', 'objetivo', 'experiencia', 'dias', 'tiempo', 'estudio',
               'gimnasio', 'rutinas', 'gente'];

export function abrir({ alTerminar } = {}) {
  const elegido = {
    // EL NOMBRE YA LO SABEMOS SI HAY CUENTA, y volver a pedirlo era el bug.
    // Carlos, 1-sep-2026: *«cuando entras te sale sin nombre, como si no
    // estuviese configurado, y te hace volver a meter el nombre, el usuario, las
    // anotaciones»*. Desde que la cuenta va DELANTE de la bienvenida, cuando se
    // llega aquí el perfil ya ha bajado de la nube: se rellena y se dice hola.
    nombre: (E && E.nombreSabido) || '', tema: null, colorI: 0,
    objetivo: 'musculo', experiencia: 'medio', dias: 3, duracion: 'media',
    gimnasio: null, rutinaImportada: null,
  };
  let paso = 0;

  const capa = document.createElement('div');
  capa.className = 'bv-capa';
  capa.setAttribute('role', 'dialog');
  capa.setAttribute('aria-modal', 'true');
  capa.setAttribute('aria-label', 'Bienvenida');
  capa.innerHTML = `
    <div class="bv-marco">
      <header class="bv-cabecera">
        <div class="bv-puntos" role="progressbar" aria-valuemin="1"
             aria-valuemax="${PASOS.length}" aria-valuenow="1"></div>
        <button class="boton-plano bv-saltar" type="button">Saltar</button>
      </header>
      <div class="bv-cuerpo" id="bv-cuerpo"></div>
      <footer class="bv-pie">
        <button class="boton-plano bv-atras" type="button" hidden>${E.icono('izquierda', 18)} Atrás</button>
        <button class="boton bv-seguir" type="button">Seguir</button>
      </footer>
    </div>`;
  document.body.appendChild(capa);
  document.body.style.overflow = 'hidden';

  const cuerpo = capa.querySelector('#bv-cuerpo');
  const bSeguir = capa.querySelector('.bv-seguir');
  const bAtras = capa.querySelector('.bv-atras');
  const puntos = capa.querySelector('.bv-puntos');

  const puente = {
    guardar: (a, d) => db.guardar(a, d),
    todos: (a) => db.todos(a),
    ponAjuste: (k, v) => db.ponAjuste(k, v),
  };

  const cerrar = async (aplicado) => {
    capa.remove();
    document.body.style.overflow = '';
    if (alTerminar) await alTerminar(aplicado || null, elegido);
  };

  const terminar = async () => {
    bSeguir.disabled = true;
    bSeguir.textContent = 'Preparando…';
    await cerrar(await aplicar(elegido, puente));
  };

  // Saltar NO es «no guardes nada»: lo ya elegido se respeta. Tirar cuatro
  // respuestas porque en la quinta se ha cansado sería castigarle por empezar.
  const saltar = async () => cerrar(await aplicar(elegido, puente));

  capa.querySelector('.bv-saltar').onclick = saltar;
  bAtras.onclick = () => { if (paso > 0) { paso--; pintarPaso(); } };
  bSeguir.onclick = () => {
    if (paso >= PASOS.length - 1) return terminar();
    paso++;
    pintarPaso();
  };

  function pintarPaso() {
    puntos.innerHTML = PASOS.map((_, i) =>
      `<span class="bv-punto ${i === paso ? 'activo' : ''} ${i < paso ? 'hecho' : ''}"></span>`).join('');
    puntos.setAttribute('aria-valuenow', String(paso + 1));
    bAtras.hidden = paso === 0;
    bSeguir.textContent = paso >= PASOS.length - 1 ? 'Empezar'
      : PASOS[paso] === 'estudio' ? 'Me vale' : 'Seguir';
    cuerpo.scrollTop = 0;
    cuerpo.classList.remove('bv-entra');
    void cuerpo.offsetWidth;
    cuerpo.classList.add('bv-entra');
    PINTAR[PASOS[paso]](cuerpo, elegido, { bSeguir, ir: (n) => { paso = n; pintarPaso(); } });
  }

  pintarPaso();
  return cerrar;
}

/* --------------------------------------------------------------------------
 * Las pantallas
 * ------------------------------------------------------------------------ */

const PINTAR = {};

/** Elegir una opción de una lista. Lo usan las tres preguntas del estudio. */
function listaDeOpciones(opciones, marcado, alElegir, extra = () => '') {
  return `<div class="bv-opciones" role="radiogroup">
    ${opciones.map((o) => `
      <button type="button" class="bv-opcion" role="radio" data-id="${o.id}"
              aria-checked="${o.id === marcado}">
        <span class="bv-opcion-t">${E.esc(o.nombre)}</span>
        <span class="bv-opcion-s">${E.esc(o.detalle || o.dice || '')}</span>
        ${extra(o)}
      </button>`).join('')}
  </div>`;
}

function engancharOpciones(c, elegido, campo, convertir = String) {
  const botones = [...c.querySelectorAll('.bv-opcion')];
  botones.forEach((b) => (b.onclick = () => {
    elegido[campo] = convertir(b.dataset.id);
    botones.forEach((o) => o.setAttribute('aria-checked',
      String(convertir(o.dataset.id) === elegido[campo])));
  }));
}

/** 1 · Hola: cómo te llamamos y de qué color va la app. */
PINTAR.hola = (c, elegido) => {
  // Si ya se sabe el nombre (has entrado en tu cuenta antes de llegar aquí), no
  // se pregunta: se saluda. El campo sigue, por si te lo quieres cambiar, pero
  // deja de ser un formulario que repite lo que ya has escrito.
  const sabido = !!(E && E.nombreSabido);
  c.innerHTML = `
    <h1 class="bv-titulo">${sabido
      ? `Hola, ${E.esc(E.nombreSabido)}`
      : 'Para no volver a olvidarte de cuánto levantas'}</h1>
    <p class="bv-texto">Apuntas el peso de cada máquina en dos toques y la próxima vez te lo
      encuentras puesto. Cuatro preguntas y te preparo un plan hecho para ti.</p>
    <div class="campo">
      <label for="bv-nombre">${sabido ? 'Así te llamamos' : '¿Cómo te llamamos?'}</label>
      <input type="text" id="bv-nombre" autocomplete="given-name" enterkeyhint="next"
             placeholder="Tu nombre" value="${E.esc(elegido.nombre || '')}">
      <p class="campo-nota">${sabido
        ? 'Viene de tu cuenta. Cámbialo si quieres otro aquí.'
        : 'Solo sale en tu perfil. Puedes dejarlo en blanco.'}</p>
    </div>
    <div class="campo">
      <label>Color de la app</label>
      <div class="bv-temas" role="radiogroup" aria-label="Color de la app">
        ${COLORES.map((t, i) => `
          <button type="button" class="bv-tema" role="radio" data-i="${i}"
                  aria-checked="${i === elegido.colorI}" aria-label="${E.esc(t.nombre)}">
            <span class="bv-muestra" style="--m-fondo:${t.fondo};--m-acento:${t.acento}"></span>
            <span>${E.esc(t.nombre)}</span>
          </button>`).join('')}
      </div>
      <p class="campo-nota">Se cambia cuando quieras en Ajustes, y hay más colores allí.</p>
    </div>`;

  c.querySelector('#bv-nombre').oninput = (e) => { elegido.nombre = e.target.value; };
  const botones = [...c.querySelectorAll('.bv-tema')];
  botones.forEach((b) => (b.onclick = () => {
    const i = Number(b.dataset.i);
    const t = COLORES[i];
    elegido.colorI = i;
    elegido.tema = { id: t.id, propio: t.propio || null };
    botones.forEach((o, j) => o.setAttribute('aria-checked', String(j === i)));
    // Se aplica EN EL ACTO. Elegir un color a ciegas y verlo tres pantallas
    // después no es elegir: es apostar.
    E.aplicarTema(t.id, t.propio || null);
  }));
};

/** 2 · Qué busca. Es lo que más mueve el plan. */
PINTAR.objetivo = (c, elegido) => {
  c.innerHTML = `
    <h1 class="bv-titulo">¿Qué buscas?</h1>
    <p class="bv-texto">Es la pregunta que más cambia el plan: no se entrena igual para ganar
      músculo que para levantar más peso. Puedes cambiarlo cuando quieras.</p>
    ${listaDeOpciones(C.OBJETIVOS, elegido.objetivo, null,
      (o) => `<span class="bv-opcion-x">${o.reps.min}-${o.reps.max}</span>`)}
    <p class="campo-nota">El número de la derecha son las repeticiones por serie con las que se
      trabaja normalmente para eso.</p>`;
  engancharOpciones(c, elegido, 'objetivo');
};

/** 3 · Experiencia. Ajusta el volumen y el margen de esfuerzo. */
PINTAR.experiencia = (c, elegido) => {
  c.innerHTML = `
    <h1 class="bv-titulo">¿Cuánto llevas entrenando?</h1>
    <p class="bv-texto">Quien empieza gana con menos volumen y necesita margen para aprender el
      movimiento. Quien lleva años necesita más para seguir mejorando.</p>
    ${listaDeOpciones(C.EXPERIENCIAS, elegido.experiencia)}`;
  engancharOpciones(c, elegido, 'experiencia');
};

/** 4 · Días. De aquí sale el reparto, y el reparto sale de la frecuencia. */
PINTAR.dias = (c, elegido) => {
  const opciones = C.REPARTOS.map((r) => ({
    id: String(r.dias), nombre: `${r.dias} días · ${r.nombre}`, dice: r.dice,
  }));
  c.innerHTML = `
    <h1 class="bv-titulo">¿Cuántos días puedes venir?</h1>
    <p class="bv-texto">Sé realista: el plan se calcula con los días que vas a cumplir de verdad,
      no con los que te gustaría.</p>
    ${listaDeOpciones(opciones, String(elegido.dias))}`;
  engancharOpciones(c, elegido, 'dias', Number);
};

/** 5 · Tiempo. Es lo que hace que el plan se pueda cumplir. */
PINTAR.tiempo = (c, elegido) => {
  c.innerHTML = `
    <h1 class="bv-titulo">¿Cuánto rato tienes?</h1>
    <p class="bv-texto">Una serie con su descanso son unos tres minutos. Con esto ajusto el
      volumen a lo que de verdad cabe: un plan que no se puede cumplir no sirve de nada.</p>
    ${listaDeOpciones(C.DURACIONES, elegido.duracion)}`;
  engancharOpciones(c, elegido, 'duracion');
};

/**
 * 6 · EL ESTUDIO. Es el motivo de las cuatro preguntas anteriores.
 *
 * Cada número lleva su porqué, y las fuentes están ahí, con autores, año,
 * revista y DOI, para quien quiera comprobarlo. Y los avisos salen ARRIBA, no
 * escondidos: si el plan no cabe en el tiempo que hay, eso es lo primero que
 * hay que saber, no una nota al pie.
 */
PINTAR.estudio = (c, elegido) => {
  const e = C.estudiar(elegido);
  const nombre = elegido.nombre ? `, ${elegido.nombre}` : '';

  c.innerHTML = `
    <h1 class="bv-titulo">Tu plan${E.esc(nombre)}</h1>
    <p class="bv-texto">${E.esc(C.resumen(e))}</p>

    ${e.avisos.length ? `<div class="bv-avisos">${e.avisos.map((a) => `
      <div class="bv-aviso ${a.grave ? 'grave' : a.bueno ? 'bueno' : ''}">
        <p>${E.esc(a.que)}</p>
        <small>${E.esc(fuenteCorta(a.fuente))}</small>
      </div>`).join('')}</div>` : ''}

    <div class="bv-cifras">
      ${cifra(e.seriesPorGrupo, 'series por grupo', 'a la semana')}
      ${cifra(e.reparto.dias, e.reparto.dias === 1 ? 'día' : 'días', 'por semana')}
      ${cifra(`~${e.minutosSesion}`, 'minutos', 'por sesión')}
      ${cifra(`${e.reps.min}-${e.reps.max}`, 'repeticiones', `dejando ${e.rir} en la recámara`)}
    </div>

    <h2 class="bv-h2">Tus días</h2>
    <p class="campo-nota" style="margin-top:0">${E.esc(e.reparto.dice)}</p>
    <div class="lista-elegible">
      ${e.reparto.plan.map((d) => `
        <div class="fila-elegible" style="cursor:default">
          <span class="fila-elegible-t">${E.esc(d.nombre)}</span>
          <span class="fila-elegible-s">${d.grupos.map((g) =>
            E.esc((C.GRUPOS.find((x) => x.id === g) || {}).nombre || g)).join(' · ')}</span>
        </div>`).join('')}
    </div>

    <h2 class="bv-h2">Series por músculo</h2>
    <div class="bv-tabla" role="table" aria-label="Series semanales por grupo muscular">
      ${e.grupos.map((g) => `
        <div class="bv-fila" role="row">
          <span role="cell">${E.esc(g.nombre)}</span>
          <span class="bv-barra" aria-hidden="true">
            <i style="width:${Math.min(100, (g.semanales / 22) * 100)}%"></i></span>
          <b role="cell">${g.semanales}</b>
          <small role="cell">${g.frecuencia}× por semana</small>
        </div>`).join('')}
    </div>

    <h2 class="bv-h2">Cómo subir el peso</h2>
    <div class="bv-tarjeta">
      <h3 class="bv-tarjeta-t">${E.esc(e.progresion.titulo)}</h3>
      <p class="bv-tarjeta-s" style="margin:0">${E.esc(e.progresion.dice)}</p>
    </div>

    <h2 class="bv-h2">Descanso entre series</h2>
    <div class="bv-tarjeta">
      <h3 class="bv-tarjeta-t">${Math.round(e.descansoSeg / 60 * 10) / 10} minutos</h3>
      <p class="bv-tarjeta-s" style="margin:0">Descansar poco para «apretar más» sale caro: con
        3 minutos entre series se gana más fuerza y más músculo que con 1, todo lo demás igual.</p>
    </div>

    <details class="bv-fuentes">
      <summary>De dónde sale esto (${e.fuentes.length} ${e.fuentes.length === 1 ? 'fuente' : 'fuentes'})</summary>
      ${e.fuentes.map((f) => `
        <div class="bv-fuente">
          <p class="bv-fuente-t">${E.esc(f.autores)} (${f.anio}). <i>${E.esc(f.titulo)}</i>.
            ${E.esc(f.revista)}.</p>
          <p class="bv-fuente-d">${E.esc(f.que_es)} · doi:${E.esc(f.doi)}</p>
          <p class="bv-fuente-s">${E.esc(f.dice)}</p>
        </div>`).join('')}
      <p class="campo-nota">Esto es un punto de partida razonable, no una receta médica. La
        mayoría de estos estudios son con gente joven y sana, y la variación entre personas es
        enorme: lo que mande al final son tus propios números, que es justo lo que apunta esta app.</p>
    </details>`;
};

function cifra(valor, titulo, pie) {
  return `<div class="bv-cifra"><b>${E.esc(String(valor))}</b>
    <span>${E.esc(titulo)}</span><small>${E.esc(pie)}</small></div>`;
}

function fuenteCorta(id) {
  const f = C.FUENTE_POR_ID.get(id);
  if (!f) return '';
  return `${f.autores.split(',')[0]} et al., ${f.anio}`;
}

/** 7 · Gimnasio: el de la nube si está, y si no, escrito a mano. */
/**
 * 7 · ¿Dónde entrenas?
 *
 * Carlos, 1-sep-2026: *«cuando le das a añadir un gym inicial no te deja buscar
 * uno real ni se ve en el mapa»*. Tenía razón: este paso solo miraba los
 * gimnasios que YA estuvieran dados de alta en la nube. Si el tuyo no estaba
 * —que es lo normal siendo de los primeros—, escribías el nombre a pelo y ya.
 * Sin dirección, sin coordenadas y sin forma de comprobar nada.
 *
 * Ahora hay las dos búsquedas, y son cosas distintas:
 *   · LA NUBE  → «este gimnasio ya existe, hay gente dentro». Te apuntas.
 *   · EL MAPA  → «esta es la dirección de verdad». Lo creas tú, bien puesto.
 * Van en la misma lista, marcadas, porque quien escribe «VivaGym Reus» no está
 * pensando en dos búsquedas: está buscando su gimnasio.
 *
 * Y el mapa se puede arrastrar, que es lo que pedía: *«un mapa abajo con el que
 * podías interactuar»*. Lo que quede en el centro es lo que se guarda.
 */
PINTAR.gimnasio = (c, elegido) => {
  const g0 = elegido.gimnasio || {};
  c.innerHTML = `
    <h1 class="bv-titulo">¿Dónde entrenas?</h1>
    <p class="bv-texto">Cada gimnasio lleva sus propias máquinas y sus propios pesos:
      la polea de un sitio no es la de otro. Empieza por uno; los demás se añaden luego.</p>
    <div class="campo">
      <label for="bv-gym">Nombre del gimnasio</label>
      <input type="search" id="bv-gym" enterkeyhint="search" autocomplete="off"
             placeholder="VivaGym, Basic-Fit, el del barrio…"
             value="${E.esc(g0.nombre || '')}">
    </div>
    <div class="campo">
      <label for="bv-gym-dir">Dirección <span class="campo-opcional">(opcional)</span></label>
      <input type="search" id="bv-gym-dir" enterkeyhint="search" autocomplete="off"
             placeholder="Calle, número, ciudad" value="${E.esc(g0.direccion || '')}">
    </div>
    <div id="bv-gyms" class="lista-elegible" aria-live="polite"></div>
    <div id="bv-gym-mapa"></div>
    <p class="campo-nota" id="bv-gym-nota">Escribe el nombre. Si alguien ya lo ha dado de alta,
      te saldrá aquí y podrás ver a los demás y sus marcas.</p>`;

  const caja = c.querySelector('#bv-gym');
  const cajaDir = c.querySelector('#bv-gym-dir');
  const lista = c.querySelector('#bv-gyms');
  const cajaMapa = c.querySelector('#bv-gym-mapa');
  const nota = c.querySelector('#bv-gym-nota');
  let reloj = null;
  let relojDir = null;

  const verMapa = (lat, lon) => {
    // SIN COORDENADAS TAMBIÉN SE PINTA UN MAPA DE VERDAD (2-sep-2026), abierto
    // sobre el país y arrastrable, con «usar mi ubicación» debajo — que estando
    // dentro del gimnasio es lo más rápido y lo único que no depende de que
    // OpenStreetMap conteste. Ojo: `alMover` NO salta por pintarlo. Solo cuando
    // se arrastra o se usa la ubicación, así que un gimnasio sigue pudiendo
    // guardarse sin coordenadas. Un centro por defecto es una vista, no un dato.
    C_MAPA.pintarMapa(cajaMapa, lat, lon, {
      // Lo que dejes en el centro es lo que se guarda. Sin esto el mapa sería
      // un adorno: se vería el sitio equivocado y no habría forma de moverlo.
      alMover: (la, lo) => {
        elegido.gimnasio = { ...(elegido.gimnasio || {}), lat: la, lon: lo };
        // Y AHORA YA SABEMOS DESDE DÓNDE BUSCAR.  (2-sep-2026)
        // Carlos: «solo salen algunos viva gym pero realmente no va» — y le
        // salían los de Bilbao, Granada y Málaga estando en Reus. En cuanto se
        // sabe dónde está, se repite la búsqueda: las mismas palabras, otro
        // orden, y el suyo el primero.
        if ((caja.value.trim() + cajaDir.value.trim()).length >= 3) {
          clearTimeout(relojDir);
          relojDir = setTimeout(() => buscarEnElMapa(
            cajaDir.value.trim().length >= 3 ? 'dir' : 'nombre'), 120);
        }
      },
    });
  };

  const elegir = (g) => {
    elegido.gimnasio = g;
    caja.value = g.nombre;
    if (g.direccion) cajaDir.value = g.direccion;
    lista.innerHTML = '';
    nota.textContent = g.idPublico
      ? `Te vas a apuntar a «${g.nombre}». Verás a los demás miembros desde Gimnasios.`
      : `Se creará «${g.nombre}» solo para ti.`;
    verMapa(g.lat, g.lon);
  };

  /** Pinta la lista mezclando lo de la nube y lo del mapa, marcado. */
  const pintarLista = (deLaNube, delMapa) => {
    if (!deLaNube.length && !delMapa.length) { lista.innerHTML = ''; return; }
    const filas = [
      ...deLaNube.map((g) => ({
        clave: `nube:${g.id}`,
        titulo: g.nombre,
        sub: [g.ciudad || g.direccion || '',
              g.n_miembros ? `${g.n_miembros} ${g.n_miembros === 1 ? 'persona' : 'personas'}` : '']
          .filter(Boolean).join(' · '),
        marca: 'Ya existe',
        elegir: () => elegir({
          nombre: g.nombre,
          direccion: g.direccion || g.ciudad || '',
          // `Number(null)` ES 0, Y 0 ES FINITO.  (1-sep-2026)
          // Aquí nació el «mapa en mitad del mar» de Carlos: eligió su gimnasio
          // de la nube, que estaba dado de alta SIN coordenadas, y este
          // `Number(null)` lo colocó en (0, 0) —el golfo de Guinea— con el pin
          // clavado como si fuera un dato bueno. Un dato que falta tiene que
          // seguir faltando: así sale el mapa vacío con «usar mi ubicación».
          lat: numeroONada(g.lat), lon: numeroONada(g.lon),
          idPublico: g.id,
        }),
      })),
      ...delMapa.map((r, i) => ({
        clave: `mapa:${i}`,
        titulo: r.titulo,
        // La dirección ENTERA: es la única forma de ver que te está proponiendo
        // la calle del mismo nombre en el pueblo de al lado.
        sub: r.completa,
        // «a 200 m» dice mucho más que «en el mapa»: separa el sitio que está
        // aquí al lado de la calle que existe en alguna parte. Es lo que pedía
        // Carlos con lo del McDonald's.
        marca: r.deCerca && Number.isFinite(r.metros)
          ? (r.metros < 1000 ? `a ${r.metros} m` : `a ${(r.metros / 1000).toFixed(1)} km`)
          : 'En el mapa',
        elegir: () => elegir({
          nombre: caja.value.trim() || r.titulo,
          direccion: r.direccion,
          lat: r.lat, lon: r.lon,
        }),
      })),
    ];
    lista.innerHTML = filas.map((f) => `
      <button type="button" class="pf-elegible fila-elegible">
        <span class="fila-elegible-t">${E.esc(f.titulo)}
          <span class="fila-marca">${E.esc(f.marca)}</span></span>
        <span class="fila-elegible-s">${E.esc(f.sub)}</span>
      </button>`).join('');
    lista.querySelectorAll('.fila-elegible').forEach((b, i) => (b.onclick = filas[i].elegir));
  };

  let ultimaNube = [];
  let ultimoMapa = [];

  const buscarEnLaNube = async () => {
    const t = caja.value.trim();
    if (t.length < 2 || !(await nube.hayNube())) { ultimaNube = []; }
    else {
      const r = await social.buscarGimnasios(t, 5);
      ultimaNube = (r.ok && r.gimnasios) ? r.gimnasios : [];
    }
    pintarLista(ultimaNube, ultimoMapa);
  };

  const buscarEnElMapa = async (cual) => {
    const n = caja.value.trim();
    const d = cajaDir.value.trim();
    // EL NOMBRE TAMBIÉN BUSCA, PERO NO PEGADO A LA DIRECCIÓN.  (2-sep-2026)
    //
    // Nominatim es un buscador de DIRECCIONES y con «VivaGym» devuelve nada;
    // el repuesto —Photon— sí es un buscador de sitios, y desde que una lista
    // vacía pasa el turno al siguiente (mapa.js) escribir «Basic-Fit Reus»
    // encuentra el gimnasio. Lo que NO puede hacerse es pegar las dos cajas:
    // «Viva gym reus Viva gym» no es un sitio en ningún mapa del mundo, y era
    // justo lo que se estaba preguntando. Se busca la caja que se está
    // escribiendo; si está vacía, la otra.
    const texto = cual === 'nombre' ? (n || d) : (d || n);
    if (texto.length < 3) { ultimoMapa = []; pintarLista(ultimaNube, ultimoMapa); return; }
    ultimoMapa = await C_MAPA.sugerir(texto, 4);
    pintarLista(ultimaNube, ultimoMapa);

    // SI EL BUSCADOR NO CONTESTA, SE DICE. Antes una lista vacía significaba a
    // la vez «no hay ninguna calle así» y «OpenStreetMap nos está bloqueando»,
    // y con eso desde fuera solo se puede decir «no detecta calles».
    const fallo = C_MAPA.ultimoFallo();
    if (!ultimoMapa.length) {
      nota.textContent = fallo
        ? `${fallo}. Escribe la dirección a mano: el gimnasio se crea igual.`
        : 'No encuentro esa dirección. Prueba con el código postal, o escríbela a mano.';
    }
    // Si solo hay una, se elige sola: un toque menos y el mapa ya sale.
    if (ultimoMapa.length === 1 && !elegido.gimnasio?.idPublico) {
      lista.querySelector('.fila-elegible:last-child')?.click();
    }
  };

  caja.oninput = () => {
    // Lo escrito vale por sí solo: si la nube no contesta, el gimnasio se crea
    // igual. Que la bienvenida dependa de tener cobertura sería justo el fallo
    // que esta app no puede permitirse.
    elegido.gimnasio = {
      ...(elegido.gimnasio || {}),
      nombre: caja.value.trim(),
      direccion: cajaDir.value.trim(),
    };
    clearTimeout(reloj);
    reloj = setTimeout(buscarEnLaNube, 260);
    clearTimeout(relojDir);
    relojDir = setTimeout(() => buscarEnElMapa('nombre'), 450);
  };

  cajaDir.oninput = () => {
    elegido.gimnasio = {
      ...(elegido.gimnasio || {}),
      nombre: caja.value.trim(),
      direccion: cajaDir.value.trim(),
    };
    clearTimeout(relojDir);
    // 450 ms: es UNA búsqueda por pausa, no la cascada de cinco con 1,1 s de
    // espera entre ellas que había antes. Aquella tardaba ocho segundos en
    // contestar desde una caja de texto, o sea que parecía que no hacía nada.
    relojDir = setTimeout(() => buscarEnElMapa('dir'), 450);
  };

  verMapa(numeroONada(g0.lat), numeroONada(g0.lon));

  // Se pregunta dónde estás al abrir el paso, no cuando se te ocurra pulsar el
  // botón: escribir en la caja no es ninguna de las dos cosas que hasta ahora
  // ponían el punto de partida, y por eso la primera búsqueda salía a ciegas.
  C_MAPA.situarme().then((sabido) => {
    if (!sabido || !c.isConnected) return;
    if ((caja.value.trim() + cajaDir.value.trim()).length < 3) return;
    buscarEnElMapa(cajaDir.value.trim().length >= 3 ? 'dir' : 'nombre');
  });
};

/**
 * Un número, o nada. Nunca un cero de relleno.
 *
 * `Number(null)`, `Number('')` y `Number(undefined)` valen 0, 0 y NaN: los dos
 * primeros se cuelan como coordenada válida y plantan el gimnasio en el golfo
 * de Guinea. Aquí lo que falta se queda faltando.
 */
function numeroONada(v) {
  if (v === null || v === undefined || v === '') return NaN;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

/**
 * La línea de debajo del nombre de una rutina de la lista.
 *
 * Solo dice los números QUE HAY. Un «0 me gusta» en las ocho oficiales el
 * primer día es verdad, pero se lee como «esto no le gusta a nadie» y no es lo
 * que pasa: es que la app acaba de nacer. Así que un cero no se enseña; lo que
 * se enseña de una oficial es que la trae la app, que es lo que de verdad
 * distingue a esa fila. Inflarlos a mano no entra: la regla del proyecto es que
 * un número que no se sabe no se inventa.
 */
function apuntesDeRutina(x) {
  const partes = [`${x.dias} ${x.dias === 1 ? 'día' : 'días'}`];
  partes.push(x.oficial ? 'la trae la app' : E.esc(x.alias_visible || x.alias || ''));
  if (x.n_likes) partes.push(`${x.n_likes} me gusta`);
  if (x.n_copias) partes.push(`${x.n_copias} se la ${x.n_copias === 1 ? 'ha' : 'han'} llevado`);
  return partes.filter(Boolean).join(' · ');
}

/**
 * 8 · Rutinas de la comunidad, filtradas por lo que ha contestado.
 *
 * YA NO PUEDE SALIR VACÍA. Antes esta pantalla decía «las rutinas de la gente
 * necesitan conexión» y dejaba un hueco justo en el paso que tiene que
 * enganchar a quien acaba de instalar la app —y la mitad de la gente instala
 * una app de gimnasio en el gimnasio, donde no hay cobertura—. Las ocho
 * oficiales viajan dentro del APK (`comunidad.js`), así que siempre hay algo
 * que elegir; las de la gente se suman por encima cuando hay red.
 */
PINTAR.rutinas = (c, elegido) => {
  const e = C.estudiar(elegido);
  c.innerHTML = `
    <h1 class="bv-titulo">¿Te llevas una rutina hecha?</h1>
    <p class="bv-texto">Rutinas de la comunidad, filtradas por lo tuyo. Se copian a tus días y
      las cambias como quieras. También puedes seguir sin ninguna: se te crearán los
      ${e.reparto.dias} días de <b>${E.esc(e.reparto.nombre)}</b> vacíos.</p>
    <div id="bv-rutinas" aria-live="polite"><p class="grafica-vacia">Buscando…</p></div>`;

  const zona = c.querySelector('#bv-rutinas');

  (async () => {
    const r = await social.rutinasPopulares({ nivel: elegido.experiencia, cuantos: 8 });
    let lista = r.rutinas || [];
    // Si el nivel que ha contestado deja la lista corta, se enseña todo: es
    // mejor una rutina de otro nivel que un hueco. Y se dice de qué nivel es.
    if (lista.length < 3) {
      lista = (await social.rutinasPopulares({ cuantos: 8 })).rutinas || [];
    }

    if (!lista.length) {
      // ESTADO VACÍO CON SALIDA. Un hueco en blanco se lee como «esto está roto»;
      // hay que decir qué pasa y qué se puede hacer. Con las ocho oficiales
      // dentro de la app esto ya no debería verse nunca, pero si algún día se
      // ve, que diga algo.
      zona.innerHTML = `<p class="grafica-vacia">Todavía no hay rutinas publicadas.
        Sigue adelante y, cuando montes la tuya, podrás publicarla desde Plan.</p>`;
      return;
    }
    zona.innerHTML = `${r.sinRed
      ? '<p class="campo-nota">Sin conexión: estas son las que trae la app.</p>' : ''}
      <div class="lista-elegible">${lista.map((x) => `
      <button type="button" class="pf-elegible fila-elegible" data-id="${x.id}"
              aria-pressed="false">
        <span class="fila-elegible-t">${E.esc(x.nombre)}</span>
        <span class="fila-elegible-s">${apuntesDeRutina(x)}</span>
        ${x.porQueSin
          ? `<span class="fila-elegible-n">${E.esc(x.porQueSin)}</span>` : ''}
      </button>`).join('')}</div>`;

    zona.querySelectorAll('.fila-elegible').forEach((b, i) => (b.onclick = () => {
      const ya = elegido.rutinaImportada && elegido.rutinaImportada.id === lista[i].id;
      elegido.rutinaImportada = ya ? null : lista[i];
      zona.querySelectorAll('.fila-elegible').forEach((o, j) =>
        o.setAttribute('aria-pressed', String(!ya && i === j)));
    }));
  })();
};

/** 9 · Gente: la cuenta y a quién seguir. Todo opcional, y se dice. */
PINTAR.gente = (c, elegido, { ir }) => {
  const hayCuenta = !!nube.usuario();
  const e = C.estudiar(elegido);
  c.innerHTML = `
    <h1 class="bv-titulo">${hayCuenta ? '¿A quién sigues?' : 'Ya está'}</h1>
    ${hayCuenta ? `
      <p class="bv-texto">Busca a la gente que conozcas. Verás sus rutinas y sus marcas,
        y ellos las tuyas si tu perfil es público.</p>
      <div class="campo">
        <label for="bv-gente">Buscar por nombre o usuario</label>
        <input type="search" id="bv-gente" enterkeyhint="search" autocomplete="off" placeholder="Dos letras bastan">
      </div>
      <div id="bv-gente-lista" class="lista-elegible" aria-live="polite"></div>`
    : `
      <p class="bv-texto">La app ya funciona entera sin cuenta: tus datos son tuyos y viven en
        este móvil. La cuenta solo hace falta para <b>que otros te vean</b>: seguir a gente,
        publicar rutinas y salir en la clasificación de tu gimnasio.</p>
      <div class="bv-tarjeta">
        <h2 class="bv-tarjeta-t">Sin cuenta también se entrena</h2>
        <p class="bv-tarjeta-s">Puedes crearla más tarde desde Perfil, cuando te apetezca.
          No se pierde nada.</p>
        <button class="boton boton-2" id="bv-crear-cuenta" type="button">Crear una cuenta</button>
      </div>`}
    <div class="bv-resumen">
      <h2 class="bv-tarjeta-t">Lo que has elegido</h2>
      <ul class="bv-lista">
        <li>${E.esc(C.objetivoDe(elegido.objetivo).nombre)} ·
            ${E.esc(C.experienciaDe(elegido.experiencia).nombre.toLowerCase())}</li>
        <li>${e.reparto.dias} días · ${E.esc(e.reparto.nombre)}</li>
        <li>${e.seriesPorGrupo} series por grupo y semana ·
            ${e.reps.min}-${e.reps.max} repeticiones</li>
        <li>${elegido.gimnasio && elegido.gimnasio.nombre
              ? E.esc(elegido.gimnasio.nombre) : 'Sin gimnasio todavía'}</li>
        ${elegido.rutinaImportada ? `<li>Rutina «${E.esc(elegido.rutinaImportada.nombre)}»</li>` : ''}
      </ul>
      <button class="boton-plano" id="bv-cambiar" type="button">Cambiar algo</button>
    </div>`;

  const bCambiar = c.querySelector('#bv-cambiar');
  if (bCambiar) bCambiar.onclick = () => ir(1);
  const bCuenta = c.querySelector('#bv-crear-cuenta');
  if (bCuenta) bCuenta.onclick = () => E.abrirCuenta();

  const caja = c.querySelector('#bv-gente');
  if (!caja) return;
  const lista = c.querySelector('#bv-gente-lista');
  let reloj = null;
  caja.oninput = () => {
    clearTimeout(reloj);
    reloj = setTimeout(async () => {
      const r = await social.buscarGente(caja.value, 8);
      if (!r.ok || !r.gente.length) { lista.innerHTML = ''; return; }
      lista.innerHTML = r.gente.map((p) => `
        <div class="fila-persona">
          <span class="fila-elegible-t">${E.esc(p.alias_visible || p.alias)}</span>
          <span class="fila-elegible-s">${E.esc(p.nombre || '')}${p.publico ? '' : ' · privado'}</span>
          <button class="boton-plano bv-seguir-a" data-alias="${E.esc(p.alias)}">Seguir</button>
        </div>`).join('');
      lista.querySelectorAll('.bv-seguir-a').forEach((b) => (b.onclick = async () => {
        b.disabled = true;
        const r2 = await social.seguir(b.dataset.alias);
        b.textContent = r2.ok ? (r2.estado === 'aceptado' ? 'Siguiendo' : 'Solicitado') : 'No pude';
        if (!r2.ok) { b.disabled = false; E.aviso(r2.motivo); }
      }));
    }, 260);
  };
};

/**
 * Lo que hay que hacer DESPUÉS de cerrar y recargar: llevarse la rutina elegida
 * y apuntarse al gimnasio público. Va fuera de `aplicar()` porque necesita la
 * app entera montada y porque puede fallar sin invalidar nada de lo anterior.
 */
export async function despues(elegido, { importarPaquete } = {}) {
  const hecho = { rutina: false, gimnasio: false };
  if (!elegido) return hecho;

  if (elegido.rutinaImportada && importarPaquete) {
    try {
      // `importarPaquete` ya cuenta la copia al traerse el paquete (una sola
      // llamada, `social.copiarRutina`). Antes se avisaba aparte y se podía
      // contar una copia de una rutina que no había entrado.
      if (await importarPaquete(elegido.rutinaImportada)) hecho.rutina = true;
    } catch (_) { /* una rutina que no entra no puede tumbar la bienvenida */ }
  }

  if (elegido.gimnasio && elegido.gimnasio.idPublico && nube.usuario()) {
    const r = await social.entrarEnGimnasio(elegido.gimnasio.idPublico, false);
    hecho.gimnasio = !!r.ok;
  }
  return hecho;
}
