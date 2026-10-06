# PlaceKeepr — Spec de design (refonte écrans sociaux)

> Document de handoff pour implémentation. Cible : React Native + Expo (SDK 55, expo-router),
> pas de WebGL, pas d'effets exotiques. Étendre `PixelButton` / `PixelCard` plutôt que remplacer.
> i18n FR/EN systématique. Devnet uniquement pendant l'apprentissage.
>
> Mockups de référence : `PlaceKeepr Refonte.dc.html` (board complet, badges de cadre : CARTE, 3a/3b, 4a, 5a…).
> Décisions verrouillées le 08/07/2026 : **onglets 1a · célébration 4a · réputation 5a**.

---

## 0. Thèse

L'app sait **capturer** mais pas **faire revenir**. La réputation — cœur émotionnel — est
invisible. L'onglet Compte est un wallet hérité du template, vide de sens produit. Le moment
« tu deviens gardien » finit dans un `Snackbar`.

**Parti-pris : deux boucles, deux domiciles.**
- **Visiteur** → vit sur la **Carte** (découvrir, aimer).
- **Gardien** → vit sur son **profil** (collection, réputation, paliers).
- **Activité** → relie les deux et donne la raison de revenir chaque jour.

---

## 1. Architecture d'écrans

### Onglets — DÉCISION : 3 onglets (variante 1a)

| Onglet | Rôle | Accent actif |
|---|---|---|
| **Carte** (`map`) | Découverte + capture. Accueil. | coral |
| **Activité** (`activity`) | Feed social : likes reçus, captures voisines, paliers. Moteur de rétention. | coral |
| **Gardien** (`keeper`) | Profil : réputation, collection, badges, wallet, revenus. | coral |

- **L'onglet `account` hérité disparaît.** Ses fonctions wallet (solde, airdrop, envoi, réception)
  deviennent une **carte dans Gardien** — il faut du SOL pour capturer, ça appartient à l'identité gardien.
- **Réglages** (langue, cluster) passe en **icône engrenage** dans l'en-tête Gardien (plus d'onglet dédié).
- L'onglet `demo` (ladybug) reste masqué / dev only.
- Pastille amber sur l'onglet Gardien quand un palier vient d'être franchi.

**Fichiers touchés :** `app/app/(tabs)/_layout.tsx` (redéf. des 3 `Tabs.Screen`),
suppression de `app/app/(tabs)/account/` en tant qu'onglet (le contenu migre dans `keeper`),
`app/app/(tabs)/settings/` → écran poussé depuis l'engrenage (stack, pas tab).

### Arbre de navigation cible

```
(tabs)
├── map                 # Carte (accueil) + fiche en feuille + flow capture
├── activity            # Feed (filtres MOI / AUTOUR)
└── keeper              # Profil gardien
    ├── index           # réputation, badges, collection, wallet, revenus
    ├── settings        # langue, cluster (engrenage)
    └── wallet/         # airdrop, send, receive (repris de account/)
place/[slug]            # fiche lieu plein écran (mon-lieu vs autre)
capture/celebrate       # écran plein cadre "TU ES GARDIEN" (modal)
```

---

## 2. Design tokens

Palette « Coucher de soleil chaud ». UI mono-thème **claire** (pas de dark mode), **carte toujours sombre**.

> ⚠️ `app/constants/colors.ts` est encore sur l'ancienne palette Pico-8. **À migrer** vers les tokens ci-dessous.

| Token | Hex | Rôle |
|---|---|---|
| `cream` | `#fff2e0` | fonds |
| `sand` | `#ffe1bf` | surfaces / cartes |
| `plum` | `#3a1f2e` | texte, bordures |
| `ink` | `#4a1f33` | ombre dure |
| `coral` | `#e6541f` | action primaire + **mes lieux** |
| `teal` | `#1f8f80` | likes, visites, **autres gardiens** |
| `amber` | `#b8730a` | or — **réputation / rareté uniquement** |
| `raspberry` | `#d11a55` | danger |
| `orange` | `#d9701a` | frais |
| `terracotta` | `#9c5a4a` | secondaire |
| `mapBg` | `#241826` | fond de carte sombre |
| `mapGrid` | `#3a2536` | grille de carte |

### Règles visuelles (non négociables)

- **Aucun `border-radius`.** Partout.
- **Bordures 2–3 px** plum.
- **Ombres dures décalées**, jamais de flou : `shadowOffset {4,4}`, `shadowRadius 0`, `shadowColor ink`
  (RN : rendu par une boîte-ombre `ink` derrière la face `translate(-4,-4)` — pattern déjà en place dans `PixelCard`/`PixelButton`).
- **Bouton** : repos = face `translate(-4,-4)` sur sa boîte-ombre ; appui = `translate(0,0)` → s'enfonce dans l'ombre (façon console).
- **Typo** : `Press Start 2P` → **titres et grands nombres seulement**. Corps + labels → `DM Mono` (lisible). Jamais Press Start en paragraphe.
  - ⚠️ **Press Start 2P n'a pas de glyphes accentués** (é, É, à…). Prévoir : soit titres sans accent, soit une fonte pixel avec accents. Sinon fallback disgracieux sur les titres.
- **Espacement** : grille 4 px. Gaps courants 8 / 12 / 16 / 24. Padding carte 16. **Cible tactile ≥ 44 px.**
- **Photos de lieux** : miniature pixel-art → downscale 64 px, posterisation, upscale nearest (`image-rendering: pixelated` équiv. RN : `resizeMode` + traitement). Factoriser dans un util `pixelate()` partagé.

---

## 3. Composants à étendre

### `PixelButton` — ajouter des variants

Actuel : `primary` (tint), `secondary` (surface), `danger` (accent).

```ts
export type PixelButtonVariant =
  | 'primary'    // coral  — action principale (CAPTURER, PARTAGER)
  | 'secondary'  // sand   — action neutre (VOIR SUR EXPLORER)
  | 'danger'     // raspberry
  | 'like'       // teal   — AIMER / visite         ← nouveau
  | 'reputation' // amber  — contextes réputation    ← nouveau (rare)
```

Label : blanc sur coral/teal/amber/raspberry ; plum sur sand.

### `PixelCard` — ajouter un accent optionnel

```ts
interface PixelCardProps {
  accent?: 'coral' | 'teal' | 'amber' | 'none' // borderColor override, défaut plum
  variant?: 'solid' | 'dashed'                  // dashed = placeholder "bientôt"
}
```

- `accent="coral"` → carte de MON lieu.
- `accent="teal"` → carte gardien / autre lieu.
- `variant="dashed"` + accent teal/orange → emplacements « bientôt » (visites, revenus).

### Nouveaux composants

- `PixelGlyph` — icônes 8-bit rendues en grille (cœur, étoile, épingle, drapeau, semelle, engrenage, appareil-photo). Taille par `cell` (px). Couleur paramétrable. (Voir grilles dans le mock, logique `glyph()`.)
- `PixelThumb` — miniature pixel-art d'une photo de lieu (posterisée). Prop `size`.
- `ReputationBar` — barre de progression pixel (bordure amber 2px, remplissage amber, fond ink).
- `RankBadge` — cartouche rang (étoile amber sur ink, bordure amber).
- `ActivityRow` — ligne de feed (glyphe + titre + lieu + méta ; variante `highlight` amber sur plum pour un palier).

---

## 4. Écrans — specs

### 4.1 Carte (`map`) — réf. CARTE / CARTE·FICHE

- Carte MapLibre **sombre** (`mapBg`), grille `mapGrid`. Marqueurs = épingles pixel : **coral = mes lieux**, **teal = autres** (rayon 50 km).
- En-tête flottant (PixelCard) : « MA ZONE · 50 KM » + LAT/LON.
- Légende compacte (coin bas-gauche) : coral = mes lieux / teal = autres gardiens.
- **Bouton primaire plein largeur : « CAPTURER ICI »** (jamais « mint » côté produit). `disabled` si pas de position.
  - Flow inchangé : photo obligatoire (caméra seulement) + **position figée au déclenchement**, puis tx.
- Tap marqueur → **fiche en feuille basse** (PixelCard) : miniature 70px, slug, badge GARDIEN teal, bouton **AIMER · N** (teal, compteur intégré) + bouton `…` (44px) vers la fiche pleine.

### 4.2 Fiche lieu (`place/[slug]`) — réf. 3a (mon lieu) / 3b (autre)

**Base commune :** hero miniature (180px, bordé), titre (Press Start), `slug · capturé JJ/MM/AA`, bouton « VOIR SUR EXPLORER » (secondary).

**3a — MON LIEU (accent coral) :**
- Badge « TON LIEU » coral en overlay du hero.
- Deux stats côte à côte : **likes reçus** (teal, cœur) / **réputation** (amber, `+N` — montrer que les likes → réputation).
- Ligne « Visites — bientôt » (PixelCard dashed teal).
- Actions : **PARTAGER** (coral), VOIR SUR EXPLORER (secondary).

**3b — LIEU D'UN AUTRE (accent teal) :**
- **Carte gardien en vedette** (fond teal) : avatar, « GARDIEN · MARA », réputation + rang.
- **CTA dominant : AIMER CE LIEU** (teal). Sous-texte : « 1 like par wallet · retirable · N personnes aiment ».
- Ligne « Prouver ma visite — bientôt » (dashed teal).
- VOIR SUR EXPLORER.

> Différence clé : mon-lieu = fierté + gestion (coral) ; lieu-d'un-autre = le **gardien** est la vedette (teal), aimer nourrit SA réputation.

### 4.3 Première capture (`capture/celebrate`) — DÉCISION : 4a plein cadre

Déclenché **après confirmation de la tx** (remplace le `Snackbar` actuel). Modal plein écran, fond `plum`.

- Confettis pixel (coral / teal / amber / cream / orange) tombant en boucle — anim `translateY + rotate` (RN : Reanimated / Animated, RN-safe).
- « ★ NOUVEAU GARDIEN ★ » (amber), puis titre géant **« TU ES GARDIEN »** (`pop` = translateY + opacity).
- Miniature du lieu **tamponnée** d'un bandeau coral avec le nom.
- « Tu gardes ce lieu, à vie. » + cartouche palier si franchi : « +1 lieu · Éclaireur → Gardien » (amber).
- Bouton **« VOIR MON LIEU »** (coral, bordure cream).

Animations = uniquement `translate` + `opacity` + `scale`. Pas de blur, pas de WebGL.

### 4.4 Gardien (`keeper`) — réf. GARDIEN + réputation 5a

En-tête (fond `plum`) :
- Ligne : avatar (bordé amber) + « TOI » + adresse tronquée + **engrenage** (→ réglages).
- **Réputation en héros (5a)** : grand nombre `312` (Press Start ~36px, amber), sous-titre « POINTS DE RÉPUTATION », puis « RANG · SENTINELLE » (étoile amber).
- `ReputationBar` + « 88 likes avant CARTOGRAPHE » (objectif concret, jamais purement vanité).

Corps (fond cream) :
- **BADGES** : rangée de cartouches 46px — gagnés (amber sur ink) / verrouillés (terracotta, opacité réduite).
- **MES LIEUX · N** : grille 3 colonnes de miniatures, chacune avec compteur likes (teal) en coin. Tri « likes ▾ ».
- **WALLET** (PixelCard) : solde `◎`, texte « Il faut du SOL pour capturer », boutons AIRDROP / ENVOYER / RECEVOIR. *(reprend `account/airdrop|send|receive`)*
- **REVENUS** (PixelCard dashed orange, « SOON ») : royalties de ventes secondaires — split gardien / trésorerie / likers récents.

### 4.5 Activité (`activity`) — réf. ACTIVITÉ

- Titre + deux filtres segmentés : **MOI** (touche mes lieux) / **AUTOUR** (ma zone 50 km).
- Feed de `ActivityRow` :
  - like reçu (teal, cœur) → « Mara a aimé Cap Fréhel · +1 réputation ».
  - **palier franchi** (highlight amber sur plum) → « PALIER FRANCHI · Sentinelle ».
  - captures voisines (coral, épingle) → « Nouveau gardien à 2 km : Le Vieux Phare · Jonas · Va l'aimer ».
  - emplacement **Visites — bientôt** (dashed terracotta).

> Chaque like reçu = petite récompense visible (boucle gardien). Captures voisines = curiosité (boucle visiteur). Palier = célébration amber.

---

## 5. Réputation

- **Définition :** réputation d'un gardien = somme des likes reçus sur ses lieux (like on-chain, 1 par wallet par lieu, retirable).
- **Expression retenue (5a) :** le **nombre** en héros, le **rang nommé** juste dessous, l'**objectif concret** (« X avant le prochain palier ») toujours visible. Le rang + les paliers évitent que ça devienne un compteur froid / une surenchère.
- **Paliers (amber)** — chacun débloque un badge 8-bit :

| Rang | Seuil (réputation) |
|---|---|
| Vagabond | 0 |
| Éclaireur | 10 |
| Gardien | 50 |
| Sentinelle | 150 |
| Cartographe | 400 |
| Légende | 1000 |

- **Badges jalons** (exemples) : 1re capture, 10 lieux, un lieu à 50+ likes, fidélité (lieu tenu 1 an), territoire (5 lieux dans une ville). Gagnés = amber ; verrouillés = terracotta atténué.

---

## 6. À venir (place réservée, pas à designer maintenant)

- **Visites** : check-in avec présence physique vérifiée. Emplacements posés : ligne « bientôt » teal sur les fiches (3a/3b) + ligne dédiée dans le feed. Bouton désactivé « SOON ».
- **Royalties** : ventes secondaires, split gardien / trésorerie / likers récents. Carte « REVENUS · SOON » (dashed orange) dans Gardien. Toute interaction produisant potentiellement un revenu doit être logguée proprement (compta future).

---

## 7. i18n — clés à prévoir (FR / EN)

Lexique : FR = « capturer », « gardien » (jamais « minter » côté produit) ; EN = « mint », « keeper ».

```
map.captureHere            "Capturer ici"        / "Capture here"
place.becomeKeeper.title   "Tu es gardien"       / "You're a keeper"
place.keeper               "Gardien"             / "Keeper"
place.like                 "Aimer ce lieu"       / "Like this place"
place.likesReceived        "likes reçus"         / "likes received"
place.visitsSoon           "Visites — bientôt"   / "Visits — soon"
keeper.reputation          "Points de réputation"/ "Reputation points"
keeper.nextRank            "{n} likes avant {rank}" / "{n} likes to {rank}"
keeper.wallet              "Wallet"              / "Wallet"
keeper.revenueSoon         "Revenus — bientôt"   / "Revenue — soon"
activity.tabMe             "Moi"                 / "Me"
activity.tabAround         "Autour"              / "Around"
rank.vagabond|eclaireur|gardien|sentinelle|cartographe|legende
```

---

## 8. Ordre d'implémentation suggéré

1. Migrer `colors.ts` vers les tokens sunset + variants `PixelButton` (`like`, `reputation`) et `PixelCard` (`accent`, `variant`).
2. Refonte `(tabs)/_layout.tsx` → 3 onglets ; dissoudre `account/` dans `keeper/wallet/`.
3. Écran `keeper` (réputation 5a + badges + collection + wallet + revenus).
4. Fiche `place/[slug]` (3a/3b) + fiche en feuille sur la carte.
5. `capture/celebrate` (4a) branché sur la confirmation de tx (retirer le Snackbar).
6. `activity` (feed + filtres). Indexation via Helius → Supabase quand dispo.
