import { brl } from '@/lib/format';
import {
  ArrowDownRight, ArrowUpRight, ShoppingCart, Utensils, Bike, Home, Zap, Tv, Gamepad2,
  ShoppingBag, Pill, Fuel, ArrowLeftRight, Shield, Car, Droplet, Wifi, GraduationCap,
  Plane, Baby, PawPrint, Landmark, Receipt, Tag, HeartPulse, Dumbbell, type LucideIcon,
} from 'lucide-react';

export function PageTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-5">
      <h1 className="text-lg md:text-xl font-semibold tracking-tight">{title}</h1>
      {subtitle && <p className="text-sm text-muted mt-0.5">{subtitle}</p>}
    </div>
  );
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-xs font-medium uppercase tracking-wide text-faint mb-3">{children}</h2>;
}

export function KpiCard({
  label, value, tone = 'neutral', delta, deltaLabel = 'vs mês ant.', hint, icon: Icon,
}: {
  label: string; value: number; tone?: 'up' | 'down' | 'neutral';
  delta?: number | null; deltaLabel?: string; hint?: string; icon?: LucideIcon;
}) {
  const color = tone === 'up' ? 'text-accent' : tone === 'down' ? 'text-despesa' : 'text-text';
  return (
    <div className="card">
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted">{label}</div>
        {Icon && <Icon size={16} className="text-faint" />}
      </div>
      <div className={`mt-2 text-xl md:text-2xl font-semibold tnum ${color}`}>{brl(value)}</div>
      <div className="mt-1 flex items-center gap-2 text-xs text-muted">
        {delta != null && Number.isFinite(delta) && (
          <span className={`inline-flex items-center gap-0.5 ${delta > 0 ? 'text-accent' : delta < 0 ? 'text-despesa' : ''}`}>
            {delta > 0 ? <ArrowUpRight size={13} /> : delta < 0 ? <ArrowDownRight size={13} /> : null}
            {Math.abs(delta)}% {deltaLabel}
          </span>
        )}
        {hint && <span>{hint}</span>}
      </div>
    </div>
  );
}

export function Progress({ value, teto }: { value: number; teto: number }) {
  const p = teto > 0 ? Math.min((value / teto) * 100, 100) : 0;
  const over = teto > 0 && value > teto;
  const near = !over && p >= 80;
  const color = over ? 'bg-despesa' : near ? 'bg-warn' : 'bg-accent';
  return (
    <div className="h-2 w-full rounded-full bg-surface-3 overflow-hidden">
      <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${p}%` }} />
    </div>
  );
}

export function Badge({ children, color = 'muted' }: { children: React.ReactNode; color?: string }) {
  const map: Record<string, string> = {
    muted: 'bg-surface-3 text-muted',
    matheus: 'bg-matheus/15 text-matheus',
    ariane: 'bg-ariane/15 text-ariane',
    accent: 'bg-accent/15 text-accent',
    despesa: 'bg-despesa/15 text-despesa',
    warn: 'bg-warn/15 text-warn',
  };
  return <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium ${map[color] ?? map.muted}`}>{children}</span>;
}

export function respBadge(resp: string) {
  if (resp === 'Matheus') return <Badge color="matheus">Matheus</Badge>;
  if (resp === 'Ariane') return <Badge color="ariane">Ariane</Badge>;
  return <Badge>{resp}</Badge>;
}

// ---- ícones por categoria ----
const ICON_MAP: Record<string, LucideIcon> = {
  Groceries: ShoppingCart,
  'Food delivery': Bike,
  'Eating out': Utensils,
  'Food and drinks': Utensils,
  Housing: Home,
  Electricity: Zap,
  'Water and sewage': Droplet,
  Water: Droplet,
  'Digital services': Tv,
  Internet: Wifi,
  Telecommunications: Wifi,
  Gaming: Gamepad2,
  Shopping: ShoppingBag,
  Clothing: ShoppingBag,
  Pharmacy: Pill,
  Healthcare: HeartPulse,
  'Hospital clinics and labs': HeartPulse,
  'Gas stations': Fuel,
  Gas: Fuel,
  Automotive: Car,
  'Car rental': Car,
  Transfers: ArrowLeftRight,
  'Transfer - PIX': ArrowLeftRight,
  Insurance: Shield,
  Education: GraduationCap,
  Travel: Plane,
  'Kids and toys': Baby,
  Pets: PawPrint,
  Taxes: Landmark,
  'Bank fees': Landmark,
  Services: Receipt,
  Gym: Dumbbell,
  'Loans and financing': Landmark,
};

const ICON_COLORS = ['text-accent', 'text-matheus', 'text-ariane', 'text-warn', 'text-[#5bc8f5]', 'text-[#c792ea]'];

export function catIcon(categoria: string): { Icon: LucideIcon; color: string } {
  const Icon = ICON_MAP[categoria] ?? Tag;
  let h = 0;
  for (let i = 0; i < categoria.length; i++) h = (h * 31 + categoria.charCodeAt(i)) & 0xffff;
  return { Icon, color: ICON_COLORS[h % ICON_COLORS.length] };
}
