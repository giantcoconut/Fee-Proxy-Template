// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

/// @title RejectNativeTransfer
/// @notice Test helper that rejects native token transfers.
contract RejectNativeTransfer {
    receive() external payable {
        revert("NATIVE_TRANSFER_REJECTED");
    }
}
