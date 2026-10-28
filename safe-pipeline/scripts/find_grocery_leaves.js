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
    const traverse = (items, path = "") => {
        if (!items || !Array.isArray(items)) return;
        for (const f of items) {
            const name = f.category_name || "";
            const fullPath = path ? `${path} > ${name}` : name;
            
            // Look for Coffee or Tea related terms in Russian
            const n = name.toLowerCase();
            if (n.includes("кофе") || n.includes("coffee") || n.includes("чай") || n.includes("tea")) {
                if (f.type_id) {
                    results.push({ path: fullPath, catId: f.description_category_id, typeId: f.type_id });
                }
            }
            if (f.children) traverse(f.children, fullPath);
        }
    };
    traverse(treeData.result || []);

    console.log(`Found ${results.length} leaf categories.`);
    results.slice(0, 30).forEach(r => {
        console.log(`${r.path} | Cat: ${r.catId} | Type: ${r.typeId}`);
    });
}

run().catch(console.error);
