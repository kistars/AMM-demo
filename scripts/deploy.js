const { ethers } = require("hardhat");

async function main() {
    console.log("开始部署 AMM Beacon 升级系统...");

    // 获取签名者
    const [deployer] = await ethers.getSigners();
    console.log("部署者地址:", deployer.address);
    console.log("账户余额:", ethers.formatEther(await deployer.provider.getBalance(deployer.address)), "ETH");

    // 1. 部署实现合约
    console.log("\n 部署实现合约...");

    const AMMFactoryUpgradeable = await ethers.getContractFactory("AMMFactoryUpgradeable");
    const factoryImpl = await AMMFactoryUpgradeable.deploy();
    await factoryImpl.waitForDeployment();
    console.log("AMMFactoryUpgradeable 实现合约地址:", await factoryImpl.getAddress());

    const AMMPairUpgradeable = await ethers.getContractFactory("AMMPairUpgradeable");
    const pairImpl = await AMMPairUpgradeable.deploy();
    await pairImpl.waitForDeployment();
    console.log("AMMPairUpgradeable 实现合约地址:", await pairImpl.getAddress());

    // 2. 部署 Beacon 合约
    console.log("\n 部署 Beacon 合约...");

    const AMMBeacon = await ethers.getContractFactory("AMMBeacon");
    const factoryBeacon = await AMMBeacon.deploy(await factoryImpl.getAddress());
    await factoryBeacon.waitForDeployment();
    console.log("Factory Beacon 地址:", await factoryBeacon.getAddress());

    const pairBeacon = await AMMBeacon.deploy(await pairImpl.getAddress());
    await pairBeacon.waitForDeployment();
    console.log("Pair Beacon 地址:", await pairBeacon.getAddress());

    // 3. 部署升级管理器
    console.log("\n 部署升级管理器...");

    const AMMUpgradeManager = await ethers.getContractFactory("AMMUpgradeManager");
    const upgradeManager = await AMMUpgradeManager.deploy();
    await upgradeManager.waitForDeployment();
    console.log("升级管理器地址:", await upgradeManager.getAddress());

    // 4. 配置升级管理器
    console.log("\n 配置升级管理器...");

    await upgradeManager.setBeacons(
        await factoryBeacon.getAddress(),
        await pairBeacon.getAddress()
    );
    console.log("Beacon 地址已设置");

    // 5. 部署工厂代理合约
    console.log("\n 部署工厂代理合约...");

    const AMMFactoryProxy = await ethers.getContractFactory("AMMFactoryUpgradeable");
    const initData = AMMFactoryUpgradeable.interface.encodeFunctionData("initialize", [
        await pairBeacon.getAddress(),
        deployer.address, // 手续费接收地址
        30 // 30 基点 = 0.3% 手续费
    ]);

    // 使用 UUPS 代理模式部署工厂合约
    const AMMFactoryProxyContract = await ethers.getContractFactory("AMMFactoryUpgradeable");
    const factoryProxy = await AMMFactoryProxyContract.deploy();
    await factoryProxy.waitForDeployment();

    // 初始化工厂合约
    await factoryProxy.initialize(
        await pairBeacon.getAddress(),
        deployer.address,
        30
    );
    console.log("工厂代理合约地址:", await factoryProxy.getAddress());

    // 6. 设置当前工厂
    await upgradeManager.setCurrentFactory(await factoryProxy.getAddress());
    console.log("当前工厂地址已设置");

    console.log("\n === 部署完成 ===");
    console.log("AMMFactoryUpgradeable 实现:", await factoryImpl.getAddress());
    console.log("AMMPairUpgradeable 实现:", await pairImpl.getAddress());
    console.log("Factory Beacon:", await factoryBeacon.getAddress());
    console.log("Pair Beacon:", await pairBeacon.getAddress());
    console.log("升级管理器:", await upgradeManager.getAddress());
    console.log("工厂代理合约:", await factoryProxy.getAddress());

    // 验证部署
    console.log("\n === 验证部署 ===");
    const currentFactoryImpl = await upgradeManager.getCurrentFactoryImplementation();
    const currentPairImpl = await upgradeManager.getCurrentPairImplementation();
    console.log("当前工厂实现:", currentFactoryImpl);
    console.log("当前配对实现:", currentPairImpl);

    // 测试创建代币对
    console.log("\n === 测试功能 ===");

    // 部署测试代币
    const MyToken = await ethers.getContractFactory("MyToken");
    const tokenA = await MyToken.deploy("Token A", "TKA");
    await tokenA.waitForDeployment();
    console.log("TokenA 地址:", await tokenA.getAddress());

    const tokenB = await MyToken.deploy("Token B", "TKB");
    await tokenB.waitForDeployment();
    console.log("TokenB 地址:", await tokenB.getAddress());

    // 创建代币对
    const tx = await factoryProxy.createPair(await tokenA.getAddress(), await tokenB.getAddress());
    await tx.wait();
    const pairAddress = await factoryProxy.getPair(await tokenA.getAddress(), await tokenB.getAddress());
    console.log("代币对地址:", pairAddress);

    const pairCount = await factoryProxy.getPairCount();
    console.log("代币对数量:", pairCount.toString());

    return {
        factoryImpl: await factoryImpl.getAddress(),
        pairImpl: await pairImpl.getAddress(),
        factoryBeacon: await factoryBeacon.getAddress(),
        pairBeacon: await pairBeacon.getAddress(),
        upgradeManager: await upgradeManager.getAddress(),
        factoryProxy: await factoryProxy.getAddress(),
        tokenA: await tokenA.getAddress(),
        tokenB: await tokenB.getAddress(),
        pairAddress: pairAddress
    };
}

main()
    .then((result) => {
        console.log("\n部署结果已保存到变量中");
        console.log("可以使用 result 变量访问所有合约地址");
        process.exit(0);
    })
    .catch((error) => {
        console.error("部署失败:", error);
        process.exit(1);
    });
