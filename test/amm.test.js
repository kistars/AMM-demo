const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Uniswap V2 AMM Demo", function () {
    let factory;
    let tokenA;
    let tokenB;
    let pair;
    let owner;
    let user1;
    let user2;

    beforeEach(async function () {
        // 获取签名者
        [owner, user1, user2] = await ethers.getSigners();

        // 部署工厂合约
        const Factory = await ethers.getContractFactory("AMMFactory");
        factory = await Factory.deploy();
        await factory.waitForDeployment();

        // 部署测试代币
        const TokenA = await ethers.getContractFactory("MyToken");
        tokenA = await TokenA.deploy("Token A", "TKA");
        await tokenA.waitForDeployment();

        const TokenB = await ethers.getContractFactory("MyToken");
        tokenB = await TokenB.deploy("Token B", "TKB");
        await tokenB.waitForDeployment();

        // 获取代币地址
        const tokenAAddress = await tokenA.getAddress();
        const tokenBAddress = await tokenB.getAddress();

        // 创建代币对
        await factory.createPair(tokenAAddress, tokenBAddress);
        const pairAddress = await factory.getPair(tokenAAddress, tokenBAddress);
        expect(pairAddress).to.not.equal(ethers.ZeroAddress);

        // 获取配对合约实例
        const Pair = await ethers.getContractFactory("AMMPair");
        pair = await Pair.attach(pairAddress);

        // 转账给用户
        await tokenA.transfer(user1.address, ethers.parseEther("10000"));
        await tokenB.transfer(user1.address, ethers.parseEther("10000"));
        await tokenA.transfer(user2.address, ethers.parseEther("10000"));
        await tokenB.transfer(user2.address, ethers.parseEther("10000"));
    });

    describe("工厂合约", function () {
        it("应该正确创建代币对", async function () {
            const tokenAAddress = await tokenA.getAddress();
            const tokenBAddress = await tokenB.getAddress();
            const pairAddress = await factory.getPair(tokenAAddress, tokenBAddress);
            expect(pairAddress).to.not.equal(ethers.ZeroAddress);

            const pairCount = await factory.allPairsLength();
            expect(pairCount).to.equal(1);

            const firstPair = await factory.allPairs(0);
            expect(firstPair).to.equal(pairAddress);
        });

        it("应该防止创建相同代币的交易对", async function () {
            const tokenAAddress = await tokenA.getAddress();
            await expect(
                factory.createPair(tokenAAddress, tokenAAddress)
            ).to.be.revertedWith("UniswapV2: IDENTICAL_ADDRESSES");
        });

        it("应该防止重复创建相同的交易对", async function () {
            const tokenAAddress = await tokenA.getAddress();
            const tokenBAddress = await tokenB.getAddress();
            await expect(
                factory.createPair(tokenAAddress, tokenBAddress)
            ).to.be.revertedWith("UniswapV2: PAIR_EXISTS");
        });
    });

    describe("配对合约", function () {
        it("应该正确初始化代币对", async function () {
            const tokenAAddress = await tokenA.getAddress();
            const tokenBAddress = await tokenB.getAddress();
            const factoryAddress = await factory.getAddress();

            // 代币对中的token0和token1是按地址排序的
            const expectedToken0 = tokenAAddress < tokenBAddress ? tokenAAddress : tokenBAddress;
            const expectedToken1 = tokenAAddress < tokenBAddress ? tokenBAddress : tokenAAddress;

            expect(await pair.token0()).to.equal(expectedToken0);
            expect(await pair.token1()).to.equal(expectedToken1);
            expect(await pair.factory()).to.equal(factoryAddress);
        });

        it("应该允许添加流动性", async function () {
            const pairAddress = await pair.getAddress();

            // 批准代币转账
            await tokenA.connect(user1).approve(pairAddress, ethers.parseEther("1000"));
            await tokenB.connect(user1).approve(pairAddress, ethers.parseEther("1000"));

            // 转账代币到配对合约
            await tokenA.connect(user1).transfer(pairAddress, ethers.parseEther("1000"));
            await tokenB.connect(user1).transfer(pairAddress, ethers.parseEther("1000"));

            // 添加流动性
            await pair.connect(user1).mint(user1.address);

            // 检查LP代币余额
            const lpBalance = await pair.balanceOf(user1.address);
            expect(lpBalance).to.be.gt(0);

            // 检查储备金
            const [reserve0, reserve1] = await pair.getReserves();
            expect(reserve0).to.equal(ethers.parseEther("1000"));
            expect(reserve1).to.equal(ethers.parseEther("1000"));
        });

        it("应该允许交换代币并保持k恒定", async function () {
            const pairAddress = await pair.getAddress();

            // 先添加流动性
            await tokenA.connect(user1).transfer(pairAddress, ethers.parseEther("1000"));
            await tokenB.connect(user1).transfer(pairAddress, ethers.parseEther("1000"));
            await pair.connect(user1).mint(user1.address);

            // 检查初始储备金
            let [reserve0, reserve1] = await pair.getReserves();
            const initialK = reserve0 * reserve1;

            // 用户2批准并转入一些TokenA用于交换
            await tokenA.connect(user2).approve(pairAddress, ethers.parseEther("100"));
            await tokenA.connect(user2).transfer(pairAddress, ethers.parseEther("100"));

            // 计算预计可获得的TokenB数量
            // 考虑0.3%的手续费
            const amountIn = ethers.parseEther("100");
            const amountInWithFee = amountIn * 997n;
            const numerator = amountInWithFee * reserve1;
            const denominator = reserve0 * 1000n + amountInWithFee;
            const amountOut = numerator / denominator;

            // 执行交换
            await pair.connect(user2).swap(0, amountOut, user2.address, "0x");

            // 检查交换后的储备金
            [reserve0, reserve1] = await pair.getReserves();
            const newK = reserve0 * reserve1;

            // 检查k是否保持基本恒定（考虑手续费）
            // 由于手续费，k应该略有增加
            expect(newK).to.be.gte(initialK);

            // 检查用户是否收到了TokenB
            const user2TokenBBalance = await tokenB.balanceOf(user2.address);
            expect(user2TokenBBalance).to.be.gt(ethers.parseEther("9990")); // 初始有10000
        });

        it("应该允许移除流动性", async function () {
            const pairAddress = await pair.getAddress();

            // 先添加流动性
            await tokenA.connect(user1).transfer(pairAddress, ethers.parseEther("1000"));
            await tokenB.connect(user1).transfer(pairAddress, ethers.parseEther("1000"));
            await pair.connect(user1).mint(user1.address);

            // 获取LP代币余额
            const lpBalance = await pair.balanceOf(user1.address);

            // 批准移除流动性
            await pair.connect(user1).approve(pairAddress, lpBalance);

            // 记录移除前的余额
            const tokenABalanceBefore = await tokenA.balanceOf(user1.address);
            const tokenBBalanceBefore = await tokenB.balanceOf(user1.address);

            // 移除流动性
            await pair.connect(user1).burn(user1.address);

            // 检查余额是否增加
            const tokenABalanceAfter = await tokenA.balanceOf(user1.address);
            const tokenBBalanceAfter = await tokenB.balanceOf(user1.address);

            expect(tokenABalanceAfter).to.be.gt(tokenABalanceBefore);
            expect(tokenBBalanceAfter).to.be.gt(tokenBBalanceBefore);

            // 检查储备金是否减少
            const [reserve0, reserve1] = await pair.getReserves();
            expect(reserve0).to.be.lt(ethers.parseEther("1000"));
            expect(reserve1).to.be.lt(ethers.parseEther("1000"));
        });
    });
});
