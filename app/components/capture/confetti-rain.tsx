import React, { useEffect, useRef } from 'react'
import { Animated, Easing, useWindowDimensions } from 'react-native'
import { Palette } from '@/constants/colors'

/**
 * Confettis pixel (handoff design 4.3) : carrés aux couleurs sunset tombant
 * en boucle. Animated core, translate/rotate seulement — RN-safe, pas de blur.
 */
const COLORS = [Palette.coral, Palette.teal, Palette.amber, Palette.cream, Palette.orange]
const COUNT = 28

interface Flake {
  x: number
  size: number
  color: string
  duration: number
  delay: number
  drift: number
}

export function ConfettiRain() {
  const { width, height } = useWindowDimensions()
  const flakes = useRef<Flake[]>(
    Array.from({ length: COUNT }, (_, i) => ({
      x: Math.random() * width,
      size: 6 + Math.round(Math.random() * 6),
      color: COLORS[i % COLORS.length],
      duration: 2600 + Math.random() * 2600,
      delay: Math.random() * 2200,
      drift: (Math.random() - 0.5) * 80,
    })),
  ).current

  return (
    <>
      {flakes.map((flake, index) => (
        <FallingFlake key={index} flake={flake} height={height} />
      ))}
    </>
  )
}

function FallingFlake({ flake, height }: { flake: Flake; height: number }) {
  const progress = useRef(new Animated.Value(0)).current

  useEffect(() => {
    const animation = Animated.sequence([
      Animated.delay(flake.delay),
      Animated.loop(
        Animated.timing(progress, {
          toValue: 1,
          duration: flake.duration,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      ),
    ])
    animation.start()
    return () => animation.stop()
  }, [progress, flake])

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: 0,
        left: flake.x,
        width: flake.size,
        height: flake.size,
        backgroundColor: flake.color,
        transform: [
          { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [-40, height + 40] }) },
          { translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [0, flake.drift] }) },
          { rotate: progress.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) },
        ],
      }}
    />
  )
}
