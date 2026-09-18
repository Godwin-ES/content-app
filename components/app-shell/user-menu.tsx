"use client";

import Link from "next/link";
import { useFormStatus } from "react-dom";
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
}

function SignOutMenuItem() {
  const { pending } = useFormStatus();

  return (
    <DropdownMenuItem
      render={<button type="submit" className="w-full" />}
      nativeButton
      closeOnClick={false}
      disabled={pending}
    >
      {pending ? "Signing out..." : "Sign out"}
    </DropdownMenuItem>
  );
}

/**
 * Identity, settings, sign-out. The trigger used to carry the active role
 * under the name, because two accounts were in play and which one you were
 * signed in as was the thing you most needed to see. There is one account
 * now, so the name stands on its own.
 */
export function UserMenu({ displayName, email }: UserMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="ml-auto flex shrink-0 items-center gap-2.5 rounded-lg py-1 pl-1 pr-2 text-left transition-colors hover:bg-secondary">
        <span className="flex size-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
          {displayName.slice(0, 1).toUpperCase()}
        </span>
        <span className="hidden text-sm font-medium sm:inline">{displayName}</span>
        <ChevronDown aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-max min-w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-xs font-normal whitespace-nowrap text-muted-foreground">{email}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem render={<Link href="/settings" />}>Settings</DropdownMenuItem>
          <form action={signOut} className="w-full">
            <SignOutMenuItem />
          </form>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
