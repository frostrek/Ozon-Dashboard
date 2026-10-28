const OZON_CLIENT_ID = (process.env.OZON_CLIENT_ID || "").trim();
const OZON_API_KEY = (process.env.OZON_API_KEY || "").trim();

async function run() {
    const treeRes = await fetch('https://api-seller.ozon.ru/v1/description-category/tree', {
        method: 'POST',
        headers: {
            'Client-Id': OZON_CLIENT_ID,
            'Api-Key': OZON_API_KEY,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ language: 'RU' })
    });
    const treeData = await treeRes.json();
    
    const results = [];
    const findMatches = (items, path = "") => {
        if (!items || !Array.isArray(items)) return;
        for (const item of items) {
            const name = (item.category_name || "");
            const fullPath = path ? `${path} > ${name}` : name;
            // Search for "Кофе" (Coffee) or "Coffee"
            if (name.toLowerCase().includes("кофе") || name.toLowerCase().includes("coffee")) {
                if (item.type_id) {
                    results.push({ name: fullPath, catId: item.description_category_id, typeId: item.type_id });
                }
            }
            if (item.children) findMatches(item.children, fullPath);
        }
    };
    findMatches(treeData.result || []);

    console.log(`Found ${results.length} leaf categories for Coffee.`);
    results.slice(0, 10).forEach(r => {
        console.log(`Path: ${r.name} | CatID: ${r.catId} | TypeID: ${r.typeId}`);
    });

    if (results.length > 0) {
        const target = results.find(r => r.name.toLowerCase().includes("растворимый")) || results[0];
        console.log(`\nFetching Attributes for: ${target.name}`);
        
        const attrRes = await fetch('https://api-seller.ozon.ru/v1/description-category/attribute', {
            method: 'POST',
            headers: {
                'Client-Id': OZON_CLIENT_ID,
                'Api-Key': OZON_API_KEY,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                description_category_id: target.catId,
                type_id: target.typeId,
                language: "RU"
            })
        });
        const attrData = await attrRes.json();
        const attrs = attrData.result || [];
        
        attrs.filter(a => a.is_required).forEach(a => {
            console.log(`REQUIRED ID: ${a.id} | Name: ${a.name} | Type: ${a.type} | Dictionary: ${a.dictionary_id}`);
        });
    }
}

run().catch(console.error);
