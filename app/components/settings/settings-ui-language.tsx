import { useTranslation } from 'react-i18next'
import { AppDropdown } from '@/components/app-dropdown'
import { AppText } from '@/components/app-text'
import { AppView } from '@/components/app-view'
import { SUPPORTED_LANGUAGES, setAppLanguage } from '@/i18n'

export function SettingsUiLanguage() {
  const { t, i18n } = useTranslation()
  const selected = SUPPORTED_LANGUAGES.find((language) => i18n.language.startsWith(language.code))

  return (
    <AppView>
      <AppText type="subtitle">{t('settings.language')}</AppText>
      <AppDropdown
        items={SUPPORTED_LANGUAGES.map((language) => language.label)}
        selectedItem={selected?.label ?? SUPPORTED_LANGUAGES[0].label}
        selectItem={(label) => {
          const language = SUPPORTED_LANGUAGES.find((candidate) => candidate.label === label)
          if (language) {
            setAppLanguage(language.code)
          }
        }}
      />
    </AppView>
  )
}
