import { pushProductToOzon } from "./m9-ozon-push.js"
import { readFileSync } from "fs"

console.log("Loading module...");
const p = {
  asin: "TESTASIN",
  brand: "Tata Sampann",
  name: "Tata Sampann Coriander",
  product_category: "Grocery"
};
const ai = { title_ru: "Tata Sampann Coriander", description_ru: "Coriander", hashtags: "" };
const brand = { value: "Нет бренда", id: 126745801 };

const isNoBrand = brand.value === "Нет бренда" || !brand.value;
const brandForTextChecks = isNoBrand && p.brand ? p.brand : brand.value;

console.log("p.brand:", p.brand);
console.log("brand.value:", brand.value);
console.log("isNoBrand:", isNoBrand);
console.log("brandForTextChecks:", brandForTextChecks);

