import { Link, Stack } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { StyleSheet } from 'react-native'

import { AppText } from '@/components/app-text'

import { AppView } from '@/components/app-view'

export default function NotFoundScreen() {
  const { t } = useTranslation()
  return (
    <>
      <Stack.Screen options={{ title: t('notFound.title') }} />
      <AppView style={styles.container}>
        <AppText type="title" style={{ textAlign: 'center' }}>
          {t('notFound.message')}
        </AppText>
        <Link href="/" style={styles.link}>
          <AppText type="link">{t('notFound.goHome')}</AppText>
        </Link>
      </AppView>
    </>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  link: {
    marginTop: 15,
    paddingVertical: 15,
  },
})
