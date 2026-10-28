import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = (process.env.SUPABASE_URL ?? "").trim();
const SUPABASE_KEY = (process.env.SUPABASE_SERVICE_KEY ?? "").trim();

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function createBucket() {
    console.log("=== Creating Public Supabase Storage Bucket ===\n");
    const { data, error } = await supabase.storage.createBucket('product-images', {
        public: true,
        allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
        fileSizeLimit: 5242880 // 5MB
    });
    
    if (error) {
        console.error("Error creating bucket:", error.message);
        return;
    }
    console.log("Bucket created successfully:", data);
}

createBucket();
