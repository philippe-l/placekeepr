import React from 'react'
import { StyleSheet, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { AppText } from '@/components/app-text'
import { PixelFont } from '@/components/app-theme'
import { useKeeperRoyalties } from '@/components/keeper/use-keeper-royalties'
import { PixelButton } from '@/components/ui/pixel-button'
import { PixelCard } from '@/components/ui/pixel-card'
import { Palette } from '@/constants/colors'
import { lamportsToSol } from '@/utils/lamports-to-sol'

/**
 * Royalties du gardien : cagnottes de ses lieux, lues on-chain, et le bouton
 * qui déclenche le split (60 % lui, 20 % trésorerie, 20 % likers récents).
 *
 * Aucune marketplace cNFT n'existe sur devnet : la cagnotte se remplit par
 * `deposit_royalty` — une vente secondaire simulée (`npm run deposit-royalty`)
 * en attendant le mainnet.
 */
export function RevenueCard({ places }: { places: string[] }) {
  const { t } = useTranslation()
  const royalties = useKeeperRoyalties(places)
  const { pending, distributed, treasury } = royalties.data
  const payable = royalties.data.places.filter((vault) => vault.pending > 0)
  const distributing = royalties.distribute.isPending

  return (
    <PixelCard accent="orange">
      <View style={styles.titleRow}>
        <AppText style={styles.title}>{t('keeper.revenue')}</AppText>
        {pending > 0 ? <AppText style={styles.tag}>{t('keeper.royaltiesPending')}</AppText> : null}
      </View>

      {pending > 0 ? (
        <>
          <AppText style={styles.amount}>{lamportsToSol(pending)} SOL</AppText>
          <AppText style={styles.body}>{t('keeper.royaltiesOnPlaces', { count: payable.length })}</AppText>
          <AppText style={styles.split}>{t('keeper.royaltiesSplit')}</AppText>
          <PixelButton
            title={distributing ? t('keeper.royaltiesDistributing') : t('keeper.royaltiesDistribute')}
            onPress={() => royalties.distribute.mutate()}
            disabled={distributing || treasury === null}
          />
          {treasury === null ? <AppText style={styles.warning}>{t('keeper.royaltiesNoTreasury')}</AppText> : null}
        </>
      ) : (
        <AppText style={styles.body}>{t('keeper.royaltiesNone')}</AppText>
      )}

      {distributed > 0 ? (
        <AppText style={styles.footer}>
          {t('keeper.royaltiesDistributed', { amount: lamportsToSol(distributed) })}
        </AppText>
      ) : null}

      {royalties.distribute.isError ? <AppText style={styles.warning}>{t('keeper.royaltiesError')}</AppText> : null}
    </PixelCard>
  )
}

const styles = StyleSheet.create({
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontFamily: PixelFont,
    fontSize: 10,
    color: Palette.orange,
  },
  tag: {
    fontFamily: PixelFont,
    fontSize: 8,
    color: Palette.orange,
  },
  amount: {
    fontFamily: PixelFont,
    fontSize: 18,
    color: Palette.orange,
  },
  body: {
    fontSize: 13,
    color: Palette.terracotta,
  },
  split: {
    fontSize: 12,
    color: Palette.terracotta,
  },
  footer: {
    fontSize: 12,
    color: Palette.terracotta,
  },
  warning: {
    fontSize: 12,
    color: Palette.coral,
  },
})
