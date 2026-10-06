import { PropsWithChildren } from 'react'
import { DefaultTheme as NavigationLight, Theme, ThemeProvider } from '@react-navigation/native'
import { Colors } from '@/constants/colors'

export const PixelFont = 'PressStart2P_400Regular'
// Corps de texte et labels (règle typo du handoff design : jamais de Press
// Start en paragraphe). Le « semi-bold » est la graisse Medium — pas de
// fontWeight synthétique sur une fonte custom Android.
export const BodyFont = 'DMMono_400Regular'
export const BodyFontMedium = 'DMMono_500Medium'

// UI mono-thème sunset : pas de variante dark (la carte, elle, reste sombre).
const pixelTheme: Theme = {
  ...NavigationLight,
  colors: {
    ...NavigationLight.colors,
    primary: Colors.tint,
    background: Colors.background,
    card: Colors.background,
    text: Colors.text,
    border: Colors.border,
    notification: Colors.danger,
  },
}

export function useAppTheme() {
  return { theme: pixelTheme }
}

export function AppTheme({ children }: PropsWithChildren) {
  const { theme } = useAppTheme()

  return <ThemeProvider value={theme}>{children}</ThemeProvider>
}
