import { pushProductToOzon } from "./m9-ozon-push.js";

async function testProducts() {
  console.log("=== Testing Tata Sampann ===");
  const tataProduct = {
    asin: "TATA_TEST",
    amazon_url: "https://amazon.in/dp/TATA_TEST",
    name: "Tata Sampann Cinnamon Whole Spice 200g",
    feature_bullets: ["Authentic spices", "200g"],
    product_category: "Grocery",
    price_inr: 200,
    weight_grams: 200,
    brand: "Tata Sampann",
    description: "Contains Tata Sampann authentic cinnamon",
    country_of_origin: "India",
    image_urls: []
  };

  const options = {
    descriptionCategoryId: 17028991, 
    typeId: 93945, 
    typeLabel: "Специи", 
    oldPriceMultiplier: 1.25, 
    skipDuplicateCheck: true
  };

  let res = await pushProductToOzon(tataProduct, 1.2, options);
  console.log("Upload Result:", res);

  console.log("\n=== Testing Vedaka ===");
  const vedakaProduct = {
    asin: "VEDAKA_TEST",
    amazon_url: "https://amazon.in/dp/VEDAKA_TEST",
    name: "Vedaka Black Pepper Powder 100g",
    feature_bullets: ["Rich flavor", "100g"],
    product_category: "Grocery",
    price_inr: 150,
    weight_grams: 100,
    brand: "Vedaka",
    description: "Contains Vedaka quality black pepper",
    country_of_origin: "India",
    image_urls: []
  };

  res = await pushProductToOzon(vedakaProduct, 1.2, options);
  console.log("Upload Result:", res);
  process.exit(0);
}

testProducts();
