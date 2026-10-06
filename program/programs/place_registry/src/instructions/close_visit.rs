use anchor_lang::prelude::*;

use crate::{
    constants::*,
    error::ErrorCode,
    state::{Config, KeeperStats, Place, Visit},
};

/// Fermeture administrative d'un compte de visites (reset devnet,
/// modération) : rent rendu au visiteur, réputation décrémentée de la
/// totalité des passages comptés. À exécuter AVANT close_place sur le lieu
/// concerné : le compte Place est requis pour retrouver le gardien.
#[derive(Accounts)]
pub struct CloseVisit<'info> {
    #[account(constraint = admin.key() == config.admin @ ErrorCode::Unauthorized)]
    pub admin: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    pub place: Account<'info, Place>,
    /// CHECK: simple destinataire du rent, contraint à être l'auteur des visites.
    #[account(mut, address = visit.visitor @ ErrorCode::WrongVisitor)]
    pub visitor: UncheckedAccount<'info>,
    #[account(
        mut,
        close = visitor,
        seeds = [VISIT_SEED, place.key().as_ref(), visitor.key().as_ref()],
        bump = visit.bump
    )]
    pub visit: Account<'info, Visit>,
    #[account(
        mut,
        seeds = [KEEPER_STATS_SEED, place.keeper.as_ref()],
        bump = keeper_stats.bump
    )]
    pub keeper_stats: Account<'info, KeeperStats>,
}

pub fn handle_close_visit(ctx: Context<CloseVisit>) -> Result<()> {
    let stats = &mut ctx.accounts.keeper_stats;
    stats.visits_received = stats
        .visits_received
        .checked_sub(ctx.accounts.visit.count)
        .ok_or(ErrorCode::ReputationUnderflow)?;

    msg!(
        "Visits {} -> place {} closed by admin ({} passages, keeper {}, total {})",
        ctx.accounts.visit.visitor,
        ctx.accounts.place.key(),
        ctx.accounts.visit.count,
        stats.keeper,
        stats.visits_received
    );
    Ok(())
}
