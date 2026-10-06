import React from 'react'
import { StyleSheet, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { AppText } from '@/components/app-text'
import { PixelFont } from '@/components/app-theme'
import { KeeperStats } from '@/components/keeper/keeper-stats'
import { rankProgress, reputationScore } from '@/components/keeper/ranks'
import { ReputationBar } from '@/components/keeper/reputation-bar'
import { SkrBadge } from '@/components/keeper/skr-badge'
import { useSkrStatus } from '@/components/keeper/use-skr-status'
import { ProfileAvatar } from '@/components/profile/profile-avatar'
import { PixelGlyph } from '@/components/ui/pixel-glyph'
import { Palette } from '@/constants/colors'
import { Profile } from '@/utils/backend'
import { ellipsify } from '@/utils/ellipsify'

/**
 * En-tête du profil gardien (handoff design 4.4, réputation 5a) : le nombre
 * en héros, le rang nommé dessous, l'objectif concret toujours visible.
 */
export function KeeperHero({ address, stats, profile }: { address: string; stats: KeeperStats; profile?: Profile }) {
  const { t } = useTranslation()
  const reputation = reputationScore(stats)
  const { current, next, progress, remaining } = rankProgress(reputation)
  const skr = useSkrStatus(address)

  return (
    <View style={styles.shadowBox}>
      <View style={styles.hero}>
        <View style={styles.identityRow}>
          <ProfileAvatar
            avatarPath={profile?.avatarPath}
            size={30}
            borderColor={Palette.amber}
            glyphColor={Palette.amber}
          />
          <View style={styles.identity}>
            {/* Le pseudo prend la place de « TOI » : c'est devenu ton nom.
                L'adresse reste dessous — sur son propre profil, elle sert. */}
            <AppText style={styles.you} numberOfLines={1}>
              {profile?.displayName ?? t('keeper.you')}
            </AppText>
            <AppText style={styles.address}>{ellipsify(address, 6)}</AppText>
          </View>
        </View>

        {/* SKR staké sur mainnet (prix SKR de CLOCK IN) : double le quota de
            captures. Sans stake, l'incitation — c'est son propre écran. */}
        {skr.data ? (
          <View style={styles.skrRow}>
            {skr.data.backed ? <SkrBadge /> : null}
            <AppText style={styles.breakdown}>
              {skr.data.backed
                ? t('skr.stakedLine', {
                    staked: skr.data.staked.toLocaleString(),
                    captures: skr.data.dailyCaptures,
                  })
                : t('skr.stakeHint', { min: skr.data.minStake.toLocaleString() })}
            </AppText>
          </View>
        ) : null}

        <AppText style={styles.number}>{reputation}</AppText>
        <AppText style={styles.pointsLabel}>{t('keeper.reputationPoints')}</AppText>
        {/* D'où vient le nombre : sans ça, le barème est invisible. */}
        <AppText style={styles.breakdown}>
          {t('keeper.breakdown', { likes: stats.likesReceived, visits: stats.visitsReceived })}
        </AppText>

        <View style={styles.rankRow}>
          <PixelGlyph name="star" color={Palette.amber} cell={2} />
          <AppText style={styles.rank}>{t('keeper.rank', { rank: t(`rank.${current.key}`) })}</AppText>
        </View>

        <ReputationBar progress={progress} />
        <AppText style={styles.objective}>
          {next ? t('keeper.nextRank', { count: remaining, rank: t(`rank.${next.key}`) }) : t('keeper.maxRank')}
        </AppText>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  shadowBox: {
    marginTop: 4,
    marginLeft: 4,
    backgroundColor: Palette.ink,
  },
  hero: {
    borderWidth: 3,
    borderColor: Palette.plum,
    backgroundColor: Palette.plum,
    padding: 16,
    gap: 10,
    alignItems: 'center',
    transform: [{ translateX: -4 }, { translateY: -4 }],
  },
  identityRow: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  identity: {
    // Sans ça, un pseudo de 20 caractères en Press Start 2P pousse le bloc
    // hors du cadre au lieu de se tronquer.
    flexShrink: 1,
  },
  you: {
    fontFamily: PixelFont,
    fontSize: 10,
    color: Palette.cream,
  },
  address: {
    fontSize: 12,
    color: Palette.sand,
  },
  number: {
    fontFamily: PixelFont,
    fontSize: 36,
    lineHeight: 44,
    color: Palette.amber,
  },
  pointsLabel: {
    fontFamily: PixelFont,
    fontSize: 8,
    color: Palette.cream,
  },
  breakdown: {
    fontSize: 12,
    color: Palette.sand,
  },
  skrRow: {
    gap: 6,
    marginTop: 8,
  },
  rankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  rank: {
    fontFamily: PixelFont,
    fontSize: 10,
    color: Palette.amber,
  },
  objective: {
    fontSize: 12,
    color: Palette.cream,
  },
})
