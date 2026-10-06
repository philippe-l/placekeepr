use anchor_lang::prelude::*;

use crate::{
    constants::*,
    error::ErrorCode,
    state::{KeeperStats, Like, Place, PlaceVault},
};

#[derive(Accounts)]
pub struct UnlikePlace<'info> {
    #[account(mut)]
    pub liker: Signer<'info>,
    pub place: Account<'info, Place>,
    /// Les seeds garantissent que seul l'auteur du like peut le retirer ;
    /// `close` rembourse le rent au likeur.
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
    /// Optionnel : les lieux likés avant la Phase 4 n'ont pas de cagnotte, et
    /// leur unlike doit continuer de passer. Quand elle existe, retirer son
    /// like sort le likeur du ring buffer — sinon liker puis unliker, rent
    /// remboursé, laisserait une part de royalties acquise gratuitement.
    #[account(
        mut,
        seeds = [VAULT_SEED, place.key().as_ref()],
        bump
    )]
    pub vault: Option<Account<'info, PlaceVault>>,
}

pub fn handle_unlike_place(ctx: Context<UnlikePlace>) -> Result<()> {
    let liker_key = ctx.accounts.liker.key();
    let place_key = ctx.accounts.place.key();

    let stats = &mut ctx.accounts.keeper_stats;
    stats.likes_received = stats
        .likes_received
        .checked_sub(1)
        .ok_or(ErrorCode::ReputationUnderflow)?;
    let keeper = stats.keeper;
    let likes_total = stats.likes_received;

    if let Some(vault) = ctx.accounts.vault.as_mut() {
        vault.remove_liker(&liker_key);
    }

    msg!(
        "Unlike: {} -> place {} (keeper {}, total {})",
        liker_key,
        place_key,
        keeper,
        likes_total
    );
    Ok(())
}
