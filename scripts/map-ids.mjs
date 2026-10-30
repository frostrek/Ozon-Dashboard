import { readFileSync, writeFileSync } from 'node:fs';

const file = 'prisma/schema.prisma';
const text = readFileSync(file, 'utf8').replace(/^([ \t]+id\b.*@id.*)$/gm, (line) => (
  line.includes('@map("_id")') ? line : `${line} @map("_id")`
));
writeFileSync(file, text);
console.log('mapped');
