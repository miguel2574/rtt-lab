// Catálogo de prueba de la "tienda".
// Se genera con una semilla fija, así que siempre salen los mismos productos
// tanto en el servidor central como en la copia del edge.

export const CATEGORIAS = ["Periféricos", "Componentes", "Redes", "Almacenamiento", "Audio"];

const NOMBRES = {
  "Periféricos": ["Ratón", "Teclado", "Alfombrilla", "Webcam", "Mando"],
  "Componentes": ["Ventilador", "Pasta térmica", "Fuente", "Disipador", "Placa"],
  "Redes": ["Cable Ethernet", "Router", "Switch", "Adaptador Wi-Fi", "Repetidor"],
  "Almacenamiento": ["Pendrive", "SSD", "Disco duro", "Tarjeta SD", "Caja externa"],
  "Audio": ["Auriculares", "Altavoz", "Micrófono", "Cascos", "Tarjeta de sonido"],
};

const ADJETIVOS = ["Pro", "Lite", "Max", "Mini", "Plus", "Gamer", "Eco", "Ultra"];

// Generador de números pseudoaleatorios con semilla (mulberry32)
function generador(semilla) {
  return () => {
    semilla |= 0;
    semilla = (semilla + 0x6d2b79f5) | 0;
    let t = Math.imul(semilla ^ (semilla >>> 15), 1 | semilla);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generarCatalogo() {
  const azar = generador(2026);
  const productos = [];
  for (let id = 1; id <= 1000; id++) {
    const categoria = CATEGORIAS[(id - 1) % CATEGORIAS.length];
    const nombres = NOMBRES[categoria];
    const nombre = `${nombres[Math.floor(azar() * nombres.length)]} ${
      ADJETIVOS[Math.floor(azar() * ADJETIVOS.length)]
    } ${100 + Math.floor(azar() * 900)}`;

    // Un 10 % de los productos son "baratos" (menos de 50 €)
    const barato = azar() < 0.1;
    const precio = barato ? 5 + azar() * 44 : 50 + azar() * 250;

    productos.push({
      id,
      nombre,
      categoria,
      precio: Math.round(precio * 100) / 100,
      valoracion: Math.round((3.8 + azar() * 1.2) * 10) / 10,
      stock: Math.floor(azar() * 100),
    });
  }
  return productos;
}

export const CATALOGO = generarCatalogo();

export function buscarPorCategoria(categoria) {
  return CATALOGO.filter((p) => p.categoria === categoria);
}

// El "filtro" que se mueve de un sitio a otro según el caso
export function filtrar(categoria, precioMax, valoracionMin) {
  return buscarPorCategoria(categoria).filter(
    (p) => p.precio <= precioMax && p.valoracion >= valoracionMin
  );
}
