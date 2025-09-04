const { ethers, upgrades } = require("hardhat");

async function main() {
    console.log("开始部署 AMM Beacon 升级系统...");

    // 获取签名者
    const [deployer] = await ethers.getSigners();
    console.log("部署者地址:", deployer.address);
    console.log("账户余额:", ethers.formatEther(await deployer.provider.getBalance(deployer.address)), "ETH");

    // 1. 部署实现合约
    console.log("\n=== 部署实现合约 ===");

    const AMMFactoryUpgradeable = await ethers.getContractFactory("AMMFactoryUpgradeable");
    const AMMPairUpgradeable = await ethers.getContractFactory("AMMPairUpgradeable");

    // 部署实现合约
    const factoryImpl = await AMMFactoryUpgradeable.deploy();
    await factoryImpl.waitForDeployment();
    console.log("AMMFactoryUpgradeable 实现合约地址:", await factoryImpl.getAddress());

    const pairImpl = await AMMPairUpgradeable.deploy();
    await pairImpl.waitForDeployment();
    console.log("AMMPairUpgradeable 实现合约地址:", await pairImpl.getAddress());

    // 2. 部署 Beacon 合约
    console.log("\n=== 部署 Beacon 合约 ===");

    // 部署 Beacon 合约
    const UpgradeableBeacon = await ethers.getContractFactory("UpgradeableBeacon");
    const factoryBeacon = await UpgradeableBeacon.deploy(await factoryImpl.getAddress(), deployer.address);
    await factoryBeacon.waitForDeployment();
    console.log("Factory Beacon 地址:", await factoryBeacon.getAddress());

    const pairBeacon = await UpgradeableBeacon.deploy(await pairImpl.getAddress(), deployer.address);
    await pairBeacon.waitForDeployment();
    console.log("Pair Beacon 地址:", await pairBeacon.getAddress());

    // 3. 部署工厂代理合约
    console.log("\n=== 部署工厂代理合约 ===");

    // 使用 upgrades.deployBeaconProxy 部署工厂合约
    const factoryProxy = await upgrades.deployBeaconProxy(
        await factoryBeacon.getAddress(),
        AMMFactoryUpgradeable,
        [
            await pairBeacon.getAddress(),
            deployer.address, // 手续费接收地址
            30 // 30 基点 = 0.3% 手续费
        ],
        {
            initializer: "initialize"
        }
    );
    await factoryProxy.waitForDeployment();
    console.log("工厂代理合约地址:", await factoryProxy.getAddress());

    // 4. 部署测试代币
    console.log("\n=== 部署测试代币 ===");

    const MyToken = await ethers.getContractFactory("MyToken");
    const tokenA = await MyToken.deploy("Token A", "TKA");
    await tokenA.waitForDeployment();
    console.log("TokenA 地址:", await tokenA.getAddress());

    const tokenB = await MyToken.deploy("Token B", "TKB");
    await tokenB.waitForDeployment();
    console.log("TokenB 地址:", await tokenB.getAddress());

    // 5. 测试创建代币对
    console.log("\n=== 测试功能 ===");

    // 创建代币对
    const tx = await factoryProxy.createPair(await tokenA.getAddress(), await tokenB.getAddress());
    await tx.wait();
    const pairAddress = await factoryProxy.getPair(await tokenA.getAddress(), await tokenB.getAddress());
    console.log("代币对地址:", pairAddress);

    const pairCount = await factoryProxy.getPairCount();
    console.log("代币对数量:", pairCount.toString());

    // 6. 验证部署
    console.log("\n=== 验证部署 ===");

    // 验证工厂合约
    const factoryOwner = await factoryProxy.owner();
    console.log("工厂合约所有者:", factoryOwner);

    // 验证配对合约
    const pairContract = await ethers.getContractAt("AMMPairUpgradeable", pairAddress);
    const pairToken0 = await pairContract.token0();
    const pairToken1 = await pairContract.token1();
    console.log("配对合约 token0:", pairToken0);
    console.log("配对合约 token1:", pairToken1);

    console.log("\n=== 部署完成 ===");
    console.log("AMMFactoryUpgradeable 实现:", await factoryImpl.getAddress());
    console.log("AMMPairUpgradeable 实现:", await pairImpl.getAddress());
    console.log("Factory Beacon:", await factoryBeacon.getAddress());
    console.log("Pair Beacon:", await pairBeacon.getAddress());
    console.log("工厂代理合约:", await factoryProxy.getAddress());
    console.log("TokenA:", await tokenA.getAddress());
    console.log("TokenB:", await tokenB.getAddress());
    console.log("代币对地址:", pairAddress);

    // 保存部署信息
    const deploymentInfo = {
        factoryImpl: await factoryImpl.getAddress(),
        pairImpl: await pairImpl.getAddress(),
        factoryBeacon: await factoryBeacon.getAddress(),
        pairBeacon: await pairBeacon.getAddress(),
        factoryProxy: await factoryProxy.getAddress(),
        tokenA: await tokenA.getAddress(),
        tokenB: await tokenB.getAddress(),
        pairAddress: pairAddress
    };

    console.log("\n=== 部署信息 ===");
    console.log(JSON.stringify(deploymentInfo, null, 2));

    return deploymentInfo;
}

main()
    .then((result) => {
        console.log("\n部署成功完成！");
        console.log("可以使用返回的 result 对象访问所有合约地址");
        process.exit(0);
    })
    .catch((error) => {
        console.error("部署失败:", error);
        process.exit(1);
    });