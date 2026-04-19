import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { mutationErrorToast } from "@/lib/errorMessages";
import type { Staff } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useMemo, useState } from "react";
import { Plus, UserCog, CheckCircle, Clock, RefreshCw, Trash2, KeyRound } from "lucide-react";
import teamCollage from "@assets/amm-team-collage.jpeg";
import aseBadge from "@assets/amm-ase-badge.jpeg";

function availabilityVariant(a: string): "default" | "secondary" | "destructive" | "outline" {
  switch (a) {
    case "available": return "default";
    case "on_job": return "outline";
    case "off_duty": return "secondary";
    default: return "secondary";
  }
}

function availabilityLabel(a: string) {
  switch (a) {
    case "available": return "Available";
    case "on_job": return "On Job";
    case "off_duty": return "Off Duty";
    default: return a;
  }
}

function StaffFormFields({ form, setForm }: any) {
  return (
    <div className="space-y-3 py-2">
      <div>
        <Label>Full Name <span className="text-destructive">*</span></Label>
        <Input value={form.name} onChange={(e) => setForm((f: any) => ({ ...f, name: e.target.value }))} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Role</Label>
          <Select value={form.role} onValueChange={(v) => setForm((f: any) => ({ ...f, role: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Lead Mechanic">Lead Mechanic</SelectItem>
              <SelectItem value="Mechanic">Mechanic</SelectItem>
              <SelectItem value="Dispatcher">Dispatcher</SelectItem>
              <SelectItem value="Apprentice">Apprentice</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Availability</Label>
          <Select value={form.availability} onValueChange={(v) => setForm((f: any) => ({ ...f, availability: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="available">Available</SelectItem>
              <SelectItem value="on_job">On Job</SelectItem>
              <SelectItem value="off_duty">Off Duty</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Phone</Label>
          <Input value={form.phone} onChange={(e) => setForm((f: any) => ({ ...f, phone: e.target.value }))} />
        </div>
        <div>
          <Label>Email</Label>
          <Input type="email" value={form.email} onChange={(e) => setForm((f: any) => ({ ...f, email: e.target.value }))} />
        </div>
        <div>
          <Label>Hire Date</Label>
          <Input type="date" value={form.hireDate} onChange={(e) => setForm((f: any) => ({ ...f, hireDate: e.target.value }))} />
        </div>
        <div>
          <Label>Onboarding</Label>
          <Select value={form.onboardingStatus} onValueChange={(v) => setForm((f: any) => ({ ...f, onboardingStatus: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="complete">Complete</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div>
        <Label>Onboarding Progress ({form.onboardingProgress}%)</Label>
        <Input type="range" min="0" max="100" value={form.onboardingProgress} onChange={(e) => setForm((f: any) => ({ ...f, onboardingProgress: e.target.value }))} className="h-2" />
      </div>
      <div>
        <Label>Certifications <span className="text-muted-foreground text-xs">(comma-separated)</span></Label>
        <Input placeholder="ASE Certified, Brakes, AC" value={form.certifications} onChange={(e) => setForm((f: any) => ({ ...f, certifications: e.target.value }))} />
      </div>
      <div className="border rounded-md p-3 space-y-3 bg-muted/30">
        <div className="flex items-center gap-2 text-sm font-medium"><KeyRound size={14} /> Login for this employee</div>
        <div>
          <Label>PIN</Label>
          <Input inputMode="numeric" value={form.pin} onChange={(e) => setForm((f: any) => ({ ...f, pin: e.target.value.replace(/\D/g, "").slice(0, 4) }))} maxLength={4} placeholder="4-digit PIN" />
        </div>
        <p className="text-xs text-muted-foreground">Set a 4-digit PIN so this employee can log in from the Staff PIN screen.</p>
      </div>
      <div>
        <Label>Notes</Label>
        <Textarea rows={2} value={form.notes} onChange={(e) => setForm((f: any) => ({ ...f, notes: e.target.value }))} />
      </div>
    </div>
  );
}

function buildPayload(form: any) {
  const certs = form.certifications
    ? JSON.stringify(form.certifications.split(",").map((s: string) => s.trim()).filter(Boolean))
    : null;
  return {
    name: form.name,
    role: form.role,
    phone: form.phone || null,
    email: form.email || null,
    availability: form.availability,
    onboardingStatus: form.onboardingStatus,
    onboardingProgress: parseInt(form.onboardingProgress || "0", 10) || 0,
    certifications: certs,
    hireDate: form.hireDate || null,
    notes: form.notes || null,
    pin: form.pin === "" ? undefined : (form.pin || null),
  };
}

function CreateStaffDialog() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    role: "Mechanic",
    phone: "",
    email: "",
    availability: "available",
    onboardingStatus: "in_progress",
    onboardingProgress: "0",
    certifications: "",
    hireDate: "",
    notes: "",
    pin: "",
  });

  const mutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => apiRequest("POST", "/api/staff", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff"] });
      toast({ title: "Team member added" });
      setOpen(false);
    },
    onError: (err) => toast({ ...mutationErrorToast(err, "add team member"), variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" data-testid="btn-create-staff"><Plus size={14} className="mr-1" /> Add Team Member</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader><DialogTitle>Add Team Member</DialogTitle></DialogHeader>
        <StaffFormFields form={form} setForm={setForm} />
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => mutation.mutate(buildPayload(form))} disabled={mutation.isPending || !form.name.trim()}>
            {mutation.isPending ? <><RefreshCw size={14} className="mr-1 animate-spin" /> Saving…</> : "Add Team Member"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditStaffDialog({ member }: { member: Staff }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const certifications = useMemo(() => {
    try { return member.certifications ? (JSON.parse(member.certifications) as string[]).join(", ") : ""; }
    catch { return ""; }
  }, [member.certifications]);

  const [form, setForm] = useState({
    name: member.name,
    role: member.role,
    phone: member.phone ?? "",
    email: member.email ?? "",
    availability: member.availability,
    onboardingStatus: member.onboardingStatus,
    onboardingProgress: String(member.onboardingProgress),
    certifications,
    hireDate: member.hireDate ?? "",
    notes: member.notes ?? "",
    pin: "",
  });

  const mutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => apiRequest("PATCH", `/api/staff/${member.id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff"] });
      toast({ title: "Team member updated" });
      setOpen(false);
    },
    onError: (err) => toast({ ...mutationErrorToast(err, "update team member"), variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-xs h-7">Edit</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader><DialogTitle>Edit {member.name}</DialogTitle></DialogHeader>
        <StaffFormFields form={form} setForm={setForm} />
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => mutation.mutate(buildPayload(form))} disabled={mutation.isPending || !form.name.trim()}>
            {mutation.isPending ? <><RefreshCw size={14} className="mr-1 animate-spin" /> Saving…</> : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteStaffButton({ member }: { member: Staff }) {
  const { toast } = useToast();
  const mutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/staff/${member.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff"] });
      toast({ title: `${member.name} removed` });
    },
    onError: (err) => toast({ ...mutationErrorToast(err, "remove team member"), variant: "destructive" }),
  });

  return (
    <Button variant="ghost" size="sm" className="text-xs h-7 text-destructive" onClick={() => {
      if (window.confirm(`Remove ${member.name}? This also removes their login.`)) mutation.mutate();
    }} disabled={mutation.isPending}>
      <Trash2 size={12} className="mr-1" /> Remove
    </Button>
  );
}

function StaffCard({ member }: { member: Staff }) {
  const certifications = (() => {
    try { return member.certifications ? JSON.parse(member.certifications) as string[] : []; }
    catch { return []; }
  })();

  return (
    <Card data-testid={`staff-card-${member.id}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm">{member.name}</span>
              <Badge variant="secondary" className="text-xs">{member.role}</Badge>
              <Badge variant={availabilityVariant(member.availability)} className="text-xs">{availabilityLabel(member.availability)}</Badge>
            </div>
            <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-x-4">
              {member.phone && <span>{member.phone}</span>}
              {member.email && <span>{member.email}</span>}
              {member.hireDate && <span>Hired {new Date(member.hireDate).toLocaleDateString("en-US", { month: "short", year: "numeric" })}</span>}
            </div>
            {certifications.length > 0 && (
              <div className="flex gap-1.5 flex-wrap mt-2">
                {certifications.map((cert: string) => <Badge key={cert} variant="outline" className="text-xs">{cert}</Badge>)}
              </div>
            )}
          </div>
          <div className="flex flex-col items-end gap-1">
            <EditStaffDialog member={member} />
            <DeleteStaffButton member={member} />
          </div>
        </div>

        <div className="mt-3 pt-3 border-t border-border">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs text-muted-foreground">Onboarding</span>
            <div className="flex items-center gap-1.5">
              {member.onboardingStatus === "complete" ? <CheckCircle size={13} className="text-green-500" /> : <Clock size={13} className="text-amber-500" />}
              <span className="text-xs font-medium">{member.onboardingStatus === "complete" ? "Complete" : `${member.onboardingProgress}%`}</span>
            </div>
          </div>
          <Progress value={member.onboardingProgress} className="h-1.5" />
        </div>

        {member.notes && <p className="text-xs text-muted-foreground mt-2 italic">{member.notes}</p>}
      </CardContent>
    </Card>
  );
}

export default function Team() {
  const { data: staffList = [], isLoading } = useQuery<Staff[]>({ queryKey: ["/api/staff"] });
  const available = staffList.filter((s) => s.availability === "available");
  const onJob = staffList.filter((s) => s.availability === "on_job");

  return (
    <div className="p-5 max-w-5xl mx-auto space-y-5">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold tracking-tight" data-testid="page-title-team">Team</h1>
          <p className="text-sm text-muted-foreground">{staffList.length} staff · {available.length} available · {onJob.length} on job</p>
        </div>
        <CreateStaffDialog />
      </div>

      <Card className="overflow-hidden border-border">
        <div className="flex flex-col sm:flex-row">
          <div className="sm:w-2/3 relative">
            <img src={teamCollage} alt="AMM team and customers" className="w-full h-40 sm:h-full object-cover object-center" />
            <div className="absolute inset-0 bg-gradient-to-r from-transparent to-background/80 sm:to-background/70" />
          </div>
          <div className="sm:w-1/3 flex flex-col items-center justify-center gap-3 px-6 py-5 bg-card text-center">
            <img src={aseBadge} alt="ASE Certified" className="w-14 h-14 object-contain" />
            <div>
              <p className="text-sm font-bold tracking-tight">Add your real crew</p>
              <p className="text-xs text-muted-foreground mt-0.5">Set each employee's 4-digit PIN so they can sign in from the Staff PIN screen.</p>
            </div>
          </div>
        </div>
      </Card>

      {isLoading ? (
        <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-32 w-full" />)}</div>
      ) : staffList.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <UserCog size={32} className="mx-auto mb-2 opacity-40" />
          <p>No team members added yet.</p>
        </div>
      ) : (
        <div className="space-y-3" data-testid="team-list">
          {staffList.map((member) => <StaffCard key={member.id} member={member} />)}
        </div>
      )}
    </div>
  );
}
