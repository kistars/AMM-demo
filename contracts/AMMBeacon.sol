// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {UpgradeableBeacon} from "@openzeppelin/contracts/proxy/beacon/UpgradeableBeacon.sol";

/**
 * @title AMMBeacon
 * @dev 使用 OpenZeppelin UpgradeableBeacon 的 AMM Beacon 合约
 */
contract AMMBeacon is UpgradeableBeacon {
    event ImplementationUpgraded(address indexed oldImplementation, address indexed newImplementation);

    constructor(address implementation_) UpgradeableBeacon(implementation_, msg.sender) {}

    /**
     * @dev 升级实现合约
     * @param newImplementation 新的实现合约地址
     */
    function upgrade(address newImplementation) public onlyOwner {
        address oldImplementation = implementation();
        upgradeTo(newImplementation);
        emit ImplementationUpgraded(oldImplementation, newImplementation);
    }
}
