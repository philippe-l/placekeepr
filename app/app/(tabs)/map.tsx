import {
  Camera,
  LocationManager,
  Map,
  Marker,
  NativeUserLocation,
  useCurrentPosition,
  type StyleSpecification,
} from '@maplibre/maplibre-react-native'
import { useMobileWallet } from '@wallet-ui/react-native-web3js'
import { Image } from 'expo-image'
import * as ImagePicker from 'expo-image-picker'
import { useRouter } from 'expo-router'
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { AppText } from '@/components/app-text'
import { CoordCard } from '@/components/map/coord-card'
import { NearbyPlaceCard } from '@/components/map/nearby-place-card'
import { NearbyPlace, useNearbyPlaces } from '@/components/map/use-nearby-places'
import { entriesForWallet, MintLogEntry } from '@/components/mint/mint-log'
import { PlaceCard } from '@/components/mint/place-card'
import { useInvalidateMintLog, useMintLog } from '@/components/mint/use-mint-log'
import { placeSlug, useMintPlace } from '@/components/mint/use-mint-place'
import { CaptureRejected, getVerifiedPosition, precheckCapture } from '@/components/mint/verify-capture'
import { isConfirmed } from '@/components/place/place-confirmation'
import { showToast } from '@/components/ui/pixel-toast'
import { toPublicKey } from '@/utils/to-public-key'
import { PixelButton } from '@/components/ui/pixel-button'
import { PixelCard } from '@/components/ui/pixel-card'
import { PixelMarker } from '@/components/ui/pixel-marker'
import { PixelStatusBar } from '@/components/ui/pixel-status-bar'
import { Palette } from '@/constants/colors'

import retroDarkStyle from '@/assets/map-styles/retro-dark.json'

// Style rétro 8-bit embarqué (généré par scripts/build-map-style.mjs, tuiles
// OpenFreeMap sans clé API), surchargeable par env pour tester un autre style.
const MAP_STYLE: string | StyleSpecification =
  process.env.EXPO_PUBLIC_MAP_STYLE_URL ?? (retroDarkStyle as StyleSpecification)

// Paris par défaut tant que la position n'est pas connue.
const FALLBACK_CENTER: [number, number] = [2.3522, 48.8566]

// Frais d'une capture : signature (5 000 lamports) + rent du PDA du registre
// d'unicité (~0.0013 SOL pour 57 octets).
const MINT_FEE_SOL = '~0.0013 ◎'

// Points de signal du bandeau : qualité du fix GPS (4 = fix ≤ 8 m).
function gpsSignalLevel(accuracy?: number | null) {
  if (accuracy == null) {
    return 1
  }
  if (accuracy <= 8) {
    return 4
  }
  if (accuracy <= 20) {
    return 3
  }
  if (accuracy <= 50) {
    return 2
  }
  return 1
}

// Photo prise + position figée au moment du déclenchement.
interface PendingShot {
  uri: string
  latitude: number
  longitude: number
  accuracy: number
}

/**
 * Un marqueur de la carte, quelle que soit son origine : `entry` renseigné =
 * lieu du wallet connecté (corail), `place` renseigné = autre gardien (teal).
 * Exactement l'un des deux, jamais les deux.
 */
interface MapMarker {
  signature: string
  longitude: number
  latitude: number
  entry: MintLogEntry | null
  place: NearbyPlace | null
  confirmed: boolean
}

/**
 * Sous ce zoom (vue ville et au-delà), la carte ne montre que les lieux
 * confirmés des autres gardiens (#44) : de loin, on veut les lieux qui
 * intéressent quelqu'un, pas chaque capture opportuniste. Les siens restent
 * toujours affichés — c'est sa collection.
 */
const CONFIRMED_ONLY_BELOW_ZOOM = 12

export default function MapScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const { account } = useMobileWallet()
  const [hasPermission, setHasPermission] = useState(false)
  const [pendingShot, setPendingShot] = useState<PendingShot | null>(null)
  const [selectedPlace, setSelectedPlace] = useState<MintLogEntry | null>(null)
  const [selectedNearby, setSelectedNearby] = useState<NearbyPlace | null>(null)
  const position = useCurrentPosition({ enabled: hasPermission })
  const mintPlace = useMintPlace()
  const mintLog = useMintLog()
  const invalidateMintLog = useInvalidateMintLog()
  const nearbyPlaces = useNearbyPlaces(position?.coords)
  // Booléen plutôt que le zoom brut : un re-rendu seulement au franchissement
  // du seuil, pas à chaque pas de pincement.
  const [zoomedOut, setZoomedOut] = useState(false)

  // « Mes lieux » (corail) = entrées du journal mintées par le wallet
  // CONNECTÉ : sur un device multi-comptes, les lieux d'un autre compte
  // s'affichent « autre gardien » (teal, likables) via Supabase.
  const wallet = account ? toPublicKey(account.publicKey).toBase58() : null
  const myEntries = entriesForWallet(mintLog.data ?? [], wallet)
  const mySignatures = new Set(myEntries.map((entry) => entry.signature))
  const otherPlaces = (nearbyPlaces.data ?? []).filter((place) => !mySignatures.has(place.signature))

  // Les marqueurs sont rendus en UNE liste triée, jamais en deux listes sœurs.
  // Au changement de wallet, un lieu passe de « mes lieux » à « autre gardien » :
  // avec deux parents distincts, React démonte la vue native d'un côté pour la
  // remonter de l'autre dans le même commit, ce que la couche de montage Fabric
  // ne supporte pas — crash `RetryableMountingLayerException: Unable to find
  // viewState` observé le 10/09/2026. Un parent unique + clé stable en font une
  // simple mise à jour de props. Le tri garde l'ordre déterministe d'un rendu
  // à l'autre, indépendamment du camp de chaque marqueur.
  //
  // Le masquage des non confirmés au dézoom passe par un `filter` dans cette
  // même liste : un marqueur qui disparaît est démonté de son parent unique,
  // jamais déplacé vers un autre.
  // Objet plutôt que `Map` : le nom est pris par le composant MapLibre.
  const distinctVisitorsBySignature: Record<string, number> = Object.fromEntries(
    (nearbyPlaces.data ?? []).map((place) => [place.signature, place.distinctVisitors]),
  )
  const markers: MapMarker[] = [
    ...myEntries.map((entry) => ({
      signature: entry.signature,
      longitude: entry.longitude,
      latitude: entry.latitude,
      entry,
      place: null,
      confirmed: isConfirmed(distinctVisitorsBySignature[entry.signature] ?? 0),
    })),
    ...otherPlaces.map((place) => ({
      signature: place.signature,
      longitude: place.longitude,
      latitude: place.latitude,
      entry: null,
      place,
      confirmed: isConfirmed(place.distinctVisitors),
    })),
  ]
    .filter((marker) => !zoomedOut || marker.entry !== null || marker.confirmed)
    .sort((a, b) => a.signature.localeCompare(b.signature))

  useEffect(() => {
    LocationManager.requestPermissions().then(setHasPermission)
  }, [])

  // Message dédié quand la vérif GPS (client ou serveur) refuse la capture.
  const rejectionText = (error: unknown) =>
    error instanceof CaptureRejected
      ? t(`map.rejected.${error.reason}`, { distance: error.distanceM, limit: error.limit ?? 5 })
      : null

  // La preuve de localisation = GPS + photo : la photo est obligatoire.
  const onTakePhoto = async () => {
    if (!position) {
      return
    }
    // Position fraîche + contrôles anti-spoof (mock, précision), figée
    // maintenant, pas au moment de la confirmation.
    let verified
    try {
      verified = await getVerifiedPosition()
      // Quota, distance au lieu le plus proche : tranchés AVANT la photo, pas
      // après les uploads (voir precheckCapture).
      if (wallet) {
        await precheckCapture({ minter: wallet, ...verified })
      }
    } catch (error) {
      showToast({ text: rejectionText(error) ?? String(error) })
      return
    }

    const permission = await ImagePicker.requestCameraPermissionsAsync()
    if (!permission.granted) {
      showToast({ text: t('map.cameraDenied') })
      return
    }

    const result = await ImagePicker.launchCameraAsync({
      quality: 0.7,
      exif: false,
    })
    if (result.canceled || !result.assets[0]) {
      return
    }
    setPendingShot({ uri: result.assets[0].uri, ...verified })
  }

  const onConfirmMint = async () => {
    if (!pendingShot) {
      return
    }
    try {
      const signature = await mintPlace.mutateAsync({
        latitude: pendingShot.latitude,
        longitude: pendingShot.longitude,
        accuracy: pendingShot.accuracy,
        photoUri: pendingShot.uri,
      })
      setPendingShot(null)
      invalidateMintLog()
      // LE moment fort : takeover plein cadre (4a), pas un toast.
      router.navigate({ pathname: '/capture-celebrate', params: { signature } })
    } catch (error) {
      // « already in use » = init du PDA registre refusé : la cellule a déjà un gardien.
      const text =
        rejectionText(error) ??
        (String(error).includes('already in use') ? t('map.placeTaken') : t('map.mintFailed', { error: String(error) }))
      showToast({ text })
    }
  }

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.statusBarWrap}>
        <PixelStatusBar title="PLACEKEEPR" signal={position ? gpsSignalLevel(position.coords.accuracy) : 0} />
      </SafeAreaView>
      <View style={styles.mapContainer}>
        <Map
          mapStyle={MAP_STYLE}
          style={styles.map}
          onRegionDidChange={(event) => setZoomedOut(event.nativeEvent.zoom < CONFIRMED_ONLY_BELOW_ZOOM)}
        >
          <Camera
            initialViewState={{ center: FALLBACK_CENTER, zoom: 14 }}
            trackUserLocation={hasPermission ? 'default' : undefined}
          />
          {hasPermission ? <NativeUserLocation /> : null}
          {markers.map((marker) => (
            <Marker
              key={marker.signature}
              lngLat={[marker.longitude, marker.latitude]}
              anchor="bottom"
              onPress={() => {
                // Exactement un des deux est non nul : la sélection reste
                // exclusive sans avoir à remettre l'autre à null séparément.
                setSelectedPlace(marker.entry)
                setSelectedNearby(marker.place)
              }}
            >
              <PixelMarker
                color={marker.entry ? undefined : Palette.teal}
                confirmed={marker.confirmed}
                dimmed={marker.entry === null && !marker.confirmed}
              />
            </Marker>
          ))}
        </Map>
        <SafeAreaView edges={['bottom']} style={styles.overlay} pointerEvents="box-none">
          <CoordCard
            latitude={position?.coords.latitude}
            longitude={position?.coords.longitude}
            accuracy={position?.coords.accuracy}
            hasPermission={hasPermission}
          />
          {pendingShot ? (
            <PixelCard style={styles.confirmCard}>
              <AppText type="subtitle">{t('map.confirmTitle')}</AppText>
              <Image source={{ uri: pendingShot.uri }} style={styles.preview} contentFit="cover" />
              <View style={styles.confirmRow}>
                <AppText>{placeSlug(pendingShot.latitude, pendingShot.longitude)}</AppText>
                <AppText style={styles.fee}>{t('map.fee', { amount: MINT_FEE_SOL })}</AppText>
              </View>
              <AppText style={styles.warning}>{t('map.firstKeeperWarning')}</AppText>
              <PixelButton
                title={mintPlace.isPending ? t('map.minting') : t('map.mint')}
                disabled={mintPlace.isPending}
                onPress={onConfirmMint}
              />
              <PixelButton
                title={t('common.cancel')}
                variant="danger"
                disabled={mintPlace.isPending}
                onPress={() => setPendingShot(null)}
              />
            </PixelCard>
          ) : selectedPlace ? (
            <PlaceCard entry={selectedPlace} onClose={() => setSelectedPlace(null)} />
          ) : selectedNearby ? (
            <NearbyPlaceCard place={selectedNearby} onClose={() => setSelectedNearby(null)} />
          ) : (
            <View style={styles.footer} pointerEvents="box-none">
              {myEntries.length > 0 || otherPlaces.length > 0 ? (
                <View style={styles.legendRow} pointerEvents="none">
                  {myEntries.length > 0 ? (
                    <View style={styles.legend}>
                      <View style={styles.legendSwatch} />
                      <AppText style={styles.legendText}>{t('map.myPlaces')}</AppText>
                    </View>
                  ) : null}
                  {/* Ce qui est affiché, pas ce qui est chargé : au dézoom, les
                      lieux non confirmés des autres sont masqués. */}
                  {markers.some((marker) => marker.place !== null) ? (
                    <View style={styles.legend}>
                      <View style={[styles.legendSwatch, styles.legendSwatchOther]} />
                      <AppText style={styles.legendText}>{t('map.otherPlaces')}</AppText>
                    </View>
                  ) : null}
                  {zoomedOut ? (
                    <View style={styles.legend}>
                      <View style={[styles.legendSwatch, styles.legendSwatchConfirmed]} />
                      <AppText style={styles.legendText}>{t('map.confirmedOnly')}</AppText>
                    </View>
                  ) : null}
                </View>
              ) : null}
              <PixelButton title={t('map.mintThisPlace')} disabled={!position} onPress={onTakePhoto} />
            </View>
          )}
        </SafeAreaView>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  statusBarWrap: {
    backgroundColor: Palette.sand,
  },
  mapContainer: {
    flex: 1,
    // Les marqueurs sont des vues natives posées au-dessus de la carte : sans
    // ça, ceux qui sortent du cadre se dessinaient sur la barre de statut.
    overflow: 'hidden',
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
    padding: 16,
  },
  confirmCard: {
    alignSelf: 'stretch',
    marginBottom: 8,
  },
  preview: {
    width: '100%',
    aspectRatio: 4 / 3,
  },
  confirmRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  fee: {
    color: Palette.orange,
    fontSize: 13,
  },
  warning: {
    color: Palette.terracotta,
    fontSize: 13,
  },
  footer: {
    marginBottom: 8,
    gap: 10,
  },
  legendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  legend: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Palette.cream,
    borderWidth: 3,
    borderColor: Palette.plum,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  legendSwatch: {
    width: 11,
    height: 11,
    backgroundColor: Palette.coral,
    borderWidth: 2,
    borderColor: Palette.plum,
  },
  legendSwatchOther: {
    backgroundColor: Palette.teal,
  },
  legendSwatchConfirmed: {
    backgroundColor: Palette.amber,
  },
  legendText: {
    fontSize: 12,
  },
})
