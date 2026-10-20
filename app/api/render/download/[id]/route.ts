import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import { createReadStream, statSync } from 'fs';
import path from 'path';
import { Readable } from 'stream';

export const dynamic = 'force-dynamic';

const RENDERS_DIR = '/tmp/mindplicit_renders';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id || !/^rnd_[a-zA-Z0-9_]+$/.test(id)) {
      return new NextResponse('معرّف الرندر غير صالح', { status: 400 });
    }

    const filePath = path.join(RENDERS_DIR, id, 'output.mp4');

    try {
      const stats = statSync(filePath);
      const fileSize = stats.size;
      const range = req.headers.get('range');

      // Check for Range request (needed by Safari, iOS, Chrome seeking)
      if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

        if (start >= fileSize || end >= fileSize) {
          return new NextResponse('Requested range not satisfiable', {
            status: 416,
            headers: { 'Content-Range': `bytes */${fileSize}` },
          });
        }

        const chunksize = end - start + 1;
        const nodeStream = createReadStream(filePath, { start, end });
        const webStream = Readable.toWeb(nodeStream) as ReadableStream;

        return new NextResponse(webStream, {
          status: 206,
          headers: {
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunksize.toString(),
            'Content-Type': 'video/mp4',
            'Cache-Control': 'public, max-age=3600',
          },
        });
      }

      // Full file download
      const nodeStream = createReadStream(filePath);
      const webStream = Readable.toWeb(nodeStream) as ReadableStream;

      return new NextResponse(webStream, {
        status: 200,
        headers: {
          'Content-Length': fileSize.toString(),
          'Content-Type': 'video/mp4',
          'Content-Disposition': `attachment; filename="Mindplicit_Video_${id}.mp4"`,
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'public, max-age=3600',
        },
      });
    } catch {
      return new NextResponse('الملف غير موجود أو لم يكتمل الرندر بعد', { status: 404 });
    }
  } catch (err: any) {
    console.error('Download route error:', err);
    return new NextResponse('خطأ في تنزيل ملف الفيديو', { status: 500 });
  }
}
