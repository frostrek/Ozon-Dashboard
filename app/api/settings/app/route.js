import { NextResponse } from 'next/server';
import { getAppSetting, publicAppSetting, updateAppSetting } from '../../../../lib/settings/appSettings';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const row = await getAppSetting();
    return NextResponse.json(publicAppSetting(row));
  } catch (error) {
    console.error('[settings/app] read failed');
    return NextResponse.json({ error: 'Could not load settings.' }, { status: 500 });
  }
}

export async function PATCH(req) {
  try {
    const body = await req.json();
    const row = await updateAppSetting(body || {});
    return NextResponse.json(publicAppSetting(row));
  } catch (error) {
    const status = error.status || 500;
    if (status === 400) {
      return NextResponse.json({ error: error.message }, { status });
    }
    console.error('[settings/app] save failed');
    return NextResponse.json({ error: 'Could not save settings.' }, { status: 500 });
  }
}
