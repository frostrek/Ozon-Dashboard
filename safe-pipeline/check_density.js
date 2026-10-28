import { createClient } from '@supabase/supabase-js';

const supabase = createClient(Bun.env.SUPABASE_URL, Bun.env.SUPABASE_SERVICE_KEY);

async function checkDensity() {
    const { count, error } = await supabase
        .from('amazon_products')
        .select('*', { count: 'exact', head: true });
    
    if (error) {
        console.error("Error:", error.message);
        return;
    }

    const { count: hCount } = await supabase
        .from('amazon_products')
        .select('*', { count: 'exact', head: true })
        .ilike('name', '%Hair Serum%');

    console.log(`Total Products in DB: ${count}`);
    console.log(`'Hair Serum' specifically: ${hCount}`);
}

checkDensity();
