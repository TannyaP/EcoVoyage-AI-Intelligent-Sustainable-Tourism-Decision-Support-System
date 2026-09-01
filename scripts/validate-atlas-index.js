const fs = require('fs');
const path = require('path');

const indexPath = path.join(__dirname, '..', 'atlas', 'destination-search-index.json');
const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
const expectedFields = ['name', 'state', 'tags', 'description'];
const fields = index?.mappings?.fields || {};

if (index?.mappings?.dynamic !== false) throw new Error('Atlas Search index must use static mappings.');
for (const field of expectedFields) {
  if (fields[field]?.type !== 'string') throw new Error(`Atlas Search field ${field} must be mapped as a string.`);
}
if (Object.keys(fields).length !== expectedFields.length) throw new Error('Atlas Search index should contain only the fields queried by the application.');

console.log(`Atlas Search definition is valid for ${expectedFields.join(', ')}.`);
