# CLOCK IN — demo video script

**Target: 2 min 30 s, 3 min max.** The rules set no length. A jury watching dozens of
videos rewards the ones that show the product in the first 10 seconds.

Language: English voice-over, recorded **after** the screen capture (easier than talking
while tapping). The app itself runs in English (Settings → Language) for the whole shoot.

## Before shooting (the day before)

The film needs states that take time to build. Prepare them in advance, not live:

- [ ] **Wallet A = a dedicated demo account** in the Seed Vault, never your main
      account. A Seed Vault account has the same address on every cluster, so filming
      it would expose a wallet that has mainnet activity. It is the keeper of a
      confirmed place, and SKR-backed if it has at least 1,000 SKR staked. The main
      character.
- [ ] **Capture the demo places away from home.** Every place shows its position,
      its photo and its keeper's name.
- [ ] **Wallet B = a second demo account**, which has not visited the place you will film in the last
      24 h. The on-chain cooldown blocks visits for 24 h: check that the *Prove my visit* button
      is active before filming.
- [ ] A **spot to capture** at least 50 m from any existing place, outdoors, with a
      clear sky for GPS accuracy (≤ 25 m).
- [ ] A **pending royalty** on one of wallet A's places, deposited from the Mac:
      `EXPO_PUBLIC_PLACE_REGISTRY_PROGRAM=<id> PLACE=<lat,lng> AMOUNT=0.1 npm run deposit-royalty`
      (in `app/`). The *REVENUE* card must show a pot to distribute.
- [ ] A few likes from wallet B on wallet A's places, so the Activity feed is full.
- [ ] Phone: **Do Not Disturb** on, battery above 50 %, the same wallpaper and time
      across the takes, font size at the default.
- [ ] Seed Vault set to **Devnet** on both accounts.

## Shots

Timestamps are cumulative. **VO** = voice-over, **SCREEN** = what is filmed.

### 1. Hook — 0:00 → 0:12

- **SCREEN**: map, zoomed in on Montélimar, coral and teal markers. Tap a teal marker →
  nearby card with its pixel photo and the *CONFIRMED* badge.
- **VO**: *"PlaceKeepr is Strava for places. Stand somewhere, take a photo, and that spot
  becomes yours — on Solana."*

### 2. Capture — 0:12 → 0:50

- **SCREEN**: tap **Mint this place** → camera → photo → confirmation card (pixel
  preview, cell coordinates, ~0.0013 SOL fee) → **Mint** → Seed Vault sheet →
  fingerprint → celebration screen.
- **VO**: *"Capturing checks a fresh GPS fix and takes a camera-only photo. Before signing,
  our server verifies the location and co-signs the transaction — the program won't
  accept a place without that signature. One place per eleven-meter cell, enforced
  on-chain: first come, first kept. The place is minted as a compressed NFT, into a
  private tree only our verifier can mint into."*
- Tip: cut the wait between the fingerprint and the celebration screen in the edit.

### 3. Anti-spam — 0:50 → 1:05

- **SCREEN**: walk a few meters, tap **Mint this place** again → the 8-bit toast
  *"A place already exists 12 m away — visit it instead of minting next to it"* shows up **before** the camera
  opens.
- **VO**: *"You can't carpet a neighborhood: no capture within fifty meters of an existing
  place, and a daily limit per wallet. Near a place, you visit it."*

### 4. Visit and confirmation — 1:05 → 1:35

- **SCREEN**: switch to wallet B. Open a place of wallet A → full page → **👣 Prove my visit** →
  Seed Vault → the counter moves up. Then show a *CONFIRMED* place: amber badge,
  "2 distinct visitors came here".
- **VO**: *"Visiting is proof of presence — co-signed, once a day, never on your own
  place. When two different people have physically been there, the place is confirmed:
  proof of interest, verified by people who showed up. Zoom out, and the map only keeps
  confirmed places."*
- **SCREEN** (end of shot): pinch out → the *CONFIRMED ONLY* label appears and the
  unconfirmed teal markers disappear.

### 5. Keeper — 1:35 → 2:00

- **SCREEN**: back to wallet A → **Keeper** tab: reputation, rank, bar to the next rank,
  **SKR-BACKED** badge with "<N> SKR staked · 10 mints / day", grid with the amber
  border on the confirmed place. Then the **Activity** tab: likes, visits,
  *PLACE CONFIRMED*.
- **VO**: *"Likes and visits build your reputation and rank. And if you stake SKR on
  mainnet, you're SKR-backed: we read your stake, and your daily capture limit doubles.
  A stake is locked for forty-eight hours — you can't recycle it across fake wallets,
  so SKR makes spam expensive."*

### 6. Royalties — 2:00 → 2:20

- **SCREEN**: *REVENUE* card → pending pot → **Distribute** → Seed Vault → the pot drops
  to zero and the keeper balance goes up.
- **VO**: *"Every place has an on-chain royalty vault. When a place NFT sells, the
  program splits it: sixty percent to the keeper, twenty to the treasury, twenty to its
  most recent likers. Anyone can trigger it; nobody can redirect it."*

### 7. Close — 2:20 → 2:30

- **SCREEN**: map zoomed out, confirmed places, the PLACEKEEPR logo in the status bar.
- **VO**: *"PlaceKeepr. Go out, capture places, keep them. Built for Seeker."*

## Shooting

- **Screen**: Android's built-in screen recorder (quick settings), with **no** audio
  (the VO is added on top). Avoid `adb shell screenrecord`: it stops after 3 min and
  drops frames on long animations.
- **Outdoor shots** (capture, visit): film the phone's screen only. Sunlight makes the
  screen hard to read on a video of the device itself.
- One continuous take per shot. Editing (CapCut, DaVinci Resolve or iMovie): cut the
  waiting times, keep the 8-bit sounds and transitions short.
- Export 1080 × 2400 (portrait) **and** a 16:9 version with the phone centered on a
  cream background (`#fff2e0`, the app's color), because some submission platforms
  crop portrait video.
- Subtitles: burn in the VO. Many jurors watch without sound.

## What the video must prove

The official criteria are *stickiness and product-market fit*, *user experience*,
*innovation* and *presentation*. Each shot answers one of them:

| Criterion | Shot |
| --- | --- |
| Stickiness | 4 (visit, confirmation) + 5 (rank, activity): reasons to come back |
| UX | 2 (capture in 3 taps) + 3 (8-bit toast before the camera) |
| Innovation | 2 (verifier co-signature, private tree) + 5 (SKR as anti-sybil) + 6 (royalties split in the program) |
| Presentation | the whole thing, under 3 min |
