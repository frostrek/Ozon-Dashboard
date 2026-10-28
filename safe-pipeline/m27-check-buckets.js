import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = (process.env.SUPABASE_URL ?? "").trim();
const SUPABASE_KEY = (process.env.SUPABASE_SERVICE_KEY ?? "").trim();

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function checkBuckets() {
    console.log("=== Checking Supabase Storage Buckets ===\n");
    const { data, error } = await supabase.storage.listBuckets();
    if (error) {
        console.error("Error listing buckets:", error.message);
        return;
    }
    console.log("Buckets found:", JSON.stringify(data, null, 2));
}

checkBuckets();
