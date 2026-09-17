"use client";

import { ChevronDown } from "lucide-react";
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
  role: "content_manager" | "reviewer";
}

const ROLE_LABEL: Record<UserMenuProps["role"], string> = {
  content_manager: "Content Manager",
  reviewer: "Reviewer",
};

/**
 * Identity + sign-out. The trigger carries the active role as well as the
 * name — with two accounts in play, which role you are currently signed in
 * as is the thing you most need to see at a glance.
 */
export function UserMenu({ displayName, email, role }: UserMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="ml-auto flex shrink-0 items-center gap-2.5 rounded-lg py-1 pl-1 pr-2 text-left transition-colors hover:bg-secondary">
        <span className="flex size-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
          {displayName.slice(0, 1).toUpperCase()}
        </span>
        <span className="hidden leading-tight sm:flex sm:flex-col">
          <span className="text-sm font-medium">{displayName}</span>
          <span className="text-xs text-muted-foreground">{ROLE_LABEL[role]}</span>
        </span>
        <ChevronDown aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-max min-w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-xs font-normal whitespace-nowrap text-muted-foreground">{email}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => void signOut()}>Sign out</DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
