use {
    anchor_lang::{
        prelude::Pubkey,
        solana_program::{clock::Clock, instruction::Instruction, system_program},
        AccountDeserialize, InstructionData, ToAccountMetas,
    },
    litesvm::LiteSVM,
    solana_keypair::Keypair,
    solana_message::{Message, VersionedMessage},
    solana_signer::Signer,
    solana_transaction::versioned::VersionedTransaction,
};

// Cellule de test (tour Eiffel, 48.8584, 2.2945) en 1e-4 degrés.
const LAT_E4: i32 = 488_584;
const LNG_E4: i32 = 22_945;

// Horloge arbitraire mais réaliste : LiteSVM démarre à l'epoch 0.
const NOW: i64 = 1_751_900_000;

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
        &[
            place_registry::constants::LIKE_SEED,
            place.as_ref(),
            liker.as_ref(),
        ],
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
    let mut clock: Clock = svm.get_sysvar();
    clock.unix_timestamp = NOW;
    svm.set_sysvar(&clock);
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

fn send_register(svm: &mut LiteSVM, keeper: &Keypair, verifier: &Keypair, lat_e4: i32, lng_e4: i32) -> bool {
    let instruction = Instruction::new_with_bytes(
        place_registry::id(),
        &place_registry::instruction::RegisterPlace { lat_e4, lng_e4 }.data(),
        place_registry::accounts::RegisterPlace {
            keeper: keeper.pubkey(),
            place: place_pda(lat_e4, lng_e4),
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

fn send_unlike(svm: &mut LiteSVM, liker: &Keypair, place: Pubkey, keeper: Pubkey) -> bool {
    let instruction = Instruction::new_with_bytes(
        place_registry::id(),
        &place_registry::instruction::UnlikePlace {}.data(),
        place_registry::accounts::UnlikePlace {
            liker: liker.pubkey(),
            place,
            like: like_pda(place, liker.pubkey()),
            vault: Some(vault_pda(place)),
            keeper_stats: keeper_stats_pda(keeper),
        }
        .to_account_metas(None),
    );
    send(svm, liker, &[], instruction)
}

fn likes_received(svm: &LiteSVM, keeper: Pubkey) -> u64 {
    let account = svm.get_account(&keeper_stats_pda(keeper)).unwrap();
    let mut data: &[u8] = &account.data;
    let stats = place_registry::state::KeeperStats::try_deserialize(&mut data).unwrap();
    stats.likes_received
}

/// SVM prêt à l'emploi : programme chargé, config initialisée,
/// un lieu enregistré par un gardien.
fn setup_with_place() -> (LiteSVM, Keypair, Pubkey) {
    let mut svm = svm_with_program();
    let admin = funded(&mut svm);
    let verifier = Keypair::new();
    assert!(initialize_config(&mut svm, &admin, verifier.pubkey()));

    let keeper = funded(&mut svm);
    assert!(send_register(&mut svm, &keeper, &verifier, LAT_E4, LNG_E4));
    (svm, keeper, place_pda(LAT_E4, LNG_E4))
}

#[test]
fn test_like_place() {
    let (mut svm, keeper, place) = setup_with_place();
    let liker = funded(&mut svm);

    assert!(send_like(&mut svm, &liker, place, keeper.pubkey()));

    let account = svm.get_account(&like_pda(place, liker.pubkey())).unwrap();
    let mut data: &[u8] = &account.data;
    let like = place_registry::state::Like::try_deserialize(&mut data).unwrap();
    assert_eq!(like.liker, liker.pubkey());
    assert_eq!(like.place, place);
    assert_eq!(like.liked_at, NOW);

    assert_eq!(likes_received(&svm, keeper.pubkey()), 1);
}

#[test]
fn test_double_like_fails() {
    let (mut svm, keeper, place) = setup_with_place();
    let liker = funded(&mut svm);

    assert!(send_like(&mut svm, &liker, place, keeper.pubkey()));
    // Même likeur, même lieu : init du PDA impossible, la tx échoue.
    assert!(!send_like(&mut svm, &liker, place, keeper.pubkey()));
    assert_eq!(likes_received(&svm, keeper.pubkey()), 1);
}

#[test]
fn test_self_like_rejected() {
    let (mut svm, keeper, place) = setup_with_place();

    assert!(!send_like(&mut svm, &keeper, place, keeper.pubkey()));
    assert!(svm.get_account(&keeper_stats_pda(keeper.pubkey())).is_none());
}

#[test]
fn test_likes_accumulate_per_keeper() {
    let (mut svm, keeper, place) = setup_with_place();
    let first = funded(&mut svm);
    let second = funded(&mut svm);

    assert!(send_like(&mut svm, &first, place, keeper.pubkey()));
    assert!(send_like(&mut svm, &second, place, keeper.pubkey()));

    assert_eq!(likes_received(&svm, keeper.pubkey()), 2);
}

#[test]
fn test_unlike_refunds_and_decrements() {
    let (mut svm, keeper, place) = setup_with_place();
    let liker = funded(&mut svm);

    assert!(send_like(&mut svm, &liker, place, keeper.pubkey()));
    let balance_after_like = svm.get_balance(&liker.pubkey()).unwrap();

    assert!(send_unlike(&mut svm, &liker, place, keeper.pubkey()));
    assert!(svm.get_account(&like_pda(place, liker.pubkey())).is_none());
    assert_eq!(likes_received(&svm, keeper.pubkey()), 0);

    // Le rent du PDA Like revient au likeur (moins les frais de tx).
    assert!(svm.get_balance(&liker.pubkey()).unwrap() > balance_after_like);
}

#[test]
fn test_relike_after_unlike() {
    let (mut svm, keeper, place) = setup_with_place();
    let liker = funded(&mut svm);

    assert!(send_like(&mut svm, &liker, place, keeper.pubkey()));
    assert!(send_unlike(&mut svm, &liker, place, keeper.pubkey()));
    // Sans blockhash frais, le re-like serait octet pour octet identique au
    // premier like (même signature) et rejeté comme tx déjà traitée.
    svm.expire_blockhash();
    assert!(send_like(&mut svm, &liker, place, keeper.pubkey()));

    assert_eq!(likes_received(&svm, keeper.pubkey()), 1);
}

#[test]
fn test_unlike_without_like_fails() {
    let (mut svm, keeper, place) = setup_with_place();
    let stranger = funded(&mut svm);

    assert!(!send_unlike(&mut svm, &stranger, place, keeper.pubkey()));
}

#[test]
fn test_cannot_unlike_someone_elses_like() {
    let (mut svm, keeper, place) = setup_with_place();
    let liker = funded(&mut svm);
    let thief = funded(&mut svm);

    assert!(send_like(&mut svm, &liker, place, keeper.pubkey()));

    // Le PDA du voleur (place, thief) n'existe pas : échec. Il ne peut pas
    // viser le PDA (place, liker) non plus, les seeds ne matcheraient pas.
    assert!(!send_unlike(&mut svm, &thief, place, keeper.pubkey()));
    assert!(svm.get_account(&like_pda(place, liker.pubkey())).is_some());
    assert_eq!(likes_received(&svm, keeper.pubkey()), 1);
}
