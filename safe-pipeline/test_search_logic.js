function flattenOzonTree(nodes, currentDescCatId = null, currentPath = "") {
  let results = [];
  for (const node of nodes) {
    if (node.disabled) continue;
    const descId = node.description_category_id || currentDescCatId;
    const name = node.category_name || node.type_name;
    const path = currentPath ? `${currentPath} > ${name}` : name;
    if (node.type_id) {
      results.push({ catId: descId, typeId: node.type_id, label: path, searchBase: path.toLowerCase() });
    }
    if (node.children && node.children.length > 0) {
      results.push(...flattenOzonTree(node.children, descId, path));
    }
  }
  return results;
}

const mockTree = [
  {
    category_name: "Beauty",
    description_category_id: 100,
    children: [
      {
        category_name: "Skin Care",
        children: [
          {
            type_name: "Face Cream",
            type_id: 200,
            children: []
          }
        ]
      }
    ]
  }
];

const flatEn = flattenOzonTree(mockTree);
console.log("Flat Tree Size:", flatEn.length);
console.log("First item searchBase:", flatEn[0]?.searchBase);

const termEn = "face cream";
const matchesEn = flatEn.filter(c => c.searchBase.includes(termEn));
console.log("Matches for 'face cream':", matchesEn.length);

const searchWordsEn = termEn.split(/\s+/).filter(w => w.length > 2);
console.log("Search words:", searchWordsEn);

const scoreCategoryMatch = (label, searchWords) => {
  const l = label.toLowerCase();
  let matchedCount = 0;
  for (const w of searchWords) {
    if (l.includes(w)) matchedCount++;
  }
  return matchedCount;
};

const scored = flatEn.map(c => {
  const scoreEn = scoreCategoryMatch(c.label, searchWordsEn);
  return { ...c, score: scoreEn };
}).filter(c => c.score > 0);

console.log("Scored matches:", scored.length);
if (scored.length > 0) console.log("Top score:", scored[0].score);
