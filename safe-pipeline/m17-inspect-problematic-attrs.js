const { ozonPost } = await import('./m9-ozon-push.js');

async function checkAttrs() {
    const catId = 17028991;
    const typeId = 93897;

    console.log(`Fetching attributes for Cat: ${catId}, Type: ${typeId}...`);
    try {
        const res = await ozonPost("/v1/description-category/attribute", {
            description_category_id: catId,
            type_id: typeId,
            language: "RU"
        });
        
        const attrs = JSON.parse(res.text).result;
        const problematicTerms = ["вес", "объем", "опасности", "18+", "упаковок", "бренд"];
        
        const filtered = attrs.filter(a => 
            problematicTerms.some(term => a.name.toLowerCase().includes(term))
        );
        
        console.log(JSON.stringify(filtered, null, 2));
    } catch (err) {
        console.error(err);
    }
}

checkAttrs();
