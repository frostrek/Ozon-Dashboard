import ExcelJS from 'exceljs';

export const CHARGES_HEADERS = [
  'DATE',
  'POSTING NUMBER',
  'ORDER NUMBER',
  'STORE ACCOUNT',
  'PRODUCTS & SKU',
  'QTY',
  'ORDER VALUE',
  'COMMISSION',
  'LOGISTICS',
  'RETURNS',
  'PARTNER FEE',
  'PROMOTION',
  'OTHER CHARGES',
  'TOTAL DEDUCT',
  'NET PAYOUT',
  'STATUS',
  'ORIGIN CLUSTER',
  'DESTINATION CLUSTER',
];

const COL_WIDTHS = [
  14, // Date
  22, // Posting
  16, // Order Num
  18, // Store
  44, // Products
  8,  // Qty
  16, // Order Value
  15, // Commission
  14, // Logistics
  14, // Returns
  14, // Partner Fee
  14, // Promotion
  15, // Other Charges
  16, // Total Deductions
  16, // Net Payout
  20, // Status
  22, // Origin
  28, // Destination
];

export async function buildChargesWorkbook(orders = [], dateRange = {}) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Ozon Fulfillment Ops';
  workbook.lastModifiedBy = 'Ozon Fulfillment Ops';
  workbook.created = new Date();
  workbook.modified = new Date();

  const worksheet = workbook.addWorksheet('Order Charges', {
    properties: { tabColor: { argb: 'FF10756F' } },
    views: [{ showGridLines: true }],
  });

  // ── HEADER ROW (Deep Teal #10756F exactly matching Image 2) ─────────
  const headerRow = worksheet.addRow(CHARGES_HEADERS);
  headerRow.height = 32;

  headerRow.eachCell((cell, colNumber) => {
    cell.font = {
      name: 'Segoe UI',
      size: 10.5,
      bold: true,
      color: { argb: 'FFFFFFFF' },
    };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF10756F' },
    };
    cell.alignment = {
      vertical: 'middle',
      horizontal:
        colNumber === 1 || colNumber === 2 || colNumber === 3 || colNumber === 6 || colNumber === 16
          ? 'center'
          : colNumber >= 7 && colNumber <= 15
          ? 'right'
          : 'left',
      wrapText: false,
    };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF0C5D58' } },
      bottom: { style: 'medium', color: { argb: 'FF0C5D58' } },
      left: { style: 'thin', color: { argb: 'FF158079' } },
      right: { style: 'thin', color: { argb: 'FF158079' } },
    };
  });

  // Totals accumulators
  let totQty = 0;
  let totVal = 0;
  let totComm = 0;
  let totLog = 0;
  let totRet = 0;
  let totPart = 0;
  let totPromo = 0;
  let totOther = 0;
  let totDeduct = 0;
  let totNet = 0;

  // ── DATA ROWS WITH ZEBRA STRIPING & PROFESSIONAL STYLING ───────────
  orders.forEach((order, index) => {
    let dateStr = order.date;
    if (order.rawDate) {
      try {
        dateStr = new Date(order.rawDate).toISOString().slice(0, 10);
      } catch {}
    }

    const productStr =
      order.products?.map((p) => `${p.title} (x${p.quantity})`).join('; ') || 'Ozon Product';

    const q = Number(order.quantity) || 1;
    const v = Number(order.orderValue) || 0;
    const c = Number(order.commission) || 0;
    const l = Number(order.logistics) || 0;
    const r = Number(order.returns) || 0;
    const part = Number(order.partnerServices) || 0;
    const promo = Number(order.promotion) || 0;
    const oth = Number(order.otherCharges) || 0;
    const ded = Number(order.totalDeductions) || 0;
    const net = Number(order.netAmount) || 0;

    totQty += q;
    totVal += v;
    totComm += c;
    totLog += l;
    totRet += r;
    totPart += part;
    totPromo += promo;
    totOther += oth;
    totDeduct += ded;
    totNet += net;

    const rowData = [
      dateStr,
      order.postingNumber,
      order.orderNumber,
      order.accountName,
      productStr,
      q,
      v,
      c,
      l,
      r,
      part,
      promo,
      oth,
      ded,
      net,
      order.status,
      order.clusterFrom,
      order.clusterTo,
    ];

    const row = worksheet.addRow(rowData);
    row.height = 24;

    const isEven = index % 2 === 1;
    const bgArgb = isEven ? 'FFF8FAFC' : 'FFFFFFFF'; // Clean alternating zebra row

    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      cell.font = {
        name: 'Segoe UI',
        size: 9.5,
        color: { argb: 'FF1E293B' },
      };

      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: bgArgb },
      };

      // Alignment rules
      cell.alignment = {
        vertical: 'middle',
        horizontal:
          colNumber === 1 || colNumber === 3 || colNumber === 6 || colNumber === 16
            ? 'center'
            : colNumber >= 7 && colNumber <= 15
            ? 'right'
            : 'left',
        wrapText: colNumber === 5, // Wrap product title cleanly
      };

      // Consolas styling for Posting Number
      if (colNumber === 2) {
        cell.font = { name: 'Consolas', size: 9.5, bold: true, color: { argb: 'FF0C5D58' } };
      }

      // Currency number formatting for financial columns
      if (colNumber >= 7 && colNumber <= 15) {
        cell.numFmt = '"₹"#,##0.00';
      }

      // Highlight Total Deduct (Column 14) in Bold Amber
      if (colNumber === 14) {
        cell.font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FFB45309' } };
      }

      // Highlight Net Payout (Column 15) in Bold Emerald Green
      if (colNumber === 15) {
        cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF047857' } };
      }

      // Subtle light border
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFF1F5F9' } },
        right: { style: 'thin', color: { argb: 'FFF1F5F9' } },
      };
    });
  });

  // ── SUMMARY / TOTAL ROW AT THE BOTTOM (Soft Teal #E8F5F4 with Double Underline) ──
  if (orders.length > 0) {
    const summaryRow = worksheet.addRow([
      `TOTAL: ${orders.length} ORDERS`,
      '',
      '',
      '',
      `TOTAL UNITS: ${totQty}`,
      totQty,
      totVal,
      totComm,
      totLog,
      totRet,
      totPart,
      totPromo,
      totOther,
      totDeduct,
      totNet,
      '',
      '',
      '',
    ]);
    summaryRow.height = 30;

    summaryRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE8F5F4' }, // Soft teal tint matching Image 2
      };
      cell.font = {
        name: 'Segoe UI',
        size: 10.5,
        bold: true,
        color: { argb: 'FF0C5D58' },
      };
      cell.alignment = {
        vertical: 'middle',
        horizontal: colNumber === 1 ? 'left' : colNumber >= 6 && colNumber <= 15 ? 'right' : 'center',
      };

      // Currency formatting on summary numbers
      if (colNumber >= 7 && colNumber <= 15) {
        cell.numFmt = '"₹"#,##0.00';
        if (colNumber === 15) {
          cell.font = { name: 'Segoe UI', size: 11, bold: true, color: { argb: 'FF047857' } };
        }
      }

      // Accounting double underline border matching Image 2
      cell.border = {
        top: { style: 'thin', color: { argb: 'FF10756F' } },
        bottom: { style: 'double', color: { argb: 'FF10756F' } },
      };
    });
  }

  // ── SET AUTO-FITTED COLUMN WIDTHS ───────────────────────────────────
  COL_WIDTHS.forEach((width, index) => {
    worksheet.getColumn(index + 1).width = width;
  });

  return workbook.xlsx.writeBuffer();
}

