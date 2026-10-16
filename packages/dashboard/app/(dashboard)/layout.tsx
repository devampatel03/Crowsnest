import { ConsoleShell } from '@/components/console/ConsoleShell';

// The console shell: rail, header, status, keyboard map, toasts and dialogs.
// The four segment layouts own `robots` (noindex); this layout is only the shell.
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <ConsoleShell>{children}</ConsoleShell>;
}
