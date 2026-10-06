import React from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { useMobileWallet } from '@wallet-ui/react-native-web3js'
import { AppText } from '@/components/app-text'
import { Cluster } from '@/components/cluster/cluster'

export function ClusterUiVersion({ selectedCluster }: { selectedCluster: Cluster }) {
  const { t } = useTranslation()
  const { connection } = useMobileWallet()
  const query = useQuery({
    queryKey: ['get-version', { selectedCluster }],
    queryFn: () =>
      connection.getVersion().then((version) => {
        return {
          core: version['solana-core'],
          features: version['feature-set'],
        }
      }),
  })

  return (
    <AppText>
      Version: {query.isLoading ? t('common.loading') : `${query.data?.core} (${query.data?.features})`}
    </AppText>
  )
}
