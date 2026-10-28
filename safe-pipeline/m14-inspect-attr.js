import { ozonPost } from "./m9-ozon-push.js";

async function inspect() {
    const descriptionCategoryId = 17028991;
    const typeId = 629618165;

    console.log(`Inspecting attributes for category ${descriptionCategoryId}...`);
    const res = await ozonPost("/v1/description-category/attribute", {
        description_category_id: descriptionCategoryId,
        type_id: typeId,
        language: "RU"
    });

    if (!res.ok) {
        console.error("Failed to fetch attributes:", res.text);
        return;
    }

    const data = JSON.parse(res.text);
    const brandAttr = data.result.find(a => a.id === 85);

    if (brandAttr) {
        console.log("=== Brand Attribute (85) Metadata ===");
        console.log(JSON.stringify(brandAttr, null, 2));
    } else {
        console.warn("Brand attribute (85) not found in this category.");
    }
}

inspect().catch(console.error);
