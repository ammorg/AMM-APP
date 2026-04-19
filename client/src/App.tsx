import { Switch, Route, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQuery, useMutation } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard, Briefcase, Users, UserCog, DollarSign, Settings, Sun, Moon,
  Menu, X, Calculator, LogOut, CalendarDays, Banknote,
} from "lucide-react";
import { apiRequest } from "./lib/queryClient";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/Dashboard";
import Jobs from "@/pages/Jobs";
import Customers from "@/pages/Customers";
import Team from "@/pages/Team";
import Finance from "@/pages/Finance";
import SettingsPage from "@/pages/SettingsPage";
import Estimator from "@/pages/Estimator";
import Login from "@/pages/Login";
import Schedule from "@/pages/Schedule";
import EstimateApprovalPage from "@/pages/EstimateApproval";
import PrintInvoice from "@/pages/PrintInvoice";
import Payroll from "@/pages/Payroll";
import { AuthProvider, useAuth, type UserRole } from "./lib/auth";
import logoPrimary from "@/assets/amm-logo-primary.jpeg";

function useTheme() {
  const [dark, setDark] = useState(() =>
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );

  useEffect(() => {
    if (dark) document.documentElement.classList.add("dark");
    else document.documentElement.classList.remove("dark");
  }, [dark]);

  return { dark, toggle: () => setDark((d) => !d) };
}

function BrandMark({ size = 36 }: { size?: number }) {
  return (
    <img
      src={logoPrimary}
      alt="Affordable Mobile Mechanics"
      width={size}
      height={size}
      className="rounded-md object-cover shrink-0"
    />
  );
}

function RoleBadge({ role }: { role: UserRole }) {
  const labels: Record<UserRole, string> = {
    admin: "Admin",
    lead_mechanic: "Lead Mech",
    mechanic: "Mechanic",
  };
  const variants: Record<UserRole, string> = {
    admin: "bg-primary/15 text-primary border-primary/30",
    lead_mechanic: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-400 border-orange-200 dark:border-orange-900",
    mechanic: "bg-secondary text-secondary-foreground border-border",
  };
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold uppercase tracking-wider ${variants[role]}`}>
      {labels[role]}
    </span>
  );
}

interface NavItem {
  path: string;
  label: string;
  icon: React.ElementType;
  roles?: UserRole[];
}

const ALL_NAV_ITEMS: NavItem[] = [
  { path: "/", label: "Dashboard", icon: LayoutDashboard },
  { path: "/jobs", label: "Jobs", icon: Briefcase },
  { path: "/schedule", label: "Schedule", icon: CalendarDays },
  { path: "/customers", label: "Customers", icon: Users, roles: ["admin"] },
  { path: "/estimator", label: "Estimator", icon: Calculator },
  { path: "/team", label: "Team", icon: UserCog, roles: ["admin"] },
  { path: "/finance", label: "Finance", icon: DollarSign, roles: ["admin"] },
  { path: "/payroll", label: "Payroll", icon: Banknote, roles: ["admin"] },
  { path: "/settings", label: "Settings", icon: Settings, roles: ["admin"] },
];

function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [location] = useLocation();
  const { dark, toggle } = useTheme();
  const { user, logout } = useAuth();

  const visibleItems = ALL_NAV_ITEMS.filter(item => !item.roles || (user && item.roles.includes(user.role)));

  return (
    <>
      {open && <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={onClose} />}

      <aside
        className={`fixed top-0 left-0 h-full w-64 z-50 flex flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border transition-transform duration-200 ${open ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0 lg:static lg:z-auto`}
        data-testid="sidebar"
      >
        <div className="flex items-center gap-3 px-5 py-4 border-b border-sidebar-border">
          <BrandMark size={36} />
          <div>
            <div className="text-xs font-bold uppercase tracking-widest text-primary leading-tight">Affordable Mobile</div>
            <div className="text-xs text-sidebar-foreground/60 leading-tight">Mechanics Dispatch</div>
          </div>
          <button className="ml-auto lg:hidden text-sidebar-foreground/60 hover:text-sidebar-foreground" onClick={onClose} aria-label="Close sidebar">
            <X size={18} />
          </button>
        </div>

        <nav className="flex-1 p-3 space-y-0.5" data-testid="sidebar-nav">
          {visibleItems.map(({ path, label, icon: Icon }) => {
            const active = location === path;
            return (
              <Link
                key={path}
                href={path}
                onClick={onClose}
                data-testid={`nav-${label.toLowerCase().replace(/\s/g, "-")}`}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors duration-150 ${active ? "bg-primary text-primary-foreground" : "text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"}`}
              >
                <Icon size={16} />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="px-4 py-3 border-t border-sidebar-border space-y-2">
          {user && (
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-xs shrink-0">
                {user.displayName.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-sidebar-foreground truncate">{user.displayName}</div>
                <RoleBadge role={user.role} />
              </div>
              <button onClick={logout} data-testid="btn-logout" title="Sign out" className="p-1.5 rounded hover:bg-sidebar-accent text-sidebar-foreground/60 hover:text-sidebar-foreground transition-colors shrink-0">
                <LogOut size={15} />
              </button>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-xs text-sidebar-foreground/40">Lafayette, LA dispatch</span>
            <button onClick={toggle} data-testid="theme-toggle" aria-label="Toggle theme" className="p-1.5 rounded hover:bg-sidebar-accent text-sidebar-foreground/60 hover:text-sidebar-foreground transition-colors">
              {dark ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}

function SeedBootstrap() {
  const { data: status } = useQuery<{ seeded: boolean }>({ queryKey: ["/api/seed/status"] });
  const seedMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/seed"),
    onSuccess: () => queryClient.invalidateQueries(),
  });

  useEffect(() => {
    if (status && !status.seeded) seedMutation.mutate();
  }, [status]);

  return null;
}

function RequireRole({ roles, children }: { roles: UserRole[]; children: React.ReactNode }) {
  const { user } = useAuth();
  if (!user || !roles.includes(user.role)) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-center p-6">
        <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
          <Settings size={20} className="text-destructive" />
        </div>
        <div>
          <p className="font-semibold text-sm">Access restricted</p>
          <p className="text-xs text-muted-foreground mt-1">You don't have permission to view this page.</p>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}

function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user } = useAuth();

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="lg:hidden flex items-center gap-3 px-4 py-3 border-b border-border bg-card">
          <button onClick={() => setSidebarOpen(true)} data-testid="btn-open-sidebar" aria-label="Open sidebar">
            <Menu size={20} />
          </button>
          <BrandMark size={24} />
          <span className="text-sm font-semibold">AMM Dispatch</span>
          {user && <span className="ml-auto"><RoleBadge role={user.role} /></span>}
        </header>

        <main className="flex-1 overflow-y-auto">
          <SeedBootstrap />
          <Switch>
            <Route path="/" component={Dashboard} />
            <Route path="/jobs" component={Jobs} />
            <Route path="/schedule" component={Schedule} />
            <Route path="/customers"><RequireRole roles={["admin"]}><Customers /></RequireRole></Route>
            <Route path="/estimator" component={Estimator} />
            <Route path="/team"><RequireRole roles={["admin"]}><Team /></RequireRole></Route>
            <Route path="/finance"><RequireRole roles={["admin"]}><Finance /></RequireRole></Route>
            <Route path="/settings"><RequireRole roles={["admin"]}><SettingsPage /></RequireRole></Route>
            <Route path="/payroll"><RequireRole roles={["admin"]}><Payroll /></RequireRole></Route>
            <Route path="/print/invoice/:id"><RequireRole roles={["admin"]}><PrintInvoice /></RequireRole></Route>
            <Route component={NotFound} />
          </Switch>
        </main>
      </div>
    </div>
  );
}

function AuthGate() {
  const { user, isLoading } = useAuth();

  if (typeof window !== "undefined" && window.location.hash.startsWith("#/approve/")) {
    return (
      <Switch>
        <Route path="/approve/:token" component={EstimateApprovalPage} />
        <Route component={NotFound} />
      </Switch>
    );
  }

  if (isLoading) {
    return <div className="min-h-screen bg-background flex items-center justify-center"><div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>;
  }

  if (!user) return <Login />;
  return <AppLayout />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <Toaster />
          <Router hook={useHashLocation}>
            <AuthGate />
          </Router>
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
