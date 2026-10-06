/**
 * Génère le style de carte rétro 8-bit à partir du style Liberty d'OpenFreeMap :
 * couleurs aplaties sur les tokens « carte sombre » de la palette sunset
 * (docs/design/placekeepr-sunset.html), relief et POI supprimés.
 *
 * Usage : npm run build:map-style
 * Sortie : assets/map-styles/retro-dark.json (committée — le style est un artefact
 * du repo, pas une dépendance runtime ; tuiles/glyphs/sprites restent OpenFreeMap).
 */
import fs from 'node:fs'
import path from 'node:path'

const SOURCE_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty'
const OUTPUT = path.join(import.meta.dirname, '..', 'assets', 'map-styles', 'retro-dark.json')

// Tokens carte du design sunset (--map-*) + dérivés pour les aplats de fond :
// teintes décalées vers le violet/ambre chaud, plus de bleus électriques.
const C = {
  bg: '#08080f',
  water: '#16233f',
  green: '#12382a',
  greenDark: '#0e2f24',
  greenLine: '#1a523c',
  ice: '#26334e',
  sand: '#3a2e20',
  cemetery: '#102c22',
  hospital: '#2a1626',
  school: '#1b1b33',
  residential: '#121224',
  aeroway: '#232347',
  building: '#1f1f3e',
  motorway: '#a8600f',
  trunk: '#7e4a10',
  secondary: '#4c4370',
  minor: '#372f53',
  service: '#2b2545',
  path: '#453a66',
  rail: '#46395f',
  boundary: '#8a7196',
  textMain: '#fff1e8',
  textDim: '#cbb9ae',
  textFaint: '#8a7196',
  textWater: '#5a7fb5',
  textCapital: '#ffc23d',
}

const hide = () => ({ hide: true })
// La couleur est appliquée selon le type réel de la couche (fill/line/symbol/background),
// certains ids étant trompeurs (park_outline et aeroway_runway sont des lignes).
const color = (value) => ({ color: value })
const background = color
const fill = color
const line = color
const text = color

// Première règle qui matche l'id de la couche gagne.
const RULES = [
  [/^background$/, background(C.bg)],
  [/^natural_earth$/, hide()], // relief raster : tue le rendu flat 8-bit
  [/^park_outline$/, line(C.greenLine)],
  [/^park$/, fill(C.green)],
  [/^landcover_wood$/, fill(C.greenDark)],
  [/^(landcover_(grass|wetland)|landuse_(pitch|track))$/, fill(C.green)],
  [/^landcover_ice$/, fill(C.ice)],
  [/^landcover_sand$/, fill(C.sand)],
  [/^landuse_cemetery$/, fill(C.cemetery)],
  [/^landuse_hospital$/, fill(C.hospital)],
  [/^landuse_school$/, fill(C.school)],
  [/^landuse_residential$/, fill(C.residential)],
  [/^water$/, fill(C.water)],
  [/^waterway/, line(C.water)],
  [/^aeroway/, fill(C.aeroway)],
  [/casing$/, hide()], // pas de contours de routes : aplats nets
  [/^road_area_pattern$/, hide()],
  [/one_way_arrow/, hide()],
  [/rail_hatching$/, hide()],
  [/(major_rail|transit_rail)$/, line(C.rail)],
  [/motorway_link$/, line(C.trunk)],
  [/motorway$/, line(C.motorway)],
  [/trunk_primary$/, line(C.trunk)],
  [/secondary_tertiary$/, line(C.secondary)],
  [/(street|minor|link)$/, line(C.minor)],
  [/service_track$/, line(C.service)],
  [/path_pedestrian/, line(C.path)],
  [/^building$/, fill(C.building)],
  [/^building-3d$/, hide()], // extrusions 3D : hors sujet en 8-bit
  [/^boundary/, line(C.boundary)],
  [/^(poi_|airport|.*shield)/, hide()],
  [/^highway-name-(path|minor)$/, hide()],
  [/^highway-name-major$/, text(C.textDim)],
  [/^(water_name|waterway_line_label)/, text(C.textWater)],
  [/^label_city_capital$/, text(C.textCapital)],
  [/^label_(city|town)$/, text(C.textMain)],
  [/^label_village$/, text(C.textDim)],
  [/^label_(state|other)$/, text(C.textFaint)],
  [/^label_country/, text(C.textFaint)],
]

function transformLayer(layer) {
  const rule = RULES.find(([pattern]) => pattern.test(layer.id))
  if (!rule) {
    console.warn(`couche sans règle, conservée telle quelle : ${layer.id}`)
    return layer
  }
  const action = rule[1]
  const out = { ...layer, paint: { ...layer.paint }, layout: { ...layer.layout } }

  if (action.hide) {
    out.layout.visibility = 'none'
    return out
  }
  switch (layer.type) {
    case 'background':
      out.paint = { 'background-color': action.color }
      break
    case 'fill':
      out.paint['fill-color'] = action.color
      delete out.paint['fill-pattern']
      break
    case 'line':
      out.paint['line-color'] = action.color
      delete out.paint['line-pattern']
      break
    case 'symbol':
      out.paint['text-color'] = action.color
      out.paint['text-halo-color'] = C.bg
      out.paint['text-halo-width'] = 1.2
      break
    default:
      console.warn(`type non géré (${layer.type}), couche cachée : ${layer.id}`)
      out.layout.visibility = 'none'
  }
  return out
}

const response = await fetch(SOURCE_STYLE_URL)
if (!response.ok) {
  throw new Error(`fetch ${SOURCE_STYLE_URL} → ${response.status}`)
}
const style = await response.json()

const retro = {
  ...style,
  name: 'PlaceKeepr Retro Dark',
  layers: style.layers.map(transformLayer),
}

fs.mkdirSync(path.dirname(OUTPUT), { recursive: true })
fs.writeFileSync(OUTPUT, JSON.stringify(retro, null, 1))
console.log(`écrit : ${OUTPUT} (${retro.layers.length} couches)`)
