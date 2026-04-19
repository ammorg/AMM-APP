import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { mutationErrorToast } from "@/lib/errorMessages";
import type { BusinessProfile, Customer, Job, JobCompletion, Staff, Vehicle } from "@shared/schema";
import { useAuth } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Plus, Briefcase, Search, MapPin, Phone, ClipboardList, Camera, CheckCircle2, AlertCircle, ExternalLink, Pencil } from "lucide-react";

const DEFAULT_JOB_FORM_URL = "https://forms.zohopublic.com/ServiceHub/form/AffordableMobileMechanics/formperma/QNsesdJiRj8kQBw-pYohiFlVDKlbQOVCzjXdBOab1f8";

interface OpenJob extends Job {
  customerPreview: { id: number; name: string; city: string | null; phone: string | null; email: string | null; address: string | null } | null;
  vehiclePreview: { id: number; year: number; make: string; model: string; color: string | null } | null;
}

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

function statusLabel(s: string) {
  return ({ pending: "Pending", scheduled: "Scheduled", in_progress: "In Progress", complete: "Complete", cancelled: "Cancelled" } as Record<string, string>)[s] ?? s;
}

function fmtDateTime(dt?: string | null) {
  if (!dt) return "—";
  const d = new Date(dt);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) + " " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function fmtCurrency(n?: number | null) {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

function appleMapsUrl(address: string) {
  return `http://maps.apple.com/?daddr=${encodeURIComponent(address)}`;
}

function CreateJobDialog() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ customerId: "", vehicleId: "", assignedStaffId: "", serviceType: "", status: "pending", priority: "normal", scheduledAt: "", estimateAmount: "", address: "", notes: "" });
  const { data: customers = [] } = useQuery<Customer[]>({ queryKey: ["/api/customers"] });
  const { data: staffList = [] } = useQuery<Staff[]>({ queryKey: ["/api/staff"] });
  const { data: allVehicles = [] } = useQuery<Vehicle[]>({ queryKey: ["/api/vehicles"] });
  const customerVehicles = allVehicles.filter(v => form.customerId && v.customerId === parseInt(form.customerId, 10));

  const mutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => apiRequest("POST", "/api/jobs", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/jobs/open"] });
      toast({ title: "Job created" });
      setOpen(false);
      setForm({ customerId: "", vehicleId: "", assignedStaffId: "", serviceType: "", status: "pending", priority: "normal", scheduledAt: "", estimateAmount: "", address: "", notes: "" });
    },
    onError: (err) => toast({ ...mutationErrorToast(err, "create job"), variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm"><Plus size={14} className="mr-1" /> New Job</Button></DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader><DialogTitle>Create Service Job</DialogTitle></DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-2">
          <div className="sm:col-span-2"><Label>Service Type *</Label><Input value={form.serviceType} onChange={(e) => setForm(f => ({ ...f, serviceType: e.target.value }))} placeholder="Battery replacement" /></div>
          <div><Label>Customer *</Label><Select value={form.customerId} onValueChange={(v) => setForm(f => ({ ...f, customerId: v, vehicleId: "" }))}><SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger><SelectContent>{customers.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}</SelectContent></Select></div>
          <div><Label>Vehicle</Label><Select value={form.vehicleId} onValueChange={(v) => setForm(f => ({ ...f, vehicleId: v }))}><SelectTrigger><SelectValue placeholder="Select vehicle" /></SelectTrigger><SelectContent>{customerVehicles.map(v => <SelectItem key={v.id} value={String(v.id)}>{v.year} {v.make} {v.model}</SelectItem>)}</SelectContent></Select></div>
          <div><Label>Assigned Tech</Label><Select value={form.assignedStaffId} onValueChange={(v) => setForm(f => ({ ...f, assignedStaffId: v }))}><SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger><SelectContent>{staffList.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}</SelectContent></Select></div>
          <div><Label>Estimate ($)</Label><Input type="number" value={form.estimateAmount} onChange={(e) => setForm(f => ({ ...f, estimateAmount: e.target.value }))} /></div>
          <div><Label>Status</Label><Select value={form.status} onValueChange={(v) => setForm(f => ({ ...f, status: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="pending">Pending</SelectItem><SelectItem value="scheduled">Scheduled</SelectItem><SelectItem value="in_progress">In Progress</SelectItem><SelectItem value="complete">Complete</SelectItem><SelectItem value="cancelled">Cancelled</SelectItem></SelectContent></Select></div>
          <div><Label>Priority</Label><Select value={form.priority} onValueChange={(v) => setForm(f => ({ ...f, priority: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="low">Low</SelectItem><SelectItem value="normal">Normal</SelectItem><SelectItem value="high">High</SelectItem><SelectItem value="urgent">Urgent</SelectItem></SelectContent></Select></div>
          <div className="sm:col-span-2"><Label>Scheduled Time</Label><Input type="datetime-local" value={form.scheduledAt} onChange={(e) => setForm(f => ({ ...f, scheduledAt: e.target.value }))} /></div>
          <div className="sm:col-span-2"><Label>Exact Address</Label><Input value={form.address} onChange={(e) => setForm(f => ({ ...f, address: e.target.value }))} placeholder="123 Main St, Lafayette, LA" /></div>
          <div className="sm:col-span-2"><Label>Problem / Notes</Label><Textarea rows={3} value={form.notes} onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={mutation.isPending || !form.customerId || !form.serviceType.trim()} onClick={() => mutation.mutate({ customerId: parseInt(form.customerId, 10), vehicleId: form.vehicleId ? parseInt(form.vehicleId, 10) : null, assignedStaffId: form.assignedStaffId ? parseInt(form.assignedStaffId, 10) : null, serviceType: form.serviceType, status: form.status, priority: form.priority, scheduledAt: form.scheduledAt || null, estimateAmount: form.estimateAmount ? parseFloat(form.estimateAmount) : null, address: form.address || null, notes: form.notes || null, createdAt: new Date().toISOString() })}>{mutation.isPending ? "Creating..." : "Create Job"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditJobDialog({ job }: { job: Job }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ serviceType: job.serviceType, status: job.status, priority: job.priority, assignedStaffId: job.assignedStaffId ? String(job.assignedStaffId) : "", scheduledAt: job.scheduledAt ?? "", estimateAmount: String(job.estimateAmount ?? ""), address: job.address ?? "", notes: job.notes ?? "" });
  const { data: staffList = [] } = useQuery<Staff[]>({ queryKey: ["/api/staff"] });

  const mutation = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/jobs/${job.id}`, { serviceType: form.serviceType, status: form.status, priority: form.priority, assignedStaffId: form.assignedStaffId ? parseInt(form.assignedStaffId, 10) : null, scheduledAt: form.scheduledAt || null, estimateAmount: form.estimateAmount ? parseFloat(form.estimateAmount) : null, address: form.address || null, notes: form.notes || null }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/jobs/open"] });
      toast({ title: "Job updated" });
      setOpen(false);
    },
    onError: (err) => toast({ ...mutationErrorToast(err, "update job"), variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="ghost" size="sm" className="text-xs h-7"><Pencil size={12} className="mr-1" /> Edit</Button></DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader><DialogTitle>Edit Job</DialogTitle></DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-2">
          <div className="sm:col-span-2"><Label>Service Type</Label><Input value={form.serviceType} onChange={(e) => setForm(f => ({ ...f, serviceType: e.target.value }))} /></div>
          <div><Label>Status</Label><Select value={form.status} onValueChange={(v) => setForm(f => ({ ...f, status: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="pending">Pending</SelectItem><SelectItem value="scheduled">Scheduled</SelectItem><SelectItem value="in_progress">In Progress</SelectItem><SelectItem value="complete">Complete</SelectItem><SelectItem value="cancelled">Cancelled</SelectItem></SelectContent></Select></div>
          <div><Label>Priority</Label><Select value={form.priority} onValueChange={(v) => setForm(f => ({ ...f, priority: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="low">Low</SelectItem><SelectItem value="normal">Normal</SelectItem><SelectItem value="high">High</SelectItem><SelectItem value="urgent">Urgent</SelectItem></SelectContent></Select></div>
          <div><Label>Assigned Tech</Label><Select value={form.assignedStaffId || "unassigned"} onValueChange={(v) => setForm(f => ({ ...f, assignedStaffId: v === "unassigned" ? "" : v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="unassigned">Unassigned</SelectItem>{staffList.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}</SelectContent></Select></div>
          <div><Label>Estimate</Label><Input type="number" value={form.estimateAmount} onChange={(e) => setForm(f => ({ ...f, estimateAmount: e.target.value }))} /></div>
          <div className="sm:col-span-2"><Label>Scheduled Time</Label><Input type="datetime-local" value={form.scheduledAt} onChange={(e) => setForm(f => ({ ...f, scheduledAt: e.target.value }))} /></div>
          <div className="sm:col-span-2"><Label>Exact Address</Label><Input value={form.address} onChange={(e) => setForm(f => ({ ...f, address: e.target.value }))} /></div>
          <div className="sm:col-span-2"><Label>Problem / Notes</Label><Textarea rows={3} value={form.notes} onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>{mutation.isPending ? "Saving..." : "Save"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function UpdateStatusDialog({ job }: { job: Job }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState(job.status);
  const mutation = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/jobs/${job.id}`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/jobs/open"] });
      toast({ title: "Status updated" });
      setOpen(false);
    },
    onError: (err) => toast({ ...mutationErrorToast(err, "update job status"), variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="ghost" size="sm" className="text-xs h-7">Update Status</Button></DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>Update Job Status</DialogTitle></DialogHeader>
        <div className="py-2"><Label>Status</Label><Select value={status} onValueChange={setStatus}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="pending">Pending</SelectItem><SelectItem value="scheduled">Scheduled</SelectItem><SelectItem value="in_progress">In Progress</SelectItem><SelectItem value="complete">Complete</SelectItem><SelectItem value="cancelled">Cancelled</SelectItem></SelectContent></Select></div>
        <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>{mutation.isPending ? "Saving..." : "Save"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AcceptJobButton({ jobId }: { jobId: number }) {
  const { toast } = useToast();
  const mutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/jobs/${jobId}/accept`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/jobs/open"] });
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      toast({ title: "Job accepted" });
    },
    onError: (err) => toast({ ...mutationErrorToast(err, "accept job"), variant: "destructive" }),
  });
  return <Button size="sm" className="text-xs h-7" onClick={() => mutation.mutate()} disabled={mutation.isPending}>{mutation.isPending ? "Accepting..." : "Accept Job"}</Button>;
}

function FormButton({ formUrl }: { formUrl: string }) {
  return (
    <Button size="sm" variant="outline" className="text-xs h-7 gap-1" onClick={() => window.open(formUrl, "_blank", "noopener,noreferrer")}>
      <ClipboardList size={12} /> Form
    </Button>
  );
}

function VehiclePhotosPanel({ jobId, completion }: { jobId: number; completion: JobCompletion | null }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const photos: string[] = completion?.vehiclePhotos ? JSON.parse(completion.vehiclePhotos) : [];

  async function uploadPhoto(file: File) {
    setUploading(true);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        await apiRequest("POST", `/api/jobs/${jobId}/completion/photos`, { photo: reader.result });
        queryClient.invalidateQueries({ queryKey: ["/api/jobs", jobId, "completion"] });
        toast({ title: "Photo uploaded" });
      } catch (err) {
        toast({ ...mutationErrorToast(err, "upload photo"), variant: "destructive" });
      } finally {
        setUploading(false);
      }
    };
    reader.readAsDataURL(file);
  }

  const deleteMutation = useMutation({
    mutationFn: (idx: number) => apiRequest("DELETE", `/api/jobs/${jobId}/completion/photos/${idx}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs", jobId, "completion"] });
      toast({ title: "Photo removed" });
    },
    onError: (err) => toast({ ...mutationErrorToast(err, "remove photo"), variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" variant="outline" className="text-xs h-7 gap-1"><Camera size={12} /> Photos {photos.length > 0 && <span className="px-1 rounded bg-muted">{photos.length}</span>}</Button></DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>Vehicle Photos</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <p className="text-xs text-muted-foreground">Photos are optional now. Mechanics can still upload them when needed.</p>
          <div className="grid grid-cols-3 gap-2">
            {photos.map((photo, idx) => (
              <div key={idx} className="relative aspect-square rounded-md overflow-hidden border border-border">
                <img src={photo} alt={`Vehicle ${idx + 1}`} className="w-full h-full object-cover" />
                <button className="absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full p-1" onClick={() => deleteMutation.mutate(idx)}>
                  ×
                </button>
              </div>
            ))}
          </div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && uploadPhoto(e.target.files[0])} />
          <Button variant="outline" className="w-full" onClick={() => fileRef.current?.click()} disabled={uploading}>{uploading ? "Uploading..." : "Upload Photo"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function Jobs() {
  const { user, isAdmin } = useAuth();
  const { data: assignedJobs = [], isLoading } = useQuery<Job[]>({ queryKey: ["/api/jobs"] });
  const { data: openJobs = [] } = useQuery<OpenJob[]>({ queryKey: ["/api/jobs/open"], enabled: !isAdmin() });
  const { data: customers = [] } = useQuery<Customer[]>({ queryKey: ["/api/customers"] });
  const { data: staffList = [] } = useQuery<Staff[]>({ queryKey: ["/api/staff"] });
  const { data: vehicles = [] } = useQuery<Vehicle[]>({ queryKey: ["/api/vehicles"] });
  const { data: businessProfile } = useQuery<BusinessProfile>({ queryKey: ["/api/business-profile"] });

  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterPriority, setFilterPriority] = useState("all");

  const allJobs = useMemo(() => {
    if (isAdmin()) return assignedJobs.map(job => ({ job, openMeta: null as OpenJob | null }));
    const map = new Map<number, { job: Job; openMeta: OpenJob | null }>();
    openJobs.forEach(job => map.set(job.id, { job, openMeta: job }));
    assignedJobs.forEach(job => map.set(job.id, { job, openMeta: null }));
    return Array.from(map.values()).sort((a, b) => b.job.id - a.job.id);
  }, [assignedJobs, openJobs, isAdmin]);

  const completionQueries = useQuery<Record<number, JobCompletion | null>>({
    queryKey: ["/api/job-completions-map", allJobs.map(x => x.job.id).join(",")],
    enabled: allJobs.length > 0,
    queryFn: async () => {
      const results: Record<number, JobCompletion | null> = {};
      await Promise.all(allJobs.map(async ({ job }) => {
        try {
          const res = await apiRequest("GET", `/api/jobs/${job.id}/completion`);
          results[job.id] = await res.json();
        } catch {
          results[job.id] = null;
        }
      }));
      return results;
    },
  });
  const completionMap = completionQueries.data ?? {};

  const filtered = allJobs.filter(({ job, openMeta }) => {
    const customer = customers.find(c => c.id === job.customerId);
    const customerName = customer?.name || openMeta?.customerPreview?.name || "";
    const techName = staffList.find(s => s.id === job.assignedStaffId)?.name || "";
    const haystack = `${job.serviceType} ${job.notes ?? ""} ${customerName} ${techName}`.toLowerCase();
    const matchSearch = !search || haystack.includes(search.toLowerCase());
    const matchStatus = filterStatus === "all" || job.status === filterStatus;
    const matchPriority = filterPriority === "all" || job.priority === filterPriority;
    return matchSearch && matchStatus && matchPriority;
  });

  const formUrl = (businessProfile as any)?.jobFormUrl || DEFAULT_JOB_FORM_URL;

  return (
    <div className="p-5 max-w-7xl mx-auto space-y-5">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold tracking-tight" data-testid="page-title-jobs">{isAdmin() ? "Service Jobs" : "Available + My Jobs"}</h1>
          <p className="text-sm text-muted-foreground">{filtered.length} visible jobs{!isAdmin() && <span className="ml-2 text-xs bg-muted px-1.5 py-0.5 rounded border border-border">Private details unlock once the job is scheduled</span>}</p>
        </div>
        {isAdmin() && <CreateJobDialog />}
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><Input placeholder="Search jobs, notes, customers..." className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
        <Select value={filterStatus} onValueChange={setFilterStatus}><SelectTrigger className="w-36"><SelectValue placeholder="Status" /></SelectTrigger><SelectContent><SelectItem value="all">All Statuses</SelectItem><SelectItem value="pending">Pending</SelectItem><SelectItem value="scheduled">Scheduled</SelectItem><SelectItem value="in_progress">In Progress</SelectItem><SelectItem value="complete">Complete</SelectItem><SelectItem value="cancelled">Cancelled</SelectItem></SelectContent></Select>
        <Select value={filterPriority} onValueChange={setFilterPriority}><SelectTrigger className="w-36"><SelectValue placeholder="Priority" /></SelectTrigger><SelectContent><SelectItem value="all">All Priorities</SelectItem><SelectItem value="urgent">Urgent</SelectItem><SelectItem value="high">High</SelectItem><SelectItem value="normal">Normal</SelectItem><SelectItem value="low">Low</SelectItem></SelectContent></Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-3">{[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground"><Briefcase size={32} className="mx-auto mb-2 opacity-40" /><p>No jobs found</p></div>
          ) : (
            <div className="divide-y divide-border" data-testid="jobs-list">
              {filtered.map(({ job, openMeta }) => {
                const customer = customers.find(c => c.id === job.customerId);
                const vehicle = vehicles.find(v => v.id === job.vehicleId);
                const tech = staffList.find(s => s.id === job.assignedStaffId);
                const completion = completionMap[job.id] ?? null;
                const isAssignedToCurrentUser = !!user?.staffId && job.assignedStaffId === user.staffId;
                const privateDetailsUnlocked = job.status !== "pending";
                const canSeePrivate = isAdmin() || (isAssignedToCurrentUser && privateDetailsUnlocked);
                const customerName = customer?.name || openMeta?.customerPreview?.name || "—";
                const customerCity = customer?.city || openMeta?.customerPreview?.city || "—";
                const customerPhone = canSeePrivate ? customer?.phone : null;
                const exactAddress = canSeePrivate ? (job.address || [customer?.address, customer?.city].filter(Boolean).join(", ")) : null;
                const vehicleLabel = vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : openMeta?.vehiclePreview ? `${openMeta.vehiclePreview.year} ${openMeta.vehiclePreview.make} ${openMeta.vehiclePreview.model}` : null;
                const isOpenForAcceptance = !isAdmin() && !job.assignedStaffId;

                return (
                  <div key={job.id} className="px-4 py-3 flex flex-wrap items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{job.serviceType}</span>
                        <Badge variant={statusVariant(job.status)} className="text-xs">{statusLabel(job.status)}</Badge>
                        <Badge variant={priorityVariant(job.priority)} className="text-xs capitalize">{job.priority}</Badge>
                        {isOpenForAcceptance && <Badge variant="outline" className="text-xs">Open to accept</Badge>}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5 flex flex-wrap gap-x-3 gap-y-1">
                        <span>{customerName}</span>
                        <span>City: {customerCity}</span>
                        {vehicleLabel && <span>{vehicleLabel}</span>}
                        <span>Tech: {tech?.name ?? "Unassigned"}</span>
                        {job.scheduledAt && <span>📅 {fmtDateTime(job.scheduledAt)}</span>}
                        {job.estimateAmount != null && <span>Est. {fmtCurrency(job.estimateAmount)}</span>}
                      </div>
                      <div className="flex flex-wrap gap-3 mt-1.5 items-center">
                        {customerPhone && <a href={`tel:${customerPhone}`} className="flex items-center gap-1 text-xs text-primary hover:underline"><Phone size={11} /> {customerPhone}</a>}
                        {exactAddress ? (
                          <a href={appleMapsUrl(exactAddress)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-primary hover:underline"><MapPin size={11} /> {exactAddress} <ExternalLink size={11} /></a>
                        ) : (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground"><MapPin size={11} /> Exact address hidden until scheduled</span>
                        )}
                      </div>
                      {job.notes && <p className="text-xs text-muted-foreground mt-1 italic max-w-3xl">{job.notes}</p>}
                      {!canSeePrivate && <div className="flex items-center gap-2 mt-2 text-[11px] text-amber-700 dark:text-amber-400"><AlertCircle size={12} /> Phone number and exact address stay hidden until this job is scheduled.</div>}
                      {completion?.vehiclePhotos && JSON.parse(completion.vehiclePhotos).length > 0 && <div className="flex items-center gap-1 mt-2 text-[11px] text-muted-foreground"><CheckCircle2 size={11} /> {JSON.parse(completion.vehiclePhotos).length} photo(s) uploaded</div>}
                    </div>
                    <div className="flex items-start gap-1 flex-wrap flex-col sm:flex-row">
                      {isOpenForAcceptance ? <AcceptJobButton jobId={job.id} /> : <>
                        <FormButton formUrl={formUrl} />
                        <VehiclePhotosPanel jobId={job.id} completion={completion} />
                        <UpdateStatusDialog job={job} />
                        {isAdmin() && <EditJobDialog job={job} />}
                      </>}
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
