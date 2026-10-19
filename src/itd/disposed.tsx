import { Link } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DisposedHistoryList } from '@/disposal/disposed-history-list';
import { TechnicianDisposalViewMenu } from '@/technician/disposal-view-menu';
import { TechnicianShell } from '@/technician/technician-shell';

export function TechnicianDisposedPage() {
  return (
    <TechnicianShell>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Button variant="ghost" size="sm" type="button" className="-ml-2 mb-2 gap-1.5" asChild>
            <Link to="/technician/disposal">
              <ArrowLeft className="h-4 w-4" />
              Back to disposal
            </Link>
          </Button>
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Disposed assets</h1>
        </div>
        <TechnicianDisposalViewMenu />
      </div>
      <DisposedHistoryList viewer="technician" />
    </TechnicianShell>
  );
}
