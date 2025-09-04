const { ethers, upgrades } = require("hardhat");

async function main() {
    console.log("开始升级配对合约 Beacon...");

    // 获取签名者
    const [deployer] = await ethers.getSigners();
    console.log("升级者地址:", deployer.address);

    // 获取 Beacon 地址
    const PAIR_BEACON_ADDRESS = process.env.PAIR_BEACON_ADDRESS;
    if (!PAIR_BEACON_ADDRESS) {
        throw new Error("请设置 PAIR_BEACON_ADDRESS 环境变量");
    }

    console.log("配对 Beacon 地址:", PAIR_BEACON_ADDRESS);

    // 获取当前实现地址
    const pairBeacon = await ethers.getContractAt("UpgradeableBeacon", PAIR_BEACON_ADDRESS);
    const currentImpl = await pairBeacon.implementation();
    console.log("当前配对实现地址:", currentImpl);

    // 部署新的配对实现合约
    console.log("\n部署新的配对实现合约...");
    const AMMPairUpgradeableV2 = await ethers.getContractFactory("AMMPairUpgradeable");
    const pairImplV2 = await AMMPairUpgradeableV2.deploy();
    await pairImplV2.waitForDeployment();
    console.log("新配对实现地址:", await pairImplV2.getAddress());

    // 升级配对合约实现
    console.log("\n升级配对合约实现...");
    await upgrades.upgradeBeacon(PAIR_BEACON_ADDRESS, pairImplV2);
    console.log("配对合约实现升级完成");

    // 验证升级
    const newImpl = await pairBeacon.implementation();
    console.log("新实现地址:", newImpl);
    console.log("升级成功:", newImpl !== currentImpl);

    console.log("\n配对合约 Beacon 升级完成！");
    console.log("所有使用此 Beacon 的配对合约现在都使用新的实现");
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
