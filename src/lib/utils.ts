export const r2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

const fmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export const brl = (n: number | null | undefined): string => fmt.format(r2(n ?? 0));

export const pad = (n: number): string => String(n).padStart(2, '0');

export function uid(prefix = 'id'): string {
  const rnd =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 12)
      : Math.random().toString(36).slice(2, 14);
  return `${prefix}-${rnd}`;
}

// ---------- Datas (sempre strings ISO locais YYYY-MM-DD, sem fuso) ----------
export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function isISO(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  if (y < 1990 || y > 2100) return false;
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso || !isISO(iso)) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export const ymOf = (iso: string): string => iso.slice(0, 7);

const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export function monthLong(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return `${MONTHS[m - 1]} de ${y}`;
}
export function monthShort(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return `${MONTHS[m - 1].slice(0, 3)}/${String(y).slice(2)}`;
}

export function daysInMonth(y: number, m: number): number {
  return new Date(y, m, 0).getDate();
}

export function addMonthsYM(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${pad((t % 12) + 1)}`;
}

export function dateInMonth(ym: string, day: number): string {
  const [y, m] = ym.split('-').map(Number);
  return `${ym}-${pad(Math.min(day, daysInMonth(y, m)))}`;
}

export function addMonthsISO(iso: string, n: number): string {
  const day = Number(iso.slice(8, 10));
  return dateInMonth(addMonthsYM(ymOf(iso), n), day);
}

export function monthRange(ym: string): [string, string] {
  const [y, m] = ym.split('-').map(Number);
  return [`${ym}-01`, `${ym}-${pad(daysInMonth(y, m))}`];
}

export function daysDiff(fromISO: string, toISO: string): number {
  const a = new Date(fromISO + 'T00:00:00').getTime();
  const b = new Date(toISO + 'T00:00:00').getTime();
  return Math.round((b - a) / 86400000);
}

// ---------- Números ----------
/** Aceita "1.234,56", "1234,56", "1234.56". Retorna NaN se inválido. */
export function parseMoney(input: string | number | null | undefined): number {
  if (typeof input === 'number') return input;
  if (input == null) return NaN;
  let s = String(input).trim().replace(/[R$\s]/g, '');
  if (!s) return NaN;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if ((s.match(/\./g) || []).length > 1) s = s.replace(/\./g, '');
  if (!/^-?\d+(\.\d+)?$/.test(s)) return NaN;
  return r2(Number(s));
}

export function numToInput(n: number | null | undefined): string {
  if (n == null) return '';
  return String(r2(n)).replace('.', ',');
}

export function pct(n: number, digits = 0): string {
  return `${n.toFixed(digits).replace('.', ',')}%`;
}

// ---------- Download ----------
export function download(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function csvEscape(v: unknown): string {
  const s = v == null ? '' : String(v);
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCSV(rows: unknown[][]): string {
  return '\uFEFF' + rows.map((r) => r.map(csvEscape).join(';')).join('\n');
}
