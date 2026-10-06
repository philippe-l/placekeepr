import { useRouter } from 'expo-router'
import { useMobileWallet } from '@wallet-ui/react-native-web3js'
import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { ActivityRow } from '@/components/activity/activity-row'
import { useCoarsePosition } from '@/components/activity/use-coarse-position'
import { MyActivity, ReceivedLike, ReceivedVisit, useMyActivity } from '@/components/activity/use-my-activity'
import { AppPage } from '@/components/app-page'
import { AppText } from '@/components/app-text'
import { PixelFont } from '@/components/app-theme'
import { VISIT_WEIGHT, ranksCrossed } from '@/components/keeper/ranks'
import { useNearbyPlaces } from '@/components/map/use-nearby-places'
import { CONFIRMED_MIN_VISITORS } from '@/components/place/place-confirmation'
import { displayNameOf } from '@/components/profile/display-name'
import { useProfiles } from '@/components/profile/use-profiles'
import { Palette } from '@/constants/colors'
import { toPublicKey } from '@/utils/to-public-key'

/**
 * Onglet Activité — le moteur de retour (handoff design §06) : MOI = ce qui
 * touche mes lieux (likes et visites reçus, paliers) ; AUTOUR = les captures
 * dans ma zone (50 km), à aller aimer ou visiter.
 */
type Filter = 'me' | 'around'

// Une ligne du feed MOI : un engagement reçu, ou un palier franchi juste après.
type MeItem =
  | { kind: 'like'; like: ReceivedLike }
  | { kind: 'visit'; visit: ReceivedVisit }
  | { kind: 'rank'; rankKey: string; at: string }
  | { kind: 'confirmed'; visit: ReceivedVisit; at: string }

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { day: '2-digit', month: '2-digit' })
}

function formatDistance(meters: number) {
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`
}

/** Cellule de la grille, telle qu'affichée partout ailleurs (4 décimales). */
function cellLabel(latE4: number, lngE4: number) {
  return `${(latE4 / 10_000).toFixed(4)},${(lngE4 / 10_000).toFixed(4)}`
}

/**
 * Fusionne likes et visites en une chronologie, paliers insérés au moment où
 * la réputation les franchit.
 *
 * Une visite vaut `VISIT_WEIGHT` points et le miroir agrège les passages d'un
 * même visiteur sur un même lieu : une ligne pèse donc `VISIT_WEIGHT × count`,
 * daté du dernier passage. Le total colle ainsi au compteur on-chain affiché
 * en héros sur l'écran Gardien, au prix d'une approximation sur la date des
 * passages intermédiaires — l'inverse (une ligne par passage) demanderait de
 * rapatrier tout l'historique pour un feed qui n'en montre que 50.
 *
 * Les paliers sont détectés par **franchissement**, pas par égalité : un saut
 * de 2 points peut enjamber un seuil.
 */
function withMilestones(activity: MyActivity): MeItem[] {
  const events = [
    ...activity.likes.map((like) => ({ at: like.likedAt, points: 1, item: { kind: 'like', like } as MeItem })),
    ...activity.visits.map((visit) => ({
      at: visit.lastVisitedAt,
      points: VISIT_WEIGHT * visit.visitCount,
      item: { kind: 'visit', visit } as MeItem,
    })),
    ...confirmations(activity.visits).map((item) => ({ at: item.at, points: 0, item })),
  ].sort((a, b) => a.at.localeCompare(b.at))

  const items: MeItem[] = []
  let score = 0
  for (const event of events) {
    items.push(event.item)
    const before = score
    score += event.points
    for (const rank of ranksCrossed(before, score)) {
      items.push({ kind: 'rank', rankKey: rank.key, at: event.at })
    }
  }
  return items.reverse()
}

/**
 * « Ton lieu est confirmé » (#44) : pour chaque lieu, le premier passage du
 * `CONFIRMED_MIN_VISITORS`-ième visiteur distinct. Détecté par franchissement
 * du seuil dans l'ordre chronologique des premiers passages — pas par égalité
 * sur le total, qui ne dirait pas QUAND le lieu a basculé.
 *
 * Approximation assumée : le feed ne rapatrie que les 50 visiteurs les plus
 * récents. Un lieu confirmé il y a longtemps peut perdre son événement, jamais
 * en gagner un faux.
 */
function confirmations(visits: ReceivedVisit[]): Extract<MeItem, { kind: 'confirmed' }>[] {
  const byPlace: Record<string, ReceivedVisit[]> = {}
  for (const visit of visits) {
    ;(byPlace[`${visit.latE4},${visit.lngE4}`] ??= []).push(visit)
  }
  return Object.values(byPlace).flatMap((placeVisits) => {
    const ordered = [...placeVisits].sort((a, b) => a.firstVisitedAt.localeCompare(b.firstVisitedAt))
    const crossing = ordered[CONFIRMED_MIN_VISITORS - 1]
    return crossing ? [{ kind: 'confirmed' as const, visit: crossing, at: crossing.firstVisitedAt }] : []
  })
}

export default function ActivityScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const { account } = useMobileWallet()
  const [filter, setFilter] = useState<Filter>('me')

  const wallet = account ? toPublicKey(account.publicKey).toBase58() : null
  const myActivity = useMyActivity(wallet)
  const position = useCoarsePosition()
  const nearby = useNearbyPlaces(position.data ?? undefined)

  const meItems = withMilestones(myActivity.data ?? { likes: [], visits: [] })
  const aroundItems = (nearby.data ?? [])
    .filter((place) => place.minter !== wallet)
    .sort((a, b) => b.mintedAt.localeCompare(a.mintedAt))

  // Tous les wallets du feed en une requête : une par ligne serait absurde sur
  // un écran qui en affiche cinquante. Les deux onglets sont demandés
  // ensemble — basculer de MOI à AUTOUR ne doit pas repartir en chargement.
  const profiles = useProfiles([
    ...meItems.map((item) =>
      item.kind === 'like' ? item.like.liker : item.kind === 'visit' ? item.visit.visitor : null,
    ),
    ...aroundItems.map((place) => place.minter),
  ])
  const nameOf = (address: string) => displayNameOf(address, profiles.data?.[address], 4)

  const openPlace = (signature: string, latitude: number, longitude: number, extra?: Record<string, string>) =>
    router.push({
      pathname: '/place/[signature]',
      params: { signature, lat: String(latitude), lng: String(longitude), ...extra },
    })

  return (
    <AppPage>
      <AppText type="title">{t('activity.title')}</AppText>

      <View style={styles.filters}>
        {(['me', 'around'] as const).map((key) => (
          <Pressable
            key={key}
            accessibilityRole="button"
            onPress={() => setFilter(key)}
            style={[styles.filter, filter === key ? styles.filterActive : null]}
          >
            <AppText style={[styles.filterText, filter === key ? styles.filterTextActive : null]}>
              {t(`activity.tab.${key}`).toUpperCase()}
            </AppText>
          </Pressable>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.feed}>
        {filter === 'me' ? (
          <>
            {meItems.length === 0 ? <AppText style={styles.empty}>{t('activity.emptyMe')}</AppText> : null}
            {meItems.map((item, index) => {
              if (item.kind === 'like') {
                return (
                  <ActivityRow
                    key={`like-${item.like.liker}-${item.like.likedAt}`}
                    glyph="heart"
                    glyphColor={Palette.teal}
                    title={t('activity.likeReceived', {
                      address: nameOf(item.like.liker),
                      place: cellLabel(item.like.latE4, item.like.lngE4),
                    })}
                    meta={t('activity.likeReceivedMeta', { date: formatDate(item.like.likedAt) })}
                    onPress={
                      item.like.registerSignature
                        ? () =>
                            openPlace(item.like.registerSignature!, item.like.latE4 / 10_000, item.like.lngE4 / 10_000)
                        : undefined
                    }
                  />
                )
              }
              if (item.kind === 'visit') {
                return (
                  <ActivityRow
                    key={`visit-${item.visit.visitor}-${item.visit.lastVisitedAt}`}
                    glyph="footprint"
                    glyphColor={Palette.teal}
                    title={t('activity.visitReceived', {
                      address: nameOf(item.visit.visitor),
                      place: cellLabel(item.visit.latE4, item.visit.lngE4),
                    })}
                    meta={t('activity.visitReceivedMeta', {
                      date: formatDate(item.visit.lastVisitedAt),
                      count: item.visit.visitCount,
                    })}
                    onPress={
                      item.visit.registerSignature
                        ? () =>
                            openPlace(
                              item.visit.registerSignature!,
                              item.visit.latE4 / 10_000,
                              item.visit.lngE4 / 10_000,
                            )
                        : undefined
                    }
                  />
                )
              }
              if (item.kind === 'confirmed') {
                const { visit } = item
                return (
                  <ActivityRow
                    key={`confirmed-${visit.latE4}-${visit.lngE4}`}
                    glyph="check"
                    glyphColor={Palette.amber}
                    highlight
                    title={t('activity.placeConfirmed', { place: cellLabel(visit.latE4, visit.lngE4) })}
                    meta={t('activity.placeConfirmedMeta', {
                      count: CONFIRMED_MIN_VISITORS,
                      date: formatDate(item.at),
                    })}
                    onPress={
                      visit.registerSignature
                        ? () => openPlace(visit.registerSignature!, visit.latE4 / 10_000, visit.lngE4 / 10_000)
                        : undefined
                    }
                  />
                )
              }
              return (
                <ActivityRow
                  key={`rank-${item.rankKey}-${index}`}
                  glyph="star"
                  glyphColor={Palette.amber}
                  highlight
                  title={t('activity.rankReached', { rank: t(`rank.${item.rankKey}`).toUpperCase() })}
                  meta={formatDate(item.at)}
                />
              )
            })}
          </>
        ) : (
          <>
            {aroundItems.length === 0 ? <AppText style={styles.empty}>{t('activity.emptyAround')}</AppText> : null}
            {aroundItems.map((place) => (
              <ActivityRow
                key={place.signature}
                glyph="pin"
                glyphColor={Palette.coral}
                title={t('activity.newKeeper', {
                  distance: formatDistance(place.distanceM),
                  place: `${place.latitude.toFixed(4)},${place.longitude.toFixed(4)}`,
                })}
                meta={t('activity.newKeeperMeta', {
                  address: nameOf(place.minter),
                  date: formatDate(place.mintedAt),
                })}
                onPress={() =>
                  openPlace(place.signature, place.latitude, place.longitude, {
                    minter: place.minter,
                    mintedAt: place.mintedAt,
                    thumbPath: place.thumbPath ?? place.photoPath ?? '',
                  })
                }
              />
            ))}
          </>
        )}
      </ScrollView>
    </AppPage>
  )
}

const styles = StyleSheet.create({
  filters: {
    flexDirection: 'row',
    gap: 8,
  },
  filter: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderWidth: 2,
    borderColor: Palette.plum,
    backgroundColor: Palette.sand,
  },
  filterActive: {
    backgroundColor: Palette.coral,
  },
  filterText: {
    fontFamily: PixelFont,
    fontSize: 9,
    color: Palette.plum,
  },
  filterTextActive: {
    color: Palette.cream,
  },
  feed: {
    gap: 8,
    paddingBottom: 24,
  },
  empty: {
    color: Palette.terracotta,
  },
})
