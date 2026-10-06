import { ScrollView, StyleSheet } from 'react-native'
import { SettingsUiCluster } from '@/components/settings/settings-ui-cluster'
import { AppText } from '@/components/app-text'
import { SettingsAppConfig } from '@/components/settings/settings-app-config'
import { SettingsUiAccount } from '@/components/settings/settings-ui-account'
import { SettingsUiProfile } from '@/components/settings/settings-ui-profile'
import { SettingsUiLanguage } from '@/components/settings/settings-ui-language'

import { AppPage } from '@/components/app-page'

/**
 * `AppPage` ne défile pas (flex: 1, pas de ScrollView) et `flexShrink` vaut 0
 * par défaut en RN : l'écran tenait de justesse à cinq blocs, le bloc Profil
 * l'a fait déborder et les blocs du bas passaient hors écran. D'où ce
 * ScrollView — même correctif que sur les fiches de la carte le 16/09/2026.
 */
export default function TabSettingsScreen() {
  return (
    <AppPage>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <SettingsUiAccount />
        <SettingsUiProfile />
        <SettingsUiLanguage />
        <SettingsAppConfig />
        <SettingsUiCluster />
        <AppText type="default" style={{ opacity: 0.5, fontSize: 14 }}>
          Configure app info and clusters in{' '}
          <AppText type="defaultSemiBold" style={{ fontSize: 14 }}>
            constants/app-config.tsx
          </AppText>
          .
        </AppText>
      </ScrollView>
    </AppPage>
  )
}

const styles = StyleSheet.create({
  content: {
    gap: 16,
    // Le clavier ouvert sur le champ pseudo ne doit pas masquer « Signer ».
    paddingBottom: 32,
  },
})
