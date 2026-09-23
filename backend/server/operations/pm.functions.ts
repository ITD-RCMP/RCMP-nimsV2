import { createServerFn } from '@tanstack/react-start';
import type { CreatePmLogInput, PmLogListFilters, UpdatePmLogAssetsInput } from '@shared/lib/pm-schema';
import { staffMiddleware } from '@backend/server/core/auth-middleware';

export const getPmLocationTreeFn = createServerFn({ method: 'GET' })
  .middleware([staffMiddleware])
  .handler(async () => {
    const { getPmLocationTree } = await import('@backend/server/operations/pm-repo.server');
    return getPmLocationTree();
  });

export const listPmAssetsAtPlaceFn = createServerFn({ method: 'POST' })
  .middleware([staffMiddleware])
  .inputValidator((input: { building: string; level: string; zone: string }) => input)
  .handler(async ({ data: input }) => {
    const { listPmAssetsAtPlace } = await import('@backend/server/operations/pm-repo.server');
    return listPmAssetsAtPlace(input);
  });

export const createPmLogFn = createServerFn({ method: 'POST' })
  .middleware([staffMiddleware])
  .inputValidator((data: CreatePmLogInput) => data)
  .handler(async ({ data, context }) => {
    const { createPmLog } = await import('@backend/server/operations/pm-repo.server');
    return createPmLog({ ...data, performedBy: context.staffId });
  });

export const listPmLogsFn = createServerFn({ method: 'POST' })
  .middleware([staffMiddleware])
  .inputValidator((data: PmLogListFilters) => data)
  .handler(async ({ data }) => {
    const { listPmLogs } = await import('@backend/server/operations/pm-repo.server');
    return listPmLogs(data);
  });

export const listPmLogBuildingsFn = createServerFn({ method: 'GET' })
  .middleware([staffMiddleware])
  .handler(async () => {
    const { listPmLogBuildings } = await import('@backend/server/operations/pm-repo.server');
    return listPmLogBuildings();
  });

export const updatePmLogAssetsFn = createServerFn({ method: 'POST' })
  .middleware([staffMiddleware])
  .inputValidator((data: UpdatePmLogAssetsInput) => data)
  .handler(async ({ data }) => {
    const { updatePmLogAssets } = await import('@backend/server/operations/pm-repo.server');
    return updatePmLogAssets(data);
  });

export const getPmStatsFn = createServerFn({ method: 'GET' })
  .middleware([staffMiddleware])
  .handler(async () => {
    const { getPmStats } = await import('@backend/server/operations/pm-repo.server');
    return getPmStats();
  });
