/* =============================================================================
 * datos.js — Lógica de negocio: unidades, agregación por periodos y análisis.
 *
 * Aquí vive TODO el cálculo. Ni la interfaz ni las gráficas hacen cuentas: le
 * piden los números a este módulo. Así el mismo cálculo que ve Carlos en el
 * móvil es el que JARVIS repite en el PC (el gemelo en Python es gym_datos.py)
 * y nunca se contradicen.
 *
 * DECISIONES QUE IMPORTAN
 * -----------------------
 * · Cada máquina guarda el peso en SU unidad (la que pone la placa: kg o lb),
 *   porque lo que Carlos necesita ver es el número que va a marcar en el hierro.
 *   Para comparar y sumar, todo se normaliza a kg por dentro.
 * · Comparar máquinas ENTRE SÍ no tiene sentido físico (una polea de 40 no es
 *   un press de 40). Por eso cada máquina solo se compara CONSIGO MISMA, que es
 *   justo el problema de Carlos: "¿levantaba más o menos que la otra vez?".
 * · Las sesiones marcadas como flojas (`excluir`) NO cuentan en las tendencias,
 *   pero sí se guardan y se pueden ver. Un mal día no debe ensuciar la línea.
 * ========================================================================== */

export const LB_A_KG = 0.45359237;

export const GRUPOS = [
  { id: 'pecho', nombre: 'Pecho' },
  { id: 'espalda', nombre: 'Espalda' },
  { id: 'hombro', nombre: 'Hombro' },
  { id: 'biceps', nombre: 'Bíceps' },
  { id: 'triceps', nombre: 'Tríceps' },
  { id: 'pierna', nombre: 'Pierna' },
  { id: 'gluteo', nombre: 'Glúteo' },
  { id: 'core', nombre: 'Core' },
  { id: 'antebrazo', nombre: 'Antebrazo' },
  { id: 'cardio', nombre: 'Cardio' },
  { id: 'otro', nombre: 'Otro' },
];

export const TIPOS = [
  { id: 'maquina', nombre: 'Máquina' },
  { id: 'polea', nombre: 'Polea' },
  { id: 'mancuerna', nombre: 'Mancuernas' },
  { id: 'barra', nombre: 'Barra' },
  { id: 'libre', nombre: 'Peso libre' },
  { id: 'peso_corporal', nombre: 'Peso corporal' },
  { id: 'multipower', nombre: 'Multipower' },
  { id: 'kettlebell', nombre: 'Kettlebell' },
  { id: 'banda', nombre: 'Banda elástica' },
  { id: 'cardio', nombre: 'Cardio' },
];

/* --------------------------------------------------------------------------
 * Unidades
 * ------------------------------------------------------------------------ */

export function aKg(peso, unidad) {
  const p = Number(peso) || 0;
  return unidad === 'lb' ? p * LB_A_KG : p;
}

export function desdeKg(kg, unidad) {
  const k = Number(kg) || 0;
  return unidad === 'lb' ? k / LB_A_KG : k;
}

export function formatearPeso(peso, unidad, decimales = 1) {
  const n = Number(peso) || 0;
  const txt = Number.isInteger(n) ? String(n) : n.toFixed(decimales).replace(/\.0$/, '');
  return `${txt} ${unidad}`;
}

/* --------------------------------------------------------------------------
 * Métricas de una serie
 * ------------------------------------------------------------------------ */

/** Volumen = peso × repeticiones, en kg. Es lo que mejor resume "cuánto trabajo". */
export function volumenKg(serie, unidad) {
  return aKg(serie.peso, unidad) * (Number(serie.reps) || 0);
}

/**
 * 1RM estimado (fórmula de Epley). Permite comparar 60kg×5 con 50kg×10,
 * que a ojo no se pueden comparar. Por encima de ~12 reps deja de ser fiable,
 * así que lo capamos para no inventar récords con series muy largas.
 */
export function e1rmKg(serie, unidad) {
  const kg = aKg(serie.peso, unidad);
  const reps = Math.min(Number(serie.reps) || 0, 12);
  if (!kg || !reps) return 0;
  return kg * (1 + reps / 30);
}

/* --------------------------------------------------------------------------
 * Periodos
 * ------------------------------------------------------------------------ */

/** Lunes de la semana de esa fecha (España: la semana empieza en lunes). */
export function inicioSemana(fecha) {
  const d = new Date(fecha);
  d.setHours(0, 0, 0, 0);
  const dia = (d.getDay() + 6) % 7; // 0 = lunes
  d.setDate(d.getDate() - dia);
  return d;
}

export function claveperiodo(fechaISO, periodo) {
  const d = new Date(fechaISO);
  const y = d.getFullYear();
  switch (periodo) {
    case 'dia':
      return d.toISOString().slice(0, 10);
    case 'semana': {
      const l = inicioSemana(d);
      return l.toISOString().slice(0, 10);
    }
    case 'mes':
      return `${y}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    case 'trimestre':
      return `${y}-T${Math.floor(d.getMonth() / 3) + 1}`;
    case 'ano':
      return String(y);
    default:
      return d.toISOString().slice(0, 10);
  }
}

export function etiquetaPeriodo(clave, periodo) {
  const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  if (periodo === 'trimestre' || periodo === 'ano') return clave;
  if (periodo === 'mes') {
    // apóstrofo para que «jul '26» no se lea como «26 de julio»
    const [y, m] = clave.split('-');
    return `${MESES[Number(m) - 1]} '${y.slice(2)}`;
  }
  const d = new Date(clave);
  const txt = `${d.getDate()} ${MESES[d.getMonth()]}`;
  return periodo === 'semana' ? `sem. ${txt}` : txt;
}

/* --------------------------------------------------------------------------
 * Construcción de la serie temporal
 * ------------------------------------------------------------------------ */

/**
 * Agrupa las series de UNA máquina en puntos por periodo.
 * Devuelve [{clave, etiqueta, fecha, mejorPeso, mejorE1rm, volumen, nSeries,
 *            repsMejor, excluido}]
 */
export function evolucionMaquina(series, maquina, sesionesPorId, periodo = 'dia', { incluirFlojas = false } = {}) {
  const unidad = maquina.unidad || 'kg';
  const cubos = new Map();

  for (const s of series) {
    const sesion = s.sesionId ? sesionesPorId.get(s.sesionId) : null;
    const floja = !!(sesion && sesion.excluir);
    if (floja && !incluirFlojas) continue;

    const clave = claveperiodo(s.fecha, periodo);
    if (!cubos.has(clave)) {
      cubos.set(clave, {
        clave,
        etiqueta: etiquetaPeriodo(clave, periodo),
        fecha: s.fecha,
        mejorPeso: 0,
        repsMejor: 0,
        mejorE1rm: 0,
        volumen: 0,
        nSeries: 0,
        excluido: floja,
      });
    }
    const c = cubos.get(clave);
    const kg = aKg(s.peso, unidad);
    const e1 = e1rmKg(s, unidad);
    if (kg > c.mejorPeso) {
      c.mejorPeso = kg;
      c.repsMejor = Number(s.reps) || 0;
    }
    if (e1 > c.mejorE1rm) c.mejorE1rm = e1;
    c.volumen += volumenKg(s, unidad);
    c.nSeries++;
    if (s.fecha < c.fecha) c.fecha = s.fecha;
  }

  const claveHoy = claveperiodo(new Date().toISOString(), periodo);
  return [...cubos.values()]
    .sort((a, b) => (a.clave < b.clave ? -1 : 1))
    .map((c) => ({
      ...c,
      // de vuelta a la unidad de la máquina para enseñarlo
      mejorPesoUnidad: desdeKg(c.mejorPeso, unidad),
      unidad,
      // el periodo actual todavía no ha terminado: si no se avisa, el último
      // punto SIEMPRE parece una bajada y da un susto que no toca
      enCurso: c.clave === claveHoy,
    }));
}

/**
 * Evolución agregada de un conjunto de máquinas (un gimnasio, un grupo
 * muscular o todo). Como mezclamos máquinas distintas, la única métrica
 * honesta es el VOLUMEN total en kg — sumar "pesos máximos" de máquinas
 * distintas no significaría nada.
 */
export function evolucionVolumen(series, maquinasPorId, sesionesPorId, periodo = 'semana', { incluirFlojas = false } = {}) {
  const cubos = new Map();
  for (const s of series) {
    const m = maquinasPorId.get(s.maquinaId);
    if (!m) continue;
    const sesion = s.sesionId ? sesionesPorId.get(s.sesionId) : null;
    if (sesion && sesion.excluir && !incluirFlojas) continue;

    const clave = claveperiodo(s.fecha, periodo);
    if (!cubos.has(clave)) {
      cubos.set(clave, { clave, etiqueta: etiquetaPeriodo(clave, periodo), fecha: s.fecha, volumen: 0, nSeries: 0, maquinas: new Set() });
    }
    const c = cubos.get(clave);
    c.volumen += volumenKg(s, m.unidad || 'kg');
    c.nSeries++;
    c.maquinas.add(s.maquinaId);
    if (s.fecha < c.fecha) c.fecha = s.fecha;
  }
  const claveHoy = claveperiodo(new Date().toISOString(), periodo);
  return [...cubos.values()]
    .sort((a, b) => (a.clave < b.clave ? -1 : 1))
    .map((c) => ({ ...c, nMaquinas: c.maquinas.size, maquinas: undefined, enCurso: c.clave === claveHoy }));
}

/* --------------------------------------------------------------------------
 * Últimos datos: lo que Carlos necesita ver ANTES de sentarse en la máquina
 * ------------------------------------------------------------------------ */

/** La última serie registrada de una máquina (la más reciente por fecha). */
export function ultimaSerie(series) {
  let mejor = null;
  for (const s of series) if (!mejor || s.fecha > mejor.fecha) mejor = s;
  return mejor;
}

/** La mejor serie de siempre (récord por 1RM estimado). */
export function record(series, unidad) {
  let mejor = null;
  let mejorE1 = 0;
  for (const s of series) {
    const e = e1rmKg(s, unidad);
    if (e > mejorE1) {
      mejorE1 = e;
      mejor = s;
    }
  }
  return mejor;
}

export function haceCuanto(fechaISO) {
  if (!fechaISO) return '';
  const dias = Math.floor((Date.now() - new Date(fechaISO).getTime()) / 86400000);
  if (dias <= 0) return 'hoy';
  if (dias === 1) return 'ayer';
  if (dias < 7) return `hace ${dias} días`;
  if (dias < 30) return `hace ${Math.floor(dias / 7)} sem.`;
  if (dias < 365) return `hace ${Math.floor(dias / 30)} meses`;
  return `hace ${Math.floor(dias / 365)} año(s)`;
}

/* --------------------------------------------------------------------------
 * Análisis comparativo — el material con el que JARVIS habla
 * ------------------------------------------------------------------------ */

function rango(desde, hasta) {
  return (s) => s.fecha >= desde && s.fecha < hasta;
}

export function isoDesplazado(fecha, { dias = 0, meses = 0, anos = 0 }) {
  const d = new Date(fecha);
  d.setDate(d.getDate() + dias);
  d.setMonth(d.getMonth() + meses);
  d.setFullYear(d.getFullYear() + anos);
  return d.toISOString();
}

/**
 * Compara una ventana de tiempo con la ventana anterior del mismo tamaño y
 * con la misma ventana del año pasado. Es lo que permite frases como
 * "has levantado un 14% más que el trimestre pasado".
 *
 * Devuelve null en la comparación que no tenga datos suficientes: preferimos
 * callar a inventar un porcentaje sobre dos series sueltas.
 */
export function comparar(series, maquinasPorId, sesionesPorId, { hasta = new Date().toISOString(), meses = 3, minSeries = 3 } = {}) {
  const fin = new Date(hasta);
  const ini = new Date(isoDesplazado(fin, { meses: -meses }));
  const iniPrev = new Date(isoDesplazado(ini, { meses: -meses }));
  const finAnoPasado = new Date(isoDesplazado(fin, { anos: -1 }));
  const iniAnoPasado = new Date(isoDesplazado(ini, { anos: -1 }));

  const util = (s) => {
    const m = maquinasPorId.get(s.maquinaId);
    if (!m) return false;
    const ses = s.sesionId ? sesionesPorId.get(s.sesionId) : null;
    return !(ses && ses.excluir);
  };
  const vol = (filtro) =>
    series.filter(util).filter(filtro).reduce((a, s) => a + volumenKg(s, (maquinasPorId.get(s.maquinaId) || {}).unidad || 'kg'), 0);
  const n = (filtro) => series.filter(util).filter(filtro).length;

  const actual = { volumen: vol(rango(ini.toISOString(), fin.toISOString())), n: n(rango(ini.toISOString(), fin.toISOString())) };
  const previo = { volumen: vol(rango(iniPrev.toISOString(), ini.toISOString())), n: n(rango(iniPrev.toISOString(), ini.toISOString())) };
  const anoPasado = {
    volumen: vol(rango(iniAnoPasado.toISOString(), finAnoPasado.toISOString())),
    n: n(rango(iniAnoPasado.toISOString(), finAnoPasado.toISOString())),
  };

  const pct = (a, b) => (b.n >= minSeries && a.n >= minSeries && b.volumen > 0 ? ((a.volumen - b.volumen) / b.volumen) * 100 : null);

  return {
    ventanaMeses: meses,
    actual,
    previo,
    anoPasado,
    vsPrevio: pct(actual, previo),
    vsAnoPasado: pct(actual, anoPasado),
  };
}

/**
 * Máquinas estancadas: llevan >= `semanas` sin subir el mejor peso.
 * Es EL problema que Carlos describió: creerse que progresa por no acordarse.
 */
export function estancadas(maquinas, seriesPorMaquina, { semanas = 6, minPuntos = 3 } = {}) {
  const corte = Date.now() - semanas * 7 * 86400000;
  const salida = [];
  for (const m of maquinas) {
    const ss = seriesPorMaquina.get(m.id) || [];
    if (ss.length < minPuntos) continue;
    const unidad = m.unidad || 'kg';
    const ordenadas = [...ss].sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
    const ultima = ordenadas[ordenadas.length - 1];
    if (new Date(ultima.fecha).getTime() < corte) continue; // ni siquiera la usa

    let mejorHistorico = 0;
    let fechaMejor = null;
    for (const s of ordenadas) {
      const kg = aKg(s.peso, unidad);
      if (kg > mejorHistorico) {
        mejorHistorico = kg;
        fechaMejor = s.fecha;
      }
    }
    if (fechaMejor && new Date(fechaMejor).getTime() < corte) {
      salida.push({
        maquina: m,
        mejorKg: mejorHistorico,
        mejorUnidad: desdeKg(mejorHistorico, unidad),
        unidad,
        desde: fechaMejor,
        semanas: Math.floor((Date.now() - new Date(fechaMejor).getTime()) / (7 * 86400000)),
      });
    }
  }
  return salida.sort((a, b) => b.semanas - a.semanas);
}
