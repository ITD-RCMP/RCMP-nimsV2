import { Link } from '@tanstack/react-router';
import { ChevronDown, Eye, ScrollText, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function RequestToolbarActions() {
  return (
    <div className="flex shrink-0 flex-wrap gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" type="button" className="gap-1.5 rounded-[8px]">
            <UserPlus className="h-4 w-4" />
            <span className="hidden sm:inline">Assets</span>
            <ChevronDown className="h-3.5 w-3.5 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link to="/technician/request-assets">
              <UserPlus className="h-4 w-4" />
              Assign assets
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link to="/technician/request-view">
              <Eye className="h-4 w-4" />
              View assigned assets
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Button variant="outline" size="sm" className="gap-1.5 rounded-[8px]" asChild>
        <Link to="/technician/request-log">
          <ScrollText className="h-4 w-4" />
          Request log
        </Link>
      </Button>
    </div>
  );
}
