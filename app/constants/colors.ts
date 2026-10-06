/**
 * Palette « Coucher de soleil chaud » — référence figée :
 * docs/design/placekeepr-sunset.html (tokens du bandeau HANDOFF).
 * UI mono-thème claire (crème/sable), carte toujours sombre.
 */

export const Palette = {
  // UI sunset
  cream: '#fff2e0', // fonds
  sand: '#ffe1bf', // surfaces (cartes)
  plum: '#3a1f2e', // texte + bordures
  ink: '#4a1f33', // ombres dures
  coral: '#e6541f', // action primaire
  raspberry: '#d11a55', // danger
  amber: '#b8730a', // or — réputation, rareté
  teal: '#1f8f80', // accent — likes, visites, autres gardiens
  orange: '#d9701a', // frais / coûts
  pink: '#e85d92',
  terracotta: '#9c5a4a', // secondaire / texte atténué

  // Carte : toujours sombre, quel que soit le thème système
  mapBg: '#08080f',
  mapWater: '#16233f',
  mapRoad: '#372f53',
  mapHwy: '#a8600f',
  mapStroke: '#fff1e8', // bordures des marqueurs sur la carte
}

export const Colors = {
  background: Palette.cream,
  surface: Palette.sand,
  border: Palette.plum,
  text: Palette.plum,
  muted: Palette.terracotta,
  icon: Palette.terracotta,
  tabIconDefault: Palette.terracotta,
  tabIconSelected: Palette.coral,
  tint: Palette.coral,
  onPrimary: Palette.cream,
  danger: Palette.raspberry,
  gold: Palette.amber,
  accent: Palette.teal,
  fee: Palette.orange,
  pink: Palette.pink,
  secondary: Palette.terracotta,
  shadow: Palette.ink,
}
