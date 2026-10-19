import { Link } from '@tanstack/react-router';
import { ChevronDown, List, Recycle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function TechnicianDisposalViewMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" type="button" className="shrink-0 gap-1.5 rounded-[8px]">
          <List className="h-4 w-4" />
          View
          <ChevronDown className="h-3.5 w-3.5 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem asChild>
          <Link to="/technician/pre-disposed">
            <List className="h-4 w-4" />
            Queue Pre-Dispose
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/technician/disposed">
            <Recycle className="h-4 w-4" />
            Disposed Asset
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
