import { mkdir, readdir, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { AssetKind } from '@shared/lib/inventory-schema';
import type {
  PreDisposedAsset,
  PredisposedPictureSlot,
  RemovePredisposedPicturesInput,
  UploadPredisposedPictureInput,
  UploadPredisposedPictureResult,
} from '@shared/lib/disposal-schema';
import { malaysiaTodayIso } from '@shared/lib/disposal-schema';
import { getSessionUser, webSessionEndResponse } from '@backend/server/auth/session.server';
import { isDisposalUnitUser, isStaffRole } from '@shared/lib/auth-session';

const UPLOAD_ROOT = path.join(process.cwd(), 'upload');
const YEAR_RE = /^\d{4}$/;
const KIND_RE = /^(laptop|av|network)$/;
const ASSET_RE = /^[A-Za-z0-9._-]{1,64}$/;
const FILE_RE = /^(whole|serial)\.(jpg|jpeg|png|webp)$/i;
const MAX_BYTES = 4 * 1024 * 1024;
const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

async function assertStaffSession() {
  const session = await getSessionUser();
  if (!session || !isStaffRole(session.roleId)) {
    throw new Error('Technician access is required.');
  }
}

async function assertCanViewPictures() {
  const session = await getSessionUser();
  if (!session || (!isStaffRole(session.roleId) && !isDisposalUnitUser(session.roleId, session.departmentId ?? null))) {
    throw new Error('Technician access is required.');
  }
}

function safeAssetId(assetId: string): string {
  const cleaned = assetId.trim().replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '');
  if (!cleaned) throw new Error('This asset ID cannot be used for an image file name.');
  return cleaned.slice(0, 64);
}

function assertKind(kind: string): AssetKind {
  if (kind !== 'laptop' && kind !== 'av' && kind !== 'network') {
    throw new Error('Unknown asset type.');
  }
  return kind;
}

function currentYear(): string {
  return malaysiaTodayIso().slice(0, 4);
}

function assetDir(year: string, assetId: string): string {
  return path.join(UPLOAD_ROOT, year, 'dispose', 'picture', assetId);
}

function legacyDir(kind: AssetKind, assetId: string): string {
  return path.join(UPLOAD_ROOT, 'picture', kind, assetId);
}

function publicUrl(year: string, assetId: string, fileName: string): string {
  return `/upload/${year}/dispose/picture/${assetId}/${fileName}`;
}

function legacyPublicUrl(kind: AssetKind, assetId: string, fileName: string): string {
  return `/upload/picture/${kind}/${assetId}/${fileName}`;
}

async function listYears(): Promise<string[]> {
  let names: string[];
  try {
    names = await readdir(UPLOAD_ROOT);
  } catch {
    return [];
  }
  return names.filter((name) => YEAR_RE.test(name)).sort((a, b) => b.localeCompare(a));
}

async function findSlotFile(dir: string, slot: PredisposedPictureSlot): Promise<string | null> {
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return null;
  }
  const match = names.find((name) => name.toLowerCase().startsWith(`${slot}.`));
  return match ?? null;
}

async function locateSlot(
  kind: AssetKind,
  assetId: string,
  slot: PredisposedPictureSlot,
): Promise<string | null> {
  for (const year of await listYears()) {
    const file = await findSlotFile(assetDir(year, assetId), slot);
    if (file) return publicUrl(year, assetId, file);
  }
  const legacy = await findSlotFile(legacyDir(kind, assetId), slot);
  return legacy ? legacyPublicUrl(kind, assetId, legacy) : null;
}

async function clearSlot(kind: AssetKind, assetId: string, slot: PredisposedPictureSlot): Promise<void> {
  const dirs = [...(await listYears()).map((year) => assetDir(year, assetId)), legacyDir(kind, assetId)];
  await Promise.all(
    dirs.map(async (dir) => {
      const existing = await findSlotFile(dir, slot);
      if (existing) await unlink(path.join(dir, existing)).catch(() => {});
    }),
  );
}

function imageResponse(fileName: string, data: Buffer): Response {
  const ext = path.extname(fileName).toLowerCase();
  const contentType = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
  return new Response(new Uint8Array(data), {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'private, max-age=86400',
    },
  });
}

async function authorizePictureView(): Promise<Response | null> {
  try {
    await assertCanViewPictures();
    return null;
  } catch (error) {
    return webSessionEndResponse(error) ?? new Response('Unauthorized', { status: 401 });
  }
}

export async function readPredisposedPictures(
  kind: AssetKind,
  assetId: string | number,
): Promise<{ imageWholeAsset: string | null; imageSerialNumber: string | null }> {
  const id = safeAssetId(String(assetId));
  const [imageWholeAsset, imageSerialNumber] = await Promise.all([
    locateSlot(kind, id, 'whole'),
    locateSlot(kind, id, 'serial'),
  ]);
  return { imageWholeAsset, imageSerialNumber };
}

export async function attachPredisposedPictures(rows: PreDisposedAsset[]): Promise<PreDisposedAsset[]> {
  return Promise.all(
    rows.map(async (row) => {
      const pictures = await readPredisposedPictures(row.kind, row.assetId);
      return { ...row, ...pictures };
    }),
  );
}

export async function savePredisposedPicture(
  input: UploadPredisposedPictureInput,
): Promise<UploadPredisposedPictureResult> {
  await assertStaffSession();
  const kind = assertKind(input.kind);
  if (input.slot !== 'whole' && input.slot !== 'serial') {
    throw new Error('Choose a whole-asset or serial-number photo.');
  }
  const ext = MIME_EXT[input.mimeType];
  if (!ext) {
    throw new Error('Use a JPEG, PNG, or WebP image.');
  }
  const raw = input.dataBase64.replace(/\s/g, '');
  let buffer: Buffer;
  try {
    buffer = Buffer.from(raw, 'base64');
  } catch {
    throw new Error('This image could not be read.');
  }
  if (!buffer.length) {
    throw new Error('This image is empty.');
  }
  if (buffer.length > MAX_BYTES) {
    throw new Error('This image is too large. Use a photo under 4 MB.');
  }
  const id = safeAssetId(String(input.assetId));
  const year = currentYear();
  const dir = assetDir(year, id);
  await clearSlot(kind, id, input.slot);
  await mkdir(dir, { recursive: true });
  const fileName = `${input.slot}.${ext}`;
  await writeFile(path.join(dir, fileName), buffer);
  return {
    url: publicUrl(year, id, fileName),
    path: `upload/${year}/dispose/picture/${id}/${fileName}`,
  };
}

export async function removePredisposedPictures(input: RemovePredisposedPicturesInput): Promise<void> {
  await assertStaffSession();
  const kind = assertKind(input.kind);
  const id = safeAssetId(String(input.assetId));
  const years = await listYears();
  await Promise.all([
    ...years.map((year) => rm(assetDir(year, id), { recursive: true, force: true })),
    rm(legacyDir(kind, id), { recursive: true, force: true }),
  ]);
}

export async function removePredisposedPictureSlot(
  kind: AssetKind,
  assetId: string | number,
  slot: PredisposedPictureSlot,
): Promise<void> {
  await assertStaffSession();
  const safeKind = assertKind(kind);
  const id = safeAssetId(String(assetId));
  await clearSlot(safeKind, id, slot);
}

export async function serveDisposalAssetPicture(
  year: string,
  assetId: string,
  fileName: string,
): Promise<Response> {
  const denied = await authorizePictureView();
  if (denied) return denied;
  const safeYear = path.basename(year);
  const safeId = path.basename(assetId);
  const safeFile = path.basename(fileName);
  if (!YEAR_RE.test(safeYear) || !ASSET_RE.test(safeId) || !FILE_RE.test(safeFile)) {
    return new Response('Not found', { status: 404 });
  }
  try {
    const data = await readFile(path.join(assetDir(safeYear, safeId), safeFile));
    return imageResponse(safeFile, data);
  } catch {
    return new Response('Not found', { status: 404 });
  }
}

export async function servePredisposedPicture(
  kind: string,
  assetId: string,
  fileName: string,
): Promise<Response> {
  const denied = await authorizePictureView();
  if (denied) return denied;
  const safeKind = path.basename(kind);
  const safeId = path.basename(assetId);
  const safeFile = path.basename(fileName);
  if (!KIND_RE.test(safeKind) || !ASSET_RE.test(safeId) || !FILE_RE.test(safeFile)) {
    return new Response('Not found', { status: 404 });
  }
  try {
    const data = await readFile(path.join(legacyDir(safeKind as AssetKind, safeId), safeFile));
    return imageResponse(safeFile, data);
  } catch {
    return new Response('Not found', { status: 404 });
  }
}
