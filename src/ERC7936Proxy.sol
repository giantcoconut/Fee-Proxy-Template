// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import {Errors} from "./libraries/Errors.sol";

interface IERC1822Proxiable {
    function proxiableUUID() external view returns (bytes32);
}

contract ERC7936Proxy {
    bytes32 private constant ERC1967_IMPLEMENTATION_SLOT =
        0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;

    bytes32 private constant ERC7936_STORAGE_SLOT =
        0xb51a3a74895f87adda83c43536dba88c918805589a16018c9c4a81c2ec341d55;

    struct ERC7936Storage {
        address admin;
        bytes32 defaultVersion;
        bytes32[] versions;
        mapping(bytes32 => address) implementations;
        mapping(bytes32 => uint256) versionIndexes;
    }

    event VersionedProxyAdminTransferred(address indexed oldAdmin, address indexed newAdmin);

    event VersionRegistered(bytes32 indexed version, address indexed implementation);

    event VersionRemoved(bytes32 indexed version);

    event DefaultVersionChanged(bytes32 indexed oldVersion, bytes32 indexed newVersion);

    event Upgraded(address indexed implementation);

    modifier onlyVersionedProxyAdmin() {
        if (msg.sender != _getERC7936Storage().admin) {
            revert Errors.IntuitionFeeProxy_NotVersionedProxyAdmin();
        }
        _;
    }

    constructor(
        address initialAdmin,
        bytes32 initialVersion,
        address initialImplementation,
        bytes memory initializationData
    ) payable {
        if (initialAdmin == address(0)) {
            revert Errors.IntuitionFeeProxy_ZeroAddress();
        }

        ERC7936Storage storage $ = _getERC7936Storage();
        $.admin = initialAdmin;
        emit VersionedProxyAdminTransferred(address(0), initialAdmin);

        _registerVersion($, initialVersion, initialImplementation);
        _setDefaultVersion($, initialVersion, initializationData);
    }

    function versionedProxyAdmin() external view returns (address) {
        return _getERC7936Storage().admin;
    }

    function transferVersionedProxyAdmin(address newAdmin) external onlyVersionedProxyAdmin {
        if (newAdmin == address(0)) {
            revert Errors.IntuitionFeeProxy_ZeroAddress();
        }

        ERC7936Storage storage $ = _getERC7936Storage();
        address oldAdmin = $.admin;
        $.admin = newAdmin;
        emit VersionedProxyAdminTransferred(oldAdmin, newAdmin);
    }

    function registerVersion(bytes32 version, address implementation) external onlyVersionedProxyAdmin {
        _registerVersion(_getERC7936Storage(), version, implementation);
    }

    function removeVersion(bytes32 version) external onlyVersionedProxyAdmin {
        ERC7936Storage storage $ = _getERC7936Storage();
        if ($.versionIndexes[version] == 0) {
            revert Errors.IntuitionFeeProxy_VersionNotRegistered();
        }
        if (version == $.defaultVersion) {
            revert Errors.IntuitionFeeProxy_CannotRemoveDefaultVersion();
        }

        uint256 index = $.versionIndexes[version] - 1;
        uint256 lastIndex = $.versions.length - 1;
        if (index != lastIndex) {
            bytes32 lastVersion = $.versions[lastIndex];
            $.versions[index] = lastVersion;
            $.versionIndexes[lastVersion] = index + 1;
        }

        $.versions.pop();
        delete $.versionIndexes[version];
        delete $.implementations[version];

        emit VersionRemoved(version);
    }

    function setDefaultVersion(bytes32 version) external onlyVersionedProxyAdmin {
        _setDefaultVersion(_getERC7936Storage(), version, "");
    }

    function upgradeToVersion(
        bytes32 version,
        address implementation,
        bytes calldata migrationData
    ) external payable onlyVersionedProxyAdmin {
        ERC7936Storage storage $ = _getERC7936Storage();

        if ($.versionIndexes[version] == 0) {
            _registerVersion($, version, implementation);
        } else if ($.implementations[version] != implementation) {
            revert Errors.IntuitionFeeProxy_VersionAlreadyRegistered();
        }

        _setDefaultVersion($, version, migrationData);
    }

    function getImplementation(bytes32 version) external view returns (address) {
        return _requireRegisteredVersion(_getERC7936Storage(), version);
    }

    function getActiveImplementation() external view returns (address) {
        return _getImplementation();
    }

    function getDefaultVersion() external view returns (bytes32) {
        return _getERC7936Storage().defaultVersion;
    }

    function getVersions() external view returns (bytes32[] memory) {
        return _getERC7936Storage().versions;
    }

    function executeAtVersion(bytes32 version, bytes calldata data) external payable returns (bytes memory) {
        address implementation = _requireRegisteredVersion(_getERC7936Storage(), version);

        (bool success, bytes memory returndata) = implementation.delegatecall(data);
        if (!success) {
            assembly ("memory-safe") {
                revert(add(returndata, 0x20), mload(returndata))
            }
        }

        return returndata;
    }

    fallback() external payable {
        _delegate(_getImplementation());
    }

    receive() external payable {
        _delegate(_getImplementation());
    }

    function _registerVersion(
        ERC7936Storage storage $,
        bytes32 version,
        address implementation
    ) internal {
        if (version == bytes32(0)) {
            revert Errors.IntuitionFeeProxy_InvalidVersion();
        }
        if (implementation.code.length == 0) {
            revert Errors.IntuitionFeeProxy_InvalidImplementation();
        }
        if ($.versionIndexes[version] != 0) {
            revert Errors.IntuitionFeeProxy_VersionAlreadyRegistered();
        }

        try IERC1822Proxiable(implementation).proxiableUUID() returns (bytes32 slot) {
            if (slot != ERC1967_IMPLEMENTATION_SLOT) {
                revert Errors.IntuitionFeeProxy_UnsupportedProxiableUUID(slot);
            }
        } catch {
            revert Errors.IntuitionFeeProxy_InvalidImplementation();
        }

        $.implementations[version] = implementation;
        $.versions.push(version);
        $.versionIndexes[version] = $.versions.length;

        emit VersionRegistered(version, implementation);
    }

    function _setDefaultVersion(
        ERC7936Storage storage $,
        bytes32 version,
        bytes memory data
    ) internal {
        address implementation = _requireRegisteredVersion($, version);
        bytes32 oldVersion = $.defaultVersion;
        $.defaultVersion = version;

        _upgradeToAndCall(implementation, data);
        emit DefaultVersionChanged(oldVersion, version);
    }

    function _requireRegisteredVersion(
        ERC7936Storage storage $,
        bytes32 version
    ) internal view returns (address implementation) {
        implementation = $.implementations[version];
        if (implementation == address(0) || $.versionIndexes[version] == 0) {
            revert Errors.IntuitionFeeProxy_VersionNotRegistered();
        }
    }

    function _getERC7936Storage() private pure returns (ERC7936Storage storage $) {
        assembly ("memory-safe") {
            $.slot := ERC7936_STORAGE_SLOT
        }
    }

    function _getImplementation() private view returns (address implementation) {
        bytes32 slot = ERC1967_IMPLEMENTATION_SLOT;
        assembly ("memory-safe") {
            implementation := sload(slot)
        }
    }

    function _setImplementation(address implementation) private {
        if (implementation.code.length == 0) {
            revert Errors.IntuitionFeeProxy_InvalidImplementation();
        }

        bytes32 slot = ERC1967_IMPLEMENTATION_SLOT;
        assembly ("memory-safe") {
            sstore(slot, implementation)
        }
    }

    function _upgradeToAndCall(address implementation, bytes memory data) private {
        _setImplementation(implementation);
        emit Upgraded(implementation);

        if (data.length > 0) {
            (bool success, bytes memory returndata) = implementation.delegatecall(data);
            if (!success) {
                assembly ("memory-safe") {
                    revert(add(returndata, 0x20), mload(returndata))
                }
            }
        } else if (msg.value > 0) {
            revert Errors.IntuitionFeeProxy_InsufficientValue();
        }
    }

    function _delegate(address implementation) private {
        assembly {
            calldatacopy(0x00, 0x00, calldatasize())
            let result := delegatecall(gas(), implementation, 0x00, calldatasize(), 0x00, 0x00)
            returndatacopy(0x00, 0x00, returndatasize())

            switch result
            case 0 {
                revert(0x00, returndatasize())
            }
            default {
                return(0x00, returndatasize())
            }
        }
    }
}
