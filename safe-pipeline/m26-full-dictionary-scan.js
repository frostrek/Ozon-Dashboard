const { ozonPost } = await import('./m9-ozon-push.js');

async function findBrandUltimate() {
    const catId = 17028991;
    const typeId = 93897;
    const attrId = 85;

    console.log(`=== Paginating ALL Brands for Cat: ${catId} ===\n`);

    let lastId = 0;
    let totalChecked = 0;
    
    // We'll check up to 50 pages (50,000 items)
    for (let page = 1; page <= 50; page++) {
        const res = await ozonPost('/v1/description-category/attribute/values', {
            description_category_id: catId,
            type_id: typeId,
            attribute_id: attrId,
            language: 'RU',
            last_value_id: lastId,
            limit: 1000
        });
        
        const matches = res.json?.result ?? [];
        if (matches.length === 0) {
            console.log("No more results.");
            break;
        }

        totalChecked += matches.length;
        
        const found = matches.filter(m => 
            m.value.toLowerCase().includes("derma co") || 
            m.value.toLowerCase().includes("нет бренда") ||
            m.value.toLowerCase().includes("no brand") ||
            m.value.toLowerCase().includes("мамаерт") || 
            m.value.toLowerCase().includes("mamaearth")
        );

        if (found.length > 0) {
            found.forEach(f => console.log(`\n🚀 FOUND: "${f.value}" -> ID: ${f.id}`));
        }

        lastId = matches[matches.length - 1].id;
        process.stdout.write(`Checked ${totalChecked}...\r`);
    }
}

findBrandUltimate();
