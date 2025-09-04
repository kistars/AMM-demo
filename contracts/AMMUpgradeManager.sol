// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {AMMBeacon} from "./AMMBeacon.sol";

/**
 * @title AMMUpgradeManager
 * @dev 管理 AMM 平台的升级
 */
contract AMMUpgradeManager is Ownable {
    // Beacon 合约地址
    address public factoryBeacon;
    address public pairBeacon;

    // 当前工厂合约地址
    address public currentFactory;

    // 事件
    event FactoryBeaconSet(address indexed oldBeacon, address indexed newBeacon);
    event PairBeaconSet(address indexed oldBeacon, address indexed newBeacon);
    event FactoryUpgraded(address indexed oldFactory, address indexed newFactory);
    event FactoryImplementationUpgraded(address indexed oldImpl, address indexed newImpl);
    event PairImplementationUpgraded(address indexed oldImpl, address indexed newImpl);

    // 错误定义
    error ZeroAddress();
    error InvalidBeacon();

    constructor() Ownable(msg.sender) {}

    /**
     * @dev 设置 Beacon 地址
     */
    function setBeacons(address factoryBeacon_, address pairBeacon_) external onlyOwner {
        if (factoryBeacon_ == address(0) || pairBeacon_ == address(0)) revert ZeroAddress();

        address oldFactoryBeacon = factoryBeacon;
        address oldPairBeacon = pairBeacon;

        factoryBeacon = factoryBeacon_;
        pairBeacon = pairBeacon_;

        emit FactoryBeaconSet(oldFactoryBeacon, factoryBeacon_);
        emit PairBeaconSet(oldPairBeacon, pairBeacon_);
    }

    /**
     * @dev 升级工厂合约实现
     */
    function upgradeFactoryImplementation(address newImplementation) external onlyOwner {
        if (factoryBeacon == address(0)) revert InvalidBeacon();
        if (newImplementation == address(0)) revert ZeroAddress();

        address oldImplementation = AMMBeacon(factoryBeacon).implementation();
        AMMBeacon(factoryBeacon).upgrade(newImplementation);

        emit FactoryImplementationUpgraded(oldImplementation, newImplementation);
    }

    /**
     * @dev 升级配对合约实现
     */
    function upgradePairImplementation(address newImplementation) external onlyOwner {
        if (pairBeacon == address(0)) revert InvalidBeacon();
        if (newImplementation == address(0)) revert ZeroAddress();

        address oldImplementation = AMMBeacon(pairBeacon).implementation();
        AMMBeacon(pairBeacon).upgrade(newImplementation);

        emit PairImplementationUpgraded(oldImplementation, newImplementation);
    }

    /**
     * @dev 设置当前工厂合约地址
     */
    function setCurrentFactory(address factory_) external onlyOwner {
        if (factory_ == address(0)) revert ZeroAddress();

        address oldFactory = currentFactory;
        currentFactory = factory_;
        emit FactoryUpgraded(oldFactory, factory_);
    }

    /**
     * @dev 获取当前工厂合约实现
     */
    function getCurrentFactoryImplementation() external view returns (address) {
        if (factoryBeacon == address(0)) return address(0);
        return AMMBeacon(factoryBeacon).implementation();
    }

    /**
     * @dev 获取当前配对合约实现
     */
    function getCurrentPairImplementation() external view returns (address) {
        if (pairBeacon == address(0)) return address(0);
        return AMMBeacon(pairBeacon).implementation();
    }

    /**
     * @dev 获取工厂 Beacon 地址
     */
    function getFactoryBeacon() external view returns (address) {
        return factoryBeacon;
    }

    /**
     * @dev 获取配对 Beacon 地址
     */
    function getPairBeacon() external view returns (address) {
        return pairBeacon;
    }
}
