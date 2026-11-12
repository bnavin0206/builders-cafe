/** Who the invoices are issued by. Printed on every invoice. */
export const SELLER = {
  name: "Denouer MMC Private Limited",
  gstin: "29AAGCD8430N1Z4",
  address: ["2nd floor, 35/5 Langford Road,", "Shanti Nagar, Bengaluru 560025", "Karnataka"],
  stateCode: "29",
  stateName: "Karnataka",
  /** SAC code printed on each line. */
  sac: "996337",
  /** GST on food and drinks, in percent. Prices on the menu include it. */
  gstPercent: 5,
  /** Invoice numbers look like MMC/TBC/00001. */
  numberPrefix: "MMC/TBC/",
  /** Used while Razorpay is on test keys, so test sales never take a real number. */
  testNumberPrefix: "TEST/MMC/",
  numberDigits: 5,
};
