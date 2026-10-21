import { templateCsv } from '../../../../../lib/ozon/parseProductSheet';

export const dynamic = 'force-dynamic';

export async function GET() {
  return new Response(templateCsv(), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="ozon-product-template.csv"',
    },
  });
}
