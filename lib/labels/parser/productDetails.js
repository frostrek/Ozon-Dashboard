export function extractProductDetails(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  // Strip page headers / footers
  const cleanLines = lines.filter(l => {
    if (/^(?:Date:|Check the list|Warehouse:|Delivery service:|№ Shipment number)/i.test(l)) return false;
    if (/^(?:-- \d+ of \d+ --)$/.test(l)) return false;
    if (/^(?:--|of|из)$/i.test(l)) return false;
    return true;
  });

  // Join into one block so wrapped PDF lines are re-united
  const fullText = cleanLines.join(' ');

  // Split by "row_number + shipment_id" anchors.
  // Capture group keeps the shipment IDs in the result array.
  const parts = fullText.split(/(?:^|\s+)(?:[1-9][0-9]*)\s+(\d{8,12}-\d{4}-\d{1,3})\b/);

  const products = {};

  for (let i = 1; i < parts.length; i += 2) {
    if (i + 1 >= parts.length) break;

    const shipIdRaw = parts[i].trim();                    // e.g. "35072586-0111-4"
    const shipId    = shipIdRaw.replace(/[\s-]/g, '');    // e.g. "35072586-0111-4" → "3507258601114"
    const content   = parts[i + 1].trim();

    if (!products[shipId]) products[shipId] = [];

    // Label code = last 4 digits of the first numeric segment of the shipment ID
    // e.g.  "35072586" → "2586"
    const firstSegment = shipIdRaw.split('-')[0];
    const labelCode    = firstSegment.slice(-4);

    // ─────────────────────────────────────────────────────────────────────────
    // MULTI-PRODUCT PARSER
    //
    //  Ozon product list format for a shipment with N products:
    //    <Title1> <SKU1> <QTY1> <LABELCODE>    ← label code on first product only
    //    <Title2> <SKU2> <QTY2>                ← subsequent products: no label code
    //    <Title3> <SKU3> <QTY3>
    //
    //  We locate each product boundary by:
    //    1. A valid SKU  – ASCII alphanumeric / dash / dot, ≥3 chars, must contain a letter
    //    2. Followed by QTY  – 1–3 digit number
    //    3. Optionally followed by the label code  – exactly 4 digits (first product only)
    //    4. Lookahead: start of next product title (capital letter) OR end of string
    //
    //  Using `/g` exec loop to find ALL products in the block.
    // ─────────────────────────────────────────────────────────────────────────
    const VALID_SKU  = '[A-Za-z0-9][A-Za-z0-9_\\-.]{2,}';    // ≥3 chars, starts with alnum
    const QTY        = '\\d{1,3}';
    const LABEL_OPT  = `(?:\\s+${labelCode})?`;               // label code is optional
    // Lookahead: either next product starts (capital Cyrillic or Latin) or end-of-string
    const NEXT_START = '(?=\\s+[А-ЯA-Za-z]|\\s*$)';

    const productRegex = new RegExp(
      `(.+?)\\s+(${VALID_SKU})\\s+(${QTY})${LABEL_OPT}${NEXT_START}`,
      'g'
    );

    let match;
    let foundAny = false;

    while ((match = productRegex.exec(content)) !== null) {
      foundAny = true;

      let title = match[1].trim();
      let sku   = match[2].trim();
      const qty = match[3];

      // ── Fix split SKUs (e.g. "HIMALAYA-ADTT-180" in title + "-2" as "SKU") ──
      const titleWords    = title.split(/\s+/);
      const lastTitleWord = titleWords[titleWords.length - 1];
      if (
        lastTitleWord &&
        /[A-Z0-9]/i.test(lastTitleWord) &&          // ASCII-ish
        !/[А-Яа-яЁё]/.test(lastTitleWord) &&        // no Cyrillic
        (sku.startsWith('-') || /^[A-Z0-9]{1,3}$/.test(sku))
      ) {
        sku = lastTitleWord + (sku.startsWith('-') ? '' : '-') + sku;
        sku = sku.replace(/--+/g, '-');
        titleWords.pop();
        title = titleWords.join(' ');
      }

      // ── Reject false-positive SKUs ──
      // Must contain at least one letter (rules out bare numbers like "20", "4", "100")
      if (!/[A-Za-z]/.test(sku)) continue;
      // Skip common words that could look like SKUs
      if (/^(?:label|code|product|quantity|image)$/i.test(sku)) continue;

      // ── Clean title ──
      title = title
        .replace(/\b\d+\s*(?:шт\.?|pcs)\b/gi, '')
        .replace(/,\s*$/, '')
        .trim();

      products[shipId].push({
        title: title || 'Unknown Product',
        sku,
        qty,
      });
    }

    if (!foundAny) {
      // Graceful fallback – at least store what we have
      products[shipId].push({
        title: content || 'Unknown Product',
        sku: 'N/A',
        qty: '1',
      });
    }
  }

  return products;
}
