# AMM Platform with Beacon Upgrades

### 核心合约

1. **AMMFactoryUpgradeable**: 支持 Beacon 升级的工厂合约
2. **AMMPairUpgradeable**: 支持升级的配对合约实现
3. **MyToken**: 测试用的 ERC20 代币


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
FACTORY_BEACON_ADDRESS=<factory_beacon_address> npx hardhat run scripts/upgrade-factory.js --network <network>
```

### 升级配对合约实现

```bash
PAIR_BEACON_ADDRESS=<pair_beacon_address> npx hardhat run scripts/upgrade-pair.js --network <network>
```
