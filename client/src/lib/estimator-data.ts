// ─── Estimator benchmark data ────────────────────────────────────────────────
// Ported from the v2-prefill-wired HTML module's benchmarkSeed constant.
// Services include KBB, NAPA, YourMechanic, and RepairPal base prices
// which are then scaled by vehicle class factor + age factor + zip factor.

export interface BenchmarkServiceBases {
  kbb: [number, number];
  napa: [number, number];
  ym: number;
  rp: [number, number];
}

export interface BenchmarkService {
  id: string;
  name: string;
  bases: BenchmarkServiceBases;
  fixedHourly?: number; // if set, this service is billed at a flat hourly rate
}

export interface BenchmarkVehicle {
  make: string;
  model: string;
  class: string;
  factor: number;
}

export const BENCHMARK_SERVICES: BenchmarkService[] = [
  { id: "oil-change", name: "Oil Change", bases: { kbb: [72, 118], napa: [68, 112], ym: 99, rp: [79, 121] } },
  { id: "battery-replacement", name: "Battery Replacement", bases: { kbb: [185, 295], napa: [176, 284], ym: 239, rp: [194, 301] } },
  { id: "brake-pad-replacement", name: "Brake Pad Replacement", bases: { kbb: [245, 418], napa: [228, 395], ym: 329, rp: [258, 429] } },
  { id: "starter-replacement", name: "Starter Replacement", bases: { kbb: [395, 735], napa: [372, 706], ym: 589, rp: [418, 748] } },
  { id: "alternator-replacement", name: "Alternator Replacement", bases: { kbb: [468, 866], napa: [452, 838], ym: 679, rp: [492, 884] } },
  { id: "radiator-replacement", name: "Radiator Replacement", bases: { kbb: [512, 958], napa: [489, 925], ym: 749, rp: [538, 982] } },
  { id: "serpentine-belt", name: "Serpentine Belt Replacement", bases: { kbb: [118, 242], napa: [109, 228], ym: 179, rp: [124, 249] } },
  { id: "spark-plugs", name: "Spark Plug Replacement", bases: { kbb: [188, 436], napa: [175, 409], ym: 289, rp: [196, 448] } },
  { id: "front-struts", name: "Front Strut Assembly Replacement", bases: { kbb: [686, 1384], napa: [652, 1325], ym: 1029, rp: [712, 1412] } },
  { id: "water-pump", name: "Water Pump Replacement", bases: { kbb: [456, 968], napa: [438, 934], ym: 719, rp: [472, 989] } },
  { id: "pre-purchase-inspection", name: "Pre-Purchase Inspection", bases: { kbb: [128, 235], napa: [119, 219], ym: 179, rp: [134, 244] } },
  { id: "general-diagnostics", name: "General Diagnostics", bases: { kbb: [109, 189], napa: [102, 176], ym: 149, rp: [115, 196] } },
  { id: "general-labor-hourly", name: "General Labor (per hour)", bases: { kbb: [125, 125], napa: [125, 125], ym: 125, rp: [125, 125] }, fixedHourly: 125 },
  { id: "hose-replacement", name: "Hose Replacement", bases: { kbb: [156, 348], napa: [148, 332], ym: 249, rp: [164, 359] } },
  { id: "control-arm-bushings", name: "Control Arm Bushings", bases: { kbb: [338, 712], napa: [324, 689], ym: 529, rp: [354, 728] } },
  { id: "high-pressure-fuel-pump", name: "High Pressure Fuel Pump", bases: { kbb: [489, 1124], napa: [462, 1089], ym: 829, rp: [512, 1148] } },
  { id: "timing-chain", name: "Timing Chain Replacement", bases: { kbb: [890, 1880], napa: [858, 1824], ym: 1389, rp: [924, 1912] } },
  { id: "cv-axle", name: "CV Axle / Half Shaft Replacement", bases: { kbb: [328, 689], napa: [312, 664], ym: 509, rp: [344, 712] } },
  { id: "power-steering-pump", name: "Power Steering Pump", bases: { kbb: [412, 886], napa: [392, 855], ym: 649, rp: [432, 909] } },
  { id: "ac-compressor", name: "AC Compressor Replacement", bases: { kbb: [689, 1428], napa: [658, 1389], ym: 1069, rp: [712, 1459] } },
];

export const BENCHMARK_VEHICLES: BenchmarkVehicle[] = [
  { make: "Toyota", model: "Camry", class: "Standard Sedan", factor: 1.00 },
  { make: "Toyota", model: "Corolla", class: "Economy Sedan", factor: 0.92 },
  { make: "Toyota", model: "RAV4", class: "Compact SUV", factor: 1.08 },
  { make: "Toyota", model: "Tacoma", class: "Compact Truck", factor: 1.14 },
  { make: "Toyota", model: "Tundra", class: "Full-Size Truck", factor: 1.22 },
  { make: "Honda", model: "Civic", class: "Economy Sedan", factor: 0.90 },
  { make: "Honda", model: "Accord", class: "Standard Sedan", factor: 0.98 },
  { make: "Honda", model: "CR-V", class: "Compact SUV", factor: 1.06 },
  { make: "Ford", model: "F-150", class: "Full-Size Truck", factor: 1.20 },
  { make: "Ford", model: "Explorer", class: "Midsize SUV", factor: 1.12 },
  { make: "Ford", model: "Mustang", class: "Sports", factor: 1.10 },
  { make: "Chevrolet", model: "Silverado", class: "Full-Size Truck", factor: 1.20 },
  { make: "Chevrolet", model: "Equinox", class: "Compact SUV", factor: 1.06 },
  { make: "Chevrolet", model: "Tahoe", class: "Full-Size SUV", factor: 1.28 },
  { make: "Nissan", model: "Altima", class: "Standard Sedan", factor: 0.98 },
  { make: "Nissan", model: "Sentra", class: "Economy Sedan", factor: 0.92 },
  { make: "Nissan", model: "Rogue", class: "Compact SUV", factor: 1.06 },
  { make: "Dodge", model: "Charger", class: "Sports Sedan", factor: 1.10 },
  { make: "Dodge", model: "Durango", class: "Midsize SUV", factor: 1.16 },
  { make: "Jeep", model: "Wrangler", class: "Off-Road", factor: 1.18 },
  { make: "Jeep", model: "Grand Cherokee", class: "Midsize SUV", factor: 1.14 },
  { make: "BMW", model: "3 Series", class: "Luxury Sedan", factor: 1.36 },
  { make: "BMW", model: "5 Series", class: "Luxury Sedan", factor: 1.42 },
  { make: "BMW", model: "X5", class: "Luxury SUV", factor: 1.50 },
  { make: "Mercedes-Benz", model: "C-Class", class: "Luxury Sedan", factor: 1.40 },
  { make: "Mercedes-Benz", model: "E-Class", class: "Luxury Sedan", factor: 1.48 },
  { make: "Audi", model: "A4", class: "Luxury Sedan", factor: 1.34 },
  { make: "Subaru", model: "Outback", class: "Crossover", factor: 1.04 },
  { make: "Subaru", model: "Forester", class: "Compact SUV", factor: 1.04 },
  { make: "Volkswagen", model: "Jetta", class: "European Compact", factor: 1.12 },
  { make: "Lexus", model: "ES", class: "Luxury Sedan", factor: 1.32 },
  { make: "Lexus", model: "RX", class: "Luxury SUV", factor: 1.40 },
  { make: "RAM", model: "1500", class: "Full-Size Truck", factor: 1.18 },
  { make: "GMC", model: "Sierra", class: "Full-Size Truck", factor: 1.20 },
  { make: "GMC", model: "Yukon", class: "Full-Size SUV", factor: 1.30 },
  { make: "Kia", model: "Optima", class: "Standard Sedan", factor: 0.96 },
  { make: "Kia", model: "Sorento", class: "Midsize SUV", factor: 1.08 },
  { make: "Hyundai", model: "Elantra", class: "Economy Sedan", factor: 0.94 },
  { make: "Hyundai", model: "Tucson", class: "Compact SUV", factor: 1.06 },
  { make: "Mazda", model: "Mazda3", class: "Economy Sedan", factor: 0.94 },
  { make: "Mazda", model: "CX-5", class: "Compact SUV", factor: 1.06 },
  { make: "Volvo", model: "XC60", class: "Luxury SUV", factor: 1.38 },
];

export const UNIQUE_MAKES = [...new Set(BENCHMARK_VEHICLES.map((v) => v.make))].sort();

export function getModelsForMake(make: string): string[] {
  return BENCHMARK_VEHICLES.filter((v) => v.make === make).map((v) => v.model);
}

export function getVehicleFactor(make: string, model: string, year: number, zip: string, svc: BenchmarkService): number {
  if (svc.fixedHourly) return 1;
  const v = BENCHMARK_VEHICLES.find((bv) => bv.make === make && bv.model === model) ?? { factor: 1.0 };
  const ageFactor = year >= 2022 ? 1.08 : year >= 2017 ? 1.0 : year >= 2010 ? 0.97 : 1.03;
  const zipFactor = zip.startsWith("90") || zip.startsWith("91") || zip.startsWith("70") ? 1.04 : 1.0;
  return +(v.factor * ageFactor * zipFactor).toFixed(3);
}

export interface BenchmarkResult {
  svc: BenchmarkService;
  kbb: [number, number];
  napa: [number, number];
  ym: number;
  rp: [number, number];
  low: number;
  high: number;
  marketAvg: number;
  factor: number;
  fixedHourly: boolean;
  hourlyRate: number | null;
}

function avg(a: number, b: number): number {
  return Math.round((a + b) / 2);
}

export function computeBenchmark(serviceId: string, make: string, model: string, year: number, zip: string): BenchmarkResult | null {
  const svc = BENCHMARK_SERVICES.find((s) => s.id === serviceId);
  if (!svc) return null;
  const factor = getVehicleFactor(make, model, year, zip, svc);
  const kbb: [number, number] = [Math.round(svc.bases.kbb[0] * factor), Math.round(svc.bases.kbb[1] * factor)];
  const napa: [number, number] = [Math.round(svc.bases.napa[0] * factor), Math.round(svc.bases.napa[1] * factor)];
  const ym = Math.round(svc.bases.ym * factor);
  const rp: [number, number] = [Math.round(svc.bases.rp[0] * factor), Math.round(svc.bases.rp[1] * factor)];
  const low = Math.min(kbb[0], napa[0], Math.round(ym * 0.94), rp[0]);
  const high = Math.max(kbb[1], napa[1], Math.round(ym * 1.06), rp[1]);
  const marketAvg = Math.round((avg(kbb[0], kbb[1]) + avg(napa[0], napa[1]) + ym + avg(rp[0], rp[1])) / 4);
  return { svc, kbb, napa, ym, rp, low, high, marketAvg, factor, fixedHourly: !!svc.fixedHourly, hourlyRate: svc.fixedHourly ?? null };
}

export function fmtMoney(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

export function pricePosition(price: number, marketAvg: number): string {
  const pct = ((price - marketAvg) / marketAvg) * 100;
  if (pct < -8) return "Below market";
  if (pct > 8) return "Above market";
  return "Near market";
}

export function buildSnapshotJson(
  result: BenchmarkResult,
  make: string,
  model: string,
  year: number,
  zip: string,
  finalPrice: number
): string {
  const payload = {
    business: "Affordable Mobile Mechanics",
    created_at: new Date().toISOString(),
    vehicle: { year, make, model, zip },
    service: result.svc.name,
    fixed_hourly: result.fixedHourly,
    benchmarks: {
      kbb: { low: result.kbb[0], high: result.kbb[1] },
      napa: { low: result.napa[0], high: result.napa[1] },
      yourmechanic: { flat_rate: result.ym },
      repairpal: { low: result.rp[0], high: result.rp[1] },
    },
    market_average: result.marketAvg,
    customer_price: finalPrice,
    technician_commission_55: Math.round(finalPrice * 0.55),
  };
  return JSON.stringify(payload, null, 2);
}
