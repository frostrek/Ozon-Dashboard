const { ozonPost } = await import('./m9-ozon-push.js');

async function findNoBrand() {
    const catId = 17028991;
    const typeId = 93897;
    const attrId = 85;

    console.log(`=== Searching for "Нет бренда" in Cat: ${catId} ===\n`);

    try {
        // Fetch first 1000 items (10 pages)
        for (let page = 1; page <= 10; page++) {
            console.log(`Checking page ${page}...`);
            const res = await ozonPost('/v1/description-category/attribute/values', {
                description_category_id: catId,
                type_id: typeId,
                attribute_id: attrId,
                language: 'RU',
                last_value_id: page === 1 ? 0 : undefined, // Ozon uses last_value_id for pagination often, but let's try just page-like if supported or just limit
                limit: 1000
            });
            
            const matches = res.json?.result ?? [];
            if (matches.length === 0) break;

            const noBrand = matches.find(m => m.value.toLowerCase().includes("нет бренда") || m.value.toLowerCase().includes("no brand"));
            if (noBrand) {
                console.log(`\n✅ FOUND "Нет бренда" ID: ${noBrand.id} (Value: ${noBrand.value})`);
                return;
            }

            const dermaCo = matches.find(m => m.value.toLowerCase().includes("derma co"));
            if (dermaCo) {
                console.log(`\n✅ FOUND "The Derma Co" ID: ${dermaCo.id} (Value: ${dermaCo.value})`);
            }
            
            // If we didn't find it, we need to know what we DID find
            if (page === 1) {
                console.log(`First 5 brands:`, matches.slice(0, 5).map(m => `"${m.value}" (${m.id})`).join(", "));
            }
        }
    } catch (err) {
        console.error(`Error:`, err.message);
    }
}

findNoBrand();
