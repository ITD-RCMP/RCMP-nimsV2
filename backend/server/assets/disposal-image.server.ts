import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { isDisposalUnitRole } from '@shared/lib/auth-session';
import { getSessionUser } from '@backend/server/auth/session.server';

const UPLOAD_ROOT = path.join(process.cwd(), 'upload', 'dispose');
const YEAR_RE = /^\d{4}$/;
const BATCH_RE = /^batch-\d+$/;
const FILE_RE = /^(whole|serial)-[A-Za-z0-9._-]{1,64}\.(jpg|jpeg|png|webp)$/i;

function assertDisposalUnitSession() {
  return getSessionUser().then((session) => {
    if (!session || !isDisposalUnitRole(session.roleId)) {
      throw new Error('Disposal unit access is required.');
    }
  });
}

export async function serveDisposalImage(year: string, batch: string, fileName: string): Promise<Response> {
  try {
    await assertDisposalUnitSession();
  } catch {
    return new Response('Unauthorized', { status: 401 });
  }
  const safeYear = path.basename(year);
  const safeBatch = path.basename(batch);
  const safeFile = path.basename(fileName);
  if (!YEAR_RE.test(safeYear) || !BATCH_RE.test(safeBatch) || !FILE_RE.test(safeFile)) {
    return new Response('Not found', { status: 404 });
  }
  try {
    const filePath = path.join(UPLOAD_ROOT, safeYear, safeBatch, safeFile);
    const data = await readFile(filePath);
    const ext = path.extname(safeFile).toLowerCase();
    const contentType =
      ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
    return new Response(data, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'private, max-age=86400',
      },
    });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}
