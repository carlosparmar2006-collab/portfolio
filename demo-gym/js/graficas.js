/* =============================================================================
 * graficas.js — Gráficas en SVG, sin librerías (funcionan sin cobertura).
 *
 * Decisiones de diseño (siguen el método de dataviz, no el gusto del momento):
 *  · Una sola escala vertical. Nunca dos ejes: engañan al ojo.
 *  · Paleta VALIDADA para daltonismo y contraste en claro y oscuro
 *    (blue/orange/aqua del set de referencia; comprobada con el validador).
 *  · Serie única = sin leyenda; el título ya dice qué es.
 *  · Rejilla y ejes discretos; la línea es lo único que pesa.
 *  · Etiqueta directa en el último punto y en el récord — no un número en cada
 *    punto, que es ruido.
 *  · SIEMPRE capa de exploración: se arrastra el dedo y se lee cada punto.
 *    Es justo lo que pidió Carlos ("deslizables para mirar los datos").
 *  · Toda gráfica ofrece "ver tabla": si el color falla (impresión, daltonismo,
 *    sol de cara), el dato sigue estando.
 * ========================================================================== */

export const SERIES = ['var(--serie-1)', 'var(--serie-2)', 'var(--serie-3)', 'var(--serie-4)', 'var(--serie-5)'];

const NS = 'http://www.w3.org/2000/svg';

function el(nombre, attrs = {}) {
  const n = document.createElementNS(NS, nombre);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
}

/**
 * EL BUG DEL «ESTIRADO» (Carlos, 31-jul-2026: «arregla el formato de las
 * gráficas porque están estiradas y no se ven bien»).
 *
 * Todas las gráficas se dibujaban en un lienzo FIJO de 600 de ancho y se
 * estampaban con `preserveAspectRatio="none"` en un hueco de ~375 px. Eso no
 * recorta: DEFORMA. Todo se comprimía al 62 % en horizontal y se estiraba en
 * vertical, así que las letras salían flacas, los puntos eran huevos y los
 * números del eje se pisaban.
 *
 * La cura es dibujar en las medidas REALES del hueco: el viewBox pasa a ser el
 * ancho en píxeles del contenedor, así que la escala es 1:1 y nada se deforma.
 * Y como el ancho cambia (girar el móvil, el panel del HUD), se vuelve a
 * dibujar cuando cambia de verdad.
 */
function medidas(contenedor, { proporcion = 0.62, minAlto = 200, maxAlto = 300 } = {}) {
  // Un contenedor todavía sin maquetar mide 0. Ahí NO se dibuja a 0 px (eso es
  // el bug de la esfera invisible del HUD): se usa un ancho decente y el
  // observador repinta en cuanto el hueco existe de verdad.
  //
  // Y se RESTA el relleno: `clientWidth` lo incluye, así que sin esto el lienzo
  // salía 24 px más ancho que el hueco real y el navegador lo encogía al 92 %.
  // No deformaba (la escala era la misma en los dos ejes), pero las letras de
  // 11 px se quedaban en 10,2 y para eso mejor pedir el tamaño bien.
  let ancho = contenedor.clientWidth;
  try {
    const cs = getComputedStyle(contenedor);
    ancho -= (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
  } catch { /* sin ventana (tests en Node): se queda el ancho de referencia */ }
  const W = Math.round(ancho) || 600;
  return { W, H: Math.round(Math.min(maxAlto, Math.max(minAlto, W * proporcion))) };
}

function alRedimensionar(contenedor, repintar) {
  if (typeof ResizeObserver === 'undefined') return;      // WebView antigua: sin repintado
  let ultimo = Math.round(contenedor.clientWidth);
  const obs = new ResizeObserver(() => {
    const ahora = Math.round(contenedor.clientWidth);
    // El umbral evita el bucle: repintar cambia el ALTO, y sin él un alto nuevo
    // dispararía otro repintado hasta el infinito.
    if (!ahora || Math.abs(ahora - ultimo) < 8) return;
    ultimo = ahora;
    obs.disconnect();          // el dibujo nuevo instala su propio observador
    repintar();
  });
  obs.observe(contenedor);
}

/**
 * Qué puntos del eje X llevan etiqueta.
 * Etiquetamos uno de cada N y SIEMPRE el último (es el que más se mira), pero
 * si el último cae pegado al anterior se quita el anterior: dos fechas
 * encima la una de la otra no se leen y ensucian toda la gráfica.
 *
 * Cuántas caben depende del ANCHO REAL: en un móvil de 375 px caben 4, en el
 * panel del PC 7. Antes era un 5 fijo pensado para el lienzo de 600.
 */
function cabenEtiquetas(W) {
  return Math.max(3, Math.min(7, Math.floor(W / 82)));
}

/**
 * Y ahora en PÍXELES, que es donde se pisan de verdad.
 *
 * Contar índices no basta: «sem. 31 may» ocupa 62 px y «7 jul» 30. Con el
 * lienzo a 288 px salían cuatro etiquetas y dos parejas se solapaban —medido en
 * la app, no supuesto—, y un eje ilegible es exactamente la queja de Carlos.
 *
 * Se recorre desde el FINAL: la última etiqueta es la que más se mira (es
 * «ahora») y por eso es la que nunca se cae. Se estima el ancho por el número
 * de letras porque medir de verdad obligaría a pintar, medir y volver a pintar.
 */
function etiquetasSinPisarse(puntos, x, W, M, maximo) {
  const ANCHO_LETRA = 5.75;            // 11 px de la fuente del sistema: 5,6 medido, +holgura
  const ultimo = puntos.length - 1;
  const cajas = indicesEtiquetados(puntos.length, maximo).map((i) => {
    const w = String(puntos[i].etiqueta ?? '').length * ANCHO_LETRA + 6;   // +6 de aire
    const cx = x(i);
    if (i === 0) return { i, x1: cx, x2: cx + w };
    if (i === ultimo) return { i, x1: cx - w, x2: cx };
    return { i, x1: cx - w / 2, x2: cx + w / 2 };
  });

  const salen = [];
  for (let k = cajas.length - 1; k >= 0; k--) {
    if (!salen.length || cajas[k].x2 <= salen[salen.length - 1].x1) salen.push(cajas[k]);
  }
  return salen.map((c) => c.i).reverse();
}

// Se exportan SOLO para poder comprobarlas en Node sin abrir un navegador. La
// geometría del eje es donde se pisan las etiquetas, y eso se mide, no se mira.
export const _geometria = { cabenEtiquetas, etiquetasSinPisarse, indicesEtiquetados, escalaBonita };

function indicesEtiquetados(n, maxEtiquetas = 5) {
  if (n <= 1) return [0];
  const cada = Math.max(1, Math.ceil(n / maxEtiquetas));
  const ultimo = n - 1;
  const idx = [];
  for (let i = 0; i < n; i += cada) idx.push(i);
  const holgura = cada * 0.6;
  return [...idx.filter((i) => ultimo - i >= holgura), ultimo];
}

function escalaBonita(min, max, pasos = 4) {
  if (min === max) {
    min = Math.max(0, min - 1);
    max = max + 1;
  }
  const bruto = (max - min) / pasos;
  const mag = Math.pow(10, Math.floor(Math.log10(bruto)));
  const norm = bruto / mag;
  const paso = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
  return { min: Math.floor(min / paso) * paso, max: Math.ceil(max / paso) * paso, paso };
}

/* ==========================================================================
 * Gráfica de líneas con exploración táctil
 * ==========================================================================
 * puntos: [{etiqueta, valor, extra?}]   valor = número a dibujar
 * opciones: {unidad, titulo, color, formato(v), alturaMin}
 */
export function lineaTemporal(contenedor, puntos, opciones = {}) {
  const { unidad = 'kg', color = SERIES[0], formato = null, vacio = 'Aún no hay datos suficientes.' } = opciones;

  contenedor.innerHTML = '';
  contenedor.classList.add('grafica');

  if (!puntos || puntos.length === 0) {
    contenedor.innerHTML = `<p class="grafica-vacia">${vacio}</p>`;
    return { destruir() {} };
  }

  const fmt = formato || ((v) => `${Math.round(v * 10) / 10} ${unidad}`);

  // --- lectura grande: lo primero que ve el ojo -----------------------------
  const lectura = document.createElement('div');
  lectura.className = 'grafica-lectura';
  lectura.innerHTML = `<span class="gl-valor"></span><span class="gl-cuando"></span><span class="gl-extra"></span>`;
  contenedor.appendChild(lectura);

  const { W, H } = medidas(contenedor, { minAlto: 210 });
  const M = { arriba: 18, derecha: 16, abajo: 30, izquierda: 46 };
  const anchoUtil = W - M.izquierda - M.derecha;
  const altoUtil = H - M.arriba - M.abajo;

  const valores = puntos.map((p) => p.valor);
  const esc = escalaBonita(Math.min(...valores), Math.max(...valores));
  const x = (i) => M.izquierda + (puntos.length === 1 ? anchoUtil / 2 : (i / (puntos.length - 1)) * anchoUtil);
  const y = (v) => M.arriba + altoUtil - ((v - esc.min) / (esc.max - esc.min)) * altoUtil;

  const svg = el('svg', {
    viewBox: `0 0 ${W} ${H}`,
    class: 'grafica-svg',
    role: 'img',
    'aria-label': opciones.titulo || 'Evolución',
  });

  // --- rejilla y eje Y (recesivos) -----------------------------------------
  for (let v = esc.min; v <= esc.max + 1e-9; v += esc.paso) {
    const yy = y(v);
    svg.appendChild(el('line', { x1: M.izquierda, y1: yy, x2: W - M.derecha, y2: yy, class: 'g-rejilla' }));
    const t = el('text', { x: M.izquierda - 8, y: yy + 4, class: 'g-eje', 'text-anchor': 'end' });
    t.textContent = Math.round(v * 10) / 10;
    svg.appendChild(t);
  }

  // --- área bajo la línea (muy suave, solo da cuerpo) -----------------------
  const idGrad = `g${Math.random().toString(36).slice(2, 8)}`;
  const defs = el('defs');
  const grad = el('linearGradient', { id: idGrad, x1: 0, y1: 0, x2: 0, y2: 1 });
  grad.appendChild(el('stop', { offset: '0%', 'stop-color': color, 'stop-opacity': '0.22' }));
  grad.appendChild(el('stop', { offset: '100%', 'stop-color': color, 'stop-opacity': '0' }));
  defs.appendChild(grad);
  svg.appendChild(defs);

  const dLinea = puntos.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.valor).toFixed(1)}`).join(' ');
  svg.appendChild(
    el('path', {
      d: `${dLinea} L${x(puntos.length - 1).toFixed(1)},${(M.arriba + altoUtil).toFixed(1)} L${x(0).toFixed(1)},${(M.arriba + altoUtil).toFixed(1)} Z`,
      fill: `url(#${idGrad})`,
      stroke: 'none',
    })
  );
  svg.appendChild(el('path', { d: dLinea, fill: 'none', stroke: color, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));

  // --- marcadores ----------------------------------------------------------
  // Un punto por dato solo mientras se distingan. Con 24 sesiones en 228 px un
  // punto de 9 px se toca con el de al lado y la línea se convierte en un
  // collar de bolas: a partir de ahí se marcan solo los que SIGNIFICAN algo —
  // el récord, el último y el periodo en curso — y el resto lo cuenta la línea.
  const iMaximo = valores.indexOf(Math.max(...valores));
  const separacion = puntos.length > 1 ? anchoUtil / (puntos.length - 1) : anchoUtil;
  const todosLosPuntos = separacion >= 14;
  const marcas = puntos.map((p, i) => {
    const clave = todosLosPuntos || i === iMaximo || i === puntos.length - 1 || p.enCurso;
    // el punto del periodo en curso va HUECO: todavía puede subir
    const c = el('circle', {
      cx: x(i),
      cy: y(p.valor),
      r: clave ? 4.5 : 0,
      fill: p.enCurso ? 'var(--superficie)' : color,
      stroke: p.enCurso ? color : 'var(--superficie)',
      'stroke-width': 2,
      class: 'g-punto',
    });
    svg.appendChild(c);
    return c;
  });
  // Al explorar con el dedo, el punto elegido aparece aunque estuviera oculto.
  const verMarca = (i) => marcas.forEach((m, k) => m.setAttribute('r', k === i ? 5.5 : (todosLosPuntos || k === iMaximo || k === puntos.length - 1 || puntos[k].enCurso) ? 4.5 : 0));

  // --- etiquetas directas: solo récord y último ---------------------------
  const iMax = iMaximo;
  const iUlt = puntos.length - 1;
  for (const i of new Set([iMax, iUlt])) {
    const arriba = y(puntos[i].valor) > M.arriba + 26;
    const t = el('text', {
      x: Math.min(Math.max(x(i), M.izquierda + 12), W - M.derecha - 12),
      y: arriba ? y(puntos[i].valor) - 12 : y(puntos[i].valor) + 20,
      class: i === iMax && iMax !== iUlt ? 'g-etiqueta g-etiqueta-max' : 'g-etiqueta',
      'text-anchor': 'middle',
    });
    t.textContent = fmt(puntos[i].valor);
    svg.appendChild(t);
  }

  // --- eje X: primera, última y alguna intermedia (sin amontonar) ---------
  for (const i of etiquetasSinPisarse(puntos, x, W, M, cabenEtiquetas(W))) {
    const t = el('text', { x: x(i), y: H - 8, class: 'g-eje', 'text-anchor': i === 0 ? 'start' : i === iUlt ? 'end' : 'middle' });
    t.textContent = puntos[i].etiqueta;
    svg.appendChild(t);
  }

  // --- capa de exploración -------------------------------------------------
  const guia = el('line', { y1: M.arriba, y2: M.arriba + altoUtil, class: 'g-guia', style: 'opacity:0' });
  svg.appendChild(guia);
  const foco = el('circle', { r: 7, class: 'g-foco', fill: color, stroke: 'var(--superficie)', 'stroke-width': 3, style: 'opacity:0' });
  svg.appendChild(foco);
  const capa = el('rect', { x: 0, y: 0, width: W, height: H, fill: 'transparent', class: 'g-capa' });
  svg.appendChild(capa);

  const glValor = lectura.querySelector('.gl-valor');
  const glCuando = lectura.querySelector('.gl-cuando');
  const glExtra = lectura.querySelector('.gl-extra');

  function mostrar(i) {
    const p = puntos[i];
    glValor.textContent = fmt(p.valor);
    glCuando.textContent = p.etiqueta + (p.enCurso ? ' · en curso' : '');
    glExtra.textContent = p.extra || '';
    guia.setAttribute('x1', x(i));
    guia.setAttribute('x2', x(i));
    guia.style.opacity = '1';
    foco.setAttribute('cx', x(i));
    foco.setAttribute('cy', y(p.valor));
    foco.style.opacity = '1';
    marcas.forEach((m, k) => m.classList.toggle('g-punto-activo', k === i));
    verMarca(i);
  }

  function indiceEn(clienteX) {
    const caja = svg.getBoundingClientRect();
    const rel = ((clienteX - caja.left) / caja.width) * W;
    let mejor = 0;
    let dist = Infinity;
    puntos.forEach((_, i) => {
      const d = Math.abs(x(i) - rel);
      if (d < dist) {
        dist = d;
        mejor = i;
      }
    });
    return mejor;
  }

  const alMover = (e) => {
    const cx = e.touches ? e.touches[0].clientX : e.clientX;
    mostrar(indiceEn(cx));
    if (e.touches) e.preventDefault(); // que no arrastre la página al explorar
  };
  capa.addEventListener('pointerdown', alMover);
  capa.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'mouse' || e.buttons) alMover(e);
  });
  capa.addEventListener('touchmove', alMover, { passive: false });

  contenedor.appendChild(svg);
  mostrar(iUlt); // arranca mostrando lo más reciente

  // --- alternativa en tabla (accesibilidad y "quiero los números") ---------
  const acciones = document.createElement('div');
  acciones.className = 'grafica-acciones';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'boton-plano';
  btn.textContent = 'Ver tabla';
  const tabla = document.createElement('div');
  tabla.className = 'grafica-tabla oculto';
  tabla.innerHTML =
    '<table><thead><tr><th>Cuándo</th><th>Valor</th><th>Detalle</th></tr></thead><tbody>' +
    puntos.map((p) => `<tr><td>${p.etiqueta}</td><td>${fmt(p.valor)}</td><td>${p.extra || ''}</td></tr>`).join('') +
    '</tbody></table>';
  btn.addEventListener('click', () => {
    tabla.classList.toggle('oculto');
    btn.textContent = tabla.classList.contains('oculto') ? 'Ver tabla' : 'Ocultar tabla';
  });
  acciones.appendChild(btn);
  contenedor.appendChild(acciones);
  contenedor.appendChild(tabla);

  alRedimensionar(contenedor, () => lineaTemporal(contenedor, puntos, opciones));

  return {
    destruir() {
      contenedor.innerHTML = '';
    },
  };
}

/* ==========================================================================
 * Barras — para volumen por periodo (semana / mes / trimestre)
 * ========================================================================== */
export function barras(contenedor, puntos, opciones = {}) {
  const { color = SERIES[0], formato = (v) => `${Math.round(v)} kg`, vacio = 'Aún no hay datos.' } = opciones;
  contenedor.innerHTML = '';
  contenedor.classList.add('grafica');
  if (!puntos || !puntos.length) {
    contenedor.innerHTML = `<p class="grafica-vacia">${vacio}</p>`;
    return;
  }

  const lectura = document.createElement('div');
  lectura.className = 'grafica-lectura';
  lectura.innerHTML = `<span class="gl-valor"></span><span class="gl-cuando"></span><span class="gl-extra"></span>`;
  contenedor.appendChild(lectura);

  const { W, H } = medidas(contenedor, { proporcion: 0.52, minAlto: 170, maxAlto: 240 });
  const M = { arriba: 16, derecha: 12, abajo: 30, izquierda: 52 };
  const anchoUtil = W - M.izquierda - M.derecha;
  const altoUtil = H - M.arriba - M.abajo;
  const esc = escalaBonita(0, Math.max(...puntos.map((p) => p.valor)));
  const paso = anchoUtil / puntos.length;
  const ancho = Math.max(6, Math.min(46, paso - 8)); // barras finas, con aire
  const y = (v) => M.arriba + altoUtil - ((v - esc.min) / (esc.max - esc.min)) * altoUtil;

  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'grafica-svg', role: 'img' });

  for (let v = esc.min; v <= esc.max + 1e-9; v += esc.paso) {
    svg.appendChild(el('line', { x1: M.izquierda, y1: y(v), x2: W - M.derecha, y2: y(v), class: 'g-rejilla' }));
    const t = el('text', { x: M.izquierda - 8, y: y(v) + 4, class: 'g-eje', 'text-anchor': 'end' });
    t.textContent = v >= 1000 ? `${Math.round(v / 1000)}k` : Math.round(v);
    svg.appendChild(t);
  }

  const rects = puntos.map((p, i) => {
    const bx = M.izquierda + i * paso + (paso - ancho) / 2;
    const by = y(p.valor);
    const r = el('rect', {
      x: bx,
      y: by,
      width: ancho,
      height: Math.max(2, M.arriba + altoUtil - by),
      rx: 4, // extremo redondeado en el lado del dato
      fill: p.excluido ? 'var(--texto-tenue)' : color,
      // el periodo en curso va a media tinta: aún no ha terminado y si no
      // se distingue parece que Carlos ha bajado el rendimiento de golpe
      'fill-opacity': p.enCurso ? 0.42 : 1,
      class: 'g-barra',
    });
    svg.appendChild(r);
    return r;
  });

  // En las barras el centro de cada una es su x; la línea usa otra fórmula, por
  // eso la función de posición se pasa como argumento en vez de darla por hecha.
  const centroBarra = (i) => M.izquierda + i * paso + paso / 2;
  for (const i of etiquetasSinPisarse(puntos, centroBarra, W, M, cabenEtiquetas(W))) {
    const cx = centroBarra(i);
    const t = el('text', {
      x: Math.min(Math.max(cx, M.izquierda + 14), W - M.derecha - 14),
      y: H - 8,
      class: 'g-eje',
      'text-anchor': 'middle',
    });
    t.textContent = puntos[i].etiqueta;
    svg.appendChild(t);
  }

  const capa = el('rect', { x: 0, y: 0, width: W, height: H, fill: 'transparent' });
  svg.appendChild(capa);

  const glValor = lectura.querySelector('.gl-valor');
  const glCuando = lectura.querySelector('.gl-cuando');
  const glExtra = lectura.querySelector('.gl-extra');
  function mostrar(i) {
    const p = puntos[i];
    glValor.textContent = formato(p.valor);
    glCuando.textContent = p.etiqueta + (p.enCurso ? ' · en curso' : '');
    glExtra.textContent = p.extra || '';
    rects.forEach((r, k) => r.classList.toggle('g-barra-activa', k === i));
  }
  const alMover = (e) => {
    const cx = e.touches ? e.touches[0].clientX : e.clientX;
    const caja = svg.getBoundingClientRect();
    const rel = ((cx - caja.left) / caja.width) * W;
    const i = Math.max(0, Math.min(puntos.length - 1, Math.floor((rel - M.izquierda) / paso)));
    mostrar(i);
    if (e.touches) e.preventDefault();
  };
  capa.addEventListener('pointerdown', alMover);
  capa.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'mouse' || e.buttons) alMover(e);
  });
  capa.addEventListener('touchmove', alMover, { passive: false });

  contenedor.appendChild(svg);
  mostrar(puntos.length - 1);

  alRedimensionar(contenedor, () => barras(contenedor, puntos, opciones));
}

/**
 * pesoCorporal — La evolución del peso, con media móvil.
 *
 * POR QUÉ NO ES UNA `lineaTemporal` NORMAL
 * ----------------------------------------
 * Aquí hay DOS cosas que enseñar y no una: lo que marcó la báscula cada día y
 * la media móvil de 7 días. Y no son dos series iguales — hay jerarquía:
 *
 *   · La MEDIA es el mensaje. Es la única línea que dice algo sobre si Carlos
 *     está bajando o subiendo de verdad.
 *   · Los PUNTOS del día son el contexto. Van en gris recesivo, a propósito,
 *     para que se vea el ruido (1-2 kg de oscilación por agua y sal) sin que
 *     compitan con la línea.
 *
 * El par gris/azul está VALIDADO con el script de dataviz en los dos modos:
 * separación para daltonismo ΔE 16,9 (protan, oscuro) y 18,0 (deutan, claro),
 * y contraste >= 3:1 contra los dos fondos. El validador marca el gris como
 * "reads gray" y eso es justo lo que se busca: no es una serie categórica que
 * pelee por identidad, es fondo. Como la identidad no puede depender solo del
 * color, van leyenda y etiqueta directa.
 */
export function pesoCorporal(contenedor, serie, opciones = {}) {
  const { objetivoKg = null, vacio = 'Pésate unos días y aquí verás la tendencia.' } = opciones;

  contenedor.innerHTML = '';
  contenedor.classList.add('grafica');

  const conDato = (serie || []).filter((d) => d.kg !== null || d.media !== null);
  if (conDato.length < 2) {
    contenedor.innerHTML = `<p class="grafica-vacia">${vacio}</p>`;
    return;
  }

  const COLOR_MEDIA = 'var(--serie-1)';
  const COLOR_CRUDO = 'var(--texto-2)';

  const lectura = document.createElement('div');
  lectura.className = 'grafica-lectura';
  lectura.innerHTML = `<span class="gl-valor"></span><span class="gl-cuando"></span><span class="gl-extra"></span>`;
  contenedor.appendChild(lectura);

  const { W, H } = medidas(contenedor, { minAlto: 210 });
  const M = { arriba: 18, derecha: 16, abajo: 30, izquierda: 46 };
  const anchoUtil = W - M.izquierda - M.derecha;
  const altoUtil = H - M.arriba - M.abajo;

  // La escala tiene que abarcar los tres: crudo, media y objetivo. Si se dejara
  // fuera el objetivo, la línea de meta se saldría del dibujo y no se vería.
  const valores = [];
  for (const d of serie) {
    if (d.kg !== null) valores.push(d.kg);
    if (d.media !== null) valores.push(d.media);
  }
  if (objetivoKg) valores.push(Number(objetivoKg));
  const esc = escalaBonita(Math.min(...valores), Math.max(...valores));

  const x = (i) => M.izquierda + (serie.length === 1 ? anchoUtil / 2 : (i / (serie.length - 1)) * anchoUtil);
  const y = (v) => M.arriba + altoUtil - ((v - esc.min) / (esc.max - esc.min)) * altoUtil;

  const svg = el('svg', {
    viewBox: `0 0 ${W} ${H}`, class: 'grafica-svg', role: 'img',
    'aria-label': opciones.titulo || 'Evolución del peso corporal',
  });

  for (let v = esc.min; v <= esc.max + 1e-9; v += esc.paso) {
    const yy = y(v);
    svg.appendChild(el('line', { x1: M.izquierda, y1: yy, x2: W - M.derecha, y2: yy, class: 'g-rejilla' }));
    const t = el('text', { x: M.izquierda - 8, y: yy + 4, class: 'g-eje', 'text-anchor': 'end' });
    t.textContent = Math.round(v * 10) / 10;
    svg.appendChild(t);
  }

  // --- línea del objetivo, discontinua para que no se confunda con un dato ---
  if (objetivoKg) {
    const yo = y(Number(objetivoKg));
    svg.appendChild(el('line', {
      x1: M.izquierda, y1: yo, x2: W - M.derecha, y2: yo,
      stroke: 'var(--serie-3)', 'stroke-width': 1.5, 'stroke-dasharray': '5 4', opacity: '0.85',
    }));
    const et = el('text', { x: W - M.derecha, y: yo - 6, class: 'g-eje', 'text-anchor': 'end' });
    et.textContent = `objetivo ${objetivoKg} kg`;
    svg.appendChild(et);
  }

  // --- los puntos del día: pequeños y grises, son el ruido ------------------
  for (let i = 0; i < serie.length; i++) {
    if (serie[i].kg === null) continue;
    svg.appendChild(el('circle', {
      cx: x(i), cy: y(serie[i].kg), r: 2.6, fill: COLOR_CRUDO, opacity: '0.65',
    }));
  }

  // --- la media móvil: el mensaje ------------------------------------------
  // Se dibuja por TRAMOS. Un solo path uniría los huecos con una recta y se
  // inventaría una tendencia en los días en que Carlos no se pesó.
  let tramo = [];
  const tramos = [];
  for (let i = 0; i < serie.length; i++) {
    if (serie[i].media === null) {
      if (tramo.length > 1) tramos.push(tramo);
      tramo = [];
    } else {
      tramo.push(i);
    }
  }
  if (tramo.length > 1) tramos.push(tramo);
  for (const t of tramos) {
    const d = t.map((i, k) => `${k ? 'L' : 'M'}${x(i).toFixed(1)},${y(serie[i].media).toFixed(1)}`).join(' ');
    svg.appendChild(el('path', {
      d, fill: 'none', stroke: COLOR_MEDIA, 'stroke-width': 2,
      'stroke-linejoin': 'round', 'stroke-linecap': 'round',
    }));
  }

  // --- etiqueta directa en el último punto de la media ----------------------
  const ultimo = [...serie].map((d, i) => ({ ...d, i })).filter((d) => d.media !== null).pop();
  if (ultimo) {
    svg.appendChild(el('circle', {
      cx: x(ultimo.i), cy: y(ultimo.media), r: 4.5, fill: COLOR_MEDIA,
      stroke: 'var(--superficie)', 'stroke-width': 2,
    }));
    const anclaDerecha = ultimo.i > serie.length * 0.75;
    const et = el('text', {
      x: x(ultimo.i) + (anclaDerecha ? -9 : 9), y: y(ultimo.media) - 9,
      class: 'g-eje', 'text-anchor': anclaDerecha ? 'end' : 'start',
      fill: 'var(--texto)', 'font-weight': '600',
    });
    et.textContent = `${ultimo.media} kg`;
    svg.appendChild(et);
  }

  // --- capa de exploración: se arrastra el dedo y se lee cada día -----------
  const guia = el('line', { y1: M.arriba, y2: M.arriba + altoUtil, class: 'g-guia', opacity: '0' });
  svg.appendChild(guia);
  const capa = el('rect', { x: 0, y: 0, width: W, height: H, fill: 'transparent', style: 'cursor:crosshair' });
  svg.appendChild(capa);

  const glValor = lectura.querySelector('.gl-valor');
  const glCuando = lectura.querySelector('.gl-cuando');
  const glExtra = lectura.querySelector('.gl-extra');

  function mostrar(i) {
    const d = serie[i];
    guia.setAttribute('x1', x(i));
    guia.setAttribute('x2', x(i));
    guia.setAttribute('opacity', '1');
    glValor.textContent = d.kg !== null ? `${d.kg} kg` : '—';
    glCuando.textContent = new Date(`${d.fecha}T12:00:00`)
      .toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
    // Se dice SIEMPRE cuál es cuál: si el color falla (sol de cara, daltonismo),
    // el texto sigue diciendo qué se está leyendo.
    glExtra.textContent = d.media !== null
      ? `media 7 días: ${d.media} kg`
      : (d.kg !== null ? 'sin media todavía' : 'no te pesaste');
  }

  const alMover = (e) => {
    const cx = e.touches ? e.touches[0].clientX : e.clientX;
    const caja = svg.getBoundingClientRect();
    const rel = ((cx - caja.left) / caja.width) * W;
    const i = Math.max(0, Math.min(serie.length - 1,
      Math.round(((rel - M.izquierda) / anchoUtil) * (serie.length - 1))));
    mostrar(i);
    if (e.touches) e.preventDefault();
  };
  capa.addEventListener('pointerdown', alMover);
  capa.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'mouse' || e.buttons) alMover(e);
  });
  capa.addEventListener('touchmove', alMover, { passive: false });

  contenedor.appendChild(svg);

  // --- leyenda: obligatoria con dos marcas distintas ------------------------
  const leyenda = document.createElement('div');
  leyenda.className = 'g-leyenda';
  leyenda.innerHTML = `
    <span class="g-ley"><i class="g-ley-linea" style="background:${COLOR_MEDIA}"></i>Media de 7 días</span>
    <span class="g-ley"><i class="g-ley-punto" style="background:${COLOR_CRUDO}"></i>Peso del día</span>`;
  contenedor.appendChild(leyenda);

  mostrar(serie.length - 1);

  alRedimensionar(contenedor, () => pesoCorporal(contenedor, serie, opciones));
}
