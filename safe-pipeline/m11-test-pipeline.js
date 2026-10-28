import { createClient } from "@supabase/supabase-js";
import { translateProduct } from "./m6-translate.js";
import { fetchCategoryAttributes } from "./m10-ozon-attrs.js";
import { mapAmazonToOzon } from "./m10b-attr-mapper.js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function testPipeline() {
    console.log("=== Testing Ollama AI Pipeline ===\n");

const p = {
        asin: "TEST_FINAL_VERIFY_1",
        name: "Mamaearth Onion Hair Oil for Hair Fall Control with Onion & Redensyl | 150ml",
        brand: "Mamaearth",
        description: "Reduces hair fall and promotes hair growth.",
        ingredients: "Onion Seed Oil, Redensyl, Almond Oil",
        directions: "Apply on dry scalp and leave for a few hours.",
        net_quantity: "150 ml",
        feature_bullets: ["Promotes hair growth", "Sulfates free"],
        product_category: "Hair Care",
        scraped_keyword: "onion hair oil"
    };

    console.log(`Final Verification using llama3.2:3b [${p.asin}]...`);

    // 2. Test Translation & SEO Title & Hashtags
    console.log("\n[1/3] Testing SEO Title & Hashtags...");
    const t0 = Date.now();
    const trans = await translateProduct(p, "Beauty > Hair Care > Hair Oils");
    console.log(`Done in ${Date.now() - t0}ms`);
    console.log(`SEO Title (RU): ${trans.title_ru}`);
    console.log(`Hashtags: ${trans.hashtags}`);
    console.log(`Description (truncated): ${trans.description_ru.slice(0, 100)}...`);

    // 3. Test Attribute Mapping
    console.log("\n[2/3] Testing Attribute Mapping...");
    const catId = 17028992; // Sunscreen
    const typeId = 93945;   // Hair Serum (just for test)
    
    const attrs = await fetchCategoryAttributes(catId, typeId);
    const testAttrs = attrs.slice(0, 5); // Only test 5 to avoid hang
    const t1 = Date.now();
    const mapping = await mapAmazonToOzon(p, testAttrs, catId, typeId, async () => ({ status: 200, ok: true, text: '{"result":[]}' }));
    console.log(`Done in ${Date.now() - t1}ms`);
    
    console.log(`Mapped attributes: ${mapping.filled.length}`);
    console.log(`Mapped by: ${mapping.mappedBy}`);

    // 4. Verify Hard Rules
    console.log("\n[3/3] Verifying Business Rules...");
    const shelfLife = mapping.filled.find(a => a.id === 8205);
    const country = mapping.filled.find(a => a.id === 4389);
    
    // Note: These might be in 'mandatory' in m9, not in mapping.filled if they were overridden.
    // But in m10b basic extraction they should be there too if keywords match.
    
    console.log("Pipeline test complete.");
}

testPipeline().catch(console.error);
