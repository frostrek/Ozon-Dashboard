import { buildProductTemplateWorkbook } from '../../../../../lib/ozon/parseProductSheet';

export const dynamic = 'force-dynamic';

export async function GET() {
  const wb = await buildProductTemplateWorkbook();
  const buffer = await wb.xlsx.writeBuffer();

  return new Response(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="ozon-product-template.xlsx"',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  });
}
