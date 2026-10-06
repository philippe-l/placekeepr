import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Localization from 'expo-localization'
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { en } from './en'
import { fr } from './fr'

const STORAGE_KEY = 'placekeepr:language'

export const SUPPORTED_LANGUAGES = [
  { code: 'fr', label: 'Français' },
  { code: 'en', label: 'English' },
] as const

export type AppLanguage = (typeof SUPPORTED_LANGUAGES)[number]['code']

// Langue du device par défaut ; un choix fait dans les réglages la remplace.
const deviceLanguage = Localization.getLocales()[0]?.languageCode ?? 'en'

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    fr: { translation: fr },
  },
  lng: deviceLanguage,
  fallbackLng: 'en',
  interpolation: {
    // React échappe déjà — sinon les apostrophes françaises sortent en &#39;.
    escapeValue: false,
  },
})

// Application asynchrone du choix persisté : un bref flash de la langue
// device peut précéder, acceptable tant qu'il n'y a pas d'écran de chargement.
AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
  if (stored && stored !== i18n.language) {
    i18n.changeLanguage(stored)
  }
})

export async function setAppLanguage(language: AppLanguage): Promise<void> {
  await i18n.changeLanguage(language)
  await AsyncStorage.setItem(STORAGE_KEY, language)
}

export default i18n
