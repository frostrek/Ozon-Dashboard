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
        for (const item of items) {
            const name = item.category_name || "";
            const currentPath = path ? `${path} > ${name}` : name;
            
            if (item.type_id) {
                 results.push({ path: currentPath, catId: item.description_category_id, typeId: item.type_id });
            }
            if (item.children) traverse(item.children, currentPath);
        }
    };
    traverse(treeData.result || []);

    console.log(`Total leaf categories: ${results.length}`);
    const coffeeMatches = results.filter(r => r.path.toLowerCase().includes("кофе") || r.path.toLowerCase().includes("coffee"));
    console.log(`Coffee leaf categories: ${coffeeMatches.length}`);
    coffeeMatches.slice(0, 50).forEach(l => {
        console.log(`Leaf: ${l.path} | CatId: ${l.catId} | TypeId: ${l.typeId}`);
    });
}

run().catch(console.error);
