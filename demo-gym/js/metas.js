/* =============================================================================
 * metas.js — Los objetivos: qué te has propuesto y cuánto llevas.
 *
 * Carlos, 29-ago-2026: *«quiero añadir una función de objetivos de pesos,
 * calorías, kg levantados a x repes o simplemente pr»*.
 *
 * LA REGLA QUE MANDA AQUÍ: el progreso NO SE GUARDA, SE CALCULA.
 * Un progreso guardado se queda viejo en cuanto apuntas una serie, y entonces
 * hay dos verdades: la que dice el objetivo y la que dicen tus datos. Aquí solo
 * se guarda LO QUE TE PROPONES; lo que llevas sale siempre de las series, las
 * pesadas y las comidas de verdad.
 *
 * ESTE FICHERO NO TOCA LA PANTALLA. Es aritmética pura y por eso se puede
 * probar sin navegador (`node test_metas.mjs`).
 * ========================================================================== */

/** Los cuatro tipos, con lo que hace falta para definir cada uno. */
export const TIPOS = [
  {
    id: 'peso',
    nombre: 'Peso corporal',
    explica: 'Llegar a un peso: bajando o subiendo, lo que toque.',
    unidad: 'kg',
    pide: ['objetivo'],
  },
  {
    id: 'kcal',
    nombre: 'Calorías al día',
    explica: 'Quedarte en unas calorías diarias. Cuenta los días que lo cumples.',
    unidad: 'kcal',
    pide: ['objetivo'],
  },
  {
    id: 'levantamiento',
    nombre: 'Levantar un peso',
    explica: 'Un peso concreto a unas repeticiones en una máquina. El clásico.',
    unidad: 'kg',
    pide: ['maquinaId', 'objetivo', 'reps'],
  },
  {
    id: 'pr',
    nombre: 'Batir tu récord',
    explica: 'Superar tu mejor marca en una máquina, la que sea.',
    unidad: 'kg',
    pide: ['maquinaId'],
  },
];

export const tipoDe = (id) => TIPOS.find((t) => t.id === id) || TIPOS[0];

/** Redondeo a un decimal, que es la precisión con la que se habla de pesos. */
const r1 = (n) => Math.round(n * 10) / 10;

/**
 * Cuánto llevas de una meta.
 *
 * Devuelve SIEMPRE la misma forma, tenga datos o no:
 *   { valor, objetivo, pct, hecha, texto, falta, sinDatos }
 *
 * `pct` va de 0 a 1 y NUNCA pasa de 1: una barra al 140 % no dice nada que no
 * diga el texto, y encima se sale de la caja.
 */
/**
 * Una fecha como se dice, no como se guarda.
 *
 * «Conseguido el 2026-07-19» está escrito para una base de datos, no para
 * alguien que acaba de batir su récord.
 */
function diaBonito(fechaISO) {
  const d = new Date(String(fechaISO || '').length <= 10 ? `${fechaISO}T12:00:00` : fechaISO);
  if (Number.isNaN(d.getTime())) return String(fechaISO || '');
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function progreso(meta, datos = {}) {
  const { series = [], pesos = [], comidas = [], maquinas = [], objetivoKcal = null } = datos;
  const vacio = (texto) => ({
    valor: null, objetivo: meta.objetivo, pct: 0, hecha: false, sinDatos: true, falta: null, texto,
  });

  if (meta.tipo === 'peso') {
    const ultimo = [...pesos].filter((p) => !p.del).sort((a, b) => a.fecha.localeCompare(b.fecha)).pop();
    if (!ultimo) return vacio('Apunta tu peso para empezar a medirlo');
    // El punto de partida es la primera pesada DESPUÉS de crear la meta; si no
    // la hay, la propia meta guarda desde dónde salió. Sin partida, un objetivo
    // de bajar 4 kg se vería al 95 % desde el primer día.
    const partida = Number(meta.partida) || ultimo.kg;
    const total = Math.abs(partida - meta.objetivo);
    const hecho = Math.abs(partida - ultimo.kg);
    const bajando = meta.objetivo < partida;
    const hecha = bajando ? ultimo.kg <= meta.objetivo : ultimo.kg >= meta.objetivo;
    return {
      valor: ultimo.kg,
      objetivo: meta.objetivo,
      pct: hecha ? 1 : total > 0 ? Math.max(0, Math.min(1, hecho / total)) : 0,
      hecha,
      sinDatos: false,
      falta: hecha ? 0 : r1(Math.abs(ultimo.kg - meta.objetivo)),
      texto: hecha
        ? `Conseguido: ${r1(ultimo.kg)} kg`
        : `${r1(ultimo.kg)} kg · te faltan ${r1(Math.abs(ultimo.kg - meta.objetivo))} kg`,
    };
  }

  if (meta.tipo === 'kcal') {
    // Aquí «progreso» es cuántos de los últimos 7 días cumpliste. Un objetivo de
    // calorías no se «alcanza» un día: se sostiene.
    const dias = {};
    for (const c of comidas) {
      if (c.del) continue;
      dias[c.fecha] = (dias[c.fecha] || 0) + (Number(c.kcal) || 0);
    }
    const fechas = Object.keys(dias).sort().slice(-7);
    if (!fechas.length) return vacio('Apunta comidas y aquí verás los días que lo cumples');
    const margen = Number(meta.margen) || 100;   // ±100 kcal se considera cumplido
    const cumplidos = fechas.filter((f) => Math.abs(dias[f] - meta.objetivo) <= margen).length;
    const hoy = fechas[fechas.length - 1];
    const kcalHoy = Math.round(dias[hoy]);
    return {
      valor: kcalHoy,
      objetivo: meta.objetivo,
      pct: cumplidos / fechas.length,
      hecha: cumplidos === fechas.length && fechas.length >= 7,
      sinDatos: false,
      falta: Math.round(meta.objetivo - dias[hoy]),
      // Con uno o dos días apuntados, «0 de los últimos 1 días» no dice nada y
      // encima está mal escrito. Hasta que hay racha, se cuenta el día suelto.
      texto: fechas.length < 3
        ? `El último día apuntado: ${kcalHoy.toLocaleString('es-ES')} de ${meta.objetivo.toLocaleString('es-ES')} kcal`
        : `${cumplidos} de los últimos ${fechas.length} días dentro del objetivo`,
    };
  }

  // --- las dos de gimnasio comparten el mismo grupo de series ---------------
  const suyas = series.filter((s) => !s.del && s.maquinaId === meta.maquinaId);
  const maquina = maquinas.find((m) => m.id === meta.maquinaId);
  const unidad = (maquina && maquina.unidad) || 'kg';

  if (meta.tipo === 'levantamiento') {
    const reps = Number(meta.reps) || 1;
    // Vale cualquier serie con ESE peso y AL MENOS esas repeticiones: hacer
    // 80×10 cuando te propusiste 80×8 no es quedarse corto.
    const conseguida = suyas.find((s) => Number(s.peso) >= meta.objetivo && Number(s.reps) >= reps);
    const mejor = suyas.filter((s) => Number(s.reps) >= reps)
      .reduce((a, s) => (Number(s.peso) > a ? Number(s.peso) : a), 0);
    if (!suyas.length) return vacio('Todavía no has apuntado nada en esta máquina');
    // El progreso se mide DESDE LO QUE YA LEVANTABAS, igual que en el peso
    // corporal. Con `mejor / objetivo`, alguien que ya hacía 90 y se propone
    // 100 aparecía al 90 % el primer día, sin haber hecho nada todavía.
    const partida = Number.isFinite(Number(meta.partida)) ? Number(meta.partida) : 0;
    const margen = meta.objetivo - partida;
    const avance = margen > 0 ? (mejor - partida) / margen : (mejor >= meta.objetivo ? 1 : 0);
    return {
      valor: r1(mejor),
      objetivo: meta.objetivo,
      pct: conseguida ? 1 : Math.max(0, Math.min(1, avance)),
      hecha: !!conseguida,
      sinDatos: false,
      falta: conseguida ? 0 : r1(meta.objetivo - mejor),
      texto: conseguida
        ? `Conseguido el ${diaBonito(conseguida.fecha)}`
        : mejor > 0
          ? `Vas por ${r1(mejor)} ${unidad} × ${reps} · faltan ${r1(meta.objetivo - mejor)} ${unidad}`
          : `Aún no has hecho ninguna serie de ${reps} repeticiones`,
    };
  }

  if (meta.tipo === 'pr') {
    // Batir el récord ANTERIOR a la meta. El récord del día que la creaste es la
    // marca a superar; si no se guardó, se toma la mejor serie de antes.
    const creado = meta.creado || 0;
    const antes = suyas.filter((s) => (s.act || 0) <= creado);
    const marca = Number(meta.partida) || antes.reduce((a, s) => Math.max(a, Number(s.peso) || 0), 0);
    const mejorAhora = suyas.reduce((a, s) => Math.max(a, Number(s.peso) || 0), 0);
    if (!suyas.length) return vacio('Todavía no has apuntado nada en esta máquina');
    const hecha = mejorAhora > marca;
    return {
      valor: r1(mejorAhora),
      objetivo: r1(marca),
      // O lo bates o no lo bates: un récord no tiene medio camino. Con
      // `mejorAhora / marca`, el aro salía LLENO y verde desde el primer día
      // —igualar tu récord es exactamente no haberlo batido— y la tarjeta decía
      // «100 %» encima de «A por él».
      pct: hecha ? 1 : 0,
      hecha,
      sinDatos: false,
      falta: hecha ? 0 : r1(marca - mejorAhora),
      texto: hecha
        ? `¡Récord batido! ${r1(mejorAhora)} ${unidad}`
        : `Tu récord es ${r1(marca)} ${unidad}. A por él.`,
    };
  }

  return vacio('Objetivo desconocido');
}

/**
 * Cuántos días quedan hasta la fecha límite.
 * Devuelve null si la meta no tiene fecha (que es lo normal y está bien).
 */
export function diasQueQuedan(meta, hoyISO) {
  if (!meta.fecha_limite) return null;
  const dia = 86400000;
  const a = new Date(`${hoyISO}T00:00:00`);
  const b = new Date(`${meta.fecha_limite}T00:00:00`);
  return Math.round((b - a) / dia);
}

/**
 * El orden en el que se enseñan: primero lo que está a punto de cumplirse, y
 * lo conseguido al final. Una lista de objetivos ordenada por fecha de creación
 * pone lo viejo delante, que es justo lo que menos importa.
 */
export function ordenar(metas, progresos) {
  return [...metas].sort((a, b) => {
    const pa = progresos.get(a.id) || { pct: 0, hecha: false };
    const pb = progresos.get(b.id) || { pct: 0, hecha: false };
    if (pa.hecha !== pb.hecha) return pa.hecha ? 1 : -1;
    return pb.pct - pa.pct;
  });
}
