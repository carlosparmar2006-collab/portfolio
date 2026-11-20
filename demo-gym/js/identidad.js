/* =============================================================================
 * identidad.js — DE QUIÉN SON LOS DATOS DE ESTE MÓVIL
 *
 * Carlos, 1-sep-2026, después de probar la app con dos cuentas:
 *
 *   «He creado una cuenta para mi novia… sesión cerrada, pero seguía saliendo
 *    Aria Elías, que es el usuario que le he puesto. Y luego he entrado con mi
 *    cuenta y tampoco se había cambiado el usuario, seguían sus ejercicios y
 *    todo. La idea es que te fuerce a crear una cuenta, porque si no pierdes
 *    todo, y que si cierras sesión te mande a un inicio para entrar. Si ya
 *    tienes una cuenta, pues que entres y se vuelvan a meter todos tus datos.»
 *
 * LA CAUSA RAÍZ, Y NO ERA «FALTA UN BOTÓN»
 * ----------------------------------------
 * La base del móvil no sabía de quién era. La sesión de Supabase estaba
 * guardada como un ajuste más, al lado del tema de color, y NADA la ataba a las
 * series, ni al perfil, ni al nombre. De ahí salían los tres síntomas de una
 * vez, y son el mismo:
 *
 *   · «sale sin nombre y te hace volver a meterlo» — el alias y el nombre se
 *     escribían en Supabase al registrarte y nunca bajaban al móvil.
 *   · «cierro sesión y sigue saliendo Aria» — cerrar sesión borraba el testigo
 *     y nada más; la pantalla seguía enseñando el perfil de antes.
 *   · «entro con la mía y siguen sus ejercicios» — porque los ejercicios no
 *     eran de nadie.
 *
 * LO QUE HACE ESTE FICHERO
 * ------------------------
 * Pone un DUEÑO a la base: el `id` de la cuenta con la que se configuró. A
 * partir de ahí solo hay tres situaciones posibles al entrar, y las tres tienen
 * una respuesta escrita:
 *
 *   ADOPTAR — la base no tiene dueño (móvil recién instalado, o alguien que ya
 *             usaba la app antes de que hubiera cuentas). Sus datos pasan a ser
 *             de esta cuenta. No se pregunta: no hay nada que se pueda perder.
 *   MISMO   — vuelves tú. Se refresca el perfil desde la nube y ya está.
 *   AJENO   — los datos son de OTRA cuenta. **Se pregunta.** Y solo si dices
 *             que sí se vacía. Esto no se hace solo ni aunque sea obvio: es la
 *             única operación de la app que borra dos años de entrenos.
 *
 * SIN DOM Y SIN PANTALLAS a propósito: así se puede probar en Node, y hay test
 * (`app/test_identidad.mjs`). Las tres situaciones son reglas, y las reglas no
 * se comprueban a ojo.
 * ========================================================================== */

const CLAVE_DUENO = 'dueno';
const CLAVE_ALIAS_DUENO = 'dueno_alias';   // solo para poder DECIR de quién son

/* --------------------------------------------------------------------------
 * La regla, sola y sin dependencias.
 *
 * Se le pasan los datos ya leídos en vez de que vaya a buscarlos, porque así el
 * test puede ponerle delante las combinaciones raras (dueño sin datos, datos
 * sin dueño) sin montar una IndexedDB.
 * ------------------------------------------------------------------------ */

/**
 * @param dueno      id de la cuenta que tiene la base, o vacío
 * @param entrante   id de la cuenta con la que se acaba de entrar
 * @param hayDatos   ¿hay algo que perder? (series, gimnasios, rutinas…)
 * @returns 'adoptar' | 'mismo' | 'ajeno'
 */
export function queHacer(dueno, entrante, hayDatos) {
  const d = String(dueno || '').trim();
  const e = String(entrante || '').trim();
  if (!e) return 'adoptar';          // sin cuenta no hay nada que decidir
  if (d && d === e) return 'mismo';
  if (!d) return 'adoptar';
  // Hay dueño y es otro. Si la base está VACÍA no hay drama ni pregunta que
  // hacer: no se puede perder lo que no existe. Esto pasa de verdad — cerrar
  // sesión, vaciar desde Ajustes y volver a entrar con otra cuenta.
  return hayDatos ? 'ajeno' : 'adoptar';
}

/* --------------------------------------------------------------------------
 * Lo mismo, pero hablando con la base. `puente` es `db.js` (o un doble en los
 * tests): `ajuste`, `ponAjuste`, `todos`, `guardar`, `borrarTodo`, `restaurar`.
 * ------------------------------------------------------------------------ */

export async function dueno(puente) {
  return (await puente.ajuste(CLAVE_DUENO, '')) || '';
}

export async function aliasDelDueno(puente) {
  return (await puente.ajuste(CLAVE_ALIAS_DUENO, '')) || '';
}

/** ¿Hay algo que se pueda perder? Se mira lo que cuesta meses, no los ajustes. */
export async function hayDatos(puente) {
  for (const almacen of ['series', 'maquinas', 'gimnasios', 'comidas', 'pesos']) {
    const filas = await puente.todos(almacen);
    if (filas && filas.length) return true;
  }
  return false;
}

/**
 * ¿Hay algo TUYO, hecho por ti?
 *
 * `hayDatos` dice si hay algo que se pueda perder, y para eso vale cualquier
 * fila: se usa antes de BORRAR, y ahí conviene pasarse de prudente.
 *
 * Esto es la otra pregunta, y no es la misma: ¿hay algo que una copia pudiera
 * PISAR? Los tres gimnasios que la app trae de fábrica no son tuyos —no los has
 * escrito tú, no se pierde nada si se juntan con los de la copia—, así que un
 * móvil recién instalado que solo los tenga sigue estando vacío a estos
 * efectos. Sin esta distinción, al volver a entrar después de reinstalar se
 * preguntaba «¿la traigo?» siempre, que es justo la pregunta que Carlos
 * contestaba que no y le dejaba el móvil a cero.  (3-sep-2026)
 */
export async function hayDatosTuyos(puente) {
  for (const almacen of ['series', 'maquinas', 'comidas', 'pesos']) {
    const filas = await puente.todos(almacen);
    if (filas && filas.length) return true;
  }
  const gimnasios = (await puente.todos('gimnasios')) || [];
  return gimnasios.some((g) => !String(g.id || '').startsWith('semilla-'));
}

/** La decisión, ya con la base delante. */
export async function decidir(puente, entrante) {
  return queHacer(await dueno(puente), entrante, await hayDatos(puente));
}

export async function marcarDueno(puente, id, alias = '') {
  await puente.ponAjuste(CLAVE_DUENO, String(id || ''));
  await puente.ponAjuste(CLAVE_ALIAS_DUENO, String(alias || ''));
}

/**
 * Vaciar la base para el dueño nuevo.
 *
 * Los ajustes del APARATO se quedan (a qué nube habla, a qué PC): son de este
 * móvil, no de la persona. Sin eso, cambiar de cuenta dejaba la app sin saber
 * ni con qué Supabase hablar, y la pantalla siguiente era «no hay nube
 * configurada» — la app rota justo después de entrar.
 */
export async function empezarDeCero(puente, id, alias = '') {
  await puente.borrarTodo({ conservarAjustesPrivados: true });
  await marcarDueno(puente, id, alias);
}

/* --------------------------------------------------------------------------
 * EL PERFIL BAJA DE LA NUBE
 *
 * Esto es lo que arregla «te sale sin nombre y te hace volver a meterlo».
 *
 * Manda la nube en lo que la nube sabe (alias, nombre, bio, foto, público) y
 * manda el móvil en lo que solo está aquí (las anotaciones y qué medallas
 * luces): son cosas que nunca han subido, y pisarlas con un hueco vacío sería
 * borrarlas por sorpresa.
 * ------------------------------------------------------------------------ */
export function fundirPerfil(local, remoto) {
  const l = local || {};
  const r = remoto || {};
  return {
    ...l,
    id: 'yo',
    alias: r.alias || l.alias || '',
    aliasVisible: r.alias_visible || r.aliasVisible || r.alias || l.aliasVisible || '',
    nombre: r.nombre || l.nombre || '',
    bio: typeof r.bio === 'string' && r.bio ? r.bio : (l.bio || ''),
    fotoUrl: r.foto_url || r.fotoUrl || l.fotoUrl || '',
    publico: (r.publico === true || r.publico === 1) ? 1 : 0,
    // Estas dos NO vienen de la nube. Nunca han subido.
    medallasElegidas: Array.isArray(l.medallasElegidas) ? l.medallasElegidas : [],
    notas: Array.isArray(l.notas) ? l.notas : [],
  };
}

/* --------------------------------------------------------------------------
 * CUÁNDO TOCA COPIA
 *
 * Ni en cada serie (sería subir 2 MB por cada peso apuntado, con la app en el
 * gimnasio y sin WiFi) ni una vez al mes (perderías el mes). Una vez al día es
 * lo que encaja con el problema: se pierde, como mucho, el entreno de hoy, que
 * además sigue en el móvil salvo que el móvil sea justo lo que has perdido.
 * ------------------------------------------------------------------------ */
export const CADA = 20 * 60 * 60 * 1000;   // 20 h: cabe un entreno diario a la misma hora

export function tocaCopia(ultima, ahora = Date.now(), cada = CADA) {
  if (!ultima) return true;
  return ahora - Number(ultima) >= cada;
}
