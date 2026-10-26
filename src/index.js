import { DurableObject } from "cloudflare:workers";
import { CATALOGO, buscarPorCategoria, filtrar } from "./catalogo.js";

// Región donde queremos que viva el "servidor central".
// "wnam" = oeste de Norteamérica (lejos de España, para que se note el RTT).
// Otras opciones: "enam" (este de EE. UU.), "apac" (Asia-Pacífico)...
const UBICACION_CENTRAL = "wnam";

/**
 * SERVIDOR CENTRAL
 * Es un Durable Object: una pequeña instancia con estado que Cloudflare
 * ejecuta en UN solo centro de datos. Le pedimos que esté en Norteamérica,
 * así simulamos el backend tradicional que está lejos del usuario.
 */
export class ServidorCentral extends DurableObject {
  // Caso 1, paso 1: lista resumida (solo id y precio) de una categoría
  listar(categoria) {
    return buscarPorCategoria(categoria).map(({ id, precio }) => ({ id, precio }));
  }

  // Caso 1, paso 2: detalles de UN producto (una petición por producto)
  detalle(id) {
    return CATALOGO.find((p) => p.id === id) ?? null;
  }

  // Caso 2 (Remote Evaluation): el filtro se ejecuta aquí, junto a los datos
  filtrar(categoria, precioMax, valoracionMin) {
    return filtrar(categoria, precioMax, valoracionMin);
  }

  // Intenta averiguar en qué centro de datos se está ejecutando este objeto
  async ubicacion() {
    if (this.colo) return this.colo;
    try {
      const r = await fetch("https://www.cloudflare.com/cdn-cgi/trace");
      const texto = await r.text();
      this.colo = texto.match(/colo=(\w+)/)?.[1] ?? "desconocido";
    } catch {
      this.colo = "desconocido";
    }
    return this.colo;
  }
}

// Devuelve el "stub" (cliente) para hablar con el servidor central
function servidorCentral(env) {
  const id = env.CENTRAL.idFromName("servidor-central");
  return env.CENTRAL.get(id, { locationHint: UBICACION_CENTRAL });
}

// Info del centro de datos edge que está atendiendo la petición
function infoEdge(request) {
  const cf = request.cf ?? {};
  return { colo: cf.colo ?? "local", ciudad: cf.city ?? null, pais: cf.country ?? null };
}

function responder(request, datos) {
  return Response.json(
    { ...datos, edge: infoEdge(request) },
    { headers: { "Cache-Control": "no-store" } }
  );
}

// Mide cuánto tarda el edge en hablar con el servidor central
async function medir(promesa) {
  const t0 = Date.now();
  const resultado = await promesa;
  return { resultado, msEdgeACentral: Date.now() - t0 };
}

/**
 * WORKER (se ejecuta en el centro de datos de Cloudflare más cercano al usuario)
 * Sirve la página web (carpeta public/) y estas rutas de la API:
 *   /api/info                    -> dónde está el edge y dónde está el central
 *   /api/central/listar          -> caso 1: lista resumida desde el central
 *   /api/central/producto/:id    -> caso 1: detalle de un producto desde el central
 *   /api/central/filtrar         -> caso 2: Remote Evaluation en el central
 *   /api/edge/filtrar            -> caso 3: filtro ejecutado en el propio edge
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const p = url.searchParams;
    const categoria = p.get("categoria") ?? "Periféricos";
    const precioMax = Number(p.get("precioMax") ?? 50);
    const valoracionMin = Number(p.get("valoracionMin") ?? 4.5);

    if (url.pathname === "/api/info") {
      const { resultado, msEdgeACentral } = await medir(servidorCentral(env).ubicacion());
      return responder(request, { central: { colo: resultado, pista: UBICACION_CENTRAL }, msEdgeACentral });
    }

    if (url.pathname === "/api/central/listar") {
      const { resultado, msEdgeACentral } = await medir(servidorCentral(env).listar(categoria));
      return responder(request, { datos: resultado, msEdgeACentral });
    }

    if (url.pathname.startsWith("/api/central/producto/")) {
      const id = Number(url.pathname.split("/").pop());
      const { resultado, msEdgeACentral } = await medir(servidorCentral(env).detalle(id));
      return responder(request, { datos: resultado, msEdgeACentral });
    }

    if (url.pathname === "/api/central/filtrar") {
      const { resultado, msEdgeACentral } = await medir(
        servidorCentral(env).filtrar(categoria, precioMax, valoracionMin)
      );
      return responder(request, { datos: resultado, msEdgeACentral });
    }

    if (url.pathname === "/api/edge/filtrar") {
      // Code-on-Demand: este código se ha distribuido a todos los centros de datos
      // de Cloudflare y se ejecuta aquí mismo, con la copia del catálogo del edge.
      return responder(request, { datos: filtrar(categoria, precioMax, valoracionMin), msEdgeACentral: 0 });
    }

    return new Response("No encontrado", { status: 404 });
  },
};
