import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { mutationErrorToast } from "@/lib/errorMessages";
import type { Invoice, Customer, Job } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { Plus, DollarSign, Search, Printer, RefreshCw } from "lucide-react";
import { useLocation } from "wouter";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";

function statusVariant(s: string): "default" | "secondary" | "destructive" | "outline" {
  switch (s) {
    case "paid": return "default";
    case "sent": return "outline";
    case "overdue": return "destructive";
    case "cancelled": return "secondary";
    default: return "secondary";
  }
}

function fmtCurrency(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

function fmtDate(dt: string) {
  return new Date(dt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ── Create Invoice Dialog ─────────────────────────────────────────────────────
function CreateInvoiceDialog() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    customerId: "",
    jobId: "",
    invoiceNumber: `INV-${Date.now().toString().slice(-4)}`,
    status: "draft",
    amount: "",
    taxAmount: "",
    dueAt: "",
    notes: "",
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const { data: customers = [] } = useQuery<Customer[]>({ queryKey: ["/api/customers"] });
  const { data: jobs = [] } = useQuery<Job[]>({ queryKey: ["/api/jobs"] });

  const mutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => apiRequest("POST", "/api/invoices", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      toast({ title: "Invoice created" });
      setOpen(false);
      setFieldErrors({});
      setForm({
        customerId: "", jobId: "", invoiceNumber: `INV-${Date.now().toString().slice(-4)}`,
        status: "draft", amount: "", taxAmount: "", dueAt: "", notes: "",
      });
    },
    onError: (err) => toast({
      ...mutationErrorToast(err, "create invoice"),
      variant: "destructive",
    }),
  });

  const handleSubmit = () => {
    const errors: Record<string, string> = {};
    if (!form.customerId) errors.customerId = "Customer is required.";
    if (!form.amount || isNaN(parseFloat(form.amount)) || parseFloat(form.amount) <= 0) {
      errors.amount = "A valid amount greater than $0 is required.";
    }
    if (!form.invoiceNumber.trim()) errors.invoiceNumber = "Invoice number is required.";

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      // Show the first error as the toast message
      const first = Object.values(errors)[0];
      toast({ title: first, variant: "destructive" });
      return;
    }

    setFieldErrors({});
    const amount = parseFloat(form.amount);
    const tax = parseFloat(form.taxAmount) || 0;
    mutation.mutate({
      customerId: parseInt(form.customerId),
      jobId: form.jobId ? parseInt(form.jobId) : null,
      invoiceNumber: form.invoiceNumber,
      status: form.status,
      amount,
      taxAmount: tax,
      totalAmount: amount + tax,
      issuedAt: today,
      dueAt: form.dueAt || today,
      notes: form.notes || null,
    });
  };

  const customerJobs = jobs.filter(
    (j) => form.customerId && j.customerId === parseInt(form.customerId)
  );

  function clearError(field: string) {
    setFieldErrors(fe => {
      const next = { ...fe };
      delete next[field];
      return next;
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setFieldErrors({}); }}>
      <DialogTrigger asChild>
        <Button size="sm" data-testid="btn-create-invoice">
          <Plus size={14} className="mr-1" /> New Invoice
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Create Invoice</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Invoice # <span className="text-destructive">*</span></Label>
              <Input
                data-testid="input-invoice-number"
                value={form.invoiceNumber}
                onChange={(e) => { setForm((f) => ({ ...f, invoiceNumber: e.target.value })); clearError("invoiceNumber"); }}
                className={fieldErrors.invoiceNumber ? "border-destructive" : ""}
              />
              {fieldErrors.invoiceNumber && <p className="text-xs text-destructive mt-1">{fieldErrors.invoiceNumber}</p>}
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
                <SelectTrigger data-testid="select-invoice-status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="sent">Sent</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="overdue">Overdue</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <Label>Customer <span className="text-destructive">*</span></Label>
              <Select value={form.customerId} onValueChange={(v) => { setForm((f) => ({ ...f, customerId: v, jobId: "" })); clearError("customerId"); }}>
                <SelectTrigger
                  data-testid="select-invoice-customer"
                  className={fieldErrors.customerId ? "border-destructive" : ""}
                >
                  <SelectValue placeholder="Select customer" />
                </SelectTrigger>
                <SelectContent>
                  {customers.length === 0 ? (
                    <SelectItem value="" disabled>No customers found</SelectItem>
                  ) : (
                    customers.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              {fieldErrors.customerId && <p className="text-xs text-destructive mt-1">{fieldErrors.customerId}</p>}
            </div>
            <div className="col-span-2">
              <Label>Linked Job <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Select value={form.jobId} onValueChange={(v) => setForm((f) => ({ ...f, jobId: v }))}>
                <SelectTrigger data-testid="select-invoice-job"><SelectValue placeholder="Select job" /></SelectTrigger>
                <SelectContent>
                  {customerJobs.length === 0 ? (
                    <SelectItem value="" disabled>{form.customerId ? "No jobs for this customer" : "Select a customer first"}</SelectItem>
                  ) : (
                    customerJobs.map((j) => (
                      <SelectItem key={j.id} value={String(j.id)}>{j.serviceType}</SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Amount ($) <span className="text-destructive">*</span></Label>
              <Input
                data-testid="input-invoice-amount"
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={form.amount}
                onChange={(e) => { setForm((f) => ({ ...f, amount: e.target.value })); clearError("amount"); }}
                className={fieldErrors.amount ? "border-destructive" : ""}
              />
              {fieldErrors.amount && <p className="text-xs text-destructive mt-1">{fieldErrors.amount}</p>}
            </div>
            <div>
              <Label>Tax ($) <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Input
                data-testid="input-invoice-tax"
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={form.taxAmount}
                onChange={(e) => setForm((f) => ({ ...f, taxAmount: e.target.value }))}
              />
            </div>
            <div className="col-span-2">
              <Label>Due Date <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Input
                data-testid="input-invoice-due"
                type="date"
                value={form.dueAt}
                onChange={(e) => setForm((f) => ({ ...f, dueAt: e.target.value }))}
              />
            </div>
            <div className="col-span-2">
              <Label>Notes <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Textarea rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { setOpen(false); setFieldErrors({}); }}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={mutation.isPending} data-testid="btn-submit-invoice">
            {mutation.isPending ? (
              <><RefreshCw size={14} className="mr-1 animate-spin" /> Creating…</>
            ) : "Create Invoice"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Mark Paid Dialog ──────────────────────────────────────────────────────────
function MarkPaidDialog({ invoice }: { invoice: Invoice }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);

  const mutation = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/invoices/${invoice.id}`, {
      status: "paid",
      paidAt: new Date().toISOString().slice(0, 10),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      toast({ title: "Invoice marked as paid" });
      setOpen(false);
    },
    onError: (err) => toast({
      ...mutationErrorToast(err, "update invoice"),
      variant: "destructive",
    }),
  });

  if (invoice.status === "paid") return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-xs h-7" data-testid={`btn-mark-paid-${invoice.id}`}>
          Mark Paid
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xs">
        <DialogHeader><DialogTitle>Mark as Paid?</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground py-2">
          Record payment of {fmtCurrency(invoice.totalAmount)} for {invoice.invoiceNumber}.
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending} data-testid="btn-confirm-paid">
            {mutation.isPending ? (
              <><RefreshCw size={14} className="mr-1 animate-spin" /> Saving…</>
            ) : "Confirm Payment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Print Button ─────────────────────────────────────────────────────────────
function PrintButton({ invoiceId }: { invoiceId: number }) {
  const [, navigate] = useLocation();
  return (
    <button
      onClick={() => navigate(`/print/invoice/${invoiceId}`)}
      data-testid={`btn-print-invoice-${invoiceId}`}
      title="Print invoice / receipt"
      className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
    >
      <Printer size={14} />
    </button>
  );
}

// ── Finance Page ───────────────────────────────────────────────────────────────
export default function Finance() {
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");

  const { data: invoices = [], isLoading: invLoading } = useQuery<Invoice[]>({ queryKey: ["/api/invoices"] });
  const { data: customers = [] } = useQuery<Customer[]>({ queryKey: ["/api/customers"] });

  const isLoading = invLoading;

  // Revenue summary
  const totalRevenue = invoices.filter((i) => i.status === "paid").reduce((s, i) => s + i.totalAmount, 0);
  const pendingRevenue = invoices.filter((i) => ["sent", "draft"].includes(i.status)).reduce((s, i) => s + i.totalAmount, 0);
  const overdueRevenue = invoices.filter((i) => i.status === "overdue").reduce((s, i) => s + i.totalAmount, 0);

  // Bar chart: invoices by status
  const statusChart = [
    { name: "Paid", amount: totalRevenue, fill: "#22c55e" },
    { name: "Pending", amount: pendingRevenue, fill: "#3b82f6" },
    { name: "Overdue", amount: overdueRevenue, fill: "#ef4444" },
  ].filter((s) => s.amount > 0);

  const filtered = invoices.filter((inv) => {
    const cust = customers.find((c) => c.id === inv.customerId)?.name ?? "";
    const matchSearch =
      !search ||
      inv.invoiceNumber.toLowerCase().includes(search.toLowerCase()) ||
      cust.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === "all" || inv.status === filterStatus;
    return matchSearch && matchStatus;
  });

  return (
    <div className="p-5 max-w-6xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold tracking-tight" data-testid="page-title-finance">
            Finance
          </h1>
          <p className="text-sm text-muted-foreground">{invoices.length} invoices</p>
        </div>
        <CreateInvoiceDialog />
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Collected", value: totalRevenue, color: "text-green-600 dark:text-green-400" },
          { label: "Pending", value: pendingRevenue, color: "" },
          { label: "Overdue", value: overdueRevenue, color: "text-destructive" },
        ].map(({ label, value, color }) => (
          <Card key={label} data-testid={`finance-kpi-${label.toLowerCase()}`}>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">{label}</p>
              <p className={`text-xl font-bold tracking-tight ${color}`}>{fmtCurrency(value)}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Chart */}
      {!isLoading && statusChart.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Revenue by Status</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={120}>
              <BarChart data={statusChart} layout="vertical" barCategoryGap="30%">
                <XAxis type="number" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v}`} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={55} />
                <Tooltip
                  formatter={(v: number) => [fmtCurrency(v), "Amount"]}
                  contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 6 }}
                />
                <Bar dataKey="amount" radius={[0, 4, 4, 0]}>
                  {statusChart.map((entry, i) => (
                    <rect key={i} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            data-testid="input-search-invoices"
            placeholder="Search invoices..."
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-36" data-testid="filter-invoice-status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="sent">Sent</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
            <SelectItem value="overdue">Overdue</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Invoice List */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <DollarSign size={32} className="mx-auto mb-2 opacity-40" />
              <p className="text-sm">{search || filterStatus !== "all" ? "No invoices match your search." : "No invoices yet. Create your first invoice above."}</p>
            </div>
          ) : (
            <div className="divide-y divide-border" data-testid="invoices-list">
              {filtered.map((inv) => {
                const cust = customers.find((c) => c.id === inv.customerId);
                return (
                  <div
                    key={inv.id}
                    className="px-4 py-3 flex flex-wrap items-center gap-3"
                    data-testid={`invoice-row-${inv.id}`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{inv.invoiceNumber}</span>
                        <Badge variant={statusVariant(inv.status)} className="text-xs capitalize">
                          {inv.status}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5 flex flex-wrap gap-x-3">
                        <span>{cust?.name ?? "—"}</span>
                        <span>Issued {fmtDate(inv.issuedAt)}</span>
                        <span>Due {fmtDate(inv.dueAt)}</span>
                        {inv.paidAt && <span>Paid {fmtDate(inv.paidAt)}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="text-sm font-semibold">{fmtCurrency(inv.totalAmount)}</p>
                        {inv.taxAmount > 0 && (
                          <p className="text-xs text-muted-foreground">incl. {fmtCurrency(inv.taxAmount)} tax</p>
                        )}
                      </div>
                      <MarkPaidDialog invoice={inv} />
                      <PrintButton invoiceId={inv.id} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
