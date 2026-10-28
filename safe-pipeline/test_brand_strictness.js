// test_brand_strictness.js
// Verification for Strict Brand Mapping

const mockCachedBrands = [
  { id: 1, value: "Fabindia" },
  { id: 2, value: "Ghar Soaps" },
  { id: 3, value: "L'Oreal Paris" },
  { id: 4, value: "FA" }, // Imagine Ozon actually has a brand called "FA"
  { id: 5, value: "HAR" }  // Imagine Ozon actually has a brand called "HAR"
];

function cleanBrand(text) {
  return text
    .replace(/[^\p{L}\p{N}\s&'-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function resolveBrandStrict(brandName) {
  const amazonBrand = String(brandName || "No Brand").trim();
  const searchTarget = cleanBrand(amazonBrand).toLowerCase();
  
  // The new strict logic
  const match = mockCachedBrands.find(o => o.value.toLowerCase().trim() === searchTarget);
  
  if (match) {
    return { id: match.id, value: match.value, status: "MATCHED" };
  }
  return { id: 126745801, value: "Нет бренда", status: "FALLBACK" };
}

const testCases = [
  { input: "Fabindia", expected: "MATCHED" },
  { input: "Fabindia Official Store", expected: "FALLBACK" }, // Prefix stripping removed, must be exact
  { input: "FA", expected: "MATCHED" }, // Matches because Ozon HAS "FA"
  { input: "Fab", expected: "FALLBACK" }, // Partial match should fail
  { input: "Ghar Soaps", expected: "MATCHED" },
  { input: "HAR", expected: "MATCHED" }, // Matches because Ozon HAS "HAR"
  { input: "Ghar", expected: "FALLBACK" }, // Partial match should fail
  { input: "L'Oreal Paris!", expected: "MATCHED" }, // Symbol cleaning allows this
];

console.log("=== BRAND STRICTNESS TEST ===\n");
testCases.forEach(tc => {
  const result = resolveBrandStrict(tc.input);
  const pass = result.status === tc.expected;
  console.log(`[${pass ? 'PASS' : 'FAIL'}] Input: "${tc.input}" -> Result: "${result.value}" (${result.status})`);
});
