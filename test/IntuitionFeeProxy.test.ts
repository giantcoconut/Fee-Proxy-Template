import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { ERC7936Proxy, IntuitionFeeProxy, MockMultiVault } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("IntuitionFeeProxy", function () {
  // Constants - customize these for your deployment
  const FEE_RECIPIENT = "0x0000000000000000000000000000000000000001"; // Replace with your address
  const DEPOSIT_FEE = ethers.parseEther("0.1"); // 0.1 TRUST per deposit
  const DEPOSIT_PERCENTAGE = 500n; // 5%
  const FEE_DENOMINATOR = 10000n;
  const VERSION_V1 = ethers.encodeBytes32String("v1");
  const VERSION_V2 = ethers.encodeBytes32String("v2");

  // Fixture to deploy contracts
  async function deployFixture() {
    const [owner, admin1, admin2, admin3, user, nonAdmin] = await ethers.getSigners();

    // Deploy MockMultiVault
    const MockMultiVaultFactory = await ethers.getContractFactory("MockMultiVault");
    const mockMultiVault = await MockMultiVaultFactory.deploy();
    await mockMultiVault.waitForDeployment();

    // Deploy IntuitionFeeProxy
    const IntuitionFeeProxyFactory = await ethers.getContractFactory("IntuitionFeeProxy");
    const implementation = await IntuitionFeeProxyFactory.deploy();
    await implementation.waitForDeployment();

    const initializationData = IntuitionFeeProxyFactory.interface.encodeFunctionData("initialize", [
      await mockMultiVault.getAddress(),
      FEE_RECIPIENT,
      DEPOSIT_FEE,
      DEPOSIT_PERCENTAGE,
      [admin1.address, admin2.address, admin3.address],
    ]);

    const ERC7936ProxyFactory = await ethers.getContractFactory("ERC7936Proxy");
    const deployedVersionedProxy = await ERC7936ProxyFactory.deploy(
      admin1.address,
      VERSION_V1,
      await implementation.getAddress(),
      initializationData
    );
    await deployedVersionedProxy.waitForDeployment();

    const versionedProxy = await ethers.getContractAt("ERC7936Proxy", await deployedVersionedProxy.getAddress()) as unknown as ERC7936Proxy;
    const proxy = await ethers.getContractAt("IntuitionFeeProxy", await deployedVersionedProxy.getAddress()) as unknown as IntuitionFeeProxy;

    return { proxy, versionedProxy, implementation, mockMultiVault, owner, admin1, admin2, admin3, user, nonAdmin };
  }

  describe("Initialization", function () {
    it("Should set correct MultiVault address", async function () {
      const { proxy, mockMultiVault } = await loadFixture(deployFixture);
      expect(await proxy.ethMultiVault()).to.equal(await mockMultiVault.getAddress());
    });

    it("Should set correct fee recipient", async function () {
      const { proxy } = await loadFixture(deployFixture);
      expect(await proxy.feeRecipient()).to.equal(FEE_RECIPIENT);
    });

    it("Should set correct deposit fees", async function () {
      const { proxy } = await loadFixture(deployFixture);
      expect(await proxy.depositFixedFee()).to.equal(DEPOSIT_FEE);
      expect(await proxy.depositPercentageFee()).to.equal(DEPOSIT_PERCENTAGE);
    });

    it("Should whitelist initial admins", async function () {
      const { proxy, admin1, admin2, admin3 } = await loadFixture(deployFixture);
      expect(await proxy.whitelistedAdmins(admin1.address)).to.be.true;
      expect(await proxy.whitelistedAdmins(admin2.address)).to.be.true;
      expect(await proxy.whitelistedAdmins(admin3.address)).to.be.true;
    });

    it("Should not whitelist non-admins", async function () {
      const { proxy, nonAdmin } = await loadFixture(deployFixture);
      expect(await proxy.whitelistedAdmins(nonAdmin.address)).to.be.false;
    });

    it("Should revert on zero MultiVault address", async function () {
      const [admin] = await ethers.getSigners();
      const IntuitionFeeProxyFactory = await ethers.getContractFactory("IntuitionFeeProxy");
      const implementation = await IntuitionFeeProxyFactory.deploy();
      await implementation.waitForDeployment();
      const ERC7936ProxyFactory = await ethers.getContractFactory("ERC7936Proxy");
      const initializationData = IntuitionFeeProxyFactory.interface.encodeFunctionData("initialize", [
        ethers.ZeroAddress,
        FEE_RECIPIENT,
        DEPOSIT_FEE,
        DEPOSIT_PERCENTAGE,
        [admin.address],
      ]);

      await expect(
        ERC7936ProxyFactory.deploy(admin.address, VERSION_V1, await implementation.getAddress(), initializationData)
      ).to.be.revertedWithCustomError(IntuitionFeeProxyFactory, "IntuitionFeeProxy_InvalidMultiVaultAddress");
    });

    it("Should revert on zero fee recipient address", async function () {
      const { mockMultiVault } = await loadFixture(deployFixture);
      const [admin] = await ethers.getSigners();
      const IntuitionFeeProxyFactory = await ethers.getContractFactory("IntuitionFeeProxy");
      const implementation = await IntuitionFeeProxyFactory.deploy();
      await implementation.waitForDeployment();
      const ERC7936ProxyFactory = await ethers.getContractFactory("ERC7936Proxy");
      const initializationData = IntuitionFeeProxyFactory.interface.encodeFunctionData("initialize", [
        await mockMultiVault.getAddress(),
        ethers.ZeroAddress,
        DEPOSIT_FEE,
        DEPOSIT_PERCENTAGE,
        [admin.address],
      ]);

      await expect(
        ERC7936ProxyFactory.deploy(admin.address, VERSION_V1, await implementation.getAddress(), initializationData)
      ).to.be.revertedWithCustomError(IntuitionFeeProxyFactory, "IntuitionFeeProxy_InvalidMultisigAddress");
    });

    it("Should disable the implementation initializer", async function () {
      const { implementation, mockMultiVault, admin1 } = await loadFixture(deployFixture);

      await expect(
        implementation.initialize(
          await mockMultiVault.getAddress(),
          FEE_RECIPIENT,
          DEPOSIT_FEE,
          DEPOSIT_PERCENTAGE,
          [admin1.address]
        )
      ).to.be.reverted;
    });

    it("Should prevent proxy reinitialization", async function () {
      const { proxy, mockMultiVault, admin1 } = await loadFixture(deployFixture);

      await expect(
        proxy.initialize(
          await mockMultiVault.getAddress(),
          FEE_RECIPIENT,
          DEPOSIT_FEE,
          DEPOSIT_PERCENTAGE,
          [admin1.address]
        )
      ).to.be.reverted;
    });
  });

  describe("ERC-7936 Versioned Proxy", function () {
    it("Should initialize the default version and active implementation consistently", async function () {
      const { versionedProxy, implementation, admin1 } = await loadFixture(deployFixture);

      expect(await versionedProxy.versionedProxyAdmin()).to.equal(admin1.address);
      expect(await versionedProxy.getDefaultVersion()).to.equal(VERSION_V1);
      expect(await versionedProxy.getImplementation(VERSION_V1)).to.equal(await implementation.getAddress());
      expect(await versionedProxy.getActiveImplementation()).to.equal(await implementation.getAddress());
      expect(await versionedProxy.getVersions()).to.deep.equal([VERSION_V1]);
    });

    it("Should reject invalid proxy construction parameters", async function () {
      const { implementation } = await loadFixture(deployFixture);
      const [admin] = await ethers.getSigners();
      const ERC7936ProxyFactory = await ethers.getContractFactory("ERC7936Proxy");

      await expect(
        ERC7936ProxyFactory.deploy(ethers.ZeroAddress, VERSION_V1, await implementation.getAddress(), "0x")
      ).to.be.revertedWithCustomError(ERC7936ProxyFactory, "IntuitionFeeProxy_ZeroAddress");

      await expect(
        ERC7936ProxyFactory.deploy(admin.address, ethers.ZeroHash, await implementation.getAddress(), "0x")
      ).to.be.revertedWithCustomError(ERC7936ProxyFactory, "IntuitionFeeProxy_InvalidVersion");

      await expect(
        ERC7936ProxyFactory.deploy(admin.address, VERSION_V1, admin.address, "0x")
      ).to.be.revertedWithCustomError(ERC7936ProxyFactory, "IntuitionFeeProxy_InvalidImplementation");
    });

    it("Should restrict version management to the versioned proxy admin", async function () {
      const { versionedProxy, implementation, nonAdmin } = await loadFixture(deployFixture);

      await expect(versionedProxy.connect(nonAdmin).registerVersion(VERSION_V2, await implementation.getAddress()))
        .to.be.revertedWithCustomError(versionedProxy, "IntuitionFeeProxy_NotVersionedProxyAdmin");

      await expect(versionedProxy.connect(nonAdmin).setDefaultVersion(VERSION_V1))
        .to.be.revertedWithCustomError(versionedProxy, "IntuitionFeeProxy_NotVersionedProxyAdmin");

      await expect(versionedProxy.connect(nonAdmin).upgradeToVersion(VERSION_V2, await implementation.getAddress(), "0x"))
        .to.be.revertedWithCustomError(versionedProxy, "IntuitionFeeProxy_NotVersionedProxyAdmin");
    });

    it("Should register, remove, and protect registered versions", async function () {
      const { versionedProxy, admin1 } = await loadFixture(deployFixture);
      const IntuitionFeeProxyV2Factory = await ethers.getContractFactory("IntuitionFeeProxyV2");
      const implementationV2 = await IntuitionFeeProxyV2Factory.deploy();
      await implementationV2.waitForDeployment();

      await expect(versionedProxy.connect(admin1).registerVersion(VERSION_V2, await implementationV2.getAddress()))
        .to.emit(versionedProxy, "VersionRegistered")
        .withArgs(VERSION_V2, await implementationV2.getAddress());

      await expect(versionedProxy.connect(admin1).registerVersion(VERSION_V2, await implementationV2.getAddress()))
        .to.be.revertedWithCustomError(versionedProxy, "IntuitionFeeProxy_VersionAlreadyRegistered");

      await expect(versionedProxy.connect(admin1).removeVersion(VERSION_V1))
        .to.be.revertedWithCustomError(versionedProxy, "IntuitionFeeProxy_CannotRemoveDefaultVersion");

      await expect(versionedProxy.connect(admin1).removeVersion(VERSION_V2))
        .to.emit(versionedProxy, "VersionRemoved")
        .withArgs(VERSION_V2);

      await expect(versionedProxy.getImplementation(VERSION_V2))
        .to.be.revertedWithCustomError(versionedProxy, "IntuitionFeeProxy_VersionNotRegistered");
    });

    it("Should execute a registered non-default version explicitly", async function () {
      const { versionedProxy, admin1 } = await loadFixture(deployFixture);
      const IntuitionFeeProxyV2Factory = await ethers.getContractFactory("IntuitionFeeProxyV2");
      const implementationV2 = await IntuitionFeeProxyV2Factory.deploy();
      await implementationV2.waitForDeployment();

      await versionedProxy.connect(admin1).registerVersion(VERSION_V2, await implementationV2.getAddress());

      const data = IntuitionFeeProxyV2Factory.interface.encodeFunctionData("versionLabel");
      const result = await versionedProxy.executeAtVersion.staticCall(VERSION_V2, data);
      const [label] = IntuitionFeeProxyV2Factory.interface.decodeFunctionResult("versionLabel", result);

      expect(label).to.equal("v2");
      expect(await versionedProxy.getDefaultVersion()).to.equal(VERSION_V1);
    });

    it("Should upgrade default version and preserve fee proxy state", async function () {
      const { proxy, versionedProxy, implementation, mockMultiVault, admin1, admin2, user } = await loadFixture(deployFixture);

      const desiredDepositAmount = ethers.parseEther("4");
      const totalToSend = await proxy.getTotalDepositCost(desiredDepositAmount);
      const expectedFee = await proxy.calculateDepositFee(1n, desiredDepositAmount);
      const termId = ethers.zeroPadValue("0x77", 32);

      await proxy.connect(user).deposit(user.address, termId, 1n, 0n, { value: totalToSend });
      await proxy.connect(admin1).setDepositFixedFee(ethers.parseEther("0.2"));

      const IntuitionFeeProxyV2Factory = await ethers.getContractFactory("IntuitionFeeProxyV2");
      const implementationV2 = await IntuitionFeeProxyV2Factory.deploy();
      await implementationV2.waitForDeployment();

      await expect(versionedProxy.connect(admin1).upgradeToVersion(VERSION_V2, await implementationV2.getAddress(), "0x"))
        .to.emit(versionedProxy, "VersionRegistered")
        .withArgs(VERSION_V2, await implementationV2.getAddress())
        .and.to.emit(versionedProxy, "DefaultVersionChanged")
        .withArgs(VERSION_V1, VERSION_V2);

      const proxyAsV2 = await ethers.getContractAt("IntuitionFeeProxyV2", await versionedProxy.getAddress());

      expect(await versionedProxy.getImplementation(VERSION_V1)).to.equal(await implementation.getAddress());
      expect(await versionedProxy.getImplementation(VERSION_V2)).to.equal(await implementationV2.getAddress());
      expect(await versionedProxy.getActiveImplementation()).to.equal(await implementationV2.getAddress());
      expect(await versionedProxy.getDefaultVersion()).to.equal(VERSION_V2);
      expect(await proxyAsV2.versionLabel()).to.equal("v2");

      expect(await proxyAsV2.ethMultiVault()).to.equal(await mockMultiVault.getAddress());
      expect(await proxyAsV2.feeRecipient()).to.equal(FEE_RECIPIENT);
      expect(await proxyAsV2.depositFixedFee()).to.equal(ethers.parseEther("0.2"));
      expect(await proxyAsV2.depositPercentageFee()).to.equal(DEPOSIT_PERCENTAGE);
      expect(await proxyAsV2.accruedFees()).to.equal(expectedFee);
      expect(await proxyAsV2.whitelistedAdmins(admin1.address)).to.be.true;
      expect(await proxyAsV2.whitelistedAdmins(admin2.address)).to.be.true;
    });

    it("Should reject unsupported or conflicting upgrades", async function () {
      const { versionedProxy, admin1, user } = await loadFixture(deployFixture);
      const IntuitionFeeProxyV2Factory = await ethers.getContractFactory("IntuitionFeeProxyV2");
      const implementationV2 = await IntuitionFeeProxyV2Factory.deploy();
      await implementationV2.waitForDeployment();

      await expect(versionedProxy.connect(admin1).setDefaultVersion(VERSION_V2))
        .to.be.revertedWithCustomError(versionedProxy, "IntuitionFeeProxy_VersionNotRegistered");

      await versionedProxy.connect(admin1).registerVersion(VERSION_V2, await implementationV2.getAddress());

      await expect(versionedProxy.connect(admin1).upgradeToVersion(VERSION_V2, user.address, "0x"))
        .to.be.revertedWithCustomError(versionedProxy, "IntuitionFeeProxy_VersionAlreadyRegistered");
    });

    it("Should transfer versioned proxy admin", async function () {
      const { versionedProxy, admin1, admin2 } = await loadFixture(deployFixture);

      await expect(versionedProxy.connect(admin1).transferVersionedProxyAdmin(admin2.address))
        .to.emit(versionedProxy, "VersionedProxyAdminTransferred")
        .withArgs(admin1.address, admin2.address);

      expect(await versionedProxy.versionedProxyAdmin()).to.equal(admin2.address);
      await expect(versionedProxy.connect(admin1).setDefaultVersion(VERSION_V1))
        .to.be.revertedWithCustomError(versionedProxy, "IntuitionFeeProxy_NotVersionedProxyAdmin");
      await expect(versionedProxy.connect(admin2).setDefaultVersion(VERSION_V1))
        .to.emit(versionedProxy, "DefaultVersionChanged")
        .withArgs(VERSION_V1, VERSION_V1);
    });
  });

  describe("Fee Calculations", function () {
    it("Should calculate deposit fee correctly (single deposit)", async function () {
      const { proxy } = await loadFixture(deployFixture);
      const depositAmount = ethers.parseEther("10");

      // Fee = 0.1 + (10 * 5%) = 0.1 + 0.5 = 0.6 TRUST
      const expectedFee = DEPOSIT_FEE + (depositAmount * DEPOSIT_PERCENTAGE / FEE_DENOMINATOR);
      expect(await proxy.calculateDepositFee(1n, depositAmount)).to.equal(expectedFee);
      expect(expectedFee).to.equal(ethers.parseEther("0.6"));
    });

    it("Should calculate deposit fee correctly (multiple deposits)", async function () {
      const { proxy } = await loadFixture(deployFixture);
      const depositCount = 3n;
      const totalDeposit = ethers.parseEther("30");

      // Fee = (0.1 * 3) + (30 * 5%) = 0.3 + 1.5 = 1.8 TRUST
      const expectedFee = (DEPOSIT_FEE * depositCount) + (totalDeposit * DEPOSIT_PERCENTAGE / FEE_DENOMINATOR);
      expect(await proxy.calculateDepositFee(depositCount, totalDeposit)).to.equal(expectedFee);
      expect(expectedFee).to.equal(ethers.parseEther("1.8"));
    });

    it("Should calculate total deposit cost correctly", async function () {
      const { proxy } = await loadFixture(deployFixture);
      const depositAmount = ethers.parseEther("10");

      const fee = await proxy.calculateDepositFee(1n, depositAmount);
      const totalCost = await proxy.getTotalDepositCost(depositAmount);
      expect(totalCost).to.equal(depositAmount + fee);
    });

    it("Should calculate total creation cost correctly", async function () {
      const { proxy } = await loadFixture(deployFixture);
      const depositCount = 3n;
      const totalDeposit = ethers.parseEther("0.03");
      const multiVaultCost = ethers.parseEther("1");

      const fee = await proxy.calculateDepositFee(depositCount, totalDeposit);
      const totalCost = await proxy.getTotalCreationCost(depositCount, totalDeposit, multiVaultCost);
      expect(totalCost).to.equal(multiVaultCost + fee);
    });
  });

  describe("Admin Functions", function () {
    it("Should allow admin to set deposit fixed fee", async function () {
      const { proxy, admin1 } = await loadFixture(deployFixture);
      const newFee = ethers.parseEther("0.2");

      await expect(proxy.connect(admin1).setDepositFixedFee(newFee))
        .to.emit(proxy, "DepositFixedFeeUpdated")
        .withArgs(DEPOSIT_FEE, newFee);

      expect(await proxy.depositFixedFee()).to.equal(newFee);
    });

    it("Should allow admin to set deposit percentage", async function () {
      const { proxy, admin2 } = await loadFixture(deployFixture);
      const newPercentage = 1000n; // 10%

      await expect(proxy.connect(admin2).setDepositPercentageFee(newPercentage))
        .to.emit(proxy, "DepositPercentageFeeUpdated")
        .withArgs(DEPOSIT_PERCENTAGE, newPercentage);

      expect(await proxy.depositPercentageFee()).to.equal(newPercentage);
    });

    it("Should allow admin to set fee recipient", async function () {
      const { proxy, admin1, user } = await loadFixture(deployFixture);

      await expect(proxy.connect(admin1).setFeeRecipient(user.address))
        .to.emit(proxy, "FeeRecipientUpdated")
        .withArgs(FEE_RECIPIENT, user.address);

      expect(await proxy.feeRecipient()).to.equal(user.address);
    });

    it("Should allow admin to whitelist new admin", async function () {
      const { proxy, admin1, nonAdmin } = await loadFixture(deployFixture);

      await expect(proxy.connect(admin1).setWhitelistedAdmin(nonAdmin.address, true))
        .to.emit(proxy, "AdminWhitelistUpdated")
        .withArgs(nonAdmin.address, true);

      expect(await proxy.whitelistedAdmins(nonAdmin.address)).to.be.true;
    });

    it("Should allow admin to remove admin", async function () {
      const { proxy, admin1, admin2 } = await loadFixture(deployFixture);

      await proxy.connect(admin1).setWhitelistedAdmin(admin2.address, false);
      expect(await proxy.whitelistedAdmins(admin2.address)).to.be.false;
    });

    it("Should revert when non-admin tries to set fees", async function () {
      const { proxy, nonAdmin } = await loadFixture(deployFixture);

      await expect(proxy.connect(nonAdmin).setDepositFixedFee(ethers.parseEther("0.5")))
        .to.be.revertedWithCustomError(proxy, "IntuitionFeeProxy_NotWhitelistedAdmin");
    });

    it("Should revert when setting fee recipient to zero address", async function () {
      const { proxy, admin1 } = await loadFixture(deployFixture);

      await expect(proxy.connect(admin1).setFeeRecipient(ethers.ZeroAddress))
        .to.be.revertedWithCustomError(proxy, "IntuitionFeeProxy_ZeroAddress");
    });

    it("Should revert when percentage fee is too high", async function () {
      const { proxy, admin1 } = await loadFixture(deployFixture);

      await expect(proxy.connect(admin1).setDepositPercentageFee(10001n))
        .to.be.revertedWithCustomError(proxy, "IntuitionFeeProxy_FeePercentageTooHigh");
    });
  });

  describe("Fee Withdrawal", function () {
    it("Should accrue fees instead of forwarding them immediately", async function () {
      const { proxy, user } = await loadFixture(deployFixture);

      const desiredDepositAmount = ethers.parseEther("10");
      const totalToSend = await proxy.getTotalDepositCost(desiredDepositAmount);
      const expectedFee = await proxy.calculateDepositFee(1n, desiredDepositAmount);
      const termId = ethers.zeroPadValue("0x01", 32);

      const initialFeeRecipientBalance = await ethers.provider.getBalance(FEE_RECIPIENT);

      await expect(proxy.connect(user).deposit(user.address, termId, 1n, 0n, { value: totalToSend }))
        .to.emit(proxy, "FeesCollected")
        .withArgs(user.address, expectedFee, "deposit");

      expect(await ethers.provider.getBalance(FEE_RECIPIENT)).to.equal(initialFeeRecipientBalance);
      expect(await proxy.accruedFees()).to.equal(expectedFee);
      expect(await ethers.provider.getBalance(await proxy.getAddress())).to.equal(expectedFee);
    });

    it("Should allow a whitelisted admin to partially withdraw accrued fees to feeRecipient", async function () {
      const { proxy, user, admin1 } = await loadFixture(deployFixture);

      const desiredDepositAmount = ethers.parseEther("10");
      const totalToSend = await proxy.getTotalDepositCost(desiredDepositAmount);
      const expectedFee = await proxy.calculateDepositFee(1n, desiredDepositAmount);
      const withdrawalAmount = expectedFee / 2n;
      const termId = ethers.zeroPadValue("0x01", 32);

      await proxy.connect(user).deposit(user.address, termId, 1n, 0n, { value: totalToSend });

      const initialFeeRecipientBalance = await ethers.provider.getBalance(FEE_RECIPIENT);

      await expect(proxy.connect(admin1).withdrawFees(withdrawalAmount))
        .to.emit(proxy, "FeesWithdrawn")
        .withArgs(admin1.address, FEE_RECIPIENT, withdrawalAmount, expectedFee - withdrawalAmount);

      expect(await ethers.provider.getBalance(FEE_RECIPIENT)).to.equal(initialFeeRecipientBalance + withdrawalAmount);
      expect(await proxy.accruedFees()).to.equal(expectedFee - withdrawalAmount);
    });

    it("Should allow a whitelisted admin to withdraw all accrued fees to feeRecipient", async function () {
      const { proxy, user, admin1 } = await loadFixture(deployFixture);

      const desiredDepositAmount = ethers.parseEther("2");
      const totalToSend = await proxy.getTotalDepositCost(desiredDepositAmount);
      const expectedFee = await proxy.calculateDepositFee(1n, desiredDepositAmount);
      const termId = ethers.zeroPadValue("0x01", 32);

      await proxy.connect(user).deposit(user.address, termId, 1n, 0n, { value: totalToSend });

      const initialFeeRecipientBalance = await ethers.provider.getBalance(FEE_RECIPIENT);

      await expect(proxy.connect(admin1).withdrawAllFees())
        .to.emit(proxy, "FeesWithdrawn")
        .withArgs(admin1.address, FEE_RECIPIENT, expectedFee, 0n);

      expect(await ethers.provider.getBalance(FEE_RECIPIENT)).to.equal(initialFeeRecipientBalance + expectedFee);
      expect(await proxy.accruedFees()).to.equal(0n);
    });

    it("Should allow the fee recipient to pull accrued fees to itself", async function () {
      const { proxy, user, admin1 } = await loadFixture(deployFixture);

      await proxy.connect(admin1).setFeeRecipient(user.address);

      const desiredDepositAmount = ethers.parseEther("3");
      const totalToSend = await proxy.getTotalDepositCost(desiredDepositAmount);
      const expectedFee = await proxy.calculateDepositFee(1n, desiredDepositAmount);
      const termId = ethers.zeroPadValue("0x01", 32);

      await proxy.connect(user).deposit(user.address, termId, 1n, 0n, { value: totalToSend });

      await expect(proxy.connect(user).withdrawAllFees())
        .to.emit(proxy, "FeesWithdrawn")
        .withArgs(user.address, user.address, expectedFee, 0n);

      expect(await proxy.accruedFees()).to.equal(0n);
    });

    it("Should prevent unauthorized callers from withdrawing fees", async function () {
      const { proxy, user, nonAdmin } = await loadFixture(deployFixture);

      const desiredDepositAmount = ethers.parseEther("1");
      const totalToSend = await proxy.getTotalDepositCost(desiredDepositAmount);
      const termId = ethers.zeroPadValue("0x01", 32);

      await proxy.connect(user).deposit(user.address, termId, 1n, 0n, { value: totalToSend });

      await expect(proxy.connect(nonAdmin).withdrawFees(1n))
        .to.be.revertedWithCustomError(proxy, "IntuitionFeeProxy_NotFeeWithdrawer");
    });

    it("Should revert when withdrawing zero or more than accrued fees", async function () {
      const { proxy, user, admin1 } = await loadFixture(deployFixture);

      const desiredDepositAmount = ethers.parseEther("1");
      const totalToSend = await proxy.getTotalDepositCost(desiredDepositAmount);
      const expectedFee = await proxy.calculateDepositFee(1n, desiredDepositAmount);
      const termId = ethers.zeroPadValue("0x01", 32);

      await proxy.connect(user).deposit(user.address, termId, 1n, 0n, { value: totalToSend });

      await expect(proxy.connect(admin1).withdrawFees(0n))
        .to.be.revertedWithCustomError(proxy, "IntuitionFeeProxy_ZeroAmount");

      await expect(proxy.connect(admin1).withdrawFees(expectedFee + 1n))
        .to.be.revertedWithCustomError(proxy, "IntuitionFeeProxy_InsufficientAccruedFees");
    });

    it("Should revert when fee recipient rejects native token transfers", async function () {
      const { proxy, user, admin1 } = await loadFixture(deployFixture);

      const RejectNativeTransferFactory = await ethers.getContractFactory("RejectNativeTransfer");
      const rejectingRecipient = await RejectNativeTransferFactory.deploy();
      await rejectingRecipient.waitForDeployment();

      await proxy.connect(admin1).setFeeRecipient(await rejectingRecipient.getAddress());

      const desiredDepositAmount = ethers.parseEther("1");
      const totalToSend = await proxy.getTotalDepositCost(desiredDepositAmount);
      const termId = ethers.zeroPadValue("0x01", 32);

      await proxy.connect(user).deposit(user.address, termId, 1n, 0n, { value: totalToSend });

      await expect(proxy.connect(admin1).withdrawAllFees())
        .to.be.revertedWithCustomError(proxy, "IntuitionFeeProxy_TransferFailed");
    });

    it("Should not allow non-fee native token balance to be withdrawn as fees", async function () {
      const { proxy, user, admin1 } = await loadFixture(deployFixture);

      const nonFeeAmount = ethers.parseEther("1");
      await user.sendTransaction({
        to: await proxy.getAddress(),
        value: nonFeeAmount,
      });

      expect(await proxy.accruedFees()).to.equal(0n);
      expect(await proxy.getNonFeeBalance()).to.equal(nonFeeAmount);

      await expect(proxy.connect(admin1).withdrawFees(nonFeeAmount))
        .to.be.revertedWithCustomError(proxy, "IntuitionFeeProxy_InsufficientAccruedFees");
    });

    it("Should allow admins to sweep only non-fee native token balance", async function () {
      const { proxy, user, admin1, nonAdmin } = await loadFixture(deployFixture);

      const desiredDepositAmount = ethers.parseEther("1");
      const totalToSend = await proxy.getTotalDepositCost(desiredDepositAmount);
      const accruedFee = await proxy.calculateDepositFee(1n, desiredDepositAmount);
      const termId = ethers.zeroPadValue("0x01", 32);

      await proxy.connect(user).deposit(user.address, termId, 1n, 0n, { value: totalToSend });

      const nonFeeAmount = ethers.parseEther("0.25");
      await user.sendTransaction({
        to: await proxy.getAddress(),
        value: nonFeeAmount,
      });

      await expect(proxy.connect(nonAdmin).sweepNonFeeBalance(nonAdmin.address, 1n))
        .to.be.revertedWithCustomError(proxy, "IntuitionFeeProxy_NotWhitelistedAdmin");

      await expect(proxy.connect(admin1).sweepNonFeeBalance(ethers.ZeroAddress, 1n))
        .to.be.revertedWithCustomError(proxy, "IntuitionFeeProxy_ZeroAddress");

      await expect(proxy.connect(admin1).sweepNonFeeBalance(nonAdmin.address, 0n))
        .to.be.revertedWithCustomError(proxy, "IntuitionFeeProxy_ZeroAmount");

      await expect(proxy.connect(admin1).sweepNonFeeBalance(nonAdmin.address, nonFeeAmount + 1n))
        .to.be.revertedWithCustomError(proxy, "IntuitionFeeProxy_InsufficientNonFeeBalance");

      const initialRecipientBalance = await ethers.provider.getBalance(nonAdmin.address);

      await expect(proxy.connect(admin1).sweepNonFeeBalance(nonAdmin.address, nonFeeAmount))
        .to.emit(proxy, "NonFeeBalanceSwept")
        .withArgs(admin1.address, nonAdmin.address, nonFeeAmount);

      expect(await ethers.provider.getBalance(nonAdmin.address)).to.equal(initialRecipientBalance + nonFeeAmount);
      expect(await proxy.accruedFees()).to.equal(accruedFee);
      expect(await proxy.getNonFeeBalance()).to.equal(0n);
    });
  });

  describe("Receiver Validation", function () {
    it("Should revert when createAtoms receiver is not msg.sender", async function () {
      const { proxy, user, nonAdmin } = await loadFixture(deployFixture);

      const data = [ethers.toUtf8Bytes("ipfs://atom1")];
      const assets = [0n];

      await expect(
        proxy.connect(user).createAtoms(nonAdmin.address, data, assets, 1n)
      ).to.be.revertedWithCustomError(proxy, "IntuitionFeeProxy_InvalidReceiver");
    });

    it("Should revert when createTriples receiver is not msg.sender", async function () {
      const { proxy, user, nonAdmin } = await loadFixture(deployFixture);

      const subjectIds = [ethers.zeroPadValue("0x01", 32)];
      const predicateIds = [ethers.zeroPadValue("0x02", 32)];
      const objectIds = [ethers.zeroPadValue("0x03", 32)];
      const assets = [0n];

      await expect(
        proxy.connect(user).createTriples(nonAdmin.address, subjectIds, predicateIds, objectIds, assets, 1n)
      ).to.be.revertedWithCustomError(proxy, "IntuitionFeeProxy_InvalidReceiver");
    });

    it("Should revert when deposit receiver is not msg.sender", async function () {
      const { proxy, user, nonAdmin } = await loadFixture(deployFixture);

      const termId = ethers.zeroPadValue("0x01", 32);

      await expect(
        proxy.connect(user).deposit(nonAdmin.address, termId, 1n, 0n)
      ).to.be.revertedWithCustomError(proxy, "IntuitionFeeProxy_InvalidReceiver");
    });

    it("Should revert when depositBatch receiver is not msg.sender", async function () {
      const { proxy, user, nonAdmin } = await loadFixture(deployFixture);

      const termIds = [ethers.zeroPadValue("0x01", 32)];
      const curveIds = [1n];
      const assets = [ethers.parseEther("1")];
      const minShares = [0n];

      await expect(
        proxy.connect(user).depositBatch(nonAdmin.address, termIds, curveIds, assets, minShares)
      ).to.be.revertedWithCustomError(proxy, "IntuitionFeeProxy_InvalidReceiver");
    });

    it("Should allow msg.sender as receiver for all user-facing flows", async function () {
      const { proxy, mockMultiVault, user } = await loadFixture(deployFixture);

      const atomData = [ethers.toUtf8Bytes("ipfs://atom1")];
      const atomAssets = [0n];
      const atomCost = await mockMultiVault.getAtomCost();
      await expect(
        proxy.connect(user).createAtoms(user.address, atomData, atomAssets, 1n, { value: atomCost })
      ).to.not.be.reverted;

      const subjectIds = [ethers.zeroPadValue("0x01", 32)];
      const predicateIds = [ethers.zeroPadValue("0x02", 32)];
      const objectIds = [ethers.zeroPadValue("0x03", 32)];
      const tripleAssets = [0n];
      const tripleCost = await mockMultiVault.getTripleCost();
      await expect(
        proxy.connect(user).createTriples(user.address, subjectIds, predicateIds, objectIds, tripleAssets, 1n, { value: tripleCost })
      ).to.not.be.reverted;

      const termId = ethers.zeroPadValue("0x04", 32);
      const depositAmount = ethers.parseEther("1");
      const depositCost = await proxy.getTotalDepositCost(depositAmount);
      await expect(
        proxy.connect(user).deposit(user.address, termId, 1n, 0n, { value: depositCost })
      ).to.not.be.reverted;

      const termIds = [ethers.zeroPadValue("0x05", 32), ethers.zeroPadValue("0x06", 32)];
      const curveIds = [1n, 1n];
      const batchAssets = [ethers.parseEther("0.5"), ethers.parseEther("0.75")];
      const minShares = [0n, 0n];
      const totalDeposit = batchAssets[0] + batchAssets[1];
      const batchFee = await proxy.calculateDepositFee(2n, totalDeposit);
      await expect(
        proxy.connect(user).depositBatch(user.address, termIds, curveIds, batchAssets, minShares, { value: totalDeposit + batchFee })
      ).to.not.be.reverted;
    });
  });

  describe("Proxy Functions - createAtoms", function () {
    it("Should collect fees on createAtoms (fees based on deposits)", async function () {
      const { proxy, mockMultiVault, user } = await loadFixture(deployFixture);

      const data = [ethers.toUtf8Bytes("ipfs://atom1"), ethers.toUtf8Bytes("ipfs://atom2")];
      const assets = [ethers.parseEther("0.01"), ethers.parseEther("0.01")];
      const curveId = 1n;

      const atomCost = await mockMultiVault.getAtomCost();
      const totalDeposit = ethers.parseEther("0.02");
      const depositCount = 2n; // Both have non-zero deposits
      const fee = await proxy.calculateDepositFee(depositCount, totalDeposit);
      const multiVaultCost = (atomCost * 2n) + totalDeposit;
      const totalRequired = fee + multiVaultCost;

      await expect(proxy.connect(user).createAtoms(user.address, data, assets, curveId, { value: totalRequired }))
        .to.emit(proxy, "FeesCollected")
        .withArgs(user.address, fee, "createAtoms");

      expect(await proxy.accruedFees()).to.equal(fee);
    });

    it("Should not charge fees for zero deposits in createAtoms", async function () {
      const { proxy, mockMultiVault, user } = await loadFixture(deployFixture);

      const data = [ethers.toUtf8Bytes("ipfs://atom1"), ethers.toUtf8Bytes("ipfs://atom2")];
      const assets = [0n, 0n]; // No deposits
      const curveId = 1n;

      const atomCost = await mockMultiVault.getAtomCost();
      const fee = 0n; // No deposits = no fee
      const multiVaultCost = atomCost * 2n;
      const totalRequired = fee + multiVaultCost;

      await proxy.connect(user).createAtoms(user.address, data, assets, curveId, { value: totalRequired });

      expect(await proxy.accruedFees()).to.equal(0n);
    });

    it("Should revert on insufficient value for createAtoms", async function () {
      const { proxy, user } = await loadFixture(deployFixture);

      const data = [ethers.toUtf8Bytes("ipfs://atom1")];
      const assets = [ethers.parseEther("0.01")];
      const curveId = 1n;

      await expect(
        proxy.connect(user).createAtoms(user.address, data, assets, curveId, { value: ethers.parseEther("0.01") })
      ).to.be.revertedWithCustomError(proxy, "IntuitionFeeProxy_InsufficientValue");
    });
  });

  describe("Proxy Functions - createTriples", function () {
    it("Should collect fees on createTriples (fees based on deposits)", async function () {
      const { proxy, mockMultiVault, user } = await loadFixture(deployFixture);

      const subjectIds = [ethers.zeroPadValue("0x01", 32)];
      const predicateIds = [ethers.zeroPadValue("0x02", 32)];
      const objectIds = [ethers.zeroPadValue("0x03", 32)];
      const assets = [ethers.parseEther("0.01")];
      const curveId = 1n;

      const tripleCost = await mockMultiVault.getTripleCost();
      const totalDeposit = ethers.parseEther("0.01");
      const depositCount = 1n;
      const fee = await proxy.calculateDepositFee(depositCount, totalDeposit);
      const multiVaultCost = tripleCost + totalDeposit;
      const totalRequired = fee + multiVaultCost;

      await expect(proxy.connect(user).createTriples(user.address, subjectIds, predicateIds, objectIds, assets, curveId, { value: totalRequired }))
        .to.emit(proxy, "FeesCollected")
        .withArgs(user.address, fee, "createTriples");

      expect(await proxy.accruedFees()).to.equal(fee);
    });

    it("Should revert on wrong array lengths", async function () {
      const { proxy, user } = await loadFixture(deployFixture);

      const subjectIds = [ethers.zeroPadValue("0x01", 32), ethers.zeroPadValue("0x04", 32)];
      const predicateIds = [ethers.zeroPadValue("0x02", 32)]; // Wrong length
      const objectIds = [ethers.zeroPadValue("0x03", 32), ethers.zeroPadValue("0x05", 32)];
      const assets = [ethers.parseEther("0.01"), ethers.parseEther("0.01")];
      const curveId = 1n;

      await expect(
        proxy.connect(user).createTriples(user.address, subjectIds, predicateIds, objectIds, assets, curveId, { value: ethers.parseEther("10") })
      ).to.be.revertedWithCustomError(proxy, "IntuitionFeeProxy_WrongArrayLengths");
    });
  });

  describe("Proxy Functions - deposit", function () {
    it("Should collect fees on deposit (inverse calculation)", async function () {
      const { proxy, user } = await loadFixture(deployFixture);

      const desiredDepositAmount = ethers.parseEther("10");
      const totalToSend = await proxy.getTotalDepositCost(desiredDepositAmount);

      const termId = ethers.zeroPadValue("0x01", 32);

      await expect(proxy.connect(user).deposit(user.address, termId, 1n, 0n, { value: totalToSend }))
        .to.emit(proxy, "FeesCollected");

      const expectedFee = await proxy.calculateDepositFee(1n, desiredDepositAmount);
      expect(await proxy.accruedFees()).to.be.closeTo(expectedFee, 1);
    });

    it("Should calculate multiVaultAmount correctly", async function () {
      const { proxy } = await loadFixture(deployFixture);

      const totalSent = ethers.parseEther("10.6"); // 10 + 0.1 fixed + 0.5 (5% of 10)
      const multiVaultAmount = await proxy.getMultiVaultAmountFromValue(totalSent);

      expect(multiVaultAmount).to.be.closeTo(ethers.parseEther("10"), ethers.parseEther("0.001"));
    });

    it("Should revert when sending only fixed fee or less", async function () {
      const { proxy, user } = await loadFixture(deployFixture);

      const termId = ethers.zeroPadValue("0x01", 32);

      await expect(
        proxy.connect(user).deposit(user.address, termId, 1n, 0n, { value: DEPOSIT_FEE })
      ).to.be.revertedWithCustomError(proxy, "IntuitionFeeProxy_InsufficientValue");

      await expect(
        proxy.connect(user).deposit(user.address, termId, 1n, 0n, { value: ethers.parseEther("0.05") })
      ).to.be.revertedWithCustomError(proxy, "IntuitionFeeProxy_InsufficientValue");
    });

    it("Should return 0 from getMultiVaultAmountFromValue for insufficient value", async function () {
      const { proxy } = await loadFixture(deployFixture);

      expect(await proxy.getMultiVaultAmountFromValue(DEPOSIT_FEE)).to.equal(0n);
      expect(await proxy.getMultiVaultAmountFromValue(ethers.parseEther("0.05"))).to.equal(0n);
    });
  });

  describe("Proxy Functions - depositBatch", function () {
    it("Should collect fees on depositBatch", async function () {
      const { proxy, user } = await loadFixture(deployFixture);

      const termIds = [ethers.zeroPadValue("0x01", 32), ethers.zeroPadValue("0x02", 32)];
      const curveIds = [1n, 1n];
      const assets = [ethers.parseEther("5"), ethers.parseEther("5")];
      const minShares = [0n, 0n];

      const totalDeposit = ethers.parseEther("10");
      const fee = await proxy.calculateDepositFee(2n, totalDeposit);
      const totalRequired = totalDeposit + fee;

      await expect(proxy.connect(user).depositBatch(user.address, termIds, curveIds, assets, minShares, { value: totalRequired }))
        .to.emit(proxy, "FeesCollected")
        .withArgs(user.address, fee, "depositBatch");

      expect(await proxy.accruedFees()).to.equal(fee);
    });

    it("Should revert on wrong array lengths in depositBatch", async function () {
      const { proxy, user } = await loadFixture(deployFixture);

      const termIds = [ethers.zeroPadValue("0x01", 32), ethers.zeroPadValue("0x02", 32)];
      const curveIds = [1n]; // Wrong length
      const assets = [ethers.parseEther("5"), ethers.parseEther("5")];
      const minShares = [0n, 0n];

      await expect(
        proxy.connect(user).depositBatch(user.address, termIds, curveIds, assets, minShares, { value: ethers.parseEther("20") })
      ).to.be.revertedWithCustomError(proxy, "IntuitionFeeProxy_WrongArrayLengths");
    });
  });

  describe("View Functions (Passthrough)", function () {
    it("Should return atom cost from MultiVault", async function () {
      const { proxy, mockMultiVault } = await loadFixture(deployFixture);
      expect(await proxy.getAtomCost()).to.equal(await mockMultiVault.getAtomCost());
    });

    it("Should return triple cost from MultiVault", async function () {
      const { proxy, mockMultiVault } = await loadFixture(deployFixture);
      expect(await proxy.getTripleCost()).to.equal(await mockMultiVault.getTripleCost());
    });

    it("Should return isTermCreated from MultiVault", async function () {
      const { proxy, mockMultiVault } = await loadFixture(deployFixture);
      const termId = ethers.zeroPadValue("0x01", 32);
      await mockMultiVault.setTermCreated(termId, true);
      expect(await proxy.isTermCreated(termId)).to.be.true;
    });

    it("Should return shares from MultiVault", async function () {
      const { proxy, mockMultiVault, user } = await loadFixture(deployFixture);
      const termId = ethers.zeroPadValue("0x01", 32);
      await mockMultiVault.setShares(user.address, termId, 1n, 1000n);
      expect(await proxy.getShares(user.address, termId, 1n)).to.equal(1000n);
    });
  });
});
