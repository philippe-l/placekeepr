pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use instructions::*;
pub use state::*;

declare_id!("EXB4PeyChBveaChFW5nGTqJ2DmNp292cRFo4Ks1aC9pU");

#[program]
pub mod place_registry {
    use super::*;

    /// Crée le PDA de config (une seule fois, au déploiement).
    /// L'admin = le signataire ; il pourra faire tourner le vérifieur.
    pub fn initialize_config(ctx: Context<InitializeConfig>, verifier: Pubkey) -> Result<()> {
        crate::instructions::initialize_config::handle_initialize_config(ctx, verifier)
    }

    /// Pose ou fait tourner le destinataire de la part trésorerie du split
    /// des royalties (admin seulement). Hors du PDA Config, déjà déployé.
    pub fn set_treasury(ctx: Context<SetTreasury>, destination: Pubkey) -> Result<()> {
        crate::instructions::set_treasury::handle_set_treasury(ctx, destination)
    }

    /// Rotation du keypair vérifieur (admin seulement).
    pub fn set_verifier(ctx: Context<SetVerifier>, verifier: Pubkey) -> Result<()> {
        crate::instructions::set_verifier::handle_set_verifier(ctx, verifier)
    }

    /// Enregistre une cellule de la grille (~11 m) au nom du signataire,
    /// avec co-signature obligatoire du vérifieur (serveur de vérif GPS).
    /// À émettre dans la même transaction que le mintV2 Bubblegum :
    /// cellule déjà prise → `init` échoue → toute la tx échoue.
    pub fn register_place(ctx: Context<RegisterPlace>, lat_e4: i32, lng_e4: i32) -> Result<()> {
        crate::instructions::register_place::handle_register_place(ctx, lat_e4, lng_e4)
    }

    /// Like d'un visiteur sur un lieu : crée le PDA Like (unicité par
    /// couple lieu/likeur) et incrémente la réputation du gardien.
    /// Pas de co-signature vérifieur : liker à distance est voulu.
    pub fn like_place(ctx: Context<LikePlace>) -> Result<()> {
        crate::instructions::like_place::handle_like_place(ctx)
    }

    /// Retrait d'un like : ferme le PDA (rent remboursé au likeur) et
    /// décrémente la réputation du gardien.
    pub fn unlike_place(ctx: Context<UnlikePlace>) -> Result<()> {
        crate::instructions::unlike_place::handle_unlike_place(ctx)
    }

    /// Fermeture administrative d'un lieu (admin seulement) : outil de reset
    /// devnet / modération, rent rendu au gardien. La cellule redevient libre.
    pub fn close_place(ctx: Context<ClosePlace>) -> Result<()> {
        crate::instructions::close_place::handle_close_place(ctx)
    }

    /// Fermeture administrative d'un like (admin seulement) : mêmes effets
    /// qu'un unlike (rent au likeur, réputation décrémentée). À exécuter
    /// avant close_place sur le lieu concerné.
    pub fn close_like(ctx: Context<CloseLike>) -> Result<()> {
        crate::instructions::close_like::handle_close_like(ctx)
    }

    /// Visite vérifiée d'un lieu : présence physique co-signée par le
    /// vérifieur (GPS ≤ 50 m de la cellule). Crée ou incrémente le PDA
    /// Visit du couple (lieu, visiteur), cooldown 24 h on-chain, et
    /// incrémente les visites reçues du gardien.
    pub fn visit_place(ctx: Context<VisitPlace>) -> Result<()> {
        crate::instructions::visit_place::handle_visit_place(ctx)
    }

    /// Fermeture administrative d'un compte de visites (admin seulement) :
    /// rent au visiteur, réputation décrémentée de tous les passages.
    /// À exécuter avant close_place sur le lieu concerné.
    pub fn close_visit(ctx: Context<CloseVisit>) -> Result<()> {
        crate::instructions::close_visit::handle_close_visit(ctx)
    }

    /// Dépôt de royalties dans la cagnotte d'un lieu (PDA vault), par
    /// n'importe qui : marketplace qui reverse, ou dépôt de démo. Crée la
    /// cagnotte au premier passage.
    pub fn deposit_royalty(ctx: Context<DepositRoyalty>, amount: u64) -> Result<()> {
        crate::instructions::deposit_royalty::handle_deposit_royalty(ctx, amount)
    }

    /// Distribue la cagnotte d'un lieu : 60 % gardien, 20 % trésorerie,
    /// 20 % partagés entre les likers récents encore actifs (aucun : tout
    /// au gardien). Permissionless — la destination est déterminée par la
    /// chaîne, pas par l'appelant. Likeurs en remaining_accounts, dans
    /// l'ordre du ring buffer.
    pub fn distribute_royalties<'info>(
        ctx: Context<'info, DistributeRoyalties<'info>>,
    ) -> Result<()> {
        crate::instructions::distribute_royalties::handle_distribute_royalties(ctx)
    }

    /// Fermeture administrative d'une cagnotte (admin seulement) : rent et
    /// solde non distribué au gardien, sans split. À exécuter avant
    /// close_place sur le lieu concerné.
    pub fn close_place_vault(ctx: Context<ClosePlaceVault>) -> Result<()> {
        crate::instructions::close_place_vault::handle_close_place_vault(ctx)
    }

    /// Fermeture administrative d'un compte de réputation (admin seulement) :
    /// outil de reset devnet, tolère le layout legacy d'avant
    /// `visits_received`. Rent rendu au gardien.
    pub fn close_keeper_stats(ctx: Context<CloseKeeperStats>) -> Result<()> {
        crate::instructions::close_keeper_stats::handle_close_keeper_stats(ctx)
    }
}
