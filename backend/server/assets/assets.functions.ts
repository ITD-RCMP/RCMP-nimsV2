import { createServerFn } from '@tanstack/react-start';
import type {
  AssetId,
  AssetKind,
  CreateAvInput,
  CreateLaptopInput,
  CreateNetworkInput,
  UpdateAssetInput,
} from '@shared/lib/inventory-schema';
import type {
  MarkAssetsPredisposedInput,
  RemoveAssetsFromPredisposalInput,
  RemovePredisposedPicturesInput,
  SubmitDisposalBatchInput,
  UploadPredisposedPictureInput,
} from '@shared/lib/disposal-schema';
import type { NextAssetIdRequest } from '@backend/server/assets/asset-id.server';
import type {
  BulkAvImportRow,
  BulkLaptopImportRow,
  BulkNetworkImportRow,
} from '@backend/server/assets/assets-repo.server';
import { adminMiddleware, disposalUnitMiddleware, staffMiddleware } from '@backend/server/core/auth-middleware';

export const listAssetsFn = createServerFn({ method: 'GET' })
  .middleware([staffMiddleware])
  .inputValidator((kind: AssetKind) => kind)
  .handler(async ({ data: kind }) => {
    const { listAssets } = await import('@backend/server/assets/assets-repo.server');
    return listAssets(kind);
  });

export const createLaptopFn = createServerFn({ method: 'POST' })
  .middleware([staffMiddleware])
  .inputValidator((input: CreateLaptopInput) => input)
  .handler(async ({ data: input }) => {
    const { getSessionUser } = await import('@backend/server/auth/session.server');
    const session = await getSessionUser();
    const { createLaptop } = await import('@backend/server/assets/assets-repo.server');
    return createLaptop(input, session?.fullName?.trim() || session?.email || null);
  });

export const createAvFn = createServerFn({ method: 'POST' })
  .middleware([staffMiddleware])
  .inputValidator((input: CreateAvInput) => input)
  .handler(async ({ data: input }) => {
    const { createAv } = await import('@backend/server/assets/assets-repo.server');
    return createAv(input);
  });

export const createNetworkFn = createServerFn({ method: 'POST' })
  .middleware([staffMiddleware])
  .inputValidator((input: CreateNetworkInput) => input)
  .handler(async ({ data: input }) => {
    const { createNetwork } = await import('@backend/server/assets/assets-repo.server');
    return createNetwork(input);
  });

export const getNextAssetIdFn = createServerFn({ method: 'GET' })
  .middleware([staffMiddleware])
  .inputValidator((input: NextAssetIdRequest) => input)
  .handler(async ({ data: input }) => {
    const { getNextAssetIdFromDb } = await import('@backend/server/assets/asset-id.server');
    return getNextAssetIdFromDb(input);
  });

export const bulkCreateLaptopsImportFn = createServerFn({ method: 'POST' })
  .middleware([staffMiddleware])
  .inputValidator((rows: BulkLaptopImportRow[]) => rows)
  .handler(async ({ data: rows }) => {
    const { getSessionUser } = await import('@backend/server/auth/session.server');
    const session = await getSessionUser();
    const { bulkCreateLaptopsWithGeneratedIds } = await import('@backend/server/assets/assets-repo.server');
    return bulkCreateLaptopsWithGeneratedIds(rows, session?.fullName?.trim() || session?.email || null);
  });

export const bulkCreateAvImportFn = createServerFn({ method: 'POST' })
  .middleware([staffMiddleware])
  .inputValidator((rows: BulkAvImportRow[]) => rows)
  .handler(async ({ data: rows }) => {
    const { bulkCreateAvWithGeneratedIds } = await import('@backend/server/assets/assets-repo.server');
    return bulkCreateAvWithGeneratedIds(rows);
  });

export const bulkCreateNetworkImportFn = createServerFn({ method: 'POST' })
  .middleware([staffMiddleware])
  .inputValidator((rows: BulkNetworkImportRow[]) => rows)
  .handler(async ({ data: rows }) => {
    const { bulkCreateNetworkWithGeneratedIds } = await import('@backend/server/assets/assets-repo.server');
    return bulkCreateNetworkWithGeneratedIds(rows);
  });

export type UpdateAssetStatusInput = {
  kind: AssetKind;
  assetId: AssetId;
  statusId: number;
};

export const updateAssetStatusFn = createServerFn({ method: 'POST' })
  .middleware([staffMiddleware])
  .inputValidator((input: UpdateAssetStatusInput) => input)
  .handler(async ({ data: input }) => {
    const { updateAssetStatus } = await import('@backend/server/assets/assets-repo.server');
    return updateAssetStatus(input.kind, input.assetId, input.statusId);
  });

export const updateAssetFn = createServerFn({ method: 'POST' })
  .middleware([staffMiddleware])
  .inputValidator((input: UpdateAssetInput) => input)
  .handler(async ({ data: input }) => {
    const { updateAssetDetails } = await import('@backend/server/assets/assets-repo.server');
    return updateAssetDetails(input);
  });

export type GetAssetDetailInput = { kind: AssetKind; assetId: AssetId };

export const getAssetDetailFn = createServerFn({ method: 'GET' })
  .middleware([staffMiddleware])
  .inputValidator((input: GetAssetDetailInput) => input)
  .handler(async ({ data: input }) => {
    const { getAssetDetail } = await import('@backend/server/assets/assets-repo.server');
    return getAssetDetail(input.kind, input.assetId);
  });

/**
 * Resolves an asset by scanned/typed code — tries the current asset ID first, then falls back to
 * AV's legacy `asset_id_old` label. Used by the barcode/manual asset lookup.
 */
export const findAssetByCodeFn = createServerFn({ method: 'GET' })
  .middleware([staffMiddleware])
  .inputValidator((code: string) => code)
  .handler(async ({ data: code }) => {
    const { findAssetByCode } = await import('@backend/server/assets/assets-repo.server');
    return findAssetByCode(code);
  });

export const listPredisposalEligibleAssetsFn = createServerFn({ method: 'GET' })
  .middleware([staffMiddleware])
  .handler(async () => {
    const { listPredisposalEligibleAssets } = await import('@backend/server/assets/assets-repo.server');
    return listPredisposalEligibleAssets();
  });

export const listPreDisposedAssetsFn = createServerFn({ method: 'GET' })
  .middleware([staffMiddleware])
  .handler(async () => {
    const { listPreDisposedAssets } = await import('@backend/server/assets/assets-repo.server');
    return listPreDisposedAssets();
  });

export const listDisposalQueueAssetsFn = createServerFn({ method: 'GET' })
  .middleware([disposalUnitMiddleware])
  .handler(async () => {
    const { listPreDisposedAssets } = await import('@backend/server/assets/assets-repo.server');
    return listPreDisposedAssets();
  });

export const getDisposalDashboardStatsFn = createServerFn({ method: 'GET' })
  .middleware([disposalUnitMiddleware])
  .handler(async () => {
    const { getDisposalDashboardStats } = await import('@backend/server/assets/assets-repo.server');
    return getDisposalDashboardStats();
  });

export const markAssetsPredisposedFn = createServerFn({ method: 'POST' })
  .middleware([staffMiddleware])
  .inputValidator((input: MarkAssetsPredisposedInput) => input)
  .handler(async ({ data: input, context }) => {
    const { markAssetsPredisposed } = await import('@backend/server/assets/assets-repo.server');
    return markAssetsPredisposed(input.assets, context.staffId);
  });

export const removeAssetsFromPredisposalFn = createServerFn({ method: 'POST' })
  .middleware([staffMiddleware])
  .inputValidator((input: RemoveAssetsFromPredisposalInput) => input)
  .handler(async ({ data: input, context }) => {
    const { removeAssetsFromPredisposal } = await import('@backend/server/assets/assets-repo.server');
    return removeAssetsFromPredisposal(input.assets, context.staffId);
  });

export const peekNextDisposalBatchFn = createServerFn({ method: 'GET' })
  .middleware([disposalUnitMiddleware])
  .handler(async () => {
    const { peekNextDisposalBatch } = await import('@backend/server/assets/disposal-repo.server');
    return peekNextDisposalBatch();
  });

export const submitDisposalBatchFn = createServerFn({ method: 'POST' })
  .middleware([disposalUnitMiddleware])
  .inputValidator((input: SubmitDisposalBatchInput) => input)
  .handler(async ({ data: input, context }) => {
    const { submitDisposalBatch } = await import('@backend/server/assets/disposal-repo.server');
    return submitDisposalBatch(input, context.staffId);
  });

export const listDisposalHistoryFn = createServerFn({ method: 'GET' })
  .middleware([disposalUnitMiddleware])
  .handler(async () => {
    const { listDisposalHistory } = await import('@backend/server/assets/disposal-repo.server');
    return listDisposalHistory();
  });

export const listStaffDisposalHistoryFn = createServerFn({ method: 'GET' })
  .middleware([staffMiddleware])
  .handler(async () => {
    const { listDisposalHistory } = await import('@backend/server/assets/disposal-repo.server');
    return listDisposalHistory();
  });

export const listAdminDisposalHistoryFn = createServerFn({ method: 'GET' })
  .middleware([adminMiddleware])
  .handler(async () => {
    const { listDisposalHistory } = await import('@backend/server/assets/disposal-repo.server');
    return listDisposalHistory();
  });

export const getDisposalReportFn = createServerFn({ method: 'GET' })
  .middleware([disposalUnitMiddleware])
  .inputValidator((noRujukanPelupusan: string) => noRujukanPelupusan)
  .handler(async ({ data: noRujukanPelupusan }) => {
    const { getDisposalReport } = await import('@backend/server/assets/disposal-repo.server');
    return getDisposalReport(noRujukanPelupusan);
  });

export const uploadPredisposedPictureFn = createServerFn({ method: 'POST' })
  .middleware([staffMiddleware])
  .inputValidator((input: UploadPredisposedPictureInput) => input)
  .handler(async ({ data: input }) => {
    const { savePredisposedPicture } = await import('@backend/server/assets/predisposed-picture.server');
    return savePredisposedPicture(input);
  });

export const removePredisposedPicturesFn = createServerFn({ method: 'POST' })
  .middleware([staffMiddleware])
  .inputValidator((input: RemovePredisposedPicturesInput) => input)
  .handler(async ({ data: input }) => {
    const {
      removePredisposedPictureSlot,
      removePredisposedPictures,
    } = await import('@backend/server/assets/predisposed-picture.server');
    if (input.slot) {
      await removePredisposedPictureSlot(input.kind, input.assetId, input.slot);
      return;
    }
    await removePredisposedPictures(input);
  });
