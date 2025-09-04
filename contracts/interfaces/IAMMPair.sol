// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * @title IAMMPair
 * @dev AMM 配对合约接口
 */
interface IAMMPair {
    function initialize(address token0, address token1, uint256 feeRate) external;
    function token0() external view returns (address);
    function token1() external view returns (address);
    function factory() external view returns (address);
    function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast);
    function mint(address to) external returns (uint256 liquidity);
    function burn(address to) external returns (uint256 amount0, uint256 amount1);
    function swap(uint256 amount0Out, uint256 amount1Out, address to) external;
    function sync() external;
}
