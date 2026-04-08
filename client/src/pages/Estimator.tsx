import { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Calculator, ChevronRight, Info, TrendingUp, Car, X, Plus, BarChart3,
  Download, Lock, Users, DollarSign, AlertCircle,
} from "lucide-react";
import type { Job, Customer, Vehicle } from "@shared/schema";
import {
  BENCHMARK_SERVICES,
  BENCHMARK_VEHICLES,
  UNIQUE_MAKES,
  getModelsForMake,
  computeBenchmark,
  fmtMoney,
  pricePosition,
  buildSnapshotJson,
  type BenchmarkResult,
} from "@/lib/estimator-data";

// ─── Legacy seed types (kept for job-prefill tab) ──────────────────────────────
interface ServiceBases {
  kbb: [number, number];
  napa: [number, number];
  ym: number;
  rp: [number, number];
  [key: string]: [number, number] | number;
}

interface EstimatorService {
  id: string;
  name: string;
  bases: ServiceBases;
  fixedHourly?: number;
}

interface EstimatorVehicle {
  make: string;
  model: string;
  class: string;
  factor: number;
}

interface EstimatorSeed {
  services: EstimatorService[];
  vehicles: EstimatorVehicle[];
}

interface LineItem {
  service: EstimatorService;
  qty: number;
}

const NO_JOB_PREFILL = "__no_job_prefill__";
const ANY_VEHICLE = "__any_vehicle__";
const SOURCE_LABELS: Record<string, string> = {
  kbb: "KBB Fair Repair",
  napa: "NAPA AutoCare",
  ym: "YourMechanic",
  rp: "RepairPal",
};

function fmtCurrency(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

function computeRange(service: EstimatorService, factor: number): { low: number; high: number; mid: number } {
  const all_lows: number[] = [];
  const all_highs: number[] = [];
  for (const key of ["kbb", "napa", "rp"]) {
    const v = service.bases[key];
    if (Array.isArray(v)) {
      all_lows.push(v[0] * factor);
      all_highs.push(v[1] * factor);
    }
  }
  const ym = typeof service.bases.ym === "number" ? service.bases.ym * factor : null;
  if (ym !== null) { all_lows.push(ym); all_highs.push(ym); }
  const low = Math.round(Math.min(...all_lows));
  const high = Math.round(Math.max(...all_highs));
  const mid = Math.round((low + high) / 2);
  return { low, high, mid };
}

function recommendedQuote(service: EstimatorService, factor: number): number {
  const rp = service.bases["rp"];
  if (Array.isArray(rp)) {
    return Math.round(((rp[0] + rp[1]) / 2) * factor);
  }
  return computeRange(service, factor).mid;
}

// ─── Source Band Row ──────────────────────────────────────────────────────────
function SourceBandRow({ label, value, factor, isAdmin }: {
  label: string;
  value: [number, number] | number;
  factor: number;
  isAdmin: boolean;
}) {
  if (!isAdmin) return null;
  let low: number, high: number;
  if (Array.isArray(value)) {
    low = Math.round(value[0] * factor);
    high = Math.round(value[1] * factor);
  } else {
    low = high = Math.round(value * factor);
  }
  const width = low === high ? 100 : 60;
  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className="text-xs text-muted-foreground w-28 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className="h-full bg-primary/40 rounded-full" style={{ width: `${width}%` }} />
      </div>
      <span className="text-xs font-mono font-medium w-24 text-right text-foreground">
        {low === high ? fmtCurrency(low) : `${fmtCurrency(low)} – ${fmtCurrency(high)}`}
      </span>
    </div>
  );
}

// ─── Line Item Card ───────────────────────────────────────────────────────────
function LineItemCard({ item, factor, isAdmin, onRemove }: {
  item: LineItem;
  factor: number;
  isAdmin: boolean;
  onRemove: () => void;
}) {
  const [showSources, setShowSources] = useState(false);
  const { low, high } = computeRange(item.service, factor);
  const quote = recommendedQuote(item.service, factor) * item.qty;

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3" data-testid={`line-item-${item.service.id}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm leading-snug">{item.service.name}</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            Market range: {fmtCurrency(low * item.qty)} – {fmtCurrency(high * item.qty)}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-base font-bold text-primary">{fmtCurrency(quote)}</span>
          <button
            type="button"
            onClick={onRemove}
            className="text-muted-foreground hover:text-destructive transition-colors"
            aria-label="Remove service"
            data-testid={`btn-remove-${item.service.id}`}
          >
            <X size={15} />
          </button>
        </div>
      </div>
      {isAdmin && (
        <button
          type="button"
          onClick={() => setShowSources((s) => !s)}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <Info size={13} />
          {showSources ? "Hide benchmark sources" : "Show benchmark sources"}
        </button>
      )}
      {isAdmin && showSources && (
        <div className="rounded-md bg-muted/40 px-3 py-2 space-y-0.5">
          {Object.entries(SOURCE_LABELS).map(([key, label]) => (
            <SourceBandRow
              key={key}
              label={label}
              value={item.service.bases[key] as [number, number] | number}
              factor={factor * item.qty}
              isAdmin={isAdmin}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Benchmark Source Card ────────────────────────────────────────────────────
function BenchmarkSourceCard({ label, mid, range, isFixed }: {
  label: string;
  mid: string;
  range: string;
  isFixed: boolean;
}) {
  return (
    <div className="rounded-md bg-muted/50 border border-border p-3">
      <div className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground mb-1">{label}</div>
      <div className="text-sm font-bold tabular-nums">{mid}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{isFixed ? "Fixed hourly rate" : range}</div>
    </div>
  );
}

// ─── Market Summary Cell ──────────────────────────────────────────────────────
function MarketCell({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="text-center rounded-md bg-primary/8 border border-primary/15 py-2 px-1">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className={`text-sm font-bold mt-0.5 tabular-nums ${accent ?? "text-primary"}`}>{value}</div>
    </div>
  );
}

// ─── Benchmark Comparison Tab ─────────────────────────────────────────────────
function BenchmarkTab({ isAdmin }: { isAdmin: boolean }) {
  const [serviceId, setServiceId] = useState("brake-pad-replacement");
  const [make, setMake] = useState("Toyota");
  const [modelState, setModelState] = useState("Camry");
  const [year, setYear] = useState("2020");
  const [zip, setZip] = useState("70503");
  const [finalPriceInput, setFinalPriceInput] = useState("");

  // Public tab mirrors
  const [pubServiceId, setPubServiceId] = useState("brake-pad-replacement");
  const [pubMake, setPubMake] = useState("Toyota");
  const [pubModel, setPubModel] = useState("Camry");
  const [pubYear, setPubYear] = useState("2020");
  const [pubZip, setPubZip] = useState("70503");

  const adminModels = useMemo(() => getModelsForMake(make), [make]);
  const pubModels = useMemo(() => getModelsForMake(pubMake), [pubMake]);

  // Ensure model remains valid when make changes
  const resolvedModel = adminModels.includes(modelState) ? modelState : (adminModels[0] ?? "");
  const resolvedPubModel = pubModels.includes(pubModel) ? pubModel : (pubModels[0] ?? "");

  const adminResult = useMemo<BenchmarkResult | null>(
    () => computeBenchmark(serviceId, make, resolvedModel, parseInt(year) || 2020, zip),
    [serviceId, make, resolvedModel, year, zip]
  );

  const pubResult = useMemo<BenchmarkResult | null>(
    () => computeBenchmark(pubServiceId, pubMake, resolvedPubModel, parseInt(pubYear) || 2020, pubZip),
    [pubServiceId, pubMake, resolvedPubModel, pubYear, pubZip]
  );

  const finalPrice = useMemo(() => {
    const n = parseFloat(finalPriceInput);
    if (!isNaN(n) && n > 0) return n;
    return adminResult?.marketAvg ?? 0;
  }, [finalPriceInput, adminResult]);

  const positionLabel = adminResult ? pricePosition(finalPrice, adminResult.marketAvg) : "—";
  const positionColor =
    positionLabel === "Below market" ? "text-green-600 dark:text-green-400" :
    positionLabel === "Above market" ? "text-red-600 dark:text-red-400" :
    "text-primary";

  const handleMakeChange = useCallback((val: string) => {
    setMake(val);
    const models = getModelsForMake(val);
    setModelState(models[0] ?? "");
    // Sync public selectors
    setPubMake(val);
    const pubMs = getModelsForMake(val);
    setPubModel(pubMs[0] ?? "");
  }, []);

  const handleModelChange = useCallback((val: string) => {
    setModelState(val);
    setPubModel(val);
  }, []);

  const handleServiceChange = useCallback((val: string) => {
    setServiceId(val);
    setPubServiceId(val);
    setFinalPriceInput(""); // reset override so it re-calculates
  }, []);

  const handleDownload = useCallback(() => {
    if (!adminResult) return;
    const json = buildSnapshotJson(adminResult, make, resolvedModel, parseInt(year) || 2020, zip, finalPrice);
    const blob = new Blob([json], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "amm-estimate-snapshot.json";
    a.click();
  }, [adminResult, make, resolvedModel, year, zip, finalPrice]);

  // Public estimator computed display values
  const pubDisplayLow = pubResult ? Math.round(pubResult.marketAvg * 0.92 / 5) * 5 : 0;
  const pubDisplayHigh = pubResult ? Math.round(pubResult.marketAvg * 1.08 / 5) * 5 : 0;

  return (
    <div className="space-y-6">
      {/* Hero info strip — admin only */}
      {isAdmin && (
        <div className="rounded-lg border border-border bg-card p-4 flex flex-wrap gap-6 items-start">
          <div className="flex-1 min-w-[180px]">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Services in catalog</div>
            <div className="text-xl font-bold">{BENCHMARK_SERVICES.length}</div>
          </div>
          <div className="flex-1 min-w-[180px]">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">General labor rate</div>
            <div className="text-xl font-bold">$125/hr</div>
          </div>
          <div className="flex-1 min-w-[180px]">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Technician commission</div>
            <div className="text-xl font-bold">55%</div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleDownload} data-testid="btn-download-snapshot">
              <Download size={14} className="mr-1" />
              Snapshot
            </Button>
          </div>
        </div>
      )}

      {/* Admin estimate inputs + Benchmark comparison */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Left: inputs */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">
              {isAdmin ? "Admin estimate inputs" : "Estimate inputs"}
            </CardTitle>
            {isAdmin && (
              <p className="text-xs text-muted-foreground">Use this when pricing a work order.</p>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground uppercase tracking-wider">Service</Label>
              <Select value={serviceId} onValueChange={handleServiceChange}>
                <SelectTrigger data-testid="select-benchmark-service">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BENCHMARK_SERVICES.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground uppercase tracking-wider">Year</Label>
                <Input
                  type="number"
                  min={1998}
                  max={2027}
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                  data-testid="input-benchmark-year"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground uppercase tracking-wider">ZIP code</Label>
                <Input
                  value={zip}
                  onChange={(e) => setZip(e.target.value)}
                  data-testid="input-benchmark-zip"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground uppercase tracking-wider">Make</Label>
                <Select value={make} onValueChange={handleMakeChange}>
                  <SelectTrigger data-testid="select-benchmark-make">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {UNIQUE_MAKES.map((m) => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground uppercase tracking-wider">Model</Label>
                <Select value={resolvedModel} onValueChange={handleModelChange}>
                  <SelectTrigger data-testid="select-benchmark-model">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {adminModels.map((m) => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Final price override — admin only */}
            {isAdmin && (
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <DollarSign size={11} />
                  Final customer price (override)
                </Label>
                <Input
                  type="number"
                  min={0}
                  step={1}
                  placeholder={adminResult ? String(adminResult.marketAvg) : "Auto from market avg"}
                  value={finalPriceInput}
                  onChange={(e) => setFinalPriceInput(e.target.value)}
                  data-testid="input-final-price"
                />
              </div>
            )}

            {/* Chips */}
            <div className="flex flex-wrap gap-1.5 pt-1">
              {isAdmin && (
                <>
                  <span className="text-[10px] px-2 py-1 rounded-full bg-muted border border-border text-muted-foreground">Admin keeps pricing authority</span>
                  <span className="text-[10px] px-2 py-1 rounded-full bg-muted border border-border text-muted-foreground">55% technician commission</span>
                </>
              )}
              <span className="text-[10px] px-2 py-1 rounded-full bg-muted border border-border text-muted-foreground">Public estimator hides source names</span>
            </div>
          </CardContent>
        </Card>

        {/* Right: benchmark comparison */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="text-sm font-semibold">Benchmark comparison</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5" data-testid="text-vehicle-summary">
                  {adminResult
                    ? `${year} ${make} ${resolvedModel} · ZIP ${zip}`
                    : "Select a service and vehicle."}
                </p>
              </div>
              {!isAdmin && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground cursor-help">
                      <Lock size={12} />
                      <span>Admin sources</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-xs max-w-[200px]">Full benchmark source breakdown is visible to admins only.</p>
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* 4-source grid — admin only */}
            {isAdmin && adminResult && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <BenchmarkSourceCard
                  label="KBB"
                  mid={adminResult.fixedHourly ? `${fmtMoney(adminResult.kbb[0])}/hr` : fmtMoney(Math.round((adminResult.kbb[0] + adminResult.kbb[1]) / 2))}
                  range={`${fmtMoney(adminResult.kbb[0])} – ${fmtMoney(adminResult.kbb[1])}`}
                  isFixed={adminResult.fixedHourly}
                />
                <BenchmarkSourceCard
                  label="NAPA"
                  mid={adminResult.fixedHourly ? `${fmtMoney(adminResult.napa[0])}/hr` : fmtMoney(Math.round((adminResult.napa[0] + adminResult.napa[1]) / 2))}
                  range={`${fmtMoney(adminResult.napa[0])} – ${fmtMoney(adminResult.napa[1])}`}
                  isFixed={adminResult.fixedHourly}
                />
                <BenchmarkSourceCard
                  label="YourMechanic"
                  mid={adminResult.fixedHourly ? `${fmtMoney(adminResult.ym)}/hr` : fmtMoney(adminResult.ym)}
                  range="Flat rate benchmark"
                  isFixed={adminResult.fixedHourly}
                />
                <BenchmarkSourceCard
                  label="RepairPal"
                  mid={adminResult.fixedHourly ? `${fmtMoney(adminResult.rp[0])}/hr` : fmtMoney(Math.round((adminResult.rp[0] + adminResult.rp[1]) / 2))}
                  range={`${fmtMoney(adminResult.rp[0])} – ${fmtMoney(adminResult.rp[1])}`}
                  isFixed={adminResult.fixedHourly}
                />
              </div>
            )}

            {/* Market summary — everyone */}
            {adminResult ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <MarketCell label="Market low" value={adminResult.fixedHourly ? `${fmtMoney(adminResult.low)}/hr` : fmtMoney(adminResult.low)} />
                <MarketCell label="Market high" value={adminResult.fixedHourly ? `${fmtMoney(adminResult.high)}/hr` : fmtMoney(adminResult.high)} />
                <MarketCell label="Market avg" value={adminResult.fixedHourly ? `${fmtMoney(adminResult.marketAvg)}/hr` : fmtMoney(adminResult.marketAvg)} />
                {isAdmin && (
                  <MarketCell label="Price position" value={positionLabel} accent={positionColor} />
                )}
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {[0, 1, 2].map((i) => <Skeleton key={i} className="h-14 rounded-md" />)}
              </div>
            )}

            <Separator />

            {/* Work order pricing preview — admin only */}
            {isAdmin && adminResult && (
              <div className="space-y-3">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Work order pricing preview</div>
                <div className="divide-y divide-border rounded-md border border-border overflow-hidden">
                  {[
                    { label: "Selected service", value: adminResult.svc.name },
                    { label: "Vehicle", value: `${year} ${make} ${resolvedModel}` },
                    { label: "Final customer price", value: adminResult.fixedHourly ? `${fmtMoney(finalPrice)}/hr` : fmtMoney(finalPrice), bold: true },
                    { label: "Technician commission (55%)", value: adminResult.fixedHourly ? `${fmtMoney(Math.round(finalPrice * 0.55))}/hr` : fmtMoney(Math.round(finalPrice * 0.55)), accent: "text-green-600 dark:text-green-400" },
                    { label: "Office share (45%)", value: adminResult.fixedHourly ? `${fmtMoney(Math.round(finalPrice * 0.45))}/hr` : fmtMoney(Math.round(finalPrice * 0.45)), accent: "text-orange-500" },
                  ].map(({ label, value, bold, accent }) => (
                    <div key={label} className="flex items-center justify-between px-3 py-2 bg-card text-sm">
                      <span className="text-muted-foreground">{label}</span>
                      <strong className={`tabular-nums ${accent ?? ""} ${bold ? "text-foreground" : ""}`}>{value}</strong>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed" data-testid="text-pricing-narrative">
                  {adminResult.fixedHourly
                    ? `General labor is fixed at $125/hr in this integrated dashboard. Technician pay calculates at 55% of that hourly amount.`
                    : `Market average for ${adminResult.svc.name.toLowerCase()} is about ${fmtMoney(adminResult.marketAvg)}. Your selected price of ${fmtMoney(finalPrice)} is ${positionLabel.toLowerCase()}. Use this to benchmark before saving the work order.`}
                </p>
              </div>
            )}

            {/* Non-admin simplified range */}
            {!isAdmin && adminResult && (
              <div className="rounded-md bg-muted/50 border border-border p-3 space-y-1.5">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Estimated range</div>
                <div className="text-lg font-bold text-primary tabular-nums">
                  {adminResult.fixedHourly
                    ? `${fmtMoney(adminResult.low)}/hr`
                    : `${fmtMoney(adminResult.low)} – ${fmtMoney(adminResult.high)}`}
                </div>
                <div className="text-xs text-muted-foreground">
                  Based on market data for a {year} {make} {resolvedModel}
                </div>
              </div>
            )}

            {!adminResult && (
              <div className="text-center py-6 text-sm text-muted-foreground">
                <BarChart3 size={28} className="mx-auto mb-2 opacity-30" />
                Select a service and vehicle to generate benchmarks
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Public estimator preview — admin only */}
      {isAdmin && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Users size={14} />
              Public website estimator preview
            </CardTitle>
            <p className="text-xs text-muted-foreground">Customer-safe estimate card — source names hidden.</p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-6">
              {/* Public inputs */}
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground uppercase tracking-wider">Service</Label>
                  <Select value={pubServiceId} onValueChange={setPubServiceId}>
                    <SelectTrigger data-testid="select-public-service">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {BENCHMARK_SERVICES.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground uppercase tracking-wider">Year</Label>
                    <Input type="number" min={1998} max={2027} value={pubYear} onChange={(e) => setPubYear(e.target.value)} data-testid="input-public-year" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground uppercase tracking-wider">ZIP code</Label>
                    <Input value={pubZip} onChange={(e) => setPubZip(e.target.value)} data-testid="input-public-zip" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground uppercase tracking-wider">Make</Label>
                    <Select value={pubMake} onValueChange={(v) => { setPubMake(v); const ms = getModelsForMake(v); setPubModel(ms[0] ?? ""); }}>
                      <SelectTrigger data-testid="select-public-make">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {UNIQUE_MAKES.map((m) => (
                          <SelectItem key={m} value={m}>{m}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground uppercase tracking-wider">Model</Label>
                    <Select value={resolvedPubModel} onValueChange={setPubModel}>
                      <SelectTrigger data-testid="select-public-model">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {pubModels.map((m) => (
                          <SelectItem key={m} value={m}>{m}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <span className="text-[10px] px-2 py-1 rounded-full bg-muted border border-border text-muted-foreground">Based on current market data</span>
                  <span className="text-[10px] px-2 py-1 rounded-full bg-muted border border-border text-muted-foreground">Final quote confirmed after inspection</span>
                </div>
              </div>

              {/* Public output card */}
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-5 flex flex-col gap-3">
                <div className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">Estimated starting range</div>
                <div className="text-3xl font-bold tabular-nums text-foreground" data-testid="text-public-range">
                  {pubResult
                    ? pubResult.fixedHourly
                      ? `${fmtMoney(pubResult.hourlyRate ?? pubResult.marketAvg)}/hr`
                      : `${fmtMoney(pubDisplayLow)} – ${fmtMoney(pubDisplayHigh)}`
                    : "$0 – $0"}
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed" data-testid="text-public-summary">
                  {pubResult
                    ? pubResult.fixedHourly
                      ? `General labor is billed at a fixed starting rate of ${fmtMoney(pubResult.hourlyRate ?? pubResult.marketAvg)}/hr in this estimator.`
                      : `This starting estimate is based on current market data for a ${pubYear} ${pubMake} ${resolvedPubModel} in ZIP ${pubZip}.`
                    : "Select a vehicle and service to generate a starting estimate."}
                </p>
                {pubResult && (
                  <div className="divide-y divide-primary/10 text-sm mt-1">
                    <div className="flex justify-between py-1.5">
                      <span className="text-muted-foreground">Suggested booking price</span>
                      <strong className="tabular-nums text-primary">{pubResult.fixedHourly ? `${fmtMoney(pubResult.hourlyRate ?? pubResult.marketAvg)}/hr` : fmtMoney(pubResult.marketAvg)}</strong>
                    </div>
                    <div className="flex justify-between py-1.5">
                      <span className="text-muted-foreground">Vehicle</span>
                      <strong>{pubYear} {pubMake} {resolvedPubModel}</strong>
                    </div>
                    <div className="flex justify-between py-1.5">
                      <span className="text-muted-foreground">Service</span>
                      <strong>{pubResult.svc.name}</strong>
                    </div>
                  </div>
                )}
                <p className="text-[10px] text-muted-foreground leading-relaxed mt-auto">
                  Estimate shown for planning only. Final quote is confirmed after inspection, parts verification, and access conditions at the job site.
                </p>
                <Button size="sm" className="w-full" disabled>
                  Request service
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Vehicle factor reference — admin only */}
      {isAdmin && (
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Vehicle Class Factors — Admin Reference
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
              {BENCHMARK_VEHICLES.map((v) => (
                <div key={`${v.make}${v.model}`} className="text-xs flex items-center justify-between px-2 py-1.5 rounded bg-muted/40">
                  <span className="text-foreground/80 truncate">{v.make} {v.model}</span>
                  <span className="font-mono font-semibold text-primary ml-2 shrink-0">×{v.factor}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Quote Builder Tab (legacy job-prefill flow) ──────────────────────────────
function QuoteBuilderTab({ isAdmin }: { isAdmin: boolean }) {
  const { data: seed, isLoading: seedLoading } = useQuery<EstimatorSeed>({
    queryKey: ["/api/estimator/seed"],
  });
  const { data: jobs } = useQuery<Job[]>({ queryKey: ["/api/jobs"] });
  const { data: customers } = useQuery<Customer[]>({ queryKey: ["/api/customers"] });
  const { data: allVehicles } = useQuery<Vehicle[]>({ queryKey: ["/api/vehicles"] });

  const [selectedJobId, setSelectedJobId] = useState<string>("");
  const [selectedVehicleKey, setSelectedVehicleKey] = useState<string>("");
  const [selectedServiceId, setSelectedServiceId] = useState<string>("");
  const [lineItems, setLineItems] = useState<LineItem[]>([]);

  const vehicleFactor = useMemo<number>(() => {
    if (!seed) return 1.0;
    if (selectedJobId) {
      const job = jobs?.find((j) => j.id === parseInt(selectedJobId));
      if (job?.vehicleId) {
        const vehicle = allVehicles?.find((v) => v.id === job.vehicleId);
        if (vehicle) {
          const match = seed.vehicles.find(
            (sv) => sv.make.toLowerCase() === vehicle.make.toLowerCase() && sv.model.toLowerCase() === vehicle.model.toLowerCase()
          );
          return match?.factor ?? 1.0;
        }
      }
    }
    if (selectedVehicleKey) {
      const [make, model] = selectedVehicleKey.split("|");
      const match = seed.vehicles.find((v) => v.make === make && v.model === model);
      return match?.factor ?? 1.0;
    }
    return 1.0;
  }, [seed, selectedJobId, selectedVehicleKey, jobs, allVehicles]);

  const vehicleClassLabel = useMemo<string>(() => {
    if (!seed) return "";
    if (selectedJobId) {
      const job = jobs?.find((j) => j.id === parseInt(selectedJobId));
      if (job?.vehicleId) {
        const vehicle = allVehicles?.find((v) => v.id === job.vehicleId);
        if (vehicle) {
          const match = seed.vehicles.find(
            (sv) => sv.make.toLowerCase() === vehicle.make.toLowerCase() && sv.model.toLowerCase() === vehicle.model.toLowerCase()
          );
          if (match) return `${vehicle.year} ${vehicle.make} ${vehicle.model} (${match.class}, ×${match.factor})`;
          return `${vehicle.year} ${vehicle.make} ${vehicle.model}`;
        }
      }
    }
    if (selectedVehicleKey) {
      const [make, model] = selectedVehicleKey.split("|");
      const match = seed.vehicles.find((v) => v.make === make && v.model === model);
      if (match) return `${make} ${model} (${match.class}, ×${match.factor})`;
      return `${make} ${model}`;
    }
    return "";
  }, [seed, selectedJobId, selectedVehicleKey, jobs, allVehicles]);

  function handleJobSelect(jobId: string) {
    setSelectedJobId(jobId);
    setSelectedVehicleKey("");
    setLineItems([]);
  }

  function addService() {
    if (!selectedServiceId || !seed) return;
    const service = seed.services.find((s) => s.id === selectedServiceId);
    if (!service) return;
    if (lineItems.find((li) => li.service.id === selectedServiceId)) return;
    setLineItems((prev) => [...prev, { service, qty: 1 }]);
    setSelectedServiceId("");
  }

  function removeService(idx: number) {
    setLineItems((prev) => prev.filter((_, i) => i !== idx));
  }

  const totals = useMemo(() => {
    const subtotal = lineItems.reduce((sum, item) => sum + recommendedQuote(item.service, vehicleFactor) * item.qty, 0);
    const tax = subtotal * 0.085;
    const total = subtotal + tax;
    return { subtotal, tax, total };
  }, [lineItems, vehicleFactor]);

  const jobCustomer = (jobId: string) => {
    const job = jobs?.find((j) => j.id === parseInt(jobId));
    if (!job) return null;
    return customers?.find((c) => c.id === job.customerId);
  };

  const jobVehicle = (jobId: string) => {
    const job = jobs?.find((j) => j.id === parseInt(jobId));
    if (!job?.vehicleId) return null;
    return allVehicles?.find((v) => v.id === job.vehicleId);
  };

  if (seedLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Vehicle / Job selection */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Car size={15} />
            Vehicle Selection
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Prefill from job */}
          {jobs && jobs.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Prefill from existing job (optional)</Label>
              <Select
                value={selectedJobId || undefined}
                onValueChange={(value) => handleJobSelect(value === NO_JOB_PREFILL ? "" : value)}
              >
                <SelectTrigger data-testid="select-job">
                  <SelectValue placeholder="Select a job to prefill…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_JOB_PREFILL}>— No job prefill —</SelectItem>
                  {jobs.filter((j) => j.vehicleId).map((job) => {
                    const cust = customers?.find((c) => c.id === job.customerId);
                    const veh = allVehicles?.find((v) => v.id === job.vehicleId);
                    return (
                      <SelectItem key={job.id} value={String(job.id)}>
                        #{job.id} · {cust?.name ?? "Unknown"} · {veh ? `${veh.year} ${veh.make} ${veh.model}` : "Vehicle"} · {job.serviceType}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Manual vehicle */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">
              {selectedJobId ? "Or select a different vehicle manually" : "Select vehicle"}
            </Label>
            <Select
              value={selectedVehicleKey || undefined}
              onValueChange={(k) => {
                setSelectedVehicleKey(k === ANY_VEHICLE ? "" : k);
                setSelectedJobId("");
              }}
            >
              <SelectTrigger data-testid="select-vehicle">
                <SelectValue placeholder="Choose vehicle make/model…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY_VEHICLE}>— Any / Other vehicle —</SelectItem>
                {seed?.vehicles.map((v) => (
                  <SelectItem key={`${v.make}|${v.model}`} value={`${v.make}|${v.model}`}>
                    {v.make} {v.model} ({v.class}) — ×{v.factor}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {vehicleClassLabel && (
            <div className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2">
              <TrendingUp size={14} className="text-primary shrink-0" />
              <span className="text-xs text-muted-foreground">
                Pricing adjusted for: <span className="font-medium text-foreground">{vehicleClassLabel}</span>
              </span>
            </div>
          )}

          {selectedJobId && (() => {
            const cust = jobCustomer(selectedJobId);
            const veh = jobVehicle(selectedJobId);
            const job = jobs?.find((j) => j.id === parseInt(selectedJobId));
            if (!job) return null;
            return (
              <div className="rounded-md border border-border/50 bg-muted/20 p-3 space-y-1">
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Job Context</div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  <div><span className="text-muted-foreground">Job #</span> <span className="font-medium">{job.id}</span></div>
                  <div><span className="text-muted-foreground">Service</span> <span className="font-medium">{job.serviceType}</span></div>
                  {cust && <div><span className="text-muted-foreground">Customer</span> <span className="font-medium">{cust.name}</span></div>}
                  {veh && <div><span className="text-muted-foreground">Vehicle</span> <span className="font-medium">{veh.year} {veh.make} {veh.model}</span></div>}
                  {job.estimateAmount && <div><span className="text-muted-foreground">Existing estimate</span> <span className="font-medium">{fmtCurrency(job.estimateAmount)}</span></div>}
                </div>
              </div>
            );
          })()}
        </CardContent>
      </Card>

      {/* Service line items */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Calculator size={15} />
            Services
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <div className="flex-1">
              <Select value={selectedServiceId} onValueChange={setSelectedServiceId}>
                <SelectTrigger data-testid="select-service">
                  <SelectValue placeholder="Add a service…" />
                </SelectTrigger>
                <SelectContent>
                  {seed?.services
                    .filter((s) => !lineItems.find((li) => li.service.id === s.id))
                    .map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={addService}
              disabled={!selectedServiceId}
              size="sm"
              data-testid="btn-add-service"
              className="shrink-0"
            >
              <Plus size={15} className="mr-1" />
              Add
            </Button>
          </div>

          {lineItems.length === 0 && (
            <div className="text-center py-8 text-sm text-muted-foreground">
              <Calculator size={28} className="mx-auto mb-2 opacity-30" />
              Add services above to build your estimate
            </div>
          )}

          <div className="space-y-3">
            {lineItems.map((item, idx) => (
              <LineItemCard
                key={item.service.id}
                item={item}
                factor={vehicleFactor}
                isAdmin={isAdmin}
                onRemove={() => removeService(idx)}
              />
            ))}
          </div>

          {lineItems.length > 0 && (
            <>
              <Separator />
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal (recommended quote)</span>
                  <span className="font-medium">{fmtCurrency(totals.subtotal)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Tax (8.5%)</span>
                  <span className="font-medium">{fmtCurrency(totals.tax)}</span>
                </div>
                <Separator />
                <div className="flex justify-between">
                  <span className="font-semibold">Total</span>
                  <span className="text-lg font-bold text-primary">{fmtCurrency(totals.total)}</span>
                </div>
                {isAdmin && (
                  <div className="pt-1 space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground flex items-center gap-1">
                        <Users size={12} />
                        Technician earnings (55% of subtotal)
                      </span>
                      <span className="font-medium text-green-600 dark:text-green-400">{fmtCurrency(totals.subtotal * 0.55)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Office share (45%)</span>
                      <span className="font-medium text-orange-500">{fmtCurrency(totals.subtotal * 0.45)}</span>
                    </div>
                  </div>
                )}
              </div>

              {isAdmin && (
                <div className="rounded-md bg-primary/5 border border-primary/20 p-3">
                  <div className="text-xs font-semibold text-primary mb-1 flex items-center gap-1.5">
                    <Info size={12} />
                    Admin Note — Benchmark Sources
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Prices use RepairPal midpoint as recommended quote, adjusted by vehicle class factor (e.g. trucks ×1.18–1.22, luxury ×1.32–1.50).
                    All four benchmark sources (KBB Fair Repair, NAPA AutoCare, YourMechanic, RepairPal) are visible on each line item. Switch to the{" "}
                    <strong className="text-foreground">Benchmark Comparison</strong> tab for full market analysis.
                  </p>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Vehicle factor reference — admin only */}
      {isAdmin && seed && (
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Vehicle Class Factors (Admin Reference)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {seed.vehicles.map((v) => (
                <div key={`${v.make}${v.model}`} className="text-xs flex items-center justify-between px-2 py-1.5 rounded bg-muted/40">
                  <span className="text-foreground/80">{v.make} {v.model}</span>
                  <span className="font-mono font-semibold text-primary">×{v.factor}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function Estimator() {
  const { user, isAdmin, isLeadMechanic } = useAuth();
  const adminMode = isAdmin();
  const leadMode = isLeadMechanic();

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-5xl mx-auto">
      {/* Page header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Calculator size={20} className="text-primary" />
            Service Estimator
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Build estimates with market benchmarks from KBB, NAPA, RepairPal, and YourMechanic
          </p>
        </div>
        <div className="flex items-center gap-2">
          {adminMode && (
            <Badge variant="outline" className="text-xs bg-primary/5 border-primary/30 text-primary">
              Admin · Full benchmark access
            </Badge>
          )}
          {leadMode && !adminMode && (
            <Badge variant="outline" className="text-xs">
              Lead Mechanic
            </Badge>
          )}
          {!adminMode && !leadMode && user && (
            <Badge variant="secondary" className="text-xs">
              Mechanic view
            </Badge>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="quote-builder" className="w-full">
        <TabsList className="w-full sm:w-auto" data-testid="estimator-tabs">
          <TabsTrigger value="quote-builder" className="flex-1 sm:flex-none" data-testid="tab-quote-builder">
            <Calculator size={14} className="mr-1.5" />
            Quote Builder
          </TabsTrigger>
          <TabsTrigger value="benchmark" className="flex-1 sm:flex-none" data-testid="tab-benchmark">
            <BarChart3 size={14} className="mr-1.5" />
            Benchmark Comparison
            {adminMode && (
              <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground font-bold">Admin</span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="quote-builder" className="mt-5">
          <QuoteBuilderTab isAdmin={adminMode || leadMode} />
        </TabsContent>

        <TabsContent value="benchmark" className="mt-5">
          <BenchmarkTab isAdmin={adminMode} />
        </TabsContent>
      </Tabs>

      {/* Mechanic info note */}
      {!adminMode && !leadMode && (
        <div className="flex items-start gap-2 rounded-md bg-muted/50 border border-border px-3 py-2">
          <AlertCircle size={14} className="text-muted-foreground shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground">
            Full benchmark source details and pricing management controls are visible to admins.
            Use the Quote Builder to generate estimates for your jobs.
          </p>
        </div>
      )}
    </div>
  );
}
