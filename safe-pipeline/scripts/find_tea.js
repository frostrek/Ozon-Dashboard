const OZON_CLIENT_ID = process.env.OZON_CLIENT_ID;
const OZON_API_KEY = process.env.OZON_API_KEY;

async function run() {
    const res = await fetch('https://api-seller.ozon.ru/v1/description-category/tree', {
        method: 'POST',
        headers: {
            'Client-Id': OZON_CLIENT_ID,
            'Api-Key': OZON_API_KEY,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ language: 'RU' })
    });
    const data = await res.json();
    
    const findTea = (items, path = '') => {
        for (const item of items) {
            const fullPath = path ? path + ' > ' + item.category_name : item.category_name;
            const search = item.category_name.toLowerCase();
            if (search.includes('чай') || search.includes('tea')) {
                console.log(`${fullPath} | ID: ${item.description_category_id} | Type: ${item.type_id}`);
            }
            if (item.children) findTea(item.children, fullPath);
        }
    };
    findTea(data.result || []);
}

run().catch(console.error);
