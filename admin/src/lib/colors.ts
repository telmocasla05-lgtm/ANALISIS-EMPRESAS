// Colores de los gráficos del dashboard. Paleta categórica validada (CVD ΔE
// adyacente ≥ 12 y banda de luminosidad) con el validador del método de dataviz;
// el orden de los tonos es parte de la garantía: no reordenar ni generar tonos.
// Los colores se asignan por categoría de la EMPRESA (lista completa, orden
// alfabético estable), no por los datos del rango: cambiar el filtro de fechas
// nunca repinta una categoría.

export const CATEGORICAL_SLOTS = [
  '#2a78d6', // azul
  '#1baf7a', // verde agua
  '#eda100', // amarillo
  '#008300', // verde
  '#4a3aa7', // violeta
  '#e34948', // rojo
  '#e87ba4', // magenta
  '#eb6834', // naranja
] as const;

// Estados especiales, fuera de la paleta de identidad: grises.
export const UNCATEGORIZED_LABEL = 'Sin categorizar / revisar';
export const IDLE_LABEL = 'Inactivo / pausa';
export const UNCATEGORIZED_COLOR = '#898781';
export const IDLE_COLOR = '#c3c2b7';

/** Mapa nombre de categoría → color, estable para la empresa. */
export function buildCategoryColors(categoryNames: string[]): Map<string, string> {
  const sorted = [...new Set(categoryNames)].sort((a, b) => a.localeCompare(b, 'es'));
  const map = new Map<string, string>();
  sorted.forEach((name, i) => {
    // Más allá de 8 categorías no se generan tonos nuevos: gris de "sin categorizar".
    map.set(name, CATEGORICAL_SLOTS[i] ?? UNCATEGORIZED_COLOR);
  });
  map.set(UNCATEGORIZED_LABEL, UNCATEGORIZED_COLOR);
  map.set(IDLE_LABEL, IDLE_COLOR);
  return map;
}

export function colorFor(colors: Map<string, string>, categoryName: string): string {
  return colors.get(categoryName) ?? UNCATEGORIZED_COLOR;
}
