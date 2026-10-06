use anchor_lang::prelude::*;

use crate::constants::RECENT_LIKERS;

/// Registre d'un lieu : un PDA par cellule de la grille (4 décimales ≈ 11 m,
/// même précision que `placeSlug` côté app). L'unicité on-chain vient du
/// `init` : une cellule déjà enregistrée fait échouer la transaction entière
/// — donc aussi le mintV2 Bubblegum qui l'accompagne dans la même tx.
/// Config du programme : qui a le droit de co-signer les enregistrements.
/// PDA unique ["config"], initialisé au déploiement par le wallet dev.
#[account]
#[derive(InitSpace)]
pub struct Config {
    /// Autorité de rotation du vérifieur.
    pub admin: Pubkey,
    /// Keypair serveur (edge function verify-capture) exigé comme
    /// co-signataire de chaque register_place.
    pub verifier: Pubkey,
    pub bump: u8,
}

/// Un like d'un visiteur sur un lieu : un PDA par couple (lieu, likeur),
/// l'unicité vient du `init` — impossible de liker deux fois. `liked_at`
/// alimente la fenêtre « likers récents » du split royalties (Phase 4).
/// Fermé (rent remboursé au likeur) par `unlike_place`.
#[account]
#[derive(InitSpace)]
pub struct Like {
    pub liker: Pubkey,
    pub place: Pubkey,
    /// Horodatage on-chain du like (Clock).
    pub liked_at: i64,
    pub bump: u8,
}

/// Réputation agrégée d'un gardien : un PDA par wallet gardien, créé au
/// premier like ou à la première visite reçus (payé par l'émetteur).
/// Compteurs bruts maintenus par like/unlike/visit — la pondération
/// (visite = 2 × like) se calcule à l'affichage, pas ici : changer le
/// barème ne demande aucune migration.
#[account]
#[derive(InitSpace)]
pub struct KeeperStats {
    pub keeper: Pubkey,
    pub likes_received: u64,
    pub visits_received: u64,
    pub bump: u8,
}

/// Visites d'un visiteur sur un lieu : un PDA par couple (lieu, visiteur),
/// créé à la première visite puis réutilisé (le rent n'est payé qu'une fois).
/// `last_visited_at` porte le cooldown on-chain (24 h) ; l'historique
/// détaillé de chaque passage vit dans le miroir Supabase via l'indexer.
#[account]
#[derive(InitSpace)]
pub struct Visit {
    pub visitor: Pubkey,
    pub place: Pubkey,
    /// Nombre total de passages vérifiés.
    pub count: u64,
    /// Horodatage on-chain du dernier passage (Clock).
    pub last_visited_at: i64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Place {
    /// Premier wallet à avoir capturé la cellule — le gardien.
    pub keeper: Pubkey,
    /// Latitude en 1e-4 degrés (±900_000).
    pub lat_e4: i32,
    /// Longitude en 1e-4 degrés (±1_800_000).
    pub lng_e4: i32,
    /// Horodatage on-chain de l'enregistrement (Clock).
    pub registered_at: i64,
    pub bump: u8,
}

/// Destinataire de la part « trésorerie » du split des royalties.
/// PDA unique ["treasury"], posé et rotatif par l'admin (`set_treasury`).
/// Volontairement hors du PDA Config : celui-ci est déjà déployé en devnet
/// avec son layout, et lui ajouter un champ ferait échouer la
/// désérialisation de register_place/visit_place jusqu'à ce qu'une
/// migration soit passée — une fenêtre où l'app ne capture plus rien.
#[account]
#[derive(InitSpace)]
pub struct Treasury {
    /// Wallet qui encaisse la part trésorerie — pas forcément l'admin.
    pub destination: Pubkey,
    pub bump: u8,
}

/// Cagnotte de royalties d'un lieu : PDA ["vault", place], à la fois le
/// compte qui détient les lamports et le porteur du ring buffer des
/// « likers récents ».
///
/// C'est l'adresse de ce PDA qui part dans le `creators[]` du cNFT, en
/// créateur unique non vérifié : le `creators[]` Bubblegum est figé au mint
/// et ne peut donc pas porter un split dont la composition change à chaque
/// like. Le split est fait ici, à la distribution.
///
/// Créé paresseusement au premier like ou au premier dépôt, jamais à
/// l'enregistrement du lieu : une seconde instruction place_registry dans
/// la transaction de capture ferait refuser la co-signature du vérifieur
/// (règle de l'instruction unique, `server/src/cosign.ts`).
#[account]
#[derive(InitSpace)]
pub struct PlaceVault {
    pub place: Pubkey,
    /// Ring buffer des derniers likeurs ; une case à zéro = like retiré.
    pub recent_likers: [Pubkey; RECENT_LIKERS],
    /// Nombre de cases déjà écrites, plafonné à RECENT_LIKERS. Compte les
    /// cases occupées un jour, pas les likes actifs.
    pub recent_len: u8,
    /// Prochaine case à écrire.
    pub cursor: u8,
    /// Cumul distribué depuis ce vault (comptabilité, affichage app).
    pub total_distributed: u64,
    pub bump: u8,
}

impl PlaceVault {
    /// Pousse un likeur ; une fois le tour fait, le plus ancien sort.
    pub fn push_liker(&mut self, liker: Pubkey) {
        let slot = (self.cursor as usize) % RECENT_LIKERS;
        self.recent_likers[slot] = liker;
        self.cursor = ((slot + 1) % RECENT_LIKERS) as u8;
        if (self.recent_len as usize) < RECENT_LIKERS {
            self.recent_len += 1;
        }
    }

    /// Retire un likeur du buffer (case remise à zéro). `recent_len` ne
    /// bouge pas : il compte les cases écrites. Sans ce retrait, liker puis
    /// unliker — rent remboursé — garderait une part de royalties acquise.
    pub fn remove_liker(&mut self, liker: &Pubkey) -> bool {
        for slot in self.recent_likers.iter_mut() {
            if *slot == *liker {
                *slot = Pubkey::default();
                return true;
            }
        }
        false
    }

    /// Likeurs encore actifs, dans l'ordre du buffer — l'ordre exact dans
    /// lequel la distribution attend les comptes.
    pub fn active_likers(&self) -> impl Iterator<Item = &Pubkey> {
        self.recent_likers[..self.recent_len as usize]
            .iter()
            .filter(|liker| **liker != Pubkey::default())
    }
}
