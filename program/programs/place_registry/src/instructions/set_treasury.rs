use anchor_lang::prelude::*;

use crate::{constants::*, error::ErrorCode, state::{Config, Treasury}};

/// Pose ou fait tourner le destinataire de la part trésorerie (admin
/// seulement). Le PDA est créé au premier appel : tant qu'il n'existe pas,
/// `distribute_royalties` échoue — c'est voulu, personne ne distribue vers
/// une trésorerie inconnue.
#[derive(Accounts)]
pub struct SetTreasury<'info> {
    #[account(mut, constraint = admin.key() == config.admin @ ErrorCode::Unauthorized)]
    pub admin: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(
        init_if_needed,
        payer = admin,
        space = 8 + Treasury::INIT_SPACE,
        seeds = [TREASURY_SEED],
        bump
    )]
    pub treasury: Account<'info, Treasury>,
    pub system_program: Program<'info, System>,
}

pub fn handle_set_treasury(ctx: Context<SetTreasury>, destination: Pubkey) -> Result<()> {
    let treasury = &mut ctx.accounts.treasury;
    treasury.destination = destination;
    treasury.bump = ctx.bumps.treasury;

    msg!("Treasury destination set to {}", destination);
    Ok(())
}
