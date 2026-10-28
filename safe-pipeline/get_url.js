import fs from 'fs';
const data = JSON.parse(fs.readFileSync('m1-m3-output.json', 'utf8'));
console.log(data[0].image_urls);

