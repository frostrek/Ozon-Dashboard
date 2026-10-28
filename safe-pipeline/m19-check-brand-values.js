const { ozonPost } = await import('./m9-ozon-push.js');

async function checkBrandValues() {
    const catId = 17028991;
    const typeId = 93897;
    const attrId = 85; 

    console.log(`=== Fetching Brand Dictionary Values for Cat: ${catId} ===\n`);

    const brandsToSearch = ["The Derma Co", "Himalaya", "Mamaearth", "Cetaphil", "Minimalist", "Нет бренда"];

    for (const name of brandsToSearch) {
        try {
            const res = await ozonPost("/v1/description-category/attribute/values", {
                description_category_id: catId,
                type_id: typeId,
                attribute_id: attrId,
                last_value_id: 0,
                limit: 100,
                language: "RU",
                query: name 
            });
            
            if (!res.ok) {
                console.error(`Error searching for ${name}: HTTP ${res.status}`);
                continue;
            }

            const results = res.json?.result ?? [];
            console.log(`Search: "${name}" -> Found ${results.length} matches`);
            results.forEach(b => {
                console.log(`  - ID: ${b.id} | Value: ${b.value}`);
            });
            console.log("");
        } catch (err) {
            console.error(`Fatal Error searching for ${name}:`, err.message);
        }
    }
}

checkBrandValues();
