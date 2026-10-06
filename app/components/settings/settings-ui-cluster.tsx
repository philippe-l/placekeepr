import { AppText } from '@/components/app-text'
import { useCluster } from '../cluster/cluster-provider'
import { ClusterUiVersion } from '@/components/cluster/cluster-ui-version'
import { AppDropdown } from '@/components/app-dropdown'
import { ClusterUiGenesisHash } from '@/components/cluster/cluster-ui-genesis-hash'
import { AppView } from '@/components/app-view'
import { useTranslation } from 'react-i18next'

export function SettingsUiCluster() {
  const { t } = useTranslation()
  const { selectedCluster, clusters, setSelectedCluster } = useCluster()
  return (
    <AppView>
      <AppText type="subtitle">{t('settings.cluster')}</AppText>
      <ClusterUiVersion selectedCluster={selectedCluster} />
      <ClusterUiGenesisHash selectedCluster={selectedCluster} />
      <AppDropdown
        items={clusters.map((c) => c.name)}
        selectedItem={selectedCluster.name}
        selectItem={(name) => setSelectedCluster(clusters.find((c) => c.name === name)!)}
      />
    </AppView>
  )
}
