# Intuition Fee Proxy V2

A customizable fee proxy for the [Intuition](https://intuition.systems) MultiVault. It wraps user-facing MultiVault create/deposit flows, charges configurable deposit-based fees, and routes calls through a versioned proxy deployment.

## Proposed Mission 02 Coverage

This PR proposes the following contract-side V2 work:

| Bounty | Status | Notes |
| --- | --- | --- |
| 2A | Implemented | Enforces `receiver == msg.sender` across user-facing create/deposit flows. |
| 2B | Implemented | Adds ERC-7936-style version routing with upgrade and state-preservation tests. |
| 2C | Implemented | Tracks accrued fees in-contract and supports controlled withdrawal. |
| 2D | Planned next | Factory/webapp work planned as the next slice. |
| 2E | Follow-up | Article/social write-up after implementation stabilizes. |

## Features

- **Receiver validation**: `deposit`, `depositBatch`, `createAtoms`, and `createTriples` require the receiver to be the caller.
- **Deposit-based fees**: Fixed fee per deposit plus percentage fee on deposited amounts.
- **Explicit fee accounting**: Collected fees accrue inside the proxy until withdrawn by the fee recipient or a whitelisted admin.
- **Versioned upgrades**: ERC-7936-style proxy with registered implementations, default-version routing, explicit version execution, and ERC-1967 implementation-slot synchronization.
- **Admin controls**: Whitelisted admins can update fee settings, fee recipient, admin permissions, versions, and non-fee balance sweeps.
- **MultiVault passthrough**: View helpers expose relevant MultiVault costs and vault state.

## Fee Structure

Fees are charged only on deposit amounts. Atom and triple creation costs from MultiVault are passed through without an additional proxy fee.

| Fee Type | Default | Description |
| --- | --- | --- |
| Fixed fee | 0.1 TRUST | Applied per non-zero deposit. |
| Percentage fee | 5% | Applied to the total deposited amount. |

Fees apply to deposits inside:

- `deposit()`
- `depositBatch()`
- `createAtoms()`
- `createTriples()`

### Example

For a 10 TRUST deposit:

- Fixed fee: 0.1 TRUST
- Percentage fee: 0.5 TRUST
- Total fee: 0.6 TRUST
- User sends: 10.6 TRUST
- Deposited to MultiVault: 10 TRUST

MultiVault may still apply its own internal fees.

## Quick Start

### 1. Install

```bash
git clone https://github.com/YOUR_USERNAME/Fee-Proxy-Template.git
cd Fee-Proxy-Template
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Set the deployment variables:

```env
PRIVATE_KEY=0x...

# Address controlled on Intuition Network.
FEE_RECIPIENT=0x...

ADMIN_1=0x...
ADMIN_2=0x...

# Deposit fee configuration.
DEPOSIT_FEE=0.1
DEPOSIT_PERCENTAGE=500
```

`DEPOSIT_PERCENTAGE` uses a 10,000 basis-point denominator, so `500` equals 5%.

### 3. Compile and Test

```bash
npm run compile
npm test
```

For TypeScript checks:

```bash
node ./node_modules/typescript/bin/tsc --noEmit --pretty false
```

### 4. Deploy

The deploy script creates an `IntuitionFeeProxy` implementation and an `ERC7936Proxy`. Frontends and integrations should use the proxy address.

```bash
npm run deploy:testnet
```

```bash
npm run deploy:mainnet
```

## Contract Flow

1. User approves the proxy on MultiVault for deposits.
2. User calls a proxy create/deposit function with themselves as `receiver`.
3. Proxy validates `receiver == msg.sender`.
4. Proxy calculates the deposit fee and forwards only the MultiVault-required value to MultiVault.
5. Proxy records the fee in `accruedFees`.
6. Fee recipient or a whitelisted admin withdraws accrued fees to `feeRecipient`.

## User Approval

Users must approve the proxy on MultiVault before using deposit flows:

```solidity
multiVault.approve(proxyAddress, 1);
```

## Fee Calculation

```text
fee = (depositFixedFee * depositCount) + (totalDeposit * depositPercentageFee / 10000)
```

Where:

- `depositCount` is the number of non-zero deposits.
- `totalDeposit` is the sum of all deposit amounts.

### Examples

Single deposit of 0.05 TRUST:

- Fee = `(0.1 * 1) + (0.05 * 5%)`
- Fee = `0.1025 TRUST`
- User sends `0.1525 TRUST`
- MultiVault receives `0.05 TRUST`

Creating one triple with a 0.1 TRUST deposit:

- Triple creation cost is paid to MultiVault with no proxy fee.
- Deposit fee = `(0.1 * 1) + (0.1 * 5%)`
- Deposit fee = `0.105 TRUST`
- User sends `tripleCost + 0.1 + 0.105`

Batch deposit on three vaults with assets `[0.01, 0.05, 0.1]`:

- Deposit fee = `(0.1 * 3) + (0.16 * 5%)`
- Deposit fee = `0.308 TRUST`
- User sends `0.468 TRUST`

## User Functions

```solidity
createAtoms(receiver, data, assets, curveId)
createTriples(receiver, subjectIds, predicateIds, objectIds, assets, curveId)
deposit(receiver, termId, curveId, minShares)
depositBatch(receiver, termIds, curveIds, assets, minShares)
```

All user-facing functions are payable and require `receiver == msg.sender`.

## Admin Functions

```solidity
setDepositFixedFee(newFee)
setDepositPercentageFee(newFee)
setFeeRecipient(newRecipient)
setWhitelistedAdmin(admin, status)
withdrawFees(amount)
withdrawAllFees()
sweepNonFeeBalance(recipient, amount)
```

`withdrawFees` and `withdrawAllFees` always send accrued fees to `feeRecipient`. Direct native TRUST/tTRUST sent to the proxy is treated as non-fee balance and can only be swept separately.

## Versioned Proxy Functions

```solidity
registerVersion(version, implementation)
removeVersion(version)
setDefaultVersion(version)
getImplementation(version)
getDefaultVersion()
getVersions()
executeAtVersion(version, data)
upgradeToVersion(version, implementation, migrationData)
versionedProxyAdmin()
transferVersionedProxyAdmin(newAdmin)
getActiveImplementation()
```

The proxy keeps ERC-7936-style default-version routing synchronized with the ERC-1967 implementation slot. After a default-version upgrade, regular calls route through the new default implementation while preserving proxy storage.

## View Functions

```solidity
calculateDepositFee(depositCount, totalDeposit)
getTotalDepositCost(depositAmount)
getTotalCreationCost(depositCount, totalDeposit, multiVaultCost)
getMultiVaultAmountFromValue(msgValue)
getAtomCost()
getTripleCost()
isTermCreated(termId)
getShares(user, termId, curveId)
```

## Network Configuration

| Network | Chain ID | MultiVault Address |
| --- | --- | --- |
| Intuition Mainnet | 1155 | `0x6E35cF57A41fA15eA0EaE9C33e751b01A784Fe7e` |
| Intuition Testnet | 13579 | `0x2Ece8D4dEdcB9918A398528f3fa4688b1d2CAB91` |

## Frontend Integration

```typescript
const depositAmount = ethers.parseEther("10");
const totalCost = await proxy.getTotalDepositCost(depositAmount);

await proxy.deposit(userAddress, termId, curveId, 0, {
  value: totalCost,
});
```

For create flows, include the MultiVault creation cost plus the proxy fee:

```typescript
const tripleCost = await proxy.getTripleCost();
const assets = [ethers.parseEther("1"), ethers.parseEther("1")];
const depositCount = 2;
const totalDeposit = assets.reduce((sum, amount) => sum + amount, 0n);
const multiVaultCost = tripleCost * 2n + totalDeposit;
const totalCost = await proxy.getTotalCreationCost(
  depositCount,
  totalDeposit,
  multiVaultCost
);

await proxy.createTriples(
  userAddress,
  subjectIds,
  predicateIds,
  objectIds,
  assets,
  curveId,
  { value: totalCost }
);
```

## Migration From V1

Existing V1 deployments were standalone contracts, not proxy deployments, so they cannot be upgraded in place with `upgradeToAndCall`.

Recommended migration path:

1. Read the existing V1 configuration: MultiVault, fee recipient, fixed fee, percentage fee, and admins.
2. Deploy the V2 `IntuitionFeeProxy` implementation.
3. Deploy a new `ERC7936Proxy` with version `v1` and initializer data matching the desired configuration.
4. Update frontend/app configuration to use the new proxy address.
5. For future changes, deploy a new implementation, register a new version, and set it as the default version through the ERC-7936 proxy.

## Security Notes

- Use a fee recipient address controlled on the target Intuition network.
- Keep deployer, admin, and proxy admin keys separate where possible.
- Review fee settings before deployment; percentage fees are bounded by contract validation.
- Use `withdrawFees` or `withdrawAllFees` for accrued protocol fees.
- Use `sweepNonFeeBalance` only for native TRUST/tTRUST that was sent directly to the proxy and is not part of `accruedFees`.
- Register and test a new implementation version before making it the default version.

## Validation

Current local validation for this branch:

```text
npm test
58 passing

node ./node_modules/typescript/bin/tsc --noEmit --pretty false
```

## License

MIT
