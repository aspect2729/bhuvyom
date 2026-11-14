"""Authoritative registry of scientifically selected products for Bengaluru.

Resolution and suitability notes are explicit: coarse products are not presented
as neighbourhood-scale observations. Quantity types follow METHODOLOGY_REFERENCE.md §1.2.
"""

from __future__ import annotations

from copy import deepcopy
from typing import Any

# Quantity taxonomy: Observed | Statistically estimated | Model-derived | Simulated
DATASET_REGISTRY: dict[str, dict[str, Any]] = {
    "gpm_imerg_v07_daily": {
        "id": "gpm_imerg_v07_daily",
        "name": "GPM IMERG Final Run Daily V07",
        "product_short_name": "GPM_3IMERGDF",
        "version": "07",
        "provider": "NASA GES DISC",
        "quantity_type": "Observed",
        "variables": {
            "precipitation": {
                "native_name": "precipitation",
                "units": "mm/day",
                "description": "Daily calibrated precipitation accumulation",
            },
            "precipitationCal": {
                "native_name": "precipitationCal",
                "units": "mm/hr",
                "description": "Calibrated precipitation rate (half-hourly product field)",
            },
        },
        "native_spatial_resolution": "0.1° (~11 km)",
        "native_temporal_resolution": "1 day (daily product); half-hourly sibling available",
        "temporal_coverage": "2000-06 to present (Final Run latency ~3.5 months)",
        "bengaluru_coverage": "Full coverage",
        "access": "Earthdata bearer token + CMR / OPeNDAP subset",
        "requires_earthdata": True,
        "urban_suitability": "marginal",
        "urban_suitability_note": (
            "0.1° is useful for city-wide precipitation forcing but too coarse for "
            "neighbourhood-scale storm cells. Do not invent sub-grid detail."
        ),
        "quality_fields": ["precipitationQualityIndex", "probabilityLiquidPrecipitation"],
        "limitations": [
            "Satellite + gauge merged retrieval; not a rain-gauge point observation",
            "Urban canyon / orographic biases possible",
            "Final Run latency; Early/Late runs have higher uncertainty",
        ],
        "adapter": "gpm",
        "doi": "10.5067/GPM/IMERGDF/DAY/07",
    },
    "gpm_imerg_v07_half_hourly": {
        "id": "gpm_imerg_v07_half_hourly",
        "name": "GPM IMERG Final Run Half-Hourly V07",
        "product_short_name": "GPM_3IMERGHH",
        "version": "07",
        "provider": "NASA GES DISC",
        "quantity_type": "Observed",
        "variables": {
            "precipitationCal": {
                "native_name": "precipitationCal",
                "units": "mm/hr",
                "description": "Calibrated precipitation rate",
            },
            "precipitationUncal": {
                "native_name": "precipitationUncal",
                "units": "mm/hr",
                "description": "Uncalibrated multi-satellite rate",
            },
        },
        "native_spatial_resolution": "0.1° (~11 km)",
        "native_temporal_resolution": "30 minutes",
        "temporal_coverage": "2000-06 to present (Final Run latency)",
        "bengaluru_coverage": "Full coverage",
        "access": "Earthdata bearer token + CMR / OPeNDAP subset",
        "requires_earthdata": True,
        "urban_suitability": "marginal",
        "urban_suitability_note": "Highest practical GPM temporal resolution; spatial scale remains ~11 km.",
        "quality_fields": ["precipitationQualityIndex"],
        "limitations": [
            "Do not confuse precipitation counts with precipitation rates",
            "Half-hourly intensity still spatially coarse for urban hydrology calibration alone",
        ],
        "adapter": "gpm",
        "doi": "10.5067/GPM/IMERG/3B-HH/07",
    },
    "merra2_assim": {
        "id": "merra2_assim",
        "name": "MERRA-2 tavg1_2d_slv_Nx / land surface diagnostics",
        "product_short_name": "M2T1NXSLV",
        "version": "5.12.4",
        "provider": "NASA GMAO / GES DISC",
        "quantity_type": "Model-derived",
        "variables": {
            "T2M": {"native_name": "T2M", "units": "K", "description": "2 m air temperature"},
            "T2MDEW": {"native_name": "T2MDEW", "units": "K", "description": "2 m dew-point temperature"},
            "QV2M": {"native_name": "QV2M", "units": "kg/kg", "description": "2 m specific humidity"},
            "U2M": {"native_name": "U2M", "units": "m/s", "description": "2 m eastward wind"},
            "V2M": {"native_name": "V2M", "units": "m/s", "description": "2 m northward wind"},
            "PS": {"native_name": "PS", "units": "Pa", "description": "Surface pressure"},
            "TLML": {"native_name": "TLML", "units": "K", "description": "Temperature at lowest model layer"},
        },
        "native_spatial_resolution": "0.5° × 0.625°",
        "native_temporal_resolution": "1 hour (tavg1)",
        "temporal_coverage": "1980-01 to present",
        "bengaluru_coverage": "Full coverage (~1–2 cells over urban core)",
        "access": "Earthdata bearer token + OPeNDAP subset",
        "requires_earthdata": True,
        "urban_suitability": "unsuitable_for_neighbourhood",
        "urban_suitability_note": (
            "Reanalysis air temperature is NOT land-surface temperature and is far too "
            "coarse for neighbourhood urban-heat patterns. Suitable as regional atmospheric boundary conditions."
        ),
        "quality_fields": [],
        "limitations": [
            "Reanalysis, not station measurement",
            "Urban heat islands are poorly resolved at 0.5°×0.625°",
            "Must not be labelled as LST",
        ],
        "adapter": "merra2",
        "doi": "10.5067/VJAFPLI1CSIV",
    },
    "nasa_power": {
        "id": "nasa_power",
        "name": "NASA POWER (MERRA-2 / CERES community API)",
        "product_short_name": "POWER",
        "version": "v2",
        "provider": "NASA LaRC",
        "quantity_type": "Model-derived",
        "variables": {
            "T2M": {"native_name": "T2M", "units": "C", "description": "2 m air temperature"},
            "T2M_MAX": {"native_name": "T2M_MAX", "units": "C", "description": "2 m max air temperature"},
            "T2M_MIN": {"native_name": "T2M_MIN", "units": "C", "description": "2 m min air temperature"},
            "RH2M": {"native_name": "RH2M", "units": "%", "description": "2 m relative humidity"},
            "WS2M": {"native_name": "WS2M", "units": "m/s", "description": "2 m wind speed"},
            "PRECTOTCORR": {"native_name": "PRECTOTCORR", "units": "mm/day", "description": "Corrected precipitation"},
            "ALLSKY_SFC_SW_DWN": {
                "native_name": "ALLSKY_SFC_SW_DWN",
                "units": "kW-hr/m^2/day",
                "description": "All-sky surface shortwave downward irradiance (CERES 1°)",
            },
            "CLOUD_AMT": {"native_name": "CLOUD_AMT", "units": "%", "description": "Cloud amount"},
        },
        "native_spatial_resolution": "Meteo 0.5°×0.625°; solar 1°×1°",
        "native_temporal_resolution": "daily / monthly",
        "temporal_coverage": "1981–present (parameter-dependent)",
        "bengaluru_coverage": "Full coverage",
        "access": "Public POWER JSON API (no Earthdata token)",
        "requires_earthdata": False,
        "urban_suitability": "unsuitable_for_neighbourhood",
        "urban_suitability_note": "Preserved working client from server/; useful supplementary meteorology and solar radiation.",
        "quality_fields": ["fill_value"],
        "limitations": [
            "Fill value -999 must become missing, never interpolated",
            "Solar parameters use coarser CERES grid",
            "Near-real-time may append GEOS-IT to MERRA-2",
        ],
        "adapter": "nasa_power",
        "doi": None,
    },
    "modis_lst_mod11a1": {
        "id": "modis_lst_mod11a1",
        "name": "MODIS/Terra LST Daily 1 km (MOD11A1 v061)",
        "product_short_name": "MOD11A1",
        "version": "061",
        "provider": "NASA LP DAAC",
        "quantity_type": "Observed",
        "variables": {
            "LST_Day_1km": {
                "native_name": "LST_Day_1km",
                "units": "K",
                "scale_factor": 0.02,
                "description": "Daytime land surface temperature",
            },
            "LST_Night_1km": {
                "native_name": "LST_Night_1km",
                "units": "K",
                "scale_factor": 0.02,
                "description": "Nighttime land surface temperature",
            },
        },
        "native_spatial_resolution": "~1 km (0.928 km grid)",
        "native_temporal_resolution": "1 day (clear-sky only)",
        "temporal_coverage": "2000-02 to present",
        "bengaluru_coverage": "Tile h25v07 / h25v08 region; cloud gaps common in monsoon",
        "access": "Earthdata + CMR; AppEEARS / OPeNDAP subset preferred",
        "requires_earthdata": True,
        "urban_suitability": "suitable_city_scale",
        "urban_suitability_note": (
            "Highest practical freely available daily LST over Bengaluru among investigated NASA products. "
            "LST ≠ 2 m air temperature. Cloud contamination removes many days."
        ),
        "quality_fields": ["QC_Day", "QC_Night"],
        "limitations": [
            "Clear-sky bias",
            "View-angle and emissivity assumptions",
            "Must not be presented as air temperature",
        ],
        "adapter": "modis",
        "doi": "10.5067/MODIS/MOD11A1.061",
    },
    "modis_vi_mod13a2": {
        "id": "modis_vi_mod13a2",
        "name": "MODIS/Terra Vegetation Indices 16-Day 1 km (MOD13A2 v061)",
        "product_short_name": "MOD13A2",
        "version": "061",
        "provider": "NASA LP DAAC",
        "quantity_type": "Observed",
        "variables": {
            "NDVI": {
                "native_name": "1 km 16 days NDVI",
                "units": "1",
                "scale_factor": 0.0001,
                "description": "Normalized Difference Vegetation Index",
            },
            "EVI": {
                "native_name": "1 km 16 days EVI",
                "units": "1",
                "scale_factor": 0.0001,
                "description": "Enhanced Vegetation Index",
            },
        },
        "native_spatial_resolution": "1 km",
        "native_temporal_resolution": "16 days",
        "temporal_coverage": "2000-02 to present",
        "bengaluru_coverage": "Full coverage (tile-based)",
        "access": "Earthdata + CMR",
        "requires_earthdata": True,
        "urban_suitability": "suitable_city_scale",
        "urban_suitability_note": "Prefer MOD13Q1 (250 m) when available for finer vegetation structure.",
        "quality_fields": ["1 km 16 days VI Quality", "1 km 16 days pixel reliability"],
        "limitations": ["Compositing selects best pixel; not a single-day observation"],
        "adapter": "modis",
        "doi": "10.5067/MODIS/MOD13A2.061",
    },
    "modis_vi_mod13q1": {
        "id": "modis_vi_mod13q1",
        "name": "MODIS/Terra Vegetation Indices 16-Day 250 m (MOD13Q1 v061)",
        "product_short_name": "MOD13Q1",
        "version": "061",
        "provider": "NASA LP DAAC",
        "quantity_type": "Observed",
        "variables": {
            "NDVI": {
                "native_name": "250m 16 days NDVI",
                "units": "1",
                "scale_factor": 0.0001,
                "description": "NDVI at 250 m",
            },
            "EVI": {
                "native_name": "250m 16 days EVI",
                "units": "1",
                "scale_factor": 0.0001,
                "description": "EVI at 250 m",
            },
        },
        "native_spatial_resolution": "250 m",
        "native_temporal_resolution": "16 days",
        "temporal_coverage": "2000-02 to present",
        "bengaluru_coverage": "Full coverage",
        "access": "Earthdata + CMR",
        "requires_earthdata": True,
        "urban_suitability": "good_urban",
        "urban_suitability_note": "Preferred vegetation product for urban green-cover context.",
        "quality_fields": ["250m 16 days VI Quality", "250m 16 days pixel reliability"],
        "limitations": ["Still a 16-day composite"],
        "adapter": "modis",
        "doi": "10.5067/MODIS/MOD13Q1.061",
    },
    "modis_landcover_mcd12q1": {
        "id": "modis_landcover_mcd12q1",
        "name": "MODIS Land Cover Type Yearly 500 m (MCD12Q1 v061)",
        "product_short_name": "MCD12Q1",
        "version": "061",
        "provider": "NASA LP DAAC",
        "quantity_type": "Model-derived",
        "variables": {
            "LC_Type1": {
                "native_name": "LC_Type1",
                "units": "class",
                "description": "IGBP land-cover classification",
            }
        },
        "native_spatial_resolution": "500 m",
        "native_temporal_resolution": "1 year",
        "temporal_coverage": "2001–present (annual)",
        "bengaluru_coverage": "Full coverage",
        "access": "Earthdata + CMR",
        "requires_earthdata": True,
        "urban_suitability": "moderate",
        "urban_suitability_note": (
            "Useful regional land-cover; urban class is coarse. Investigate ESA WorldCover / "
            "local impervious products for finer urban fabric."
        ),
        "quality_fields": ["QC"],
        "limitations": ["Annual; mixed pixels in dense urban mosaic"],
        "adapter": "modis",
        "doi": "10.5067/MODIS/MCD12Q1.061",
    },
    "viirs_lst_vnp21a1d": {
        "id": "viirs_lst_vnp21a1d",
        "name": "VIIRS/NPP LST Daily 1 km Day (VNP21A1D v002)",
        "product_short_name": "VNP21A1D",
        "version": "002",
        "provider": "NASA LP DAAC",
        "quantity_type": "Observed",
        "variables": {
            "LST_1KM": {
                "native_name": "LST_1KM",
                "units": "K",
                "description": "Land surface temperature",
            }
        },
        "native_spatial_resolution": "~1 km",
        "native_temporal_resolution": "1 day (clear-sky)",
        "temporal_coverage": "2012–present",
        "bengaluru_coverage": "Full coverage with cloud gaps",
        "access": "Earthdata + CMR",
        "requires_earthdata": True,
        "urban_suitability": "suitable_city_scale",
        "urban_suitability_note": "Complementary to MODIS LST; different overpass time.",
        "quality_fields": ["QC"],
        "limitations": ["Clear-sky only; LST ≠ air temperature"],
        "adapter": "viirs",
        "doi": "10.5067/VIIRS/VNP21A1D.002",
    },
    "smap_spl3smp_e": {
        "id": "smap_spl3smp_e",
        "name": "SMAP Enhanced L3 Radiometer Soil Moisture 9 km (SPL3SMP_E v006)",
        "product_short_name": "SPL3SMP_E",
        "version": "006",
        "provider": "NASA NSIDC DAAC",
        "quantity_type": "Observed",
        "variables": {
            "soil_moisture": {
                "native_name": "soil_moisture",
                "units": "m3/m3",
                "description": "Surface soil moisture (~top 5 cm)",
            }
        },
        "native_spatial_resolution": "9 km grid (radiometer footprint ~36 km; BG-enhanced posting)",
        "native_temporal_resolution": "1 day (AM/PM composites)",
        "temporal_coverage": "2015-03-31 to present",
        "bengaluru_coverage": "Full coverage; few cells over city",
        "access": "Earthdata + CMR (NSIDC)",
        "requires_earthdata": True,
        "urban_suitability": "unsuitable_for_neighbourhood",
        "urban_suitability_note": (
            "Does NOT provide neighbourhood-scale soil moisture. Native radiometer information "
            "content is ~36 km; 9 km is an enhanced posting grid. Flag as coarse for urban simulation."
        ),
        "quality_fields": ["retrieval_qual_flag", "surface_flag"],
        "limitations": [
            "Surface (~5 cm) only — not root-zone unless a separate product is used",
            "Radio-frequency interference and urban surfaces degrade retrievals",
            "Do not claim fine-scale soil moisture from this product",
        ],
        "adapter": "smap",
        "doi": "10.5067/M20OXIZHY3RJ",
    },
    "era5_land": {
        "id": "era5_land",
        "name": "ERA5-Land hourly reanalysis",
        "product_short_name": "reanalysis-era5-land",
        "version": "ERA5-Land",
        "provider": "ECMWF / Copernicus CDS",
        "quantity_type": "Model-derived",
        "variables": {
            "t2m": {"native_name": "2m_temperature", "units": "K", "description": "2 m temperature"},
            "d2m": {"native_name": "2m_dewpoint_temperature", "units": "K", "description": "2 m dew point"},
            "u10": {"native_name": "10m_u_component_of_wind", "units": "m/s", "description": "10 m U wind"},
            "v10": {"native_name": "10m_v_component_of_wind", "units": "m/s", "description": "10 m V wind"},
            "tp": {"native_name": "total_precipitation", "units": "m", "description": "Total precipitation"},
            "swvl1": {
                "native_name": "volumetric_soil_water_layer_1",
                "units": "m3/m3",
                "description": "Volumetric soil water layer 1 (~0–7 cm)",
            },
        },
        "native_spatial_resolution": "0.1° (~9 km)",
        "native_temporal_resolution": "1 hour",
        "temporal_coverage": "1950–present",
        "bengaluru_coverage": "Full coverage",
        "access": "Copernicus CDS API (separate credentials + licence acceptance)",
        "requires_earthdata": False,
        "requires_cds": True,
        "urban_suitability": "marginal",
        "urban_suitability_note": (
            "Higher resolution than MERRA-2 for regional forcing, still too coarse for "
            "neighbourhood UHIs. Reanalysis, not observation."
        ),
        "quality_fields": [],
        "limitations": [
            "Requires CDS account and dataset licence acceptance",
            "Land-surface model estimates, not in-situ soil moisture",
        ],
        "adapter": "era5_land",
        "doi": "10.24381/cds.e2161bac",
    },
    "srtm_dem": {
        "id": "srtm_dem",
        "name": "SRTM 1 arc-second elevation",
        "product_short_name": "SRTMGL1",
        "version": "003",
        "provider": "NASA LP DAAC / USGS",
        "quantity_type": "Observed",
        "variables": {
            "elevation": {"native_name": "elevation", "units": "m", "description": "Orthometric height"},
            "slope": {"native_name": "slope", "units": "degree", "description": "Derived slope"},
            "aspect": {"native_name": "aspect", "units": "degree", "description": "Derived aspect"},
        },
        "native_spatial_resolution": "1 arc-second (~30 m)",
        "native_temporal_resolution": "static (Feb 2000 mission)",
        "temporal_coverage": "static",
        "bengaluru_coverage": "Full coverage",
        "access": "Earthdata (SRTMGL1) or documented public DEM mirrors",
        "requires_earthdata": True,
        "urban_suitability": "good_urban",
        "urban_suitability_note": "Preferred terrain base for runoff / solar geometry context.",
        "quality_fields": [],
        "limitations": [
            "Static epoch; subsequent urban vertical change not captured",
            "Slope/aspect are derived — document algorithm",
        ],
        "adapter": "srtm",
        "doi": "10.5067/MEaSUREs/SRTM/SRTMGL1.003",
    },
}


def list_datasets() -> list[dict[str, Any]]:
    return [deepcopy(v) for v in DATASET_REGISTRY.values()]


def get_dataset(dataset_id: str) -> dict[str, Any]:
    if dataset_id not in DATASET_REGISTRY:
        raise KeyError(f"Unknown dataset id: {dataset_id}")
    return deepcopy(DATASET_REGISTRY[dataset_id])
