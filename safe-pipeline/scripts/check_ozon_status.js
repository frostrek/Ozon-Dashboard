const OZON_CLIENT_ID = (process.env.OZON_CLIENT_ID || "").trim();
const OZON_API_KEY = (process.env.OZON_API_KEY || "").trim();

async function run() {
    console.log(`Checking Ozon status for Client ID: ${OZON_CLIENT_ID}`);
    
    // 1. Check Product List
    const res = await fetch('https://api-seller.ozon.ru/v1/product/list', {
        method: 'POST',
        headers: {
            'Client-Id': OZON_CLIENT_ID,
            'Api-Key': OZON_API_KEY,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ limit: 5 })
    });
    const text = await res.text();
    console.log("Raw Response (Product List):", text.slice(0, 500));
    try {
        const data = JSON.parse(text);
        console.log("Parsed Product List:", JSON.stringify(data.result || data, null, 2));
    } catch (e) {
        console.error("Failed to parse Product List JSON");
    }

    // 2. Check Recent Tasks
    const taskRes = await fetch('https://api-seller.ozon.ru/v1/product/import/info', {
        method: 'POST',
        headers: {
            'Client-Id': OZON_CLIENT_ID,
            'Api-Key': OZON_API_KEY,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ })
    });
    const taskText = await taskRes.text();
    console.log("\nRaw Response (Tasks):", taskText.slice(0, 500));
    try {
        const taskData = JSON.parse(taskText);
        console.log("Parsed Tasks:", JSON.stringify(taskData.result || taskData, null, 2));
    } catch (e) {
        console.error("Failed to parse Task JSON");
    }
}

run().catch(console.error);
