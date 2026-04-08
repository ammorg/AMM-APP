import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { mutationErrorToast } from "@/lib/errorMessages";
import type { Job, Customer, Staff, Vehicle, JobCompletion } from "@shared/schema";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useState, useRef, useEffect } from "react";
import {
  Plus, Briefcase, Search, MapPin, Phone, Share2, Copy,
  ClipboardList, Camera, CreditCard, MessageSquare, CheckCircle2,
  AlertCircle, ExternalLink, QrCode, Send, Mail, X, Trash2
} from "lucide-react";
import QRCode from "qrcode";

// ── Helpers ───────────────────────────────────────────────────────────────────

function statusVariant(s: string): "default" | "secondary" | "destructive" | "outline" {
  switch (s) {
    case "complete": return "default";
    case "in_progress": return "outline";
    case "cancelled": return "destructive";
    default: return "secondary";
  }
}

function priorityVariant(p: string): "default" | "secondary" | "destructive" | "outline" {
  switch (p) {
    case "urgent": return "destructive";
    case "high": return "outline";
    default: return "secondary";
  }
}

function fmtDateTime(dt?: string | null) {
  if (!dt) return "—";
  const d = new Date(dt);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) +
    " " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function fmtCurrency(n?: number | null) {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

function mapsUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

function statusLabel(s: string) {
  const map: Record<string, string> = {
    pending: "Pending", scheduled: "Scheduled", in_progress: "In Progress",
    complete: "Complete", cancelled: "Cancelled",
  };
  return map[s] ?? s;
}

// ── Completion checklist helper ───────────────────────────────────────────────

function completionStatus(job: Job, completion: JobCompletion | null | undefined) {
  const photos: string[] = completion?.vehiclePhotos ? JSON.parse(completion.vehiclePhotos) : [];
  return {
    hasForm: !!completion?.formLink,
    hasPhotos: photos.length > 0,
    paymentStatus: completion?.paymentStatus ?? "pending",
    formLink: completion?.formLink,
    photos,
    photoCount: photos.length,
  };
}

function canComplete(job: Job, completion: JobCompletion | null | undefined): { ok: boolean; missing: string[] } {
  const s = completionStatus(job, completion);
  const missing: string[] = [];
  if (!s.hasPhotos) missing.push("At least one vehicle photo");
  // Form is strongly recommended but not hard-blocked
  return { ok: missing.length === 0, missing };
}

// ── Payment QR Panel ──────────────────────────────────────────────────────────

function PaymentPanel({ job, customer, completion }: {
  job: Job; customer?: Customer; completion: JobCompletion | null | undefined;
}) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [payLink, setPayLink] = useState(completion?.paymentLink ?? "");
  const [amount, setAmount] = useState(String(completion?.paymentAmountDue ?? job.estimateAmount ?? ""));
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  const canEdit = user?.role === "admin" || user?.role === "lead_mechanic";

  const saveMutation = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/jobs/${job.id}/completion`, {
      paymentLink: payLink || null,
      paymentAmountDue: amount ? parseFloat(amount) : null,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs", job.id, "completion"] });
      toast({ title: "Payment info saved" });
    },
    onError: (err) => toast({ ...mutationErrorToast(err, "save payment info"), variant: "destructive" }),
  });

  const markSentMutation = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/jobs/${job.id}/completion`, {
      paymentStatus: "sent", paymentSentAt: new Date().toISOString(),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs", job.id, "completion"] });
      toast({ title: "Payment marked as sent" });
    },
  });

  const markPaidMutation = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/jobs/${job.id}/completion`, {
      paymentStatus: "paid", paymentPaidAt: new Date().toISOString(),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs", job.id, "completion"] });
      toast({ title: "Payment marked as paid" });
    },
  });

  const sendSmsMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/messaging/send", {
      jobId: job.id,
      customerId: job.customerId,
      channel: "sms",
      template: "payment_link",
      toAddress: customer?.phone ?? "",
      messageBody: `Hi ${customer?.name ?? "there"}, your payment of ${fmtCurrency(parseFloat(amount) || 0)} is ready. Pay here: ${payLink}`,
    }),
    onSuccess: (data) => {
      return data.json().then((d: any) => {
        const msg = d.connectorAvailable ? "SMS queued for delivery" : "Message logged (Twilio not connected yet)";
        toast({ title: msg });
        queryClient.invalidateQueries({ queryKey: ["/api/messaging/logs"] });
        markSentMutation.mutate();
      });
    },
    onError: (err) => toast({ ...mutationErrorToast(err, "send SMS"), variant: "destructive" }),
  });

  const sendEmailMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/messaging/send", {
      jobId: job.id,
      customerId: job.customerId,
      channel: "email",
      template: "payment_link",
      toAddress: customer?.email ?? "",
      messageBody: `Hi ${customer?.name ?? "there"}, your payment of ${fmtCurrency(parseFloat(amount) || 0)} is ready. Pay here: ${payLink}`,
    }),
    onSuccess: (data) => {
      return data.json().then((d: any) => {
        const msg = d.connectorAvailable ? "Email queued for delivery" : "Email logged (Zoho Mail not connected yet)";
        toast({ title: msg });
        queryClient.invalidateQueries({ queryKey: ["/api/messaging/logs"] });
        markSentMutation.mutate();
      });
    },
    onError: (err) => toast({ ...mutationErrorToast(err, "send email"), variant: "destructive" }),
  });

  const generateQr = async () => {
    if (!payLink) return;
    const url = await QRCode.toDataURL(payLink, { width: 200, margin: 1 });
    setQrDataUrl(url);
  };

  useEffect(() => {
    if (open && payLink) generateQr();
  }, [open, payLink]);

  const payStatus = completion?.paymentStatus ?? "pending";
  const payStatusColor = payStatus === "paid" ? "text-green-600 dark:text-green-400"
    : payStatus === "sent" ? "text-blue-600 dark:text-blue-400"
    : "text-amber-600 dark:text-amber-400";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-xs h-7 gap-1" data-testid={`btn-payment-${job.id}`}>
          <CreditCard size={12} />
          <span className={payStatusColor}>
            {payStatus === "paid" ? "Paid" : payStatus === "sent" ? "Sent" : "Payment"}
          </span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard size={16} className="text-primary" />
            Payment Collection
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Status pill */}
          <div className={`flex items-center gap-2 text-sm font-medium ${payStatusColor}`}>
            {payStatus === "paid" ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
            Payment status: <span className="capitalize">{payStatus}</span>
          </div>

          {canEdit && (
            <div className="space-y-3">
              <div>
                <Label>Amount Due ($)</Label>
                <Input
                  data-testid="input-payment-amount"
                  type="number"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
              <div>
                <Label>Payment Link (paste Venmo, Square, etc.)</Label>
                <div className="flex gap-2">
                  <Input
                    data-testid="input-payment-link"
                    placeholder="https://venmo.com/..."
                    value={payLink}
                    onChange={(e) => {
                      setPayLink(e.target.value);
                      setQrDataUrl(null);
                    }}
                  />
                  <Button variant="outline" size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                    Save
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* QR Code */}
          {payLink && (
            <div className="space-y-2">
              <Button variant="outline" size="sm" className="gap-1 w-full" onClick={generateQr} data-testid="btn-generate-qr">
                <QrCode size={14} /> Generate QR Code
              </Button>
              {qrDataUrl && (
                <div className="flex flex-col items-center gap-2 p-3 border border-border rounded-md bg-white dark:bg-zinc-900">
                  <img src={qrDataUrl} alt="Payment QR code" className="w-40 h-40" data-testid="img-payment-qr" />
                  <p className="text-xs text-muted-foreground text-center">Customer scans to pay</p>
                </div>
              )}
              <div className="flex gap-2">
                <Input readOnly value={payLink} className="text-xs flex-1" data-testid="text-payment-link" />
                <Button
                  variant="outline" size="sm"
                  onClick={() => { navigator.clipboard.writeText(payLink); toast({ title: "Link copied!" }); }}
                  data-testid="btn-copy-payment-link"
                >
                  <Copy size={13} />
                </Button>
              </div>
            </div>
          )}

          {/* Send actions */}
          {payLink && canEdit && (
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline" size="sm" className="gap-1"
                disabled={!customer?.phone || sendSmsMutation.isPending}
                onClick={() => sendSmsMutation.mutate()}
                data-testid={`btn-send-sms-payment-${job.id}`}
              >
                <MessageSquare size={13} /> Send SMS
              </Button>
              <Button
                variant="outline" size="sm" className="gap-1"
                disabled={!customer?.email || sendEmailMutation.isPending}
                onClick={() => sendEmailMutation.mutate()}
                data-testid={`btn-send-email-payment-${job.id}`}
              >
                <Mail size={13} /> Send Email
              </Button>
            </div>
          )}

          {/* Mark paid */}
          {canEdit && payStatus !== "paid" && (
            <div className="flex gap-2 pt-1">
              {payStatus === "pending" && (
                <Button size="sm" variant="outline" onClick={() => markSentMutation.mutate()} disabled={markSentMutation.isPending}>
                  Mark Sent
                </Button>
              )}
              <Button size="sm" onClick={() => markPaidMutation.mutate()} disabled={markPaidMutation.isPending} className="flex-1"
                data-testid={`btn-mark-paid-${job.id}`}>
                <CheckCircle2 size={13} className="mr-1" />
                {markPaidMutation.isPending ? "Marking..." : "Mark as Paid"}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Form Step Panel ───────────────────────────────────────────────────────────

function FormStepPanel({ job, completion }: { job: Job; completion: JobCompletion | null | undefined }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [formLink, setFormLink] = useState(completion?.formLink ?? "");

  const saveMutation = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/jobs/${job.id}/completion`, {
      formLink: formLink || null,
      formCompletedAt: formLink ? new Date().toISOString() : null,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs", job.id, "completion"] });
      toast({ title: "Form link saved" });
      setOpen(false);
    },
    onError: (err) => toast({ ...mutationErrorToast(err, "save form link"), variant: "destructive" }),
  });

  const hasForm = !!completion?.formLink;

  // Only show for in_progress or complete jobs
  if (job.status !== "in_progress" && job.status !== "complete") return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant={hasForm ? "default" : "outline"}
          size="sm"
          className="text-xs h-7 gap-1"
          data-testid={`btn-form-${job.id}`}
        >
          <ClipboardList size={12} />
          Form {hasForm && <CheckCircle2 size={11} className="text-green-500 dark:text-green-400" />}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardList size={16} className="text-primary" />
            Zoho Form — Completion Walkthrough
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-sm text-muted-foreground">
            Paste the Zoho form link for this job's completion walkthrough / customer signoff. The form documents the
            work performed and collects customer acknowledgement.
          </p>
          <div>
            <Label>Zoho Form URL</Label>
            <Input
              data-testid="input-form-link"
              placeholder="https://forms.zohopublic.com/..."
              value={formLink}
              onChange={(e) => setFormLink(e.target.value)}
            />
          </div>
          {completion?.formLink && (
            <a
              href={completion.formLink}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-primary hover:underline"
              data-testid="link-open-form"
            >
              <ExternalLink size={12} /> Open Form in new tab
            </a>
          )}
          {completion?.formCompletedAt && (
            <p className="text-xs text-muted-foreground">
              Form linked: {fmtDateTime(completion.formCompletedAt)}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} data-testid="btn-save-form-link">
            {saveMutation.isPending ? "Saving..." : "Save Form Link"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Vehicle Photos Panel ──────────────────────────────────────────────────────

function VehiclePhotosPanel({ job, completion }: { job: Job; completion: JobCompletion | null | undefined }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const photos: string[] = completion?.vehiclePhotos ? JSON.parse(completion.vehiclePhotos) : [];

  const uploadPhoto = async (file: File) => {
    setUploading(true);
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      try {
        await apiRequest("POST", `/api/jobs/${job.id}/completion/photos`, { photo: base64 });
        queryClient.invalidateQueries({ queryKey: ["/api/jobs", job.id, "completion"] });
        toast({ title: "Photo uploaded" });
      } catch {
        toast({ title: "Upload failed", variant: "destructive" });
      }
      setUploading(false);
    };
    reader.readAsDataURL(file);
  };

  const deletePhotoMutation = useMutation({
    mutationFn: (idx: number) => apiRequest("DELETE", `/api/jobs/${job.id}/completion/photos/${idx}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs", job.id, "completion"] });
      toast({ title: "Photo removed" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant={photos.length > 0 ? "default" : "outline"}
          size="sm"
          className="text-xs h-7 gap-1"
          data-testid={`btn-photos-${job.id}`}
        >
          <Camera size={12} />
          Photos
          {photos.length > 0
            ? <span className="bg-primary-foreground/20 text-xs px-1 rounded">{photos.length}</span>
            : <AlertCircle size={11} className="text-amber-500" />
          }
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera size={16} className="text-primary" />
            Vehicle Photos
            {photos.length === 0 && (
              <span className="text-xs font-normal text-amber-600 dark:text-amber-400">
                — Required before completion
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {photos.length === 0 && (
            <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md text-sm text-amber-700 dark:text-amber-300">
              <AlertCircle size={14} />
              At least 1 vehicle photo is required before this job can be completed.
            </div>
          )}

          <div className="grid grid-cols-3 gap-2">
            {photos.map((photo, idx) => (
              <div key={idx} className="relative group aspect-square rounded-md overflow-hidden border border-border">
                <img src={photo} alt={`Vehicle photo ${idx + 1}`} className="w-full h-full object-cover" />
                <button
                  className="absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => deletePhotoMutation.mutate(idx)}
                  data-testid={`btn-delete-photo-${idx}`}
                >
                  <X size={10} />
                </button>
              </div>
            ))}
          </div>

          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && uploadPhoto(e.target.files[0])}
            data-testid="input-photo-file"
          />
          <Button
            variant="outline"
            className="w-full gap-2"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            data-testid="btn-upload-photo"
          >
            <Camera size={14} />
            {uploading ? "Uploading..." : "Upload Photo"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Completion Checklist Panel ────────────────────────────────────────────────

function CompletionChecklist({ job, completion }: { job: Job; completion: JobCompletion | null | undefined }) {
  const photos: string[] = completion?.vehiclePhotos ? JSON.parse(completion.vehiclePhotos) : [];
  const checks = [
    { label: "Job accepted", done: true },
    { label: "Work in progress / performed", done: job.status === "in_progress" || job.status === "complete" },
    { label: "Form link added", done: !!completion?.formLink },
    { label: "Vehicle photos uploaded", done: photos.length > 0, required: true },
    { label: "Payment link issued / collected", done: (completion?.paymentStatus ?? "pending") !== "pending" },
  ];

  return (
    <div className="flex flex-wrap gap-1 mt-1.5">
      {checks.map((c, i) => (
        <span
          key={i}
          className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border font-medium
            ${c.done
              ? "bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800"
              : c.required
              ? "bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800"
              : "bg-muted text-muted-foreground border-border"
            }`}
        >
          {c.done ? <CheckCircle2 size={9} /> : <AlertCircle size={9} />}
          {c.label}
        </span>
      ))}
    </div>
  );
}

// ── Quick SMS/Email Action Button ────────────────────────────────────────────

function QuickMessageButton({ job, customer, template }: {
  job: Job; customer?: Customer; template: "estimate_ready" | "job_scheduled";
}) {
  const { toast } = useToast();
  const { user } = useAuth();
  const canSend = user?.role === "admin" || user?.role === "lead_mechanic";
  if (!canSend) return null;

  const templates: Record<string, { sms: string; subject: string }> = {
    estimate_ready: {
      sms: `Hi ${customer?.name ?? "there"}, your estimate for ${job.serviceType} is ready: ${fmtCurrency(job.estimateAmount)}. Reply to approve.`,
      subject: "Your Estimate is Ready",
    },
    job_scheduled: {
      sms: `Hi ${customer?.name ?? "there"}, your ${job.serviceType} is scheduled for ${fmtDateTime(job.scheduledAt)}. We'll be there soon!`,
      subject: "Job Scheduled Confirmation",
    },
  };

  const msg = templates[template];

  const sendSms = useMutation({
    mutationFn: () => apiRequest("POST", "/api/messaging/send", {
      jobId: job.id,
      customerId: job.customerId,
      channel: "sms",
      template,
      toAddress: customer?.phone ?? "",
      messageBody: msg.sms,
    }),
    onSuccess: (res) => res.json().then((d: any) => {
      toast({ title: d.connectorAvailable ? "SMS sent" : "SMS logged (Twilio not connected)" });
      queryClient.invalidateQueries({ queryKey: ["/api/messaging/logs"] });
    }),
    onError: (err) => toast({ ...mutationErrorToast(err, "send SMS"), variant: "destructive" }),
  });

  const sendEmail = useMutation({
    mutationFn: () => apiRequest("POST", "/api/messaging/send", {
      jobId: job.id,
      customerId: job.customerId,
      channel: "email",
      template,
      toAddress: customer?.email ?? "",
      messageBody: msg.sms,
    }),
    onSuccess: (res) => res.json().then((d: any) => {
      toast({ title: d.connectorAvailable ? "Email sent" : "Email logged (Zoho Mail not connected)" });
      queryClient.invalidateQueries({ queryKey: ["/api/messaging/logs"] });
    }),
    onError: (err) => toast({ ...mutationErrorToast(err, "send email"), variant: "destructive" }),
  });

  return (
    <div className="flex gap-1">
      <Button
        variant="ghost" size="sm" className="text-xs h-7 gap-1"
        disabled={!customer?.phone || sendSms.isPending}
        onClick={() => sendSms.mutate()}
        data-testid={`btn-sms-${template}-${job.id}`}
        title={`Send SMS: ${template.replace("_", " ")}`}
      >
        <MessageSquare size={11} />
        SMS
      </Button>
      {customer?.email && (
        <Button
          variant="ghost" size="sm" className="text-xs h-7 gap-1"
          disabled={sendEmail.isPending}
          onClick={() => sendEmail.mutate()}
          data-testid={`btn-email-${template}-${job.id}`}
          title={`Send Email: ${template.replace("_", " ")}`}
        >
          <Mail size={11} />
          Email
        </Button>
      )}
    </div>
  );
}

// ── Share Estimate Dialog ─────────────────────────────────────────────────────
function ShareEstimateDialog({ job, customer, vehicle }: { job: Job; customer?: Customer; vehicle?: Vehicle }) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [generatedToken, setGeneratedToken] = useState<string | null>(null);

  const canShare = user?.role === "admin" || user?.role === "lead_mechanic";
  if (!canShare || !job.estimateAmount) return null;

  const mutation = useMutation({
    mutationFn: () => {
      const services = [{ name: job.serviceType, amount: job.estimateAmount ?? 0 }];
      const vehicleDesc = vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : undefined;
      return apiRequest("POST", "/api/estimate-approvals", {
        jobId: job.id,
        customerId: job.customerId,
        vehicleDescription: vehicleDesc,
        services: JSON.stringify(services),
        estimateTotal: job.estimateAmount,
        notes: job.notes ?? null,
        status: "pending",
        createdAt: new Date().toISOString(),
      }).then(r => r.json());
    },
    onSuccess: (data) => setGeneratedToken(data.token),
    onError: (err) => toast({ ...mutationErrorToast(err, "create approval link"), variant: "destructive" }),
  });

  const approvalUrl = generatedToken
    ? `${window.location.origin}${window.location.pathname}#/approve/${generatedToken}`
    : null;

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setGeneratedToken(null); }}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-xs h-7" data-testid={`btn-share-estimate-${job.id}`}>
          <Share2 size={12} className="mr-1" /> Share Est.
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>Customer Estimate Approval</DialogTitle></DialogHeader>
        {!generatedToken ? (
          <>
            <p className="text-sm text-muted-foreground py-2">
              Generate a shareable link for <strong>{customer?.name ?? "customer"}</strong> to review and approve the estimate of <strong>{fmtCurrency(job.estimateAmount)}</strong> for {job.serviceType}.
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={() => mutation.mutate()} disabled={mutation.isPending} data-testid="btn-generate-approval">
                {mutation.isPending ? "Generating..." : "Generate Link"}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground py-2">Share this link with the customer:</p>
            <div className="flex gap-2">
              <Input readOnly value={approvalUrl ?? ""} className="text-xs" data-testid="approval-link" />
              <Button
                variant="outline" size="sm"
                onClick={() => { navigator.clipboard.writeText(approvalUrl ?? ""); toast({ title: "Link copied!" }); }}
                data-testid="btn-copy-approval-link"
              ><Copy size={13} /></Button>
            </div>
            <DialogFooter className="pt-2">
              <Button variant="outline" onClick={() => setOpen(false)}>Close</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Create Job Dialog ─────────────────────────────────────────────────────────
function CreateJobDialog() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    customerId: "", vehicleId: "", assignedStaffId: "", serviceType: "",
    status: "pending", priority: "normal", scheduledAt: "", estimateAmount: "", notes: "",
  });

  const { data: customers = [] } = useQuery<Customer[]>({ queryKey: ["/api/customers"] });
  const { data: staffList = [] } = useQuery<Staff[]>({ queryKey: ["/api/staff"] });
  const { data: allVehicles = [] } = useQuery<Vehicle[]>({ queryKey: ["/api/vehicles"] });

  const customerVehicles = allVehicles.filter(
    (v) => form.customerId && v.customerId === parseInt(form.customerId)
  );

  const mutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => apiRequest("POST", "/api/jobs", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      toast({ title: "Job created" });
      setOpen(false);
      setForm({ customerId: "", vehicleId: "", assignedStaffId: "", serviceType: "", status: "pending", priority: "normal", scheduledAt: "", estimateAmount: "", notes: "" });
    },
    onError: (err) => toast({ ...mutationErrorToast(err, "create job"), variant: "destructive" }),
  });

  const handleSubmit = () => {
    if (!form.customerId || !form.serviceType) {
      toast({ title: "Customer and service type are required", variant: "destructive" });
      return;
    }
    mutation.mutate({
      customerId: parseInt(form.customerId),
      vehicleId: form.vehicleId ? parseInt(form.vehicleId) : null,
      assignedStaffId: form.assignedStaffId ? parseInt(form.assignedStaffId) : null,
      serviceType: form.serviceType,
      status: form.status,
      priority: form.priority,
      scheduledAt: form.scheduledAt || null,
      estimateAmount: form.estimateAmount ? parseFloat(form.estimateAmount) : null,
      notes: form.notes || null,
      createdAt: new Date().toISOString(),
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" data-testid="btn-create-job">
          <Plus size={14} className="mr-1" /> New Job
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>Create Service Job</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label htmlFor="serviceType">Service Type *</Label>
              <Input id="serviceType" data-testid="input-service-type" placeholder="e.g. Oil Change, Brake Replacement"
                value={form.serviceType} onChange={(e) => setForm((f) => ({ ...f, serviceType: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="customer">Customer *</Label>
              <Select value={form.customerId} onValueChange={(v) => setForm((f) => ({ ...f, customerId: v, vehicleId: "" }))}>
                <SelectTrigger data-testid="select-customer" id="customer"><SelectValue placeholder="Select customer" /></SelectTrigger>
                <SelectContent>{customers.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="vehicle">Vehicle</Label>
              <Select value={form.vehicleId} onValueChange={(v) => setForm((f) => ({ ...f, vehicleId: v }))}>
                <SelectTrigger data-testid="select-vehicle" id="vehicle"><SelectValue placeholder="Select vehicle" /></SelectTrigger>
                <SelectContent>{customerVehicles.map((v) => <SelectItem key={v.id} value={String(v.id)}>{v.year} {v.make} {v.model}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="tech">Assigned Tech</Label>
              <Select value={form.assignedStaffId} onValueChange={(v) => setForm((f) => ({ ...f, assignedStaffId: v }))}>
                <SelectTrigger data-testid="select-tech" id="tech"><SelectValue placeholder="Select tech" /></SelectTrigger>
                <SelectContent>{staffList.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="estimate">Estimate ($)</Label>
              <Input id="estimate" data-testid="input-estimate" type="number" placeholder="0.00"
                value={form.estimateAmount} onChange={(e) => setForm((f) => ({ ...f, estimateAmount: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="status">Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
                <SelectTrigger data-testid="select-status" id="status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="scheduled">Scheduled</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="complete">Complete</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="priority">Priority</Label>
              <Select value={form.priority} onValueChange={(v) => setForm((f) => ({ ...f, priority: v }))}>
                <SelectTrigger data-testid="select-priority" id="priority"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <Label htmlFor="scheduledAt">Scheduled Time</Label>
              <Input id="scheduledAt" data-testid="input-scheduled-at" type="datetime-local"
                value={form.scheduledAt} onChange={(e) => setForm((f) => ({ ...f, scheduledAt: e.target.value }))} />
            </div>
            <div className="col-span-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" data-testid="input-notes" placeholder="Additional details..." rows={2}
                value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={mutation.isPending} data-testid="btn-submit-job">
            {mutation.isPending ? "Creating..." : "Create Job"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Update Status Dialog ──────────────────────────────────────────────────────
function UpdateStatusDialog({ job, completion }: { job: Job; completion: JobCompletion | null | undefined }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState(job.status);

  const { ok: canComplete_, missing } = canComplete(job, completion);

  const mutation = useMutation({
    mutationFn: () => {
      // Block complete if missing requirements
      if (status === "complete" && !canComplete_) {
        throw new Error("Missing: " + missing.join(", "));
      }
      return apiRequest("PATCH", `/api/jobs/${job.id}`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      toast({ title: "Status updated" });
      setOpen(false);
    },
    onError: (err) => toast({ ...mutationErrorToast(err, "update job"), variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" data-testid={`btn-update-status-${job.id}`}>
          Update Status
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>Update Job Status</DialogTitle></DialogHeader>
        <div className="py-2 space-y-3">
          <div>
            <Label>Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger data-testid="select-new-status"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="scheduled">Scheduled</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="complete">Complete</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {status === "complete" && !canComplete_ && (
            <div className="p-2 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded text-xs text-amber-700 dark:text-amber-300 space-y-1">
              <p className="font-medium flex items-center gap-1"><AlertCircle size={12} /> Completion blocked — missing:</p>
              {missing.map(m => <p key={m} className="pl-3">• {m}</p>)}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending} data-testid="btn-confirm-status">
            {mutation.isPending ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Jobs Page ─────────────────────────────────────────────────────────────────
export default function Jobs() {
  const { user, isAdmin } = useAuth();
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterPriority, setFilterPriority] = useState("all");

  const { data: jobs = [], isLoading } = useQuery<Job[]>({ queryKey: ["/api/jobs"] });
  const { data: customers = [] } = useQuery<Customer[]>({ queryKey: ["/api/customers"] });
  const { data: staffList = [] } = useQuery<Staff[]>({ queryKey: ["/api/staff"] });
  const { data: allVehicles = [] } = useQuery<Vehicle[]>({ queryKey: ["/api/vehicles"] });

  // Fetch all completion records in one shot to avoid N+1
  const jobIds = jobs.map(j => j.id);
  const completionQueries = useQuery<Record<number, JobCompletion | null>>({
    queryKey: ["/api/job-completions-map", jobIds.join(",")],
    queryFn: async () => {
      if (jobIds.length === 0) return {};
      // Fetch one by one (small N in practice)
      const results: Record<number, JobCompletion | null> = {};
      await Promise.all(jobIds.map(async (id) => {
        try {
          const res = await apiRequest("GET", `/api/jobs/${id}/completion`);
          results[id] = await res.json();
        } catch {
          results[id] = null;
        }
      }));
      return results;
    },
    enabled: jobIds.length > 0,
  });
  const completionMap = completionQueries.data ?? {};

  const filtered = jobs.filter((j) => {
    const cust = customers.find((c) => c.id === j.customerId)?.name ?? "";
    const tech = staffList.find((s) => s.id === j.assignedStaffId)?.name ?? "";
    const matchSearch = !search ||
      j.serviceType.toLowerCase().includes(search.toLowerCase()) ||
      cust.toLowerCase().includes(search.toLowerCase()) ||
      tech.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === "all" || j.status === filterStatus;
    const matchPriority = filterPriority === "all" || j.priority === filterPriority;
    return matchSearch && matchStatus && matchPriority;
  });

  return (
    <div className="p-5 max-w-7xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold tracking-tight" data-testid="page-title-jobs">
            {isAdmin() ? "Service Jobs" : "My Assigned Jobs"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {jobs.length} {isAdmin() ? "total" : "assigned"} jobs
            {!isAdmin() && <span className="ml-2 text-xs bg-muted px-1.5 py-0.5 rounded border border-border">Scoped to you</span>}
          </p>
        </div>
        <CreateJobDialog />
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input data-testid="input-search-jobs" placeholder="Search jobs, customers, techs..."
            className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-36" data-testid="filter-status"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="scheduled">Scheduled</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="complete">Complete</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterPriority} onValueChange={setFilterPriority}>
          <SelectTrigger className="w-36" data-testid="filter-priority"><SelectValue placeholder="Priority" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Priorities</SelectItem>
            <SelectItem value="urgent">Urgent</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="normal">Normal</SelectItem>
            <SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Jobs Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <Briefcase size={32} className="mx-auto mb-2 opacity-40" />
              <p>No jobs found</p>
            </div>
          ) : (
            <div className="divide-y divide-border" data-testid="jobs-list">
              {filtered.map((job) => {
                const cust = customers.find((c) => c.id === job.customerId);
                const tech = staffList.find((s) => s.id === job.assignedStaffId);
                const veh = allVehicles.find((v) => v.id === job.vehicleId);
                const completion = completionMap[job.id] ?? null;
                const isActive = job.status === "in_progress" || job.status === "scheduled";
                const isComplete = job.status === "complete";

                return (
                  <div key={job.id} className="px-4 py-3 flex flex-wrap items-start gap-3" data-testid={`job-row-${job.id}`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{job.serviceType}</span>
                        <Badge variant={statusVariant(job.status)} className="text-xs">
                          {statusLabel(job.status)}
                        </Badge>
                        <Badge variant={priorityVariant(job.priority)} className="text-xs capitalize">
                          {job.priority}
                        </Badge>
                        {/* Payment status badge */}
                        {(isActive || isComplete) && completion?.paymentStatus && completion.paymentStatus !== "pending" && (
                          <Badge variant="outline" className={`text-xs capitalize ${completion.paymentStatus === "paid" ? "border-green-500 text-green-600 dark:text-green-400" : "border-blue-400 text-blue-600 dark:text-blue-400"}`}>
                            {completion.paymentStatus}
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5 flex flex-wrap gap-x-3">
                        <span>{cust?.name ?? "—"}</span>
                        {veh && <span>{veh.year} {veh.make} {veh.model}</span>}
                        <span>Tech: {tech?.name ?? "Unassigned"}</span>
                        {job.scheduledAt && <span>📅 {fmtDateTime(job.scheduledAt)}</span>}
                        {job.estimateAmount != null && <span>Est. {fmtCurrency(job.estimateAmount)}</span>}
                      </div>
                      {/* Maps + Call */}
                      <div className="flex flex-wrap gap-3 mt-1.5">
                        {cust?.phone && (
                          <a href={`tel:${cust.phone}`}
                            className="flex items-center gap-1 text-xs text-primary hover:underline"
                            data-testid={`call-customer-job-${job.id}`}>
                            <Phone size={11} />{cust.phone}
                          </a>
                        )}
                        {(job.address || cust?.address || cust?.city) && (
                          <a href={mapsUrl(job.address ?? [cust?.address, cust?.city].filter(Boolean).join(", ") ?? "")}
                            target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-1 text-xs text-primary hover:underline"
                            data-testid={`maps-job-${job.id}`}>
                            <MapPin size={11} />
                            {job.address ?? cust?.city ?? "Maps"}
                          </a>
                        )}
                      </div>
                      {job.notes && (
                        <p className="text-xs text-muted-foreground mt-1 italic truncate max-w-xl">{job.notes}</p>
                      )}
                      {/* Phase 4: Completion checklist (in_progress or complete) */}
                      {(isActive || isComplete) && (
                        <CompletionChecklist job={job} completion={completion} />
                      )}
                    </div>
                    <div className="flex items-start gap-1 flex-wrap flex-col sm:flex-row">
                      {/* Estimate share + quick SMS for pending/scheduled */}
                      <ShareEstimateDialog job={job} customer={cust} vehicle={veh} />
                      {(job.status === "pending" || job.status === "scheduled") && (
                        <QuickMessageButton job={job} customer={cust} template={job.status === "pending" ? "estimate_ready" : "job_scheduled"} />
                      )}
                      {/* Phase 4: Form, Photos, Payment for active/complete jobs */}
                      {(isActive || isComplete) && (
                        <>
                          <FormStepPanel job={job} completion={completion} />
                          <VehiclePhotosPanel job={job} completion={completion} />
                          <PaymentPanel job={job} customer={cust} completion={completion} />
                        </>
                      )}
                      <UpdateStatusDialog job={job} completion={completion} />
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
