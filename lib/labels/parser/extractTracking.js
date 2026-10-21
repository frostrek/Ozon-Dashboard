export function extractTrackingIds(text) {
  // Ozon order numbers strictly follow formats like:
  // 79369156-0060-1 (8 digits - 4 digits - 1 digit)
  // 0161661006-0056-1 (10 digits - 4 digits - 1 digit)
  // We match this specific pattern to avoid picking up product barcodes or random numbers.
  const regex = /\b\d{8,12}\s*-\s*\d{4}\s*-\s*\d{1,3}\b/g;
  const matches = text.match(regex);
  
  if (!matches) {
    return [];
  }

  // Clean IDs by stripping out all whitespaces and hyphens
  const cleanedMatches = matches.map(id => id.replace(/[\s-]/g, ''));
  
  // Deduplicate
  const uniqueIds = [...new Set(cleanedMatches)];
  
  return uniqueIds;
}
