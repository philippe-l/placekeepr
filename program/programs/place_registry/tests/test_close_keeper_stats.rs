use {
    anchor_lang::{
        prelude::Pubkey,
        solana_program::{instruction::Instruction, system_program},
        Discriminator, InstructionData, ToAccountMetas,
    },
    litesvm::LiteSVM,
    solana_account::Account,
    solana_keypair::Keypair,
    solana_message::{Message, VersionedMessage},
    solana_signer::Signer,
    solana_transaction::versioned::VersionedTransaction,
};

const LAT_E4: i32 = 488_584;
const LNG_E4: i32 = 22_945;

fn place_pda(lat_e4: i32, lng_e4: i32) -> Pubkey {
    Pubkey::find_program_address(
        &[
            place_registry::constants::PLACE_SEED,
            &lat_e4.to_le_bytes(),
            &lng_e4.to_le_bytes(),
        ],
        &place_registry::id(),
    )
    .0
}

fn config_pda() -> Pubkey {
    Pubkey::find_program_address(&[place_registry::constants::CONFIG_SEED], &place_registry::id()).0
}

fn like_pda(place: Pubkey, liker: Pubkey) -> Pubkey {
    Pubkey::find_program_address(
        &[place_registry::constants::LIKE_SEED, place.as_ref(), liker.as_ref()],
        &place_registry::id(),
    )
    .0
}

fn keeper_stats_pda(keeper: Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[place_registry::constants::KEEPER_STATS_SEED, keeper.as_ref()],
        &place_registry::id(),
    )
}

fn vault_pda(place: Pubkey) -> Pubkey {
    Pubkey::find_program_address(
        &[place_registry::constants::VAULT_SEED, place.as_ref()],
        &place_registry::id(),
    )
    .0
}

fn svm_with_program() -> LiteSVM {
    let mut svm = LiteSVM::new();
    let bytes = include_bytes!(concat!(
        env!("CARGO_TARGET_TMPDIR"),
        "/../deploy/place_registry.so"
    ));
    svm.add_program(place_registry::id(), bytes).unwrap();
    svm
}

fn funded(svm: &mut LiteSVM) -> Keypair {
    let keypair = Keypair::new();
    svm.airdrop(&keypair.pubkey(), 1_000_000_000).unwrap();
    keypair
}

fn send(svm: &mut LiteSVM, payer: &Keypair, extra_signers: &[&Keypair], instruction: Instruction) -> bool {
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[instruction], Some(&payer.pubkey()), &blockhash);
    let mut signers: Vec<&Keypair> = vec![payer];
    signers.extend_from_slice(extra_signers);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &signers).unwrap();
    svm.send_transaction(tx).is_ok()
}

fn initialize_config(svm: &mut LiteSVM, admin: &Keypair, verifier: Pubkey) -> bool {
    let instruction = Instruction::new_with_bytes(
        place_registry::id(),
        &place_registry::instruction::InitializeConfig { verifier }.data(),
        place_registry::accounts::InitializeConfig {
            admin: admin.pubkey(),
            config: config_pda(),
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    );
    send(svm, admin, &[], instruction)
}

fn send_register(svm: &mut LiteSVM, keeper: &Keypair, verifier: &Keypair) -> bool {
    let instruction = Instruction::new_with_bytes(
        place_registry::id(),
        &place_registry::instruction::RegisterPlace {
            lat_e4: LAT_E4,
            lng_e4: LNG_E4,
        }
        .data(),
        place_registry::accounts::RegisterPlace {
            keeper: keeper.pubkey(),
            place: place_pda(LAT_E4, LNG_E4),
            config: config_pda(),
            verifier: verifier.pubkey(),
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    );
    send(svm, keeper, &[verifier], instruction)
}

fn send_like(svm: &mut LiteSVM, liker: &Keypair, place: Pubkey, keeper: Pubkey) -> bool {
    let instruction = Instruction::new_with_bytes(
        place_registry::id(),
        &place_registry::instruction::LikePlace {}.data(),
        place_registry::accounts::LikePlace {
            liker: liker.pubkey(),
            place,
            like: like_pda(place, liker.pubkey()),
            vault: vault_pda(place),
            keeper_stats: keeper_stats_pda(keeper).0,
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    );
    send(svm, liker, &[], instruction)
}

fn send_close_keeper_stats(svm: &mut LiteSVM, admin: &Keypair, keeper: Pubkey) -> bool {
    let instruction = Instruction::new_with_bytes(
        place_registry::id(),
        &place_registry::instruction::CloseKeeperStats {}.data(),
        place_registry::accounts::CloseKeeperStats {
            admin: admin.pubkey(),
            config: config_pda(),
            keeper,
            keeper_stats: keeper_stats_pda(keeper).0,
        }
        .to_account_metas(None),
    );
    send(svm, admin, &[], instruction)
}

/// SVM prêt : config + lieu + un like posé (KeeperStats au layout courant).
fn setup() -> (LiteSVM, Keypair, Keypair) {
    let mut svm = svm_with_program();
    let admin = funded(&mut svm);
    let verifier = Keypair::new();
    assert!(initialize_config(&mut svm, &admin, verifier.pubkey()));
    let keeper = funded(&mut svm);
    assert!(send_register(&mut svm, &keeper, &verifier));
    let liker = funded(&mut svm);
    assert!(send_like(&mut svm, &liker, place_pda(LAT_E4, LNG_E4), keeper.pubkey()));
    (svm, admin, keeper)
}

#[test]
fn test_admin_closes_stats_rent_to_keeper() {
    let (mut svm, admin, keeper) = setup();
    let balance_before = svm.get_balance(&keeper.pubkey()).unwrap();

    assert!(send_close_keeper_stats(&mut svm, &admin, keeper.pubkey()));

    assert!(svm.get_account(&keeper_stats_pda(keeper.pubkey()).0).is_none());
    assert!(svm.get_balance(&keeper.pubkey()).unwrap() > balance_before);
}

#[test]
fn test_closes_legacy_layout_account() {
    let (mut svm, admin, _) = setup();

    // Fabrique un KeeperStats au layout d'avant `visits_received`
    // (49 octets : disc + keeper + likes_received + bump) — le compte que
    // le nouveau code ne sait plus désérialiser, mais doit savoir fermer.
    let legacy_keeper = Keypair::new();
    let (stats_pda, bump) = keeper_stats_pda(legacy_keeper.pubkey());
    let mut data = Vec::with_capacity(49);
    data.extend_from_slice(place_registry::state::KeeperStats::DISCRIMINATOR);
    data.extend_from_slice(legacy_keeper.pubkey().as_ref());
    data.extend_from_slice(&1u64.to_le_bytes());
    data.push(bump);
    let rent = 1_231_920; // rent-exempt pour 49 octets, valeur devnet
    svm.set_account(
        stats_pda,
        Account {
            lamports: rent,
            data,
            owner: place_registry::id(),
            executable: false,
            rent_epoch: 0,
        },
    )
    .unwrap();

    assert!(send_close_keeper_stats(&mut svm, &admin, legacy_keeper.pubkey()));

    assert!(svm.get_account(&stats_pda).is_none());
    assert_eq!(svm.get_balance(&legacy_keeper.pubkey()).unwrap(), rent);
}

#[test]
fn test_non_admin_rejected() {
    let (mut svm, _, keeper) = setup();
    let impostor = funded(&mut svm);

    assert!(!send_close_keeper_stats(&mut svm, &impostor, keeper.pubkey()));
    assert!(svm.get_account(&keeper_stats_pda(keeper.pubkey()).0).is_some());
}

#[test]
fn test_uninitialized_stats_rejected() {
    let (mut svm, admin, _) = setup();
    let ghost = Keypair::new();

    // Aucune stats pour ce wallet : le compte au PDA n'existe pas (owner
    // system program) — refus propre, pas de fermeture fantôme.
    assert!(!send_close_keeper_stats(&mut svm, &admin, ghost.pubkey()));
}
