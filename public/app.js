// Código que se ejecuta en el navegador del usuario.
// Mide con performance.now() cuánto tarda cada forma de resolver la misma búsqueda.

const $ = (selector) => document.querySelector(selector);
const tiempos = {}; // último tiempo de cada caso, para dibujar las barras

async function pedir(ruta) {
  const respuesta = await fetch(ruta, { cache: "no-store" });
  if (!respuesta.ok) throw new Error(`Error ${respuesta.status} en ${ruta}`);
  return respuesta.json();
}

function parametros() {
  return {
    categoria: $("#categoria").value,
    precioMax: Number($("#precioMax").value),
    valoracionMin: Number($("#valoracionMin").value),
  };
}

function query(p) {
  return new URLSearchParams({
    categoria: p.categoria,
    precioMax: p.precioMax,
    valoracionMin: p.valoracionMin,
  }).toString();
}

// ---------- CASO 1: cliente-servidor, muchas peticiones al servidor lejano ----------
async function casoClienteServidor(p, alAvanzar) {
  const t0 = performance.now();
  let rtts = 0;
  let msCentral = 0;

  // Petición 1: lista resumida (solo id y precio)
  const lista = await pedir(`/api/central/listar?${query(p)}`);
  rtts++;
  msCentral += lista.msEdgeACentral;

  // El cliente se queda con los baratos y pide sus detalles UNO A UNO
  const baratos = lista.datos.filter((producto) => producto.precio <= p.precioMax);
  const resultado = [];
  for (const producto of baratos) {
    alAvanzar(`Petición ${rtts + 1} de ${baratos.length + 1}…`);
    const detalle = await pedir(`/api/central/producto/${producto.id}`);
    rtts++;
    msCentral += detalle.msEdgeACentral;
    if (detalle.datos.valoracion >= p.valoracionMin) resultado.push(detalle.datos);
  }
  return { ms: performance.now() - t0, rtts, msCentral, resultado };
}

// ---------- CASO 2: Remote Evaluation, una sola petición al servidor lejano ----------
async function casoRemoteEvaluation(p) {
  const t0 = performance.now();
  const r = await pedir(`/api/central/filtrar?${query(p)}`);
  return { ms: performance.now() - t0, rtts: 1, msCentral: r.msEdgeACentral, resultado: r.datos };
}

// ---------- CASO 3: Code-on-Demand, el filtro se ejecuta en el edge ----------
async function casoEdge(p) {
  const t0 = performance.now();
  const r = await pedir(`/api/edge/filtrar?${query(p)}`);
  return { ms: performance.now() - t0, rtts: 1, msCentral: 0, resultado: r.datos };
}

const CASOS = {
  caso1: { ejecutar: casoClienteServidor },
  caso2: { ejecutar: casoRemoteEvaluation },
  caso3: { ejecutar: casoEdge },
};

function redondear(ms) {
  return Math.round(ms).toLocaleString("es-ES");
}

function dibujarBarras() {
  const maximo = Math.max(...Object.values(tiempos), 1);
  for (const [id, ms] of Object.entries(tiempos)) {
    $(`#${id} .barra div`).style.width = `${Math.max(2, (ms / maximo) * 100)}%`;
  }
}

function mostrarResultados(resultado) {
  $("#numResultados").textContent = `(${resultado.length})`;
  $("#tablaResultados").innerHTML = resultado
    .map(
      (p) =>
        `<tr><td>${p.id}</td><td>${p.nombre}</td><td>${p.precio.toFixed(2)} €</td><td>${p.valoracion}</td></tr>`
    )
    .join("") || `<tr><td colspan="4">Ningún producto cumple el filtro.</td></tr>`;
}

async function ejecutarCaso(id) {
  const tarjeta = $(`#${id}`);
  const boton = tarjeta.querySelector("button");
  const detalles = tarjeta.querySelector(".detalles");
  boton.disabled = true;
  detalles.textContent = "Ejecutando…";
  try {
    const r = await CASOS[id].ejecutar(parametros(), (texto) => (detalles.textContent = texto));
    tiempos[id] = r.ms;
    tarjeta.querySelector(".tiempo").textContent = `${redondear(r.ms)} ms`;
    detalles.textContent =
      `${r.rtts} RTT · ${r.resultado.length} productos encontrados` +
      (r.msCentral ? ` · ${redondear(r.msCentral)} ms hablando con el central` : " · sin salir del edge");
    dibujarBarras();
    mostrarResultados(r.resultado);
  } catch (error) {
    detalles.textContent = `Error: ${error.message}`;
  } finally {
    boton.disabled = false;
  }
}

// Al cargar: averiguamos dónde está el edge y el central (y "calentamos" la conexión)
async function cargarInfo() {
  try {
    const info = await pedir("/api/info");
    const { colo, ciudad, pais } = info.edge;
    $("#edge").textContent = [colo, ciudad, pais].filter(Boolean).join(" · ");
    $("#central").textContent = `${info.central.colo} (pista: ${info.central.pista})`;
    // Segunda llamada ya con la conexión abierta, para medir el RTT edge ↔ central
    const otra = await pedir("/api/central/filtrar?categoria=Audio&precioMax=1&valoracionMin=5");
    $("#rttCentral").textContent = `≈ ${otra.msEdgeACentral} ms`;
  } catch (error) {
    $("#edge").textContent = "Error al conectar";
  }
}

for (const id of Object.keys(CASOS)) {
  $(`#${id} button`).addEventListener("click", () => ejecutarCaso(id));
}

$("#todos").addEventListener("click", async () => {
  $("#todos").disabled = true;
  for (const id of Object.keys(CASOS)) await ejecutarCaso(id);
  $("#todos").disabled = false;
});

cargarInfo();
