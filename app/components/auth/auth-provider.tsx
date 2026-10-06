import { createContext, type PropsWithChildren, use, useEffect, useMemo, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { SignInOutput, useMobileWallet } from '@wallet-ui/react-native-web3js'
import { AppConfig } from '@/constants/app-config'
import { useMutation } from '@tanstack/react-query'

export interface AuthState {
  isAuthenticated: boolean
  /**
   * `true` tant qu'on ignore encore s'il y a un compte à restaurer. Sans ça,
   * l'écran de connexion s'afficherait une fraction de seconde à chaque
   * lancement, avant que le cache du wallet ne remonte le compte.
   */
  isRestoring: boolean
  signIn: () => Promise<SignInOutput>
  signOut: () => Promise<void>
}

const Context = createContext<AuthState>({} as AuthState)

/**
 * Clé par défaut du cache d'autorisation de `@wallet-ui/react-native-web3js`
 * (`createAsyncStorageCache()`). On la lit pour une seule raison : son store
 * expose `accounts: null` aussi bien pendant la restauration qu'après une
 * déconnexion, ce qui rend les deux états indiscernables au lancement.
 */
const AUTHORIZATION_CACHE_KEY = 'authorization-cache'

/** Filet : si le cache existe mais ne remonte jamais, on cesse d'attendre. */
const RESTORE_TIMEOUT_MS = 3_000

export function useAuth() {
  const value = use(Context)
  if (!value) {
    throw new Error('useAuth must be wrapped in a <AuthProvider />')
  }

  return value
}

function useSignInMutation() {
  const { signIn } = useMobileWallet()

  return useMutation({
    mutationFn: async () =>
      await signIn({
        uri: AppConfig.uri,
      }),
  })
}

function useIsRestoring(isAuthenticated: boolean) {
  const [isRestoring, setIsRestoring] = useState(true)

  useEffect(() => {
    let cancelled = false
    const done = () => {
      if (!cancelled) {
        setIsRestoring(false)
      }
    }
    const timer = setTimeout(done, RESTORE_TIMEOUT_MS)
    AsyncStorage.getItem(AUTHORIZATION_CACHE_KEY)
      // Rien en cache : il n'y a aucun compte à attendre.
      .then((cached) => (cached ? undefined : done()))
      .catch(done)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [])

  useEffect(() => {
    // Compte remonté : la restauration est finie. Une déconnexion ultérieure
    // ne doit jamais rouvrir cette parenthèse, sinon l'écran de connexion
    // n'apparaîtrait plus.
    if (isAuthenticated) {
      setIsRestoring(false)
    }
  }, [isAuthenticated])

  return isRestoring
}

export function AuthProvider({ children }: PropsWithChildren) {
  const { accounts, disconnect } = useMobileWallet()
  const signInMutation = useSignInMutation()
  const isAuthenticated = (accounts?.length ?? 0) > 0
  const isRestoring = useIsRestoring(isAuthenticated)

  const value: AuthState = useMemo(
    () => ({
      signIn: async () => await signInMutation.mutateAsync(),
      signOut: async () => await disconnect(),
      isAuthenticated,
      isRestoring,
    }),
    [disconnect, isAuthenticated, isRestoring, signInMutation],
  )

  return <Context value={value}>{children}</Context>
}
