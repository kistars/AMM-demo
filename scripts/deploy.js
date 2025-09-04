const hre = require("hardhat");

async function main() {
    console.log("开始部署Uniswap V2 AMM演示合约...");

    // 部署工厂合约
    const Factory = await hre.ethers.getContractFactory("UniswapV2Factory");
    const factory = await Factory.deploy();
    await factory.deployed();
    console.log(`UniswapV2Factory部署在: ${factory.address}`);

    // 部署两个测试代币
    const TokenA = await hre.ethers.getContractFactory("MyERC20");
    const tokenA = await TokenA.deploy("Token A", "TKA", 1000000);
    await tokenA.deployed();
    console.log(`Token A部署在: ${tokenA.address}`);

    const TokenB = await hre.ethers.getContractFactory("MyERC20");
    const tokenB = await TokenB.deploy("Token B", "TKB", 1000000);
    await tokenB.deployed();
    console.log(`Token B部署在: ${tokenB.address}`);

    // 创建代币对
    const createPairTx = await factory.createPair(tokenA.address, tokenB.address);
    await createPairTx.wait();

    const pairAddress = await factory.getPair(tokenA.address, tokenB.address);
    console.log(`代币对 (TKA-TKB) 部署在: ${pairAddress}`);

    console.log("所有合约部署完成!");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
