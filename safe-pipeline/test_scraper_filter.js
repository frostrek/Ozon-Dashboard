import { runScraper } from './m1-m3-scraper.js';

async function testFilter() {
    console.log("Starting Filter Test...");
    
    // Test Case: L'Oreal Paris Face Cream
    const brand = "L'Oreal Paris";
    const keyword = "Face Cream";
    
    // We run for 2 pages to check the logic
    const results = await runScraper(`${brand} ${keyword}`, brand, 3.5, 2, 500, 2, 1);
    
    console.log(`\nTest Finished. Total items: ${results.length}`);
    
    let mixedBrand = false;
    let mixedType = false;
    
    for (const p of results) {
        if (!p.brand.toLowerCase().includes(brand.toLowerCase())) {
            console.error(`❌ Brand Mismatch: Found ${p.brand}`);
            mixedBrand = true;
        }
        
        const title = p.name.toLowerCase();
        if (title.includes("wash") || title.includes("serum") || title.includes("sunscreen")) {
            console.error(`❌ Type Mismatch: Found ${p.name}`);
            mixedType = true;
        }
    }
    
    if (!mixedBrand && !mixedType && results.length > 0) {
        console.log("✅ Filter Test PASSED: All items match Brand and Product Type.");
    } else if (results.length === 0) {
        console.log("⚠️ Filter Test: No items found. Check search results or try a broader brand.");
    } else {
        console.log("❌ Filter Test FAILED.");
    }
}

testFilter().catch(console.error);
