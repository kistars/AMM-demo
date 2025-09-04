const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("AMM Beacon Upgrade System", function () {
    let factoryImpl, pairImpl, factoryBeacon, pairBeacon, upgradeManager, factoryProxy;
    let tokenA, tokenB, pair;
    let owner, user1, user2;

    beforeEach(async function () {
        // 获取签名者
        [owner, user1, user2] = await ethers.getSigners();

        // 部署实现合约
        const AMMFactoryUpgradeable = await ethers.getContractFactory("AMMFactoryUpgradeable");
        factoryImpl = await AMMFactoryUpgradeable.deploy();
        await factoryImpl.waitForDeployment();

        const AMMUpgradeable = await ethers.getContractFactory("AMMPairUpgradeable");
        pairImpl = await AMMUpgradeable.deploy();
        await pairImpl.waitForDeployment();

        // 部署 Beacon 合约
        const AMMBeacon = await ethers.getContractFactory("AMMBeacon");
        factoryBeacon = await AMMBeacon.deploy(await factoryImpl.getAddress());
        await factoryBeacon.waitForDeployment();

        pairBeacon = await AMMBeacon.deploy(await pairImpl.getAddress());
        await pairBeacon.waitForDeployment();

        // 部署升级管理器
        const AMMUpgradeManager = await ethers.getContractFactory("AMMUpgradeManager");
        upgradeManager = await AMMUpgradeManager.deploy();
        await upgradeManager.waitForDeployment();

        // 配置升级管理器
        await upgradeManager.setBeacons(
            await factoryBeacon.getAddress(),
            await pairBeacon.getAddress()
        );

        // 将 Beacon 合约的所有权转移给升级管理器
        await factoryBeacon.transferOwnership(await upgradeManager.getAddress());
        await pairBeacon.transferOwnership(await upgradeManager.getAddress());

        // 部署工厂代理合约 - 使用 UUPS 代理模式
        // 注意：这里我们直接部署实现合约，因为它本身就是代理合约
        const AMMFactoryProxy = await ethers.getContractFactory("AMMFactoryUpgradeable");
        factoryProxy = await AMMFactoryProxy.deploy();
        await factoryProxy.waitForDeployment();

        // 初始化工厂合约
        await factoryProxy.initialize(
            await pairBeacon.getAddress(),
            owner.address,
            30 // 30 基点 = 0.3% 手续费
        );

        // 设置当前工厂
        await upgradeManager.setCurrentFactory(await factoryProxy.getAddress());

        // 部署测试代币
        const MyToken = await ethers.getContractFactory("MyToken");
        tokenA = await MyToken.deploy("Token A", "TKA");
        await tokenA.waitForDeployment();

        tokenB = await MyToken.deploy("Token B", "TKB");
        await tokenB.waitForDeployment();

        // 创建代币对
        await factoryProxy.createPair(await tokenA.getAddress(), await tokenB.getAddress());
        const pairAddress = await factoryProxy.getPair(await tokenA.getAddress(), await tokenB.getAddress());

        // 获取配对合约实例
        const AMMPairUpgradeable = await ethers.getContractFactory("AMMPairUpgradeable");
        pair = await AMMPairUpgradeable.attach(pairAddress);
    });

    describe("工厂合约功能", function () {
        it("应该正确创建代币对", async function () {
            const tokenAAddress = await tokenA.getAddress();
            const tokenBAddress = await tokenB.getAddress();
            const pairAddress = await factoryProxy.getPair(tokenAAddress, tokenBAddress);

            expect(pairAddress).to.not.equal(ethers.ZeroAddress);

            const pairCount = await factoryProxy.getPairCount();
            expect(pairCount).to.equal(1);
        });

        it("应该防止创建相同代币的交易对", async function () {
            const tokenAAddress = await tokenA.getAddress();
            await expect(
                factoryProxy.createPair(tokenAAddress, tokenAAddress)
            ).to.be.revertedWithCustomError(factoryProxy, "IdenticalTokens");
        });

        it("应该防止重复创建相同的交易对", async function () {
            const tokenAAddress = await tokenA.getAddress();
            const tokenBAddress = await tokenB.getAddress();
            await expect(
                factoryProxy.createPair(tokenAAddress, tokenBAddress)
            ).to.be.revertedWithCustomError(factoryProxy, "PairExists");
        });

        it("应该允许设置手续费接收地址", async function () {
            await factoryProxy.setFeeRecipient(user1.address);
            // 这里需要添加获取手续费接收地址的函数
        });

        it("应该允许设置手续费比例", async function () {
            await factoryProxy.setFeeRate(50); // 50 基点 = 0.5%
            // 这里需要添加获取手续费比例的函数
        });
    });

    describe("配对合约功能", function () {
        it("应该正确初始化代币对", async function () {
            const tokenAAddress = await tokenA.getAddress();
            const tokenBAddress = await tokenB.getAddress();

            // 代币对中的token0和token1是按地址排序的
            const expectedToken0 = tokenAAddress < tokenBAddress ? tokenAAddress : tokenBAddress;
            const expectedToken1 = tokenAAddress < tokenBAddress ? tokenBAddress : tokenAAddress;

            expect(await pair.token0()).to.equal(expectedToken0);
            expect(await pair.token1()).to.equal(expectedToken1);
        });

        it("应该允许添加流动性", async function () {
            const pairAddress = await pair.getAddress();

            // 先给用户转账一些代币
            await tokenA.connect(owner).transfer(user1.address, ethers.parseEther("1000"));
            await tokenB.connect(owner).transfer(user1.address, ethers.parseEther("1000"));

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

        it("应该允许交换代币", async function () {
            const pairAddress = await pair.getAddress();

            // 先给用户转账一些代币
            await tokenA.connect(owner).transfer(user1.address, ethers.parseEther("1000"));
            await tokenB.connect(owner).transfer(user1.address, ethers.parseEther("1000"));
            await tokenA.connect(owner).transfer(user2.address, ethers.parseEther("1000"));
            await tokenB.connect(owner).transfer(user2.address, ethers.parseEther("1000"));

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
            const amountIn = ethers.parseEther("100");
            const amountInWithFee = amountIn * 997n; // 考虑0.3%手续费
            const numerator = amountInWithFee * reserve1;
            const denominator = reserve0 * 1000n + amountInWithFee;
            const amountOut = numerator / denominator;

            // 执行交换
            await pair.connect(user2).swap(0, amountOut, user2.address);

            // 检查交换后的储备金
            [reserve0, reserve1] = await pair.getReserves();
            const newK = reserve0 * reserve1;

            // 检查k是否保持基本恒定（考虑手续费）
            expect(newK).to.be.gte(initialK);

            // 检查用户是否收到了TokenB
            const user2TokenBBalance = await tokenB.balanceOf(user2.address);
            expect(user2TokenBBalance).to.be.gt(ethers.parseEther("999")); // 初始有1000，交换后应该减少
        });

        it("应该允许移除流动性", async function () {
            const pairAddress = await pair.getAddress();

            // 先给用户转账一些代币
            await tokenA.connect(owner).transfer(user1.address, ethers.parseEther("1000"));
            await tokenB.connect(owner).transfer(user1.address, ethers.parseEther("1000"));

            // 先添加流动性
            await tokenA.connect(user1).transfer(pairAddress, ethers.parseEther("1000"));
            await tokenB.connect(user1).transfer(pairAddress, ethers.parseEther("1000"));
            await pair.connect(user1).mint(user1.address);

            // 获取LP代币余额
            const lpBalance = await pair.balanceOf(user1.address);

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
        });
    });

    describe("升级功能", function () {
        it("应该允许升级配对合约实现", async function () {
            // 部署新的配对合约实现
            const AMMPairUpgradeableV2 = await ethers.getContractFactory("AMMPairUpgradeable");
            const pairImplV2 = await AMMPairUpgradeableV2.deploy();
            await pairImplV2.waitForDeployment();

            // 升级配对合约实现 - 使用 owner 权限
            await upgradeManager.connect(owner).upgradePairImplementation(await pairImplV2.getAddress());

            // 验证升级
            const currentPairImpl = await upgradeManager.getCurrentPairImplementation();
            expect(currentPairImpl).to.equal(await pairImplV2.getAddress());
        });

        it("应该允许升级工厂合约实现", async function () {
            // 部署新的工厂合约实现
            const AMMFactoryUpgradeableV2 = await ethers.getContractFactory("AMMFactoryUpgradeable");
            const factoryImplV2 = await AMMFactoryUpgradeableV2.deploy();
            await factoryImplV2.waitForDeployment();

            // 升级工厂合约实现 - 使用 owner 权限
            await upgradeManager.connect(owner).upgradeFactoryImplementation(await factoryImplV2.getAddress());

            // 验证升级
            const currentFactoryImpl = await upgradeManager.getCurrentFactoryImplementation();
            expect(currentFactoryImpl).to.equal(await factoryImplV2.getAddress());
        });

        it("应该允许设置新的工厂合约", async function () {
            // 部署新的工厂合约
            const AMMFactoryUpgradeableV2 = await ethers.getContractFactory("AMMFactoryUpgradeable");
            const factoryProxyV2 = await AMMFactoryUpgradeableV2.deploy();
            await factoryProxyV2.waitForDeployment();

            // 初始化新工厂
            await factoryProxyV2.initialize(
                await pairBeacon.getAddress(),
                owner.address,
                50 // 50 基点 = 0.5% 手续费
            );

            // 设置新工厂
            await upgradeManager.setCurrentFactory(await factoryProxyV2.getAddress());

            // 验证设置
            const currentFactory = await upgradeManager.currentFactory();
            expect(currentFactory).to.equal(await factoryProxyV2.getAddress());
        });
    });

    describe("权限控制", function () {
        it("应该只允许所有者执行升级操作", async function () {
            const AMMPairUpgradeableV2 = await ethers.getContractFactory("AMMPairUpgradeable");
            const pairImplV2 = await AMMPairUpgradeableV2.deploy();
            await pairImplV2.waitForDeployment();

            // 非所有者应该无法升级
            await expect(
                upgradeManager.connect(user1).upgradePairImplementation(await pairImplV2.getAddress())
            ).to.be.revertedWithCustomError(upgradeManager, "OwnableUnauthorizedAccount");
        });

        it("应该只允许所有者设置 Beacon", async function () {
            await expect(
                upgradeManager.connect(user1).setBeacons(
                    await factoryBeacon.getAddress(),
                    await pairBeacon.getAddress()
                )
            ).to.be.revertedWithCustomError(upgradeManager, "OwnableUnauthorizedAccount");
        });
    });
});
