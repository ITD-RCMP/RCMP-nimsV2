/**
 * Asset ID format: PPYYSSS, optionally with a tag in parentheses.
 * Example: 1226001, or 1226001 (RMK).
 */
import type { AssetKind } from '@shared/lib/inventory-schema';

export const ASSET_ID_PREFIX = {
  other: 10,
  laptop: 12,
  desktop: 14,
  network: 24,
  av: 88,
} as const;

/** Categories that use prefix 12 (Notebook). Matched case-insensitively. */
export const LAPTOP_NOTEBOOK_CATEGORIES = ['Notebook', 'Notebook standby', 'Leasing Laptop'] as const;

/** Categories that use prefix 14 (Desktop). Matched case-insensitively. */
export const LAPTOP_DESKTOP_CATEGORIES = ['Desktop AIO', 'Desktop IO sharing', 'Leasing Desktop'] as const;

export const LAPTOP_CATEGORY_OTHERS = 'Others';

export const ASSET_ID_SEQUENCE_MIN = 1;
export const ASSET_ID_SEQUENCE_MAX = 999;
export const ASSET_ID_MAX_LENGTH = 32;
export const ASSET_TAG_MAX_LENGTH = 16;

const ASSET_TAG_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const TAGGED_ASSET_ID_PATTERN = /^(\d+) \(([A-Za-z0-9][A-Za-z0-9_-]*)\)$/;
export const STORED_ASSET_ID_PATTERN = /^(\d+)(?: \(([A-Za-z0-9][A-Za-z0-9_-]*)\))?$/;

export function normalizeAssetTag(raw: string | null | undefined): string {
  return (raw ?? '').trim();
}

export function isValidAssetTag(tag: string): boolean {
  return tag.length > 0 && tag.length <= ASSET_TAG_MAX_LENGTH && ASSET_TAG_PATTERN.test(tag);
}

export function assetIdHasTag(assetId: string | number): boolean {
  return TAGGED_ASSET_ID_PATTERN.test(String(assetId).trim());
}

export function composeAssetId(numericId: number | string, tagging?: string | null): string {
  const core = String(numericId).trim();
  const tag = normalizeAssetTag(tagging);
  if (!tag) return core;
  if (!isValidAssetTag(tag)) {
    throw new Error(
      `Tagging must be 1–${ASSET_TAG_MAX_LENGTH} letters, numbers, hyphens, or underscores.`,
    );
  }
  const stored = `${core} (${tag})`;
  if (stored.length > ASSET_ID_MAX_LENGTH) {
    throw new Error(`Asset ID with tagging must be at most ${ASSET_ID_MAX_LENGTH} characters.`);
  }
  return stored;
}

export function assetIdNumericCore(assetId: string | number): number | null {
  const match = String(assetId).trim().match(/^(\d+)/);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

export type AssetIdParts = {
  prefix: number;
  year: number;
  sequence: number;
};

export function normalizeCategory(category: string): string {
  return category.trim().toLowerCase().replace(/\s+/g, ' ');
}

function categoryInList(list: readonly string[], normalizedKey: string): boolean {
  return list.some((c) => normalizeCategory(c) === normalizedKey);
}

export function isNotebookCategory(category: string | null | undefined): boolean {
  if (!category?.trim()) return false;
  return categoryInList(LAPTOP_NOTEBOOK_CATEGORIES, normalizeCategory(category));
}

export function isDesktopCategory(category: string | null | undefined): boolean {
  if (!category?.trim()) return false;
  return categoryInList(LAPTOP_DESKTOP_CATEGORIES, normalizeCategory(category));
}

export const LAPTOP_LEASING_CATEGORIES = ['Leasing Laptop', 'Leasing Desktop'] as const;

export function isLeasingCategory(category: string | null | undefined): boolean {
  if (!category?.trim()) return false;
  return categoryInList(LAPTOP_LEASING_CATEGORIES, normalizeCategory(category));
}

export function isOwnedNotebookCategory(category: string | null | undefined): boolean {
  return isNotebookCategory(category) && !isLeasingCategory(category);
}

export function isOwnedDesktopCategory(category: string | null | undefined): boolean {
  return isDesktopCategory(category) && !isLeasingCategory(category);
}

export function isKnownLaptopCategory(category: string | null | undefined): boolean {
  return isNotebookCategory(category) || isDesktopCategory(category);
}

export function isOtherLaptopCategory(category: string | null | undefined): boolean {
  if (!category?.trim()) return false;
  return !isKnownLaptopCategory(category);
}

export function toTitleCaseCategory(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

export function canonicalizeLaptopCategory(category: string): string {
  const trimmed = category.trim().replace(/\s+/g, ' ');
  if (!trimmed) return '';
  const key = normalizeCategory(trimmed);
  if (key === normalizeCategory(LAPTOP_CATEGORY_OTHERS)) return '';
  const known = LAPTOP_CATEGORY_OPTIONS.find((option) => normalizeCategory(option) === key);
  return known ?? toTitleCaseCategory(trimmed);
}

export function laptopCategorySelectValue(
  category: string,
): (typeof LAPTOP_CATEGORY_OPTIONS)[number] | typeof LAPTOP_CATEGORY_OTHERS {
  const known = LAPTOP_CATEGORY_OPTIONS.find(
    (option) => normalizeCategory(option) === normalizeCategory(category),
  );
  return known ?? LAPTOP_CATEGORY_OTHERS;
}

export type LaptopAssetIdPrefix =
  | typeof ASSET_ID_PREFIX.laptop
  | typeof ASSET_ID_PREFIX.desktop
  | typeof ASSET_ID_PREFIX.other;

export function getLaptopAssetIdPrefix(category: string): LaptopAssetIdPrefix {
  const key = normalizeCategory(category);
  if (!key) {
    throw new Error('Laptop category is required.');
  }
  if (categoryInList(LAPTOP_DESKTOP_CATEGORIES, key)) {
    return ASSET_ID_PREFIX.desktop;
  }
  if (categoryInList(LAPTOP_NOTEBOOK_CATEGORIES, key)) {
    return ASSET_ID_PREFIX.laptop;
  }
  return ASSET_ID_PREFIX.other;
}

export function getAssetIdYearDigits(date: Date = new Date()): number {
  return date.getFullYear() % 100;
}

export function formatAssetId(prefix: number, yearDigits: number, sequence: number): number {
  if (sequence < ASSET_ID_SEQUENCE_MIN || sequence > ASSET_ID_SEQUENCE_MAX) {
    throw new Error(`Sequence must be ${ASSET_ID_SEQUENCE_MIN}–${ASSET_ID_SEQUENCE_MAX}`);
  }
  if (yearDigits < 0 || yearDigits > 99) {
    throw new Error('Year must be two digits (00–99)');
  }
  return prefix * 100_000 + yearDigits * 1_000 + sequence;
}

export function parseAssetId(assetId: number): AssetIdParts {
  const prefix = Math.floor(assetId / 100_000);
  const year = Math.floor((assetId % 100_000) / 1_000);
  const sequence = assetId % 1_000;
  return { prefix, year, sequence };
}

function isNumericAssetId(assetId: string | number): boolean {
  return assetIdNumericCore(assetId) != null && /^\d+/.test(String(assetId).trim());
}

export function compareAssetIdNewestYearFirst(
  a: string | number,
  b: string | number,
  now: Date = new Date(),
): number {
  const aNumeric = isNumericAssetId(a);
  const bNumeric = isNumericAssetId(b);
  if (!aNumeric && !bNumeric) {
    return String(b).localeCompare(String(a), undefined, { numeric: true });
  }
  if (!aNumeric) return 1;
  if (!bNumeric) return -1;
  const currentYear = getAssetIdYearDigits(now);
  const yearA = parseAssetId(assetIdNumericCore(a) ?? 0).year;
  const yearB = parseAssetId(assetIdNumericCore(b) ?? 0).year;
  const aCurrent = yearA === currentYear ? 0 : 1;
  const bCurrent = yearB === currentYear ? 0 : 1;
  if (aCurrent !== bCurrent) return aCurrent - bCurrent;
  if (yearA !== yearB) return yearB - yearA;
  return (assetIdNumericCore(b) ?? 0) - (assetIdNumericCore(a) ?? 0);
}

export function assetIdNewestYearFirstSql(column = 'asset_id'): string {
  const currentYear = getAssetIdYearDigits();
  const yy = String(currentYear).padStart(2, '0');
  const core = `SUBSTRING_INDEX(${column}, ' ', 1)`;
  const numeric = `${core} REGEXP '^[0-9]+$'`;
  const yearDigits = `SUBSTRING(${core}, GREATEST(CAST(LENGTH(${core}) AS SIGNED) - 4, 1), 2)`;
  return `(CASE WHEN ${numeric} THEN 0 ELSE 1 END), (CASE WHEN ${numeric} AND ${yearDigits} = '${yy}' THEN 0 ELSE 1 END), (CASE WHEN ${numeric} THEN ${yearDigits} ELSE '00' END) DESC, ${core} DESC`;
}

export function getAssetIdRange(prefix: number, yearDigits: number): { min: number; max: number } {
  return {
    min: formatAssetId(prefix, yearDigits, ASSET_ID_SEQUENCE_MIN),
    max: formatAssetId(prefix, yearDigits, ASSET_ID_SEQUENCE_MAX),
  };
}

/** Human-readable label (dashes for display only). */
export function formatAssetIdDisplay(assetId: number): string {
  const { prefix, year, sequence } = parseAssetId(assetId);
  return `${prefix}-${String(year).padStart(2, '0')}-${String(sequence).padStart(3, '0')}`;
}

export function getPrefixForKind(
  kind: AssetKind,
  options?: { category?: string },
): number {
  switch (kind) {
    case 'laptop':
      if (!options?.category?.trim()) {
        throw new Error('Laptop asset ID requires a category to choose prefix 12, 14, or 10');
      }
      return getLaptopAssetIdPrefix(options.category);
    case 'network':
      return ASSET_ID_PREFIX.network;
    case 'av':
      return ASSET_ID_PREFIX.av;
  }
}

/** Next sequence after maxId in range, or 1 if none. */
export function nextSequenceAfter(maxId: number | null, prefix: number, yearDigits: number): number {
  const { min } = getAssetIdRange(prefix, yearDigits);
  if (maxId == null || maxId < min) {
    return ASSET_ID_SEQUENCE_MIN;
  }
  const { sequence } = parseAssetId(maxId);
  const next = sequence + 1;
  if (next > ASSET_ID_SEQUENCE_MAX) {
    throw new Error(
      `No asset IDs left for prefix ${prefix} in year ${String(yearDigits).padStart(2, '0')} (max ${ASSET_ID_SEQUENCE_MAX} per year)`,
    );
  }
  return next;
}

export function buildNextAssetId(maxId: number | null, prefix: number, yearDigits: number): number {
  const sequence = nextSequenceAfter(maxId, prefix, yearDigits);
  return formatAssetId(prefix, yearDigits, sequence);
}

/** Allocate count sequential IDs after maxId (same prefix/year). */
export function buildSequentialAssetIds(
  maxId: number | null,
  prefix: number,
  yearDigits: number,
  count: number,
): number[] {
  const ids: number[] = [];
  let currentMax = maxId;
  for (let i = 0; i < count; i++) {
    const id = buildNextAssetId(currentMax, prefix, yearDigits);
    ids.push(id);
    currentMax = id;
  }
  return ids;
}

export const LAPTOP_CATEGORY_OPTIONS = [
  ...LAPTOP_NOTEBOOK_CATEGORIES,
  ...LAPTOP_DESKTOP_CATEGORIES,
] as const;

export const LAPTOP_CATEGORY_SELECT_OPTIONS = [
  ...LAPTOP_CATEGORY_OPTIONS,
  LAPTOP_CATEGORY_OTHERS,
] as const;

