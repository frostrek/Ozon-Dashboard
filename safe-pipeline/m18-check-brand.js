const { ozonPost } = await import('./m9-ozon-push.js');

async function checkBrands() {
    const brandsToSearch = ["The Derma Co", "Himalaya", "Mamaearth", "Cetaphil", "Minimalist", "Нет бренда", "No brand"];
    
    console.log("=== Ozon Brand Dictionary Search ===\n");

    for (const name of brandsToSearch) {
        try {
            const res = await ozonPost("/v1/brand/list", {
                filter: { name: name },
                limit: 5
            });
            
            if (!res.ok) {
                console.error(`Error searching for ${name}: HTTP ${res.status}`);
                console.error(`Response: ${res.text.slice(0, 200)}...`);
                continue;
            }

            const results = res.json?.result ?? [];
            console.log(`Search: "${name}" -> Found ${results.length} matches`);
            results.forEach(b => {
                console.log(`  - ID: ${b.id} | Name: ${b.name}`);
            });
            console.log("");
        } catch (err) {
            console.error(`Fatal Error searching for ${name}:`, err.message);
        }
    }
}

checkBrands();
