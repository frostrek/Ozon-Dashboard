import { fetchOzonAttrValues } from "./m9-ozon-push.js";

async function check() {
    const descriptionCategoryId = 17028991;
    const typeId = 629618165;
    
    console.log(`Fetching 100 brands for category ${descriptionCategoryId}...`);
    const values = await fetchOzonAttrValues("", 85, descriptionCategoryId, typeId); // Empty filter to see first page
    console.log(`Found ${values.length} brands.`);

    const foundNoBrand = values.filter(v => 
        v.value.toLowerCase().includes("бренда") || 
        v.value.toLowerCase().includes("brand") || 
        v.value.toLowerCase().includes("не име")
    );

    console.log("Potential 'No brand' entries:", JSON.stringify(foundNoBrand, null, 2));
    
    if (values.length > 0) {
        console.log("Sample Brands (first 20):", values.slice(0, 20).map(v => `${v.id}: ${v.value}`).join(", "));
    }
}

check().catch(console.error);
