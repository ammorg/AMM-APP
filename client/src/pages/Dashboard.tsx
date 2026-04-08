import { useQuery } from "@tanstack/react-query";
import type { Job, Staff, Invoice, Customer } from "@shared/schema";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend,
} from "recharts";
import { Briefcase, Users, DollarSign, AlertTriangle, Clock, CheckCircle } from "lucide-react";

// Helpers
function priorityColor(p: string) {
  switch (p) {
    case "urgent": return "destructive";
    case "high": return "outline";
    default: return "secondary";
  }
}

function statusLabel(s: string) {
  const map: Record<string, string> = {
    pending: "Pending",
    scheduled: "Scheduled",
    in_progress: "In Progress",
    complete: "Complete",
    cancelled: "Cancelled",
  };
  return map[s] ?? s;
}

function statusBadgeVariant(s: string): "default" | "secondary" | "destructive" | "outline" {
  switch (s) {
    case "complete": return "default";
    case "in_progress": return "outline";
    case "pending": return "secondary";
    case "cancelled": return "destructive";
    default: return "secondary";
  }
}

function fmtCurrency(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

function fmtTime(dt?: string | null) {
  if (!dt) return "—";
  const d = new Date(dt);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function fmtDate(dt?: string | null) {
  if (!dt) return "—";
  const d = new Date(dt);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function isTodayOrNear(dt?: string | null) {
  if (!dt) return false;
  const d = new Date(dt);
  const now = new Date();
  const diff = d.getTime() - now.getTime();
  return diff > -86400000 && diff < 86400000;
}

// KPI Card
function KpiCard({
  title, value, subtitle, icon: Icon, accent = false, loading,
}: {
  title: string; value: string | number; subtitle?: string;
  icon: React.ElementType; accent?: boolean; loading?: boolean;
}) {
  return (
    <Card data-testid={`kpi-${title.toLowerCase().replace(/\s+/g, "-")}`}>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-1">
              {title}
            </p>
            {loading ? (
              <Skeleton className="h-7 w-20 mb-1" />
            ) : (
              <p className={`text-2xl font-bold tracking-tight ${accent ? "text-primary" : ""}`}>
                {value}
              </p>
            )}
            {subtitle && (
              <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
            )}
          </div>
          <div className={`p-2 rounded-lg ${accent ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
            <Icon size={20} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { user, isAdmin } = useAuth();
  const { data: jobs = [], isLoading: jobsLoading } = useQuery<Job[]>({
    queryKey: ["/api/jobs"],
  });
  const { data: staffList = [], isLoading: staffLoading } = useQuery<Staff[]>({
    queryKey: ["/api/staff"],
  });
  const { data: invoices = [], isLoading: invoicesLoading } = useQuery<Invoice[]>({
    queryKey: ["/api/invoices"],
  });
  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });

  const loading = jobsLoading || staffLoading || invoicesLoading;

  // KPIs
  const activeJobs = jobs.filter((j) => ["pending", "scheduled", "in_progress"].includes(j.status));
  const todayJobs = [...jobs.filter((j) => isTodayOrNear(j.scheduledAt))].sort((a, b) => {
    if (!a.scheduledAt) return 1;
    if (!b.scheduledAt) return -1;
    return new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime();
  });
  const urgentJobs = jobs.filter((j) => ["urgent", "high"].includes(j.priority) && !["complete", "in_progress", "cancelled"].includes(j.status));
  const totalRevenue = invoices.filter((i) => i.status === "paid").reduce((s, i) => s + i.totalAmount, 0);
  const pendingRevenue = invoices.filter((i) => ["sent", "draft"].includes(i.status)).reduce((s, i) => s + i.totalAmount, 0);
  const overdueInvoices = invoices.filter((i) => i.status === "overdue");
  const onboardingStaff = staffList.filter((s) => s.onboardingStatus === "in_progress");

  // Chart: jobs by status
  const statusCounts = ["pending", "scheduled", "in_progress", "complete"].map((s) => ({
    name: statusLabel(s),
    count: jobs.filter((j) => j.status === s).length,
  }));

  // Chart: revenue last 7 days (mock breakdown from invoices)
  const paidInvs = invoices.filter((i) => i.status === "paid");
  const revenueByDay = (() => {
    const days: Record<string, number> = {};
    paidInvs.forEach((inv) => {
      const d = (inv.paidAt ?? inv.issuedAt).slice(0, 10);
      days[d] = (days[d] ?? 0) + inv.totalAmount;
    });
    return Object.entries(days)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-7)
      .map(([date, amount]) => ({ date: date.slice(5), amount: Math.round(amount) }));
  })();

  // Pie: invoice status
  const invPie = [
    { name: "Paid", value: invoices.filter((i) => i.status === "paid").length, fill: "#22c55e" },
    { name: "Sent", value: invoices.filter((i) => i.status === "sent").length, fill: "#3b82f6" },
    { name: "Draft", value: invoices.filter((i) => i.status === "draft").length, fill: "#6b7280" },
    { name: "Overdue", value: invoices.filter((i) => i.status === "overdue").length, fill: "#ef4444" },
  ].filter((i) => i.value > 0);

  return (
    <div className="p-5 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight" data-testid="page-title-dashboard">
            {isAdmin() ? "Dispatch Overview" : `My Dashboard — ${user?.displayName}`}
          </h1>
          <p className="text-sm text-muted-foreground">
            {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
          </p>
        </div>
        {!isAdmin() && (
          <div className="text-xs bg-muted text-muted-foreground px-2.5 py-1 rounded-md border border-border shrink-0">
            Showing your assigned jobs only
          </div>
        )}
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard title="Active Jobs" value={activeJobs.length} icon={Briefcase} accent loading={loading} />
        <KpiCard title="Urgent" value={urgentJobs.length} icon={AlertTriangle} accent={urgentJobs.length > 0} loading={loading} />
        <KpiCard title="Revenue Collected" value={fmtCurrency(totalRevenue)} icon={DollarSign} loading={loading} />
        <KpiCard title="Pending Revenue" value={fmtCurrency(pendingRevenue)} icon={DollarSign} loading={loading} />
      </div>

      {/* Row 2: Today's schedule + Urgent Jobs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Today's schedule */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock size={16} className="text-primary" />
              Today's Schedule
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
              </div>
            ) : todayJobs.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No jobs scheduled today</p>
            ) : (
              <div className="space-y-2" data-testid="today-schedule">
                {todayJobs.map((job) => {
                  const tech = staffList.find((s) => s.id === job.assignedStaffId);
                  return (
                    <div
                      key={job.id}
                      className="flex items-start gap-3 p-2.5 rounded-md bg-muted/50 border border-border"
                      data-testid={`schedule-job-${job.id}`}
                    >
                      <div className="text-xs text-muted-foreground w-14 shrink-0 pt-0.5">
                        {fmtTime(job.scheduledAt)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{job.serviceType}</p>
                        <p className="text-xs text-muted-foreground">
                          {tech?.name ?? "Unassigned"}
                        </p>
                      </div>
                      <Badge variant={statusBadgeVariant(job.status)} className="text-xs shrink-0">
                        {statusLabel(job.status)}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Urgent jobs */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle size={16} className="text-primary" />
              Urgent & High Priority
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">
                {[1, 2].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
              </div>
            ) : urgentJobs.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center flex items-center justify-center gap-2">
                <CheckCircle size={16} className="text-green-500" />
                No urgent jobs
              </p>
            ) : (
              <div className="space-y-2" data-testid="urgent-jobs">
                {urgentJobs.map((job) => (
                  <div
                    key={job.id}
                    className="p-2.5 rounded-md border border-border bg-muted/50"
                    data-testid={`urgent-job-${job.id}`}
                  >
                    <div className="flex items-center gap-2">
                      <Badge variant="destructive" className="text-xs capitalize">
                        {job.priority}
                      </Badge>
                      <span className="text-sm font-medium truncate flex-1">{job.serviceType}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {job.scheduledAt ? `Scheduled: ${fmtDate(job.scheduledAt)} ${fmtTime(job.scheduledAt)}` : "No time set"}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Row 3: Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Jobs by status bar chart */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Jobs by Status</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-40 w-full" />
            ) : (
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={statusCounts} barCategoryGap="35%">
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 6 }}
                    labelStyle={{ color: "hsl(var(--foreground))", fontSize: 12 }}
                  />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {statusCounts.map((entry, index) => (
                      <Cell
                        key={index}
                        fill={entry.name === "Complete" ? "#22c55e" : entry.name === "In Progress" ? "hsl(var(--primary))" : "#6b7280"}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Invoice pie chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Invoices</CardTitle>
          </CardHeader>
          <CardContent>
            {loading || invPie.length === 0 ? (
              <Skeleton className="h-40 w-full" />
            ) : (
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie
                    data={invPie}
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={65}
                    dataKey="value"
                  >
                    {invPie.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 6 }}
                  />
                  <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Row 4: Onboarding + Overdue */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Onboarding progress */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Users size={16} className="text-primary" />
              Team Onboarding
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {[1, 2].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : onboardingStaff.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center flex items-center justify-center gap-2">
                <CheckCircle size={16} className="text-green-500" />
                All staff onboarded
              </p>
            ) : (
              <div className="space-y-3" data-testid="onboarding-list">
                {onboardingStaff.map((member) => (
                  <div key={member.id} data-testid={`onboarding-staff-${member.id}`}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-medium">{member.name}</span>
                      <span className="text-muted-foreground">{member.onboardingProgress}%</span>
                    </div>
                    <Progress value={member.onboardingProgress} className="h-1.5" />
                    <p className="text-xs text-muted-foreground mt-0.5">{member.role}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Overdue invoices */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <DollarSign size={16} className="text-primary" />
              Overdue Invoices
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-20 w-full" />
            ) : overdueInvoices.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center flex items-center justify-center gap-2">
                <CheckCircle size={16} className="text-green-500" />
                No overdue invoices
              </p>
            ) : (
              <div className="space-y-2" data-testid="overdue-invoices">
                {overdueInvoices.map((inv) => {
                  const cust = customers.find((c) => c.id === inv.customerId);
                  return (
                    <div key={inv.id} className="flex justify-between items-center p-2.5 rounded bg-destructive/10 border border-destructive/20" data-testid={`overdue-inv-${inv.id}`}>
                      <div>
                        <p className="text-sm font-medium">{inv.invoiceNumber}</p>
                        <p className="text-xs text-muted-foreground">{cust?.name ?? "—"} · Due {fmtDate(inv.dueAt)}</p>
                      </div>
                      <span className="text-sm font-semibold text-destructive">{fmtCurrency(inv.totalAmount)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Revenue snapshot */}
      {revenueByDay.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Revenue Snapshot (Recent Payments)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={140}>
              <BarChart data={revenueByDay} barCategoryGap="40%">
                <XAxis dataKey="date" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v}`} />
                <Tooltip
                  formatter={(v: number) => [fmtCurrency(v), "Revenue"]}
                  contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 6 }}
                />
                <Bar dataKey="amount" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
