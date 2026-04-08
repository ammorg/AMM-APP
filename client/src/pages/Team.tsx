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
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { Plus, UserCog, CheckCircle, Clock, RefreshCw } from "lucide-react";
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

// ── Create Staff Dialog ───────────────────────────────────────────────────────
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
  });

  const mutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => apiRequest("POST", "/api/staff", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff"] });
      toast({ title: "Staff member added" });
      setOpen(false);
      setForm({
        name: "", role: "Mechanic", phone: "", email: "", availability: "available",
        onboardingStatus: "in_progress", onboardingProgress: "0", certifications: "",
        hireDate: "", notes: "",
      });
    },
    onError: (err) => toast({
      ...mutationErrorToast(err, "add staff member"),
      variant: "destructive",
    }),
  });

  const handleSubmit = () => {
    if (!form.name.trim()) {
      toast({ title: "Full name is required.", variant: "destructive" });
      return;
    }
    const certs = form.certifications
      ? JSON.stringify(form.certifications.split(",").map((s) => s.trim()).filter(Boolean))
      : null;
    mutation.mutate({
      name: form.name,
      role: form.role,
      phone: form.phone || null,
      email: form.email || null,
      availability: form.availability,
      onboardingStatus: form.onboardingStatus,
      onboardingProgress: parseInt(form.onboardingProgress) || 0,
      certifications: certs,
      hireDate: form.hireDate || null,
      notes: form.notes || null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" data-testid="btn-create-staff">
          <Plus size={14} className="mr-1" /> Add Staff
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Add Staff Member</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label>Full Name <span className="text-destructive">*</span></Label>
            <Input data-testid="input-staff-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Role</Label>
              <Select value={form.role} onValueChange={(v) => setForm((f) => ({ ...f, role: v }))}>
                <SelectTrigger data-testid="select-staff-role"><SelectValue /></SelectTrigger>
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
              <Select value={form.availability} onValueChange={(v) => setForm((f) => ({ ...f, availability: v }))}>
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
              <Input data-testid="input-staff-phone" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
            </div>
            <div>
              <Label>Email</Label>
              <Input data-testid="input-staff-email" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            </div>
            <div>
              <Label>Hire Date</Label>
              <Input type="date" value={form.hireDate} onChange={(e) => setForm((f) => ({ ...f, hireDate: e.target.value }))} />
            </div>
            <div>
              <Label>Onboarding Status</Label>
              <Select value={form.onboardingStatus} onValueChange={(v) => setForm((f) => ({ ...f, onboardingStatus: v }))}>
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
            <Input
              type="range" min="0" max="100"
              value={form.onboardingProgress}
              onChange={(e) => setForm((f) => ({ ...f, onboardingProgress: e.target.value }))}
              className="h-2"
            />
          </div>
          <div>
            <Label>Certifications <span className="text-muted-foreground text-xs">(comma-separated)</span></Label>
            <Input
              data-testid="input-staff-certs"
              placeholder="ASE Certified, Brakes, AC"
              value={form.certifications}
              onChange={(e) => setForm((f) => ({ ...f, certifications: e.target.value }))}
            />
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={mutation.isPending} data-testid="btn-submit-staff">
            {mutation.isPending ? (
              <><RefreshCw size={14} className="mr-1 animate-spin" /> Saving…</>
            ) : "Add Staff"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Edit Staff Dialog ─────────────────────────────────────────────────────────
function EditStaffDialog({ member }: { member: Staff }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: member.name,
    role: member.role,
    phone: member.phone ?? "",
    email: member.email ?? "",
    availability: member.availability,
    onboardingStatus: member.onboardingStatus,
    onboardingProgress: String(member.onboardingProgress),
    notes: member.notes ?? "",
  });

  const mutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => apiRequest("PATCH", `/api/staff/${member.id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff"] });
      toast({ title: "Staff updated" });
      setOpen(false);
    },
    onError: (err) => toast({
      ...mutationErrorToast(err, "update staff member"),
      variant: "destructive",
    }),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-xs h-7" data-testid={`btn-edit-staff-${member.id}`}>
          Edit
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>Edit {member.name}</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label>Name</Label>
            <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Availability</Label>
              <Select value={form.availability} onValueChange={(v) => setForm((f) => ({ ...f, availability: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="available">Available</SelectItem>
                  <SelectItem value="on_job">On Job</SelectItem>
                  <SelectItem value="off_duty">Off Duty</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Onboarding</Label>
              <Select value={form.onboardingStatus} onValueChange={(v) => setForm((f) => ({ ...f, onboardingStatus: v }))}>
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
            <Input
              type="range" min="0" max="100"
              value={form.onboardingProgress}
              onChange={(e) => setForm((f) => ({ ...f, onboardingProgress: e.target.value }))}
              className="h-2"
            />
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            onClick={() => mutation.mutate({
              ...form,
              phone: form.phone || null,
              email: form.email || null,
              notes: form.notes || null,
              onboardingProgress: parseInt(form.onboardingProgress),
            })}
            disabled={mutation.isPending}
            data-testid={`btn-save-staff-${member.id}`}
          >
            {mutation.isPending ? (
              <><RefreshCw size={14} className="mr-1 animate-spin" /> Saving…</>
            ) : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Staff Card ─────────────────────────────────────────────────────────────────
function StaffCard({ member }: { member: Staff }) {
  const certifications = (() => {
    try {
      return member.certifications ? JSON.parse(member.certifications) as string[] : [];
    } catch {
      return [];
    }
  })();

  return (
    <Card data-testid={`staff-card-${member.id}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm">{member.name}</span>
              <Badge variant="secondary" className="text-xs">{member.role}</Badge>
              <Badge variant={availabilityVariant(member.availability)} className="text-xs">
                {availabilityLabel(member.availability)}
              </Badge>
            </div>
            <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-x-4">
              {member.phone && <span>{member.phone}</span>}
              {member.email && <span>{member.email}</span>}
              {member.hireDate && <span>Hired {new Date(member.hireDate).toLocaleDateString("en-US", { month: "short", year: "numeric" })}</span>}
            </div>
            {certifications.length > 0 && (
              <div className="flex gap-1.5 flex-wrap mt-2">
                {certifications.map((cert: string) => (
                  <Badge key={cert} variant="outline" className="text-xs">{cert}</Badge>
                ))}
              </div>
            )}
          </div>
          <EditStaffDialog member={member} />
        </div>

        {/* Onboarding */}
        <div className="mt-3 pt-3 border-t border-border">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs text-muted-foreground">Onboarding</span>
            <div className="flex items-center gap-1.5">
              {member.onboardingStatus === "complete" ? (
                <CheckCircle size={13} className="text-green-500" />
              ) : (
                <Clock size={13} className="text-amber-500" />
              )}
              <span className="text-xs font-medium">
                {member.onboardingStatus === "complete" ? "Complete" : `${member.onboardingProgress}%`}
              </span>
            </div>
          </div>
          <Progress value={member.onboardingProgress} className="h-1.5" />
        </div>

        {member.notes && (
          <p className="text-xs text-muted-foreground mt-2 italic">{member.notes}</p>
        )}
      </CardContent>
    </Card>
  );
}

// ── Team Page ──────────────────────────────────────────────────────────────────
export default function Team() {
  const { data: staffList = [], isLoading } = useQuery<Staff[]>({
    queryKey: ["/api/staff"],
  });

  const available = staffList.filter((s) => s.availability === "available");
  const onJob = staffList.filter((s) => s.availability === "on_job");

  return (
    <div className="p-5 max-w-4xl mx-auto space-y-5">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold tracking-tight" data-testid="page-title-team">
            Team
          </h1>
          <p className="text-sm text-muted-foreground">
            {staffList.length} staff · {available.length} available · {onJob.length} on job
          </p>
        </div>
        <CreateStaffDialog />
      </div>

      {/* Brand panel — team collage + ASE credential */}
      <Card className="overflow-hidden border-border">
        <div className="flex flex-col sm:flex-row">
          {/* Collage */}
          <div className="sm:w-2/3 relative">
            <img
              src={teamCollage}
              alt="AMM team and customers"
              className="w-full h-40 sm:h-full object-cover object-center"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-transparent to-background/80 sm:to-background/70" />
          </div>

          {/* Credential strip */}
          <div className="sm:w-1/3 flex flex-col items-center justify-center gap-3 px-6 py-5 bg-card text-center">
            <img
              src={aseBadge}
              alt="ASE Certified"
              className="w-14 h-14 object-contain"
            />
            <div>
              <p className="text-sm font-bold tracking-tight">ASE Certified</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Our techs hold industry-standard certifications to keep your vehicles running.
              </p>
            </div>
          </div>
        </div>
      </Card>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-32 w-full" />)}
        </div>
      ) : staffList.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <UserCog size={32} className="mx-auto mb-2 opacity-40" />
          <p>No staff added yet. Click &ldquo;Add Staff&rdquo; to get started.</p>
        </div>
      ) : (
        <div className="space-y-3" data-testid="team-list">
          {staffList.map((member) => (
            <StaffCard key={member.id} member={member} />
          ))}
        </div>
      )}
    </div>
  );
}
