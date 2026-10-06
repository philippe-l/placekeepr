import { Colors } from '@/constants/colors'

/**
 * UI mono-thème (palette sunset, cf. constants/colors.ts) : le hook résout
 * simplement un token sémantique. La carte garde son propre style sombre.
 */
export function useThemeColor(colorName: keyof typeof Colors) {
  return Colors[colorName]
}
