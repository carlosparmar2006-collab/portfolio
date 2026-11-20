/* =============================================================================
 * nutricion.js — Calorías y macros. Las CUENTAS, sin nada de interfaz.
 *
 * POR QUÉ ESTÁ AQUÍ Y NO EN app.js
 * --------------------------------
 * Por la misma razón que `datos.js`: el día que JARVIS tenga que decir por voz
 * «te faltan 40 gramos de proteína», tendrá que dar EXACTAMENTE el mismo número
 * que la pantalla. Con la lógica separada, el gemelo en Python copia de un
 * único sitio. Ya nos mordió una vez con el gimnasio: la app decía +7,9 % y
 * JARVIS +4,9 % porque cada uno calculaba su ventana de tiempo a su manera.
 *
 * CONVENIO DE LOS MACROS
 * ----------------------
 * Un alimento guarda SIEMPRE sus macros por 100 g (o por unidad si `unidad`
 * es 'ud': un huevo, una rebanada). Nunca «por ración»: la ración cambia y
 * entonces el dato deja de servir para otra cantidad.
 *
 * Una comida guarda los macros YA CALCULADOS, no solo la referencia al
 * alimento. Es a propósito: si mañana Carlos corrige los macros del pollo, lo
 * que se comió el mes pasado no debe cambiar retroactivamente.
 * ========================================================================== */

/**
 * Los momentos del día que trae la app de fábrica.
 *
 * Carlos puede añadir los suyos («preentreno», «postentreno»…): se guardan en
 * el almacén `momentos` y `todosLosMomentos()` los junta con estos. Los de
 * fábrica no se pueden borrar — si desaparecieran, las comidas ya apuntadas se
 * quedarían huérfanas y dejarían de sumar en su grupo.
 */
export const MOMENTOS = [
  { id: 'desayuno', nombre: 'Desayuno', orden: 10 },
  { id: 'comida', nombre: 'Comida', orden: 30 },
  { id: 'merienda', nombre: 'Merienda', orden: 40 },
  { id: 'cena', nombre: 'Cena', orden: 60 },
  { id: 'otro', nombre: 'Picoteo', orden: 90 },
];

/**
 * Los de fábrica más los que se haya inventado Carlos, en orden del día.
 * `orden` deja colocar «preentreno» entre el desayuno y la comida en vez de
 * apelotonarlo al final, que es donde acabaría ordenando por fecha de creación.
 */
export function todosLosMomentos(propios) {
  const mios = (propios || []).filter((m) => !m.del).map((m) => ({
    id: m.id, nombre: m.nombre, orden: Number(m.orden) || 50, propio: true,
  }));
  return [...MOMENTOS, ...mios].sort((a, b) => a.orden - b.orden);
}

/** El nombre de un momento, venga de donde venga. */
export function nombreMomento(id, propios) {
  const m = todosLosMomentos(propios).find((x) => x.id === id);
  return m ? m.nombre : 'Picoteo';
}

/* --------------------------------------------------------------------------
 * UNIDADES
 *
 * Carlos: «haz que se pueda modificar entre gramos y cantidad porque en los
 * huevos fritos es mejor poner 3 huevos separados (…) lo mismo para los
 * liquidos añade tambien ml no gramos».
 *
 * Tres unidades y ninguna más:
 *   g   — lo que se pesa (carne, arroz, verdura)
 *   ml  — lo que se sirve (leche, zumo, aceite, cerveza)
 *   ud  — lo que se cuenta (huevos, rebanadas, scoops, piezas de fruta)
 *
 * Los macros SIEMPRE están por 100 g / 100 ml, nunca por unidad, para que una
 * misma ficha valga para cualquier cantidad. `gramosUd` es el puente: lo que
 * pesa una pieza, o la densidad si es líquido (el aceite, 0,918 g/ml).
 * ------------------------------------------------------------------------ */
export const UNIDADES = [
  { id: 'g', nombre: 'g', largo: 'gramos' },
  { id: 'ml', nombre: 'ml', largo: 'mililitros' },
  { id: 'ud', nombre: 'ud', largo: 'unidades' },
];

/**
 * Densidad que se asume para un líquido del que no sabemos nada: 1 g/ml.
 *
 * No es un invento perezoso, es agua: leche (1,03), zumo (1,05), caldo, refresco
 * y cerveza se quedan a un 1-5 % de ahí, que es menos error que el de calcular
 * a ojo la cantidad. El aceite (0,918) y demás sí traen la suya en la ficha.
 * Cuando se usa esta suposición la app LO DICE, que es la parte que importa.
 */
export const DENSIDAD_SUPUESTA = 1;

/**
 * Cómo se llama UNA pieza de este alimento: «scoop», «rebanada», «unidad»…
 *
 * Carlos, dos versiones seguidas: «sigues sin añadir lo de que en el caso de las
 * proteinas puedas elegir scoop, solo te deja en gramos». Un scoop ES una
 * unidad; lo que faltaba era que la app lo LLAMARA scoop, porque un chip que
 * pone «unidades» al lado de un bote de proteína no invita a tocarlo.
 *
 * El nombre viene de la etiqueta del fabricante cuando la hay (`nombreUd`), y si
 * no, se dice «unidad». Nunca se adivina un scoop donde no lo pone.
 */
export function nombreUd(alimento, cantidad = 1) {
  const n = (alimento && alimento.nombreUd || '').trim();
  const base = n || 'unidad';
  if (Math.abs(Number(cantidad)) === 1) return base;
  // Plural a la española. Sin esto salía «unidads» en el botón, que canta.
  if (/s$/i.test(base)) return base;                       // dosis → dosis
  if (/[aeiouáéíóú]$/i.test(base)) return `${base}s`;      // loncha → lonchas
  if (/[dnlrz]$/i.test(base)) return `${base}es`;          // unidad → unidades
  return `${base}s`;                                       // scoop → scoops
}

/** Etiqueta del chip de medida: «gramos», «mililitros», «scoops»… */
export function nombreUnidad(alimento, u) {
  if (u === 'ud') return nombreUd(alimento, 2);
  const meta = UNIDADES.find((x) => x.id === u);
  return meta ? meta.largo : u;
}

/**
 * ¿En qué unidades se puede medir este alimento? En las TRES, siempre.
 *
 * Carlos, sin margen de interpretación: «cualquier tipo de comida deberia
 * dejarte poner por gramos y por unidad TODOS, tanto si es de internet como si
 * no». Antes esta función escondía las unidades que no sabía convertir, y el
 * resultado es que su proteína solo se dejaba apuntar en gramos.
 *
 * El motivo de esconderlas era bueno —convertir sin puente fue lo que produjo
 * las 8.994 kcal—, pero la respuesta correcta no es esconder la opción: es
 * PEDIR el dato que falta. Eso es lo que hace `faltaPuente()`, y la hoja de
 * cantidad enseña un campito «una unidad pesa ___ g» en cuanto hace falta.
 *
 * Sigue en pie la regla de siempre: si no se sabe, no se calcula. Lo que cambia
 * es que ahora se puede arreglar sin salir de la pantalla.
 */
export function unidadesDe(alimento) {
  if (!alimento) return ['g', 'ml', 'ud'];
  const suya = alimento.unidad || 'g';
  // La suya primero: es la que va a usar el 90 % de las veces.
  return [suya, ...['g', 'ml', 'ud'].filter((u) => u !== suya)];
}

/**
 * ¿Qué dato falta para poder medir este alimento en `u`? null si no falta nada.
 *
 * Devuelve 'peso' cuando hay que saber lo que pesa una pieza (no se inventa
 * NUNCA: un huevo no pesa lo mismo que una croqueta) y 'densidad' cuando se está
 * suponiendo 1 g/ml, que sí se puede suponer pero hay que decirlo.
 */
export function faltaPuente(alimento, u) {
  if (!alimento) return null;
  const suya = alimento.unidad || 'g';
  if (u === suya) return null;
  const puente = Number(alimento.gramosUd) > 0;
  if (puente) return null;
  if (u === 'ud' || suya === 'ud') return 'peso';
  return 'densidad';                 // g ↔ ml sin densidad: se supone 1
}

/**
 * Pasa una cantidad de una unidad a otra usando `gramosUd` como puente.
 *
 * Devuelve null solo cuando de verdad no se puede: pasar a/desde PIEZAS sin
 * saber lo que pesa una. Entre gramos y mililitros se usa la densidad supuesta
 * (agua) y quien llama se encarga de avisar — ver `faltaPuente`.
 */
export function convertirExacto(cantidad, desde, hasta, alimento) {
  const c = Number(cantidad) || 0;
  if (desde === hasta) return c;
  const propio = Number(alimento && alimento.gramosUd) || 0;
  const cuentaPiezas = desde === 'ud' || hasta === 'ud';
  // Piezas sin peso conocido: aquí sí se para. Es literalmente el bug de las
  // 8.994 kcal (110 g de huevo tomados como 110 huevos).
  if (cuentaPiezas && !propio) return null;
  const factor = propio || DENSIDAD_SUPUESTA;
  if (hasta === 'g') return c * factor;
  if (desde === 'g') return c / factor;
  // ml ↔ ud pasando por gramos, que es el único puente que hay.
  const enGramos = convertirExacto(c, desde, 'g', alimento);
  return enGramos === null ? null : convertirExacto(enGramos, 'g', hasta, alimento);
}

/**
 * Lo mismo, pero redondeado PARA ENSEÑARLO en la casilla de la cantidad.
 *
 * Va aparte de `convertirExacto` a propósito: a piezas se redondea a medias
 * (media rebanada es una cantidad real; «1,45 huevos» no lo es y solo consigue
 * que Carlos no se fíe del número), y ese redondeo no puede tocar los macros.
 * Antes de separarlas, cambiar de medida y volver movía las calorías.
 */
export function convertir(cantidad, desde, hasta, alimento) {
  const v = convertirExacto(cantidad, desde, hasta, alimento);
  if (v === null) return null;
  if (desde === hasta) return v;
  // Nunca menos de media pieza: si sale algo, algo hay.
  if (hasta === 'ud') return Math.max(0.5, Math.round(v * 2) / 2);
  return redondea(v, hasta === 'g' ? 1 : 2);
}

/**
 * Chorros de aceite, que es como se echa de verdad.
 *
 * Carlos: «pon que sea chorro grande o pequeño pero profesional». Nadie mide el
 * aceite de la sartén con una báscula, pero tampoco se puede ignorar: un chorro
 * generoso son ~135 kcal, más que el huevo que estás friendo.
 *
 * Los mililitros salen de las medidas de cocina habituales (cucharada sopera
 * ~15 ml, cucharadita ~5 ml).
 */
export const CHORROS = [
  { id: 'hilo', nombre: 'Un hilo', ml: 5, nota: 'apenas engrasar la sartén' },
  { id: 'corto', nombre: 'Chorro corto', ml: 10, nota: 'una cucharada' },
  { id: 'normal', nombre: 'Chorro normal', ml: 15, nota: 'lo típico para un huevo' },
  { id: 'generoso', nombre: 'Chorro generoso', ml: 25, nota: 'freír a gusto' },
  { id: 'fritura', nombre: 'Para freír', ml: 50, nota: 'el aceite cubre el alimento' },
];

/**
 * Kilocalorías por gramo de cada macro.
 *
 * Los tres primeros son los factores de Atwater de toda la vida. La fibra y el
 * alcohol están aquí porque hacen falta para COMPROBAR que una ficha cuadra, no
 * para contarlos como macros:
 *  - fibra: 2 kcal/g según el Reglamento (UE) 1169/2011. No es 0 (se fermenta
 *    en el colon y algo se aprovecha) ni 4 (no se digiere como un azúcar).
 *  - alcohol: 7 kcal/g. Explica por qué una cerveza declara 43 kcal y sus tres
 *    macros solo suman 16.
 */
export const KCAL_POR_GRAMO = { prot: 4, carb: 4, gras: 9, fibra: 2, alcohol: 7 };

export const HOY = () => new Date().toISOString().slice(0, 10);

/* --------------------------------------------------------------------------
 * Alimentos de partida.
 *
 * YA NO HAY NI UN NÚMERO ESCRITO A MANO. Vienen de `alimentos.js`, que se
 * GENERA a partir de USDA FoodData Central (SR Legacy, composición medida en
 * laboratorio) promediando todas las entradas que casan con cada alimento.
 *
 * Carlos, 28-jul-2026: «no se de donde estas sacando que un huevo equivale a 75
 * kcal (…) busca muchas fuentes y haz la media». Tenía razón: los 34 anteriores
 * eran valores «del orden de» los de las tablas, puestos a ojo.
 *
 * Se regenera con:  python gym/tools/alimentos_base.py generar
 * ------------------------------------------------------------------------ */
export { ALIMENTOS_BASE } from './alimentos.js';

/** Objetivo diario por defecto, hasta que Carlos ponga el suyo. */
export const OBJETIVO_POR_DEFECTO = { kcal: 2400, prot: 160, carb: 260, gras: 75 };

/* --------------------------------------------------------------------------
 * PESO CORPORAL Y OBJETIVOS QUE SE CALCULAN SOLOS
 * ------------------------------------------------------------------------ */

/**
 * Cuánta proteína por kilo de peso. El rango 1,6-2,2 g/kg no es inventado: sale
 * del meta-análisis de Morton (2018), donde las ganancias se aplanan a partir de
 * 1,6 g/kg. Por encima de 2,2 no hay ventaja demostrada, así que no se ofrece:
 * sería vender humo.
 */
export const REGLAS_PROTEINA = [
  { id: 'minimo', gPorKg: 1.6, nombre: 'Mínimo eficaz',
    nota: 'A partir de aquí las ganancias dejan de subir (Morton 2018)' },
  { id: 'estandar', gPorKg: 2.0, nombre: 'Estándar',
    nota: 'Margen de sobra para volumen. Es lo que recomienda el ISSN' },
  { id: 'definicion', gPorKg: 2.2, nombre: 'Definición',
    nota: 'En déficit hace falta más para no perder músculo (Helms 2014)' },
];

/**
 * Multiplicadores de actividad.
 *
 * Carlos pidió saber qué significa cada uno: *«indica en el selector de
 * actividad que significa actividad moderada (ej dias de entreno o tipo de
 * entreno)»*. Por eso cada nivel dice DÍAS y CÓMO son esos días, no solo un
 * adjetivo. La diferencia entre «moderado» y «fuerte» son ~300 kcal al día:
 * elegir a ojo es elegir mal.
 *
 * Los factores son los clásicos de la ecuación de gasto energético total
 * (Harris-Benedict revisada / FAO-OMS-UNU 2004), los mismos que usan las
 * calculadoras de nutrición deportiva.
 */
export const ACTIVIDADES = [
  { id: 'sedentario', factor: 1.2, nombre: 'Sedentario',
    nota: 'Sin entrenar. Oficina o estudiar y poco andar' },
  { id: 'ligero', factor: 1.375, nombre: 'Ligero',
    nota: '1-3 días/semana de pesas, sesiones cortas y sin cardio' },
  { id: 'moderado', factor: 1.55, nombre: 'Moderado',
    nota: '3-5 días/semana de pesas, 1 h por sesión. Lo normal si vas al gym' },
  { id: 'fuerte', factor: 1.725, nombre: 'Fuerte',
    nota: '6-7 días/semana, o pesas más cardio, o trabajo físico de pie' },
];

/** Qué se persigue, y cuánto se corrige el gasto para conseguirlo. */
export const METAS = [
  { id: 'bajar', ajuste: -0.20, nombre: 'Bajar grasa',
    nota: '20 % por debajo. Bajar más rápido cuesta músculo' },
  { id: 'mantener', ajuste: 0, nombre: 'Mantener', nota: 'Comer lo que gastas' },
  { id: 'subir', ajuste: 0.10, nombre: 'Ganar músculo',
    nota: '10 % por encima. Más superávit es más grasa, no más músculo' },
];

/**
 * De dónde sale cada número, para poder enseñarlo en la app.
 *
 * Carlos: *«respalda los calculos con los estudios mas actuales y respaldados
 * para afianzar tus calculos»*. Está aquí y se muestra en la pantalla de
 * objetivo: si alguien quiere comprobarlo, tiene la referencia.
 */
export const REFERENCIAS = [
  {
    tema: 'Metabolismo basal',
    formula: 'Mifflin-St Jeor',
    fuente: 'Mifflin MD et al., Am J Clin Nutr 1990;51(2):241-7',
    porque: 'De las fórmulas que no requieren laboratorio es la que menos se '
          + 'equivoca: la Academy of Nutrition and Dietetics la recomienda por '
          + 'encima de Harris-Benedict tras revisar los estudios comparativos.',
  },
  {
    tema: 'Proteína por kilo',
    formula: '1,6 g/kg (mínimo) – 2,2 g/kg (definición)',
    fuente: 'Morton RW et al., Br J Sports Med 2018;52(6):376-84 (meta-análisis '
          + 'de 49 estudios, 1.863 personas)',
    porque: 'Encontraron que por encima de 1,62 g/kg no hay más ganancia de '
          + 'músculo. En déficit calórico sí conviene subir a 2,2-2,4 g/kg '
          + '(Helms ER et al., Int J Sport Nutr Exerc Metab 2014;24(2):127-38) '
          + 'para no perder masa magra mientras se pierde grasa.',
  },
  {
    tema: 'Grasa mínima',
    formula: '25 % de las calorías',
    fuente: 'Posicionamiento del ISSN (Kerksick CM et al., J Int Soc Sports '
          + 'Nutr 2018;15:38)',
    porque: 'Bajar del 20-25 % de forma sostenida se asocia a caídas de '
          + 'testosterona. Por eso la grasa se fija primero y los hidratos se '
          + 'llevan lo que sobre.',
  },
  {
    tema: 'Ritmo de pérdida de peso',
    formula: 'Déficit del 20 %',
    fuente: 'Garthe I et al., Int J Sport Nutr Exerc Metab 2011;21(2):97-104',
    porque: 'Perder ~0,7 % del peso por semana conserva la masa magra; ir más '
          + 'rápido hace que parte de lo que baja la báscula sea músculo.',
  },
];

/**
 * Metabolismo basal por Mifflin-St Jeor, que es la fórmula con menos error medio
 * de las que se usan sin medir en laboratorio.
 *
 * Devuelve null si falta un dato. NO se rellena con una media: un objetivo de
 * calorías calculado sobre una edad inventada es peor que no tener objetivo,
 * porque parece que sabes lo que haces.
 */
export function metabolismoBasal({ pesoKg, alturaCm, edad, sexo }) {
  const p = Number(pesoKg), a = Number(alturaCm), e = Number(edad);
  if (!(p > 0) || !(a > 0) || !(e > 0)) return null;
  const base = 10 * p + 6.25 * a - 5 * e;
  return Math.round(base + (sexo === 'mujer' ? -161 : 5));
}

/**
 * El objetivo diario que PROPONE la fórmula.
 *
 * Reparto de macros, y por qué así:
 *  - la proteína manda, porque es la que sostiene el músculo (regla g/kg);
 *  - la grasa se fija en el 25 % de las kcal, que es el suelo razonable para no
 *    tocar las hormonas;
 *  - los hidratos se llevan LO QUE SOBRE. Es el orden correcto: son el macro
 *    del que se puede prescindir sin romper nada.
 */
export function objetivoPropuesto({ pesoKg, alturaCm, edad, sexo, actividad, meta, gPorKg }) {
  const basal = metabolismoBasal({ pesoKg, alturaCm, edad, sexo });
  if (basal === null) return null;

  const fa = (ACTIVIDADES.find((x) => x.id === actividad) || ACTIVIDADES[2]).factor;
  const aj = (METAS.find((x) => x.id === meta) || METAS[1]).ajuste;
  const kcal = Math.round(basal * fa * (1 + aj));

  const prot = Math.round(Number(pesoKg) * (Number(gPorKg) || 2.0));
  const gras = Math.round((kcal * 0.25) / KCAL_POR_GRAMO.gras);
  // Lo que quede tras pagar proteína y grasa. El máximo con 0 evita un número
  // negativo absurdo si alguien pone un déficit brutal con mucha proteína.
  const carb = Math.max(0, Math.round(
    (kcal - prot * KCAL_POR_GRAMO.prot - gras * KCAL_POR_GRAMO.gras) / KCAL_POR_GRAMO.carb
  ));
  return { kcal, prot, carb, gras, basal, gasto: Math.round(basal * fa) };
}

/**
 * Proteína objetivo por la regla g/kg. Se separa de lo anterior porque Carlos
 * puede querer poner sus kcal a mano y AUN ASÍ que la proteína siga a su peso.
 */
export function proteinaObjetivo(pesoKg, gPorKg = 2.0) {
  if (!(Number(pesoKg) > 0)) return null;
  return Math.round(Number(pesoKg) * Number(gPorKg));
}

/** El peso más reciente. null si nunca se ha pesado (y entonces se dice). */
export function pesoActual(pesos) {
  const vivos = (pesos || []).filter((p) => !p.del && Number(p.kg) > 0);
  if (!vivos.length) return null;
  vivos.sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
  return { kg: Number(vivos[0].kg), fecha: vivos[0].fecha };
}

/**
 * Serie de peso con MEDIA MÓVIL de 7 días.
 *
 * Esto es lo importante de toda la pantalla de peso: el peso de un día no
 * significa nada. Oscila 1-2 kg por agua, sal y por si has ido al baño. Enseñar
 * el crudo haría creer a Carlos que ha engordado un kilo de un día para otro y
 * tomaría decisiones sobre ruido. La media móvil es la única línea honesta.
 *
 * Cada punto lleva su `kg` (lo que marcó la báscula ese día, o null) y su
 * `media` (de los 7 días anteriores incluido él). La media solo aparece con 3
 * pesadas o más dentro de la ventana: con menos sería otra forma de inventar.
 */
/**
 * Cuántos días de ventana tiene sentido dibujar.
 *
 * Pedir 90 días cuando solo hay 30 de pesadas deja dos tercios de la gráfica
 * vacíos y apelotona los puntos a la derecha — se ve en la captura del panel.
 * Se ajusta a lo que hay, con un mínimo de 14 (por debajo la línea es un
 * garabato) y el máximo que se pida.
 */
export function ventanaDePeso(pesos, maximo = 90, hoy = HOY()) {
  const fechas = (pesos || [])
    .filter((p) => !p.del && Number(p.kg) > 0)
    .map((p) => (p.fecha || '').slice(0, 10))
    .filter(Boolean)
    .sort();
  if (!fechas.length) return Math.min(30, maximo);
  const desde = new Date(`${fechas[0]}T12:00:00`);
  const hasta = new Date(`${hoy}T12:00:00`);
  const dias = Math.round((hasta - desde) / 86400000) + 1;
  return Math.max(14, Math.min(maximo, dias));
}

export function serieDePeso(pesos, dias = 90, hoy = HOY()) {
  const porDia = new Map();
  for (const p of pesos || []) {
    if (p.del || !(Number(p.kg) > 0)) continue;
    porDia.set((p.fecha || '').slice(0, 10), Number(p.kg));
  }
  const base = new Date(`${hoy}T12:00:00`);   // mediodía: esquiva el cambio de hora
  const salida = [];
  for (let i = dias - 1; i >= 0; i--) {
    const f = new Date(base);
    f.setDate(f.getDate() - i);
    const clave = f.toISOString().slice(0, 10);
    salida.push({ fecha: clave, kg: porDia.has(clave) ? porDia.get(clave) : null, media: null });
  }
  for (let i = 0; i < salida.length; i++) {
    const ventana = salida.slice(Math.max(0, i - 6), i + 1)
      .map((d) => d.kg).filter((k) => k !== null);
    if (ventana.length >= 3) {
      salida[i].media = redondea(ventana.reduce((s, k) => s + k, 0) / ventana.length);
    }
  }
  return salida;
}

/**
 * Cuánto se mueve el peso a la semana, según la media móvil.
 * Devuelve null si no hay dos medias separadas por al menos 14 días: una
 * tendencia sobre una semana es ruido, y ya sabemos lo que pasa cuando se dan
 * porcentajes con dos muestras.
 */
export function tendenciaDePeso(serie) {
  const conMedia = (serie || []).filter((d) => d.media !== null);
  if (conMedia.length < 2) return null;
  const a = conMedia[0], b = conMedia[conMedia.length - 1];
  const dias = (new Date(`${b.fecha}T12:00:00`) - new Date(`${a.fecha}T12:00:00`)) / 86400000;
  if (dias < 14) return null;
  return { kgPorSemana: redondea((b.media - a.media) / (dias / 7), 2), dias: Math.round(dias) };
}

/** Cuánto falta para el peso objetivo. null si no hay objetivo o no hay peso. */
export function faltaParaObjetivo(pesoKg, objetivoKg) {
  if (!(Number(pesoKg) > 0) || !(Number(objetivoKg) > 0)) return null;
  return redondea(Number(objetivoKg) - Number(pesoKg));
}

/* --------------------------------------------------------------------------
 * Cuentas
 * ------------------------------------------------------------------------ */

/** Redondeo a un decimal, evitando el 0.30000000000000004 de coma flotante. */
export function redondea(n, decimales = 1) {
  const f = 10 ** decimales;
  return Math.round((Number(n) || 0) * f) / f;
}

/**
 * Macros de `cantidad` de un alimento, medida en `unidad`.
 *
 * `unidad` es opcional: si no se pasa, se usa la del alimento (que es como se
 * llamaba antes, así que no rompe nada). Sirve para el caso que pidió Carlos:
 * el huevo se cuenta en unidades, pero si un día quiere poner 110 g de huevo
 * también tiene que salir bien.
 *
 * Los macros están SIEMPRE por 100 g o 100 ml. Para un alimento por unidades,
 * están por UNA unidad. `gramosUd` traduce entre los dos mundos.
 */
export function macrosDe(alimento, cantidad, unidad = null) {
  const c = Number(cantidad) || 0;
  const suya = alimento.unidad || 'g';
  const u = unidad || suya;

  // TODO pasa por `convertirExacto`. Antes esta función tenía su propia
  // aritmética en paralelo y es justo lo que prohíbe la regla de la paridad: dos
  // sitios que calculan lo mismo tienen que dar lo mismo, y aquí ya se habían
  // separado (el caso ml↔g estaba escrito dos veces, con dos redondeos).
  const enSuya = u === suya ? c : convertirExacto(c, u, suya, alimento);
  // Sin puente no se inventa: devolver 0 avisa (0 kcal salta a la vista),
  // devolver un número plausible no.
  if (enSuya === null) {
    return { kcal: 0, prot: 0, carb: 0, gras: 0, incierto: true };
  }
  // Por unidades los macros ya son POR PIEZA; por peso o volumen van por 100.
  const factor = suya === 'ud' ? enSuya : enSuya / 100;

  return {
    kcal: redondea((alimento.kcal || 0) * factor, 0),
    prot: redondea((alimento.prot || 0) * factor),
    carb: redondea((alimento.carb || 0) * factor),
    gras: redondea((alimento.gras || 0) * factor),
  };
}

/* --------------------------------------------------------------------------
 * BUSCAR EN LA DESPENSA
 *
 * Carlos: «el buscador de comidas es una puta mierda (…) si busco zanahoria
 * sale manzana y merluza».
 *
 * Tenía dos fallos encima del otro:
 *  1. Su móvil no tenía «Zanahoria» (ver `sembrarAlimentos` en app.js).
 *  2. El buscador era `nombre.includes(consulta)` a pelo, así que mientras
 *     tecleaba «zana» le salía **man-ZANA** y con «za» le salía **merlu-ZA**.
 *     Un `includes` no distingue entre empezar por algo y contenerlo por medio,
 *     y esa diferencia es justo la que importa al buscar.
 *
 * Ahora se puntúa: palabra completa > empieza por > suelta por dentro. Y hay
 * que casar TODAS las palabras escritas, no una cualquiera: «pan integral» no
 * puede devolver todos los panes.
 * ------------------------------------------------------------------------ */

/** Minúsculas y sin tildes: «platano» tiene que encontrar «plátano». */
export function normalizar(t) {
  return String(t || '').toLowerCase()
    // ̀-ͯ son las tildes ya separadas por NFD. Escritas con el código y no con
    // el carácter, que en el fichero serían invisibles y las borraría el
    // primero que pase por aquí.
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export function buscarAlimentos(consulta, alimentos, { limite = 40, veces = null } = {}) {
  const vivos = (alimentos || []).filter((a) => !a.del);
  const cuenta = (a) => (veces && veces.get(a.id)) || 0;
  const q = normalizar(consulta).trim();

  // Sin nada escrito, lo que más repite arriba: es lo que va a volver a comer.
  if (!q) {
    return [...vivos]
      .sort((a, b) => cuenta(b) - cuenta(a) || a.nombre.localeCompare(b.nombre))
      .slice(0, limite);
  }

  const palabras = q.split(/\s+/).filter(Boolean);
  const marcados = [];
  for (const a of vivos) {
    const nombre = normalizar(a.nombre);
    const trozos = nombre.split(/[^a-z0-9]+/).filter(Boolean);
    let punto = 0;
    let todas = true;
    for (const p of palabras) {
      if (trozos.includes(p)) punto += 10;                       // la palabra entera
      else if (trozos.some((t) => t.startsWith(p))) punto += 6;  // empieza por ella
      else if (nombre.includes(p)) punto += 1;                   // suelta por dentro
      else { todas = false; break; }
    }
    // TODAS las palabras o nada. Si no, escribir más palabras daría MÁS
    // resultados en vez de menos, que es lo contrario de buscar.
    if (!todas) continue;
    if (nombre === q) punto += 20;
    if (nombre.startsWith(q)) punto += 8;
    punto += Math.min(5, cuenta(a));          // lo que ya come, delante
    punto -= nombre.length * 0.01;            // a igualdad, gana el nombre corto
    marcados.push({ a, punto });
  }
  marcados.sort((x, y) => y.punto - x.punto || x.a.nombre.localeCompare(y.a.nombre));
  return marcados.slice(0, limite).map((m) => m.a);
}

/**
 * Cómo se miden los macros de este alimento, en cristiano.
 *
 * Carlos: «en algunas comidas sale calorias por x gramos pero tambien deberia
 * salir calorias y aporte nutricional por unidad es obvio». Tiene razón: saber
 * que el pan de molde tiene 253 kcal/100 g no ayuda a nadie que se coma UNA
 * REBANADA. Cuando se sabe lo que pesa la pieza se enseñan las dos cosas.
 */
export function resumenAlimento(a) {
  if (!a) return '';
  const unidad = a.unidad || 'g';
  const g = Number(a.gramosUd) || 0;
  if (unidad === 'ud') {
    // Los macros ya están POR PIEZA (el convenio). Los de 100 g se deducen.
    const por100 = g ? Math.round((Number(a.kcal) || 0) * 100 / g) : null;
    // «136 kcal/scoop (30 g)» dice mucho más que «136 kcal/ud».
    return `${Math.round(a.kcal || 0)} kcal/${nombreUd(a)}${g ? ` (${g} g)` : ''}`
         + (por100 ? ` · ${por100} kcal/100 g` : '');
  }
  // Con puente conocido se enseñan LAS DOS cifras aunque los valores vayan por
  // 100 g. Carlos: «tambien deberia salir calorias y aporte nutricional por
  // unidad es obvio». Saber que su proteína tiene 356 kcal/100 g no le dice
  // nada; «89 kcal/scoop» sí, porque el scoop es lo que echa en el vaso.
  //
  // OJO: en un alimento en 'ml', `gramosUd` NO es el peso de una pieza sino la
  // densidad (el aceite, 0,918). Ahí esta línea diría «0 kcal/unidad (1 g)», así
  // que solo se hace con los que van por 100 g.
  if (unidad === 'ml') return `${Math.round(a.kcal || 0)} kcal/100 ml`;
  const porPieza = g
    ? ` · ${Math.round((Number(a.kcal) || 0) * g / 100)} kcal/${nombreUd(a)} (${g} g)`
    : '';
  return `${Math.round(a.kcal || 0)} kcal/100 g${porPieza}`;
}

/* --------------------------------------------------------------------------
 * ALIMENTOS COMPUESTOS — «mi bol de preentreno»
 *
 * Carlos: «no has entendido lo de crear alimentos personizados (…) si yo me he
 * hecho un bol de preentreno quiero crear un alimento que se llame preentreno y
 * que le puedas añadir alli los ingredientes y que con eso te calcule ya los
 * macros».
 *
 * Y tenía razón en que no se había entendido: lo que había era teclear los
 * macros a mano, que sirve para la pechuga de pollo pero no para un bol con
 * cinco cosas dentro.
 *
 * CÓMO SE GUARDA: el compuesto es un alimento normal y corriente con
 * `unidad: 'ud'` (una ración = el bol entero), sus macros ya sumados y la lista
 * de ingredientes dentro. Así se puede apuntar de un toque como cualquier otro,
 * y como lleva `gramosUd` (lo que pesa el bol) también se puede medir en gramos
 * si un día se hace medio.
 * ------------------------------------------------------------------------ */

/**
 * Suma los macros de una lista de ingredientes.
 *
 * Los que no se encuentran NO se ignoran en silencio: se devuelven en `faltan`.
 * Restar un ingrediente sin avisar dejaría el bol con menos calorías de las que
 * tiene, que es la clase de error que no se nota hasta que la báscula no baja.
 */
export function macrosDeReceta(ingredientes, alimentos) {
  const t = { kcal: 0, prot: 0, carb: 0, gras: 0 };
  const faltan = [];
  let gramos = 0;
  let pesoIncierto = false;

  for (const ing of ingredientes || []) {
    const a = (alimentos || []).find((x) => x.id === ing.alimentoId);
    if (!a) {
      faltan.push(ing.nombre || 'un ingrediente');
      continue;
    }
    const m = macrosDe(a, ing.cantidad, ing.unidad);
    t.kcal += m.kcal; t.prot += m.prot; t.carb += m.carb; t.gras += m.gras;

    // El peso del bol hace falta para poder medirlo luego en gramos. Si algún
    // ingrediente no se puede pasar a gramos (no sabemos lo que pesa una pieza)
    // se dice, en vez de dar un peso que se ha quedado corto.
    const g = convertir(ing.cantidad, ing.unidad || a.unidad || 'g', 'g', a);
    if (g === null) pesoIncierto = true;
    else gramos += g;
  }
  return {
    kcal: Math.round(t.kcal), prot: redondea(t.prot),
    carb: redondea(t.carb), gras: redondea(t.gras),
    gramos: pesoIncierto ? null : Math.round(gramos),
    faltan,
  };
}

/** Suma de una lista de comidas. */
export function total(comidas) {
  const t = { kcal: 0, prot: 0, carb: 0, gras: 0 };
  for (const c of comidas || []) {
    t.kcal += Number(c.kcal) || 0;
    t.prot += Number(c.prot) || 0;
    t.carb += Number(c.carb) || 0;
    t.gras += Number(c.gras) || 0;
  }
  return { kcal: Math.round(t.kcal), prot: redondea(t.prot), carb: redondea(t.carb), gras: redondea(t.gras) };
}

/** Lo que queda para llegar al objetivo. Negativo = pasado de la raya. */
export function restante(objetivo, consumido) {
  const o = objetivo || OBJETIVO_POR_DEFECTO;
  return {
    kcal: Math.round((o.kcal || 0) - consumido.kcal),
    prot: redondea((o.prot || 0) - consumido.prot),
    carb: redondea((o.carb || 0) - consumido.carb),
    gras: redondea((o.gras || 0) - consumido.gras),
  };
}

/** Porcentaje cumplido (0-100 para la barra; el valor real puede pasar de 100). */
export function porcentaje(consumido, objetivo) {
  if (!objetivo) return 0;
  return Math.round((consumido / objetivo) * 100);
}

/**
 * Comprueba si los macros del alimento cuadran con sus kilocalorías.
 *
 * No es cosmético: teclear un 4 en vez de un 40 en la proteína es el error más
 * fácil del mundo, y a partir de ahí TODO el seguimiento miente. Se avisa
 * cuando la diferencia pasa del 20 %, que es más de lo que explican el
 * redondeo, la fibra o el alcohol.
 */
export function revisarCoherencia(a) {
  // Las bebidas alcohólicas no pueden cuadrar: el alcohol aporta 7 kcal/g y no
  // es proteína, ni hidrato, ni grasa. Una cerveza declara 43 kcal y sus macros
  // suman 16, y las dos cosas son ciertas. Avisar aquí sería ruido.
  if (a && a.alcohol) return null;
  // Hay energía que no es proteína, ni hidrato, ni grasa, y no siempre es
  // alcohol: el vinagre balsámico declara 90 kcal y sus macros suman 71 porque
  // el resto es ÁCIDO ACÉTICO. Los dos números son correctos.
  //
  // Esta marca no se pone a mano en una lista de excepciones (que quedaría
  // desfasada a la primera regeneración): la calcula el generador comparando
  // lo que declara USDA con la cuenta de Atwater. Ojo, solo vale para la base;
  // en algo tecleado por Carlos ese mismo desfase sí es un error suyo, y por
  // eso el aviso tiene que seguir saltando ahí.
  if (a && a.noSoloMacros) return null;
  // Algunos alimentos usan factores de Atwater PROPIOS, publicados por USDA. El
  // limón cuenta sus hidratos a 2,48 kcal/g (mucho es ácido cítrico), así que
  // declara 29 kcal donde la cuenta genérica da 39. Los dos números son
  // correctos; avisar aquí sería ladrar a un dato bueno.
  if (a && a.factoresPropios) return null;
  // La fibra suma si la ficha la trae. Los hidratos que guardamos son los
  // DISPONIBLES (sin fibra), como en una etiqueta europea, así que sin este
  // término las lentejas parecían tener 88 kcal declarando 116 — y el aviso
  // saltaba sobre alimentos que estaban perfectamente bien.
  const calculadas =
    (a.prot || 0) * KCAL_POR_GRAMO.prot +
    (a.carb || 0) * KCAL_POR_GRAMO.carb +
    (a.gras || 0) * KCAL_POR_GRAMO.gras +
    (a.fibra || 0) * KCAL_POR_GRAMO.fibra;
  const declaradas = Number(a.kcal) || 0;
  if (declaradas <= 0 || calculadas <= 0) return null;
  const desvio = Math.abs(calculadas - declaradas) / declaradas;
  if (desvio <= 0.2) return null;
  return `Los macros dan ${Math.round(calculadas)} kcal pero has puesto ${Math.round(declaradas)}. ¿Alguno está mal?`;
}

/** Agrupa las comidas de un día por momento, en el orden de MOMENTOS. */
export function porMomento(comidas, propios = null) {
  const salida = [];
  for (const m of todosLosMomentos(propios)) {
    const suyas = (comidas || []).filter((c) => (c.momento || 'otro') === m.id);
    if (suyas.length) salida.push({ ...m, comidas: suyas, total: total(suyas) });
  }
  return salida;
}

/**
 * Kilocalorías por día de los últimos `dias` días, del más viejo al más nuevo.
 * Devuelve SIEMPRE la serie completa, con 0 en los días sin registro: si no,
 * la gráfica se saltaría los días en blanco y parecería que comió todos.
 */
export function ultimosDias(comidas, dias = 7, hoy = HOY()) {
  const porDia = new Map();
  for (const c of comidas || []) {
    const d = (c.fecha || '').slice(0, 10);
    porDia.set(d, (porDia.get(d) || 0) + (Number(c.kcal) || 0));
  }
  const salida = [];
  const base = new Date(`${hoy}T12:00:00`);   // mediodía: esquiva el cambio de hora
  for (let i = dias - 1; i >= 0; i--) {
    const f = new Date(base);
    f.setDate(f.getDate() - i);
    const clave = f.toISOString().slice(0, 10);
    salida.push({ fecha: clave, kcal: Math.round(porDia.get(clave) || 0) });
  }
  return salida;
}

/** Media de kcal de los días en que SÍ comió algo (los vacíos no son ceros reales). */
export function mediaDiaria(serie) {
  const conDatos = (serie || []).filter((d) => d.kcal > 0);
  if (!conDatos.length) return null;          // sin datos → «no lo sé», no un 0
  return Math.round(conDatos.reduce((s, d) => s + d.kcal, 0) / conDatos.length);
}
