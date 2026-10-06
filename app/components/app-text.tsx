import { StyleSheet, Text, type TextProps } from 'react-native'
import { BodyFont, BodyFontMedium, PixelFont } from '@/components/app-theme'
import { useThemeColor } from '@/hooks/use-theme-color'

export type AppTextProps = TextProps & {
  type?: 'default' | 'title' | 'defaultSemiBold' | 'subtitle' | 'link'
}

// Press Start 2P est illisible en petit : réservée aux titres et sous-titres,
// le corps de texte est en DM Mono (règle typo du handoff design).
export function AppText({ style, type = 'default', ...rest }: AppTextProps) {
  const color = useThemeColor('text')
  const tint = useThemeColor('tint')

  return (
    <Text
      style={[
        { color },
        type === 'default' ? styles.default : undefined,
        type === 'title' ? styles.title : undefined,
        type === 'defaultSemiBold' ? styles.defaultSemiBold : undefined,
        type === 'subtitle' ? styles.subtitle : undefined,
        type === 'link' ? [styles.link, { color: tint }] : undefined,
        style,
      ]}
      {...rest}
    />
  )
}

const styles = StyleSheet.create({
  default: {
    fontFamily: BodyFont,
    fontSize: 16,
    lineHeight: 24,
  },
  defaultSemiBold: {
    fontFamily: BodyFontMedium,
    fontSize: 16,
    lineHeight: 24,
  },
  title: {
    fontFamily: PixelFont,
    fontSize: 22,
    lineHeight: 34,
  },
  subtitle: {
    fontFamily: PixelFont,
    fontSize: 13,
    lineHeight: 22,
  },
  link: {
    fontFamily: BodyFont,
    lineHeight: 30,
    fontSize: 16,
  },
})
