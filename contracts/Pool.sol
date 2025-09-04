// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract Pool is OwnableUpgradeable, UUPSUpgradeable, ReentrancyGuardUpgradeable {
    IERC20 public token0;
    IERC20 public token1;
    uint256 public reserve0;
    uint256 public reserve1;

    event AddLiquidity(address indexed user, uint256 amount0, uint256 amount1);
    event RemoveLiquidity(address indexed user, uint256 amount0, uint256 amount1);
    event Swap(address indexed user, uint256 amountIn, uint256 amountOut, address tokenIn, address tokenOut);

    function initialize(address _token0, address _token1) public initializer {
        __Ownable_init(msg.sender);
        __ReentrancyGuard_init();
        token0 = IERC20(_token0);
        token1 = IERC20(_token1);
    }

    function addLiquidity(uint256 amount0, uint256 amount1) public {}

    function removeLiquidity(uint256 amount, address token) public {
        // 移除流动性
    }

    function swap(address tokenIn, uint256 amountIn, address tokenOut) public {
        // 交换
        require(tokenIn == address(token0) || tokenIn == address(token1), "invalid token");
        require(amountIn > 0, "amountIn=0");

        bool isToken0 = tokenIn == address(token0);
        (IERC20 inToken, IERC20 outToken, uint256 reserveIn, uint256 reserveOut) = 
            isToken0 ? (token0, token1, reserve0, reserve1) : (token1, token0, reserve1, reserve0);

        uint256 amountInWithFee = (amountIn * 997) / 1000; // 0.3% 手续费
        uint256 amountOut = (amountInWithFee * reserveOut) / (reserveIn + amountInWithFee);

        // 更新储备
        if (isToken0) {
            reserve0 += amountIn;
            reserve1 -= amountOut;
        } else {
            reserve1 += amountIn;
            reserve0 -= amountOut;
        }

        require(outToken.transfer(msg.sender, amountOut), "transfer failed");
        require(inToken.transferFrom(msg.sender, address(this), amountIn), "transferFrom failed");

        emit Swap(msg.sender, amountIn, amountOut, tokenIn, address(outToken));
    }

    function getLiquidity() public view returns (uint256) {
        // 获取流动性
    }

    function getPool() public view returns (uint256) {
        // 获取池子
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}
}
