use anchor_lang::prelude::*;

use crate::{constants::*, error::ErrorCode, state::Config};

#[derive(Accounts)]
pub struct SetVerifier<'info> {
    pub admin: Signer<'info>,
    #[account(
        mut,
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = admin @ ErrorCode::Unauthorized
    )]
    pub config: Account<'info, Config>,
}

pub fn handle_set_verifier(ctx: Context<SetVerifier>, verifier: Pubkey) -> Result<()> {
    ctx.accounts.config.verifier = verifier;

    msg!("Verifier rotated to {}", verifier);
    Ok(())
}
