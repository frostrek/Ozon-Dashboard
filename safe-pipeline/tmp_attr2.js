async function testOzon() {
  const url = 'https://api-seller.ozon.ru/v1/description-category/attribute';
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Client-Id': Bun.env.OZON_CLIENT_ID,
      'Api-Key': Bun.env.OZON_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      description_category_id: 17028990,
      type_id: 93450,
      language: 'DEFAULT'
    })
  });
  const data = await res.json();
  for (const p of data.result) {
    if ([85, 10096, 10097, 8229].includes(p.id) || p.name.includes('Цвет')) {
      console.log(`ID: ${p.id} | Name: ${p.name} | dictionary_id: ${p.dictionary_id} | is_collection: ${p.is_collection} | is_required: ${p.is_required} | type: ${p.type}`);
    }
  }
}
testOzon().catch(console.error);
