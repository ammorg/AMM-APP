/**
 * Public estimate approval page.
 * Route: /#/approve/:token
 * No login required. Customer can review and approve/decline.
 */
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Wrench, CheckCircle, XCircle, Clock, Car, User, Phone, MapPin, DollarSign,
} from "lucide-react";
import type { EstimateApproval, Customer } from "@shared/schema";

interface ApprovalWithCustomer extends EstimateApproval {
  customer?: Customer;
}

function fmtCurrency(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

function mapsUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

export default function EstimateApprovalPage() {
  const params = useParams<{ token: string }>();
  const token = params.token ?? "";

  const { data: approval, isLoading, error } = useQuery<ApprovalWithCustomer>({
    queryKey: ["/api/estimate-approvals/public", token],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/estimate-approvals/public/${token}`);
      if (!res.ok) throw new Error("Not found");
      return res.json();
    },
    enabled: !!token,
    retry: false,
  });

  const respondMutation = useMutation({
    mutationFn: (action: "approved" | "declined") =>
      apiRequest("POST", `/api/estimate-approvals/public/${token}/respond`, { action }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/estimate-approvals/public", token] });
    },
  });

  // Parse services JSON
  let services: Array<{ name: string; amount?: number }> = [];
  if (approval?.services) {
    try { services = JSON.parse(approval.services); } catch { services = []; }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-md space-y-4">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
    );
  }

  if (error || !approval) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-sm text-center space-y-4">
          <div className="w-14 h-14 rounded-xl bg-destructive/10 flex items-center justify-center mx-auto">
            <XCircle className="text-destructive" size={28} />
          </div>
          <h1 className="text-lg font-bold">Estimate Not Found</h1>
          <p className="text-sm text-muted-foreground">
            This estimate link is invalid or has expired.
          </p>
        </div>
      </div>
    );
  }

  const isPending = approval.status === "pending";
  const isApproved = approval.status === "approved";
  const isDeclined = approval.status === "declined";

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-md mx-auto space-y-4">

        {/* Brand header */}
        <div className="flex items-center gap-3 py-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Wrench className="text-primary" size={20} />
          </div>
          <div>
            <div className="text-sm font-bold tracking-tight">Affordable Mobile Mechanics</div>
            <div className="text-xs text-muted-foreground">Service Estimate</div>
          </div>
        </div>

        {/* Status banner */}
        {isApproved && (
          <Alert className="border-green-500/30 bg-green-50 dark:bg-green-950/20">
            <CheckCircle className="text-green-600 dark:text-green-400" size={16} />
            <AlertDescription className="text-green-700 dark:text-green-400 font-medium">
              Estimate approved — our team will be in touch.
            </AlertDescription>
          </Alert>
        )}
        {isDeclined && (
          <Alert className="border-destructive/30 bg-destructive/5">
            <XCircle className="text-destructive" size={16} />
            <AlertDescription className="text-destructive font-medium">
              Estimate declined.
            </AlertDescription>
          </Alert>
        )}

        {/* Customer info */}
        {approval.customer && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <User size={14} className="text-muted-foreground" />
                Customer
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5 text-sm">
              <p className="font-medium">{approval.customer.name}</p>
              {approval.customer.phone && (
                <a
                  href={`tel:${approval.customer.phone}`}
                  className="flex items-center gap-1.5 text-primary hover:underline text-sm"
                  data-testid="btn-call-customer"
                >
                  <Phone size={13} />
                  {approval.customer.phone}
                </a>
              )}
              {(approval.customer.address || approval.customer.city) && (
                <a
                  href={mapsUrl([approval.customer.address, approval.customer.city].filter(Boolean).join(", "))}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-primary hover:underline text-sm"
                  data-testid="btn-maps-customer"
                >
                  <MapPin size={13} />
                  {[approval.customer.address, approval.customer.city].filter(Boolean).join(", ")}
                </a>
              )}
            </CardContent>
          </Card>
        )}

        {/* Vehicle */}
        {approval.vehicleDescription && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Car size={14} className="text-muted-foreground" />
                Vehicle
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm font-medium">{approval.vehicleDescription}</p>
            </CardContent>
          </Card>
        )}

        {/* Services */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Wrench size={14} className="text-muted-foreground" />
              Services
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-0">
            {services.length > 0 ? (
              <div className="divide-y divide-border">
                {services.map((s, i) => (
                  <div key={i} className="flex items-center justify-between py-2 text-sm">
                    <span>{s.name}</span>
                    {s.amount != null && (
                      <span className="font-medium tabular-nums">{fmtCurrency(s.amount)}</span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Service details not specified.</p>
            )}
            {/* Total */}
            <div className="flex items-center justify-between pt-3 border-t border-border mt-2">
              <div className="flex items-center gap-1.5 text-sm font-semibold">
                <DollarSign size={14} className="text-muted-foreground" />
                Estimated Total
              </div>
              <span className="text-base font-bold text-primary">
                {fmtCurrency(approval.estimateTotal)}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Notes */}
        {approval.notes && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{approval.notes}</p>
            </CardContent>
          </Card>
        )}

        {/* Status badge */}
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Clock size={13} />
            {new Date(approval.createdAt).toLocaleDateString("en-US", {
              month: "long", day: "numeric", year: "numeric"
            })}
          </span>
          <Badge
            variant={isApproved ? "default" : isDeclined ? "destructive" : "outline"}
            className="capitalize"
            data-testid="approval-status-badge"
          >
            {approval.status}
          </Badge>
        </div>

        {/* Action buttons (only when pending) */}
        {isPending && (
          <div className="grid grid-cols-2 gap-3 pt-2">
            <Button
              variant="outline"
              className="border-destructive/50 text-destructive hover:bg-destructive/10"
              onClick={() => respondMutation.mutate("declined")}
              disabled={respondMutation.isPending}
              data-testid="btn-decline-estimate"
            >
              <XCircle size={15} className="mr-1.5" />
              Decline
            </Button>
            <Button
              className="bg-green-600 hover:bg-green-700 text-white"
              onClick={() => respondMutation.mutate("approved")}
              disabled={respondMutation.isPending}
              data-testid="btn-approve-estimate"
            >
              {respondMutation.isPending ? (
                <span className="flex items-center gap-1.5">
                  <span className="h-3.5 w-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  Saving…
                </span>
              ) : (
                <>
                  <CheckCircle size={15} className="mr-1.5" />
                  Approve
                </>
              )}
            </Button>
          </div>
        )}

        <p className="text-center text-xs text-muted-foreground pb-4">
          Affordable Mobile Mechanics · Lafayette, LA · (337) 555-0192
        </p>
      </div>
    </div>
  );
}
