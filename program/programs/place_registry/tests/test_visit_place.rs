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

fn visit_pda(place: Pubkey, visitor: Pubkey) -> Pubkey {
    Pubkey::find_program_address(
        &[place_registry::constants::VISIT_SEED, place.as_ref(), visitor.as_ref()],
        &place_registry::id(),
    )
    .0
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

fn send_visit(svm: &mut LiteSVM, visitor: &Keypair, verifier: &Keypair, place: Pubkey, keeper: Pubkey) -> bool {
    let instruction = Instruction::new_with_bytes(
        place_registry::id(),
        &place_registry::instruction::VisitPlace {}.data(),
        place_registry::accounts::VisitPlace {
            visitor: visitor.pubkey(),
            place,
            config: config_pda(),
            verifier: verifier.pubkey(),
            visit: visit_pda(place, visitor.pubkey()),
            keeper_stats: keeper_stats_pda(keeper),
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    );
    send(svm, visitor, &[verifier], instruction)
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

fn read_stats(svm: &LiteSVM, keeper: Pubkey) -> place_registry::state::KeeperStats {
    let account = svm.get_account(&keeper_stats_pda(keeper)).unwrap();
    let mut data: &[u8] = &account.data;
    place_registry::state::KeeperStats::try_deserialize(&mut data).unwrap()
}

fn read_visit(svm: &LiteSVM, place: Pubkey, visitor: Pubkey) -> place_registry::state::Visit {
    let account = svm.get_account(&visit_pda(place, visitor)).unwrap();
    let mut data: &[u8] = &account.data;
    place_registry::state::Visit::try_deserialize(&mut data).unwrap()
}

/// Avance l'horloge LiteSVM de `seconds` (le cooldown est on-chain).
fn warp(svm: &mut LiteSVM, seconds: i64) {
    let mut clock: Clock = svm.get_sysvar();
    clock.unix_timestamp += seconds;
    svm.set_sysvar(&clock);
}

/// SVM prêt : config + lieu enregistré.
fn setup() -> (LiteSVM, Keypair, Keypair, Keypair) {
    let mut svm = svm_with_program();
    let admin = funded(&mut svm);
    let verifier = Keypair::new();
    assert!(initialize_config(&mut svm, &admin, verifier.pubkey()));
    let keeper = funded(&mut svm);
    assert!(send_register(&mut svm, &keeper, &verifier));
    (svm, admin, verifier, keeper)
}

#[test]
fn test_first_visit_creates_pda_and_credits_keeper() {
    let (mut svm, _, verifier, keeper) = setup();
    let visitor = funded(&mut svm);
    let place = place_pda(LAT_E4, LNG_E4);

    assert!(send_visit(&mut svm, &visitor, &verifier, place, keeper.pubkey()));

    let visit = read_visit(&svm, place, visitor.pubkey());
    assert_eq!(visit.visitor, visitor.pubkey());
    assert_eq!(visit.place, place);
    assert_eq!(visit.count, 1);
    let stats = read_stats(&svm, keeper.pubkey());
    assert_eq!(stats.visits_received, 1);
    assert_eq!(stats.likes_received, 0);
}

#[test]
fn test_revisit_within_cooldown_rejected() {
    let (mut svm, _, verifier, keeper) = setup();
    let visitor = funded(&mut svm);
    let place = place_pda(LAT_E4, LNG_E4);

    assert!(send_visit(&mut svm, &visitor, &verifier, place, keeper.pubkey()));

    // 1 h plus tard : refusé (cooldown 24 h). Blockhash frais obligatoire,
    // sinon la tx identique à la première serait dédupliquée.
    warp(&mut svm, 3_600);
    svm.expire_blockhash();
    assert!(!send_visit(&mut svm, &visitor, &verifier, place, keeper.pubkey()));
    assert_eq!(read_visit(&svm, place, visitor.pubkey()).count, 1);
    assert_eq!(read_stats(&svm, keeper.pubkey()).visits_received, 1);
}

#[test]
fn test_revisit_after_cooldown_increments() {
    let (mut svm, _, verifier, keeper) = setup();
    let visitor = funded(&mut svm);
    let place = place_pda(LAT_E4, LNG_E4);

    assert!(send_visit(&mut svm, &visitor, &verifier, place, keeper.pubkey()));

    warp(&mut svm, place_registry::constants::VISIT_COOLDOWN_SECONDS);
    svm.expire_blockhash();
    assert!(send_visit(&mut svm, &visitor, &verifier, place, keeper.pubkey()));

    let visit = read_visit(&svm, place, visitor.pubkey());
    assert_eq!(visit.count, 2);
    assert_eq!(read_stats(&svm, keeper.pubkey()).visits_received, 2);
}

#[test]
fn test_self_visit_rejected() {
    let (mut svm, _, verifier, keeper) = setup();
    let place = place_pda(LAT_E4, LNG_E4);

    assert!(!send_visit(&mut svm, &keeper, &verifier, place, keeper.pubkey()));
    assert!(svm.get_account(&visit_pda(place, keeper.pubkey())).is_none());
}

#[test]
fn test_unknown_verifier_rejected() {
    let (mut svm, _, _, keeper) = setup();
    let visitor = funded(&mut svm);
    let impostor = Keypair::new();
    let place = place_pda(LAT_E4, LNG_E4);

    assert!(!send_visit(&mut svm, &visitor, &impostor, place, keeper.pubkey()));
    assert!(svm.get_account(&visit_pda(place, visitor.pubkey())).is_none());
}

#[test]
fn test_likes_and_visits_accumulate_separately() {
    let (mut svm, _, verifier, keeper) = setup();
    let visitor = funded(&mut svm);
    let place = place_pda(LAT_E4, LNG_E4);

    // Le même wallet like puis visite : les deux compteurs coexistent sur
    // le même KeeperStats (créé par le premier des deux, init_if_needed).
    assert!(send_like(&mut svm, &visitor, place, keeper.pubkey()));
    assert!(send_visit(&mut svm, &visitor, &verifier, place, keeper.pubkey()));

    let stats = read_stats(&svm, keeper.pubkey());
    assert_eq!(stats.likes_received, 1);
    assert_eq!(stats.visits_received, 1);
    assert_eq!(stats.keeper, keeper.pubkey());
}
