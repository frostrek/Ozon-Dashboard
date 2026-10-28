const OZON_CLIENT_ID = (process.env.OZON_CLIENT_ID || "").trim();
const OZON_API_KEY = (process.env.OZON_API_KEY || "").trim();

async function run() {
    // Search the tree for Food/Beverages/Grocery
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
            const name = (item.category_name || "").toLowerCase();
            const fullPath = path ? `${path} > ${item.category_name}` : item.category_name;
            if (name.includes("чай") || name.includes("продукты") || name.includes("напитки")) {
                if (item.type_id) {
                    results.push({ name: fullPath, catId: item.description_category_id, typeId: item.type_id });
                }
            }
            if (item.children) findMatches(item.children, fullPath);
        }
    };
    findMatches(treeData.result || []);

    console.log(`Found ${results.length} leaf categories.`);
    
    // Pick the most relevant one (Tea)
    const target = results.find(r => r.name.toLowerCase().includes("черный") || r.name.toLowerCase().includes("листовой")) || results[0];
    
    if (!target) {
        console.error("No target category found.");
        return;
    }

    console.log(`Analyzing: ${target.name} (Cat: ${target.catId}, Type: ${target.typeId})`);

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

    console.log("\nALL ATTRIBUTES:");
    for (const a of attrs) {
        console.log(`ID: ${a.id} | Name: ${a.name} | Req: ${a.is_required} | Type: ${a.type}`);
    }
}

run().catch(console.error);
