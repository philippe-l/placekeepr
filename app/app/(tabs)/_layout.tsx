import { Tabs } from 'expo-router'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { PixelFont } from '@/components/app-theme'
import { UiIconSymbol } from '@/components/ui/ui-icon-symbol'
import { useThemeColor } from '@/hooks/use-theme-color'

/**
 * Trois onglets (décision 1a du handoff design) : le visiteur vit sur la
 * Carte, le gardien sur son profil, l'Activité relie les deux. Le wallet
 * hérité du template est dissous dans Gardien, les réglages derrière
 * l'engrenage de son en-tête.
 */
export default function TabLayout() {
  const { t } = useTranslation()
  const border = useThemeColor('border')
  const background = useThemeColor('background')
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarLabelStyle: { fontFamily: PixelFont, fontSize: 8 },
        tabBarStyle: { backgroundColor: background, borderTopWidth: 3, borderTopColor: border },
      }}
    >
      {/* The index redirects to the map screen */}
      <Tabs.Screen name="index" options={{ tabBarItemStyle: { display: 'none' } }} />
      <Tabs.Screen
        name="map"
        options={{
          title: t('tabs.map'),
          tabBarIcon: ({ color }) => <UiIconSymbol size={28} name="map.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="activity"
        options={{
          title: t('tabs.activity'),
          tabBarIcon: ({ color }) => <UiIconSymbol size={28} name="bolt.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="keeper"
        options={{
          title: t('tabs.keeper'),
          tabBarIcon: ({ color }) => <UiIconSymbol size={28} name="star.fill" color={color} />,
        }}
      />
    </Tabs>
  )
}
