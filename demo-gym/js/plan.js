/* =============================================================================
 * plan.js — El planificador de entrenos, sin pantalla.
 *
 * Carlos, 31-jul-2026: *«añade un planificador de entrenos, así si tienes un día
 * llamado pecho, ya te saldrán las máquinas de ese día (…) que te indique lo que
 * debes hacer que te hayas apuntado (ej 3x12, 2x8)»*. Y eligió **rotación por
 * rutina, series objetivo y registro serie a serie**.
 *
 * Está SUELTO de `app.js` por un motivo práctico: aquí no se toca el DOM, así
 * que se puede ejecutar en Node y comprobar con datos de verdad qué día toca y
 * cuántas series llevas. Metido dentro de la pantalla solo se podría probar
 * abriendo un navegador, y entonces no se probaría.
 * ========================================================================== */

export const POR_DEFECTO = { series: 3, reps: 12 };

/** El día (AAAA-MM-DD) de una fecha ISO. */
export function dia(fechaISO) {
  return String(fechaISO || '').slice(0, 10);
}

/**
 * El plan de una rutina, normalizado: [{maquinaId, series, reps}].
 *
 * Si la rutina no tiene plan propio (las tres de fábrica: Push/Pull/Leg) se
 * DEDUCE de sus grupos musculares con 3×12. Así el planificador sirve desde el
 * primer día sin obligar a configurar nada — que es lo que decide si una función
 * se usa o se queda muerta. En cuanto Carlos lo toca, se guarda de verdad.
 *
 * `maquinas` son SOLO las del gimnasio en el que está: un plan que apunte a una
 * máquina de otro gimnasio (o borrada) se pintaría como una fila vacía.
 */
export function planDe(rutina, maquinas) {
  if (!rutina) return [];
  const porId = new Map((maquinas || []).map((m) => [m.id, m]));

  // Un número que no vale (0, negativo, texto) vuelve al DEFECTO, no al mínimo.
  // Con `Math.max(1, …)` un -4 se convertía en «1 repetición» y eso parece un
  // objetivo de verdad: el dato malo se disfrazaba de dato bueno.
  const sano = (v, porDefecto) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : porDefecto;
  };

  if (Array.isArray(rutina.plan) && rutina.plan.length) {
    return rutina.plan
      .filter((p) => porId.has(p.maquinaId))
      .map((p) => ({
        maquinaId: p.maquinaId,
        series: sano(p.series, POR_DEFECTO.series),
        reps: sano(p.reps, POR_DEFECTO.reps),
      }));
  }

  const grupos = new Set(rutina.grupos || []);
  const sueltas = new Set(rutina.maquinas || []);
  return (maquinas || [])
    .filter((m) => sueltas.has(m.id) || grupos.has(m.grupo))
    .map((m) => ({ maquinaId: m.id, ...POR_DEFECTO }));
}

/**
 * Qué toca hoy: {rutina, elegida}.
 *
 * `elegida` distingue «lo has dicho tú» de «te lo propongo yo», y eso se dice en
 * pantalla: no es lo mismo «hoy entrenas Push» que «hoy te toca Push».
 *
 * LA ROTACIÓN NO ES UN CALENDARIO. Sale de la ÚLTIMA sesión con rutina apuntada
 * y pasa a la siguiente de la lista. Si Carlos se salta el martes, el martes
 * sigue tocando lo mismo — que es como funciona un Push/Pull/Leg de verdad.
 */
export function rutinaDeHoy(rutinas, sesiones, hoy) {
  const lista = rutinas || [];
  if (!lista.length) return { rutina: null, elegida: false };

  const d = dia(hoy);
  const deHoy = (sesiones || []).find((s) => dia(s.fecha) === d && s.rutina);
  if (deHoy) {
    const r = lista.find((x) => x.id === deHoy.rutina);
    if (r) return { rutina: r, elegida: true };
  }

  const previas = (sesiones || [])
    .filter((s) => s.rutina && dia(s.fecha) < d)
    .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
  const ultima = previas.find((s) => lista.some((r) => r.id === s.rutina));
  if (!ultima) return { rutina: lista[0], elegida: false };

  const i = lista.findIndex((r) => r.id === ultima.rutina);
  return { rutina: lista[(i + 1) % lista.length], elegida: false };
}

/** Las series apuntadas HOY en una máquina. */
export function seriesHoyDe(series, maquinaId, hoy) {
  const d = dia(hoy);
  return (series || []).filter((s) => s.maquinaId === maquinaId && !s.del && dia(s.fecha) === d);
}

/**
 * Cuánto llevas del día: {hechas, total, completo}.
 *
 * Las series de más NO cuentan de más (`Math.min`): si en una máquina haces 5 de
 * 3, el día no está «al 130 %». Se topa por ejercicio, no al final, porque si no
 * un ejercicio de sobra taparía otro sin empezar.
 */
export function progresoDelDia(plan, series, hoy) {
  const total = plan.reduce((n, p) => n + p.series, 0);
  const hechas = plan.reduce(
    (n, p) => n + Math.min(p.series, seriesHoyDe(series, p.maquinaId, hoy).length), 0);
  return { hechas, total, completo: total > 0 && hechas >= total };
}

/**
 * El orden de la lista ES la rotación. Las rutinas que vienen de una base vieja
 * no traen `orden` y se colocan por su nombre canónico (Push, Pull, Leg) — sin
 * esto salían como las devuelve IndexedDB, o sea alfabéticas por id: Leg, Pull,
 * Push. Empezar la semana por pierna no es una decisión, es un accidente.
 */
export function ordenar(rutinas) {
  return [...(rutinas || [])].sort(
    (a, b) => (a.orden ?? 99) - (b.orden ?? 99) || String(a.nombre).localeCompare(String(b.nombre)));
}

const CANONICO = ['push', 'pull', 'leg'];

/** Qué `orden` le toca a cada rutina que no lo tenga. Devuelve [{...r, orden}]. */
export function ordenInicial(rutinas, normalizar = (t) => String(t).toLowerCase().trim()) {
  const pos = (r) => CANONICO.indexOf(normalizar(r.nombre));
  return [...(rutinas || [])]
    .sort((a, b) => {
      const ia = pos(a);
      const ib = pos(b);
      if (ia >= 0 && ib >= 0) return ia - ib;
      if (ia >= 0) return -1;
      if (ib >= 0) return 1;
      return String(a.nombre).localeCompare(String(b.nombre));
    })
    .map((r, i) => ({ ...r, orden: i }));
}
