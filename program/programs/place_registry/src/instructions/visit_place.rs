use anchor_lang::prelude::*;

use crate::{
    constants::*,
    error::ErrorCode,
    state::{Config, KeeperStats, Place, Visit},
};

/// Visite vérifiée d'un lieu : présence physique co-signée par le vérifieur
/// (edge function verify-visit — GPS frais à ≤ 50 m de la cellule). Premier
/// passage : crée le PDA Visit (rent payé une fois) ; passages suivants :
/// simple incrément, sous cooldown de 24 h.
#[derive(Accounts)]
pub struct VisitPlace<'info> {
    #[account(mut)]
    pub visitor: Signer<'info>,
    pub place: Account<'info, Place>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    /// Co-signature du serveur de vérif GPS : sans elle, pas de visite —
    /// même en appelant le programme en direct.
    #[account(constraint = verifier.key() == config.verifier @ ErrorCode::UnknownVerifier)]
    pub verifier: Signer<'info>,
    #[account(
        init_if_needed,
        payer = visitor,
        space = 8 + Visit::INIT_SPACE,
        seeds = [VISIT_SEED, place.key().as_ref(), visitor.key().as_ref()],
        bump
    )]
    pub visit: Account<'info, Visit>,
    /// Réputation du gardien du lieu, créée au premier engagement reçu.
    #[account(
        init_if_needed,
        payer = visitor,
        space = 8 + KeeperStats::INIT_SPACE,
        seeds = [KEEPER_STATS_SEED, place.keeper.as_ref()],
        bump
    )]
    pub keeper_stats: Account<'info, KeeperStats>,
    pub system_program: Program<'info, System>,
}

pub fn handle_visit_place(ctx: Context<VisitPlace>) -> Result<()> {
    require!(
        ctx.accounts.place.keeper != ctx.accounts.visitor.key(),
        ErrorCode::SelfVisit
    );

    let now = Clock::get()?.unix_timestamp;
    let visit = &mut ctx.accounts.visit;

    // count == 0 : le PDA vient d'être créé par init_if_needed, pas de cooldown.
    if visit.count > 0 {
        require!(
            now.saturating_sub(visit.last_visited_at) >= VISIT_COOLDOWN_SECONDS,
            ErrorCode::VisitCooldown
        );
    }

    visit.visitor = ctx.accounts.visitor.key();
    visit.place = ctx.accounts.place.key();
    visit.count = visit
        .count
        .checked_add(1)
        .ok_or(ErrorCode::ReputationUnderflow)?;
    visit.last_visited_at = now;
    visit.bump = ctx.bumps.visit;

    let stats = &mut ctx.accounts.keeper_stats;
    stats.keeper = ctx.accounts.place.keeper;
    stats.visits_received = stats
        .visits_received
        .checked_add(1)
        .ok_or(ErrorCode::ReputationUnderflow)?;
    stats.bump = ctx.bumps.keeper_stats;

    msg!(
        "Visit: {} -> place {} (passage {}, keeper {}, total {})",
        visit.visitor,
        visit.place,
        visit.count,
        stats.keeper,
        stats.visits_received
    );
    Ok(())
}
