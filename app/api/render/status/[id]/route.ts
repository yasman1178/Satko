import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const RENDERS_DIR = '/tmp/mindplicit_renders';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id || !/^rnd_[a-zA-Z0-9_]+$/.test(id)) {
      return NextResponse.json({ error: 'معرّف الرندر غير صالح' }, { status: 400 });
    }

    const renderDir = path.join(RENDERS_DIR, id);
    const statusFile = path.join(renderDir, 'status.json');

    try {
      const data = await fs.readFile(statusFile, 'utf-8');
      const json = JSON.parse(data);
      return NextResponse.json(json);
    } catch {
      return NextResponse.json(
        {
          id,
          status: 'initializing',
          percent: 5,
          statusText: 'جارِ تهيئة مسار الرندر على السيرفر...',
        },
        { status: 200 }
      );
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'خطأ في جلب حالة الرندر' }, { status: 500 });
  }
}
