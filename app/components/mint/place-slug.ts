// Précision de la grille : 4 décimales ≈ 11 m. L'unicité par cellule sera
// garantie on-chain par le programme Anchor en Phase 2 — ici c'est informatif.
export function placeSlug(latitude: number, longitude: number) {
  return `${latitude.toFixed(4)},${longitude.toFixed(4)}`
}
