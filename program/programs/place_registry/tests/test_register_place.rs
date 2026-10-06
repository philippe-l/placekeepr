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

fn register_ix(keeper: Pubkey, verifier: Pubkey, lat_e4: i32, lng_e4: i32) -> Instruction {
    Instruction::new_with_bytes(
        place_registry::id(),
        &place_registry::instruction::RegisterPlace { lat_e4, lng_e4 }.data(),
        place_registry::accounts::RegisterPlace {
            keeper,
            place: place_pda(lat_e4, lng_e4),
            config: config_pda(),
            verifier,
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    )
}

fn send_register(svm: &mut LiteSVM, keeper: &Keypair, verifier: &Keypair, lat_e4: i32, lng_e4: i32) -> bool {
    let instruction = register_ix(keeper.pubkey(), verifier.pubkey(), lat_e4, lng_e4);
    send(svm, keeper, &[verifier], instruction)
}

/// SVM prêt à l'emploi : programme chargé + config initialisée.
fn setup() -> (LiteSVM, Keypair, Keypair) {
    let mut svm = svm_with_program();
    let admin = funded(&mut svm);
    let verifier = Keypair::new();
    assert!(initialize_config(&mut svm, &admin, verifier.pubkey()));
    (svm, admin, verifier)
}

#[test]
fn test_register_place() {
    let (mut svm, _, verifier) = setup();
    let keeper = funded(&mut svm);

    assert!(send_register(&mut svm, &keeper, &verifier, LAT_E4, LNG_E4));

    let account = svm.get_account(&place_pda(LAT_E4, LNG_E4)).unwrap();
    let mut data: &[u8] = &account.data;
    let place = place_registry::state::Place::try_deserialize(&mut data).unwrap();
    assert_eq!(place.keeper, keeper.pubkey());
    assert_eq!(place.lat_e4, LAT_E4);
    assert_eq!(place.lng_e4, LNG_E4);
    assert_eq!(place.registered_at, NOW);
}

#[test]
fn test_wrong_verifier_rejected() {
    let (mut svm, _, _) = setup();
    let keeper = funded(&mut svm);
    let impostor = Keypair::new();

    // Signataire valide côté runtime, mais pas le vérifieur de la config.
    assert!(!send_register(&mut svm, &keeper, &impostor, LAT_E4, LNG_E4));
    assert!(svm.get_account(&place_pda(LAT_E4, LNG_E4)).is_none());
}

#[test]
fn test_same_cell_twice_fails() {
    let (mut svm, _, verifier) = setup();
    let first = funded(&mut svm);
    let second = funded(&mut svm);

    assert!(send_register(&mut svm, &first, &verifier, LAT_E4, LNG_E4));
    // Même cellule, autre wallet : init du PDA impossible, la tx échoue.
    assert!(!send_register(&mut svm, &second, &verifier, LAT_E4, LNG_E4));

    // Le premier gardien reste le gardien.
    let account = svm.get_account(&place_pda(LAT_E4, LNG_E4)).unwrap();
    let mut data: &[u8] = &account.data;
    let place = place_registry::state::Place::try_deserialize(&mut data).unwrap();
    assert_eq!(place.keeper, first.pubkey());
}

#[test]
fn test_adjacent_cell_ok() {
    let (mut svm, _, verifier) = setup();
    let keeper = funded(&mut svm);

    // Deux cellules voisines (~11 m) : deux lieux distincts.
    assert!(send_register(&mut svm, &keeper, &verifier, LAT_E4, LNG_E4));
    assert!(send_register(&mut svm, &keeper, &verifier, LAT_E4 + 1, LNG_E4));
}

#[test]
fn test_out_of_range_rejected() {
    let (mut svm, _, verifier) = setup();
    let keeper = funded(&mut svm);

    assert!(!send_register(&mut svm, &keeper, &verifier, 900_001, LNG_E4));
    assert!(!send_register(&mut svm, &keeper, &verifier, LAT_E4, 1_800_001));
    assert!(!send_register(&mut svm, &keeper, &verifier, -900_001, LNG_E4));
}

fn set_verifier_ix(admin: Pubkey, verifier: Pubkey) -> Instruction {
    Instruction::new_with_bytes(
        place_registry::id(),
        &place_registry::instruction::SetVerifier { verifier }.data(),
        place_registry::accounts::SetVerifier {
            admin,
            config: config_pda(),
        }
        .to_account_metas(None),
    )
}

#[test]
fn test_verifier_rotation() {
    let (mut svm, admin, old_verifier) = setup();
    let keeper = funded(&mut svm);
    let new_verifier = Keypair::new();

    assert!(send(
        &mut svm,
        &admin,
        &[],
        set_verifier_ix(admin.pubkey(), new_verifier.pubkey())
    ));

    // L'ancien vérifieur ne passe plus, le nouveau oui.
    assert!(!send_register(&mut svm, &keeper, &old_verifier, LAT_E4, LNG_E4));
    assert!(send_register(&mut svm, &keeper, &new_verifier, LAT_E4, LNG_E4));
}

#[test]
fn test_rotation_requires_admin() {
    let (mut svm, _, _) = setup();
    let impostor = funded(&mut svm);

    assert!(!send(
        &mut svm,
        &impostor,
        &[],
        set_verifier_ix(impostor.pubkey(), Keypair::new().pubkey())
    ));
}
