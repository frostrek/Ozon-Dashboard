const { ozonPost } = await import('./m9-ozon-push.js');

async function testBrandApi() {
    console.log("=== Testing Ozon Brand Search API ===\n");
    
    // Attempt 1: Global Brand List Search
    try {
        const res = await ozonPost("/v1/brand/list", {
            filter: { name: "The Derma Co" },
            limit: 10
        });
        console.log(`Global Search Status: ${res.status}`);
        if (res.ok) {
            console.log("Global Search JSON:", JSON.stringify(res.json, null, 2));
        } else {
            console.log("Global Search Text:", res.text.slice(0, 300));
        }
    } catch (err) {
        console.error("Global Search Error:", err.message);
    }

    console.log("\n-------------------\n");

    // Attempt 2: Category-Specific Attribute Search (First 10 values)
    try {
        const catId = 17028991;
        const typeId = 93897;
        const attrId = 85;

        const res = await ozonPost("/v1/description-category/attribute/values", {
            description_category_id: catId,
            type_id: typeId,
            attribute_id: attrId,
            last_value_id: 0,
            limit: 20,
            language: "RU"
        });
        
        console.log(`Category-Specific Status: ${res.status}`);
        if (res.ok) {
            const results = res.json?.result ?? [];
            console.log("First 20 Brands in Category:");
            results.forEach(b => console.log(`  - ID: ${b.id} | Value: ${b.value}`));
            
            const noBrand = results.find(b => b.value.toLowerCase().includes("нет бренда") || b.value.toLowerCase().includes("no brand"));
            if (noBrand) {
                console.log(`\n✅ FOUND "No Brand" ID: ${noBrand.id} (${noBrand.value})`);
            }
        }
    } catch (err) {
        console.error("Category Search Error:", err.message);
    }
}

testBrandApi();
