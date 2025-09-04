// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {BeaconProxy} from "@openzeppelin/contracts/proxy/beacon/BeaconProxy.sol";
import {IAMMPair} from "./interfaces/IAMMPair.sol";

/**
 * @title AMMFactoryUpgradeable
 * @dev 支持升级的 AMM 工厂合约
 * 管理代币对的创建和升级
 */
contract AMMFactoryUpgradeable is Initializable, OwnableUpgradeable {
    // 代币对映射：tokenA => tokenB => pairAddress
    mapping(address => mapping(address => address)) public getPair;

    // 所有代币对地址列表
    address[] public allPairs;

    // 手续费接收地址
    address public feeRecipient;

    // 0.3%
    uint256 public feeRate = 30;

    // 配对合约的 Beacon 地址
    address public pairBeacon;

    // 事件
    event PairCreated(address indexed tokenA, address indexed tokenB, address indexed pair, uint256 pairIndex);
    event FeeRecipientChanged(address indexed oldRecipient, address indexed newRecipient);
    event FeeRateChanged(uint256 oldRate, uint256 newRate);
    event PairBeaconChanged(address indexed oldBeacon, address indexed newBeacon);

    // 错误定义
    error IdenticalTokens();
    error ZeroAddress();
    error PairExists();
    error InvalidFeeRate();
    error InvalidBeacon();

    /**
     * @dev 初始化函数
     * @param pairBeacon_ 配对合约的 Beacon 地址
     * @param feeRecipient_ 手续费接收地址
     * @param feeRate_ 手续费比例（基点）
     */
    function initialize(address pairBeacon_, address feeRecipient_, uint256 feeRate_) public initializer {
        __Ownable_init(msg.sender);

        if (pairBeacon_ == address(0)) revert InvalidBeacon();

        pairBeacon = pairBeacon_;
        feeRecipient = feeRecipient_;
        feeRate = feeRate_;
    }

    /**
     * @dev 创建代币对
     * @param tokenA 代币A地址
     * @param tokenB 代币B地址
     * @return pair 代币对地址
     */
    function createPair(address tokenA, address tokenB) external returns (address pair) {
        if (tokenA == tokenB) revert IdenticalTokens();
        if (tokenA == address(0) || tokenB == address(0)) revert ZeroAddress();

        // 确保代币对的顺序一致
        (address token0, address token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);

        if (getPair[token0][token1] != address(0)) revert PairExists();

        // 准备初始化数据
        bytes memory initData = abi.encodeWithSelector(IAMMPair.initialize.selector, token0, token1, feeRate);

        // 使用 Beacon 创建代理合约
        BeaconProxy proxy = new BeaconProxy(pairBeacon, initData);
        pair = address(proxy);

        // 更新映射和数组
        getPair[token0][token1] = pair;
        getPair[token1][token0] = pair;
        allPairs.push(pair);

        emit PairCreated(tokenA, tokenB, pair, allPairs.length - 1);
    }

    /**
     * @dev 获取代币对数量
     */
    function getPairCount() external view returns (uint256) {
        return allPairs.length;
    }

    /**
     * @dev 设置手续费接收地址
     */
    function setFeeRecipient(address newRecipient) external onlyOwner {
        address oldRecipient = feeRecipient;
        feeRecipient = newRecipient;
        emit FeeRecipientChanged(oldRecipient, newRecipient);
    }

    /**
     * @dev 设置手续费比例
     */
    function setFeeRate(uint256 newRate) external onlyOwner {
        if (newRate > 1000) revert InvalidFeeRate(); // 最大 10%
        uint256 oldRate = feeRate;
        feeRate = newRate;
        emit FeeRateChanged(oldRate, newRate);
    }

    /**
     * @dev 设置配对合约 Beacon 地址
     */
    function setPairBeacon(address newBeacon) external onlyOwner {
        if (newBeacon == address(0)) revert InvalidBeacon();
        address oldBeacon = pairBeacon;
        pairBeacon = newBeacon;
        emit PairBeaconChanged(oldBeacon, newBeacon);
    }
}
