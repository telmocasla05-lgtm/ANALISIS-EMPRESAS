// Colores de los gráficos. Paleta categórica de 8 posiciones en orden fijo
// (el orden es el mecanismo de seguridad para daltonismo: no se cicla ni se
// generan tonos nuevos). El color sigue a la categoría, no a su posición en
// el gráfico: se asigna por orden alfabético del listado completo de
// categorías de la empresa, así no cambia al filtrar.

export const SERIES_COLORS = [
  '#2a78d6', // azul
  '#1baf7a', // aguamarina
  '#eda100', // amarillo
  '#008300', // verde
  '#4a3aa7', // violeta
  '#e34948', // rojo
  '#e87ba4', // magenta
  '#eb6834', // naranja
] as const;

// Etiquetas especiales del resumen (no son categorías de trabajo): grises.
export const SIN_CATEGORIZAR_LABEL = 'Sin categorizar / revisar';
export const IDLE_LABEL = 'Inactivo / pausa';
export const SIN_CATEGORIZAR_COLOR = '#898781';
export const IDLE_COLOR = '#c3c2b7';
/** Categorías a partir de la novena: se agrupan bajo un mismo gris oscuro. */
export const OTRAS_COLOR = '#5c5b57';

/** Mapa nombre de categoría → color, estable para toda la empresa. */
export function buildCategoryColors(categoryNames: string[]): Map<string, string> {
  const sorted = [...new Set(categoryNames)].sort((a, b) => a.localeCompare(b, 'es'));
  const map = new Map<string, string>();
  sorted.forEach((name, index) => {
    map.set(name, index < SERIES_COLORS.length ? SERIES_COLORS[index]! : OTRAS_COLOR);
  });
  map.set(SIN_CATEGORIZAR_LABEL, SIN_CATEGORIZAR_COLOR);
  map.set(IDLE_LABEL, IDLE_COLOR);
  return map;
}
