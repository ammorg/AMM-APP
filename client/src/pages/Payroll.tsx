import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { mutationErrorToast } from "@/lib/errorMessages";
import type { Staff, PayrollSettings } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import {
  DollarSign, CheckCircle2, Clock, ChevronDown, ChevronRight, Settings2,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

function fmtCurrency(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

interface JobDetail {
  jobId: number;
  serviceType: string;
  revenue: number;
  payout: number;
  payoutPaid: boolean;
  payoutPaidAt: string | null;
  paymentStatus: string;
}

interface PayrollSummaryEntry {
  staffId: number;
  staffName: string;
  role: string;
  payoutType: "percentage" | "flat_per_job";
  payoutRate: number;
  jobCount: number;
  totalRevenue: number;
  totalPayout: number;
  pendingPayout: number;
  jobs: JobDetail[];
}

// ── Per-job payout row ────────────────────────────────────────────────────────
function JobPayoutRow({ job, techId }: { job: JobDetail; techId: number }) {
  const { toast } = useToast();

  const markPaidMutation = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/job-completions/${job.jobId}/payout`, {
      techPayoutAmount: job.payout,
      techPayoutPaid: job.payoutPaid ? 0 : 1,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payroll/summary"] });
      toast({ title: job.payoutPaid ? "Payout unmarked" : "Payout marked as paid" });
    },
    onError: (err) => toast({ ...mutationErrorToast(err, "update payout"), variant: "destructive" }),
  });

  return (
    <div className="flex items-center gap-3 py-2 px-3 text-sm" data-testid={`payout-row-${job.jobId}`}>
      <div className="flex-1 min-w-0">
        <span className="font-medium text-xs">{job.serviceType}</span>
        <div className="text-xs text-muted-foreground flex gap-3">
          <span>Revenue: {fmtCurrency(job.revenue)}</span>
          <span>Payout: <strong>{fmtCurrency(job.payout)}</strong></span>
          <span className={`capitalize ${job.paymentStatus === "paid" ? "text-green-600 dark:text-green-400" : "text-amber-600 dark:text-amber-400"}`}>
            Cust. payment: {job.paymentStatus}
          </span>
        </div>
      </div>
      <Button
        variant={job.payoutPaid ? "default" : "outline"}
        size="sm"
        className="text-xs h-7 gap-1 shrink-0"
        onClick={() => markPaidMutation.mutate()}
        disabled={markPaidMutation.isPending}
        data-testid={`btn-payout-toggle-${job.jobId}`}
      >
        {job.payoutPaid ? <CheckCircle2 size={11} /> : <Clock size={11} />}
        {job.payoutPaid ? "Paid" : "Mark Paid"}
      </Button>
    </div>
  );
}

// ── Payout settings dialog ────────────────────────────────────────────────────
function PayoutSettingsDialog({ staffId, staffName, current }: {
  staffId: number; staffName: string; current?: PayrollSettings;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [payoutType, setPayoutType] = useState<string>(current?.payoutType ?? "percentage");
  const [payoutRate, setPayoutRate] = useState(String(current?.payoutRate ?? 40));

  const mutation = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/payroll/settings/${staffId}`, {
      payoutType,
      payoutRate: parseFloat(payoutRate),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payroll/summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/payroll/settings"] });
      toast({ title: "Payout settings saved" });
      setOpen(false);
    },
    onError: (err) => toast({ ...mutationErrorToast(err, "save payout settings"), variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" data-testid={`btn-payout-settings-${staffId}`}>
          <Settings2 size={12} /> Settings
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Payout Settings — {staffName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label>Payout Type</Label>
            <Select value={payoutType} onValueChange={setPayoutType}>
              <SelectTrigger data-testid="select-payout-type"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="percentage">Percentage of job revenue</SelectItem>
                <SelectItem value="flat_per_job">Flat amount per job</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>
              {payoutType === "percentage" ? "Percentage (%)" : "Flat Amount ($)"}
            </Label>
            <Input
              data-testid="input-payout-rate"
              type="number"
              value={payoutRate}
              onChange={(e) => setPayoutRate(e.target.value)}
              min="0"
            />
            <p className="text-xs text-muted-foreground mt-1">
              {payoutType === "percentage"
                ? `Tech receives ${payoutRate}% of each job's estimate`
                : `Tech receives a flat ${fmtCurrency(parseFloat(payoutRate) || 0)} per completed job`
              }
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending} data-testid="btn-save-payout-settings">
            {mutation.isPending ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Payroll Page ──────────────────────────────────────────────────────────────
export default function Payroll() {
  const [expandedStaff, setExpandedStaff] = useState<number[]>([]);
  const { data: summary = [], isLoading: summaryLoading } = useQuery<PayrollSummaryEntry[]>({
    queryKey: ["/api/payroll/summary"],
  });
  const { data: payrollSettings = [] } = useQuery<PayrollSettings[]>({
    queryKey: ["/api/payroll/settings"],
  });

  const totalRevenue = summary.reduce((a, s) => a + s.totalRevenue, 0);
  const totalPayout = summary.reduce((a, s) => a + s.totalPayout, 0);
  const totalPending = summary.reduce((a, s) => a + s.pendingPayout, 0);
  const totalJobs = summary.reduce((a, s) => a + s.jobCount, 0);

  const toggleExpand = (id: number) => {
    setExpandedStaff(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  if (summaryLoading) {
    return (
      <div className="p-5 max-w-5xl mx-auto space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="p-5 max-w-5xl mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-bold tracking-tight" data-testid="page-title-payroll">
          Payroll & Technician Payouts
        </h1>
        <p className="text-sm text-muted-foreground">
          Track completed job revenue and per-technician payout status
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Completed Jobs", value: totalJobs, icon: CheckCircle2, color: "text-primary" },
          { label: "Total Revenue", value: fmtCurrency(totalRevenue), icon: DollarSign, color: "text-green-600 dark:text-green-400" },
          { label: "Total Payouts", value: fmtCurrency(totalPayout), icon: DollarSign, color: "text-primary" },
          { label: "Pending Payout", value: fmtCurrency(totalPending), icon: Clock, color: "text-amber-600 dark:text-amber-400" },
        ].map(({ label, value, icon: Icon, color }) => (
          <Card key={label}>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Icon size={14} className={color} />
                <p className="text-xs text-muted-foreground">{label}</p>
              </div>
              <p className={`text-lg font-bold ${color}`} data-testid={`stat-${label.toLowerCase().replace(/\s/g, "-")}`}>
                {value}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Per-tech breakdown */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <DollarSign size={16} className="text-primary" />
            Technician Payout Summary
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {summary.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">
              No completed jobs yet. Payouts appear once jobs are marked complete.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {summary.map((entry) => {
                const expanded = expandedStaff.includes(entry.staffId);
                const setting = payrollSettings.find(p => p.staffId === entry.staffId);

                return (
                  <div key={entry.staffId} data-testid={`tech-payout-${entry.staffId}`}>
                    {/* Tech header row */}
                    <div
                      className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors"
                      onClick={() => toggleExpand(entry.staffId)}
                    >
                      <button className="text-muted-foreground shrink-0">
                        {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      </button>
                      <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center text-primary font-bold text-sm shrink-0">
                        {entry.staffName.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">{entry.staffName}</span>
                          <Badge variant="secondary" className="text-xs">{entry.role}</Badge>
                          <span className="text-xs text-muted-foreground">
                            {entry.payoutType === "percentage" ? `${entry.payoutRate}% of revenue` : `${fmtCurrency(entry.payoutRate)}/job`}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground flex flex-wrap gap-x-4 mt-0.5">
                          <span>{entry.jobCount} jobs</span>
                          <span>Revenue: {fmtCurrency(entry.totalRevenue)}</span>
                          <span className="font-medium text-foreground">Payout: {fmtCurrency(entry.totalPayout)}</span>
                          {entry.pendingPayout > 0 && (
                            <span className="text-amber-600 dark:text-amber-400">
                              Pending: {fmtCurrency(entry.pendingPayout)}
                            </span>
                          )}
                        </div>
                      </div>
                      <PayoutSettingsDialog
                        staffId={entry.staffId}
                        staffName={entry.staffName}
                        current={setting}
                      />
                    </div>

                    {/* Expanded job list */}
                    {expanded && (
                      <div className="bg-muted/20 border-t border-border divide-y divide-border/50">
                        {entry.jobs.length === 0 ? (
                          <p className="text-xs text-muted-foreground px-10 py-3">No completed jobs</p>
                        ) : (
                          entry.jobs.map(job => (
                            <JobPayoutRow key={job.jobId} job={job} techId={entry.staffId} />
                          ))
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Payouts are calculated from completed job estimate amounts. Adjust payout type and rate per technician using the Settings button on each row.
      </p>
    </div>
  );
}
