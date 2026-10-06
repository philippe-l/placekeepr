import React from 'react'
import { StyleSheet, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { AppText } from '@/components/app-text'
import { PixelFont } from '@/components/app-theme'
import { KeeperStats } from '@/components/keeper/keeper-stats'
import { rankProgress, reputationScore } from '@/components/keeper/ranks'
import { SkrBadge } from '@/components/keeper/skr-badge'
import { useSkrStatus } from '@/components/keeper/use-skr-status'
import { displayNameOf } from '@/components/profile/display-name'
import { ProfileAvatar } from '@/components/profile/profile-avatar'
import { useProfiles } from '@/components/profile/use-profiles'
import { Palette } from '@/constants/colors'

/**
 * Carte gardien en vedette (fiche 3b) : sur le lieu d'un autre, c'est LE
 * gardien qu'on met en avant — aimer son lieu ou y passer nourrit SA
 * réputation. Pseudo et avatar s'il en a posé, adresse tronquée sinon — le
 * repli est le cas courant, pas un cas d'erreur.
 */
export function KeeperCard({ address, stats }: { address: string; stats: KeeperStats }) {
  const { t } = useTranslation()
  const reputation = reputationScore(stats)
  const rank = rankProgress(reputation).current
  // Un seul wallet, mais la même requête mise en cache que partout ailleurs.
  const profiles = useProfiles([address])
  const profile = profiles.data?.[address]
  const skr = useSkrStatus(address)

  return (
    <View style={styles.shadowBox}>
      <View style={styles.card}>
        <ProfileAvatar
          avatarPath={profile?.avatarPath}
          size={32}
          borderColor={Palette.cream}
          glyphColor={Palette.cream}
        />
        <View style={styles.info}>
          <AppText style={styles.title} numberOfLines={1}>
            {t('place.keeperCard', { address: displayNameOf(address, profile) })}
          </AppText>
          <AppText style={styles.meta}>
            {reputation} · {t(`rank.${rank.key}`).toUpperCase()}
          </AppText>
          <AppText style={styles.breakdown}>
            {t('keeper.breakdown', { likes: stats.likesReceived, visits: stats.visitsReceived })}
          </AppText>
          {/* Le badge seul : le montant staké d'un autre ne regarde que lui. */}
          {skr.data?.backed ? <SkrBadge /> : null}
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  shadowBox: {
    marginTop: 4,
    marginLeft: 4,
    backgroundColor: Palette.ink,
    alignSelf: 'stretch',
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 3,
    borderColor: Palette.plum,
    backgroundColor: Palette.teal,
    padding: 14,
    transform: [{ translateX: -4 }, { translateY: -4 }],
  },
  info: {
    gap: 4,
    flex: 1,
  },
  title: {
    fontFamily: PixelFont,
    fontSize: 9,
    color: Palette.cream,
  },
  meta: {
    fontSize: 13,
    color: Palette.cream,
  },
  breakdown: {
    fontSize: 11,
    color: Palette.sand,
  },
})
