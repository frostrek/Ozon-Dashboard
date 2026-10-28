const { ozonPost } = await import('./m9-ozon-push.js');

async function findBrandIds() {
    const catId = 17028991;
    const typeId = 93897;
    const attrId = 85; 

    console.log(`=== Paginating through Brand Dictionary for Cat: ${catId} ===\n`);

    const targets = ["the derma co", "himalaya", "mamaearth", "cetaphil", "minimalist", "нет бренда", "no brand"];
    const found = {};
    
    let lastId = 0;
    let page = 1;
    let exit = false;

    while (!exit && page < 50) { // Check up to 5000 brands
        try {
            const res = await ozonPost("/v1/description-category/attribute/values", {
                description_category_id: catId,
                type_id: typeId,
                attribute_id: attrId,
                last_value_id: lastId,
                limit: 100,
                language: "RU"
            });
            
            const results = res.json?.result ?? [];
            if (results.length === 0) break;

            for (const b of results) {
                const val = b.value.toLowerCase();
                for (const t of targets) {
                    if (val === t || val.includes(t)) {
                        console.log(`FOUND Match: "${t}" -> ID: ${b.id}, Name: ${b.value}`);
                        found[t] = { id: b.id, name: b.value };
                    }
                }
                lastId = b.id;
            }
            
            page++;
        } catch (err) {
            console.error(`Error on page ${page}:`, err.message);
            break;
        }
    }
    
    console.log("\nSummary of found brands:");
    console.log(JSON.stringify(found, null, 2));
}

findBrandIds();
