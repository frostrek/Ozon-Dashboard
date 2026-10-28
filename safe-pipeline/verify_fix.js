import { translateProduct } from "./m6-translate.js";
import { mapAmazonToOzon } from "./m10b-attr-mapper.js";

async function verifyFixes() {
    console.log("=== Verifying Ozon Pipeline Fixes ===\n");

    const testProducts = [
        {
            asin: "VERIFY_MINIMALIST",
            name: "Minimalist 10% Vitamin C Serum for Glowing Skin | 30ml",
            brand: "Minimalist",
            description: "Ingredients: Vitamin C, Acetyl Glucosamine. Apply 2-3 drops.",
            ingredients: "Vitamin C, Acetyl Glucosamine",
            directions: "Nightly application.",
            volume_ml: 30,
            product_category: "Beauty"
        },
        {
            asin: "VERIFY_NO_BRAND",
            name: "Generic Face Wash with Salicylic Acid | 100ml",
            brand: null, // Test fallback
            description: "Deep cleansing face wash. Net volume: 100ml. Includes Salicylic Acid, Aloe Vera.",
            ingredients: null, // Test extraction
            directions: null, // Test short generation
            volume_ml: null, // Test regex extraction
            product_category: "Beauty"
        }
    ];

    for (const p of testProducts) {
        console.log(`\n--- Testing ASIN: ${p.asin} ---`);
        
        // 1. Content Generation
        const trans = await translateProduct(p);
        console.log(`SEO Title: ${trans.title_ru}`);
        console.log(`Method of Use: ${trans.method_of_use}`);
        console.log(`Hashtags: ${trans.hashtags}`);
        console.log(`Composition: ${trans.composition}`);

        // 2. Attribute Mapping (Simulated Ozon API)
        const catId = 17028991;
        const typeId = 93945;
        const mockAttrs = [
            { id: 85, name: "Бренд", type: "Dictionary", dictionary_id: 1, is_required: true },
            { id: 9461, name: "Объем, мл", type: "Decimal", is_required: true },
            { id: 8205, name: "Срок годности", type: "Integer" },
            { id: 8176, name: "Область использования", type: "Dictionary" }
        ];

        const mockOzonPost = async (path, body) => {
            if (path === "/v1/description-category/attribute/values") {
                if (body.attribute_id === 85) {
                    return { result: [
                        { id: 123, value: "Mali" },
                        { id: 456, value: "Minimalist" },
                        { id: 789, value: "Нет бренда" }
                    ]};
                }
            }
            return { result: [] };
        };

        const mapping = await mapAmazonToOzon(p, mockAttrs, catId, typeId, mockOzonPost);
        console.log("Mapped Attributes:");
        mapping.filled.forEach(a => {
            console.log(`  ID ${a.id}: ${JSON.stringify(a.values)}`);
        });
    }
}

verifyFixes().catch(console.error);
