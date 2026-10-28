
const OZON_CLIENT_ID = process.env.OZON_CLIENT_ID || "";
const OZON_API_KEY = process.env.OZON_API_KEY || "";
const TASK_ID = process.env.OZON_TASK_ID || "";

async function checkTask() {
  if (!OZON_CLIENT_ID || !OZON_API_KEY || !TASK_ID) {
    throw new Error("Set OZON_CLIENT_ID, OZON_API_KEY, and OZON_TASK_ID in the environment.");
  }
  const res = await fetch("https://api-seller.ozon.ru/v1/product/import/info", {
    method: "POST",
    headers: {
      "Client-Id": OZON_CLIENT_ID,
      "Api-Key": OZON_API_KEY,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ task_id: parseInt(TASK_ID) })
  });
  
  const data = await res.json();
  console.log(JSON.stringify(data, null, 2));
}

checkTask();
