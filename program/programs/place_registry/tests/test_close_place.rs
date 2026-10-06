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

// Cellule de test (tour Eiffel, 48.8584, 2.2945) en 1e-4 degrés.
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

fn send_close(svm: &mut LiteSVM, admin: &Keypair, keeper: Pubkey, lat_e4: i32, lng_e4: i32) -> bool {
    let instruction = Instruction::new_with_bytes(
        place_registry::id(),
        &place_registry::instruction::ClosePlace {}.data(),
        place_registry::accounts::ClosePlace {
            admin: admin.pubkey(),
            config: config_pda(),
            keeper,
            place: place_pda(lat_e4, lng_e4),
        }
        .to_account_metas(None),
    );
    send(svm, admin, &[], instruction)
}

/// SVM prêt à l'emploi : config initialisée + un lieu enregistré.
fn setup() -> (LiteSVM, Keypair, Keypair, Keypair) {
    let mut svm = svm_with_program();
    let admin = funded(&mut svm);
    let verifier = Keypair::new();
    assert!(initialize_config(&mut svm, &admin, verifier.pubkey()));
    let keeper = funded(&mut svm);
    assert!(send_register(&mut svm, &keeper, &verifier, LAT_E4, LNG_E4));
    (svm, admin, verifier, keeper)
}

#[test]
fn test_admin_closes_and_cell_is_free_again() {
    let (mut svm, admin, verifier, keeper) = setup();

    assert!(send_close(&mut svm, &admin, keeper.pubkey(), LAT_E4, LNG_E4));
    assert!(svm.get_account(&place_pda(LAT_E4, LNG_E4)).is_none());

    // La cellule est libre : un autre gardien peut la capturer.
    let second = funded(&mut svm);
    assert!(send_register(&mut svm, &second, &verifier, LAT_E4, LNG_E4));

    let account = svm.get_account(&place_pda(LAT_E4, LNG_E4)).unwrap();
    let mut data: &[u8] = &account.data;
    let place = place_registry::state::Place::try_deserialize(&mut data).unwrap();
    assert_eq!(place.keeper, second.pubkey());
}

#[test]
fn test_rent_refunded_to_keeper() {
    let (mut svm, admin, _, keeper) = setup();
    let before = svm.get_balance(&keeper.pubkey()).unwrap();

    assert!(send_close(&mut svm, &admin, keeper.pubkey(), LAT_E4, LNG_E4));

    // Le rent du PDA revient au gardien (l'admin paie les frais de tx).
    assert!(svm.get_balance(&keeper.pubkey()).unwrap() > before);
}

#[test]
fn test_non_admin_rejected() {
    let (mut svm, _, _, keeper) = setup();
    let impostor = funded(&mut svm);

    assert!(!send_close(&mut svm, &impostor, keeper.pubkey(), LAT_E4, LNG_E4));
    assert!(svm.get_account(&place_pda(LAT_E4, LNG_E4)).is_some());
}

#[test]
fn test_wrong_keeper_account_rejected() {
    let (mut svm, admin, _, _) = setup();
    let stranger = Keypair::new();

    // Rediriger le rent vers un autre compte que le gardien : refusé.
    assert!(!send_close(&mut svm, &admin, stranger.pubkey(), LAT_E4, LNG_E4));
    assert!(svm.get_account(&place_pda(LAT_E4, LNG_E4)).is_some());
}
