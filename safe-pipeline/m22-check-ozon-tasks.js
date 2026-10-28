const { ozonPost } = await import('./m9-ozon-push.js');

async function checkTasks() {
    console.log("=== Checking Ozon Import Task Status ===\n");
    
    // Fetch last few tasks
    // Ozon doesn't have a direct 'list all tasks' API easily accessible, 
    // so we usually check by task_id. 
    // However, I'll try to fetch the product list to see if they are there.
    
    try {
        const res = await ozonPost("/v2/product/list", {
            filter: { visibility: "ALL" },
            limit: 10
        });
        
        if (!res.ok) {
            console.error(`Error fetching products: ${res.status}`);
            console.error(res.text);
            return;
        }

        const items = res.json?.result?.items ?? [];
        console.log(`Found ${items.length} products on your Ozon account:`);
        items.forEach(it => {
            console.log(` - Product ID: ${it.product_id} | SKU: ${it.offer_id}`);
        });

        if (items.length === 0) {
            console.log("\n⚠️ No products found. Checking if there are any pending TASKS...");
        }

    } catch (err) {
        console.error("Fatal Error:", err.message);
    }
}

checkTasks();
