/**
 * Génère les icônes de l'app en pixel-art (logo = marqueur de lieu, cf.
 * components/ui/pixel-marker.tsx) à partir d'une grille string-art 16×16.
 *
 * Usage : npm run build:icons
 * Sorties (committées) :
 *  - assets/images/icon.png            1024×1024, fond sombre
 *  - assets/images/adaptive-icon.png   1024×1024, marqueur centré (safe zone), fond transparent
 *  - assets/images/splash-icon.png     512×512, fond transparent
 *  - assets/images/favicon.png         64×64, fond sombre
 */
import fs from 'node:fs'
import path from 'node:path'
import { PNG } from 'pngjs'

const OUT_DIR = path.join(import.meta.dirname, '..', 'assets', 'images')

// Palette sunset, tokens carte sombre (voir constants/colors.ts)
const COLORS = {
  D: [0x08, 0x08, 0x0f, 0xff], // fond sombre (map-bg)
  C: [0xe6, 0x54, 0x1f, 0xff], // corail (marqueur)
  I: [0x4a, 0x1f, 0x33, 0xff], // ink (losange)
  W: [0xff, 0xf1, 0xe8, 0xff], // blanc cassé (bordures)
  '.': [0, 0, 0, 0], // transparent
}

// Marqueur de lieu 16×16 : tête carrée bordée + losange (étoile 4 branches) + pied.
const MARKER = [
  '................',
  '...WWWWWWWWWW...',
  '...WCCCCCCCCW...',
  '...WCCCIICCCW...',
  '...WCCIIIICCW...',
  '...WCIIIIIICW...',
  '...WCIIIIIICW...',
  '...WCCIIIICCW...',
  '...WCCCIICCCW...',
  '...WCCCCCCCCW...',
  '...WWWWWWWWWW...',
  '......WCCW......',
  '......WCCW......',
  '.......WW.......',
  '................',
  '................',
]

/**
 * Dessine la grille dans un canvas de `gridSize` cellules de côté (art centré),
 * upscalé en plus-proche-voisin à `pixelsPerCell`, sur fond `bg` ('.' = transparent).
 */
function render({ gridSize, pixelsPerCell, bg }) {
  const size = gridSize * pixelsPerCell
  const png = new PNG({ width: size, height: size })
  const offset = Math.floor((gridSize - MARKER.length) / 2)

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cellX = Math.floor(x / pixelsPerCell) - offset
      const cellY = Math.floor(y / pixelsPerCell) - offset
      const key = MARKER[cellY]?.[cellX] ?? '.'
      const [r, g, b, a] = key === '.' ? COLORS[bg] : COLORS[key]
      const i = (y * size + x) * 4
      png.data[i] = r
      png.data[i + 1] = g
      png.data[i + 2] = b
      png.data[i + 3] = a
    }
  }
  return PNG.sync.write(png)
}

const TARGETS = [
  // L'icône classique : marqueur plein cadre sur fond sombre.
  { file: 'icon.png', gridSize: 16, pixelsPerCell: 64, bg: 'D' },
  // Adaptive icon Android : zoomée/masquée par le launcher → marqueur à 50%
  // du canvas (safe zone 66%), fond transparent (couleur via app.json).
  { file: 'adaptive-icon.png', gridSize: 32, pixelsPerCell: 32, bg: '.' },
  { file: 'splash-icon.png', gridSize: 16, pixelsPerCell: 32, bg: '.' },
  { file: 'favicon.png', gridSize: 16, pixelsPerCell: 4, bg: 'D' },
]

for (const target of TARGETS) {
  const buffer = render(target)
  fs.writeFileSync(path.join(OUT_DIR, target.file), buffer)
  const size = target.gridSize * target.pixelsPerCell
  console.log(`écrit : assets/images/${target.file} (${size}×${size})`)
}
