import { createClient } from '@supabase/supabase-js';

const supabase = createClient(Bun.env.SUPABASE_URL, Bun.env.SUPABASE_SERVICE_KEY);

async function checkNulls() {
    const { data, error } = await supabase
        .from('amazon_products')
        .select('asin, name, ingredients, net_quantity, volume_ml, feature_bullets, description')
        .ilike('name', '%Hair Serum%')
        .limit(10);
    
    if (error) {
        console.error("Error:", error.message);
        return;
    }

    console.log("--- NULL DATA AUDIT ---");
    data.forEach(p => {
        console.log(`[${p.asin}] Name: ${p.name.slice(0, 30)}...`);
        console.log(`  Ingredients: ${p.ingredients ? 'OK' : 'MISSING'}`);
        console.log(`  Net Quantity: ${p.net_quantity ? 'OK' : 'MISSING'}`);
        console.log(`  Volume ML: ${p.volume_ml ? 'OK' : 'MISSING'}`);
        if (!p.ingredients || !p.volume_ml) {
            console.log(`  🔍 Searchable Text (Bullets): ${p.feature_bullets?.length || 0} bullets`);
            console.log(`  🔍 Searchable Text (Desc): ${p.description?.slice(0, 100) || 'None'}`);
        }
        console.log("-------------------");
    });
}

checkNulls();
