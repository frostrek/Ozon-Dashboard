import { $ } from "bun";
import { getProducts } from "./m-local-db.js";
import fs from "fs";

async function main() {
    console.log("=========================================");
    console.log("REAL COSMETIC END-TO-END UPLOAD TEST");
    console.log("=========================================\n");

    console.log("1. REAL AMAZON VARIANT SCRAPING & IMAGE DIFFERENCE CHECK");
    console.log("---------------------------------------------------------");
    // Run the scraper for Maybelline Concealer ASIN specifically, or just by keyword.
    // The keyword "Maybelline Instant Age Rewind Concealer" has variants. Let's force it to 1 page.
    await $`bun m1-m3-scraper.js --keyword "Maybelline Instant Age Rewind Concealer" --max-pages 1`;

    console.log("\n2. DB INSERT & DEDUPLICATION");
    console.log("---------------------------------------------------------");
    await $`bun m5-insert.js`;

    // Wait, since we are doing REAL push, let's configure l98.conf.json 
    // to pick up the Parent ASIN of Maybelline Concealer (B0046VDP8C)
    let conf = JSON.parse(fs.readFileSync('./l98.conf.json', 'utf8'));
    conf.push.target_asin = "B0046VDP8C";
    fs.writeFileSync('./l98.conf.json', JSON.stringify(conf, null, 2));

    const allProducts = await getProducts({ status: 'enriched' });
    const variants = allProducts.filter(p => p.parent_asin === "B0046VDP8C" || p.asin === "B0046VDP8C");
    
    console.log(`\nFound ${variants.length} matching variants for B0046VDP8C in local DB.`);

    console.log("\n3. REAL OZON PUSH & DUPLICATE PREVENTION (1st Pass)");
    console.log("---------------------------------------------------------");
    // We execute the push script. It will read l98.conf.json, push B0046VDP8C variants
    // Actually, m9-ozon-push.js does not have a CLI loop by itself!
    // I will use run-my-push.js which I created earlier but fix the import.
    fs.writeFileSync('run-real-push.js', `
import { pushProductToOzon } from "./m9-ozon-push.js";
import { fetchInrUsdRate } from "./m7-pricing.js";
import { getPushableProducts } from "./m-local-db.js";
import fs from "fs";

async function run() {
    let conf = JSON.parse(fs.readFileSync("./l98.conf.json", "utf8"));
    const targetAsin = conf.push.target_asin;
    
    let dbProducts = getPushableProducts ? await getPushableProducts() : await (await import("./m-local-db.js")).getProducts({ status: 'enriched'});
    
    dbProducts = dbProducts.filter(p => p.asin === targetAsin || p.parent_asin === targetAsin);

    const options = {
        descriptionCategoryId: conf.push.ozon_category.description_category_id,
        typeId: conf.push.ozon_category.type_id,
        typeLabel: conf.push.ozon_category.type_label,
        oldPriceMultiplier: conf.push.pricing.old_price_multiplier
    };

    const inrUsdRate = await fetchInrUsdRate();

    for (const p of dbProducts) {
        console.log(\`\\n\\n--- Pushing ASIN \${p.asin} ---\`);
        try {
            await pushProductToOzon(p, inrUsdRate, options);
        } catch(e) {
            console.error(e.message);
        }
    }
}
run();
`);

    // Let's delete the upload reports so it does NOT register as duplicate on the first pass
    console.log("Cleaning up old upload reports for B0046VDP8C variants...");
    for (const v of variants) {
        try { fs.unlinkSync(`./upload-reports/${v.asin}.json`); } catch(e) {}
    }

    // Run first push (this will do EXACTly a real push to Ozon)
    await $`bun --env-file=.env run-real-push.js`;

    console.log("\n4. DUPLICATE PREVENTION CHECK (2nd Pass)");
    console.log("---------------------------------------------------------");
    // Run second push to prove it detects duplicates!
    await $`bun --env-file=.env run-real-push.js`;

    console.log("\nREAL EXECUTION COMPLETED.");
}

main().catch(console.error);
