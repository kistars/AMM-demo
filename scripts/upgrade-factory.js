const { ethers, upgrades } = require("hardhat");

async function main() {
    console.log("开始升级工厂合约 Beacon...");

    // 获取签名者
    const [deployer] = await ethers.getSigners();
    console.log("升级者地址:", deployer.address);

    // 获取 Beacon 地址
    const FACTORY_BEACON_ADDRESS = process.env.FACTORY_BEACON_ADDRESS;
    if (!FACTORY_BEACON_ADDRESS) {
        throw new Error("请设置 FACTORY_BEACON_ADDRESS 环境变量");
    }

    console.log("工厂 Beacon 地址:", FACTORY_BEACON_ADDRESS);

    // 获取当前实现地址
    const factoryBeacon = await ethers.getContractAt("UpgradeableBeacon", FACTORY_BEACON_ADDRESS);
    const currentImpl = await factoryBeacon.implementation();
    console.log("当前工厂实现地址:", currentImpl);

    // 部署新的工厂实现合约
    console.log("\n部署新的工厂实现合约...");
    const AMMFactoryUpgradeableV2 = await ethers.getContractFactory("AMMFactoryUpgradeable");
    const factoryImplV2 = await AMMFactoryUpgradeableV2.deploy();
    await factoryImplV2.waitForDeployment();
    console.log("新工厂实现地址:", await factoryImplV2.getAddress());

    // 升级工厂合约实现
    console.log("\n升级工厂合约实现...");
    await upgrades.upgradeBeacon(FACTORY_BEACON_ADDRESS, factoryImplV2);
    console.log("工厂合约实现升级完成");

    // 验证升级
    const newImpl = await factoryBeacon.implementation();
    console.log("新实现地址:", newImpl);
    console.log("升级成功:", newImpl !== currentImpl);

    console.log("\n工厂合约 Beacon 升级完成！");
    console.log("所有使用此 Beacon 的工厂合约现在都使用新的实现");
}

main()
    .then(() => {
        console.log("升级成功完成！");
        process.exit(0);
    })
    .catch((error) => {
        console.error("升级失败:", error);
        process.exit(1);
    });
