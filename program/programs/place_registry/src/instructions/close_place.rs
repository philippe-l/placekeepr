use anchor_lang::prelude::*;

use crate::{
    constants::*,
    error::ErrorCode,
    state::{Config, Place},
};

/// Fermeture administrative d'un lieu (reset devnet, modération future).
/// Le rent du PDA revient au gardien, pas à l'admin. Ne touche pas aux
/// PDAs Like : à n'utiliser qu'une fois les likes du lieu retirés, sinon
/// ils deviennent orphelins (unlike impossible sans le compte Place).
#[derive(Accounts)]
pub struct ClosePlace<'info> {
    #[account(constraint = admin.key() == config.admin @ ErrorCode::Unauthorized)]
    pub admin: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    /// CHECK: simple destinataire du rent, contraint à être le gardien du lieu.
    #[account(mut, address = place.keeper @ ErrorCode::WrongKeeper)]
    pub keeper: UncheckedAccount<'info>,
    #[account(
        mut,
        close = keeper,
        seeds = [PLACE_SEED, &place.lat_e4.to_le_bytes(), &place.lng_e4.to_le_bytes()],
        bump = place.bump
    )]
    pub place: Account<'info, Place>,
}

pub fn handle_close_place(ctx: Context<ClosePlace>) -> Result<()> {
    let place = &ctx.accounts.place;
    msg!(
        "Place ({}, {}) closed by admin, rent refunded to keeper {}",
        place.lat_e4,
        place.lng_e4,
        place.keeper
    );
    Ok(())
}
