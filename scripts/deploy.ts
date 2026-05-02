import { ethers } from "hardhat";

// ============ MultiVault Addresses ============
const MULTIVAULT_INTUITION = "0x6E35cF57A41fA15eA0EaE9C33e751b01A784Fe7e";  // Intuition Mainnet (chain ID: 1155)
const MULTIVAULT_TESTNET = "0x2Ece8D4dEdcB9918A398528f3fa4688b1d2CAB91";    // Intuition Testnet (chain ID: 13579)

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);
  console.log("Account balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)));

  // ============ CONFIGURATION - EDIT THESE VALUES ============

  // Fee recipient address (receives all collected fees)
  // IMPORTANT: Use an address on the SAME CHAIN you're deploying to
  const FEE_RECIPIENT = process.env.FEE_RECIPIENT;
  if (!FEE_RECIPIENT) {
    throw new Error("Missing FEE_RECIPIENT environment variable");
  }

  // Admin addresses (can modify fees and settings)
  const admin1 = process.env.ADMIN_1;
  const admin2 = process.env.ADMIN_2;
  if (!admin1) {
    throw new Error("Missing ADMIN_1 environment variable");
  }
  const admins = admin2 ? [admin1, admin2] : [admin1];

  // Fee configuration - FEES ARE ONLY APPLIED ON DEPOSITS
  const DEPOSIT_FIXED_FEE = ethers.parseEther(process.env.DEPOSIT_FEE || "0.1");   // Fixed fee per deposit (default: 0.1 TRUST)
  const DEPOSIT_PERCENTAGE = BigInt(process.env.DEPOSIT_PERCENTAGE || "500");      // Percentage fee (500 = 5%, base 10000)

  // ============ END CONFIGURATION ============

  // Select MultiVault address based on network
  let multiVault: string;
  const chainId = (await ethers.provider.getNetwork()).chainId;

  if (chainId === 1155n) {
    multiVault = MULTIVAULT_INTUITION;
    console.log("Deploying to Intuition Mainnet");
  } else if (chainId === 13579n) {
    multiVault = MULTIVAULT_TESTNET;
    console.log("Deploying to Intuition Testnet");
  } else if (chainId === 31337n) {
    multiVault = MULTIVAULT_TESTNET;
    console.log("Deploying to local network");
  } else {
    throw new Error(`Unsupported chain ID: ${chainId}. Supported: 1155 (Mainnet), 13579 (Testnet)`);
  }

  console.log("\nConfiguration:");
  console.log("- MultiVault address:", multiVault);
  console.log("- Fee recipient:", FEE_RECIPIENT);
  console.log("- Admins:", admins.join(", "));
  console.log("- Deposit fixed fee:", ethers.formatEther(DEPOSIT_FIXED_FEE), "TRUST");
  console.log("- Deposit percentage:", Number(DEPOSIT_PERCENTAGE) / 100, "%");

  // Deploy implementation and ERC-7936 proxy
  console.log("\nDeploying IntuitionFeeProxy implementation...");
  const IntuitionFeeProxy = await ethers.getContractFactory("IntuitionFeeProxy");
  const implementation = await IntuitionFeeProxy.deploy();
  await implementation.waitForDeployment();
  const implementationAddress = await implementation.getAddress();

  const initializationData = IntuitionFeeProxy.interface.encodeFunctionData("initialize", [
    multiVault,
    FEE_RECIPIENT,
    DEPOSIT_FIXED_FEE,
    DEPOSIT_PERCENTAGE,
    admins,
  ]);

  const initialVersion = ethers.encodeBytes32String("v1");
  console.log("Implementation address:", implementationAddress);
  console.log("\nDeploying ERC7936Proxy...");

  const ERC7936Proxy = await ethers.getContractFactory("ERC7936Proxy");
  const proxy = await ERC7936Proxy.deploy(
    admin1,
    initialVersion,
    implementationAddress,
    initializationData
  );

  await proxy.waitForDeployment();
  const proxyAddress = await proxy.getAddress();

  console.log("\n========================================");
  console.log("IntuitionFeeProxy V2 deployed successfully!");
  console.log("Implementation address:", implementationAddress);
  console.log("ERC-7936 proxy address:", proxyAddress);
  console.log("Initial version:", ethers.decodeBytes32String(initialVersion));
  console.log("========================================");

  // Verify contract on explorer (if not local)
  if (chainId !== 31337n) {
    console.log("\nWaiting for block confirmations...");
    const deployTx = proxy.deploymentTransaction();
    if (deployTx) {
      await deployTx.wait(5);
    }

    console.log("Verifying contracts on explorer...");
    try {
      const { run } = await import("hardhat");
      await run("verify:verify", {
        address: implementationAddress,
        constructorArguments: [],
      });
      await run("verify:verify", {
        address: proxyAddress,
        constructorArguments: [admin1, initialVersion, implementationAddress, initializationData],
      });
      console.log("Contracts verified successfully!");
    } catch (error: any) {
      if (error.message.includes("Already Verified")) {
        console.log("Contract already verified");
      } else {
        console.error("Verification failed:", error.message);
      }
    }
  }

  console.log("\nNext steps:");
  console.log("1. Save the ERC-7936 proxy address in your frontend config");
  console.log("2. Users must approve the proxy on MultiVault before using it:");
  console.log(`   multiVault.approve("${proxyAddress}", 1) // 1 = DEPOSIT approval`);
  console.log("3. Future upgrades should register a new version and set it as default through ERC7936Proxy");

  return { implementationAddress, proxyAddress };
}

main()
  .then(({ proxyAddress }) => {
    console.log("\nDeployment complete!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Deployment failed:", error);
    process.exit(1);
  });
