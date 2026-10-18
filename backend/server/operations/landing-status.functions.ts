import { createServerFn } from '@tanstack/react-start';
import type { LandingSystemStatus } from '@shared/lib/landing-status-types';

function fallbackStatus(message: string): LandingSystemStatus {
  return {
    fetchedAt: new Date().toLocaleString(undefined, {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }),
    rows: [
      {
        key: 'database',
        label: 'Database',
        value: message,
        level: 'error',
      },
    ],
    sampleAssets: [],
  };
}

export const getLandingSystemStatusFn = createServerFn({ method: 'GET' }).handler(async () => {
  try {
    const { getLandingSystemStatus } = await import('@backend/server/operations/landing-status-repo.server');
    return await getLandingSystemStatus();
  } catch {
    return fallbackStatus('System status could not be loaded. Try refreshing the page.');
  }
});
