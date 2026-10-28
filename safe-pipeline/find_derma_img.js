import fs from 'fs';
const data = JSON.parse(fs.readFileSync('m1-m3-output.json', 'utf8'));
const derma = data.find(p => (p.name || '').toLowerCase().includes('derma'));
if (derma) console.log(derma.image_urls[0]);
