const OZON_CLIENT_ID = (process.env.OZON_CLIENT_ID || "").trim();
const OZON_API_KEY = (process.env.OZON_API_KEY || "").trim();

async function run() {
    console.log(`Checking Ozon status for Client ID: ${OZON_CLIENT_ID}`);
    
    // 1. Check Product List (v2)
    const res = await fetch('https://api-seller.ozon.ru/v2/product/list', {
        method: 'POST',
        headers: {
            'Client-Id': OZON_CLIENT_ID,
            'Api-Key': OZON_API_KEY,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ filter: { visibility: "ALL" }, limit: 10 })
    });
    const text = await res.text();
    console.log("Raw Response (Product List v2):", text.slice(0, 500));
    try {
        const data = JSON.parse(text);
        console.log("Parsed Product List:", JSON.stringify(data.result || data, null, 2));
    } catch (e) {
        console.error("Failed to parse Product List JSON");
    }

    // 2. Check import tasks (Search for a list of tasks)
    // Ozon endpoint for task list is often /v1/product/import/info without ID? No.
    // Try /v1/product/list (v1 might actually be /v1/product/list) - wait, I got 404 before.
}

run().catch(console.error);
