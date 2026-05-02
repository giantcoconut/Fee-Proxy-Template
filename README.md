# Intuition Fee Proxy

A customizable proxy contract for the [Intuition](https://intuition.systems) MultiVault that allows you to collect fees on deposits.

## Features

- **Deposit-based fees**: Fixed fee per deposit + percentage fee on deposit amounts
- **Admin system**: Whitelisted admins can update fees and settings
- **Versioned upgrades**: ERC-7936-style proxy with registered implementations and a default version
- **Receiver pattern**: Shares are deposited directly to users (requires approval)
- **Full MultiVault compatibility**: All view functions pass through to MultiVault

## Fee Structure

All fees are applied **per deposit** (added on top of the deposit amount):

| Fee Type | Default | Description |
|----------|---------|-------------|
| Fixed fee | 0.1 TRUST | Applied per deposit operation |
| Percentage fee | 5% | Applied on deposit amounts |

Fees apply to:
- `deposit()` - direct deposits
- `createAtoms()` - deposits made during atom creation
- `createTriples()` - deposits made during triple creation
- `depositBatch()` - batch deposits

### Example

For a 10 TRUST deposit:
- Fixed fee: 0.1 TRUST
- Percentage fee: 0.5 TRUST (5% of 10)
- **Total fee: 0.6 TRUST**
- **User sends: 10.6 TRUST**
- **Deposited to MultiVault: 10 TRUST**

Note: MultiVault may apply its own internal fees on deposits.

## Prerequisites

- Node.js >= 18
- npm or yarn
- A wallet with TRUST tokens for deployment

## Quick Start

### 1. Clone and Install

```bash
git clone https://github.com/YOUR_USERNAME/intuition-fee-proxy.git
cd intuition-fee-proxy
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your configuration:

```env
# Deployer private key (with TRUST tokens)
PRIVATE_KEY=0x...

# Fee recipient address (receives all collected fees)
# IMPORTANT: Use an address on Intuition Network, NOT another chain
FEE_RECIPIENT=0x...

# Admin addresses (can modify fees and settings)
ADMIN_1=0x...
ADMIN_2=0x...  # Optional

# Fee configuration - ONLY APPLIED ON DEPOSITS
DEPOSIT_FEE=0.1         # Fixed fee per deposit (in TRUST)
DEPOSIT_PERCENTAGE=500  # Percentage fee (500 = 5%, base 10000)
```

### 3. Compile and Test

```bash
npm run compile
npm test
```

### 4. Deploy

The deploy script creates an `IntuitionFeeProxy` implementation and an `ERC7936Proxy`.
Use the proxy address in frontend integrations.

**Testnet (recommended first):**
```bash
npx hardhat run scripts/deploy.ts --network intuition-testnet
```

**Mainnet:**
```bash
npx hardhat run scripts/deploy.ts --network intuition
```

## Fee Calculation

```
fee = (depositFixedFee * depositCount) + (totalDeposit * depositPercentageFee / 10000)
```

Where:
- `depositCount` = number of **non-zero** deposits in the `assets[]` array
- `totalDeposit` = sum of all deposit amounts

**Important**: Fees are ONLY charged on deposits, NOT on atom/triple creation itself. The `atomCost` and `tripleCost` from MultiVault are passed through without any additional fee.

### Examples

**Single deposit of 0.05 TRUST on an existing vault**:
- Fee = (0.1 × 1) + (0.05 × 5%) = 0.1 + 0.0025 = **0.1025 TRUST**
- User sends: 0.1525 TRUST

**Creating 1 triple with a 0.1 TRUST deposit on it**:
- Triple creation cost: ~0.0004 TRUST (paid to MultiVault, no fee)
- Deposit fee: (0.1 × 1) + (0.1 × 5%) = 0.1 + 0.005 = **0.105 TRUST**
- User sends: tripleCost + 0.1 + 0.105 = ~0.2054 TRUST


**Batch deposit on 3 vaults** (assets = [0.01, 0.05, 0.1]):
- Deposit fee: (0.1 × 3) + (0.16 × 5%) = 0.3 + 0.008 = **0.308 TRUST**
- User sends: 0.16 + 0.308 = 0.468 TRUST

## User Approval Flow

Users must approve the proxy on MultiVault before using it:

```solidity
// User calls this once on MultiVault
multiVault.approve(proxyAddress, 1); // 1 = DEPOSIT approval
```

This allows the proxy to deposit shares on behalf of the user.

## Contract Functions

### User Functions

```solidity
// Create atoms with fee on deposits
createAtoms(receiver, data[], assets[], curveId) payable

// Create triples with fee on deposits
createTriples(receiver, subjectIds[], predicateIds[], objectIds[], assets[], curveId) payable

// Deposit with fee
deposit(receiver, termId, curveId, minShares) payable

// Batch deposit with fee
depositBatch(receiver, termIds[], curveIds[], assets[], minShares[]) payable
```

### Admin Functions

```solidity
setDepositFixedFee(newFee)
setDepositPercentageFee(newFee)
setFeeRecipient(newRecipient)
setWhitelistedAdmin(admin, status)
withdrawFees(amount)
withdrawAllFees()
sweepNonFeeBalance(recipient, amount)
```

### Versioned Proxy Functions

```solidity
registerVersion(version, implementation)
removeVersion(version)
setDefaultVersion(version)
getImplementation(version)
getDefaultVersion()
getVersions()
executeAtVersion(version, data)
upgradeToVersion(version, implementation, migrationData)
```

### View Functions

```solidity
// Calculate fee for deposits
calculateDepositFee(depositCount, totalDeposit)

// Get total cost including fees
getTotalDepositCost(depositAmount)
getTotalCreationCost(depositCount, totalDeposit, multiVaultCost)

// Calculate MultiVault amount from msg.value
getMultiVaultAmountFromValue(msgValue)
```

## Network Configuration

| Network | Chain ID | MultiVault Address |
|---------|----------|-------------------|
| Intuition Mainnet | 1155 | `0x6E35cF57A41fA15eA0EaE9C33e751b01A784Fe7e` |
| Intuition Testnet | 13579 | `0x2Ece8D4dEdcB9918A398528f3fa4688b1d2CAB91` |

## Frontend Integration

```typescript
// For a single deposit
const depositAmount = parseEther("10");
const totalCost = await proxy.getTotalDepositCost(depositAmount);
await proxy.deposit(userAddress, termId, curveId, 0, { value: totalCost });

// For createTriples with deposits
const tripleCost = await proxy.getTripleCost();
const depositAmounts = [parseEther("1"), parseEther("1")]; // 2 triples
const depositCount = 2; // non-zero deposits
const totalDeposit = parseEther("2");
const multiVaultCost = (tripleCost * 2n) + totalDeposit;
const totalCost = await proxy.getTotalCreationCost(depositCount, totalDeposit, multiVaultCost);

await proxy.createTriples(
  userAddress,
  subjectIds,
  predicateIds,
  objectIds,
  depositAmounts,
  curveId,
  { value: totalCost }
);
```

## Security Considerations

1. **Fee recipient chain**: Ensure `FEE_RECIPIENT` is an address you control on Intuition Network
2. **Admin keys**: Securely store admin private keys
3. **Fee limits**: Consider implementing maximum fee limits for user trust
4. **Upgrades**: Upgrade through the ERC-7936 proxy by registering a new implementation version and setting it as the default
5. **Fee accounting**: Fee withdrawals use explicit accrued-fee accounting; direct native TRUST/tTRUST sent to the proxy is separate non-fee balance

## Migration From V1

Existing V1 deployments were standalone contracts, not proxy deployments, so they cannot be upgraded in place with `upgradeToAndCall`.

Recommended migration path:

1. Read the existing V1 configuration: MultiVault, fee recipient, fixed fee, percentage fee, and admins.
2. Deploy the V2 `IntuitionFeeProxy` implementation.
3. Deploy a new `ERC7936Proxy` with version `v1` and initializer data matching the desired configuration.
4. Update frontend/app configuration to use the new proxy address.
5. For future changes, deploy a new implementation, register a new version, and set it as the default version through the ERC-7936 proxy.

## License

MIT
