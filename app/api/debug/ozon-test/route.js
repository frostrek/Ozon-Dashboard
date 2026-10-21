import { NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';

export async function GET() {
    const cid = process.env.OZON_CLIENT_ID;
    const key = process.env.OZON_API_KEY;
    
    const headers = { 'Client-Id': cid, 'Api-Key': key, 'Content-Type': 'application/json' };
    
    const res = await fetch('https://api-seller.ozon.ru/v3/product/info/list', {
        method: 'POST',
        headers,
        body: JSON.stringify({ product_id: [2673469039] })
    });
    
    const rawText = await res.text();
    
    return NextResponse.json({
        client_id: cid,
        api_key_prefix: key?.substring(0, 8),
        http_status: res.status,
        raw_response: rawText.substring(0, 500)
    });
}
