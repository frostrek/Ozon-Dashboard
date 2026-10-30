import { readFileSync, writeFileSync } from 'node:fs';

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('MONGODB_URI is missing.');
  process.exit(1);
}
let text = readFileSync('.env', 'utf8');
if (!/^SQLITE_DATABASE_URL=/m.test(text)) {
  text = text.replace(/^DATABASE_URL=.*$/m, `SQLITE_DATABASE_URL="file:./dev.db"\nDATABASE_URL="${uri}"`);
} else {
  text = text.replace(/^DATABASE_URL=.*$/m, `DATABASE_URL="${uri}"`);
}
if (!/^MONGODB_URI=/m.test(text)) text += `\nMONGODB_URI="${uri}"\n`;
else text = text.replace(/^MONGODB_URI=.*$/m, `MONGODB_URI="${uri}"`);
writeFileSync('.env', text);
console.log('env updated');
