// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {AMMPair} from "./AMMPair.sol";

contract AMMFactory {
    mapping(address => mapping(address => address)) public getPair;
    address[] public allPairs;

    address public feeTo;

    event PairCreated(address indexed token0, address indexed token1, address pair, uint256);

    function createPair(address tokenA, address tokenB) external returns (address pair) {
        require(tokenA != tokenB, "UniswapV2: IDENTICAL_ADDRESSES");
        (address token0, address token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        require(token0 != address(0), "UniswapV2: ZERO_ADDRESS");
        require(getPair[token0][token1] == address(0), "UniswapV2: PAIR_EXISTS");

        // 创建新的配对合约
        AMMPair newPair = new AMMPair();

        // 初始化配对合约
        newPair.initialize(token0, token1);

        pair = address(newPair);

        // 更新映射和数组
        getPair[token0][token1] = pair;
        getPair[token1][token0] = pair;
        allPairs.push(pair);

        emit PairCreated(token0, token1, pair, allPairs.length);
    }

    function allPairsLength() external view returns (uint256) {
        return allPairs.length;
    }
}
