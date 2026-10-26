# RTT Lab

**Demo en vivo:** https://rtt.smartmichi.work

Demo de **movilidad de código** desplegada en **Cloudflare Workers**. La misma búsqueda en una tienda online se resuelve de tres formas distintas y se mide en tiempo real desde el navegador, para ver cómo mover el código reduce la latencia.

Proyecto hecho para el Trabajo Teórico 5 (*Movilidad de código y seguridad*) de Sistemas Distribuidos, ESII Albacete (UCLM).

## Qué demuestra

La tarea es siempre la misma: buscar en una categoría los productos que cuesten como mucho 50 € y tengan una valoración de 4,5 o más.

| Caso | Paradigma | Qué pasa | Nº de RTT largos |
| --- | --- | --- | --- |
| 1 | Cliente-servidor | El navegador pide la lista al servidor central y luego los detalles de cada producto barato, uno por uno | ~20 |
| 2 | Remote Evaluation | El navegador envía el filtro al servidor central, que lo ejecuta junto a los datos | 1 |
| 3 | Code-on-Demand (edge) | El filtro se ejecuta en el centro de datos de Cloudflare más cercano al usuario | 0 |

La idea se resume en una fórmula:

```
Tiempo de respuesta ≈ nº de RTT × duración de cada RTT
```

Remote Evaluation reduce el número de viajes. El edge reduce la duración de cada viaje.

## Cómo funciona

```
Navegador ──► Worker (edge más cercano, p. ej. MAD) ──► Durable Object "servidor central" (Norteamérica)
                 │
                 └─ caso 3: responde aquí mismo, sin ir al central
```

- **Worker** (`src/index.js`): se ejecuta en todos los centros de datos de Cloudflare. Sirve la web y la API. En el caso 3 ejecuta el filtro él mismo con su copia del catálogo.
- **Servidor central** (`ServidorCentral`): un Durable Object creado con `locationHint: "wnam"` para que viva en el oeste de Norteamérica. Simula el backend tradicional lejos del usuario. La pista de ubicación es orientativa: Cloudflare lo coloca en un centro de datos de esa zona.
- **Catálogo** (`src/catalogo.js`): 1.000 productos generados con una semilla fija, así que el central y el edge tienen exactamente los mismos datos.
- **Web** (`public/`): mide cada caso con `performance.now()` y muestra el tiempo, el número de RTT y desde qué centro de datos te responden.

## Seguridad y aislamiento

El código del Worker no se ejecuta en una máquina virtual ni en un contenedor, sino en un **V8 isolate**: un entorno aislado dentro del motor JavaScript de Chrome, con su propia memoria, sin acceso al sistema de ficheros y con límites de CPU por petición. Por eso Cloudflare puede ejecutar código de miles de clientes en la misma máquina y arrancarlo casi al instante.

## Ejecutarlo

Requisitos: [Node.js](https://nodejs.org) (versión LTS) y una cuenta gratuita de Cloudflare.

```bash
npm install          # instala wrangler
npm run dev          # prueba en local: http://localhost:8787
npx wrangler login   # inicia sesión en Cloudflare (solo la primera vez)
npm run deploy       # lo publica en https://rtt-lab.<tu-subdominio>.workers.dev
```

En local, los datos de ubicación (`colo`, ciudad) son simulados y el central aparece como "desconocido". Los valores reales solo se ven una vez desplegado.

## Estructura

```
rtt-lab/
├── src/
│   ├── index.js       # Worker + Durable Object
│   └── catalogo.js    # catálogo de productos y función de filtrado
├── public/
│   ├── index.html     # página web
│   └── app.js         # código del navegador que mide los tiempos
├── wrangler.jsonc     # configuración de Cloudflare
└── package.json
```
