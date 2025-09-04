# AMM Platform with Beacon Upgrades

基于 OpenZeppelin 的 Beacon 升级系统的自动做市商 (AMM) 平台。

## 功能特性

- **Beacon 升级模式**: 使用 OpenZeppelin 的 UpgradeableBeacon 实现合约升级
- **工厂合约**: 支持 UUPS 代理模式的升级工厂合约
- **配对合约**: 通过 Beacon 代理创建的配对合约，支持统一升级
- **流动性管理**: 添加/移除流动性功能
- **代币交换**: 恒定乘积自动做市商算法
- **手续费管理**: 可配置的手续费比例和接收地址

## 合约架构

### 核心合约

1. **AMMBeacon**: 简化的 Beacon 合约，直接继承 OpenZeppelin 的 UpgradeableBeacon
2. **AMMFactoryUpgradeable**: 支持 UUPS 升级的工厂合约
3. **AMMPairUpgradeable**: 支持升级的配对合约实现
4. **MyToken**: 测试用的 ERC20 代币

### 升级机制

- **工厂合约升级**: 使用 UUPS 代理模式，通过 hardhat-upgrades 进行升级
- **配对合约升级**: 通过 Beacon 合约统一升级所有配对合约的实现

## 安装和部署

### 环境要求

- Node.js >= 16
- pnpm (推荐) 或 npm

### 安装依赖

```bash
pnpm install
```

### 环境配置

创建 `.env` 文件：

```env
ALCHEMY_API_KEY=your_alchemy_api_key
PRIVATE_KEY_ONE=your_private_key_1
PRIVATE_KEY_TWO=your_private_key_2
```

### 编译合约

```bash
npx hardhat compile
```

### 部署合约

```bash
npx hardhat run scripts/deploy.js --network <network>
```

### 运行测试

```bash
npx hardhat test
```

## 升级操作

### 升级工厂合约

```bash
FACTORY_PROXY_ADDRESS=<factory_proxy_address> npx hardhat run scripts/upgrade-factory.js --network <network>
```

### 升级配对合约实现

```bash
PAIR_BEACON_ADDRESS=<pair_beacon_address> npx hardhat run scripts/upgrade-pair.js --network <network>
```

## 使用示例

### 创建代币对

```javascript
const factory = await ethers.getContractAt("AMMFactoryUpgradeable", factoryAddress);
const tx = await factory.createPair(tokenA, tokenB);
await tx.wait();
```

### 添加流动性

```javascript
const pair = await ethers.getContractAt("AMMPairUpgradeable", pairAddress);
// 先转账代币到配对合约
await tokenA.transfer(pairAddress, amountA);
await tokenB.transfer(pairAddress, amountB);
// 然后铸造 LP 代币
await pair.mint(userAddress);
```

### 交换代币

```javascript
// 先转账输入代币到配对合约
await tokenA.transfer(pairAddress, amountIn);
// 执行交换
await pair.swap(0, amountOut, userAddress);
```

## 升级流程

### 1. 工厂合约升级

1. 部署新的工厂实现合约
2. 使用 `upgrades.upgradeProxy()` 升级工厂代理
3. 验证升级后的功能

### 2. 配对合约升级

1. 部署新的配对实现合约
2. 调用 Beacon 合约的 `upgrade()` 方法
3. 所有使用该 Beacon 的配对合约自动使用新实现

## 安全考虑

- 所有升级操作都需要合约所有者权限
- 升级前建议在测试网进行充分测试
- 升级后验证数据完整性和功能正常性
- 建议使用多签钱包管理升级权限

## 测试

项目包含完整的测试套件，覆盖：

- 基本功能测试（创建配对、添加流动性、交换）
- 升级功能测试
- 权限控制测试
- 数据完整性测试

运行测试：

```bash
npx hardhat test
```

## 网络支持

- Ethereum Mainnet
- Ethereum Sepolia (测试网)
- Base Mainnet
- Polygon Mainnet

## 许可证

MIT License