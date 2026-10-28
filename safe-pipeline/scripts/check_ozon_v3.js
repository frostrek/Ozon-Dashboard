const OZON_CLIENT_ID = (process.env.OZON_CLIENT_ID || "").trim();
const OZON_API_KEY = (process.env.OZON_API_KEY || "").trim();

async function run() {
    console.log(`Checking Ozon status for Client ID: ${OZON_CLIENT_ID}`);
    
    // 1. Check Product List (v3 is the actual current endpoint)
    const res = await fetch('https://api-seller.ozon.ru/v3/product/list', {
        method: 'POST',
        headers: {
            'Client-Id': OZON_CLIENT_ID,
            'Api-Key': OZON_API_KEY,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ filter: { visibility: "ALL" }, limit: 10 })
    });
    const text = await res.text();
    console.log("Raw Response (Product List v3):", text.slice(0, 500));
    try {
        const data = JSON.parse(text);
        if (data.result && data.result.items) {
             console.log(`Found ${data.result.items.length} products total.`);
             // Get details for the first few
             const infoRes = await fetch('https://api-seller.ozon.ru/v2/product/info/list', {
                 method: 'POST',
                 headers: {
                     'Client-Id': OZON_CLIENT_ID,
                     'Api-Key': OZON_API_KEY,
                     'Content-Type': 'application/json'
                 },
                 body: JSON.stringify({ product_id: data.result.items.slice(0, 5).map(i => i.product_id) })
             });
             const infoData = await infoRes.json();
             console.log("Detailed Info for first 5 products:");
             console.log(JSON.stringify(infoData.result || infoData, null, 2));
        } else {
             console.log("No products found in the list.");
        }
    } catch (e) {
        console.error("Failed to parse Product List JSON");
    }
}

run().catch(console.error);
