import { toolDefinition } from '@tanstack/ai';
import { z } from 'zod/v4';
import {
  getAssetStatusReference,
  loadExpiringWarranties,
  loadOpenRepairs,
  loadOverdueReturns,
  lookupAssetsForPrompt,
  lookupRequestForPrompt,
  summarizeInventory,
  summarizeRequestStats,
} from '@backend/server/admin/admin-prompt-context-repo.server';

const calendarInputSchema = z.object({
  year: z.number().int().optional().describe('Calendar year. Defaults to the current year.'),
  month: z.number().int().min(1).max(12).optional().describe('Month 1-12. Defaults to the current month.'),
});

const statusCountSchema = z.object({
  status: z.string(),
  count: z.number(),
});

const inventoryKindSchema = z.object({
  kind: z.string(),
  inStore: z.number(),
  deployed: z.number(),
  total: z.number(),
  registeredTotal: z.number(),
  byStatus: z.array(statusCountSchema),
});

const workflowCountSchema = z.object({
  status: z.string(),
  count: z.number(),
});

const poolKindSchema = z.object({
  kind: z.string(),
  count: z.number(),
});

const recentRequestSchema = z.object({
  requestId: z.number(),
  requesterName: z.string(),
  programType: z.string(),
  borrowDate: z.string(),
  returnDate: z.string(),
  createdAt: z.string(),
});

const overdueRowSchema = z.object({
  requestId: z.number(),
  requesterOid: z.string().nullable(),
  requesterName: z.string(),
  returnDate: z.string(),
  assetsOut: z.number(),
  daysOverdue: z.number(),
});

const assetMatchSchema = z.object({
  assetId: z.union([z.string(), z.number()]),
  kind: z.string(),
  serialNum: z.string().nullable(),
  status: z.string(),
  brand: z.string().nullable(),
  model: z.string().nullable(),
  locationOrHandover: z.string().nullable(),
  macAddress: z.string().nullable(),
});

const requestItemSchema = z.object({
  assetType: z.string(),
  quantity: z.number(),
});

const requestAssignmentSchema = z.object({
  assetId: z.number().nullable(),
  kind: z.string().nullable(),
  brand: z.string().nullable(),
  model: z.string().nullable(),
  bookedAt: z.string().nullable(),
  checkoutAt: z.string().nullable(),
  returnedAt: z.string().nullable(),
  returnCondition: z.string().nullable(),
});

const requestSummarySchema = z.object({
  requestId: z.number(),
  requesterOid: z.string().nullable(),
  requesterName: z.string(),
  programType: z.string(),
  usageLocation: z.string(),
  borrowDate: z.string(),
  returnDate: z.string(),
  remarks: z.string().nullable(),
  createdAt: z.string(),
  workflowStatus: z.string(),
  items: z.array(requestItemSchema),
  assignments: z.array(requestAssignmentSchema),
});

const repairRowSchema = z.object({
  assetId: z.number(),
  kind: z.string(),
  brand: z.string().nullable(),
  model: z.string().nullable(),
  repairDate: z.string(),
  issueSummary: z.string(),
});

const warrantyRowSchema = z.object({
  assetId: z.number(),
  kind: z.string(),
  brand: z.string().nullable(),
  model: z.string().nullable(),
  warrantyEnds: z.string(),
});

function resolveCalendar(input?: { year?: number; month?: number }) {
  const now = new Date();
  return {
    year: input?.year ?? now.getFullYear(),
    month: input?.month ?? now.getMonth() + 1,
  };
}

export function createAdminPromptServerTools() {
  const getInventorySummary = toolDefinition({
    name: 'getInventorySummary',
    description:
      'Get current inventory counts by asset kind and status (in store, deployed, and each status label).',
    inputSchema: calendarInputSchema,
    outputSchema: z.object({
      year: z.number(),
      month: z.number(),
      inventory: z.array(inventoryKindSchema),
    }),
  }).server(async (input) => {
    const calendar = resolveCalendar(input);
    const { getTechnicianDashboard } = await import('@backend/server/operations/dashboard-repo.server');
    const dashboard = await getTechnicianDashboard(calendar);
    return {
      year: calendar.year,
      month: calendar.month,
      inventory: summarizeInventory(dashboard.stats),
    };
  });

  const getRequestSummary = toolDefinition({
    name: 'getRequestSummary',
    description:
      'Get active request totals by workflow, request-pool availability by kind, and a few recent request highlights.',
    inputSchema: calendarInputSchema,
    outputSchema: z.object({
      monthLabel: z.string(),
      activeTotal: z.number(),
      byWorkflow: z.array(workflowCountSchema),
      poolAvailableByKind: z.array(poolKindSchema),
      requestPoolTotal: z.number(),
      recentRequests: z.array(recentRequestSchema),
    }),
  }).server(async (input) => {
    const calendar = resolveCalendar(input);
    const [{ getTechnicianDashboard }, { getAdminRequestInsights }] = await Promise.all([
      import('@backend/server/operations/dashboard-repo.server'),
      import('@backend/server/admin/admin-request-insights-repo.server'),
    ]);
    const [dashboard, insights] = await Promise.all([
      getTechnicianDashboard(calendar),
      getAdminRequestInsights(calendar),
    ]);
    return {
      monthLabel: insights.monthLabel,
      ...summarizeRequestStats(dashboard.stats),
      recentRequests: insights.recentRequests.slice(0, 5),
    };
  });

  const listOverdueReturns = toolDefinition({
    name: 'listOverdueReturns',
    description: 'List requests that are past their return date with assets still checked out.',
    inputSchema: z.object({
      limit: z.number().int().min(1).max(20).optional().describe('Max rows. Default 10, max 20.'),
    }),
    outputSchema: z.object({
      overdue: z.array(overdueRowSchema),
    }),
  }).server(async (input) => ({
    overdue: await loadOverdueReturns(input.limit),
  }));

  const lookupAsset = toolDefinition({
    name: 'lookupAsset',
    description: 'Look up assets by asset id, serial number, or MAC address. Returns a short summary of matches.',
    inputSchema: z.object({
      query: z.string().min(1).describe('Asset id, serial number, or MAC address.'),
    }),
    outputSchema: z.object({
      query: z.string(),
      matches: z.array(assetMatchSchema),
      notFound: z.boolean(),
    }),
  }).server(async (input) => lookupAssetsForPrompt(input.query, 10));

  const lookupRequest = toolDefinition({
    name: 'lookupRequest',
    description: 'Look up one request by id, including borrow/return dates, status, and assigned assets.',
    inputSchema: z.object({
      requestId: z.union([z.number().int(), z.string()]).describe('Request id number, or digits as a string.'),
    }),
    outputSchema: z.object({
      requestId: z.union([z.number(), z.string()]),
      found: z.boolean(),
      request: requestSummarySchema.nullable(),
    }),
  }).server(async (input) => lookupRequestForPrompt(input.requestId));

  const listOpenRepairs = toolDefinition({
    name: 'listOpenRepairs',
    description: 'List open (incomplete) repairs. Optionally filter by asset kind or asset id.',
    inputSchema: z.object({
      limit: z.number().int().min(1).max(15).optional(),
      assetKind: z.enum(['laptop', 'av', 'network']).optional(),
      assetId: z.number().int().optional(),
    }),
    outputSchema: z.object({
      repairs: z.array(repairRowSchema),
    }),
  }).server(async (input) => ({
    repairs: await loadOpenRepairs({
      limit: input.limit,
      assetKind: input.assetKind,
      assetId: input.assetId,
    }),
  }));

  const listExpiringWarranties = toolDefinition({
    name: 'listExpiringWarranties',
    description: 'List warranties that expire within a given number of days from today.',
    inputSchema: z.object({
      withinDays: z.number().int().min(1).max(365).optional().describe('Look-ahead window. Default 90.'),
      limit: z.number().int().min(1).max(15).optional(),
    }),
    outputSchema: z.object({
      warranties: z.array(warrantyRowSchema),
    }),
  }).server(async (input) => ({
    warranties: await loadExpiringWarranties({
      withinDays: input.withinDays,
      limit: input.limit,
    }),
  }));

  const getStatusReference = toolDefinition({
    name: 'getStatusReference',
    description: 'Get plain-language meanings for asset status ids. Request workflow statuses are separate.',
    inputSchema: z.object({}),
    outputSchema: z.object({
      note: z.string(),
      statuses: z.array(
        z.object({
          statusId: z.number(),
          meaning: z.string(),
        }),
      ),
    }),
  }).server(async () => getAssetStatusReference());

  return [
    getInventorySummary,
    getRequestSummary,
    listOverdueReturns,
    lookupAsset,
    lookupRequest,
    listOpenRepairs,
    listExpiringWarranties,
    getStatusReference,
  ];
}
