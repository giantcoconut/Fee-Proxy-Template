// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

/// @title Errors
/// @notice Custom errors for IntuitionFeeProxy contract
library Errors {
    /// @notice Caller is not a whitelisted admin
    error IntuitionFeeProxy_NotWhitelistedAdmin();

    /// @notice Insufficient native token value sent with transaction
    error IntuitionFeeProxy_InsufficientValue();

    /// @notice Invalid multisig address (zero address)
    error IntuitionFeeProxy_InvalidMultisigAddress();

    /// @notice Invalid MultiVault address (zero address)
    error IntuitionFeeProxy_InvalidMultiVaultAddress();

    /// @notice Native token transfer failed
    error IntuitionFeeProxy_TransferFailed();

    /// @notice Array lengths do not match
    error IntuitionFeeProxy_WrongArrayLengths();

    /// @notice Zero address provided where not allowed
    error IntuitionFeeProxy_ZeroAddress();

    /// @notice Fee percentage exceeds maximum allowed (100%)
    error IntuitionFeeProxy_FeePercentageTooHigh();

    /// @notice Receiver must match the caller for user-facing proxy flows
    error IntuitionFeeProxy_InvalidReceiver();

    /// @notice Caller cannot withdraw accrued fees
    error IntuitionFeeProxy_NotFeeWithdrawer();

    /// @notice Withdrawal or sweep amount cannot be zero
    error IntuitionFeeProxy_ZeroAmount();

    /// @notice Requested fee withdrawal exceeds accrued fees
    error IntuitionFeeProxy_InsufficientAccruedFees();

    /// @notice Requested sweep exceeds non-fee native token balance
    error IntuitionFeeProxy_InsufficientNonFeeBalance();
}
