import { useMobileWallet } from '@wallet-ui/react-native-web3js'
import React from 'react'
import { ScrollView, StyleSheet } from 'react-native'
import { AppView } from '@/components/app-view'
import { BadgesRow } from '@/components/keeper/badges-row'
import { EMPTY_KEEPER_STATS } from '@/components/keeper/keeper-stats'
import { KeeperHero } from '@/components/keeper/keeper-hero'
import { PlacesGrid } from '@/components/keeper/places-grid'
import { RevenueCard } from '@/components/keeper/revenue-card'
import { WalletCard } from '@/components/keeper/wallet-card'
import { useKeeperPlaces } from '@/components/keeper/use-keeper-places'
import { useKeeperStats } from '@/components/keeper/use-keeper-stats'
import { entriesForWallet } from '@/components/mint/mint-log'
import { useMintLog } from '@/components/mint/use-mint-log'
import { useMyProfile } from '@/components/profile/use-my-profile'
import { toPublicKey } from '@/utils/to-public-key'

/**
 * Profil gardien (handoff design 4.4) : réputation en héros (5a, lue
 * on-chain), badges, collection, wallet, royalties.
 */
export default function KeeperScreen() {
  const { account } = useMobileWallet()
  const mintLog = useMintLog()
  const stats = useKeeperStats()
  const profile = useMyProfile()
  const wallet = account ? toPublicKey(account.publicKey) : null
  const places = useKeeperPlaces(wallet?.toBase58() ?? null)

  if (!wallet) {
    // L'onglet est derrière le garde sign-in ; ceinture et bretelles.
    return <AppView style={styles.page} />
  }

  // La collection et les badges sont ceux du wallet CONNECTÉ, pas du device.
  const entries = entriesForWallet(mintLog.data ?? [], wallet.toBase58())
  const keeperPlaces = places.data ?? []
  const maxPlaceLikes = keeperPlaces.reduce((max, place) => Math.max(max, place.likeCount), 0)

  return (
    <AppView style={styles.page}>
      <ScrollView contentContainerStyle={styles.content}>
        <KeeperHero
          address={wallet.toBase58()}
          stats={stats.data ?? EMPTY_KEEPER_STATS}
          profile={profile.data ?? undefined}
        />
        <BadgesRow placesCount={entries.length} maxPlaceLikes={maxPlaceLikes} />
        <PlacesGrid entries={entries} places={keeperPlaces} />
        <WalletCard address={wallet} />
        <RevenueCard places={keeperPlaces.map((place) => place.pda)} />
      </ScrollView>
    </AppView>
  )
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
  },
  content: {
    padding: 16,
    gap: 20,
  },
})
