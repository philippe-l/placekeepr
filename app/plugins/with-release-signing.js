/**
 * Signature release + architectures, injectées au prebuild : `android/` est
 * généré (CNG) et ne s'édite jamais à la main.
 *
 * Signature : la clé release vit HORS du repo (~/.config/placekeepr/, mot de
 * passe dans le Trousseau macOS « placekeepr-release-keystore »). Gradle lit
 * son emplacement et ses mots de passe dans ~/.gradle/gradle.properties :
 *   PLACEKEEPR_RELEASE_STORE_FILE, PLACEKEEPR_RELEASE_KEY_ALIAS,
 *   PLACEKEEPR_RELEASE_STORE_PASSWORD, PLACEKEEPR_RELEASE_KEY_PASSWORD.
 * Sans ces propriétés (CI, autre machine), le release retombe sur la clé de
 * debug : le build passe, mais l'APK n'est PAS publiable.
 *
 * ⚠️ Cette clé est l'identité de l'app sur le dApp Store : toute mise à jour
 * doit être signée par elle. La perdre = ne plus jamais pouvoir mettre l'app
 * à jour. Distincte de toute clé Google Play (exigence Solana Mobile).
 *
 * Architectures : arm64-v8a seulement (Seeker et quasi tous les téléphones
 * récents). L'APK universel à 4 ABI pesait 185 Mo.
 */
const { withAppBuildGradle, withGradleProperties } = require('expo/config-plugins')

const RELEASE_CONFIG = `
        release {
            if (project.hasProperty('PLACEKEEPR_RELEASE_STORE_FILE')) {
                storeFile file(PLACEKEEPR_RELEASE_STORE_FILE)
                storePassword PLACEKEEPR_RELEASE_STORE_PASSWORD
                keyAlias PLACEKEEPR_RELEASE_KEY_ALIAS
                keyPassword PLACEKEEPR_RELEASE_KEY_PASSWORD
            }
        }`

function withReleaseSigning(config) {
  config = withAppBuildGradle(config, (mod) => {
    let gradle = mod.modResults.contents
    if (gradle.includes('PLACEKEEPR_RELEASE_STORE_FILE')) {
      return mod // déjà appliqué (prebuild relancé sans --clean)
    }
    const debugBlock = /(signingConfigs\s*\{\s*debug\s*\{[^}]*\})/
    const releaseUsesDebug = /(release\s*\{[^}]*?)signingConfig signingConfigs\.debug/
    if (!debugBlock.test(gradle) || !releaseUsesDebug.test(gradle)) {
      // Gabarit Expo changé : échouer bruyamment plutôt que livrer un APK
      // signé en debug sans le savoir.
      throw new Error('with-release-signing : build.gradle inattendu, plugin à mettre à jour')
    }
    gradle = gradle.replace(debugBlock, `$1${RELEASE_CONFIG}`)
    gradle = gradle.replace(
      releaseUsesDebug,
      "$1signingConfig project.hasProperty('PLACEKEEPR_RELEASE_STORE_FILE') ? signingConfigs.release : signingConfigs.debug",
    )
    mod.modResults.contents = gradle
    return mod
  })

  return withGradleProperties(config, (mod) => {
    mod.modResults = mod.modResults.filter(
      (item) => !(item.type === 'property' && item.key === 'reactNativeArchitectures'),
    )
    mod.modResults.push({ type: 'property', key: 'reactNativeArchitectures', value: 'arm64-v8a' })
    return mod
  })
}

module.exports = withReleaseSigning
