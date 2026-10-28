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
    
    let teaCat = null;
    const findTea = (items) => {
        if (!items || !Array.isArray(items)) return;
        for (const item of items) {
            const name = (item.category_name || "").toLowerCase();
            if (name === "чай черный" || name === "чай в пакетиках") {
                teaCat = item;
                return;
            }
            if (item.children) findTea(item.children);
            if (teaCat) return;
        }
    };
    findTea(treeData.result || []);

    if (!teaCat) {
        console.warn("Target tea category not found, picking first tea-like leaf...");
        const findAnyTeaLeaf = (items) => {
             if (!items || !Array.isArray(items)) return;
             for (const item of items) {
                 const name = (item.category_name || "").toLowerCase();
                 if (name.includes('чай') && item.type_id) {
                     teaCat = item;
                     return;
                 }
                 if (item.children) findAnyTeaLeaf(item.children);
                 if (teaCat) return;
             }
        };
        findAnyTeaLeaf(treeData.result || []);
    }

    if (!teaCat) {
        console.error("No tea category found.");
        return;
    }

    console.log(`Analyzing Category: ${teaCat.category_name} | ID: ${teaCat.description_category_id} | Type: ${teaCat.type_id}`);

    const attrRes = await fetch('https://api-seller.ozon.ru/v1/description-category/attribute', {
        method: 'POST',
        headers: {
            'Client-Id': OZON_CLIENT_ID,
            'Api-Key': OZON_API_KEY,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            description_category_id: teaCat.description_category_id,
            type_id: teaCat.type_id,
            language: "RU"
        })
    });
    const attrData = await attrRes.json();
    const attrs = attrData.result || [];

    console.log("\nCritical Grocery Attributes:");
    const keywords = ["срок", "темпер", "упаков", "состав", "кол-во", "единиц", "бренд", "тип"];
    for (const a of attrs) {
        const n = a.name.toLowerCase();
        if (keywords.some(k => n.includes(k))) {
            console.log(`ID: ${a.id} | Name: ${a.name} | Required: ${a.is_required} | Type: ${a.type} | Dictionary: ${a.dictionary_id}`);
        }
    }
}

run().catch(console.error);
