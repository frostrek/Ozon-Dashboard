import { readFileSync } from "fs";
import dotenv from "dotenv";
dotenv.config();

async function debug() {
  const OZON_CLIENT_ID = process.env.OZON_CLIENT_ID;
  const OZON_API_KEY = process.env.OZON_API_KEY;

  console.log(`Using Client-Id: ${OZON_CLIENT_ID}`);

  try {
    const resEn = await fetch("https://api-seller.ozon.ru/v1/description-category/tree", {
      method: "POST",
      headers: { "Client-Id": OZON_CLIENT_ID, "Api-Key": OZON_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ language: "DEFAULT" })
    });
    
    console.log(`Response Status: ${resEn.status}`);
    const dataEn = await resEn.json();
    
    if (!resEn.ok) {
        console.error("Error response:", JSON.stringify(dataEn, null, 2));
        return;
    }

    console.log(`Result length: ${dataEn.result?.length || 0}`);
    if (dataEn.result?.length > 0) {
        console.log("First node sample:", JSON.stringify(dataEn.result[0], (k, v) => k === 'children' ? '[TRUNCATED]' : v, 2));
        
        function countTypes(nodes) {
            let count = 0;
            for (const node of nodes) {
                if (node.type_id) count++;
                if (node.children) count += countTypes(node.children);
            }
            return count;
        }
        
        console.log(`Total types (leaf categories) found: ${countTypes(dataEn.result)}`);
    } else {
        console.log("No results returned in 'result' field.");
    }

  } catch (e) {
    console.error("Fetch failed:", e);
  }
}

debug();
