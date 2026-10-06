use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("Coordinates outside the valid lat/lng range")]
    CoordinatesOutOfRange,
    #[msg("Signer is not the configured verifier")]
    UnknownVerifier,
    #[msg("Only the config admin can do this")]
    Unauthorized,
    #[msg("A keeper cannot like their own place")]
    SelfLike,
    #[msg("Reputation counter would underflow")]
    ReputationUnderflow,
    #[msg("Keeper account does not match the place")]
    WrongKeeper,
    #[msg("Liker account does not match the like")]
    WrongLiker,
    #[msg("A keeper cannot visit their own place")]
    SelfVisit,
    #[msg("Same place visited less than 24h ago")]
    VisitCooldown,
    #[msg("Visitor account does not match the visit")]
    WrongVisitor,
    #[msg("Keeper stats account is not owned by this program")]
    StatsNotInitialized,
    #[msg("Treasury account does not match the registered destination")]
    WrongTreasury,
    #[msg("Deposit amount must be greater than zero")]
    EmptyDeposit,
    #[msg("Vault has nothing to distribute above its rent floor")]
    NothingToDistribute,
    #[msg("Recent liker accounts do not match the vault ring buffer")]
    RecentLikersMismatch,
    #[msg("Vault account does not belong to this place")]
    WrongVault,
    #[msg("Lamport arithmetic overflowed")]
    LamportOverflow,
}
