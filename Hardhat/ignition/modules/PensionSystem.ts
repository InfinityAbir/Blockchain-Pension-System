import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const PensionSystemModule = buildModule("PensionSystemModule", (m) => {
  // 1️⃣ Deploy Registry FIRST
  const pensionRegistry = m.contract("PensionRegistry");

  // 2️⃣ Deploy Documents with registry address
  const pensionDocuments = m.contract(
    "PensionDocuments",
    [pensionRegistry] // constructor argument
  );

  // (Optional – if you have these contracts)
  // const pensionFund = m.contract("PensionFund");
  // const pensionDisbursement = m.contract("PensionDisbursement");

  return {
    pensionRegistry,
    pensionDocuments,
    // pensionFund,
    // pensionDisbursement,
  };
});

export default PensionSystemModule;
