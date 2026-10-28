import { createClient } from "@supabase/supabase-js";
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const {data, error} = await s.from('scrape_progress').select('*');
if (error) console.error("Error:", error);
console.log("Data:", JSON.stringify(data, null, 2));
