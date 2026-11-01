import { scaleBand, scaleLinear, scalePoint, line, min, max } from "d3";
export interface ChartDatum { label: string; value: number }
export interface ChartPoint extends ChartDatum { index: number; x: number; y: number; width: number; height: number }
export interface CartesianChart {
  width: number; height: number; left: number; right: number; top: number; bottom: number;
  horizontal: boolean; zero: number; ticks: { value: number; label: string; position: number }[];
  labels: { index: number; label: string; position: number }[]; points: ChartPoint[]; path: string | null;
  elapsedTime: boolean;
}
function timeValue(label: string) {
  const year = /^(\d{4})年?$/.exec(label), date = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(label);
  if (!year && !date) return undefined;
  const y = Number((year ?? date)![1]), m = date ? Number(date[2]) : 1, day = date?.[3] ? Number(date[3]) : 1;
  const value = Date.UTC(y, m - 1, day), check = new Date(value);
  return check.getUTCFullYear() === y && check.getUTCMonth() === m - 1 && check.getUTCDate() === day ? value : NaN;
}
export function cartesianChart(series: ChartDatum[], kind: "bar" | "line" | "rank", width = 380): CartesianChart {
  if (!series.length || series.some(item => !Number.isFinite(item.value))) throw new Error("序列为空或包含非有限数值，暂不能绘图");
  const horizontal = kind === "rank", height = horizontal ? Math.max(180, series.length * 29 + 38) : 190;
  const left = horizontal ? 124 : 64, right = width - 16, top = 16, bottom = height - 35;
  const low = min(series, item => item.value)!, high = max(series, item => item.value)!;
  let domain: [number, number] = kind === "line" ? [low, high] : [Math.min(0, low), Math.max(0, high)];
  if (domain[0] === domain[1]) { const pad = Math.abs(domain[0]) * .1 || 1; domain = kind === "line" ? [domain[0] - pad, domain[1] + pad] : domain[0] === 0 ? [0, 1] : domain; }
  if (!Number.isFinite(domain[1] - domain[0])) throw new Error("数值跨度超出稳定绘图范围，原始数据仍保留");
  const numeric = scaleLinear().domain(domain).range(horizontal ? [left, right] : [bottom, top]).nice(4);
  if (!numeric.domain().every(Number.isFinite)) throw new Error("数值范围暂不能稳定绘图");
  const indices = series.map((_, i) => String(i));
  const band = scaleBand<string>().domain(indices).range(horizontal ? [top, bottom] : [left, right]).padding(.24);
  const ordered = scalePoint<string>().domain(indices).range([left + 4, right - 4]).padding(series.length === 1 ? .5 : 0);
  const times = kind === "line" ? series.map(item => timeValue(item.label)) : [];
  if (times.some(value => Number.isNaN(value))) throw new Error("时间标签包含无效日期，请先核对原始序列");
  const elapsedTime = !!times.length && times.every(value => value !== undefined);
  if (elapsedTime && times.some((value, index) => index > 0 && value! <= times[index - 1]!)) throw new Error("时间标签未严格递增，请核对顺序；图表不会自动重排或合并观测");
  const timeScale = elapsedTime ? scaleLinear().domain([times[0]!, times.at(-1)!]).range([left + 4, right - 4]) : undefined;
  const zero = numeric(0), pointX = (i: number) => timeScale ? timeScale(times[i]!) : ordered(String(i))!;
  const points = series.map((item, index) => ({ ...item, index,
    x: horizontal ? Math.min(zero, numeric(item.value)) : kind === "line" ? pointX(index) : band(String(index))!,
    y: horizontal ? band(String(index))! : kind === "line" ? numeric(item.value) : Math.min(zero, numeric(item.value)),
    width: horizontal ? Math.abs(numeric(item.value) - zero) : band.bandwidth(),
    height: horizontal ? band.bandwidth() : Math.abs(numeric(item.value) - zero),
  }));
  const tickFormat = numeric.tickFormat(4);
  const ticks = numeric.ticks(4).map(value => ({ value, label: tickFormat(value), position: numeric(value) }));
  const labelStep = horizontal ? 1 : Math.max(1, Math.ceil(series.length / 6));
  const labels = series.flatMap((item, index) => index % labelStep === 0 || index === series.length - 1 ? [{ index, label: item.label, position: horizontal ? band(String(index))! + band.bandwidth() / 2 : kind === "line" ? pointX(index) : band(String(index))! + band.bandwidth() / 2 }] : []);
  return { width, height, left, right, top, bottom, horizontal, zero, ticks, labels, points, elapsedTime, path: kind === "line" ? line<ChartPoint>().x(point => point.x).y(point => point.y)(points) : null };
}
