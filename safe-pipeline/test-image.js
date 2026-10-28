import { generateMainImage } from "./m-image-pipeline.js";
import fs from "fs";

const product = {
  image_urls: ["https://m.media-amazon.com/images/I/91S-09YoDSL._SL1500_.jpg"],
  product_category: "snack"
};

const brand = "BAGRRY'S";
const titleRu = "Мюсли С Орехами И Ягодами, 425 г";
const benefitsRu = [
  "✓ 71% зерновых волокон",
  "✓ 68% многозерновых крупянок",
  "✓ Без искусственных красителей",
  "✓ Богат клетчаткой и витаминами"
];
const typeLabel = "snack";
const packQty = 1;

async function run() {
  try {
    const buf = await generateMainImage(product, brand, titleRu, benefitsRu, typeLabel, packQty);
    fs.writeFileSync("sample_output.jpg", buf);
    console.log("Dabur layout sample generated successfully at sample_output.jpg");
  } catch (err) {
    console.error("Error generating sample:", err);
  }
}

run();
