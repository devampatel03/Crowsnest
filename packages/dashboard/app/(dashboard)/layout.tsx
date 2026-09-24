'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Anchor, Eye, Package, ScrollText, Shield } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TopoBackground } from '@/components/decor/topo-lines';
import { TooltipProvider } from '@/components/ui/tooltip';

const navItems = [
  { href: '/horizon', label: 'Horizon', icon: Eye, description: 'Live threats' },
  { href: '/lookout', label: 'Lookout', icon: Shield, description: 'Risk scoring' },
  { href: '/hold', label: 'Hold', icon: Package, description: 'Inventory' },
  { href: '/log', label: 'Log', icon: ScrollText, description: 'Incidents' },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <TooltipProvider delayDuration={200}>
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="relative w-56 flex-shrink-0 bg-surface border-r border-border flex flex-col overflow-hidden">
        <TopoBackground className="text-primary opacity-60" />
        {/* Logo */}
        <div className="relative p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Anchor className="w-6 h-6 text-primary" />
            <div>
              <div className="font-sans font-bold tracking-wider text-primary text-sm">CROWSNEST</div>
              <div className="text-xs text-text-muted">supply chain sentinel</div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="relative flex-1 p-3 space-y-1">
          {navItems.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
                  active
                    ? 'bg-primary/10 text-primary border border-primary/20'
                    : 'text-text-secondary hover:text-text-primary hover:bg-surface-2',
                )}
              >
                <item.icon className="w-4 h-4" />
                <div>
                  <div className="font-medium">{item.label}</div>
                  <div className="text-xs text-text-muted">{item.description}</div>
                </div>
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="relative p-3 border-t border-border">
          <div className="text-xs text-text-muted">Powered by CoralDB</div>
          <div className="text-xs text-text-muted">© 2026 Crowsnest</div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto bg-background">
        {children}
      </main>
    </div>
    </TooltipProvider>
  );
}
