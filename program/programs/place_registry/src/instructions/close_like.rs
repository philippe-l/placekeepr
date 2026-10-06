use anchor_lang::prelude::*;

use crate::{
    constants::*,
    error::ErrorCode,
    state::{Config, KeeperStats, Like, Place, PlaceVault},
};

/// Fermeture administrative d'un like (reset devnet, modération) : mêmes
/// effets qu'un unlike — rent rendu au likeur, réputation décrémentée — mais
/// signé par l'admin. À exécuter AVANT close_place sur le lieu concerné :
/// le compte Place est requis pour retrouver le gardien.
#[derive(Accounts)]
pub struct CloseLike<'info> {
    #[account(constraint = admin.key() == config.admin @ ErrorCode::Unauthorized)]
    pub admin: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    pub place: Account<'info, Place>,
    /// CHECK: simple destinataire du rent, contraint à être l'auteur du like.
    #[account(mut, address = like.liker @ ErrorCode::WrongLiker)]
    pub liker: UncheckedAccount<'info>,
    #[account(
        mut,
        close = liker,
        seeds = [LIKE_SEED, place.key().as_ref(), liker.key().as_ref()],
        bump = like.bump
    )]
    pub like: Account<'info, Like>,
    #[account(
        mut,
        seeds = [KEEPER_STATS_SEED, place.keeper.as_ref()],
        bump = keeper_stats.bump
    )]
    pub keeper_stats: Account<'info, KeeperStats>,
    /// Optionnel, comme pour unlike_place : sans ce retrait, un like fermé
    /// par l'admin resterait éligible au split royalties.
    #[account(
        mut,
        seeds = [VAULT_SEED, place.key().as_ref()],
        bump
    )]
    pub vault: Option<Account<'info, PlaceVault>>,
}

pub fn handle_close_like(ctx: Context<CloseLike>) -> Result<()> {
    let liker_key = ctx.accounts.like.liker;

    let stats = &mut ctx.accounts.keeper_stats;
    stats.likes_received = stats
        .likes_received
        .checked_sub(1)
        .ok_or(ErrorCode::ReputationUnderflow)?;

    if let Some(vault) = ctx.accounts.vault.as_mut() {
        vault.remove_liker(&liker_key);
    }

    msg!(
        "Like {} -> place {} closed by admin (keeper {}, total {})",
        ctx.accounts.like.liker,
        ctx.accounts.place.key(),
        stats.keeper,
        stats.likes_received
    );
    Ok(())
}
