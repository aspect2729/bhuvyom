"""Re-derive MOD11A1 LST for the BBMP window with a documented two-tier QC rule.

Why: the first pass kept only mandatory-QA = 00. Over central Bengaluru almost every pixel
is flagged 01 ("LST produced, other quality") because of emissivity uncertainty over built-up
surfaces, so the urban core had ZERO valid days — exactly the area an urban-heat study needs.

Rule (MOD11 C6.1 User Guide QC bit layout):
  bits 0–1 mandatory QA: 00 good, 01 other quality, 10/11 not produced
  bits 6–7 LST error flag: 00 ≤1 K, 01 ≤2 K, 10 ≤3 K, 11 >3 K
  keep  = (QA == 00)  OR  (QA == 01 AND LST error ≤ 2 K)
  tier  = 1 strict-good, 2 accepted with ≤2 K error, 0 rejected   (stored per pixel-day)
Usage: python scripts/reprocess_mod11a1_qc.py <hdf_dir> <out.npz>   (needs pyhdf)
"""

import re
import sys
from pathlib import Path

import numpy as np
from pyhdf.SD import SD

R0, R1, C0, C1 = 820, 862, 649, 703  # BBMP window in tile h25v07 (from acquisition report)


def qc_tier(qc: np.ndarray) -> np.ndarray:
    qa, err = qc & 0b11, (qc >> 6) & 0b11
    t = np.zeros(qc.shape, np.int8)
    t[(qa == 1) & (err <= 1)] = 2
    t[qa == 0] = 1
    return t


def main(hdf_dir: str, out: str) -> None:
    files = sorted(Path(hdf_dir).glob("MOD11A1.A2024*.h25v07.061.*.hdf"))
    dates, D, N, TD, TN = [], [], [], [], []
    for f in files:
        y, doy = re.search(r"A(\d{4})(\d{3})", f.name).groups()
        dates.append(str(np.datetime64(f"{y}-01-01") + np.timedelta64(int(doy) - 1, "D")))
        sd = SD(str(f))
        for lst_name, qc_name, vals, tiers in (("LST_Day_1km", "QC_Day", D, TD), ("LST_Night_1km", "QC_Night", N, TN)):
            sds = sd.select(lst_name)
            scale = float(sds.attributes().get("scale_factor", 0.02))
            dn = sds.get()[R0 : R1 + 1, C0 : C1 + 1].astype(float)
            qc = sd.select(qc_name).get()[R0 : R1 + 1, C0 : C1 + 1].astype(np.uint8)
            t = qc_tier(qc)
            t[dn == 0] = 0  # fill
            v = np.where(t > 0, dn * scale - 273.15, np.nan)
            vals.append(v); tiers.append(t)
        sd.end()
    np.savez_compressed(out, dates=np.array(dates), LST_Day_C=np.array(D), LST_Night_C=np.array(N), tier_day=np.array(TD), tier_night=np.array(TN),
                        qc_rule="keep QA==00 or (QA==01 and LST_err<=2K); tier 1 strict, 2 relaxed")
    td, tn = np.array(TD), np.array(TN)
    print(f"{len(dates)} days; day valid strict {np.mean(td == 1):.1%} relaxed {np.mean(td == 2):.1%}; night strict {np.mean(tn == 1):.1%} relaxed {np.mean(tn == 2):.1%}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
