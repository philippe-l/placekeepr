import { useMobileWallet } from '@wallet-ui/react-native-web3js'
import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, StyleSheet, TextInput, View } from 'react-native'
import { AppText } from '@/components/app-text'
import { AppView } from '@/components/app-view'
import { BodyFont } from '@/components/app-theme'
import { pickAvatarImage, uploadAvatar } from '@/components/profile/avatar-asset'
import { DISPLAY_NAME } from '@/components/profile/profile-message'
import { ProfileAvatar } from '@/components/profile/profile-avatar'
import { useMyProfile, useSaveProfile } from '@/components/profile/use-my-profile'
import { PixelButton } from '@/components/ui/pixel-button'
import { Colors, Palette } from '@/constants/colors'
import { ProfileNameTaken } from '@/utils/backend'

/**
 * Pseudo + avatar du wallet connecté (Phase 4).
 *
 * Deux choses qui ne se voient pas à l'écran :
 *  - l'enregistrement demande une **signature de message** au wallet, pas une
 *    transaction — d'où « signer », et non « payer », dans le libellé ;
 *  - l'avatar est déposé **avant** la signature, parce que son chemin entre
 *    dans le message signé. Un avatar choisi puis abandonné laisse donc un
 *    orphelin dans le bucket, comme une capture abandonnée après upload.
 *    Nommage par le contenu : reprendre la même image ne l'aggrave pas.
 */
export function SettingsUiProfile() {
  const { t } = useTranslation()
  const { account } = useMobileWallet()
  const profile = useMyProfile()
  const save = useSaveProfile()

  // `undefined` = pas encore touché, on suit le serveur. Une string vide est
  // une saisie, pas une absence de saisie : il faut distinguer les deux pour
  // que le champ ne se réinitialise pas sous les doigts au premier refetch.
  const [draftName, setDraftName] = useState<string | undefined>(undefined)
  const [draftAvatar, setDraftAvatar] = useState<string | null | undefined>(undefined)
  const [uploading, setUploading] = useState(false)
  const [avatarError, setAvatarError] = useState(false)

  if (!account) {
    return (
      <AppView>
        <AppText type="subtitle">{t('settings.profile')}</AppText>
        <AppText>{t('common.connectWallet')}</AppText>
      </AppView>
    )
  }

  const savedName = profile.data?.displayName ?? ''
  const savedAvatar = profile.data?.avatarPath ?? null
  const name = draftName ?? savedName
  const avatarPath = draftAvatar === undefined ? savedAvatar : draftAvatar

  const trimmed = name.trim()
  // Champ vide = retrait volontaire du pseudo, pas une saisie invalide.
  const nameValid = trimmed === '' || DISPLAY_NAME.test(trimmed)
  const changed = trimmed !== savedName || avatarPath !== savedAvatar
  const busy = save.isPending || uploading

  const onPickAvatar = async () => {
    setAvatarError(false)
    try {
      const uri = await pickAvatarImage()
      if (!uri) {
        return
      }
      setUploading(true)
      setDraftAvatar(await uploadAvatar(uri))
    } catch (error) {
      console.warn('[profile] avatar non déposé', error)
      setAvatarError(true)
    } finally {
      setUploading(false)
    }
  }

  const onSave = () => {
    save.mutate(
      { displayName: trimmed === '' ? null : trimmed, avatarPath },
      {
        onSuccess: () => {
          // Le serveur fait foi à partir d'ici : on relâche les brouillons.
          setDraftName(undefined)
          setDraftAvatar(undefined)
        },
      },
    )
  }

  return (
    <AppView>
      <AppText type="subtitle">{t('settings.profile')}</AppText>

      <View style={styles.identityRow}>
        <ProfileAvatar avatarPath={avatarPath} size={48} borderColor={Palette.plum} glyphColor={Palette.terracotta} />
        <View style={styles.identityActions}>
          <PixelButton
            title={t(avatarPath ? 'settings.avatarChange' : 'settings.avatarAdd')}
            variant="secondary"
            disabled={busy}
            onPress={() => void onPickAvatar()}
          />
          {avatarPath ? (
            <PixelButton
              title={t('settings.avatarRemove')}
              variant="secondary"
              disabled={busy}
              onPress={() => setDraftAvatar(null)}
            />
          ) : null}
        </View>
      </View>

      <AppText>{t('settings.displayName')}</AppText>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setDraftName}
        placeholder={t('settings.displayNamePlaceholder')}
        placeholderTextColor={Palette.terracotta}
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={20}
      />
      <AppText style={styles.hint}>{t('settings.displayNameRule')}</AppText>

      {!nameValid ? <AppText style={styles.error}>{t('settings.displayNameInvalid')}</AppText> : null}
      {avatarError ? <AppText style={styles.error}>{t('settings.avatarFailed')}</AppText> : null}
      {save.isError ? (
        <AppText style={styles.error}>
          {save.error instanceof ProfileNameTaken ? t('settings.displayNameTaken') : t('settings.profileFailed')}
        </AppText>
      ) : null}

      {busy ? (
        <ActivityIndicator />
      ) : (
        <PixelButton title={t('settings.profileSave')} disabled={!changed || !nameValid} onPress={onSave} />
      )}
    </AppView>
  )
}

const styles = StyleSheet.create({
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  identityActions: {
    flex: 1,
    gap: 8,
  },
  input: {
    fontFamily: BodyFont,
    fontSize: 15,
    color: Colors.text,
    backgroundColor: Colors.surface,
    // Pas d'arrondi : le champ suit le reste du thème 8-bit.
    borderWidth: 3,
    borderColor: Colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  hint: {
    fontSize: 12,
    color: Palette.terracotta,
  },
  error: {
    fontSize: 13,
    color: Palette.raspberry,
  },
})
