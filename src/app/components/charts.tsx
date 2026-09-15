'use client';

import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  AreaChart, Area, Cell, PieChart, Pie, ComposedChart, Line, ReferenceLine,
} from 'recharts';
import { brlCompact, mesLabel, brl } from '@/lib/format';

const AXIS = { fill: '#8b93a1', fontSize: 11 };
const GRID = '#1e222a';

export const PIE_COLORS = [
  '#2ee6a0', '#f0932b', '#ec5f9e', '#f5b642', '#5bc8f5',
  '#7ed957', '#c792ea', '#ff6b6b', '#4dd0b1', '#e0729e', '#9aa0ab',
];

function TT({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-line bg-surface-2 px-3 py-2 text-xs shadow-card">
      {label && <div className="mb-1 text-muted">{label}</div>}
      {payload.map((p: any) => (
        <div key={p.dataKey ?? p.name} className="flex items-center gap-2 tnum">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color || p.payload?.fill }} />
          <span className="text-muted">{p.name}:</span>
          <span className="font-medium text-text">{brl(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

export function ReceitaDespesaChart({ data }: { data: { mes: string; receita: number; despesa: number }[] }) {
  const d = data.map((x) => ({ ...x, label: mesLabel(x.mes) }));
  return (
    <div className="money"><ResponsiveContainer width="100%" height={260}>
      <BarChart data={d} margin={{ top: 8, right: 4, left: -10, bottom: 0 }} barGap={4}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
        <XAxis dataKey="label" tick={AXIS} axisLine={false} tickLine={false} />
        <YAxis tick={AXIS} axisLine={false} tickLine={false} tickFormatter={(v) => brlCompact(v)} width={52} />
        <Tooltip content={<TT />} cursor={{ fill: '#ffffff08' }} />
        <Bar dataKey="receita" name="Receita" fill="#2ee6a0" radius={[5, 5, 0, 0]} />
        <Bar dataKey="despesa" name="Despesa" fill="#ff6b6b" radius={[5, 5, 0, 0]} />
      </BarChart>
    </ResponsiveContainer></div>
  );
}

export function SaldoAreaChart({ data }: { data: { mes: string; receita: number; despesa: number }[] }) {
  const d = data.map((x) => ({ label: mesLabel(x.mes), saldo: x.receita - x.despesa }));
  return (
    <div className="money"><ResponsiveContainer width="100%" height={200}>
      <AreaChart data={d} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
        <defs>
          <linearGradient id="gsaldo" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2ee6a0" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#2ee6a0" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
        <XAxis dataKey="label" tick={AXIS} axisLine={false} tickLine={false} />
        <YAxis tick={AXIS} axisLine={false} tickLine={false} tickFormatter={(v) => brlCompact(v)} width={52} />
        <Tooltip content={<TT />} cursor={{ stroke: '#ffffff14' }} />
        <Area type="monotone" dataKey="saldo" name="Saldo" stroke="#2ee6a0" strokeWidth={2} fill="url(#gsaldo)" />
      </AreaChart>
    </ResponsiveContainer></div>
  );
}

export function AportesChart({ data }: { data: { mes: string; valor: number }[] }) {
  const d = data.map((x) => ({ label: mesLabel(x.mes), valor: x.valor }));
  return (
    <div className="money"><ResponsiveContainer width="100%" height={220}>
      <BarChart data={d} margin={{ top: 8, right: 4, left: -10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
        <XAxis dataKey="label" tick={AXIS} axisLine={false} tickLine={false} />
        <YAxis tick={AXIS} axisLine={false} tickLine={false} tickFormatter={(v) => brlCompact(v)} width={52} />
        <Tooltip content={<TT />} cursor={{ fill: '#ffffff08' }} />
        <Bar dataKey="valor" name="Aporte líquido" radius={[5, 5, 0, 0]}>
          {d.map((x, i) => <Cell key={i} fill={x.valor >= 0 ? '#2ee6a0' : '#ff6b6b'} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer></div>
  );
}

export function CasaChart({ data }: { data: { mes: string; despesa: number }[] }) {
  const d = data.map((x) => ({ label: mesLabel(x.mes), valor: x.despesa }));
  return (
    <div className="money"><ResponsiveContainer width="100%" height={220}>
      <BarChart data={d} margin={{ top: 8, right: 4, left: -10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
        <XAxis dataKey="label" tick={AXIS} axisLine={false} tickLine={false} />
        <YAxis tick={AXIS} axisLine={false} tickLine={false} tickFormatter={(v) => brlCompact(v)} width={52} />
        <Tooltip content={<TT />} cursor={{ fill: '#ffffff08' }} />
        <Bar dataKey="valor" name="Gasto com a casa" fill="#f5b642" radius={[5, 5, 0, 0]} />
      </BarChart>
    </ResponsiveContainer></div>
  );
}

export function PatrimonioChart({ data }: { data: { data: string; valor: number }[] }) {
  const d = data.map((x) => ({ label: x.data.slice(5).split('-').reverse().join('/'), valor: x.valor }));
  return (
    <div className="money"><ResponsiveContainer width="100%" height={220}>
      <AreaChart data={d} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
        <defs>
          <linearGradient id="gpat" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2ee6a0" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#2ee6a0" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
        <XAxis dataKey="label" tick={AXIS} axisLine={false} tickLine={false} />
        <YAxis tick={AXIS} axisLine={false} tickLine={false} tickFormatter={(v) => brlCompact(v)} width={52} />
        <Tooltip content={<TT />} cursor={{ stroke: '#ffffff14' }} />
        <Area type="monotone" dataKey="valor" name="Patrimônio" stroke="#2ee6a0" strokeWidth={2} fill="url(#gpat)" dot={{ r: 3 }} />
      </AreaChart>
    </ResponsiveContainer></div>
  );
}

export function ProjecaoChart({
  data, temSimulacao,
}: {
  data: { mesLabel: string; saldo: number; saldoProjetado: number; saldoComCompra?: number }[];
  temSimulacao?: boolean;
}) {
  return (
    <div className="money"><ResponsiveContainer width="100%" height={320}>
      {/* dois eixos: a sobra mensal e o saldo acumulado têm escalas bem diferentes —
          num eixo só as barras somem perto da linha */}
      <ComposedChart data={data} margin={{ top: 8, right: 4, left: -10, bottom: 0 }} barCategoryGap="20%">
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
        <XAxis dataKey="mesLabel" tick={AXIS} axisLine={false} tickLine={false} />
        <YAxis yAxisId="fluxo" tick={AXIS} axisLine={false} tickLine={false} tickFormatter={(v) => brlCompact(v)} width={68} />
        <YAxis yAxisId="conta" orientation="right" tick={AXIS} axisLine={false} tickLine={false} tickFormatter={(v) => brlCompact(v)} width={68} />
        <ReferenceLine yAxisId="conta" y={0} stroke="#ff6b6b" strokeDasharray="2 4" strokeOpacity={0.5} />
        <Tooltip content={<TT />} cursor={{ fill: '#ffffff08' }} />
        <Bar yAxisId="fluxo" dataKey="saldo" name="Sobra do mês" radius={[5, 5, 0, 0]} maxBarSize={44}>
          {data.map((x, i) => <Cell key={i} fill={x.saldo >= 0 ? '#2ee6a0' : '#ff6b6b'} />)}
        </Bar>
        <Line yAxisId="conta" type="monotone" dataKey="saldoProjetado" name="Dinheiro em conta" stroke="#5bc8f5" strokeWidth={2} dot={false} />
        {temSimulacao && (
          <Line
            yAxisId="conta" type="monotone" dataKey="saldoComCompra" name="Com a compra"
            stroke="#f5b642" strokeWidth={2} strokeDasharray="5 4" dot={false}
          />
        )}
      </ComposedChart>
    </ResponsiveContainer></div>
  );
}

export function CategoriaDonut({ data }: { data: { categoria: string; total: number }[] }) {
  const top = data.slice(0, 8);
  const resto = data.slice(8).reduce((s, x) => s + x.total, 0);
  const d = resto > 0 ? [...top, { categoria: 'Outros', total: resto }] : top;
  return (
    <div className="money"><ResponsiveContainer width="100%" height={230}>
      <PieChart>
        <Pie data={d} dataKey="total" nameKey="categoria" cx="50%" cy="50%" innerRadius={58} outerRadius={92} paddingAngle={2} stroke="none">
          {d.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
        </Pie>
        <Tooltip content={<TT />} />
      </PieChart>
    </ResponsiveContainer></div>
  );
}
