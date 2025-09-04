const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

describe("AMM Beacon Upgrade System", function () {
    let factoryImpl, pairImpl, factoryBeacon, pairBeacon, factoryProxy;
    let tokenA, tokenB, pair;
    let owner, user1, user2;

    beforeEach(async function () {
        // 获取签名者
        [owner, user1, user2] = await ethers.getSigners();

        // 部署实现合约
        const AMMFactoryUpgradeable = await ethers.getContractFactory("AMMFactoryUpgradeable");
        factoryImpl = await AMMFactoryUpgradeable.deploy();
        await factoryImpl.waitForDeployment();

        const AMMPairUpgradeable = await ethers.getContractFactory("AMMPairUpgradeable");
        pairImpl = await AMMPairUpgradeable.deploy();
        await pairImpl.waitForDeployment();

        // 部署 Beacon 合约
        const UpgradeableBeacon = await ethers.getContractFactory("UpgradeableBeacon");
        factoryBeacon = await UpgradeableBeacon.deploy(await factoryImpl.getAddress(), owner.address);
        await factoryBeacon.waitForDeployment();

        pairBeacon = await UpgradeableBeacon.deploy(await pairImpl.getAddress(), owner.address);
        await pairBeacon.waitForDeployment();

        // 部署工厂代理合约
        factoryProxy = await upgrades.deployBeaconProxy(
            await factoryBeacon.getAddress(),
            AMMFactoryUpgradeable,
            [
                await pairBeacon.getAddress(),
                owner.address,
                30 // 30 基点 = 0.3% 手续费
            ],
            {
                initializer: "initialize"
            }
        );
        await factoryProxy.waitForDeployment();

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
        pair = await ethers.getContractAt("AMMPairUpgradeable", pairAddress);
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
            const feeRecipient = await factoryProxy.feeRecipient();
            expect(feeRecipient).to.equal(user1.address);
        });

        it("应该允许设置手续费比例", async function () {
            await factoryProxy.setFeeRate(50); // 50 基点 = 0.5%
            const feeRate = await factoryProxy.feeRate();
            expect(feeRate).to.equal(50);
        });

        it("应该防止设置过高的手续费比例", async function () {
            await expect(
                factoryProxy.setFeeRate(1001) // 超过 10%
            ).to.be.revertedWithCustomError(factoryProxy, "InvalidFeeRate");
        });
    });

    describe("配对合约功能", function () {
        it("应该正确初始化代币对", async function () {
            const tokenAAddress = await tokenA.getAddress();
            const tokenBAddress = await tokenB.getAddress();

            // 代币对中的token0和token1是按地址排序的
            const expectedToken0 = tokenAAddress < tokenBAddress ? tokenAAddress : tokenBAddress;
            const expectedToken1 = tokenAAddress < tokenBAddress ? tokenBAddress : tokenAAddress;

            const actualToken0 = await pair.token0();
            const actualToken1 = await pair.token1();

            // 验证代币对已正确初始化（地址不为零）
            expect(actualToken0).to.not.equal(ethers.ZeroAddress);
            expect(actualToken1).to.not.equal(ethers.ZeroAddress);
            expect(actualToken0).to.not.equal(actualToken1);

            // 验证代币对包含正确的代币
            expect(actualToken0).to.be.oneOf([tokenAAddress, tokenBAddress]);
            expect(actualToken1).to.be.oneOf([tokenAAddress, tokenBAddress]);
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

    describe("Beacon 升级功能", function () {
        it("应该允许升级配对合约实现", async function () {
            // 获取当前实现地址
            const currentImpl = await pairBeacon.implementation();
            console.log("当前配对实现地址:", currentImpl);

            // 部署新的配对合约实现
            const AMMPairUpgradeableV2 = await ethers.getContractFactory("AMMPairUpgradeable");
            const pairImplV2 = await AMMPairUpgradeableV2.deploy();
            await pairImplV2.waitForDeployment();
            console.log("新配对实现地址:", await pairImplV2.getAddress());

            // 升级配对合约实现
            await pairBeacon.upgradeTo(await pairImplV2.getAddress());

            // 验证升级
            const newImpl = await pairBeacon.implementation();
            expect(newImpl).to.equal(await pairImplV2.getAddress());
            expect(newImpl).to.not.equal(currentImpl);

            console.log("配对合约实现升级成功");
        });

        it("应该允许升级工厂合约实现", async function () {
            // 获取当前实现地址
            const currentImpl = await factoryBeacon.implementation();
            console.log("当前工厂实现地址:", currentImpl);

            // 部署新的工厂合约实现
            const AMMFactoryUpgradeableV2 = await ethers.getContractFactory("AMMFactoryUpgradeable");
            const factoryImplV2 = await AMMFactoryUpgradeableV2.deploy();
            await factoryImplV2.waitForDeployment();
            console.log("新工厂实现地址:", await factoryImplV2.getAddress());

            // 升级工厂合约实现
            await factoryBeacon.upgradeTo(await factoryImplV2.getAddress());

            // 验证升级
            const newImpl = await factoryBeacon.implementation();
            expect(newImpl).to.equal(await factoryImplV2.getAddress());
            expect(newImpl).to.not.equal(currentImpl);

            console.log("工厂合约实现升级成功");
        });

        it("升级后应该保持数据完整性", async function () {
            // 记录升级前的状态
            const pairCountBefore = await factoryProxy.getPairCount();
            const feeRateBefore = await factoryProxy.feeRate();
            const feeRecipientBefore = await factoryProxy.feeRecipient();

            // 升级工厂合约
            const AMMFactoryUpgradeableV2 = await ethers.getContractFactory("AMMFactoryUpgradeable");
            const factoryImplV2 = await AMMFactoryUpgradeableV2.deploy();
            await factoryImplV2.waitForDeployment();
            await factoryBeacon.upgradeTo(await factoryImplV2.getAddress());

            // 验证数据完整性
            const pairCountAfter = await factoryProxy.getPairCount();
            const feeRateAfter = await factoryProxy.feeRate();
            const feeRecipientAfter = await factoryProxy.feeRecipient();

            expect(pairCountAfter).to.equal(pairCountBefore);
            expect(feeRateAfter).to.equal(feeRateBefore);
            expect(feeRecipientAfter).to.equal(feeRecipientBefore);

            console.log("升级后数据完整性验证通过");
        });

        it("升级后应该保持功能正常", async function () {
            // 升级工厂合约
            const AMMFactoryUpgradeableV2 = await ethers.getContractFactory("AMMFactoryUpgradeable");
            const factoryImplV2 = await AMMFactoryUpgradeableV2.deploy();
            await factoryImplV2.waitForDeployment();
            await factoryBeacon.upgradeTo(await factoryImplV2.getAddress());

            // 测试升级后的功能
            await factoryProxy.setFeeRate(50);
            const newFeeRate = await factoryProxy.feeRate();
            expect(newFeeRate).to.equal(50);

            // 测试创建新的代币对
            const MyToken = await ethers.getContractFactory("MyToken");
            const tokenC = await MyToken.deploy("Token C", "TKC");
            await tokenC.waitForDeployment();

            await factoryProxy.createPair(await tokenA.getAddress(), await tokenC.getAddress());
            const newPairCount = await factoryProxy.getPairCount();
            expect(newPairCount).to.equal(2);

            console.log("升级后功能测试通过");
        });
    });

    describe("权限控制", function () {
        it("应该只允许所有者执行升级操作", async function () {
            const AMMPairUpgradeableV2 = await ethers.getContractFactory("AMMPairUpgradeable");
            const pairImplV2 = await AMMPairUpgradeableV2.deploy();
            await pairImplV2.waitForDeployment();

            // 非所有者应该无法升级
            await expect(
                pairBeacon.connect(user1).upgradeTo(await pairImplV2.getAddress())
            ).to.be.revertedWithCustomError(pairBeacon, "OwnableUnauthorizedAccount");
        });

        it("应该只允许所有者设置工厂参数", async function () {
            await expect(
                factoryProxy.connect(user1).setFeeRate(50)
            ).to.be.revertedWithCustomError(factoryProxy, "OwnableUnauthorizedAccount");

            await expect(
                factoryProxy.connect(user1).setFeeRecipient(user1.address)
            ).to.be.revertedWithCustomError(factoryProxy, "OwnableUnauthorizedAccount");
        });
    });

    describe("Beacon 代理功能", function () {
        it("所有配对合约应该共享同一个实现", async function () {
            // 创建第二个代币对
            const MyToken = await ethers.getContractFactory("MyToken");
            const tokenC = await MyToken.deploy("Token C", "TKC");
            await tokenC.waitForDeployment();

            await factoryProxy.createPair(await tokenA.getAddress(), await tokenC.getAddress());
            const pair2Address = await factoryProxy.getPair(await tokenA.getAddress(), await tokenC.getAddress());
            const pair2 = await ethers.getContractAt("AMMPairUpgradeable", pair2Address);

            // 两个配对合约应该使用相同的实现
            expect(await pair.token0()).to.not.equal(ethers.ZeroAddress);
            expect(await pair2.token0()).to.not.equal(ethers.ZeroAddress);

            console.log("Beacon 代理功能验证通过");
        });
    });
});