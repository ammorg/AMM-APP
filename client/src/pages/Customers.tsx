import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { mutationErrorToast } from "@/lib/errorMessages";
import type { Customer, Vehicle } from "@shared/schema";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { Plus, Search, Users, Car, Phone, MapPin } from "lucide-react";

// ── Add Customer Dialog ──────────────────────────────────────────────────────
function CreateCustomerDialog() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: "", phone: "", email: "", address: "", city: "", notes: "",
  });

  const mutation = useMutation({
    mutationFn: (data: typeof form) => apiRequest("POST", "/api/customers", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      toast({ title: "Customer added" });
      setOpen(false);
      setForm({ name: "", phone: "", email: "", address: "", city: "", notes: "" });
    },
    onError: (err) => toast({ ...mutationErrorToast(err, "add customer"), variant: "destructive" }),
  });

  const handleSubmit = () => {
    if (!form.name || !form.phone) {
      toast({ title: "Name and phone are required", variant: "destructive" });
      return;
    }
    mutation.mutate(form);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" data-testid="btn-create-customer">
          <Plus size={14} className="mr-1" /> Add Customer
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Add Customer</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label htmlFor="cust-name">Full Name *</Label>
            <Input id="cust-name" data-testid="input-customer-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <Label htmlFor="cust-phone">Phone *</Label>
            <Input id="cust-phone" data-testid="input-customer-phone" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
          </div>
          <div>
            <Label htmlFor="cust-email">Email</Label>
            <Input id="cust-email" data-testid="input-customer-email" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label htmlFor="cust-address">Address</Label>
              <Input id="cust-address" value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="cust-city">City</Label>
              <Input id="cust-city" value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} />
            </div>
          </div>
          <div>
            <Label htmlFor="cust-notes">Notes</Label>
            <Textarea id="cust-notes" rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={mutation.isPending} data-testid="btn-submit-customer">
            {mutation.isPending ? "Saving..." : "Add Customer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Add Vehicle Dialog ────────────────────────────────────────────────────────
function AddVehicleDialog({ customerId }: { customerId: number }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    year: "", make: "", model: "", color: "", vin: "", licensePlate: "", mileage: "",
  });

  const mutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => apiRequest("POST", "/api/vehicles", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vehicles"] });
      toast({ title: "Vehicle added" });
      setOpen(false);
      setForm({ year: "", make: "", model: "", color: "", vin: "", licensePlate: "", mileage: "" });
    },
    onError: (err) => toast({ ...mutationErrorToast(err, "add vehicle"), variant: "destructive" }),
  });

  const handleSubmit = () => {
    if (!form.year || !form.make || !form.model) {
      toast({ title: "Year, make and model required", variant: "destructive" });
      return;
    }
    mutation.mutate({
      customerId,
      year: parseInt(form.year),
      make: form.make,
      model: form.model,
      color: form.color || null,
      vin: form.vin || null,
      licensePlate: form.licensePlate || null,
      mileage: form.mileage ? parseInt(form.mileage) : null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" className="text-xs h-7 px-2" data-testid={`btn-add-vehicle-${customerId}`}>
          <Plus size={12} className="mr-1" /> Add Vehicle
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>Add Vehicle</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label>Year *</Label>
              <Input data-testid="input-vehicle-year" type="number" placeholder="2020" value={form.year} onChange={(e) => setForm((f) => ({ ...f, year: e.target.value }))} />
            </div>
            <div>
              <Label>Make *</Label>
              <Input data-testid="input-vehicle-make" placeholder="Toyota" value={form.make} onChange={(e) => setForm((f) => ({ ...f, make: e.target.value }))} />
            </div>
            <div>
              <Label>Model *</Label>
              <Input data-testid="input-vehicle-model" placeholder="Camry" value={form.model} onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Color</Label>
              <Input value={form.color} onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))} />
            </div>
            <div>
              <Label>Mileage</Label>
              <Input type="number" value={form.mileage} onChange={(e) => setForm((f) => ({ ...f, mileage: e.target.value }))} />
            </div>
            <div>
              <Label>License Plate</Label>
              <Input value={form.licensePlate} onChange={(e) => setForm((f) => ({ ...f, licensePlate: e.target.value }))} />
            </div>
            <div>
              <Label>VIN</Label>
              <Input value={form.vin} onChange={(e) => setForm((f) => ({ ...f, vin: e.target.value }))} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={mutation.isPending} data-testid="btn-submit-vehicle">
            {mutation.isPending ? "Saving..." : "Add Vehicle"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Customer Card ─────────────────────────────────────────────────────────────
function CustomerCard({ customer, vehicles }: { customer: Customer; vehicles: Vehicle[] }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card data-testid={`customer-card-${customer.id}`}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-sm">{customer.name}</h3>
              <Badge variant="outline" className="text-xs">
                {vehicles.length} vehicle{vehicles.length !== 1 ? "s" : ""}
              </Badge>
            </div>
            <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-x-4 gap-y-1">
              <a href={`tel:${customer.phone}`} className="flex items-center gap-1 text-primary hover:underline" data-testid={`call-customer-${customer.id}`}>
                <Phone size={11} />{customer.phone}
              </a>
              {customer.email && <span>{customer.email}</span>}
              {(customer.address || customer.city) && (
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([customer.address, customer.city].filter(Boolean).join(", "))}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-primary hover:underline"
                  data-testid={`maps-customer-${customer.id}`}
                >
                  <MapPin size={11} />{customer.city ?? customer.address}
                </a>
              )}
            </div>
            {customer.notes && (
              <p className="text-xs text-muted-foreground mt-1 italic">{customer.notes}</p>
            )}
          </div>
          <div className="flex gap-2 items-center">
            <AddVehicleDialog customerId={customer.id} />
            <Button
              variant="ghost"
              size="sm"
              className="text-xs h-7 px-2"
              onClick={() => setExpanded((e) => !e)}
              data-testid={`btn-toggle-vehicles-${customer.id}`}
            >
              <Car size={12} className="mr-1" />
              {expanded ? "Hide" : "Vehicles"}
            </Button>
          </div>
        </div>

        {expanded && vehicles.length > 0 && (
          <div className="mt-3 pt-3 border-t border-border space-y-1.5" data-testid={`vehicles-${customer.id}`}>
            {vehicles.map((v) => (
              <div key={v.id} className="flex items-center gap-3 text-xs bg-muted/50 rounded px-2.5 py-1.5" data-testid={`vehicle-row-${v.id}`}>
                <Car size={12} className="text-muted-foreground shrink-0" />
                <span className="font-medium">{v.year} {v.make} {v.model}</span>
                {v.color && <span className="text-muted-foreground">{v.color}</span>}
                {v.mileage && <span className="text-muted-foreground">{v.mileage.toLocaleString()} mi</span>}
                {v.licensePlate && <Badge variant="secondary" className="text-xs">{v.licensePlate}</Badge>}
              </div>
            ))}
          </div>
        )}

        {expanded && vehicles.length === 0 && (
          <div className="mt-3 pt-3 border-t border-border">
            <p className="text-xs text-muted-foreground">No vehicles on file</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Customers Page ─────────────────────────────────────────────────────────────
export default function Customers() {
  const { isAdmin } = useAuth();
  const [search, setSearch] = useState("");

  const { data: customers = [], isLoading: custLoading } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });
  const { data: allVehicles = [], isLoading: vehLoading } = useQuery<Vehicle[]>({
    queryKey: ["/api/vehicles"],
  });

  const isLoading = custLoading || vehLoading;

  const filtered = customers.filter(
    (c) =>
      !search ||
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.phone.includes(search) ||
      (c.email ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (c.city ?? "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-5 max-w-5xl mx-auto space-y-5">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold tracking-tight" data-testid="page-title-customers">
            Customers
          </h1>
          <p className="text-sm text-muted-foreground">
            {customers.length} on file
            {!isAdmin() && <span className="ml-2 text-xs bg-muted px-1.5 py-0.5 rounded border border-border">Your job customers only</span>}
          </p>
        </div>
        <CreateCustomerDialog />
      </div>

      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          data-testid="input-search-customers"
          placeholder="Search by name, phone, email, city..."
          className="pl-8"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Users size={32} className="mx-auto mb-2 opacity-40" />
          <p>No customers found</p>
        </div>
      ) : (
        <div className="space-y-3" data-testid="customers-list">
          {filtered.map((customer) => (
            <CustomerCard
              key={customer.id}
              customer={customer}
              vehicles={allVehicles.filter((v) => v.customerId === customer.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
