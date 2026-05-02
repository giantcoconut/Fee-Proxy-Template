// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import {IntuitionFeeProxy} from "../IntuitionFeeProxy.sol";

/// @title IntuitionFeeProxyV2
/// @notice Test implementation used to prove versioned upgrades preserve state and expose new behavior.
contract IntuitionFeeProxyV2 is IntuitionFeeProxy {
    function versionLabel() external pure returns (string memory) {
        return "v2";
    }
}
