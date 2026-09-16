"use client";

import { signOut } from "@/actions/auth";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

interface UserMenuProps {
  displayName: string;
  email: string;
}

/**
 * Identity + sign-out (Phase 1 of the post-Task-22 UX pass). `signOut()`
 * already existed as a working server action with nothing in the UI
 * calling it — this is that missing wiring, not new sign-out logic.
 */
export function UserMenu({ displayName, email }: UserMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="ml-auto flex items-center gap-2 rounded-md px-2 py-1 text-sm text-neutral-700 hover:bg-neutral-100">
        <span className="flex size-7 items-center justify-center rounded-full bg-neutral-900 text-xs font-medium text-white">
          {displayName.slice(0, 1).toUpperCase()}
        </span>
        <span className="hidden font-medium sm:inline">{displayName}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-64 w-max">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="whitespace-nowrap text-xs font-normal text-muted-foreground">{email}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => void signOut()}>Sign out</DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
