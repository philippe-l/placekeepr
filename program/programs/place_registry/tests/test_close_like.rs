use {
    anchor_lang::{
        prelude::Pubkey,
        solana_program::{instruction::Instruction, system_program},
        AccountDeserialize, InstructionData, ToAccountMetas,
    },
    litesvm::LiteSVM,
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

fn keeper_stats_pda(keeper: Pubkey) -> Pubkey {
    Pubkey::find_program_address(
        &[place_registry::constants::KEEPER_STATS_SEED, keeper.as_ref()],
        &place_registry::id(),
    )
    .0
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
            keeper_stats: keeper_stats_pda(keeper),
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    );
    send(svm, liker, &[], instruction)
}

fn send_close_like(svm: &mut LiteSVM, admin: &Keypair, place: Pubkey, liker: Pubkey, keeper: Pubkey) -> bool {
    let instruction = Instruction::new_with_bytes(
        place_registry::id(),
        &place_registry::instruction::CloseLike {}.data(),
        place_registry::accounts::CloseLike {
            admin: admin.pubkey(),
            config: config_pda(),
            place,
            liker,
            like: like_pda(place, liker),
            vault: Some(vault_pda(place)),
            keeper_stats: keeper_stats_pda(keeper),
        }
        .to_account_metas(None),
    );
    send(svm, admin, &[], instruction)
}

fn likes_received(svm: &LiteSVM, keeper: Pubkey) -> u64 {
    let account = svm.get_account(&keeper_stats_pda(keeper)).unwrap();
    let mut data: &[u8] = &account.data;
    let stats = place_registry::state::KeeperStats::try_deserialize(&mut data).unwrap();
    stats.likes_received
}

/// SVM prêt : config + lieu enregistré + un like posé dessus.
fn setup() -> (LiteSVM, Keypair, Keypair, Keypair) {
    let mut svm = svm_with_program();
    let admin = funded(&mut svm);
    let verifier = Keypair::new();
    assert!(initialize_config(&mut svm, &admin, verifier.pubkey()));
    let keeper = funded(&mut svm);
    assert!(send_register(&mut svm, &keeper, &verifier));
    let liker = funded(&mut svm);
    assert!(send_like(&mut svm, &liker, place_pda(LAT_E4, LNG_E4), keeper.pubkey()));
    (svm, admin, keeper, liker)
}

#[test]
fn test_admin_closes_like() {
    let (mut svm, admin, keeper, liker) = setup();
    let place = place_pda(LAT_E4, LNG_E4);
    let balance_before = svm.get_balance(&liker.pubkey()).unwrap();

    assert!(send_close_like(&mut svm, &admin, place, liker.pubkey(), keeper.pubkey()));

    // PDA fermé, rent rendu au likeur, réputation décrémentée.
    assert!(svm.get_account(&like_pda(place, liker.pubkey())).is_none());
    assert!(svm.get_balance(&liker.pubkey()).unwrap() > balance_before);
    assert_eq!(likes_received(&svm, keeper.pubkey()), 0);

    // Le likeur peut re-liker ensuite. Blockhash frais obligatoire : sans lui
    // le re-like serait identique au premier (même signature) et dédupliqué.
    svm.expire_blockhash();
    assert!(send_like(&mut svm, &liker, place, keeper.pubkey()));
    assert_eq!(likes_received(&svm, keeper.pubkey()), 1);
}

#[test]
fn test_non_admin_rejected() {
    let (mut svm, _, keeper, liker) = setup();
    let impostor = funded(&mut svm);
    let place = place_pda(LAT_E4, LNG_E4);

    assert!(!send_close_like(&mut svm, &impostor, place, liker.pubkey(), keeper.pubkey()));
    assert!(svm.get_account(&like_pda(place, liker.pubkey())).is_some());
    assert_eq!(likes_received(&svm, keeper.pubkey()), 1);
}

#[test]
fn test_wrong_liker_account_rejected() {
    let (mut svm, admin, keeper, liker) = setup();
    let stranger = Keypair::new();
    let place = place_pda(LAT_E4, LNG_E4);

    // Rediriger le rent ailleurs que vers l'auteur du like : refusé (les
    // seeds du PDA Like ne matchent déjà pas pour un autre likeur).
    assert!(!send_close_like(&mut svm, &admin, place, stranger.pubkey(), keeper.pubkey()));
    assert!(svm.get_account(&like_pda(place, liker.pubkey())).is_some());
}
