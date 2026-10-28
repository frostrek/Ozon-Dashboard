const { ozonPost } = await import('./m9-ozon-push.js');

async function findBrandIds() {
    const catId = 17028991;
    const typeId = 93897;
    const attrId = 85;

    console.log(`=== Searching Brand Dictionary for Cat: ${catId} ===\n`);

    const queries = ["The Derma Co", "Нет бренда", "Mamaearth", "Biotique", "Patanjali", "Khadi Natural", "Minimalist"];

    for (const q of queries) {
        try {
            const res = await ozonPost('/v1/description-category/attribute/values', {
                description_category_id: catId,
                type_id: typeId,
                attribute_id: attrId,
                query: q,
                language: 'RU',
                limit: 100
            });
            
            const matches = res.json?.result ?? [];
            if (matches.length > 0) {
                console.log(`QUERY: "${q}"`);
                matches.forEach(m => console.log(` - FOUND: "${m.value}" -> ID: ${m.id}`));
            } else {
                console.log(`QUERY: "${q}" -> NO RESULTS`);
            }
        } catch (err) {
            console.error(`Error searching for "${q}":`, err.message);
        }
    }
}

findBrandIds();
