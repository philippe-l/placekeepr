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

fn keeper_stats_pda(keeper: Pubkey) -> Pubkey {
    Pubkey::find_program_address(
        &[place_registry::constants::KEEPER_STATS_SEED, keeper.as_ref()],
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

fn send_close_visit(svm: &mut LiteSVM, admin: &Keypair, place: Pubkey, visitor: Pubkey, keeper: Pubkey) -> bool {
    let instruction = Instruction::new_with_bytes(
        place_registry::id(),
        &place_registry::instruction::CloseVisit {}.data(),
        place_registry::accounts::CloseVisit {
            admin: admin.pubkey(),
            config: config_pda(),
            place,
            visitor,
            visit: visit_pda(place, visitor),
            keeper_stats: keeper_stats_pda(keeper),
        }
        .to_account_metas(None),
    );
    send(svm, admin, &[], instruction)
}

fn visits_received(svm: &LiteSVM, keeper: Pubkey) -> u64 {
    let account = svm.get_account(&keeper_stats_pda(keeper)).unwrap();
    let mut data: &[u8] = &account.data;
    let stats = place_registry::state::KeeperStats::try_deserialize(&mut data).unwrap();
    stats.visits_received
}

fn warp(svm: &mut LiteSVM, seconds: i64) {
    let mut clock: Clock = svm.get_sysvar();
    clock.unix_timestamp += seconds;
    svm.set_sysvar(&clock);
}

/// SVM prêt : config + lieu enregistré + deux passages du même visiteur
/// (le second après cooldown) — pour vérifier la décrémentation totale.
fn setup() -> (LiteSVM, Keypair, Keypair, Keypair) {
    let mut svm = svm_with_program();
    let admin = funded(&mut svm);
    let verifier = Keypair::new();
    assert!(initialize_config(&mut svm, &admin, verifier.pubkey()));
    let keeper = funded(&mut svm);
    assert!(send_register(&mut svm, &keeper, &verifier));
    let visitor = funded(&mut svm);
    let place = place_pda(LAT_E4, LNG_E4);
    assert!(send_visit(&mut svm, &visitor, &verifier, place, keeper.pubkey()));
    warp(&mut svm, place_registry::constants::VISIT_COOLDOWN_SECONDS);
    svm.expire_blockhash();
    assert!(send_visit(&mut svm, &visitor, &verifier, place, keeper.pubkey()));
    (svm, admin, keeper, visitor)
}

#[test]
fn test_admin_closes_visit_and_reverts_all_passages() {
    let (mut svm, admin, keeper, visitor) = setup();
    let place = place_pda(LAT_E4, LNG_E4);
    let balance_before = svm.get_balance(&visitor.pubkey()).unwrap();
    assert_eq!(visits_received(&svm, keeper.pubkey()), 2);

    assert!(send_close_visit(&mut svm, &admin, place, visitor.pubkey(), keeper.pubkey()));

    // PDA fermé, rent rendu au visiteur, les 2 passages décomptés.
    assert!(svm.get_account(&visit_pda(place, visitor.pubkey())).is_none());
    assert!(svm.get_balance(&visitor.pubkey()).unwrap() > balance_before);
    assert_eq!(visits_received(&svm, keeper.pubkey()), 0);
}

#[test]
fn test_non_admin_rejected() {
    let (mut svm, _, keeper, visitor) = setup();
    let impostor = funded(&mut svm);
    let place = place_pda(LAT_E4, LNG_E4);

    assert!(!send_close_visit(&mut svm, &impostor, place, visitor.pubkey(), keeper.pubkey()));
    assert!(svm.get_account(&visit_pda(place, visitor.pubkey())).is_some());
    assert_eq!(visits_received(&svm, keeper.pubkey()), 2);
}

#[test]
fn test_wrong_visitor_account_rejected() {
    let (mut svm, admin, keeper, visitor) = setup();
    let stranger = Keypair::new();
    let place = place_pda(LAT_E4, LNG_E4);

    // Rediriger le rent ailleurs que vers le visiteur : refusé (les seeds
    // du PDA Visit ne matchent déjà pas pour un autre visiteur).
    assert!(!send_close_visit(&mut svm, &admin, place, stranger.pubkey(), keeper.pubkey()));
    assert!(svm.get_account(&visit_pda(place, visitor.pubkey())).is_some());
}
