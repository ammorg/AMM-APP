import { useQuery } from "@tanstack/react-query";
import type { Job, Customer, Staff, Vehicle } from "@shared/schema";
import { useAuth } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ChevronLeft, ChevronRight, CalendarDays, MapPin, Phone, User, Clock, Car,
} from "lucide-react";
import { useState } from "react";

// ── Helpers ──────────────────────────────────────────────────────────────────

function getMondayOfWeek(d: Date): Date {
  const day = d.getDay(); // 0=Sun
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d);
  monday.setDate(diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(d.getDate() + n);
  return r;
}

function formatShortDate(d: Date): string {
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function statusVariant(s: string): "default" | "secondary" | "destructive" | "outline" {
  switch (s) {
    case "complete": return "default";
    case "in_progress": return "outline";
    case "scheduled": return "secondary";
    case "pending": return "secondary";
    case "cancelled": return "destructive";
    default: return "secondary";
  }
}

function statusColor(s: string): string {
  switch (s) {
    case "complete": return "border-l-green-500";
    case "in_progress": return "border-l-blue-500";
    case "scheduled": return "border-l-yellow-500";
    case "pending": return "border-l-muted-foreground";
    case "cancelled": return "border-l-red-500";
    default: return "border-l-border";
  }
}

function priorityBadge(p: string) {
  if (p === "urgent") return <Badge variant="destructive" className="text-[10px] px-1.5 py-0">Urgent</Badge>;
  if (p === "high") return <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-orange-400 text-orange-600 dark:text-orange-400">High</Badge>;
  return null;
}

function mapsUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

// ── Job Card ──────────────────────────────────────────────────────────────────

interface JobCardProps {
  job: Job;
  customers: Customer[];
  staff: Staff[];
  vehicles: Vehicle[];
}

function JobCard({ job, customers, staff: allStaff, vehicles }: JobCardProps) {
  const customer = customers.find(c => c.id === job.customerId);
  const mechanic = allStaff.find(s => s.id === job.assignedStaffId);
  const vehicle = vehicles.find(v => v.id === job.vehicleId);

  // Best address: job-level address, or customer address
  const displayAddress = job.address ?? (customer ? [customer.address, customer.city].filter(Boolean).join(", ") : null);

  return (
    <div
      className={`rounded-lg border bg-card p-3 border-l-4 ${statusColor(job.status)} space-y-2`}
      data-testid={`schedule-job-${job.id}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-semibold leading-tight">{job.serviceType}</span>
            {priorityBadge(job.priority)}
          </div>
          {job.scheduledAt && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
              <Clock size={11} />
              {formatTime(job.scheduledAt)}
            </div>
          )}
        </div>
        <Badge variant={statusVariant(job.status)} className="text-[10px] capitalize shrink-0">
          {job.status.replace("_", " ")}
        </Badge>
      </div>

      {/* Customer + vehicle */}
      {customer && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <User size={11} className="shrink-0" />
          <span className="truncate">{customer.name}</span>
          {customer.phone && (
            <a
              href={`tel:${customer.phone}`}
              onClick={e => e.stopPropagation()}
              className="ml-auto shrink-0 flex items-center gap-1 text-primary hover:underline"
              data-testid={`call-customer-${customer.id}`}
            >
              <Phone size={11} />
              <span className="hidden sm:inline">{customer.phone}</span>
            </a>
          )}
        </div>
      )}

      {vehicle && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Car size={11} className="shrink-0" />
          <span>{vehicle.year} {vehicle.make} {vehicle.model}</span>
          {vehicle.color && <span className="text-muted-foreground/60">· {vehicle.color}</span>}
        </div>
      )}

      {/* Address + maps */}
      {displayAddress && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <MapPin size={11} className="shrink-0 text-primary/70" />
          <span className="truncate flex-1">{displayAddress}</span>
          <a
            href={mapsUrl(displayAddress)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            className="shrink-0 text-primary hover:underline text-[10px] font-medium"
            data-testid={`maps-job-${job.id}`}
          >
            Maps ↗
          </a>
        </div>
      )}

      {/* Assigned tech */}
      {mechanic && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground border-t border-border/40 pt-2 mt-1">
          <div className="w-4 h-4 rounded-full bg-primary/20 flex items-center justify-center text-[9px] font-bold text-primary shrink-0">
            {mechanic.name.charAt(0)}
          </div>
          <span className="truncate">{mechanic.name}</span>
          {mechanic.phone && (
            <a
              href={`tel:${mechanic.phone}`}
              className="ml-auto flex items-center gap-1 text-primary hover:underline shrink-0"
              data-testid={`call-staff-${mechanic.id}`}
            >
              <Phone size={11} />
            </a>
          )}
        </div>
      )}
    </div>
  );
}

// ── Schedule Page ─────────────────────────────────────────────────────────────

export default function Schedule() {
  const { user } = useAuth();
  const [weekStart, setWeekStart] = useState(() => getMondayOfWeek(new Date()));

  const { data: jobs = [], isLoading: jobsLoading } = useQuery<Job[]>({ queryKey: ["/api/jobs"] });
  const { data: customers = [] } = useQuery<Customer[]>({ queryKey: ["/api/customers"] });
  const { data: allStaff = [] } = useQuery<Staff[]>({ queryKey: ["/api/staff"] });
  const { data: vehicles = [] } = useQuery<Vehicle[]>({ queryKey: ["/api/vehicles"] });

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  function prevWeek() { setWeekStart(d => addDays(d, -7)); }
  function nextWeek() { setWeekStart(d => addDays(d, 7)); }
  function toToday() { setWeekStart(getMondayOfWeek(new Date())); }

  const today = new Date();
  const weekLabel = `${weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${addDays(weekStart, 6).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;

  // Filter jobs for this week and for current user if non-admin
  const weekJobs = jobs.filter(j => {
    if (!j.scheduledAt) return false;
    const jDate = new Date(j.scheduledAt);
    return jDate >= weekStart && jDate < addDays(weekStart, 7);
  });

  const isLoading = jobsLoading;

  // Count unscheduled jobs
  const unscheduledCount = jobs.filter(j => !j.scheduledAt && j.status !== "complete" && j.status !== "cancelled").length;

  return (
    <div className="p-5 max-w-7xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold tracking-tight flex items-center gap-2" data-testid="page-title-schedule">
            <CalendarDays size={20} className="text-primary" />
            Schedule
          </h1>
          <p className="text-sm text-muted-foreground">
            {user?.role === "admin" ? "Full team schedule" : "Your assigned jobs"}
            {unscheduledCount > 0 && (
              <span className="ml-2 text-xs text-muted-foreground/70">· {unscheduledCount} pending without time</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={prevWeek} data-testid="btn-prev-week">
            <ChevronLeft size={16} />
          </Button>
          <Button variant="outline" size="sm" onClick={toToday} data-testid="btn-today">
            Today
          </Button>
          <Button variant="outline" size="sm" onClick={nextWeek} data-testid="btn-next-week">
            <ChevronRight size={16} />
          </Button>
        </div>
      </div>

      {/* Week label */}
      <p className="text-sm font-medium text-muted-foreground" data-testid="week-label">{weekLabel}</p>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-3">
          {weekDays.map((_, i) => (
            <Skeleton key={i} className="h-32 w-full rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-3">
          {weekDays.map((day) => {
            const dayJobs = weekJobs
              .filter(j => j.scheduledAt && isSameDay(new Date(j.scheduledAt), day))
              .sort((a, b) => (a.scheduledAt ?? "").localeCompare(b.scheduledAt ?? ""));

            const isToday = isSameDay(day, today);

            return (
              <div
                key={day.toISOString()}
                className="flex flex-col gap-2"
                data-testid={`day-col-${day.toISOString().slice(0, 10)}`}
              >
                {/* Day header */}
                <div className={`rounded-lg px-3 py-2 text-center ${isToday ? "bg-primary text-primary-foreground" : "bg-muted/50"}`}>
                  <div className={`text-xs font-semibold uppercase tracking-wide ${isToday ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
                    {day.toLocaleDateString("en-US", { weekday: "short" })}
                  </div>
                  <div className={`text-base font-bold ${isToday ? "text-primary-foreground" : ""}`}>
                    {day.getDate()}
                  </div>
                </div>

                {dayJobs.length === 0 ? (
                  <div className="flex-1 rounded-lg border border-dashed border-border/50 p-3 flex items-center justify-center">
                    <span className="text-xs text-muted-foreground/40">No jobs</span>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {dayJobs.map(job => (
                      <JobCard
                        key={job.id}
                        job={job}
                        customers={customers}
                        staff={allStaff}
                        vehicles={vehicles}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Mobile card list (alternate view) */}
      {!isLoading && weekJobs.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            <CalendarDays size={36} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">No jobs scheduled this week.</p>
            <p className="text-xs mt-1 opacity-60">Navigate to another week or add jobs from the Jobs page.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
