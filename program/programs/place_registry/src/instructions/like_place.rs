use anchor_lang::prelude::*;

use crate::{
    constants::*,
    error::ErrorCode,
    state::{KeeperStats, Like, Place, PlaceVault},
};

#[derive(Accounts)]
pub struct LikePlace<'info> {
    #[account(mut)]
    pub liker: Signer<'info>,
    pub place: Account<'info, Place>,
    #[account(
        init,
        payer = liker,
        space = 8 + Like::INIT_SPACE,
        seeds = [LIKE_SEED, place.key().as_ref(), liker.key().as_ref()],
        bump
    )]
    pub like: Account<'info, Like>,
    /// Réputation du gardien du lieu, créée au premier like reçu.
    #[account(
        init_if_needed,
        payer = liker,
        space = 8 + KeeperStats::INIT_SPACE,
        seeds = [KEEPER_STATS_SEED, place.keeper.as_ref()],
        bump
    )]
    pub keeper_stats: Account<'info, KeeperStats>,
    /// Cagnotte du lieu, créée au premier like reçu : elle porte le ring
    /// buffer des « likers récents » du split royalties.
    #[account(
        init_if_needed,
        payer = liker,
        space = 8 + PlaceVault::INIT_SPACE,
        seeds = [VAULT_SEED, place.key().as_ref()],
        bump
    )]
    pub vault: Account<'info, PlaceVault>,
    pub system_program: Program<'info, System>,
}

pub fn handle_like_place(ctx: Context<LikePlace>) -> Result<()> {
    require!(
        ctx.accounts.place.keeper != ctx.accounts.liker.key(),
        ErrorCode::SelfLike
    );

    let place_key = ctx.accounts.place.key();
    let liker_key = ctx.accounts.liker.key();
    let keeper = ctx.accounts.place.keeper;

    let like = &mut ctx.accounts.like;
    like.liker = liker_key;
    like.place = place_key;
    like.liked_at = Clock::get()?.unix_timestamp;
    like.bump = ctx.bumps.like;

    let stats = &mut ctx.accounts.keeper_stats;
    stats.keeper = keeper;
    stats.likes_received = stats
        .likes_received
        .checked_add(1)
        .ok_or(ErrorCode::ReputationUnderflow)?;
    stats.bump = ctx.bumps.keeper_stats;
    let likes_total = stats.likes_received;

    // Le likeur entre dans le ring buffer : c'est lui, et pas la table des
    // likes, qui décide du split au moment de la distribution.
    let vault = &mut ctx.accounts.vault;
    vault.place = place_key;
    vault.bump = ctx.bumps.vault;
    vault.push_liker(liker_key);

    msg!(
        "Like: {} -> place {} (keeper {}, total {})",
        liker_key,
        place_key,
        keeper,
        likes_total
    );
    Ok(())
}
