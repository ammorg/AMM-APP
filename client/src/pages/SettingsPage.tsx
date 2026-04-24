import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { mutationErrorToast } from "@/lib/errorMessages";
import type { BusinessProfile, IntegrationSettings } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import { Save, Settings, MapPin, Phone, Clock, Plug, CheckCircle2, Info, RefreshCw } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";

const INTEGRATION_META: Record<string, {
  label: string;
  description: string;
  color: string;
  setupNote: string;
}> = {
  zoho_crm: {
    label: "Zoho CRM",
    description: "Sync customers and contacts. New customers created in AMM are pushed to your Zoho CRM account.",
    color: "text-red-600 dark:text-red-400",
    setupNote: "Contact your admin to set the ZOHO_CRM_TOKEN environment variable for live sync.",
  },
  zoho_books: {
    label: "Zoho Books",
    description: "Sync invoices. Invoices created in AMM can be mirrored in Zoho Books for accounting.",
    color: "text-blue-600 dark:text-blue-400",
    setupNote: "Contact your admin to set the ZOHO_BOOKS_TOKEN environment variable for live sync.",
  },
  zoho_mail: {
    label: "Zoho Mail",
    description: "Send transactional emails (estimates, job updates, payment links) via your Zoho Mail account.",
    color: "text-blue-600 dark:text-blue-400",
    setupNote: "Contact your admin to set the ZOHO_MAIL_TOKEN environment variable for live email delivery.",
  },
  twilio: {
    label: "Twilio SMS",
    description: "Send SMS notifications for estimates, job scheduling, and payment link delivery.",
    color: "text-red-500 dark:text-red-400",
    setupNote: "Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and either TWILIO_FROM_NUMBER or TWILIO_MESSAGING_SERVICE_SID on the server.",
  },
};

function IntegrationCard({ setting }: { setting: IntegrationSettings }) {
  const { toast } = useToast();
  const meta = INTEGRATION_META[setting.service];
  const [accountLabel, setAccountLabel] = useState(setting.accountLabel ?? "");
  const [note, setNote] = useState(setting.webhookOrNote ?? "");
  const [syncCustomers, setSyncCustomers] = useState(setting.syncCustomers === 1);
  const [syncInvoices, setSyncInvoices] = useState(setting.syncInvoices === 1);
  const [syncJobs, setSyncJobs] = useState(setting.syncJobs === 1);

  const updateMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiRequest("PATCH", `/api/integrations/${setting.service}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/integrations"] });
      toast({ title: `${meta?.label ?? setting.service} settings saved` });
    },
    onError: (err) => toast({
      ...mutationErrorToast(err, "save integration settings"),
      variant: "destructive",
    }),
  });

  const isConnected = setting.status === "connected";

  return (
    <Card key={setting.service}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start gap-3">
          <div className={`w-8 h-8 rounded flex items-center justify-center shrink-0 ${isConnected ? "bg-green-100 dark:bg-green-950" : "bg-muted"}`}>
            <Plug size={14} className={isConnected ? "text-green-600 dark:text-green-400" : "text-muted-foreground"} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-sm font-semibold ${meta?.color ?? ""}`}>{meta?.label ?? setting.service}</span>
              {isConnected ? (
                <Badge variant="outline" className="text-[10px] border-green-500 text-green-600 dark:text-green-400">
                  <CheckCircle2 size={9} className="mr-0.5" /> Connected
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[10px] border-zinc-400 text-zinc-500 dark:text-zinc-400">
                  Pending Setup
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{meta?.description}</p>
          </div>
        </div>

        {!isConnected && (
          <div className="flex gap-2 bg-muted/60 border border-border rounded px-3 py-2 text-xs text-muted-foreground">
            <Info size={12} className="shrink-0 mt-0.5 text-zinc-400" />
            <span><strong>Admin setup required:</strong> {meta?.setupNote} Once the token is in place, sync activates automatically — no data is lost in the meantime.</span>
          </div>
        )}

        <div className="space-y-2">
          <div>
            <Label className="text-xs">Account / Org Label</Label>
            <Input
              data-testid={`input-account-label-${setting.service}`}
              className="h-8 text-xs"
              placeholder="e.g. AMM Zoho Org"
              value={accountLabel}
              onChange={(e) => setAccountLabel(e.target.value)}
            />
          </div>
          <div>
            <Label className="text-xs">Notes</Label>
            <Input
              data-testid={`input-webhook-${setting.service}`}
              className="h-8 text-xs"
              placeholder="Webhook URL or internal notes..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>

        {(setting.service === "zoho_crm" || setting.service === "zoho_books") && (
          <div className="grid grid-cols-3 gap-3 pt-1 border-t border-border">
            <div className="flex items-center gap-2">
              <Switch
                id={`sync-customers-${setting.service}`}
                checked={syncCustomers}
                onCheckedChange={setSyncCustomers}
                data-testid={`toggle-sync-customers-${setting.service}`}
              />
              <Label htmlFor={`sync-customers-${setting.service}`} className="text-xs cursor-pointer">Customers</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id={`sync-invoices-${setting.service}`}
                checked={syncInvoices}
                onCheckedChange={setSyncInvoices}
                data-testid={`toggle-sync-invoices-${setting.service}`}
              />
              <Label htmlFor={`sync-invoices-${setting.service}`} className="text-xs cursor-pointer">Invoices</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id={`sync-jobs-${setting.service}`}
                checked={syncJobs}
                onCheckedChange={setSyncJobs}
                data-testid={`toggle-sync-jobs-${setting.service}`}
              />
              <Label htmlFor={`sync-jobs-${setting.service}`} className="text-xs cursor-pointer">Jobs</Label>
            </div>
          </div>
        )}

        <Button
          size="sm"
          variant="outline"
          className="w-full gap-1"
          onClick={() => updateMutation.mutate({
            accountLabel: accountLabel || null,
            webhookOrNote: note || null,
            syncCustomers: syncCustomers ? 1 : 0,
            syncInvoices: syncInvoices ? 1 : 0,
            syncJobs: syncJobs ? 1 : 0,
          })}
          disabled={updateMutation.isPending}
          data-testid={`btn-save-integration-${setting.service}`}
        >
          {updateMutation.isPending ? (
            <><RefreshCw size={12} className="animate-spin" /> Saving…</>
          ) : (
            <><Save size={12} /> Save Notes</>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}

function BusinessProfileTab() {
  const { toast } = useToast();
  const { data: profile, isLoading } = useQuery<BusinessProfile>({
    queryKey: ["/api/business-profile"],
  });

  const [form, setForm] = useState({
    name: "", ownerName: "", phone: "", email: "",
    dispatchCity: "", serviceTerritory: "", operatingHours: "", notes: "",
  });

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (profile) {
      setForm({
        name: profile.name, ownerName: profile.ownerName, phone: profile.phone,
        email: profile.email, dispatchCity: profile.dispatchCity,
        serviceTerritory: profile.serviceTerritory, operatingHours: profile.operatingHours,
        notes: profile.notes ?? "",
      });
    }
  }, [profile]);

  const mutation = useMutation({
    mutationFn: (data: typeof form) => apiRequest("PUT", "/api/business-profile", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/business-profile"] });
      toast({ title: "Settings saved" });
      setFieldErrors({});
    },
    onError: (err) => toast({
      ...mutationErrorToast(err, "save settings"),
      variant: "destructive",
    }),
  });

  function handleSave() {
    const errors: Record<string, string> = {};
    if (!form.name.trim()) errors.name = "Business name is required.";
    if (!form.phone.trim()) errors.phone = "Phone is required.";
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      toast({ title: "Please fill in the required fields.", variant: "destructive" });
      return;
    }
    setFieldErrors({});
    mutation.mutate(form);
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Settings size={16} className="text-primary" />
            Business Profile
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="biz-name">Business Name <span className="text-destructive">*</span></Label>
              <Input
                id="biz-name"
                data-testid="input-biz-name"
                value={form.name}
                onChange={(e) => { setForm((f) => ({ ...f, name: e.target.value })); setFieldErrors(fe => ({ ...fe, name: "" })); }}
                className={fieldErrors.name ? "border-destructive" : ""}
              />
              {fieldErrors.name && <p className="text-xs text-destructive mt-1">{fieldErrors.name}</p>}
            </div>
            <div>
              <Label htmlFor="owner-name">Owner / Manager</Label>
              <Input id="owner-name" data-testid="input-owner-name" value={form.ownerName}
                onChange={(e) => setForm((f) => ({ ...f, ownerName: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="biz-phone"><Phone size={12} className="inline mr-1" />Phone <span className="text-destructive">*</span></Label>
              <Input
                id="biz-phone"
                data-testid="input-biz-phone"
                value={form.phone}
                onChange={(e) => { setForm((f) => ({ ...f, phone: e.target.value })); setFieldErrors(fe => ({ ...fe, phone: "" })); }}
                className={fieldErrors.phone ? "border-destructive" : ""}
              />
              {fieldErrors.phone && <p className="text-xs text-destructive mt-1">{fieldErrors.phone}</p>}
            </div>
            <div>
              <Label htmlFor="biz-email">Email</Label>
              <Input id="biz-email" data-testid="input-biz-email" type="email" value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            </div>
          </div>

          <div className="pt-2 border-t border-border">
            <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium mb-3">Dispatch &amp; Territory</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="dispatch-city"><MapPin size={12} className="inline mr-1" />Dispatch City</Label>
                <Input id="dispatch-city" data-testid="input-dispatch-city" placeholder="Los Angeles, CA"
                  value={form.dispatchCity} onChange={(e) => setForm((f) => ({ ...f, dispatchCity: e.target.value }))} />
              </div>
              <div>
                <Label htmlFor="hours"><Clock size={12} className="inline mr-1" />Operating Hours</Label>
                <Input id="hours" data-testid="input-hours" placeholder="Mon–Fri 7am–6pm"
                  value={form.operatingHours} onChange={(e) => setForm((f) => ({ ...f, operatingHours: e.target.value }))} />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="territory">Service Territory</Label>
                <Input id="territory" data-testid="input-territory" placeholder="Lafayette, Louisiana — 30 mile radius"
                  value={form.serviceTerritory} onChange={(e) => setForm((f) => ({ ...f, serviceTerritory: e.target.value }))} />
              </div>
            </div>
          </div>

          <div>
            <Label htmlFor="biz-notes">Internal Notes</Label>
            <Textarea id="biz-notes" data-testid="input-biz-notes" rows={3}
              placeholder="Dispatch notes, special instructions..."
              value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
          </div>

          <Button onClick={handleSave} disabled={mutation.isPending}
            data-testid="btn-save-settings" className="w-full sm:w-auto">
            {mutation.isPending ? (
              <><RefreshCw size={14} className="mr-2 animate-spin" />Saving…</>
            ) : (
              <><Save size={14} className="mr-2" />Save Settings</>
            )}
          </Button>
        </CardContent>
      </Card>

      <Card className="bg-muted/30">
        <CardContent className="pt-4 pb-3">
          <p className="text-xs text-muted-foreground">
            <strong>Remote dispatch setup:</strong> All jobs are coordinated remotely from{" "}
            {form.dispatchCity || "your dispatch city"}. Technicians operate within{" "}
            {form.serviceTerritory || "your service territory"}.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function IntegrationsTab() {
  const { data: integrations = [], isLoading } = useQuery<IntegrationSettings[]>({
    queryKey: ["/api/integrations"],
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-40 w-full" />)}
      </div>
    );
  }

  const order = ["zoho_crm", "zoho_books", "zoho_mail", "twilio"];
  const sorted = [...integrations].sort((a, b) => order.indexOf(a.service) - order.indexOf(b.service));

  return (
    <div className="space-y-4">
      <Alert className="border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30">
        <Info size={14} className="text-blue-600 dark:text-blue-400" />
        <AlertDescription className="text-xs text-blue-700 dark:text-blue-300">
          <strong>Zoho-first architecture:</strong> AMM is built to sync with Zoho CRM, Zoho Books, Zoho Mail, and Twilio.
          These integrations require server-side tokens configured by your admin — they cannot be connected directly from this page.
          All records are stored locally in the meantime; no data is lost.
        </AlertDescription>
      </Alert>

      <div className="grid sm:grid-cols-2 gap-4">
        {sorted.map(setting => (
          <IntegrationCard key={setting.service} setting={setting} />
        ))}
      </div>

      <Card className="bg-muted/30">
        <CardContent className="pt-4 pb-3 space-y-1.5">
          <p className="text-xs font-semibold text-muted-foreground">Sync Architecture Notes</p>
          <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
            <li>Customers → Zoho CRM contacts and/or Zoho Books contacts</li>
            <li>Work orders / jobs → Zoho CRM deals or internal sync records</li>
            <li>Invoices → Zoho Books invoices</li>
            <li>Email notifications → Zoho Mail transactional</li>
            <li>SMS notifications → Twilio</li>
            <li>All sync routes live at <code className="bg-muted px-1 rounded">/api/integrations/zoho/sync/*</code></li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <div className="p-5 max-w-3xl mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-bold tracking-tight" data-testid="page-title-settings">
          Settings
        </h1>
        <p className="text-sm text-muted-foreground">Business profile, dispatch configuration, and integrations</p>
      </div>

      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile" data-testid="tab-profile">
            <Settings size={14} className="mr-1.5" />
            Business Profile
          </TabsTrigger>
          <TabsTrigger value="integrations" data-testid="tab-integrations">
            <Plug size={14} className="mr-1.5" />
            Integrations
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="mt-4">
          <BusinessProfileTab />
        </TabsContent>

        <TabsContent value="integrations" className="mt-4">
          <IntegrationsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
