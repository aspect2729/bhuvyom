import raw from '../data/systems.json';

export type SysVar = { name: string; desc: string; src: string; unit: string; val: string };
export type System = { id: string; eyebrow: string; name: string; probe: string; vars: SysVar[] };

/** 16 systems / 144 variables from bengaluru-from-orbit-app/data/systems.json (reference values). */
export const SYSTEMS = raw as System[];
export const TOTAL_VARS = SYSTEMS.reduce((t, s) => t + s.vars.length, 0);

/** "28.4 °C (UHI: +3.8°C)" → ["28.4 °C", "UHI: +3.8°C"] (Systems.dc.html `split`). */
export function splitProbe(p: string): [string, string] {
  const m = p.match(/^(.*?)\s*\((.*)\)\s*$/);
  return m ? [m[1], m[2]] : [p, ''];
}

/** Catalogue reference value of one variable, e.g. refValue('sys-01', 'Air temperature') → "28.4 °C". */
export function refValue(sysId: string, varName: string): string | null {
  const v = SYSTEMS.find((s) => s.id === sysId)?.vars.find((x) => x.name === varName);
  return v ? splitProbe(v.val)[0] : null;
}
