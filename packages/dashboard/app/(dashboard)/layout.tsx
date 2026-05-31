'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Anchor, Eye, Package, ScrollText, Shield } from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { href: '/horizon', label: 'Horizon', icon: Eye, description: 'Live threats' },
  { href: '/lookout', label: 'Lookout', icon: Shield, description: 'Risk scoring' },
  { href: '/hold', label: 'Hold', icon: Package, description: 'Inventory' },
  { href: '/log', label: 'Log', icon: ScrollText, description: 'Incidents' },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="w-56 flex-shrink-0 bg-[#0f172a] border-r border-slate-800 flex flex-col">
        {/* Logo */}
        <div className="p-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Anchor className="w-6 h-6 text-cyan-400" />
            <div>
              <div className="font-bold text-cyan-400 text-sm tracking-wider">CROWSNEST</div>
              <div className="text-xs text-slate-500">supply chain sentinel</div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
                  active
                    ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800',
                )}
              >
                <item.icon className="w-4 h-4" />
                <div>
                  <div className="font-medium">{item.label}</div>
                  <div className="text-xs text-slate-500">{item.description}</div>
                </div>
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="p-3 border-t border-slate-800">
          <div className="text-xs text-slate-600">Powered by CoralDB</div>
          <div className="text-xs text-slate-600">© 2026 Crowsnest</div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto bg-[#020817]">
        {children}
      </main>
    </div>
  );
}
