const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("========================================");
  console.log("🚀 Deploying contracts with:", deployer.address);

  const bal = await ethers.provider.getBalance(deployer.address);
  console.log("💰 Account balance:", ethers.utils.formatEther(bal), "ETH");
  console.log("========================================\n");

  /* -------------------------------------------------
     1) Deploy PensionRegistry FIRST (temporary docs = AddressZero)
  ------------------------------------------------- */
  const Registry = await ethers.getContractFactory("PensionRegistry");
  const registry = await Registry.deploy(ethers.constants.AddressZero);
  await registry.deployed();

  console.log("✅ PensionRegistry deployed to:", registry.address);

  /* -------------------------------------------------
     2) Deploy PensionDocuments (linked to registry)
  ------------------------------------------------- */
  const Documents = await ethers.getContractFactory("PensionDocuments");
  const documents = await Documents.deploy(registry.address);
  await documents.deployed();

  console.log("✅ PensionDocuments deployed to:", documents.address);

  /* -------------------------------------------------
     3) Link Registry → Documents (CRITICAL)
  ------------------------------------------------- */
  console.log("\n🔗 Linking Registry → Documents...");
  const tx1 = await registry.setDocuments(documents.address);
  await tx1.wait();
  console.log("✅ Registry linked to Documents");

  /* -------------------------------------------------
     4) Deploy PensionFund (needs Registry)
  ------------------------------------------------- */
  const Fund = await ethers.getContractFactory("PensionFund");
  const fund = await Fund.deploy(registry.address);
  await fund.deployed();

  console.log("\n✅ PensionFund deployed to:", fund.address);

  /* -------------------------------------------------
     5) Deploy PensionDisbursement (Registry + Fund)
  ------------------------------------------------- */
  const Disbursement = await ethers.getContractFactory("PensionDisbursement");
  const disbursement = await Disbursement.deploy(
    registry.address,
    fund.address,
  );
  await disbursement.deployed();

  console.log("✅ PensionDisbursement deployed to:", disbursement.address);

  /* -------------------------------------------------
     6) Link Fund → Disbursement
  ------------------------------------------------- */
  console.log("\n🔗 Linking Fund → Disbursement...");
  const tx2 = await fund.setPensionDisbursement(disbursement.address);
  await tx2.wait();
  console.log("✅ Fund linked to Disbursement");

  /* -------------------------------------------------
     FINAL SUMMARY
  ------------------------------------------------- */
  console.log("\n========================================");
  console.log("🎉 ALL CONTRACTS DEPLOYED & LINKED SUCCESSFULLY");
  console.log("========================================");
  console.log("REGISTRY_ADDRESS      =", registry.address);
  console.log("DOCUMENTS_ADDRESS     =", documents.address);
  console.log("FUND_ADDRESS          =", fund.address);
  console.log("DISBURSEMENT_ADDRESS  =", disbursement.address);
  console.log("========================================\n");

  console.log("📌 Copy these into your frontend config.js");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ Deployment failed");
    console.error(error);
    process.exit(1);
  });
