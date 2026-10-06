use anchor_lang::{prelude::*, system_program};

use crate::{
    constants::*,
    error::ErrorCode,
    state::{Place, PlaceVault},
};

/// Dépôt de royalties dans la cagnotte d'un lieu, par n'importe qui.
///
/// Les royalties cNFT ne sont pas exécutables au niveau du protocole :
/// Bubblegum ne stocke que `seller_fee_basis_points` et `creators[]` dans le
/// hash de la feuille, le versement reste volontaire côté marketplace. Une
/// marketplace qui joue le jeu peut simplement créditer le vault du lieu ;
/// cette instruction fait la même chose en laissant une trace décodable par
/// l'indexer, ce qu'un transfert système nu ne ferait pas.
#[derive(Accounts)]
pub struct DepositRoyalty<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    pub place: Account<'info, Place>,
    #[account(
        init_if_needed,
        payer = payer,
        space = 8 + PlaceVault::INIT_SPACE,
        seeds = [VAULT_SEED, place.key().as_ref()],
        bump
    )]
    pub vault: Account<'info, PlaceVault>,
    pub system_program: Program<'info, System>,
}

pub fn handle_deposit_royalty(ctx: Context<DepositRoyalty>, amount: u64) -> Result<()> {
    require!(amount > 0, ErrorCode::EmptyDeposit);

    let vault = &mut ctx.accounts.vault;
    vault.place = ctx.accounts.place.key();
    vault.bump = ctx.bumps.vault;

    system_program::transfer(
        CpiContext::new(
            ctx.accounts.system_program.key(),
            system_program::Transfer {
                from: ctx.accounts.payer.to_account_info(),
                to: vault.to_account_info(),
            },
        ),
        amount,
    )?;

    msg!(
        "Royalty deposit: {} lamports from {} for place {}",
        amount,
        ctx.accounts.payer.key(),
        ctx.accounts.place.key()
    );
    Ok(())
}
