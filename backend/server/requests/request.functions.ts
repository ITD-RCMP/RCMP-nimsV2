import { createServerFn } from '@tanstack/react-start';
import type {
  AssignAssetToRequestInput,
  ChangeBookedAssignmentInput,
  CheckoutUserRequestInput,
  CancelBookedNotTakenInput,
  CancelBookedUnavailableInput,
  MarkRequestSlotNotTakenInput,
  MarkRequestSlotUnavailableInput,
  ReturnUserRequestInput,
  MarkAssetsForRequestInput,
  RemoveAssetFromRequestPoolInput,
  RejectUserRequestInput,
  SubmitUserRequestInput,
} from '@shared/lib/request-schema';
import { requesterMiddleware, staffMiddleware } from '@backend/server/core/auth-middleware';

export const listActiveForRequestPoolFn = createServerFn({ method: 'GET' })
  .middleware([staffMiddleware])
  .handler(async () => {
    const { listActiveForRequestPool } = await import('@backend/server/requests/request-repo.server');
    return listActiveForRequestPool();
  });

export const listRequestPoolAssetsFn = createServerFn({ method: 'GET' })
  .middleware([staffMiddleware])
  .handler(async () => {
    const { listRequestPoolAssets } = await import('@backend/server/requests/request-repo.server');
    return listRequestPoolAssets();
  });

export const listAvailablePoolAssetsFn = createServerFn({ method: 'GET' })
  .middleware([staffMiddleware])
  .handler(async () => {
    const { listAvailablePoolAssets } = await import('@backend/server/requests/request-repo.server');
    return listAvailablePoolAssets();
  });

export const listPendingRequestsFn = createServerFn({ method: 'GET' })
  .middleware([staffMiddleware])
  .handler(async () => {
    const { listPendingRequests } = await import('@backend/server/requests/request-repo.server');
    return listPendingRequests();
  });

export const listRequestLogFn = createServerFn({ method: 'GET' })
  .middleware([staffMiddleware])
  .handler(async () => {
    const { listRequestLog } = await import('@backend/server/requests/request-repo.server');
    return listRequestLog();
  });

export const markAssetsForRequestFn = createServerFn({ method: 'POST' })
  .middleware([staffMiddleware])
  .inputValidator((input: MarkAssetsForRequestInput) => input)
  .handler(async ({ data: input }) => {
    const { markAssetsForRequest } = await import('@backend/server/requests/request-repo.server');
    return markAssetsForRequest(input.assets);
  });

export const removeAssetFromRequestPoolFn = createServerFn({ method: 'POST' })
  .middleware([staffMiddleware])
  .inputValidator((input: RemoveAssetFromRequestPoolInput) => input)
  .handler(async ({ data: input }) => {
    const { removeAssetFromRequestPool } = await import('@backend/server/requests/request-repo.server');
    await removeAssetFromRequestPool(input);
  });

/** Requesters can only ever see their own history — staffId always comes from the session, never the client. */
export const listUserRequestHistoryFn = createServerFn({ method: 'POST' })
  .middleware([requesterMiddleware])
  .handler(async ({ context }) => {
    const { listUserRequestHistory } = await import('@backend/server/requests/request-repo.server');
    return listUserRequestHistory(context.staffId);
  });

export const submitUserRequestFn = createServerFn({ method: 'POST' })
  .middleware([requesterMiddleware])
  .inputValidator((input: SubmitUserRequestInput) => input)
  .handler(async ({ data: input, context }) => {
    const { submitUserRequest } = await import('@backend/server/requests/request-repo.server');
    const result = await submitUserRequest({ ...input, requestedBy: context.staffId });
    const { queueRequestEmail } = await import('@backend/server/email/request-email.server');
    queueRequestEmail(result.requestId);
    return result;
  });

export const bookPoolAssetToRequestFn = createServerFn({ method: 'POST' })
  .middleware([staffMiddleware])
  .inputValidator((input: AssignAssetToRequestInput) => input)
  .handler(async ({ data: input, context }) => {
    const { bookPoolAssetToRequest } = await import('@backend/server/requests/request-repo.server');
    const booked = await bookPoolAssetToRequest({ ...input, assignedBy: context.staffId });
    if (!booked.collectionReady) return booked;
    const { queueRequestReadyEmail } = await import(
      '@backend/server/email/request-ready-email.server'
    );
    queueRequestReadyEmail(input.requestId);
    return booked;
  });

export const changeBookedAssignmentFn = createServerFn({ method: 'POST' })
  .middleware([staffMiddleware])
  .inputValidator((input: ChangeBookedAssignmentInput) => input)
  .handler(async ({ data: input, context }) => {
    const { changeBookedAssignment } = await import('@backend/server/requests/request-repo.server');
    await changeBookedAssignment({ ...input, changedBy: context.staffId });
  });

export const checkoutUserRequestFn = createServerFn({ method: 'POST' })
  .middleware([staffMiddleware])
  .inputValidator((input: CheckoutUserRequestInput) => input)
  .handler(async ({ data: input, context }) => {
    const { checkoutUserRequest } = await import('@backend/server/requests/request-repo.server');
    return checkoutUserRequest({ ...input, checkedOutBy: context.staffId });
  });

export const markRequestSlotUnavailableFn = createServerFn({ method: 'POST' })
  .middleware([staffMiddleware])
  .inputValidator((input: MarkRequestSlotUnavailableInput) => input)
  .handler(async ({ data: input, context }) => {
    const { markRequestSlotUnavailable } = await import('@backend/server/requests/request-repo.server');
    return markRequestSlotUnavailable({ ...input, markedBy: context.staffId });
  });

export const markRequestSlotNotTakenFn = createServerFn({ method: 'POST' })
  .middleware([staffMiddleware])
  .inputValidator((input: MarkRequestSlotNotTakenInput) => input)
  .handler(async ({ data: input, context }) => {
    const { markRequestSlotNotTaken } = await import('@backend/server/requests/request-repo.server');
    return markRequestSlotNotTaken({ ...input, markedBy: context.staffId });
  });

export const cancelBookedAssignmentNotTakenFn = createServerFn({ method: 'POST' })
  .middleware([staffMiddleware])
  .inputValidator((input: CancelBookedNotTakenInput) => input)
  .handler(async ({ data: input, context }) => {
    const { cancelBookedAssignmentNotTaken } = await import('@backend/server/requests/request-repo.server');
    await cancelBookedAssignmentNotTaken({ ...input, cancelledBy: context.staffId });
  });

export const cancelBookedAssignmentUnavailableFn = createServerFn({ method: 'POST' })
  .middleware([staffMiddleware])
  .inputValidator((input: CancelBookedUnavailableInput) => input)
  .handler(async ({ data: input, context }) => {
    const { cancelBookedAssignmentUnavailable } = await import('@backend/server/requests/request-repo.server');
    await cancelBookedAssignmentUnavailable({ ...input, cancelledBy: context.staffId });
  });

export const returnUserRequestFn = createServerFn({ method: 'POST' })
  .middleware([staffMiddleware])
  .inputValidator((input: ReturnUserRequestInput) => input)
  .handler(async ({ data: input, context }) => {
    const { returnUserRequest } = await import('@backend/server/requests/request-repo.server');
    return returnUserRequest({ ...input, returnedBy: context.staffId });
  });

export const rejectUserRequestFn = createServerFn({ method: 'POST' })
  .middleware([staffMiddleware])
  .inputValidator((input: RejectUserRequestInput) => input)
  .handler(async ({ data: input, context }) => {
    const { rejectUserRequest } = await import('@backend/server/requests/request-repo.server');
    await rejectUserRequest({ ...input, rejectedBy: context.staffId });
  });

/** @deprecated Use bookPoolAssetToRequestFn */
export const assignPoolAssetToRequestFn = bookPoolAssetToRequestFn;

/** @deprecated Use bookPoolAssetToRequestFn */
export const assignAssetToRequestFn = bookPoolAssetToRequestFn;

/** @deprecated Use listActiveForRequestPoolFn */
export const listAssignableAssetsFn = listActiveForRequestPoolFn;

/** @deprecated Use listRequestPoolAssetsFn */
export const listRequestAssignedAssetsFn = listRequestPoolAssetsFn;
