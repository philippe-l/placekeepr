use anchor_lang::prelude::*;

use crate::{
    constants::*,
    error::ErrorCode,
    state::{Config, Place},
};

#[derive(Accounts)]
#[instruction(lat_e4: i32, lng_e4: i32)]
pub struct RegisterPlace<'info> {
    #[account(mut)]
    pub keeper: Signer<'info>,
    #[account(
        init,
        payer = keeper,
        space = 8 + Place::INIT_SPACE,
        seeds = [PLACE_SEED, &lat_e4.to_le_bytes(), &lng_e4.to_le_bytes()],
        bump
    )]
    pub place: Account<'info, Place>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    /// Co-signature du serveur de vérif GPS (edge function verify-capture) :
    /// sans elle, pas d'enregistrement — donc pas de mint dans la même tx.
    #[account(constraint = verifier.key() == config.verifier @ ErrorCode::UnknownVerifier)]
    pub verifier: Signer<'info>,
    pub system_program: Program<'info, System>,
}

pub fn handle_register_place(ctx: Context<RegisterPlace>, lat_e4: i32, lng_e4: i32) -> Result<()> {
    require!(lat_e4.abs() <= MAX_LAT_E4, ErrorCode::CoordinatesOutOfRange);
    require!(lng_e4.abs() <= MAX_LNG_E4, ErrorCode::CoordinatesOutOfRange);

    let place = &mut ctx.accounts.place;
    place.keeper = ctx.accounts.keeper.key();
    place.lat_e4 = lat_e4;
    place.lng_e4 = lng_e4;
    place.registered_at = Clock::get()?.unix_timestamp;
    place.bump = ctx.bumps.place;

    msg!("Place ({}, {}) registered by {}", lat_e4, lng_e4, place.keeper);
    Ok(())
}
