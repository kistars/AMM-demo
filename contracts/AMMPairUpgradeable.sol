// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {ERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IAMMPair} from "./interfaces/IAMMPair.sol";

/**
 * @title AMMPairUpgradeable
 * @dev 支持升级的 AMM 配对合约
 * 实现恒定乘积自动做市商功能
 */
contract AMMPairUpgradeable is Initializable, ERC20Upgradeable, OwnableUpgradeable, IAMMPair {
    using MathUtils for uint256;

    // 代币对信息
    address public token0;
    address public token1;
    address public factory;

    // 储备金信息
    uint112 private reserve0;
    uint112 private reserve1;
    uint32 private blockTimestampLast;

    // 手续费信息
    uint256 public feeRate; // 手续费比例（基点）

    // 价格累积信息（用于价格预言机）
    uint256 public price0CumulativeLast;
    uint256 public price1CumulativeLast;

    // 事件
    event Mint(address indexed sender, uint256 amount0, uint256 amount1, uint256 liquidity);
    event Burn(address indexed sender, uint256 amount0, uint256 amount1, address indexed to);
    event Swap(
        address indexed sender,
        uint256 amount0In,
        uint256 amount1In,
        uint256 amount0Out,
        uint256 amount1Out,
        address indexed to
    );
    event Sync(uint112 reserve0, uint112 reserve1);

    // 错误定义
    error AlreadyInitialized();
    error InvalidTokens();
    error InsufficientLiquidity();
    error InsufficientOutputAmount();
    error InvalidTo();
    error KConstantViolation();
    error Overflow();

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @dev 初始化函数
     * @param _token0 代币0地址
     * @param _token1 代币1地址
     * @param _feeRate 手续费比例
     */
    function initialize(address _token0, address _token1, uint256 _feeRate) external override initializer {
        if (token0 != address(0)) revert AlreadyInitialized();
        if (_token0 == address(0) || _token1 == address(0)) revert InvalidTokens();
        if (_token0 == _token1) revert InvalidTokens();

        __ERC20_init("AMM LP Token", "AMMLP");
        __Ownable_init(msg.sender);

        factory = msg.sender;
        token0 = _token0;
        token1 = _token1;
        feeRate = _feeRate;
    }

    /**
     * @dev 更新储备金
     */
    function _update(uint256 balance0, uint256 balance1, uint112 _reserve0, uint112 _reserve1) private {
        if (balance0 > type(uint112).max || balance1 > type(uint112).max) revert Overflow();

        uint32 blockTimestamp = uint32(block.timestamp % 2 ** 32);
        uint32 timeElapsed = blockTimestamp - blockTimestampLast;

        // 更新价格累积（用于价格预言机）
        if (timeElapsed > 0 && _reserve0 != 0 && _reserve1 != 0) {
            price0CumulativeLast += uint256(_reserve1) * timeElapsed / _reserve0;
            price1CumulativeLast += uint256(_reserve0) * timeElapsed / _reserve1;
        }

        reserve0 = uint112(balance0);
        reserve1 = uint112(balance1);
        blockTimestampLast = blockTimestamp;

        emit Sync(reserve0, reserve1);
    }

    /**
     * @dev 添加流动性
     * @param to 接收LP代币的地址
     * @return liquidity 铸造的LP代币数量
     */
    function mint(address to) external override returns (uint256 liquidity) {
        (uint112 _reserve0, uint112 _reserve1,) = getReserves();
        uint256 balance0 = IERC20(token0).balanceOf(address(this));
        uint256 balance1 = IERC20(token1).balanceOf(address(this));
        uint256 amount0 = balance0 - _reserve0;
        uint256 amount1 = balance1 - _reserve1;

        uint256 _totalSupply = totalSupply();

        if (_totalSupply == 0) {
            // 首次添加流动性
            liquidity = MathUtils.sqrt(amount0 * amount1) - 1000; // 锁定1000个代币
            if (liquidity <= 0) revert InsufficientLiquidity();
        } else {
            // 后续添加流动性
            liquidity = MathUtils.min(amount0 * _totalSupply / _reserve0, amount1 * _totalSupply / _reserve1);
            if (liquidity <= 0) revert InsufficientLiquidity();
        }

        _mint(to, liquidity);
        _update(balance0, balance1, _reserve0, _reserve1);

        emit Mint(msg.sender, amount0, amount1, liquidity);
    }

    /**
     * @dev 移除流动性
     * @param to 接收代币的地址
     * @return amount0 代币0数量
     * @return amount1 代币1数量
     */
    function burn(address to) external override returns (uint256 amount0, uint256 amount1) {
        (uint112 _reserve0, uint112 _reserve1,) = getReserves();
        address _token0 = token0;
        address _token1 = token1;
        uint256 balance0 = IERC20(_token0).balanceOf(address(this));
        uint256 balance1 = IERC20(_token1).balanceOf(address(this));
        uint256 liquidity = balanceOf(msg.sender);

        uint256 _totalSupply = totalSupply();
        amount0 = liquidity * balance0 / _totalSupply;
        amount1 = liquidity * balance1 / _totalSupply;

        if (amount0 <= 0 || amount1 <= 0) revert InsufficientLiquidity();

        _burn(msg.sender, liquidity);
        IERC20(_token0).transfer(to, amount0);
        IERC20(_token1).transfer(to, amount1);

        balance0 = IERC20(_token0).balanceOf(address(this));
        balance1 = IERC20(_token1).balanceOf(address(this));

        _update(balance0, balance1, _reserve0, _reserve1);

        emit Burn(msg.sender, amount0, amount1, to);
    }

    /**
     * @dev 代币交换
     * @param amount0Out 代币0输出数量
     * @param amount1Out 代币1输出数量
     * @param to 接收代币的地址
     */
    function swap(uint256 amount0Out, uint256 amount1Out, address to) external override {
        if (amount0Out <= 0 && amount1Out <= 0) revert InsufficientOutputAmount();

        (uint112 _reserve0, uint112 _reserve1,) = getReserves();
        if (amount0Out >= _reserve0 || amount1Out >= _reserve1) revert InsufficientLiquidity();

        uint256 balance0;
        uint256 balance1;
        {
            address _token0 = token0;
            address _token1 = token1;
            if (to == _token0 || to == _token1) revert InvalidTo();

            if (amount0Out > 0) IERC20(_token0).transfer(to, amount0Out);
            if (amount1Out > 0) IERC20(_token1).transfer(to, amount1Out);

            balance0 = IERC20(_token0).balanceOf(address(this));
            balance1 = IERC20(_token1).balanceOf(address(this));
        }

        uint256 amount0In = balance0 > _reserve0 - amount0Out ? balance0 - (_reserve0 - amount0Out) : 0;
        uint256 amount1In = balance1 > _reserve1 - amount1Out ? balance1 - (_reserve1 - amount1Out) : 0;

        if (amount0In <= 0 && amount1In <= 0) revert InsufficientOutputAmount();

        // 验证K值不变（考虑手续费）
        {
            uint256 balance0Adjusted = balance0 * 10000 - amount0In * feeRate;
            uint256 balance1Adjusted = balance1 * 10000 - amount1In * feeRate;
            if (balance0Adjusted * balance1Adjusted < uint256(_reserve0) * _reserve1 * 10000 * 10000) {
                revert KConstantViolation();
            }
        }

        _update(balance0, balance1, _reserve0, _reserve1);
        emit Swap(msg.sender, amount0In, amount1In, amount0Out, amount1Out, to);
    }

    /**
     * @dev 强制同步储备金
     */
    function sync() external override {
        _update(IERC20(token0).balanceOf(address(this)), IERC20(token1).balanceOf(address(this)), reserve0, reserve1);
    }

    /**
     * @dev 获取储备金信息
     */
    function getReserves()
        public
        view
        override
        returns (uint112 _reserve0, uint112 _reserve1, uint32 _blockTimestampLast)
    {
        _reserve0 = reserve0;
        _reserve1 = reserve1;
        _blockTimestampLast = blockTimestampLast;
    }
}

/**
 * @title MathUtils
 * @dev 数学工具库
 */
library MathUtils {
    /**
     * @dev 计算平方根
     */
    function sqrt(uint256 y) internal pure returns (uint256 z) {
        if (y > 3) {
            z = y;
            uint256 x = y / 2 + 1;
            while (x < z) {
                z = x;
                x = (y / x + x) / 2;
            }
        } else if (y != 0) {
            z = 1;
        }
    }

    /**
     * @dev 计算最小值
     */
    function min(uint256 x, uint256 y) internal pure returns (uint256) {
        return x < y ? x : y;
    }

    /**
     * @dev 计算最大值
     */
    function max(uint256 x, uint256 y) internal pure returns (uint256) {
        return x > y ? x : y;
    }
}
