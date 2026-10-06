# PlaceKeepr — mobile app

Expo SDK 55 / React Native app for the Solana Seeker. See the [root README](../README.md)
for the product and the architecture, and [`CLAUDE.md`](../CLAUDE.md) for engineering
notes.

```bash
cp .env.example .env     # devnet by default
npm install
npm run android          # dev build (Mobile Wallet Adapter does not work in Expo Go)
npm run ci               # tsc + lint + format check + prebuild
```

Release build: `cd android && ./gradlew assembleRelease`. After changing any
`EXPO_PUBLIC_*` variable, delete `android/app/build/generated/assets/react/release`
first. Gradle does not watch `.env`, and would otherwise ship the previous JS bundle.
