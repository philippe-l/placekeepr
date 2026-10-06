use anchor_lang::prelude::*;

use crate::{
    constants::*,
    error::ErrorCode,
    state::{Config, Place, PlaceVault},
};

/// Fermeture administrative de la cagnotte d'un lieu (reset devnet,
/// modération) : rent ET solde non distribué vont au gardien — pas de split.
/// Distribuer d'abord si le partage compte. À exécuter avant close_place :
/// le compte Place est requis pour dériver le PDA du vault.
#[derive(Accounts)]
pub struct ClosePlaceVault<'info> {
    #[account(constraint = admin.key() == config.admin @ ErrorCode::Unauthorized)]
    pub admin: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    pub place: Account<'info, Place>,
    /// CHECK: destinataire du rent et du solde, contraint au gardien du lieu.
    #[account(mut, address = place.keeper @ ErrorCode::WrongKeeper)]
    pub keeper: UncheckedAccount<'info>,
    #[account(
        mut,
        close = keeper,
        seeds = [VAULT_SEED, place.key().as_ref()],
        bump = vault.bump
    )]
    pub vault: Account<'info, PlaceVault>,
}

pub fn handle_close_place_vault(ctx: Context<ClosePlaceVault>) -> Result<()> {
    msg!(
        "Vault of place {} closed by admin, {} lamports to keeper {}",
        ctx.accounts.place.key(),
        ctx.accounts.vault.to_account_info().lamports(),
        ctx.accounts.keeper.key()
    );
    Ok(())
}
