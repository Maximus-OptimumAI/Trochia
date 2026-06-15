import Link from 'next/link';
import {
  LayoutDashboard,
  Brain,
  Presentation,
  Network,
  PhoneCall,
  FolderLock,
  Calculator,
  Settings,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Logo } from '@/components/brand/logo';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/**
 * Sidebar (app shell) — `w-60 bg-paper border-r border-stone`, logo lockup top,
 * nav items middle, user menu bottom. Module order: Business Memory · Pitch Lab
 * · Pipeline · Live Raise · Data Room* · Raise Ops* (`*` = disabled, with a
 * right-aligned `text-mono-sm` phase badge — Data Room "Phase 7", Raise Ops
 * "Phase 9"). Bottom: Settings + the user avatar DropdownMenu (Settings /
 * Billing / Sign out).
 */
type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  disabledPhase?: string;
};

const NAV: NavItem[] = [
  { label: 'Dashboard', href: '/app', icon: LayoutDashboard },
  { label: 'Business Memory', href: '/app/memory', icon: Brain },
  { label: 'Pitch Lab', href: '/app/pitch', icon: Presentation },
  { label: 'Pipeline', href: '/app/pipeline', icon: Network },
  { label: 'Live Raise', href: '/app/live-raise', icon: PhoneCall },
  { label: 'Data Room', href: '/app/data-room', icon: FolderLock, disabledPhase: 'Soon' },
  { label: 'Raise Ops', href: '/app/raise-ops', icon: Calculator, disabledPhase: 'Soon' },
];

function NavLink({ item, active }: { item: NavItem; active?: boolean }) {
  const Icon = item.icon;
  const base =
    'flex items-center gap-3 px-3 h-10 rounded-md text-body-sm font-medium transition-colors';
  if (item.disabledPhase) {
    return (
      <span
        aria-disabled
        className={cn(base, 'cursor-not-allowed text-graphite/50')}
        title={item.disabledPhase}
      >
        <Icon className="size-4 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1 truncate">{item.label}</span>
        <Badge variant="phase">{item.disabledPhase}</Badge>
      </span>
    );
  }
  return (
    <Link
      href={item.href}
      className={cn(
        base,
        active ? 'bg-stone text-ink' : 'text-graphite hover:bg-stone/50 hover:text-ink'
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
    </Link>
  );
}

export function Sidebar({
  activeHref,
  userName = 'Founder',
  userEmail,
}: {
  activeHref?: string;
  userName?: string;
  userEmail?: string;
}) {
  const initials = userName
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-stone bg-paper">
      <div className="p-6">
        <Logo href="/app" height={32} />
      </div>
      <nav className="flex flex-1 flex-col gap-1 px-3">
        {NAV.map((item) => (
          <NavLink key={item.href} item={item} active={item.href === activeHref} />
        ))}
      </nav>
      <div className="flex flex-col gap-1 p-3">
        <NavLink item={{ label: 'Settings', href: '/app/settings', icon: Settings }} active={activeHref === '/app/settings'} />
        <DropdownMenu>
          <DropdownMenuTrigger
            className="flex items-center gap-3 rounded-md px-3 py-2 text-left transition-colors hover:bg-stone/50"
            aria-label="Account menu"
          >
            <Avatar className="size-7">
              <AvatarFallback className="text-mono-sm">{initials}</AvatarFallback>
            </Avatar>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-body-sm font-medium text-ink">{userName}</span>
              {userEmail && (
                <span className="block truncate text-mono-sm text-graphite">{userEmail}</span>
              )}
            </span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-52">
            <DropdownMenuItem render={<Link href="/app/settings" />}>Settings</DropdownMenuItem>
            <DropdownMenuItem render={<Link href="/app/billing" />}>Billing</DropdownMenuItem>
            <DropdownMenuSeparator />
            <form action="/sign-out" method="post" className="w-full">
              {/* `nativeButton`: the render target IS a real <button>, so Base UI
                  stays on its native-button path — Enter-key submit works and the
                  non-native-button a11y warning is gone (codex P2, sidebar.tsx:130). */}
              <DropdownMenuItem nativeButton render={<button type="submit" />} className="w-full">
                Sign out
              </DropdownMenuItem>
            </form>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </aside>
  );
}
