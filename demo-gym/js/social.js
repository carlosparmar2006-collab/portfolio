/* =============================================================================
 * social.js — La gente: buscar, seguir, gimnasios, rutinas, likes y comentarios.
 *
 * Carlos, 31-ago-2026: *«que haya una opción de buscar usuarios, añadir amigos
 * (…) cuando añadas un gimnasio puedas ver al resto de miembros, sus records en
 * las máquinas del gym, clasificaciones (…) que se puedan dar likes a las
 * rutinas, poner comentarios (…) y que salga en el perfil los seguidores, las
 * rutinas creadas, las medallas»*.
 *
 * QUÉ HACE ESTE FICHERO Y QUÉ NO
 * ------------------------------
 * Aquí NO hay reglas. Ni una. Quién puede ver qué perfil, cuántas veces al día
 * se puede comentar y si un récord se publica o no, lo decide la BASE
 * (`supabase/schema-2-social.sql`), y por un motivo que no es de estilo: el
 * móvil se puede abrir, cambiar y volver a empaquetar. Cualquier regla escrita
 * aquí es una sugerencia. Este fichero solo llama y traduce la respuesta.
 *
 * Casi todo va por funciones de la base (`rpc`) y no por consultas a las
 * tablas. Es a propósito: una función puede mirar la tabla entera para
 * contestar una pregunta concreta («¿existe este alias?») sin enseñar la tabla,
 * y puede gastar cupo antes de escribir. Una consulta directa no puede hacer
 * ninguna de las dos cosas.
 *
 * NUNCA LANZA HACIA ARRIBA, como `sync.js` y `nube.js`: devuelve
 * `{ok:false, motivo}`. Que la nube esté caída no puede impedir entrenar.
 * ========================================================================== */

import * as nube from './nube.js';
import * as CM from './comunidad.js';
import { normalizarNombre } from './perfil.js';

/* --------------------------------------------------------------------------
 * Gente
 * ------------------------------------------------------------------------ */

/** Buscar por alias o por nombre. Con dos letras ya busca. */
export async function buscarGente(texto, cuantos = 20) {
  const t = String(texto || '').trim();
  if (t.length < 2) return { ok: true, gente: [] };
  const r = await nube.rpc('buscar_gente', { p_texto: t, p_cuantos: cuantos }, { conSesion: false });
  return r.ok ? { ok: true, gente: r.datos || [] } : r;
}

/**
 * Seguir a alguien. Devuelve en qué ha quedado.
 *
 * Quién decide si entra directo o queda pendiente NO es la app: es la base,
 * mirando si el perfil de destino es público. Si lo decidiera la app,
 * cualquiera podría pedir «aceptado» y colarse en un perfil privado.
 */
export async function seguir(alias) {
  const r = await nube.rpc('seguir', { p_alias: String(alias || '').toLowerCase() });
  return r.ok ? { ok: true, estado: r.datos } : r;
}

export async function dejarDeSeguir(idSeguido) {
  const u = nube.usuario();
  if (!u) return { ok: false, motivo: 'no has entrado en tu cuenta' };
  return nube.rest(`/rest/v1/seguimientos?seguidor=eq.${u.id}&seguido=eq.${idSeguido}`, {
    metodo: 'DELETE', conSesion: true,
  });
}

export async function misSolicitudes() {
  const r = await nube.rpc('mis_solicitudes', {});
  return r.ok ? { ok: true, solicitudes: r.datos || [] } : r;
}

export async function responderSolicitud(idSeguidor, aceptar) {
  return nube.rpc('responder_solicitud', { p_seguidor: idSeguidor, p_aceptar: !!aceptar });
}

/** `cuales` es 'seguidores' o 'siguiendo'. */
export async function seguidoresDe(alias, cuales = 'seguidores') {
  const r = await nube.rpc('seguidores_de',
    { p_alias: String(alias || '').toLowerCase(), p_cuales: cuales }, { conSesion: false });
  return r.ok ? { ok: true, gente: r.datos || [] } : r;
}

/** A quién sigo, para poder pintar el botón en el estado correcto. */
export async function aQuienSigo() {
  const u = nube.usuario();
  if (!u) return { ok: true, siguiendo: [] };
  const r = await nube.rest(
    `/rest/v1/seguimientos?seguidor=eq.${u.id}&select=seguido,estado`, { conSesion: true });
  return r.ok ? { ok: true, siguiendo: r.datos || [] } : r;
}

/* --------------------------------------------------------------------------
 * Gimnasios compartidos
 *
 * El gimnasio del móvil sigue siendo del móvil: sus máquinas, sus fotos y sus
 * notas. Esto es la ficha PÚBLICA del sitio, para que dos personas que van al
 * mismo VivaGym sepan que van al mismo.
 * ------------------------------------------------------------------------ */

export async function buscarGimnasios(texto, cuantos = 20) {
  const t = String(texto || '').trim();
  if (t.length < 2) return { ok: true, gimnasios: [] };
  const r = await nube.rpc('buscar_gimnasios', { p_texto: t, p_cuantos: cuantos }, { conSesion: false });
  return r.ok ? { ok: true, gimnasios: r.datos || [] } : r;
}

export async function altaGimnasio({ nombre, ciudad = '', direccion = '', lat = null, lon = null }) {
  const r = await nube.rpc('gimnasio_alta', {
    p_nombre: nombre, p_ciudad: ciudad, p_direccion: direccion, p_lat: lat, p_lon: lon,
  });
  return r.ok ? { ok: true, gimnasio: Array.isArray(r.datos) ? r.datos[0] : r.datos } : r;
}

/* --------------------------------------------------------------------------
 * MODERACIÓN  (2-sep-2026, esquema 8)
 *
 * Carlos: *«no puede ser que hayan 15 viva gyms asociados a una dirección (…)
 * debería haber un moderador atendiendo las solicitudes de creación»*.
 *
 * `conectarGimnasio` sustituye a `altaGimnasio` como puerta de entrada. Ya no
 * crea nada: o encuentra el que había, o abre (o apoya) una SOLICITUD.
 *
 * NADA DE REGLAS AQUÍ DENTRO. Quién puede moderar, qué cuenta como el mismo
 * gimnasio y cuántos apoyos hacen falta lo decide la BASE: este fichero se
 * puede reescribir abriendo el APK, y las reglas del cliente son sugerencias.
 * ------------------------------------------------------------------------ */

export async function conectarGimnasio({ nombre, ciudad = '', direccion = '',
                                         lat = null, lon = null }) {
  const r = await nube.rpc('gimnasio_conectar', {
    p_nombre: nombre, p_ciudad: ciudad, p_direccion: direccion, p_lat: lat, p_lon: lon,
  });
  if (r.ok) {
    const d = Array.isArray(r.datos) ? r.datos[0] : r.datos;
    return { ok: true, ...(d || {}) };
  }
  // LA BASE PUEDE IR POR DETRÁS DE LA APP.
  //
  // Entre que Carlos instala una versión y pega el esquema nuevo pasan días, y
  // en medio esto contestaría 404 («esa función no existe») y conectar un
  // gimnasio dejaría de funcionar por una razón que no es culpa suya. Con el
  // esquema 8 sin pegar se hace lo de antes; en cuanto lo pegue, deja de pasar
  // por aquí. Solo con 404: cualquier otro error SÍ hay que enseñarlo.
  if (r.estado !== 404) return r;
  const viejo = await altaGimnasio({ nombre, ciudad, direccion, lat, lon });
  return viejo.ok ? { ok: true, estado: 'existe', gimnasio: viejo.gimnasio } : viejo;
}

export async function pedidosGimnasio(texto = '', cuantos = 30) {
  const r = await nube.rpc('pedidos_gimnasio',
    { p_texto: texto, p_cuantos: cuantos }, { conSesion: true });
  return r.ok ? { ok: true, pedidos: r.datos || [] } : r;
}

export async function apoyarGimnasio(id) {
  const r = await nube.rpc('apoyar_gimnasio', { p_pedido: id });
  if (!r.ok) return r;
  const d = Array.isArray(r.datos) ? r.datos[0] : r.datos;
  return { ok: true, ...(d || {}) };
}

export async function resolverPedidoGimnasio(id, aceptar, motivo = '') {
  return nube.rpc('resolver_pedido_gimnasio',
    { p_pedido: id, p_aceptar: !!aceptar, p_motivo: motivo });
}

export async function soyModerador() {
  const r = await nube.rpc('soy_moderador', {});
  if (!r.ok) return false;
  const d = Array.isArray(r.datos) ? r.datos[0] : r.datos;
  return d === true;
}

export async function nombrarModerador(alias, poner = true) {
  return nube.rpc('nombrar_moderador', { p_alias: alias, p_poner: !!poner });
}

/** Denunciar un perfil, un gimnasio o una rutina. */
export async function denunciar(tipo, objetivo, motivo, texto = '') {
  return nube.rpc('denunciar',
    { p_tipo: tipo, p_objetivo: objetivo, p_motivo: motivo, p_texto: texto });
}

export async function denunciasAbiertas(cuantas = 50) {
  const r = await nube.rpc('denuncias_abiertas', { p_cuantas: cuantas });
  return r.ok ? { ok: true, denuncias: r.datos || [] } : r;
}

export async function resolverDenuncia(id, accion, nota = '') {
  return nube.rpc('resolver_denuncia', { p_denuncia: id, p_accion: accion, p_nota: nota });
}

/** Apuntarse a un gimnasio. `compite` es OTRA decisión: ver abajo. */
export async function entrarEnGimnasio(gimnasioId, compite = false) {
  const u = nube.usuario();
  if (!u) return { ok: false, motivo: 'no has entrado en tu cuenta' };
  return nube.rest('/rest/v1/miembros', {
    metodo: 'POST', conSesion: true,
    cabeceras: { Prefer: 'resolution=merge-duplicates,return=representation' },
    cuerpo: [{ gimnasio: gimnasioId, usuario: u.id, compite: !!compite }],
  });
}

export async function salirDeGimnasio(gimnasioId) {
  const u = nube.usuario();
  if (!u) return { ok: false, motivo: 'no has entrado en tu cuenta' };
  // Primero los récords y luego la fila de miembro: al revés, el borrado de los
  // récords se quedaría sin la política que lo permite y dejaría rastro.
  await nube.rest(`/rest/v1/records_gym?gimnasio=eq.${gimnasioId}&usuario=eq.${u.id}`,
    { metodo: 'DELETE', conSesion: true });
  return nube.rest(`/rest/v1/miembros?gimnasio=eq.${gimnasioId}&usuario=eq.${u.id}`,
    { metodo: 'DELETE', conSesion: true });
}

export async function misGimnasios() {
  const u = nube.usuario();
  if (!u) return { ok: true, gimnasios: [] };
  const r = await nube.rest(
    `/rest/v1/miembros?usuario=eq.${u.id}&select=compite,desde,gimnasios_pub(*)`, { conSesion: true });
  return r.ok
    ? { ok: true, gimnasios: (r.datos || []).map((m) => ({ ...m.gimnasios_pub, compite: m.compite, desde: m.desde })) }
    : r;
}

export async function miembrosDe(gimnasioId, cuantos = 50) {
  const r = await nube.rpc('miembros_de', { p_gimnasio: gimnasioId, p_cuantos: cuantos }, { conSesion: false });
  return r.ok ? { ok: true, miembros: r.datos || [] } : r;
}

/* --------------------------------------------------------------------------
 * LA FICHA DE UN GIMNASIO, ANTES DE APUNTARSE  (1-sep-2026)
 *
 * Carlos: *«estaría bien que al buscar el gym inicial puedas ver la gente
 * asociada a ese gym y las máquinas que hay y rutinas»*. Hasta ahora había que
 * apuntarse PRIMERO para ver nada, que es justo del revés: lo que uno quiere
 * saber antes de apuntarse es si merece la pena.
 * ------------------------------------------------------------------------ */

/** Los números de cabecera: cuánta gente, cuántas máquinas, cuántas rutinas. */
export async function fichaGimnasio(gimnasioId) {
  const r = await nube.rpc('ficha_gimnasio', { p_gimnasio: gimnasioId },
                           { conSesion: !!nube.usuario() });
  if (!r.ok) return r;
  const fila = Array.isArray(r.datos) ? r.datos[0] : r.datos;
  return fila ? { ok: true, ficha: fila } : { ok: false, motivo: 'ese gimnasio ya no existe' };
}

/** El INVENTARIO de máquinas. Distinto de las que tienen clasificación: aquí
 *  sale una máquina aunque solo la haya publicado una persona, porque «en este
 *  gimnasio hay prensa» es útil igual. La regla de las dos personas sigue
 *  mandando donde tiene que mandar, que es en la clasificación. */
export async function maquinasDeGimnasio(gimnasioId, cuantos = 80) {
  const r = await nube.rpc('maquinas_de_gimnasio',
                           { p_gimnasio: gimnasioId, p_cuantos: cuantos },
                           { conSesion: !!nube.usuario() });
  return r.ok ? { ok: true, maquinas: r.datos || [] } : r;
}

/** Las rutinas publicadas por la gente de ese gimnasio. */
export async function rutinasDeGimnasio(gimnasioId, cuantos = 20) {
  const r = await nube.rpc('rutinas_de_gimnasio',
                           { p_gimnasio: gimnasioId, p_cuantos: cuantos },
                           { conSesion: !!nube.usuario() });
  return r.ok ? { ok: true, rutinas: r.datos || [] } : r;
}

export async function maquinasConClasificacion(gimnasioId) {
  const r = await nube.rpc('maquinas_con_clasificacion', { p_gimnasio: gimnasioId }, { conSesion: false });
  return r.ok ? { ok: true, maquinas: r.datos || [] } : r;
}

export async function clasificacion(gimnasioId, maquina, cuantos = 50) {
  const r = await nube.rpc('clasificacion', {
    p_gimnasio: gimnasioId, p_maquina: normalizarNombre(maquina), p_cuantos: cuantos,
  }, { conSesion: false });
  return r.ok ? { ok: true, puestos: r.datos || [] } : r;
}

/**
 * Publica TUS MEJORES PESOS de un gimnasio. Uno por máquina, nada más.
 *
 * AQUÍ ESTÁ LA LÍNEA QUE NO SE CRUZA. La regla del proyecto es que las series
 * no salen del móvil, y no se ha movido: lo que sube es UN NÚMERO por máquina,
 * el mejor, y solo de los gimnasios en los que te has apuntado a la
 * clasificación a propósito. No sube cuándo entrenas, ni cuántas veces, ni lo
 * que has bajado, ni los días que fallaste. Con eso se puede hacer una
 * clasificación honrada; con el historial se podría reconstruir tu vida.
 *
 * @param mejores  [{nombre, kg, reps, fecha}] — ya calculado por quien llama
 */
export async function publicarRecords(gimnasioId, mejores) {
  const u = nube.usuario();
  if (!u) return { ok: false, motivo: 'no has entrado en tu cuenta' };
  const filas = (mejores || [])
    .filter((m) => m && m.nombre && Number(m.kg) > 0 && Number(m.kg) < 1000)
    .map((m) => ({
      gimnasio: gimnasioId,
      usuario: u.id,
      maquina: normalizarNombre(m.nombre),
      maquina_n: String(m.nombre).slice(0, 80),
      kg: Math.round(Number(m.kg) * 10) / 10,
      reps: Math.min(100, Math.max(1, Math.round(Number(m.reps) || 1))),
      fecha: m.fecha ? String(m.fecha).slice(0, 10) : null,
    }));
  if (!filas.length) return { ok: true, subidos: 0 };

  const r = await nube.rest('/rest/v1/records_gym', {
    metodo: 'POST', conSesion: true,
    cabeceras: { Prefer: 'resolution=merge-duplicates' },
    cuerpo: filas,
  });
  return r.ok ? { ok: true, subidos: filas.length } : r;
}

/* --------------------------------------------------------------------------
 * Rutinas publicadas
 * ------------------------------------------------------------------------ */

/**
 * Las rutinas de la comunidad. `orden` es 'populares' | 'nuevas' | 'amigos'.
 *
 * SIEMPRE devuelve algo. Las ocho oficiales viajan dentro de la app
 * (`comunidad.js`), así que aunque no haya red la lista no sale vacía: antes,
 * la pantalla de rutinas de la bienvenida decía «necesitan conexión» y dejaba
 * un hueco justo en el paso que tiene que enganchar a quien acaba de instalar.
 *
 * Cuando SÍ hay red mandan las filas de la nube, incluidas las oficiales
 * sembradas allí: sus contadores son de verdad y los de dentro de la app son
 * ceros de relleno. `mezclar()` se queda con la de la nube cuando está.
 *
 * En 'amigos' no se mezcla nada: una rutina de la app no es de nadie a quien
 * sigas, y colarla ahí sería mentir sobre de quién es.
 */
export async function rutinasPopulares({ orden = 'populares', nivel = null, texto = null, cuantos = 20 } = {}) {
  const r = await nube.rpc('rutinas_populares', {
    p_orden: orden, p_nivel: nivel, p_texto: texto, p_cuantos: cuantos,
  }, { conSesion: !!nube.usuario() });

  const deLaNube = r.ok ? (r.datos || []) : [];
  if (orden === 'amigos') return r.ok ? { ok: true, rutinas: deLaNube } : r;

  let lista = CM.mezclar(deLaNube);
  // Los mismos filtros que aplica la nube, para que una oficial no se cuele en
  // una búsqueda que no le toca.
  if (nivel && nivel !== 'cualquiera') {
    lista = lista.filter((x) => !x.oficial || x.nivel === nivel);
  }
  const busca = String(texto || '').trim().toLowerCase();
  if (busca.length >= 2) {
    lista = lista.filter((x) => !x.oficial || x.nombre.toLowerCase().includes(busca));
  }
  return { ok: true, rutinas: lista.slice(0, cuantos), sinRed: !r.ok };
}

export async function publicarRutina({ nombre, descripcion = '', nivel = 'cualquiera', dias = 3, datos }) {
  const r = await nube.rpc('publicar_rutina', {
    p_nombre: nombre, p_descripcion: descripcion, p_nivel: nivel, p_dias: dias, p_datos: datos,
  });
  return r.ok ? { ok: true, rutina: Array.isArray(r.datos) ? r.datos[0] : r.datos } : r;
}

export async function borrarRutinaPublicada(id) {
  return nube.rest(`/rest/v1/rutinas_pub?id=eq.${id}`, { metodo: 'DELETE', conSesion: true });
}

/** Da o quita el like. Devuelve si ha quedado dado. */
export async function marcarRutina(id) {
  const r = await nube.rpc('marcar_rutina', { p_rutina: id });
  return r.ok ? { ok: true, marcada: r.datos === true } : r;
}

export async function comentar(id, texto) {
  const t = String(texto || '').trim();
  if (!t) return { ok: false, motivo: 'escribe algo primero' };
  if (t.length > 500) return { ok: false, motivo: 'como mucho 500 caracteres' };
  return nube.rpc('comentar_rutina', { p_rutina: id, p_texto: t });
}

export async function comentariosDe(id, cuantos = 50) {
  const r = await nube.rpc('comentarios_de', { p_rutina: id, p_cuantos: cuantos }, { conSesion: !!nube.usuario() });
  return r.ok ? { ok: true, comentarios: r.datos || [] } : r;
}

export async function borrarComentario(id) {
  return nube.rest(`/rest/v1/rutina_comentarios?id=eq.${id}`, { metodo: 'DELETE', conSesion: true });
}

/**
 * Llevarse una rutina: devuelve el paquete Y cuenta la copia, de una vez.
 *
 * Antes eran dos llamadas —pedir `datos` por PostgREST y luego `copiada_rutina`
 * por su cuenta—, así que el contador se podía subir sin copiar nada. Ahora una
 * copia es, por construcción, alguien que se ha llevado la rutina; y se cuenta
 * UNA por cuenta, no una por clic (ver `copiar_rutina` en el esquema 3).
 *
 * Si es una de las ocho oficiales y no hay red, el paquete ya viaja dentro de
 * la app: se puede importar igual y la copia no se cuenta, que es lo honrado
 * —no la ha visto la nube—. Quedarse sin poder llevarte una rutina que ya
 * tienes en el móvil por no haber cobertura sería absurdo.
 */
export async function copiarRutina(id) {
  const r = await nube.rpc('copiar_rutina', { p_rutina: id }, { conSesion: !!nube.usuario() });
  if (r.ok && r.datos) return { ok: true, paquete: r.datos, contada: !!nube.usuario() };

  const oficial = CM.comoDeLaNube().find((x) => x.id === id);
  if (oficial) return { ok: true, paquete: oficial.datos, contada: false, sinRed: true };
  return r.ok ? { ok: false, motivo: 'esa rutina ya no existe' } : r;
}

/* --------------------------------------------------------------------------
 * GESTIONAR LO TUYO  (1-sep-2026)
 *
 * Carlos: *«faltaría una interfaz para eliminar seguidores, eliminar rutinas
 * publicadas o simplemente gestionar tus rutinas, renombrar algunas etc...»*.
 * ------------------------------------------------------------------------ */

/** Las mías, TAMBIÉN las escondidas: si no, una escondida no se recuperaría. */
export async function misRutinas(cuantos = 50) {
  const r = await nube.rpc('mis_rutinas', { p_cuantos: cuantos });
  return r.ok ? { ok: true, rutinas: r.datos || [] } : r;
}

/**
 * Cambiar nombre, descripción, nivel, días o si se ve.
 *
 * El CONTENIDO de la rutina no se toca desde aquí, y es a propósito: si la
 * cambias de arriba abajo, la gente que le dio a me gusta le dio a otra cosa.
 * Para eso se publica una nueva.
 */
export async function editarRutinaPublicada(id, cambios = {}) {
  const r = await nube.rpc('editar_rutina', {
    p_rutina: id,
    p_nombre: cambios.nombre ?? null,
    p_descripcion: cambios.descripcion ?? null,
    p_nivel: cambios.nivel ?? null,
    p_dias: cambios.dias ?? null,
    p_visible: cambios.visible ?? null,
  });
  return r.ok ? { ok: true, rutina: Array.isArray(r.datos) ? r.datos[0] : r.datos } : r;
}

/** Quién me sigue, con su id, que es lo que hace falta para poder quitarlo. */
export async function misSeguidores(cuantos = 100) {
  const r = await nube.rpc('mis_seguidores', { p_cuantos: cuantos });
  return r.ok ? { ok: true, seguidores: r.datos || [] } : r;
}

/** Quitarse a alguien de encima. Devuelve si de verdad había algo que quitar. */
export async function quitarSeguidor(idSeguidor) {
  const r = await nube.rpc('quitar_seguidor', { p_seguidor: idSeguidor });
  return r.ok ? { ok: true, quitado: r.datos === true } : r;
}

export async function misRutinasPublicadas() {
  const u = nube.usuario();
  if (!u) return { ok: true, rutinas: [] };
  const r = await nube.rest(
    `/rest/v1/rutinas_pub?autor=eq.${u.id}&select=*&order=creado.desc`, { conSesion: true });
  return r.ok ? { ok: true, rutinas: r.datos || [] } : r;
}

/* --------------------------------------------------------------------------
 * Medallas exclusivas
 *
 * Las de siempre se calculan de tus series cada vez, y por eso no se guardan.
 * Estas no se pueden calcular así porque dependen de algo que ya pasó y que
 * solo sabe la nube: cuánta gente había cuando entraste, o si tuviste el récord
 * de un gimnasio. Quien las concede es la base, nunca el móvil: una medalla que
 * dice «fuiste de los cien primeros» tiene que decirla quien lleva la cuenta.
 * ------------------------------------------------------------------------ */

export async function repasarExclusivas() {
  if (!nube.usuario()) return { ok: true, exclusivas: [] };
  const r = await nube.rpc('repasar_exclusivas', {});
  return r.ok ? { ok: true, exclusivas: Array.isArray(r.datos) ? r.datos : [] } : r;
}
