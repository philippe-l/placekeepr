use anchor_lang::prelude::*;
use anchor_lang::solana_program::system_program;

use crate::{constants::*, error::ErrorCode, state::Config};

/// Fermeture administrative d'un compte de réputation (reset devnet) :
/// rent rendu au gardien. Le compte est traité en brut (pas de
/// désérialisation Anchor) pour pouvoir fermer aussi les comptes au layout
/// legacy d'avant `visits_received` — c'est tout l'intérêt de l'outil.
/// À n'utiliser qu'après avoir fermé les likes/visites du gardien : les
/// compteurs partent avec le compte.
#[derive(Accounts)]
pub struct CloseKeeperStats<'info> {
    #[account(constraint = admin.key() == config.admin @ ErrorCode::Unauthorized)]
    pub admin: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    /// CHECK: simple destinataire du rent ; les seeds du PDA stats le
    /// contraignent à être le gardien concerné.
    #[account(mut)]
    pub keeper: UncheckedAccount<'info>,
    /// CHECK: fermé manuellement, layout legacy toléré (voir doc du struct).
    #[account(
        mut,
        seeds = [KEEPER_STATS_SEED, keeper.key().as_ref()],
        bump
    )]
    pub keeper_stats: UncheckedAccount<'info>,
}

pub fn handle_close_keeper_stats(ctx: Context<CloseKeeperStats>) -> Result<()> {
    let stats = ctx.accounts.keeper_stats.to_account_info();
    require!(stats.owner == &crate::ID, ErrorCode::StatsNotInitialized);

    // Fermeture manuelle : rent au gardien, données purgées, compte rendu
    // au system program (le runtime le supprime en fin de transaction).
    let keeper = ctx.accounts.keeper.to_account_info();
    let lamports = stats.lamports();
    **keeper.try_borrow_mut_lamports()? = keeper
        .lamports()
        .checked_add(lamports)
        .ok_or(ErrorCode::ReputationUnderflow)?;
    **stats.try_borrow_mut_lamports()? = 0;
    stats.resize(0)?;
    stats.assign(&system_program::ID);

    msg!("KeeperStats {} closed by admin", ctx.accounts.keeper.key());
    Ok(())
}
