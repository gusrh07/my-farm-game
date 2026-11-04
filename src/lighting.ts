export interface LightKey { minutes: number; color: number; alpha: number }
export const LIGHT_KEYS: readonly LightKey[] = [
  { minutes: 360, color: 0xffd9a0, alpha: 0.12 },
  { minutes: 540, color: 0xffffff, alpha: 0 },
  { minutes: 960, color: 0xffffff, alpha: 0 },
  { minutes: 1080, color: 0xff9a4d, alpha: 0.18 },
  { minutes: 1200, color: 0x5a4a8a, alpha: 0.35 },
  { minutes: 1440, color: 0x0b1030, alpha: 0.5 },
];
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export function lightAt(minutes: number): { color: number; alpha: number } {
  if (minutes <= LIGHT_KEYS[0].minutes) return { ...LIGHT_KEYS[0] };
  for (let i = 1; i < LIGHT_KEYS.length; i++) {
    const a = LIGHT_KEYS[i - 1], b = LIGHT_KEYS[i];
    if (minutes > b.minutes) continue;
    const t = (minutes - a.minutes) / (b.minutes - a.minutes);
    let color = 0;
    for (const shift of [16, 8, 0]) {
      color |= Math.round(lerp((a.color >> shift) & 255, (b.color >> shift) & 255, t)) << shift;
    }
    return { color, alpha: lerp(a.alpha, b.alpha, t) };
  }
  return { ...LIGHT_KEYS[LIGHT_KEYS.length - 1] };
}
