"""Unit tests for analysis.trends (METHODOLOGY_REFERENCE.md §§5–8).

Uses stdlib unittest only (no extra test dependency beyond numpy/scipy).
"""

from __future__ import annotations

import unittest

import numpy as np
from scipy import stats

from engines.analysis.trends import (
    analyze_trend_series,
    annual_means,
    benjamini_hochberg,
    deseasonalize_monthly,
    lag1_autocorrelation,
    mann_kendall,
    sens_slope,
)


class TestDeseasonalize(unittest.TestCase):
    def test_removes_monthly_climatology(self):
        months = [1, 2, 1, 2, 1, 2]
        values = [10.0, 20.0, 12.0, 22.0, 11.0, 21.0]
        anom = deseasonalize_monthly(values, months)
        np.testing.assert_allclose(anom[::2], [-1.0, 1.0, 0.0], atol=1e-9)
        np.testing.assert_allclose(anom[1::2], [-1.0, 1.0, 0.0], atol=1e-9)

    def test_annual_means_require_ten_months(self):
        years = [2000] * 9 + [2001] * 12
        months = list(range(1, 10)) + list(range(1, 13))
        values = [float(i) for i in range(len(years))]
        y, m = annual_means(values, years, months)
        self.assertEqual(list(y), [2000.0, 2001.0])
        self.assertTrue(np.isnan(m[0]))
        self.assertTrue(np.isfinite(m[1]))


class TestMannKendall(unittest.TestCase):
    def test_known_increasing(self):
        x = np.arange(30, dtype=float)
        mk = mann_kendall(x)
        self.assertGreater(mk["S"], 0)
        self.assertLess(mk["p_value"], 0.01)
        self.assertEqual(mk["n_used"], 30)

    def test_ties_no_error(self):
        x = np.array([1.0, 1.0, 2.0, 2.0, 3.0, 3.0, 4.0, 4.0, 5.0, 5.0])
        mk = mann_kendall(x)
        self.assertEqual(mk["n_used"], 10)
        self.assertGreater(mk["var_s"], 0)
        self.assertGreaterEqual(mk["p_value"], 0.0)
        self.assertLessEqual(mk["p_value"], 1.0)

    def test_agrees_with_kendalltau_sign(self):
        rng = np.random.default_rng(0)
        x = np.linspace(0, 1, 40) + rng.normal(0, 0.05, 40)
        mk = mann_kendall(x)
        tau = stats.kendalltau(np.arange(len(x)), x)
        self.assertEqual(np.sign(mk["S"]), np.sign(tau.statistic))


class TestSensSlope(unittest.TestCase):
    def test_recovers_known_slope_within_ci(self):
        t = np.arange(1981, 2021, dtype=float)
        true_slope = 0.02
        rng = np.random.default_rng(42)
        x = 10.0 + true_slope * (t - t[0]) + rng.normal(0, 0.05, t.size)
        sen = sens_slope(x, t)
        self.assertIsNotNone(sen["slope"])
        self.assertLessEqual(sen["ci_low"], true_slope)
        self.assertGreaterEqual(sen["ci_high"], true_slope)
        self.assertAlmostEqual(sen["slope"], true_slope, delta=0.01)
        theil = stats.theilslopes(x, t)
        np.testing.assert_allclose(sen["slope"], theil.slope, rtol=1e-9, atol=1e-9)

    def test_matches_theilslopes_with_ties(self):
        t = np.arange(20, dtype=float)
        x = np.array(
            [0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9],
            dtype=float,
        )
        sen = sens_slope(x, t)
        theil = stats.theilslopes(x, t)
        np.testing.assert_allclose(sen["slope"], theil.slope, rtol=1e-9, atol=1e-9)


class TestNoiseAndAutocorr(unittest.TestCase):
    def test_pure_noise_rarely_significant(self):
        n_sig = 0
        n = 200
        for seed in range(n):
            rng = np.random.default_rng(seed)
            x = rng.normal(0, 1, 40)
            mk = mann_kendall(x)
            if mk["p_value"] < 0.05:
                n_sig += 1
        self.assertLessEqual(n_sig / n, 0.10)

    def test_lag1_bounds_and_white_noise(self):
        rng = np.random.default_rng(1)
        x = rng.normal(0, 1, 80)
        info = lag1_autocorrelation(x)
        self.assertLess(info["bound_low"], 0)
        self.assertGreater(info["bound_high"], 0)
        self.assertLess(abs(info["r1"]), 0.35)


class TestAnalyzeAndBH(unittest.TestCase):
    def test_insufficient_data(self):
        t = np.arange(2000, 2005, dtype=float)
        x = np.linspace(0, 1, t.size)
        out = analyze_trend_series(x, t, unit="C")
        self.assertEqual(out["status"], "insufficient_data")
        self.assertIsNone(out["slope_per_decade"])

    def test_trend_per_decade_scaling(self):
        t = np.arange(1981, 2021, dtype=float)
        x = 0.1 * (t - 1981)
        out = analyze_trend_series(x, t, unit="C")
        self.assertEqual(out["status"], "ok")
        self.assertAlmostEqual(out["slope_per_decade"], 1.0, places=9)
        self.assertEqual(out["slope_unit_per_decade"], "C/decade")
        self.assertEqual(out["quantity_type"], "Statistically estimated")
        self.assertEqual(out["source_data_quantity_type"], "Model-derived")

    def test_benjamini_hochberg(self):
        p = [0.001, 0.04, 0.03, 0.5, None]
        adj, sig = benjamini_hochberg(p, alpha=0.05)
        self.assertIsNotNone(adj[0])
        self.assertLessEqual(adj[0], p[0] * 4 + 1e-12)
        self.assertIsNone(adj[-1])
        self.assertTrue(sig[0])


if __name__ == "__main__":
    unittest.main()
