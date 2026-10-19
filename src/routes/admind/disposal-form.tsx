import { createFileRoute } from '@tanstack/react-router';
import { DisposalUnitDisposalFormPage } from '@/disposal-unit/disposal-form';

export const Route = createFileRoute('/disposal-unit/disposal-form')({
  validateSearch: (search: Record<string, unknown>): { assets: string } => ({
    assets: typeof search.assets === 'string' ? search.assets : '',
  }),
  head: () => ({
    meta: [
      { title: 'Disposal form | NIMS' },
      { name: 'description', content: 'Complete disposal details before submitting the batch.' },
    ],
  }),
  component: DisposalUnitDisposalFormPage,
});
