use anchor_lang::prelude::*;

#[constant]
pub const PLACE_SEED: &[u8] = b"place";

#[constant]
pub const CONFIG_SEED: &[u8] = b"config";

#[constant]
pub const LIKE_SEED: &[u8] = b"like";

#[constant]
pub const KEEPER_STATS_SEED: &[u8] = b"keeper";

#[constant]
pub const VISIT_SEED: &[u8] = b"visit";

/// Délai minimal entre deux visites du même visiteur sur le même lieu :
/// on peut revenir demain, pas farmer en boucle devant la porte.
#[constant]
pub const VISIT_COOLDOWN_SECONDS: i64 = 86_400;

/// Bornes de la grille en 1e-4 degrés : ±90° de latitude, ±180° de longitude.
#[constant]
pub const MAX_LAT_E4: i32 = 900_000;

#[constant]
pub const MAX_LNG_E4: i32 = 1_800_000;

#[constant]
pub const VAULT_SEED: &[u8] = b"vault";

#[constant]
pub const TREASURY_SEED: &[u8] = b"treasury";

/// Taille du ring buffer des « likers récents » d'un lieu : seuls les
/// 10 derniers likes encore actifs se partagent leur part des royalties.
/// Un tableau de taille fixe, pas une liste : le compte doit avoir une
/// taille connue au moment où le premier like le crée.
pub const RECENT_LIKERS: usize = 10;

/// Split des royalties en points de base : gardien / trésorerie / likers
/// récents. Les arrondis et, quand le lieu n'a aucun liker actif, la part
/// likers, reviennent au gardien.
#[constant]
pub const KEEPER_SHARE_BPS: u64 = 6_000;

#[constant]
pub const TREASURY_SHARE_BPS: u64 = 2_000;

#[constant]
pub const LIKERS_SHARE_BPS: u64 = 2_000;

#[constant]
pub const BPS_DENOMINATOR: u64 = 10_000;

const _: () =
    assert!(KEEPER_SHARE_BPS + TREASURY_SHARE_BPS + LIKERS_SHARE_BPS == BPS_DENOMINATOR);
