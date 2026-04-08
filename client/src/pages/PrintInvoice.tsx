/**
 * Printable invoice/receipt view.
 * Route: /#/print/invoice/:id
 * Auth-gated (admin). Renders cleanly for browser print.
 */
import { useQuery } from "@tanstack/react-query";
import { useParams } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Printer, ArrowLeft, CheckCircle } from "lucide-react";
import type { Invoice, Customer, Job } from "@shared/schema";
import { useLocation } from "wouter";

function fmtCurrency(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

function fmtDate(dt: string) {
  return new Date(dt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function statusVariant(s: string): "default" | "secondary" | "destructive" | "outline" {
  switch (s) {
    case "paid": return "default";
    case "sent": return "outline";
    case "overdue": return "destructive";
    default: return "secondary";
  }
}

export default function PrintInvoice() {
  const params = useParams<{ id: string }>();
  const invoiceId = parseInt(params.id ?? "0");
  const [, navigate] = useLocation();

  const { data: invoice, isLoading: invLoading } = useQuery<Invoice>({
    queryKey: ["/api/invoices", invoiceId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/invoices/${invoiceId}`);
      if (!res.ok) throw new Error("Not found");
      return res.json();
    },
    enabled: !!invoiceId,
  });

  const { data: customers = [] } = useQuery<Customer[]>({ queryKey: ["/api/customers"] });
  const { data: jobs = [] } = useQuery<Job[]>({ queryKey: ["/api/jobs"] });

  const customer = customers.find(c => c.id === invoice?.customerId);
  const job = jobs.find(j => j.id === invoice?.jobId);

  const isReceipt = invoice?.status === "paid";

  if (invLoading) {
    return (
      <div className="p-8 max-w-2xl mx-auto space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        <p>Invoice not found.</p>
        <Button variant="ghost" onClick={() => navigate("/finance")}>Back to Finance</Button>
      </div>
    );
  }

  return (
    <>
      {/* Print controls — hidden when printing */}
      <div className="no-print flex items-center gap-3 px-6 py-4 border-b border-border bg-card">
        <Button variant="ghost" size="sm" onClick={() => navigate("/finance")} data-testid="btn-back-to-finance">
          <ArrowLeft size={15} className="mr-1.5" /> Finance
        </Button>
        <span className="text-sm font-medium flex-1">
          {isReceipt ? "Receipt" : "Invoice"} · {invoice.invoiceNumber}
        </span>
        <Button size="sm" onClick={() => window.print()} data-testid="btn-print">
          <Printer size={15} className="mr-1.5" /> Print
        </Button>
      </div>

      {/* Printable document */}
      <div
        className="print-area max-w-2xl mx-auto p-8 bg-white dark:bg-background text-foreground"
        data-testid="print-invoice-area"
        id="print-area"
      >
        {/* Letterhead */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <div className="text-xl font-black tracking-tight text-primary uppercase leading-tight">
              Affordable Mobile<br />Mechanics
            </div>
            <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
              <div>Lafayette, Louisiana · 30 mi radius</div>
              <div>(337) 555-0192</div>
              <div>dispatch@affordablemobilemechanics.com</div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold uppercase tracking-widest text-muted-foreground/40">
              {isReceipt ? "Receipt" : "Invoice"}
            </div>
            <div className="text-sm font-mono font-bold mt-1">{invoice.invoiceNumber}</div>
            <Badge variant={statusVariant(invoice.status)} className="mt-1 capitalize text-xs">
              {invoice.status}
            </Badge>
          </div>
        </div>

        <hr className="border-border mb-6" />

        {/* Bill to + dates */}
        <div className="grid grid-cols-2 gap-6 mb-8">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2">Bill To</div>
            {customer ? (
              <div className="space-y-0.5 text-sm">
                <div className="font-semibold">{customer.name}</div>
                {customer.address && <div className="text-muted-foreground">{customer.address}</div>}
                {customer.city && <div className="text-muted-foreground">{customer.city}</div>}
                {customer.phone && <div className="text-muted-foreground">{customer.phone}</div>}
                {customer.email && <div className="text-muted-foreground">{customer.email}</div>}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">—</div>
            )}
          </div>
          <div className="text-right space-y-2">
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Issue Date</div>
              <div className="text-sm font-medium">{fmtDate(invoice.issuedAt)}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Due Date</div>
              <div className="text-sm font-medium">{fmtDate(invoice.dueAt)}</div>
            </div>
            {invoice.paidAt && (
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Paid On</div>
                <div className="text-sm font-medium text-green-600 dark:text-green-400 flex items-center justify-end gap-1">
                  <CheckCircle size={12} /> {fmtDate(invoice.paidAt)}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Service line items */}
        <div className="border border-border rounded-lg overflow-hidden mb-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/40">
                <th className="text-left px-4 py-2.5 text-xs uppercase tracking-wide text-muted-foreground font-semibold">Description</th>
                <th className="text-right px-4 py-2.5 text-xs uppercase tracking-wide text-muted-foreground font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody>
              {job ? (
                <tr className="border-t border-border">
                  <td className="px-4 py-3">
                    <div className="font-medium">{job.serviceType}</div>
                    {job.notes && <div className="text-xs text-muted-foreground mt-0.5">{job.notes}</div>}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmtCurrency(invoice.amount)}</td>
                </tr>
              ) : (
                <tr className="border-t border-border">
                  <td className="px-4 py-3">
                    <div className="font-medium">Services Rendered</div>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmtCurrency(invoice.amount)}</td>
                </tr>
              )}
            </tbody>
            <tfoot>
              {invoice.taxAmount > 0 && (
                <tr className="border-t border-border">
                  <td className="px-4 py-2 text-right text-muted-foreground text-xs">Subtotal</td>
                  <td className="px-4 py-2 text-right tabular-nums text-xs text-muted-foreground">{fmtCurrency(invoice.amount)}</td>
                </tr>
              )}
              {invoice.taxAmount > 0 && (
                <tr className="border-t border-border">
                  <td className="px-4 py-2 text-right text-muted-foreground text-xs">Tax</td>
                  <td className="px-4 py-2 text-right tabular-nums text-xs text-muted-foreground">{fmtCurrency(invoice.taxAmount)}</td>
                </tr>
              )}
              <tr className="border-t-2 border-border bg-muted/30">
                <td className="px-4 py-3 text-right font-bold">Total</td>
                <td className="px-4 py-3 text-right font-bold text-base tabular-nums">{fmtCurrency(invoice.totalAmount)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Notes */}
        {invoice.notes && (
          <div className="mb-6">
            <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-1">Notes</div>
            <p className="text-sm text-muted-foreground">{invoice.notes}</p>
          </div>
        )}

        {/* Payment confirmed (receipt) */}
        {isReceipt && (
          <div className="border border-green-400/40 rounded-lg bg-green-50 dark:bg-green-950/20 p-4 flex items-center gap-3">
            <CheckCircle className="text-green-600 dark:text-green-400 shrink-0" size={20} />
            <div>
              <div className="text-sm font-semibold text-green-700 dark:text-green-400">Payment Received</div>
              <div className="text-xs text-green-600/80 dark:text-green-500">{invoice.paidAt ? fmtDate(invoice.paidAt) : ""} · {fmtCurrency(invoice.totalAmount)}</div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="mt-10 pt-4 border-t border-border text-center text-xs text-muted-foreground space-y-0.5">
          <div>Thank you for choosing Affordable Mobile Mechanics.</div>
          <div>(337) 555-0192 · dispatch@affordablemobilemechanics.com · Lafayette, LA</div>
        </div>
      </div>

      {/* Print-specific styles injected inline */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          .print-area {
            max-width: 100% !important;
            padding: 0 !important;
            margin: 0 !important;
          }
        }
      `}</style>
    </>
  );
}
