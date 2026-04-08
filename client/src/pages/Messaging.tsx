import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { MessagingLog, Customer, Job } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import {
  MessageSquare, Mail, Send, CheckCircle2, AlertCircle, Clock, Plus
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// ── Message templates ─────────────────────────────────────────────────────────
const TEMPLATES: Record<string, { label: string; smsBody: string; emailBody: string; icon: React.ElementType }> = {
  estimate_ready: {
    label: "Estimate Ready",
    smsBody: "Hi {name}, your estimate for {service} is ready: {amount}. Reply to approve or call us.",
    emailBody: "Hi {name},\n\nYour estimate for {service} is ready: {amount}.\n\nPlease reply to approve or give us a call.\n\nThanks,\nAffordable Mobile Mechanics",
    icon: MessageSquare,
  },
  job_scheduled: {
    label: "Job Scheduled",
    smsBody: "Hi {name}, your {service} is scheduled for {date}. Our tech will arrive within the window. Call us with any questions.",
    emailBody: "Hi {name},\n\nYour {service} is scheduled for {date}.\n\nOur technician will arrive within the scheduled window. Call us if you have any questions.\n\nThanks,\nAffordable Mobile Mechanics",
    icon: Clock,
  },
  payment_link: {
    label: "Payment Link",
    smsBody: "Hi {name}, your payment of {amount} is ready. Pay here: {link}",
    emailBody: "Hi {name},\n\nYour payment of {amount} is now due. Please use the link below to pay:\n\n{link}\n\nThank you!\nAffordable Mobile Mechanics",
    icon: MessageSquare,
  },
  custom: {
    label: "Custom Message",
    smsBody: "",
    emailBody: "",
    icon: Send,
  },
};

function statusIcon(s: string) {
  if (s === "sent") return <CheckCircle2 size={12} className="text-green-600 dark:text-green-400" />;
  if (s === "failed") return <AlertCircle size={12} className="text-destructive" />;
  return <Clock size={12} className="text-amber-600 dark:text-amber-400" />;
}

function statusBadge(s: string) {
  const variants: Record<string, string> = {
    sent: "bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800",
    failed: "bg-red-50 dark:bg-red-950/30 text-destructive border-destructive/30",
    queued: "bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800",
  };
  return (
    <span className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border font-medium capitalize ${variants[s] ?? variants.queued}`}>
      {statusIcon(s)} {s}
    </span>
  );
}

function fmtDt(dt: string | null) {
  if (!dt) return "—";
  return new Date(dt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

// ── Compose Dialog ────────────────────────────────────────────────────────────
function ComposeDialog() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [channel, setChannel] = useState<"sms" | "email">("sms");
  const [template, setTemplate] = useState("estimate_ready");
  const [toAddress, setToAddress] = useState("");
  const [messageBody, setMessageBody] = useState(TEMPLATES.estimate_ready.smsBody);
  const [jobId, setJobId] = useState("");
  const [customerId, setCustomerId] = useState("");

  const { data: customers = [] } = useQuery<Customer[]>({ queryKey: ["/api/customers"] });
  const { data: jobs = [] } = useQuery<Job[]>({ queryKey: ["/api/jobs"] });

  const handleTemplateChange = (t: string) => {
    setTemplate(t);
    const tmpl = TEMPLATES[t];
    if (tmpl) {
      setMessageBody(channel === "sms" ? tmpl.smsBody : tmpl.emailBody);
    }
  };

  const handleChannelChange = (c: string) => {
    setChannel(c as "sms" | "email");
    const tmpl = TEMPLATES[template];
    if (tmpl) {
      setMessageBody(c === "sms" ? tmpl.smsBody : tmpl.emailBody);
    }
    setToAddress("");
  };

  const handleCustomerChange = (cid: string) => {
    setCustomerId(cid);
    const c = customers.find(x => x.id === parseInt(cid));
    if (c) setToAddress(channel === "sms" ? (c.phone ?? "") : (c.email ?? ""));
  };

  const sendMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/messaging/send", {
      jobId: jobId ? parseInt(jobId) : undefined,
      customerId: customerId ? parseInt(customerId) : undefined,
      channel,
      template,
      toAddress,
      messageBody,
    }),
    onSuccess: (res) => res.json().then((d: any) => {
      const connected = d.connectorAvailable;
      const label = channel === "sms" ? "Twilio" : "Zoho Mail";
      toast({
        title: connected ? `${channel.toUpperCase()} sent!` : `Message logged (${label} not yet connected)`,
        description: connected ? undefined : "Message queued. Connect the integration in Settings to deliver live.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/messaging/logs"] });
      setOpen(false);
    }),
    onError: () => toast({ title: "Send failed", variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" data-testid="btn-compose-message">
          <Plus size={14} className="mr-1" /> Compose
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send size={16} className="text-primary" />
            Compose Message
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Channel</Label>
              <Select value={channel} onValueChange={handleChannelChange}>
                <SelectTrigger data-testid="select-channel"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sms">
                    <span className="flex items-center gap-1"><MessageSquare size={12} /> SMS</span>
                  </SelectItem>
                  <SelectItem value="email">
                    <span className="flex items-center gap-1"><Mail size={12} /> Email</span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Template</Label>
              <Select value={template} onValueChange={handleTemplateChange}>
                <SelectTrigger data-testid="select-template"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(TEMPLATES).map(([key, t]) => (
                    <SelectItem key={key} value={key}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Customer (optional)</Label>
              <Select value={customerId} onValueChange={handleCustomerChange}>
                <SelectTrigger data-testid="select-msg-customer"><SelectValue placeholder="Select customer" /></SelectTrigger>
                <SelectContent>
                  {customers.map(c => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Job (optional)</Label>
              <Select value={jobId} onValueChange={setJobId}>
                <SelectTrigger data-testid="select-msg-job"><SelectValue placeholder="Link to job" /></SelectTrigger>
                <SelectContent>
                  {jobs.map(j => (
                    <SelectItem key={j.id} value={String(j.id)}>#{j.id} {j.serviceType}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>{channel === "sms" ? "Phone Number" : "Email Address"}</Label>
            <Input
              data-testid="input-to-address"
              placeholder={channel === "sms" ? "(337) 555-0000" : "customer@email.com"}
              value={toAddress}
              onChange={(e) => setToAddress(e.target.value)}
            />
          </div>

          <div>
            <Label>Message</Label>
            <Textarea
              data-testid="input-message-body"
              rows={4}
              value={messageBody}
              onChange={(e) => setMessageBody(e.target.value)}
              placeholder="Message text..."
            />
            <p className="text-xs text-muted-foreground mt-1">
              Replace {"{name}"}, {"{service}"}, {"{amount}"}, {"{date}"}, {"{link}"} with actual values before sending.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            onClick={() => sendMutation.mutate()}
            disabled={sendMutation.isPending || !toAddress || !messageBody}
            data-testid="btn-send-message"
            className="gap-1"
          >
            <Send size={14} />
            {sendMutation.isPending ? "Sending..." : "Send / Log"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Messaging Page ────────────────────────────────────────────────────────────
export default function Messaging() {
  const { data: logs = [], isLoading } = useQuery<MessagingLog[]>({
    queryKey: ["/api/messaging/logs"],
  });
  const { data: customers = [] } = useQuery<Customer[]>({ queryKey: ["/api/customers"] });

  const smslogs = logs.filter(l => l.channel === "sms");
  const emaillogs = logs.filter(l => l.channel === "email");

  const sentCount = logs.filter(l => l.status === "sent").length;
  const queuedCount = logs.filter(l => l.status === "queued").length;

  return (
    <div className="p-5 max-w-5xl mx-auto space-y-5">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold tracking-tight" data-testid="page-title-messaging">
            Messaging
          </h1>
          <p className="text-sm text-muted-foreground">
            SMS and email notifications via Twilio and Zoho Mail
          </p>
        </div>
        <ComposeDialog />
      </div>

      {/* Integration status hint */}
      <div className="flex gap-3 flex-wrap">
        {[
          { label: "Twilio SMS", env: "TWILIO_ACCOUNT_SID" },
          { label: "Zoho Mail", env: "ZOHO_MAIL_TOKEN" },
        ].map(({ label }) => (
          <div key={label} className="flex items-center gap-1.5 text-xs text-muted-foreground border border-border rounded px-2.5 py-1.5">
            <AlertCircle size={11} className="text-amber-500 shrink-0" />
            {label}: configure in Integrations to go live
          </div>
        ))}
        <div className="flex items-center gap-3 ml-auto text-xs text-muted-foreground">
          <span>Sent: <strong className="text-foreground">{sentCount}</strong></span>
          <span>Queued: <strong className="text-foreground">{queuedCount}</strong></span>
          <span>Total: <strong className="text-foreground">{logs.length}</strong></span>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="all">
        <TabsList>
          <TabsTrigger value="all">All ({logs.length})</TabsTrigger>
          <TabsTrigger value="sms">SMS ({smslogs.length})</TabsTrigger>
          <TabsTrigger value="email">Email ({emaillogs.length})</TabsTrigger>
        </TabsList>

        {(["all", "sms", "email"] as const).map(tab => {
          const items = tab === "all" ? logs : tab === "sms" ? smslogs : emaillogs;
          return (
            <TabsContent key={tab} value={tab}>
              <Card>
                <CardContent className="p-0">
                  {isLoading ? (
                    <div className="p-4 space-y-3">
                      {[1, 2, 3].map(i => <Skeleton key={i} className="h-14 w-full" />)}
                    </div>
                  ) : items.length === 0 ? (
                    <div className="p-8 text-center text-muted-foreground">
                      <MessageSquare size={28} className="mx-auto mb-2 opacity-30" />
                      <p className="text-sm">No messages yet. Compose one to get started.</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-border">
                      {items.map(log => {
                        const cust = customers.find(c => c.id === log.customerId);
                        return (
                          <div key={log.id} className="px-4 py-3 flex gap-3 items-start" data-testid={`msg-log-${log.id}`}>
                            <div className="mt-0.5 shrink-0 text-muted-foreground">
                              {log.channel === "sms" ? <MessageSquare size={14} /> : <Mail size={14} />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                {statusBadge(log.status)}
                                <span className="text-xs font-medium">{TEMPLATES[log.template]?.label ?? log.template}</span>
                                {cust && <span className="text-xs text-muted-foreground">{cust.name}</span>}
                                {log.jobId && <span className="text-xs text-muted-foreground">Job #{log.jobId}</span>}
                              </div>
                              <p className="text-xs text-muted-foreground mt-0.5">To: {log.toAddress}</p>
                              <p className="text-xs text-muted-foreground italic mt-0.5 truncate max-w-xl">{log.messageBody}</p>
                            </div>
                            <div className="text-xs text-muted-foreground shrink-0 text-right">
                              {log.sentAt ? fmtDt(log.sentAt) : fmtDt(log.createdAt)}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          );
        })}
      </Tabs>

      {/* Template reference */}
      <Card className="bg-muted/30">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <MessageSquare size={14} className="text-primary" />
            Message Templates
          </CardTitle>
        </CardHeader>
        <CardContent className="grid sm:grid-cols-2 gap-3">
          {Object.entries(TEMPLATES).map(([key, t]) => (
            <div key={key} className="space-y-1">
              <p className="text-xs font-semibold">{t.label}</p>
              <p className="text-xs text-muted-foreground">{t.smsBody || "(custom body)"}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
