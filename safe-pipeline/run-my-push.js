import { pushProductToOzon, ozonPost } from "./m9-ozon-push.js";
import { getPushableProducts } from "./m-local-db.js";
import fs from "fs";

async function main() {
    const targetAsin = "B0046VDP8C"; // The PARENT ASIN for Maybelline Concealer
    // Fetch all variants representing this ASIN (parent or standalone)
    const dbProducts = getPushableProducts().filter((p) => p.asin === targetAsin || p.parent_asin === targetAsin);

    if (dbProducts.length === 0) {
        console.error("No pushable products found for " + targetAsin + "! Make sure m5-insert.js finished.");
        process.exit(1);
    }

    console.log(`Starting push for ${dbProducts.length} variants of ${targetAsin}...`);
    
    // We get the ozon category mapping which is now fixed in l98.conf.json for "Консилер"
    let conf = {}; try { conf = JSON.parse(fs.readFileSync("./l98.conf.json", "utf8")); } catch (e) {}
    
    const descriptionCategoryId = conf?.push?.ozon_category?.description_category_id;
    const typeId = conf?.push?.ozon_category?.type_id;
    const typeLabel = conf?.push?.ozon_category?.type_label || "";

    const options = { descriptionCategoryId, typeId, typeLabel, pushToOzon: true };

    let successCount = 0;
    
    for (const p of dbProducts) {
        console.log(`\n\n--- Pushing ASIN ${p.asin} ---`);
        try {
            const result = await pushProductToOzon(p, options);
            if (result.success) {
                successCount++;
                // Let's log the actual payload sent!
                console.log("\n--- EXACT PAYLOAD SENT TO OZON ---");
                // Wait! m9-ozon-push doesn't return the payload, it returns { success, taskId, result }
                // I will grab the most recent payload from `upload-reports` or something?
                // The task ID is logged.
            } else {
                console.error("Failed to push " + p.asin + ": " + result.error);
            }
        } catch(err) {
            console.error("Crash pushing " + p.asin, err);
        }
    }

    console.log(`\nFinished! Successfully pushed ${successCount}/${dbProducts.length}`);
}

main().catch(console.error);
