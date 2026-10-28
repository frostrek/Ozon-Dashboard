import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function check() {
    const { data, error } = await supabase
        .from("product_listings")
        .select(`
            id,
            status,
            error_message,
            products (asin, name, brand)
        `)
        .order('created_at', { ascending: false })
        .limit(10);

    if (error) {
        console.error("Error fetching listings:", error.message);
        return;
    }

    console.log("=== Recent Product Listings ===");
    data.forEach(l => {
        console.log(`- [${l.status.toUpperCase()}] ASIN: ${l.products?.asin} | Brand: ${l.products?.brand} | Error: ${l.error_message || 'None'}`);
    });
}

check().catch(console.error);
