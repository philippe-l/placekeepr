use anchor_lang::prelude::*;

use crate::{
    constants::*,
    error::ErrorCode,
    state::{Place, PlaceVault, Treasury},
};

/// Distribue la cagnotte d'un lieu : gardien, trésorerie, likers récents.
///
/// Permissionless et sans signataire : le split est entièrement déterminé
/// par la chaîne (le gardien vient du compte Place, la trésorerie du PDA
/// Treasury, les likeurs du ring buffer du vault). N'importe qui peut donc
/// payer les frais pour déclencher le versement, personne ne peut en
/// détourner la destination.
///
/// Les likeurs actifs sont passés en `remaining_accounts`, dans l'ordre
/// exact du ring buffer (`PlaceVault::active_likers`), tous `mut`.
#[derive(Accounts)]
pub struct DistributeRoyalties<'info> {
    pub place: Account<'info, Place>,
    #[account(
        mut,
        seeds = [VAULT_SEED, place.key().as_ref()],
        bump = vault.bump
    )]
    pub vault: Account<'info, PlaceVault>,
    /// CHECK: destinataire de la part gardien, contraint au gardien du lieu.
    #[account(mut, address = place.keeper @ ErrorCode::WrongKeeper)]
    pub keeper: UncheckedAccount<'info>,
    #[account(seeds = [TREASURY_SEED], bump = treasury_config.bump)]
    pub treasury_config: Account<'info, Treasury>,
    /// CHECK: destinataire de la part trésorerie, contraint à la destination
    /// enregistrée on-chain par l'admin.
    #[account(mut, address = treasury_config.destination @ ErrorCode::WrongTreasury)]
    pub treasury: UncheckedAccount<'info>,
}

pub fn handle_distribute_royalties<'info>(
    ctx: Context<'info, DistributeRoyalties<'info>>,
) -> Result<()> {
    let vault_info = ctx.accounts.vault.to_account_info();
    let keeper_info = ctx.accounts.keeper.to_account_info();
    let treasury_info = ctx.accounts.treasury.to_account_info();

    // Le vault garde de quoi rester exempt de rent : le distribuer
    // entièrement ferait ramasser le compte par le runtime, ring buffer
    // compris.
    let rent_floor = Rent::get()?.minimum_balance(vault_info.data_len());
    let pot = vault_info.lamports().saturating_sub(rent_floor);
    require!(pot > 0, ErrorCode::NothingToDistribute);

    let likers: Vec<Pubkey> = ctx.accounts.vault.active_likers().copied().collect();
    require!(
        ctx.remaining_accounts.len() == likers.len(),
        ErrorCode::RecentLikersMismatch
    );

    // u128 : `pot * 6_000` déborderait u64 bien avant la limite des lamports.
    let share = |bps: u64| -> u64 {
        ((pot as u128) * (bps as u128) / (BPS_DENOMINATOR as u128)) as u64
    };

    let treasury_cut = share(TREASURY_SHARE_BPS);
    let per_liker = if likers.is_empty() {
        0
    } else {
        share(LIKERS_SHARE_BPS) / likers.len() as u64
    };
    let likers_cut = per_liker.saturating_mul(likers.len() as u64);
    // Le gardien prend sa part, les arrondis de division, et la part likers
    // quand le lieu n'a aucun like actif — rien ne dort dans le vault.
    let mut keeper_cut = pot - treasury_cut - likers_cut;

    // Un compte crédité doit finir à 0 ou rent-exempt, sinon le runtime rejette
    // TOUTE la transaction (InsufficientFundsForRent). Un likeur qui a vidé son
    // wallet et dont la part est sous le minimum bloquerait donc la
    // distribution du lieu pour tout le monde (#43) : il est sauté, sa part va
    // au gardien — comme la part likers quand il n'y a aucun like actif.
    let rent = Rent::get()?;
    let mut skipped = 0usize;
    for (index, liker) in likers.iter().enumerate() {
        let account = &ctx.remaining_accounts[index];
        require_keys_eq!(account.key(), *liker, ErrorCode::RecentLikersMismatch);
        let after = account.lamports().saturating_add(per_liker);
        if after < rent.minimum_balance(account.data_len()) {
            keeper_cut += per_liker;
            skipped += 1;
            continue;
        }
        pay(&vault_info, account, per_liker)?;
    }
    pay(&vault_info, &treasury_info, treasury_cut)?;
    pay(&vault_info, &keeper_info, keeper_cut)?;

    let vault = &mut ctx.accounts.vault;
    vault.total_distributed = vault.total_distributed.saturating_add(pot);

    msg!(
        "Royalties distributed for place {}: {} lamports (keeper {} / treasury {} / {} likers x {}, {} skipped below rent), lifetime {}",
        ctx.accounts.place.key(),
        pot,
        keeper_cut,
        treasury_cut,
        likers.len() - skipped,
        per_liker,
        skipped,
        vault.total_distributed
    );
    Ok(())
}

/// Transfert de lamports entre comptes de l'instruction. Pas de CPI système
/// possible : le vault est un compte à données détenu par le programme, ses
/// lamports se déplacent à la main.
fn pay<'info>(from: &AccountInfo<'info>, to: &AccountInfo<'info>, amount: u64) -> Result<()> {
    if amount == 0 {
        return Ok(());
    }
    let debited = from
        .lamports()
        .checked_sub(amount)
        .ok_or(ErrorCode::LamportOverflow)?;
    let credited = to
        .lamports()
        .checked_add(amount)
        .ok_or(ErrorCode::LamportOverflow)?;
    **from.try_borrow_mut_lamports()? = debited;
    **to.try_borrow_mut_lamports()? = credited;
    Ok(())
}
