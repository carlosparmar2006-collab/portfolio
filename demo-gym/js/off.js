/* ==========================================================================
 * off.js — Open Food Facts DESDE EL MÓVIL, sin pasar por el PC.
 *
 * POR QUÉ EXISTE
 * --------------
 * Carlos: «estudia la posibilidad de hacer que la app no dependa de si está
 * conectado el servidor o jarvis, lo digo sobre todo por el apartado de
 * nutrición falla mucho».
 *
 * Tenía razón y la solución resultó ser sencilla: **Open Food Facts permite
 * CORS**. Medido el 31-jul-2026 desde la app: 200 OK en 236 ms llamando directo.
 * O sea que el rodeo por el PC nunca fue necesario para buscar comida; se hizo
 * así heredado de la foto, que sí lo necesita (la clave de Gemini no puede ir
 * dentro del APK, la saca cualquiera con `unzip`).
 *
 * Qué necesita el PC de verdad, después de esto:
 *   · la FOTO del plato        → sí (clave de Gemini)
 *   · buscar comida            → NO
 *   · código de barras         → NO
 *   · sincronizar con JARVIS   → sí, obviamente
 *
 * EL SERVIDOR SIGUE SIENDO ÚTIL y por eso no se quita: tiene caché en disco de
 * 30 días y reintentos para el 503 de Open Food Facts. Así que se intenta
 * primero el camino directo (rápido, sin depender de nada) y si falla se cae al
 * PC, que puede tener la respuesta guardada de otra vez.
 *
 * PARIDAD: este fichero es el GEMELO de `_producto()` y `_puntuar()` de
 * `pc/gym_comida.py`. Si cambia una regla, cambia en los dos, o el mismo
 * producto se ordenaría distinto según quién lo buscara. Lo fija
 * `pc/test_paridad_off.mjs`, que ejecuta los dos lados sobre el MISMO JSON.
 * ========================================================================== */

const CGI = 'https://es.openfoodfacts.org/cgi/search.pl';
const BARRAS = 'https://world.openfoodfacts.org/api/v2/product';

export const CAMPOS = 'product_name,brands,code,nutriments,serving_size,'
  + 'serving_quantity,quantity,image_front_small_url,image_small_url,countries_tags';

// Palabras que en una ración significan «esto se CUENTA, no se pesa».
const PIEZAS = ['scoop', 'cacito', 'cazo', 'unidad', 'unidades', 'pieza', 'piezas',
  'rebanada', 'rebanadas', 'galleta', 'galletas', 'barrita', 'sobre',
  'loncha', 'lonchas', 'capsula', 'comprimido', 'cucharada',
  'botifarr', 'croqueta', 'magdalena', 'yogur', 'vaso', 'lata', 'bote',
  'portion', 'serving', 'scoops', 'dosette'];

const NOMBRE_PIEZA = {
  unidades: 'unidad', piezas: 'pieza', rebanadas: 'rebanada', galletas: 'galleta',
  lonchas: 'loncha', scoops: 'scoop', cazo: 'cacito', portion: 'dosis',
  serving: 'dosis', dosette: 'cacito', botifarr: 'butifarra', capsula: 'cápsula',
};

export function sinTildes(t) {
  // ̀-ͯ = los acentos sueltos que deja NFD. Escritos con escape y no
  // literales: pegados a pelo son invisibles y cualquier editor se los come.
  return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function texto(v) {
  if (v === null || v === undefined) return '';
  return Array.isArray(v) ? String(v[0] ?? '') : String(v);
}

function num(n, dec = 1) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  const f = 10 ** dec;
  return Math.round(v * f + 1e-9) / f;
}

/** La ración del fabricante: cuántos gramos, si se cuenta, y cómo se llama. */
export function racionDe(p) {
  const t = texto(p.serving_size).trim();
  let gramos = Number(p.serving_quantity);
  if (!Number.isFinite(gramos) || !gramos) {
    const m = t.match(/([\d]+[.,]?[\d]*)\s*(?:g|gr|ml)\b/i);
    gramos = m ? parseFloat(m[1].replace(',', '.')) : NaN;
  }
  if (!Number.isFinite(gramos) || !(gramos >= 0.5 && gramos <= 1500)) return null;
  const plano = sinTildes(t);
  const pieza = PIEZAS.find((x) => plano.includes(x)) || null;
  return {
    texto: t.slice(0, 60),
    gramos: num(gramos, 1),
    esPieza: pieza !== null,
    // Sin nombre en la etiqueta se llama «dosis»: es la ración recomendada del
    // fabricante, así que contarla vale. Lo que no se hace nunca es llamarlo
    // scoop por nuestra cuenta.
    nombre: pieza ? (NOMBRE_PIEZA[pieza] || pieza) : 'dosis',
  };
}

/**
 * De un producto de Open Food Facts a nuestra ficha. null si no sirve.
 * Gemelo EXACTO de `_producto()` en Python.
 */
export function productoDe(p) {
  const n = p.nutriments || {};
  let kcal = n['energy-kcal_100g'];
  kcal = (kcal === null || kcal === undefined) ? null : Number(kcal);
  if (kcal !== null && !Number.isFinite(kcal)) kcal = null;
  // Por encima de 900 kcal/100 g no existe alimento: la grasa pura son 900. Las
  // etiquetas las teclean voluntarios y hay erratas enormes (unos «Bastonets» a
  // 1963). Colar eso en la cuenta de Carlos sería peor que no encontrar nada.
  if (kcal !== null && !(kcal > 0 && kcal <= 900)) return null;

  const sinTabla = kcal === null;
  const nombre = texto(p.product_name).trim();
  const marca = texto(p.brands).split(',')[0].trim();
  if (!nombre) return null;

  const v = (clave) => num(n[clave] || 0, 1);
  return {
    nombre: nombre.slice(0, 70),
    marca: marca.slice(0, 40),
    // La marca va DENTRO del nombre completo a propósito: «Naranjas (Bonpreu)» y
    // «Naranjas (Mercadona)» tienen que poder convivir sin pisarse.
    etiqueta: marca ? `${nombre.slice(0, 70)} (${marca.slice(0, 40)})` : nombre.slice(0, 70),
    sinTabla,
    kcal: kcal === null ? null : num(kcal, 1),
    prot: sinTabla ? null : v('proteins_100g'),
    carb: sinTabla ? null : v('carbohydrates_100g'),
    gras: sinTabla ? null : v('fat_100g'),
    fibra: sinTabla ? null : v('fiber_100g'),
    barras: p.code || '',
    foto: texto(p.image_front_small_url) || texto(p.image_small_url),
    racion: racionDe(p),
    cantidad: texto(p.quantity).slice(0, 30),
    espana: (p.countries_tags || []).includes('en:spain'),
    origen: 'openfoodfacts',
  };
}

/**
 * Cómo de bien responde este producto a lo escrito. Gemelo de `_puntuar()`.
 * Hace falta porque el orden de Open Food Facts es malo: «leche hacendado»
 * devolvía kéfir, muesli y queso crema — todos de Hacendado, ninguno leche.
 */
export function puntuar(f, palabras) {
  const nombre = sinTildes(f.nombre);
  const marca = sinTildes(f.marca);
  let punto = 0;
  palabras.forEach((p, i) => {
    const peso = i === 0 ? 3.0 : 1.5;      // la primera palabra es el alimento
    if (nombre.startsWith(p)) punto += peso * 2;
    else if (nombre.includes(p)) punto += peso;
    else if (marca.includes(p)) punto += peso * 0.8;
  });
  if (f.espana) punto += 2.0;              // Carlos compra aquí
  if (f.foto) punto += 0.5;
  if (f.racion) punto += 0.5;
  if (f.sinTabla) punto -= 1.5;            // sale, pero detrás
  else if (f.prot || f.carb || f.gras) punto += 1.0;
  return punto;
}

/** Ordena y recorta, igual que el servidor. */
export function ordenar(productos, consulta, limite = 15) {
  const palabras = sinTildes(consulta).split(/\s+/).filter((p) => p.length > 1);
  return productos
    .map((p) => productoDe(p))
    .filter(Boolean)
    .map((f) => ({ f, punto: puntuar(f, palabras) }))
    .sort((a, b) => b.punto - a.punto)
    .slice(0, limite)
    .map((x) => x.f);
}

/**
 * Busca en Open Food Facts DIRECTAMENTE desde el móvil.
 *
 * Devuelve {ok, productos} o {saturado} / {sinRed}. Distinguirlos importa:
 * decirle a Carlos que un producto no existe cuando el servicio está caído sería
 * mentirle.
 */
export async function buscar(consulta, { limite = 15, senal = null } = {}) {
  const q = (consulta || '').trim();
  if (q.length < 2) return { ok: true, productos: [] };
  const url = `${CGI}?search_terms=${encodeURIComponent(q)}&search_simple=1`
            + `&action=process&json=1&page_size=40&fields=${CAMPOS}`;
  // Su 503 es transitorio: llega en ~100 ms (te está echando, no es que tarde) y
  // al segundo o tercer intento entra. Medido en el PC: a 6 s entre peticiones
  // fallaba la mitad; reintentando pasan todas.
  for (let intento = 0; intento < 3; intento++) {
    try {
      const r = await fetch(url, { signal: senal });
      if (r.status === 503 || r.status === 429) {
        await new Promise((s) => setTimeout(s, 350 * (intento + 1)));
        continue;
      }
      if (!r.ok) return { ok: false, saturado: false, productos: [] };
      const d = await r.json();
      return { ok: true, productos: ordenar(d.products || [], q, limite) };
    } catch (e) {
      if (e && e.name === 'AbortError') return { ok: false, cancelado: true, productos: [] };
      // Sin red: que lo diga quien llama, aquí no se adivina.
      if (intento === 2) return { ok: false, sinRed: true, productos: [] };
      await new Promise((s) => setTimeout(s, 300));
    }
  }
  return { ok: false, saturado: true, productos: [] };
}

/** Un producto por su código de barras, también directo. */
export async function porBarras(codigo) {
  const c = String(codigo || '').replace(/\D/g, '');
  if (c.length < 6) return { ok: false, productos: [] };
  try {
    const r = await fetch(`${BARRAS}/${c}.json?fields=${CAMPOS}`);
    if (r.status === 404) return { ok: false, noExiste: true };
    if (!r.ok) return { ok: false, saturado: r.status === 503 };
    const d = await r.json();
    if (!d || d.status === 0 || !d.product) return { ok: false, noExiste: true };
    const f = productoDe(d.product);
    return f ? { ok: true, producto: f } : { ok: false, noExiste: true };
  } catch {
    return { ok: false, sinRed: true };
  }
}
