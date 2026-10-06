use {
    anchor_lang::{
        prelude::Pubkey,
        solana_program::{
            clock::Clock,
            instruction::{AccountMeta, Instruction},
            system_program,
        },
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

const NOW: i64 = 1_751_900_000;

/// Dépôt de référence : 1 SOL tombe pile sur le barème 60/20/20.
const POT: u64 = 1_000_000_000;

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

fn treasury_pda() -> Pubkey {
    Pubkey::find_program_address(
        &[place_registry::constants::TREASURY_SEED],
        &place_registry::id(),
    )
    .0
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
    svm.airdrop(&keypair.pubkey(), 10_000_000_000).unwrap();
    keypair
}

fn send(
    svm: &mut LiteSVM,
    payer: &Keypair,
    extra_signers: &[&Keypair],
    instruction: Instruction,
) -> bool {
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

fn send_set_treasury(svm: &mut LiteSVM, admin: &Keypair, destination: Pubkey) -> bool {
    let instruction = Instruction::new_with_bytes(
        place_registry::id(),
        &place_registry::instruction::SetTreasury { destination }.data(),
        place_registry::accounts::SetTreasury {
            admin: admin.pubkey(),
            config: config_pda(),
            treasury: treasury_pda(),
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
            keeper_stats: keeper_stats_pda(keeper),
            vault: vault_pda(place),
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
            keeper_stats: keeper_stats_pda(keeper),
            vault: Some(vault_pda(place)),
        }
        .to_account_metas(None),
    );
    send(svm, liker, &[], instruction)
}

fn send_deposit(svm: &mut LiteSVM, payer: &Keypair, place: Pubkey, amount: u64) -> bool {
    let instruction = Instruction::new_with_bytes(
        place_registry::id(),
        &place_registry::instruction::DepositRoyalty { amount }.data(),
        place_registry::accounts::DepositRoyalty {
            payer: payer.pubkey(),
            place,
            vault: vault_pda(place),
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    );
    send(svm, payer, &[], instruction)
}

/// Distribution déclenchée par `cranker`, qui n'encaisse rien : les frais de
/// transaction ne polluent donc aucun solde vérifié.
fn send_distribute(
    svm: &mut LiteSVM,
    cranker: &Keypair,
    place: Pubkey,
    keeper: Pubkey,
    treasury: Pubkey,
    likers: &[Pubkey],
) -> bool {
    let mut metas = place_registry::accounts::DistributeRoyalties {
        place,
        vault: vault_pda(place),
        keeper,
        treasury_config: treasury_pda(),
        treasury,
    }
    .to_account_metas(None);
    metas.extend(likers.iter().map(|liker| AccountMeta::new(*liker, false)));

    let instruction = Instruction::new_with_bytes(
        place_registry::id(),
        &place_registry::instruction::DistributeRoyalties {}.data(),
        metas,
    );
    send(svm, cranker, &[], instruction)
}

fn send_close_vault(svm: &mut LiteSVM, admin: &Keypair, place: Pubkey, keeper: Pubkey) -> bool {
    let instruction = Instruction::new_with_bytes(
        place_registry::id(),
        &place_registry::instruction::ClosePlaceVault {}.data(),
        place_registry::accounts::ClosePlaceVault {
            admin: admin.pubkey(),
            config: config_pda(),
            place,
            keeper,
            vault: vault_pda(place),
        }
        .to_account_metas(None),
    );
    send(svm, admin, &[], instruction)
}

fn read_vault(svm: &LiteSVM, place: Pubkey) -> place_registry::state::PlaceVault {
    let account = svm.get_account(&vault_pda(place)).unwrap();
    let mut data: &[u8] = &account.data;
    place_registry::state::PlaceVault::try_deserialize(&mut data).unwrap()
}

/// Solde du vault au-delà de son plancher de rent — ce qui est distribuable.
fn vault_pot(svm: &LiteSVM, place: Pubkey) -> u64 {
    let account = svm.get_account(&vault_pda(place)).unwrap();
    let floor = svm.minimum_balance_for_rent_exemption(account.data.len());
    account.lamports.saturating_sub(floor)
}

/// Les likeurs actifs dans l'ordre du ring buffer : exactement ce que
/// `distribute_royalties` attend en remaining_accounts.
fn active_likers(svm: &LiteSVM, place: Pubkey) -> Vec<Pubkey> {
    let vault = read_vault(svm, place);
    vault.active_likers().copied().collect()
}

/// Config + trésorerie posée + un lieu enregistré.
/// Rend (svm, admin, keeper, treasury, place).
fn setup() -> (LiteSVM, Keypair, Keypair, Keypair, Pubkey) {
    let mut svm = svm_with_program();
    let admin = funded(&mut svm);
    let verifier = Keypair::new();
    assert!(initialize_config(&mut svm, &admin, verifier.pubkey()));

    // Trésorerie distincte de l'admin : ses frais de tx ne doivent pas
    // masquer ce qu'elle encaisse.
    let treasury = funded(&mut svm);
    assert!(send_set_treasury(&mut svm, &admin, treasury.pubkey()));

    let keeper = funded(&mut svm);
    assert!(send_register(&mut svm, &keeper, &verifier));

    (svm, admin, keeper, treasury, place_pda(LAT_E4, LNG_E4))
}

#[test]
fn test_set_treasury_requires_admin() {
    let (mut svm, _admin, _keeper, treasury, _place) = setup();
    let intruder = funded(&mut svm);

    assert!(!send_set_treasury(&mut svm, &intruder, intruder.pubkey()));

    let account = svm.get_account(&treasury_pda()).unwrap();
    let mut data: &[u8] = &account.data;
    let stored = place_registry::state::Treasury::try_deserialize(&mut data).unwrap();
    assert_eq!(stored.destination, treasury.pubkey());
}

#[test]
fn test_set_treasury_rotates_destination() {
    let (mut svm, admin, _keeper, _treasury, _place) = setup();
    let next = Keypair::new();

    assert!(send_set_treasury(&mut svm, &admin, next.pubkey()));

    let account = svm.get_account(&treasury_pda()).unwrap();
    let mut data: &[u8] = &account.data;
    let stored = place_registry::state::Treasury::try_deserialize(&mut data).unwrap();
    assert_eq!(stored.destination, next.pubkey());
}

#[test]
fn test_deposit_creates_vault_and_credits_it() {
    let (mut svm, _admin, _keeper, _treasury, place) = setup();
    let buyer = funded(&mut svm);

    assert!(svm.get_account(&vault_pda(place)).is_none());
    assert!(send_deposit(&mut svm, &buyer, place, POT));

    assert_eq!(vault_pot(&svm, place), POT);
    assert_eq!(read_vault(&svm, place).place, place);
    assert_eq!(read_vault(&svm, place).recent_len, 0);
}

#[test]
fn test_empty_deposit_rejected() {
    let (mut svm, _admin, _keeper, _treasury, place) = setup();
    let buyer = funded(&mut svm);

    assert!(!send_deposit(&mut svm, &buyer, place, 0));
    assert!(svm.get_account(&vault_pda(place)).is_none());
}

#[test]
fn test_distribute_splits_60_20_20() {
    let (mut svm, _admin, keeper, treasury, place) = setup();
    let first = funded(&mut svm);
    let second = funded(&mut svm);
    assert!(send_like(&mut svm, &first, place, keeper.pubkey()));
    assert!(send_like(&mut svm, &second, place, keeper.pubkey()));

    let buyer = funded(&mut svm);
    assert!(send_deposit(&mut svm, &buyer, place, POT));

    let keeper_before = svm.get_balance(&keeper.pubkey()).unwrap();
    let treasury_before = svm.get_balance(&treasury.pubkey()).unwrap();
    let first_before = svm.get_balance(&first.pubkey()).unwrap();
    let second_before = svm.get_balance(&second.pubkey()).unwrap();

    let cranker = funded(&mut svm);
    let likers = active_likers(&svm, place);
    assert_eq!(likers, vec![first.pubkey(), second.pubkey()]);
    assert!(send_distribute(
        &mut svm,
        &cranker,
        place,
        keeper.pubkey(),
        treasury.pubkey(),
        &likers
    ));

    assert_eq!(
        svm.get_balance(&keeper.pubkey()).unwrap() - keeper_before,
        600_000_000
    );
    assert_eq!(
        svm.get_balance(&treasury.pubkey()).unwrap() - treasury_before,
        200_000_000
    );
    assert_eq!(
        svm.get_balance(&first.pubkey()).unwrap() - first_before,
        100_000_000
    );
    assert_eq!(
        svm.get_balance(&second.pubkey()).unwrap() - second_before,
        100_000_000
    );

    // Vault vidé jusqu'à son plancher de rent, et pas en-dessous : le ring
    // buffer doit survivre à la distribution.
    assert_eq!(vault_pot(&svm, place), 0);
    assert!(svm.get_account(&vault_pda(place)).is_some());
    assert_eq!(read_vault(&svm, place).total_distributed, POT);
}

#[test]
fn test_distribute_without_likers_gives_the_rest_to_the_keeper() {
    let (mut svm, _admin, keeper, treasury, place) = setup();
    let buyer = funded(&mut svm);
    assert!(send_deposit(&mut svm, &buyer, place, POT));

    let keeper_before = svm.get_balance(&keeper.pubkey()).unwrap();
    let treasury_before = svm.get_balance(&treasury.pubkey()).unwrap();

    let cranker = funded(&mut svm);
    assert!(send_distribute(
        &mut svm,
        &cranker,
        place,
        keeper.pubkey(),
        treasury.pubkey(),
        &[]
    ));

    // 60 % + la part likers que personne ne réclame.
    assert_eq!(
        svm.get_balance(&keeper.pubkey()).unwrap() - keeper_before,
        800_000_000
    );
    assert_eq!(
        svm.get_balance(&treasury.pubkey()).unwrap() - treasury_before,
        200_000_000
    );
    assert_eq!(vault_pot(&svm, place), 0);
}

#[test]
fn test_rounding_dust_goes_to_the_keeper() {
    let (mut svm, _admin, keeper, treasury, place) = setup();
    let likers: Vec<Keypair> = (0..3).map(|_| funded(&mut svm)).collect();
    for liker in &likers {
        assert!(send_like(&mut svm, liker, place, keeper.pubkey()));
    }

    let buyer = funded(&mut svm);
    // 1 lamport de plus que le barème : la division par 3 ne tombe pas juste.
    assert!(send_deposit(&mut svm, &buyer, place, POT + 1));

    let keeper_before = svm.get_balance(&keeper.pubkey()).unwrap();
    let cranker = funded(&mut svm);
    let likers = active_likers(&svm, place);
    assert!(send_distribute(
        &mut svm,
        &cranker,
        place,
        keeper.pubkey(),
        treasury.pubkey(),
        &likers
    ));

    // 200_000_000 / 3 = 66_666_666 par likeur, 2 lamports d'arrondi au
    // gardien : 600_000_000 + 1 (part gardien du lamport en trop) + 2.
    assert_eq!(
        svm.get_balance(&keeper.pubkey()).unwrap() - keeper_before,
        600_000_003
    );
    assert_eq!(vault_pot(&svm, place), 0);
}

#[test]
fn test_ring_buffer_keeps_the_last_ten_likers() {
    let (mut svm, _admin, keeper, treasury, place) = setup();
    let likers: Vec<Keypair> = (0..11).map(|_| funded(&mut svm)).collect();
    for liker in &likers {
        assert!(send_like(&mut svm, liker, place, keeper.pubkey()));
    }

    let active = active_likers(&svm, place);
    assert_eq!(active.len(), place_registry::constants::RECENT_LIKERS);
    // Le premier likeur est sorti du buffer, les dix suivants y sont.
    assert!(!active.contains(&likers[0].pubkey()));
    for liker in &likers[1..] {
        assert!(active.contains(&liker.pubkey()));
    }

    let buyer = funded(&mut svm);
    assert!(send_deposit(&mut svm, &buyer, place, POT));
    let evicted_before = svm.get_balance(&likers[0].pubkey()).unwrap();
    let last_before = svm.get_balance(&likers[10].pubkey()).unwrap();

    let cranker = funded(&mut svm);
    assert!(send_distribute(
        &mut svm,
        &cranker,
        place,
        keeper.pubkey(),
        treasury.pubkey(),
        &active
    ));

    assert_eq!(svm.get_balance(&likers[0].pubkey()).unwrap(), evicted_before);
    assert_eq!(
        svm.get_balance(&likers[10].pubkey()).unwrap() - last_before,
        20_000_000
    );
}

#[test]
fn test_unlike_drops_the_liker_from_the_split() {
    let (mut svm, _admin, keeper, treasury, place) = setup();
    let staying = funded(&mut svm);
    let leaving = funded(&mut svm);
    assert!(send_like(&mut svm, &staying, place, keeper.pubkey()));
    assert!(send_like(&mut svm, &leaving, place, keeper.pubkey()));

    // Liker puis unliker rend le rent du PDA Like : sans retrait du buffer,
    // la part de royalties serait acquise gratuitement.
    assert!(send_unlike(&mut svm, &leaving, place, keeper.pubkey()));
    assert_eq!(active_likers(&svm, place), vec![staying.pubkey()]);

    let buyer = funded(&mut svm);
    assert!(send_deposit(&mut svm, &buyer, place, POT));
    let leaving_before = svm.get_balance(&leaving.pubkey()).unwrap();
    let staying_before = svm.get_balance(&staying.pubkey()).unwrap();

    let cranker = funded(&mut svm);
    let likers = active_likers(&svm, place);
    assert!(send_distribute(
        &mut svm,
        &cranker,
        place,
        keeper.pubkey(),
        treasury.pubkey(),
        &likers
    ));

    assert_eq!(svm.get_balance(&leaving.pubkey()).unwrap(), leaving_before);
    // Le likeur restant prend toute la part likers.
    assert_eq!(
        svm.get_balance(&staying.pubkey()).unwrap() - staying_before,
        200_000_000
    );
}

#[test]
fn test_distribute_rejects_wrong_liker_accounts() {
    let (mut svm, _admin, keeper, treasury, place) = setup();
    let first = funded(&mut svm);
    let second = funded(&mut svm);
    assert!(send_like(&mut svm, &first, place, keeper.pubkey()));
    assert!(send_like(&mut svm, &second, place, keeper.pubkey()));

    let buyer = funded(&mut svm);
    assert!(send_deposit(&mut svm, &buyer, place, POT));
    let cranker = funded(&mut svm);
    let thief = funded(&mut svm);

    // Un intrus à la place d'un likeur.
    assert!(!send_distribute(
        &mut svm,
        &cranker,
        place,
        keeper.pubkey(),
        treasury.pubkey(),
        &[first.pubkey(), thief.pubkey()]
    ));
    // Ordre inversé : le buffer fait foi, pas l'appelant.
    assert!(!send_distribute(
        &mut svm,
        &cranker,
        place,
        keeper.pubkey(),
        treasury.pubkey(),
        &[second.pubkey(), first.pubkey()]
    ));
    // Liste tronquée : le reste irait au gardien, donc refus.
    assert!(!send_distribute(
        &mut svm,
        &cranker,
        place,
        keeper.pubkey(),
        treasury.pubkey(),
        &[first.pubkey()]
    ));

    assert_eq!(vault_pot(&svm, place), POT);
}

#[test]
fn test_distribute_rejects_a_foreign_treasury() {
    let (mut svm, _admin, keeper, _treasury, place) = setup();
    let buyer = funded(&mut svm);
    assert!(send_deposit(&mut svm, &buyer, place, POT));

    let cranker = funded(&mut svm);
    let thief = funded(&mut svm);
    assert!(!send_distribute(
        &mut svm,
        &cranker,
        place,
        keeper.pubkey(),
        thief.pubkey(),
        &[]
    ));
    assert_eq!(vault_pot(&svm, place), POT);
}

#[test]
fn test_distribute_rejects_a_foreign_keeper() {
    let (mut svm, _admin, _keeper, treasury, place) = setup();
    let buyer = funded(&mut svm);
    assert!(send_deposit(&mut svm, &buyer, place, POT));

    let cranker = funded(&mut svm);
    let thief = funded(&mut svm);
    assert!(!send_distribute(
        &mut svm,
        &cranker,
        place,
        thief.pubkey(),
        treasury.pubkey(),
        &[]
    ));
    assert_eq!(vault_pot(&svm, place), POT);
}

#[test]
fn test_distribute_on_an_empty_vault_fails() {
    let (mut svm, _admin, keeper, treasury, place) = setup();
    let liker = funded(&mut svm);
    // Le like crée le vault sans rien y déposer.
    assert!(send_like(&mut svm, &liker, place, keeper.pubkey()));
    assert_eq!(vault_pot(&svm, place), 0);

    let cranker = funded(&mut svm);
    assert!(!send_distribute(
        &mut svm,
        &cranker,
        place,
        keeper.pubkey(),
        treasury.pubkey(),
        &[liker.pubkey()]
    ));
}

#[test]
fn test_second_distribution_after_a_new_deposit() {
    let (mut svm, _admin, keeper, treasury, place) = setup();
    let buyer = funded(&mut svm);
    let cranker = funded(&mut svm);

    assert!(send_deposit(&mut svm, &buyer, place, POT));
    assert!(send_distribute(
        &mut svm,
        &cranker,
        place,
        keeper.pubkey(),
        treasury.pubkey(),
        &[]
    ));
    svm.expire_blockhash();
    assert!(send_deposit(&mut svm, &buyer, place, POT));
    assert!(send_distribute(
        &mut svm,
        &cranker,
        place,
        keeper.pubkey(),
        treasury.pubkey(),
        &[]
    ));

    assert_eq!(read_vault(&svm, place).total_distributed, 2 * POT);
    assert_eq!(vault_pot(&svm, place), 0);
}

#[test]
fn test_close_vault_returns_everything_to_the_keeper() {
    let (mut svm, admin, keeper, _treasury, place) = setup();
    let buyer = funded(&mut svm);
    assert!(send_deposit(&mut svm, &buyer, place, POT));

    let keeper_before = svm.get_balance(&keeper.pubkey()).unwrap();
    let vault_balance = svm.get_account(&vault_pda(place)).unwrap().lamports;

    assert!(send_close_vault(&mut svm, &admin, place, keeper.pubkey()));

    assert!(svm
        .get_account(&vault_pda(place))
        .map_or(true, |account| account.lamports == 0));
    // Rent du PDA compris : la fermeture ne fait pas de split.
    assert_eq!(
        svm.get_balance(&keeper.pubkey()).unwrap() - keeper_before,
        vault_balance
    );
}

#[test]
fn test_close_vault_requires_admin() {
    let (mut svm, _admin, keeper, _treasury, place) = setup();
    let buyer = funded(&mut svm);
    assert!(send_deposit(&mut svm, &buyer, place, POT));

    let intruder = funded(&mut svm);
    assert!(!send_close_vault(&mut svm, &intruder, place, keeper.pubkey()));
    assert_eq!(vault_pot(&svm, place), POT);
}

/// #43 : un likeur qui a vidé son wallet (0 lamport) ne peut pas recevoir une
/// part inférieure au minimum rent-exempt — le runtime refuserait toute la
/// transaction, et avec elle la distribution du lieu pour tout le monde. Il
/// est sauté, sa part revient au gardien.
///
/// ⚠️ LiteSVM 0.10 ne reproduit PAS le rejet : son `check_accounts_rent`
/// ignore les comptes sans données, donc un wallet. Ce test vérifie le saut et
/// la part au gardien ; le rejet lui-même a été constaté sur devnet (transfert
/// de 400 000 lamports vers une adresse neuve → InsufficientFundsForRent).
#[test]
fn test_drained_liker_below_rent_does_not_block_distribution() {
    let (mut svm, _admin, keeper, treasury, place) = setup();
    let drained = funded(&mut svm);
    let active = funded(&mut svm);
    assert!(send_like(&mut svm, &drained, place, keeper.pubkey()));
    assert!(send_like(&mut svm, &active, place, keeper.pubkey()));
    // Wallet vidé après le like : compte système à 0 lamport, donc inexistant.
    svm.set_account(drained.pubkey(), solana_account::Account::default())
        .unwrap();

    // 0,004 SOL : 20 % / 2 likeurs = 400 000 lamports chacun, sous les
    // ~890 880 du minimum rent-exempt d'un compte système.
    let small_pot = 4_000_000;
    let per_liker = small_pot / 5 / 2;
    assert!(per_liker < svm.minimum_balance_for_rent_exemption(0));
    let buyer = funded(&mut svm);
    assert!(send_deposit(&mut svm, &buyer, place, small_pot));

    let keeper_before = svm.get_balance(&keeper.pubkey()).unwrap();
    let treasury_before = svm.get_balance(&treasury.pubkey()).unwrap();
    let active_before = svm.get_balance(&active.pubkey()).unwrap();

    let cranker = funded(&mut svm);
    let likers = active_likers(&svm, place);
    assert_eq!(likers, vec![drained.pubkey(), active.pubkey()]);
    assert!(send_distribute(
        &mut svm,
        &cranker,
        place,
        keeper.pubkey(),
        treasury.pubkey(),
        &likers
    ));

    assert_eq!(svm.get_balance(&drained.pubkey()).unwrap_or(0), 0);
    assert_eq!(
        svm.get_balance(&active.pubkey()).unwrap() - active_before,
        per_liker
    );
    assert_eq!(
        svm.get_balance(&treasury.pubkey()).unwrap() - treasury_before,
        small_pot / 5
    );
    assert_eq!(
        svm.get_balance(&keeper.pubkey()).unwrap() - keeper_before,
        small_pot * 6 / 10 + per_liker
    );
    assert_eq!(vault_pot(&svm, place), 0);
}

/// Un likeur à 0 lamport dont la part suffit à le rendre rent-exempt est payé
/// normalement : le saut ne vise que les parts que le runtime refuserait.
#[test]
fn test_drained_liker_above_rent_is_paid() {
    let (mut svm, _admin, keeper, treasury, place) = setup();
    let drained = funded(&mut svm);
    assert!(send_like(&mut svm, &drained, place, keeper.pubkey()));
    svm.set_account(drained.pubkey(), solana_account::Account::default())
        .unwrap();

    let buyer = funded(&mut svm);
    assert!(send_deposit(&mut svm, &buyer, place, POT));

    let cranker = funded(&mut svm);
    let likers = active_likers(&svm, place);
    assert!(send_distribute(
        &mut svm,
        &cranker,
        place,
        keeper.pubkey(),
        treasury.pubkey(),
        &likers
    ));
    assert_eq!(svm.get_balance(&drained.pubkey()).unwrap(), 200_000_000);
}
