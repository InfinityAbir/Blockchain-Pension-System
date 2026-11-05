// Automated regression + gas measurement suite for the blockchain pension system.
// Deliberately dependency-free: revert assertions are done by hand so the suite
// does not pin a chai-matchers version against ethers v5.

const { expect } = require("chai");
const { ethers, network } = require("hardhat");

const BDT_PER_ETH = 300000;
const MONTH = 30 * 24 * 60 * 60;

// Programs
const GPS = 0;
const PRSS = 1;

// PRSS schemes
const DPS = 0;

// Document groups
const GRP_GPS = 0;
const GRP_PRSS = 1;

const REQUIRED_DOCS = 9;

// Gas ledger shared across the whole run; printed as a table at the end.
const gasLedger = {};

function bdtToWei(bdt) {
  return ethers.utils.parseEther(String(bdt)).div(BDT_PER_ETH);
}

function record(label, receipt) {
  if (!gasLedger[label]) gasLedger[label] = [];
  gasLedger[label].push(receipt.gasUsed.toNumber());
}

async function expectRevert(promise, expectedFragment) {
  try {
    const tx = await promise;
    await tx.wait();
  } catch (err) {
    const msg = err.message || String(err);
    if (expectedFragment && !msg.includes(expectedFragment)) {
      throw new Error(
        `Reverted, but with the wrong reason.\n  expected to contain: "${expectedFragment}"\n  actual: ${msg}`
      );
    }
    return;
  }
  throw new Error(
    `Expected revert${expectedFragment ? ` ("${expectedFragment}")` : ""}, but the call succeeded.`
  );
}

async function advance(seconds) {
  await network.provider.send("evm_increaseTime", [seconds]);
  await network.provider.send("evm_mine");
}

async function deployAll() {
  const [admin, alice, bob, nominee, outsider, gpsUser, gpsNominee] = await ethers.getSigners();

  // Registry <-> Documents is a circular constructor dependency, so the
  // registry is deployed with a zero address and wired afterwards.
  const Registry = await ethers.getContractFactory("PensionRegistry");
  const registry = await Registry.deploy(ethers.constants.AddressZero);
  await registry.deployed();

  const Documents = await ethers.getContractFactory("PensionDocuments");
  const documents = await Documents.deploy(registry.address);
  await documents.deployed();
  await (await registry.setDocuments(documents.address)).wait();

  const Fund = await ethers.getContractFactory("PensionFund");
  const fund = await Fund.deploy(registry.address);
  await fund.deployed();

  const Disbursement = await ethers.getContractFactory("PensionDisbursement");
  const disbursement = await Disbursement.deploy(registry.address, fund.address);
  await disbursement.deployed();

  await (await fund.setPensionDisbursement(disbursement.address)).wait();
  await (await registry.setDisbursementContract(disbursement.address)).wait();

  return {
    admin, alice, bob, nominee, outsider, gpsUser, gpsNominee,
    registry, documents, fund, disbursement,
  };
}

// Full GPS onboarding: register, administrative salary/service verification,
// documents, approval, and treasury allocation.
async function onboardApprovedGPS(ctx, user, nomineeSigner, opts = {}) {
  const dob = opts.dob || 19500101;
  const salaryBDT = opts.salaryBDT || 50000;
  const serviceYears = opts.serviceYears || 25;

  const tx = await ctx.registry.connect(user).registerPensioner(
    GPS,
    DPS,
    0,
    salaryBDT,
    serviceYears,
    "EMP-1001",
    "Senior Officer",
    dob,
    nomineeSigner.address,
    "GPS Nominee",
    "Wife"
  );
  await tx.wait();

  await (
    await ctx.registry
      .connect(ctx.admin)
      .verifyGPSData(user.address, salaryBDT, serviceYears, "EMP-1001")
  ).wait();

  await submitAndApproveDocs(ctx, user, GRP_GPS);
  await (await ctx.registry.connect(ctx.admin).approvePensioner(user.address)).wait();

  // Treasury funds the pensioner's entitlement.
  await (
    await ctx.fund
      .connect(ctx.admin)
      .allocateGPSFund(user.address, { value: ethers.utils.parseEther("5") })
  ).wait();
}

async function registerPRSS(ctx, user, opts = {}) {
  const tier = opts.tier || bdtToWei(500);
  const dob = opts.dob || 19500101; // comfortably past retirement age
  const relation = opts.relation || "Wife";

  const tx = await ctx.registry.connect(user).registerPensioner(
    PRSS,
    DPS,
    tier,
    0,
    0,
    "",
    "",
    dob,
    ctx.nominee.address,
    "Nominee Name",
    relation
  );
  const receipt = await tx.wait();
  record("registerPensioner()", receipt);
  return receipt;
}

async function submitAndApproveDocs(ctx, user, group) {
  const types = [...Array(REQUIRED_DOCS).keys()];
  const hashes = types.map((i) => `QmTestDocumentHash${i}`);

  await (await ctx.documents.connect(user).submitPensionerDocumentsBatch(types, hashes)).wait();

  for (const t of types) {
    await (await ctx.documents.connect(ctx.admin).approveDocument(user.address, group, t)).wait();
  }
}

async function onboardApprovedPRSS(ctx, user, opts = {}) {
  await registerPRSS(ctx, user, opts);
  await submitAndApproveDocs(ctx, user, GRP_PRSS);
  await (await ctx.registry.connect(ctx.admin).approvePensioner(user.address)).wait();
}

async function contributeN(ctx, user, n, tier) {
  const amount = tier || bdtToWei(500);
  for (let i = 0; i < n; i++) {
    const tx = await ctx.fund.connect(user).contributeMonthly({ value: amount });
    const receipt = await tx.wait();
    if (i === 0) record("contributeMonthly()", receipt);
    if (i < n - 1) await advance(MONTH + 60);
  }
}

describe("Blockchain Pension System", function () {
  this.timeout(180000);

  describe("Deployment and wiring", function () {
    it("deploys all four contracts and wires dependencies", async function () {
      const ctx = await deployAll();
      expect(await ctx.registry.isAdmin(ctx.admin.address)).to.equal(true);
      expect(await ctx.fund.pensionDisbursement()).to.equal(ctx.disbursement.address);
      expect((await ctx.registry.gpsRetirementAge()).toNumber()).to.equal(60);
    });

    it("refuses to rebind the disbursement contract once set", async function () {
      const ctx = await deployAll();
      await expectRevert(
        ctx.fund.setPensionDisbursement(ctx.outsider.address),
        "Disbursement already set"
      );
    });
  });

  describe("Registration", function () {
    it("registers a PRSS pensioner", async function () {
      const ctx = await deployAll();
      await registerPRSS(ctx, ctx.alice);
      expect(await ctx.registry.isRegistered(ctx.alice.address)).to.equal(true);
    });

    it("rejects duplicate registration", async function () {
      const ctx = await deployAll();
      await registerPRSS(ctx, ctx.alice);
      await expectRevert(
        ctx.registry.connect(ctx.alice).registerPensioner(
          PRSS, DPS, bdtToWei(500), 0, 0, "", "", 19500101,
          ctx.nominee.address, "Nominee Name", "Wife"
        ),
        "Already registered or pending"
      );
    });

    it("rejects a contribution tier outside the scheme's allowed set", async function () {
      const ctx = await deployAll();
      await expectRevert(
        ctx.registry.connect(ctx.alice).registerPensioner(
          PRSS, DPS, bdtToWei(750), 0, 0, "", "", 19500101,
          ctx.nominee.address, "Nominee Name", "Wife"
        )
      );
    });

    it("rejects a malformed date of birth", async function () {
      const ctx = await deployAll();
      await expectRevert(
        ctx.registry.connect(ctx.alice).registerPensioner(
          PRSS, DPS, bdtToWei(500), 0, 0, "", "", 18000101,
          ctx.nominee.address, "Nominee Name", "Wife"
        )
      );
    });

    it("blocks approval while documents are outstanding", async function () {
      const ctx = await deployAll();
      await registerPRSS(ctx, ctx.alice);
      await expectRevert(
        ctx.registry.connect(ctx.admin).approvePensioner(ctx.alice.address),
        "documents not approved"
      );
    });

    it("blocks approval by a non-administrator", async function () {
      const ctx = await deployAll();
      await registerPRSS(ctx, ctx.alice);
      await submitAndApproveDocs(ctx, ctx.alice, GRP_PRSS);
      await expectRevert(
        ctx.registry.connect(ctx.outsider).approvePensioner(ctx.alice.address),
        "Only admin allowed"
      );
    });
  });

  describe("Contributions", function () {
    it("accepts a contribution matching the registered tier", async function () {
      const ctx = await deployAll();
      await onboardApprovedPRSS(ctx, ctx.alice);
      await contributeN(ctx, ctx.alice, 1);
      expect((await ctx.fund.monthlyPaymentsCount(ctx.alice.address)).toNumber()).to.equal(1);
    });

    it("rejects a contribution that does not match the tier", async function () {
      const ctx = await deployAll();
      await onboardApprovedPRSS(ctx, ctx.alice);
      await expectRevert(
        ctx.fund.connect(ctx.alice).contributeMonthly({ value: bdtToWei(1000) }),
        "Contribution must match scheme monthly amount"
      );
    });

    it("rejects a second contribution inside the lock period", async function () {
      const ctx = await deployAll();
      await onboardApprovedPRSS(ctx, ctx.alice);
      await contributeN(ctx, ctx.alice, 1);
      await expectRevert(
        ctx.fund.connect(ctx.alice).contributeMonthly({ value: bdtToWei(500) }),
        "Already paid this month"
      );
    });

    it("rejects a contribution from an unapproved account", async function () {
      const ctx = await deployAll();
      await registerPRSS(ctx, ctx.alice); // registered but never approved
      await expectRevert(
        ctx.fund.connect(ctx.alice).contributeMonthly({ value: bdtToWei(500) }),
        "Pensioner not approved"
      );
    });

    it("rejects a contribution from an unregistered wallet", async function () {
      const ctx = await deployAll();
      await expectRevert(
        ctx.fund.connect(ctx.outsider).contributeMonthly({ value: bdtToWei(500) }),
        "Pensioner not approved"
      );
    });
  });

  describe("Pension activation", function () {
    it("rejects activation before the scheme minimum months are met", async function () {
      const ctx = await deployAll();
      await onboardApprovedPRSS(ctx, ctx.alice);
      await contributeN(ctx, ctx.alice, 3); // DPS requires 12
      await expectRevert(
        ctx.disbursement.connect(ctx.alice).startPension(),
        "Minimum monthly payments not completed"
      );
    });

    it("rejects activation below retirement age", async function () {
      const ctx = await deployAll();
      await onboardApprovedPRSS(ctx, ctx.bob, { dob: 19900101 });
      await contributeN(ctx, ctx.bob, 12);
      await expectRevert(
        ctx.disbursement.connect(ctx.bob).startPension(),
        "Not retirement age"
      );
    });

    it("activates once minimum months and retirement age are satisfied", async function () {
      const ctx = await deployAll();
      await onboardApprovedPRSS(ctx, ctx.alice);
      await contributeN(ctx, ctx.alice, 12);

      const tx = await ctx.disbursement.connect(ctx.alice).startPension();
      const receipt = await tx.wait();
      record("startPension()", receipt);

      const state = await ctx.disbursement.getPensionState(ctx.alice.address);
      expect(state.started).to.equal(true);
      expect(state.monthlyAmount.gt(0)).to.equal(true);
    });

    it("rejects a second activation", async function () {
      const ctx = await deployAll();
      await onboardApprovedPRSS(ctx, ctx.alice);
      await contributeN(ctx, ctx.alice, 12);
      await (await ctx.disbursement.connect(ctx.alice).startPension()).wait();
      await expectRevert(
        ctx.disbursement.connect(ctx.alice).startPension(),
        "Pension already started"
      );
    });
  });

  describe("Disbursement", function () {
    async function activatedPRSS() {
      const ctx = await deployAll();
      await onboardApprovedPRSS(ctx, ctx.alice);
      await contributeN(ctx, ctx.alice, 12);
      await (await ctx.disbursement.connect(ctx.alice).startPension()).wait();
      return ctx;
    }

    it("rejects a monthly withdrawal before a payout mode is chosen", async function () {
      const ctx = await activatedPRSS();
      await expectRevert(
        ctx.disbursement.connect(ctx.alice).withdrawMonthlyPension(),
        "Monthly mode not chosen"
      );
    });

    it("pays a monthly pension after the mode is chosen", async function () {
      const ctx = await activatedPRSS();
      await (await ctx.disbursement.connect(ctx.alice).chooseMonthlyPension()).wait();

      const before = await ethers.provider.getBalance(ctx.alice.address);
      const tx = await ctx.disbursement.connect(ctx.alice).withdrawMonthlyPension();
      const receipt = await tx.wait();
      record("withdrawMonthly()", receipt);

      const spent = receipt.gasUsed.mul(receipt.effectiveGasPrice);
      const after = await ethers.provider.getBalance(ctx.alice.address);
      expect(after.add(spent).gt(before)).to.equal(true);
    });

    it("rejects a second monthly withdrawal inside the lock period", async function () {
      const ctx = await activatedPRSS();
      await (await ctx.disbursement.connect(ctx.alice).chooseMonthlyPension()).wait();
      await (await ctx.disbursement.connect(ctx.alice).withdrawMonthlyPension()).wait();
      await expectRevert(
        ctx.disbursement.connect(ctx.alice).withdrawMonthlyPension(),
        "Too early"
      );
    });

    it("rejects a lump sum once monthly mode is chosen", async function () {
      const ctx = await activatedPRSS();
      await (await ctx.disbursement.connect(ctx.alice).chooseMonthlyPension()).wait();
      await expectRevert(
        ctx.disbursement.connect(ctx.alice).withdrawFullPension(),
        "Mode already chosen"
      );
    });

    it("rejects a fund release from any caller other than the disbursement contract", async function () {
      const ctx = await activatedPRSS();
      await expectRevert(
        ctx.fund.connect(ctx.outsider).releaseToPRSSPensioner(ctx.alice.address, 1),
        "Only disbursement contract allowed"
      );
      await expectRevert(
        ctx.fund.connect(ctx.admin).releaseToPRSSPensioner(ctx.alice.address, 1),
        "Only disbursement contract allowed"
      );
    });
  });

  describe("Nominee and survivor claims", function () {
    it("rejects a nominee claim while the pensioner is alive", async function () {
      const ctx = await deployAll();
      await onboardApprovedPRSS(ctx, ctx.alice);
      await contributeN(ctx, ctx.alice, 12);
      await (await ctx.disbursement.connect(ctx.alice).startPension()).wait();
      await expectRevert(
        ctx.disbursement.connect(ctx.nominee).nomineeWithdrawFullPension(ctx.alice.address),
        "Pensioner not deceased"
      );
    });

    it("rejects a survivor claim from a wallet that is not the registered nominee", async function () {
      const ctx = await deployAll();
      await onboardApprovedPRSS(ctx, ctx.alice);
      await contributeN(ctx, ctx.alice, 12);
      await (await ctx.disbursement.connect(ctx.alice).startPension()).wait();
      await expectRevert(
        ctx.disbursement.connect(ctx.outsider).nomineeWithdrawFullPension(ctx.alice.address)
      );
    });
  });

  describe("GPS lifecycle", function () {
    it("activates a GPS pension and pays a monthly benefit", async function () {
      const ctx = await deployAll();
      await onboardApprovedGPS(ctx, ctx.gpsUser, ctx.gpsNominee);

      const startTx = await ctx.disbursement.connect(ctx.gpsUser).startPension();
      record("startPension() [GPS]", await startTx.wait());

      await (await ctx.disbursement.connect(ctx.gpsUser).chooseMonthlyPension()).wait();
      const wTx = await ctx.disbursement.connect(ctx.gpsUser).withdrawMonthlyPension();
      record("withdrawMonthly() [GPS]", await wTx.wait());

      const state = await ctx.disbursement.getPensionState(ctx.gpsUser.address);
      expect(state.started).to.equal(true);
    });

    it("pays the one-time gratuity and rejects a repeat claim", async function () {
      const ctx = await deployAll();
      await onboardApprovedGPS(ctx, ctx.gpsUser, ctx.gpsNominee);

      const gTx = await ctx.disbursement.connect(ctx.gpsUser).claimGPSGratuity();
      record("claimGratuity()", await gTx.wait());

      await expectRevert(
        ctx.disbursement.connect(ctx.gpsUser).claimGPSGratuity(),
        "Gratuity already claimed"
      );
    });

    it("rejects a gratuity claim from a non-GPS pensioner", async function () {
      const ctx = await deployAll();
      await onboardApprovedPRSS(ctx, ctx.alice);
      await expectRevert(
        ctx.disbursement.connect(ctx.alice).claimGPSGratuity(),
        "Not GPS pensioner"
      );
    });
  });

  // Regression tests for the high-severity finding reported by static analysis:
  // the administrator could previously transfer any contract balance, including
  // funds committed to pensioners, to an arbitrary address.
  describe("Fund isolation (arbitrary-send-eth remediation)", function () {
    it("forbids the administrator from withdrawing committed PRSS savings", async function () {
      const ctx = await deployAll();
      await onboardApprovedPRSS(ctx, ctx.alice);
      await contributeN(ctx, ctx.alice, 1);

      const committed = await ctx.fund.totalPRSSPool();
      expect(committed.gt(0)).to.equal(true);
      expect((await ctx.fund.unallocatedBalance()).isZero()).to.equal(true);

      await expectRevert(
        ctx.fund.connect(ctx.admin).withdrawGPSUnallocated(ctx.outsider.address, committed),
        "Exceeds unallocated balance"
      );
    });

    it("forbids the administrator from withdrawing allocated GPS entitlements", async function () {
      const ctx = await deployAll();
      await onboardApprovedGPS(ctx, ctx.gpsUser, ctx.gpsNominee);

      const allocated = await ctx.fund.totalAllocatedGPS();
      expect(allocated.gt(0)).to.equal(true);

      await expectRevert(
        ctx.fund.connect(ctx.admin).withdrawGPSUnallocated(ctx.outsider.address, allocated),
        "Exceeds unallocated balance"
      );
    });

    it("permits withdrawal of a genuine surplus only", async function () {
      const ctx = await deployAll();
      await onboardApprovedPRSS(ctx, ctx.alice);
      await contributeN(ctx, ctx.alice, 1);

      // Send an uncommitted donation directly to the contract.
      const surplus = ethers.utils.parseEther("1");
      await (await ctx.admin.sendTransaction({ to: ctx.fund.address, value: surplus })).wait();
      expect((await ctx.fund.unallocatedBalance()).eq(surplus)).to.equal(true);

      await (
        await ctx.fund.connect(ctx.admin).withdrawGPSUnallocated(ctx.outsider.address, surplus)
      ).wait();

      expect((await ctx.fund.unallocatedBalance()).isZero()).to.equal(true);
      // Committed savings are untouched.
      expect((await ctx.fund.totalContributions(ctx.alice.address)).eq(bdtToWei(500))).to.equal(true);
    });

    it("rejects a surplus withdrawal by a non-administrator", async function () {
      const ctx = await deployAll();
      await expectRevert(
        ctx.fund.connect(ctx.outsider).withdrawGPSUnallocated(ctx.outsider.address, 1),
        "Only admin allowed"
      );
    });
  });

  describe("Administrative boundaries", function () {
    it("rejects policy changes from a non-administrator", async function () {
      const ctx = await deployAll();
      await expectRevert(
        ctx.registry.connect(ctx.outsider).setGPSRetirementAge(45),
        "Only admin allowed"
      );
      await expectRevert(
        ctx.registry.connect(ctx.outsider).setPRSSMinMonths(DPS, 1),
        "Only admin allowed"
      );
    });

    it("rejects document approval from a non-administrator", async function () {
      const ctx = await deployAll();
      await registerPRSS(ctx, ctx.alice);
      await (
        await ctx.documents
          .connect(ctx.alice)
          .submitPensionerDocumentsBatch([...Array(REQUIRED_DOCS).keys()],
            [...Array(REQUIRED_DOCS).keys()].map((i) => `QmHash${i}`))
      ).wait();
      await expectRevert(
        ctx.documents.connect(ctx.outsider).approveDocument(ctx.alice.address, GRP_PRSS, 0),
        "Only admin allowed"
      );
    });
  });

  after(function () {
    const labels = Object.keys(gasLedger);
    if (labels.length === 0) return;

    console.log("\n  Measured gas (Solidity 0.8.28, optimiser 200 runs, viaIR)");
    console.log("  " + "-".repeat(58));
    console.log(
      "  " + "Function".padEnd(24) + "Gas".padStart(10) + "ETH@20gwei".padStart(13) + "USD@2500".padStart(11)
    );
    console.log("  " + "-".repeat(58));
    for (const label of labels) {
      const samples = gasLedger[label];
      const avg = Math.round(samples.reduce((a, b) => a + b, 0) / samples.length);
      const eth = (avg * 20) / 1e9;
      console.log(
        "  " + label.padEnd(24) +
        String(avg).padStart(10) +
        eth.toFixed(6).padStart(13) +
        ("$" + (eth * 2500).toFixed(2)).padStart(11)
      );
    }
    console.log("  " + "-".repeat(58));
    console.log("  Samples per function: " +
      labels.map((l) => `${l}=${gasLedger[l].length}`).join(", ") + "\n");
  });
});
