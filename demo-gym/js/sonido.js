/* =============================================================================
 * sonido.js — El sonido y la vibración de la app. SINTETIZADO, sin un solo
 * fichero de audio.
 *
 * Carlos, 3-sep-2026: *«si puedes pulir la de cuando desbloqueas nuevas
 * medallas (…) le falta sonido, que vibre más. Es que subir el sonido estaría
 * muy bien, así como satisfactorio»*.
 *
 * POR QUÉ NO HAY MP3
 * ------------------
 * Un .mp3 son 30-60 KB por sonido dentro del APK, hay que cachearlo en el
 * service worker y hay que licenciarlo. Aquí todo sale de tres osciladores y un
 * filtro: pesa CERO, no se descarga nada (la app abre sin cobertura, esa es la
 * primera regla del proyecto) y no hay licencia de nadie que respetar.
 *
 * LO QUE HACE QUE UN SONIDO SE SIENTA «BIEN»
 * ------------------------------------------
 * · Un golpe grave (el cuerpo) + un acorde agudo (el brillo). Uno solo suena a
 *   pitido de microondas.
 * · Ataque de milisegundos y caída larga. Al revés suena a error del sistema.
 * · **La rareza sube por la escala**: común es un acorde bajo y seco; exótico es
 *   un arpegio entero con cola. Así el oído sabe lo que ha tocado antes de que
 *   el ojo lea el nombre.
 * · Y la vibración va CON el golpe, no después: si se separan medio segundo, el
 *   móvil parece estropeado.
 *
 * REGLAS
 * ------
 * · **Nunca suena sin que se haya tocado algo.** Los navegadores no dejan sonar
 *   antes del primer gesto, y además una app que suena sola en el gimnasio es
 *   una app que se desinstala.
 * · **Se puede apagar** (Ajustes › Sonido). Se pregunta a `estaEncendido`, que
 *   pone la app.
 * · **Nada de esto puede tumbar la app.** Todo va envuelto: sin AudioContext
 *   (un WebView viejo, el modo ahorro) la app funciona igual, callada.
 * ========================================================================== */

let ctx = null;
let maestro = null;
let encendido = true;

/* ---------------------------------------------------------------------------
 * HASTA QUE NO SE TOCA LA PANTALLA, NI SUENA NI VIBRA.
 *
 * No es una precaución: es lo que exige el navegador. Chrome escribe en la
 * consola «Blocked call to navigator.vibrate because user hasn't tapped on the
 * frame» y deja el AudioContext en `suspended`. Lo cazó `test_vestuario_real.py`
 * al celebrar una insignia nada más arrancar, que es exactamente cuando pasa:
 * la app se abre, hay un logro nuevo y todavía nadie ha tocado nada.
 *
 * El oyente se pone solo al cargar el módulo, en captura y de una sola vez, y
 * va envuelto porque en Node (los tests de cuentas) no hay `addEventListener`.
 * ------------------------------------------------------------------------- */
let hubo_gesto = false;
try {
  const marcar = () => { hubo_gesto = true; };
  addEventListener('pointerdown', marcar, { once: true, capture: true });
  addEventListener('keydown', marcar, { once: true, capture: true });
  addEventListener('touchstart', marcar, { once: true, capture: true });
} catch { /* fuera del navegador no hay gestos que esperar */ }

/** Si ya se ha tocado la pantalla alguna vez. Antes de eso, silencio. */
export function hayGesto() {
  return hubo_gesto;
}

/** La app decide si el sonido está encendido (es un ajuste suyo). */
export function configurar({ sonido = true } = {}) {
  encendido = !!sonido;
}

export function estaEncendido() {
  return encendido;
}

/**
 * Crea (o despierta) el contexto de audio. Hay que llamarlo DENTRO de un
 * gesto: un toque, un clic. Fuera de uno, el navegador lo deja «suspended» y no
 * suena nada — y eso se ve como «el sonido no va» cuando en realidad no se ha
 * pedido en el sitio correcto.
 */
export function despertar() {
  if (!encendido || !hubo_gesto) return null;
  try {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      maestro = ctx.createGain();
      // Techo general: por muchas voces que se junten, nunca satura.
      maestro.gain.value = 0.5;
      maestro.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/**
 * LA SALA. Un `delay` con realimentación y un filtro que se come los agudos en
 * cada rebote, que es lo que hace una pared de verdad.
 *
 * Sin esto, un golpe sintetizado suena a juguete: se corta en seco y el oído lo
 * lee como «esto es un pitido», no como «esto ha pasado en algún sitio».
 */
let sala = null;
function laSala() {
  if (!ctx) return null;
  if (sala) return sala;
  const d = ctx.createDelay(0.6);
  d.delayTime.value = 0.115;
  const realim = ctx.createGain();
  realim.gain.value = 0.34;
  const apaga = ctx.createBiquadFilter();
  apaga.type = 'lowpass';
  apaga.frequency.value = 2400;
  const salida = ctx.createGain();
  salida.gain.value = 0.5;
  d.connect(apaga); apaga.connect(realim); realim.connect(d);
  d.connect(salida); salida.connect(maestro);
  sala = d;
  return sala;
}

/** Una voz: oscilador → filtro → envolvente. Es el ladrillo de todo lo demás. */
function voz({ tipo = 'sine', de = 440, a = null, cuando = 0, dura = 0.3,
               vol = 0.2, ataque = 0.006, filtro = null, q = 1, eco = 0 } = {}) {
  if (!ctx) return;
  const t0 = ctx.currentTime + cuando;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = tipo;
  osc.frequency.setValueAtTime(de, t0);
  if (a && a !== de) osc.frequency.exponentialRampToValueAtTime(Math.max(1, a), t0 + dura);

  let ultimo = g;
  if (filtro) {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(filtro[0], t0);
    f.frequency.exponentialRampToValueAtTime(Math.max(60, filtro[1]), t0 + dura);
    f.Q.value = q;
    g.connect(f);
    ultimo = f;
  }
  // Envolvente: sube en milisegundos y cae exponencial. Es lo que hace que
  // suene a instrumento y no a pitido.
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t0 + ataque);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dura);

  osc.connect(g);
  ultimo.connect(maestro);
  if (eco > 0) {
    const envio = ctx.createGain();
    envio.gain.value = eco;
    ultimo.connect(envio);
    const s = laSala();
    if (s) envio.connect(s);
  }
  osc.start(t0);
  osc.stop(t0 + dura + 0.05);
}

/** Ruido blanco corto: el «aire» de un golpe o de un barrido. */
function ruido({ cuando = 0, dura = 0.25, vol = 0.12, corte = 1800, sube = false } = {}) {
  if (!ctx) return;
  const t0 = ctx.currentTime + cuando;
  const n = Math.floor(ctx.sampleRate * dura);
  const buf = ctx.createBuffer(1, Math.max(1, n), ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = sube ? 'highpass' : 'lowpass';
  f.frequency.setValueAtTime(sube ? 200 : corte, t0);
  f.frequency.linearRampToValueAtTime(sube ? corte : 400, t0 + dura);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dura);
  src.connect(f); f.connect(g); g.connect(maestro);
  src.start(t0);
  src.stop(t0 + dura + 0.02);
}

/* --------------------------------------------------------------------------
 * LOS SONIDOS DE LA APP
 * ------------------------------------------------------------------------ */

/** El tic de la cinta que gira. Se llama muchas veces por segundo: es barato. */
export function tic(agudo = 1) {
  if (!despertar()) return;
  // El tic SUBE de tono según frena la cinta. Es el truco viejo de las ruletas:
  // el oído lee «esto se está parando» antes de que lo vea el ojo.
  const f = 760 * Math.max(0.6, Math.min(2.2, agudo));
  voz({ tipo: 'triangle', de: f, a: f * 0.78, dura: 0.045, vol: 0.085, ataque: 0.002 });
  voz({ tipo: 'sine', de: f * 2, dura: 0.03, vol: 0.03 });
}

/** El barrido que sube mientras la cinta frena. Avisa de que algo va a pasar. */
export function subida(dura = 1.6) {
  if (!despertar()) return;
  // Tres capas: el barrido que sube, el aire que lo acompaña y un retumbe grave
  // que crece por debajo. La tercera no se oye por separado; se NOTA.
  voz({ tipo: 'sawtooth', de: 110, a: 660, dura, vol: 0.08, ataque: 0.2, filtro: [400, 3200], q: 6 });
  voz({ tipo: 'sine', de: 42, a: 62, dura, vol: 0.22, ataque: dura * 0.7 });
  ruido({ dura, vol: 0.05, corte: 6000, sube: true });
}

/* Las notas de cada rareza. Suben por la escala, y a partir de épica el acorde
 * tiene más voces: eso es lo que hace que una legendaria suene «a más» aunque
 * el volumen sea el mismo. */
const ACORDES = {
  comun:      [196.0, 246.9],
  pococomun:  [220.0, 277.2, 329.6],
  raro:       [261.6, 329.6, 392.0],
  epico:      [293.7, 370.0, 440.0, 587.3],
  legendario: [329.6, 415.3, 493.9, 659.3],
  mitico:     [392.0, 493.9, 587.3, 784.0, 987.8],
  exotico:    [261.6, 329.6, 392.0, 523.3, 659.3, 784.0, 1046.5],
};

/** El golpe de la revelación. Cuerpo grave + acorde + brillo según la rareza. */
export function impacto(rarezaId = 'comun') {
  if (!despertar()) return;
  const notas = ACORDES[rarezaId] || ACORDES.comun;
  const grande = ['legendario', 'mitico', 'exotico'].includes(rarezaId);

  // 1. El cuerpo: un golpe grave que baja, y por debajo un sub que se queda.
  //    Es lo que se siente en el pecho; sin él, el acorde flota.
  voz({ tipo: 'sine', de: 150, a: 45, dura: grande ? 0.7 : 0.42, vol: 0.5, ataque: 0.004 });
  voz({ tipo: 'sine', de: 58, a: 34, dura: grande ? 1.5 : 0.8, vol: 0.34, ataque: 0.01 });
  ruido({ dura: 0.18, vol: grande ? 0.18 : 0.1, corte: 2600 });

  // 2. El acorde: todas las notas a la vez para lo normal, en arpegio para lo
  //    gordo. Un arpegio dura más y por eso se recuerda más.
  const paso = grande ? 0.075 : 0;
  notas.forEach((f, i) => {
    voz({ tipo: 'triangle', de: f, cuando: i * paso, dura: grande ? 1.5 : 0.7,
          vol: 0.16 - i * 0.012, ataque: 0.01, eco: grande ? 0.5 : 0.22 });
    // La quinta arriba, muy floja: da el brillo sin ensuciar el acorde.
    voz({ tipo: 'sine', de: f * 2, cuando: i * paso, dura: grande ? 1.1 : 0.5, vol: 0.05,
          eco: grande ? 0.4 : 0 });
  });

  // 3. La cola: solo de legendaria para arriba. Es la diferencia entre «bien» y
  //    «hostia».
  if (grande) {
    const alto = notas[notas.length - 1] * 2;
    [0, 0.09, 0.18, 0.27].forEach((c, i) => {
      voz({ tipo: 'sine', de: alto * (1 + i * 0.25), cuando: 0.35 + c, dura: 1.2, vol: 0.055 });
    });
  }
  if (rarezaId === 'exotico') {
    // El pad que se queda debajo: un exótico no se acaba, se apaga.
    voz({ tipo: 'sine', de: 130.8, cuando: 0.1, dura: 3.4, vol: 0.1, ataque: 0.4 });
    voz({ tipo: 'sine', de: 196.0, cuando: 0.1, dura: 3.4, vol: 0.08, ataque: 0.5 });
    // Y una campana. Las campanas son parciales que NO están en la escala: por
    // eso una campana suena a campana y no a flauta.
    [1, 2.76, 5.4, 8.9].forEach((mult, i) => {
      voz({ tipo: 'sine', de: 523.3 * mult, cuando: 0.42, dura: 3.6 - i * 0.5,
            vol: 0.09 / (i + 1), ataque: 0.004, eco: 0.6 });
    });
  }
}

/** Magnesio: monedas cayendo. Cuatro tics agudos que se apagan. */
export function monedas(n = 4) {
  if (!despertar()) return;
  for (let i = 0; i < n; i++) {
    voz({ tipo: 'triangle', de: 1400 + i * 180, a: 1100 + i * 120,
          cuando: i * 0.055, dura: 0.22, vol: 0.1 - i * 0.012 });
  }
}

/** Desbloquear una medalla o una insignia. El sonido más «de logro» de la app. */
export function logro() {
  if (!despertar()) return;
  voz({ tipo: 'sine', de: 160, a: 60, dura: 0.5, vol: 0.42, ataque: 0.004 });
  ruido({ dura: 0.2, vol: 0.12, corte: 3000 });
  // Do–Mi–Sol–Do: el acorde mayor de toda la vida, en arpegio ascendente.
  [523.3, 659.3, 784.0, 1046.5].forEach((f, i) => {
    voz({ tipo: 'triangle', de: f, cuando: i * 0.085, dura: 1.1, vol: 0.16 - i * 0.02,
          ataque: 0.008, eco: 0.45 });
    voz({ tipo: 'sine', de: f * 2, cuando: i * 0.085, dura: 0.7, vol: 0.045 });
  });
  voz({ tipo: 'sine', de: 65.4, dura: 1.2, vol: 0.3, ataque: 0.01 });
}

/** Un toque seco de interfaz. Para los botones que abren algo. */
export function toque() {
  if (!despertar()) return;
  voz({ tipo: 'triangle', de: 620, a: 480, dura: 0.09, vol: 0.11, ataque: 0.003 });
}

/* --------------------------------------------------------------------------
 * LA VIBRACIÓN
 *
 * Vive aquí y no en `app.js` porque va PEGADA al sonido: la rareza decide las
 * dos cosas a la vez y separarlas es como acaban desincronizadas.
 *
 * `navigator.vibrate` no existe en escritorio, y en el móvil puede estar
 * apagada en los ajustes del sistema. Se intenta y punto.
 * ------------------------------------------------------------------------ */
export const PATRON = {
  comun:      [14],
  pococomun:  [16, 40, 16],
  raro:       [20, 40, 20, 40, 20],
  epico:      [26, 40, 26, 40, 40],
  legendario: [30, 50, 30, 50, 30, 50, 70],
  mitico:     [34, 40, 34, 40, 34, 40, 34, 60, 110],
  exotico:    [40, 50, 40, 50, 40, 50, 40, 50, 60, 80, 160],
  logro:      [24, 45, 24, 45, 60],
  tic:        [6],
};

export function vibrar(patron) {
  try {
    if (!hubo_gesto || !navigator.vibrate) return;
    navigator.vibrate(Array.isArray(patron) ? patron : (PATRON[patron] || [12]));
  } catch { /* da igual */ }
}

/** Sonido + vibración de una rareza, juntos y a la vez. */
export function celebrarRareza(rarezaId) {
  impacto(rarezaId);
  vibrar(PATRON[rarezaId] || PATRON.comun);
}

/** Sonido + vibración de un logro nuevo. */
export function celebrarLogro() {
  logro();
  vibrar(PATRON.logro);
}
