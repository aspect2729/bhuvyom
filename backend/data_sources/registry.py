"""Adapter registry and acquisition dispatch."""

from __future__ import annotations

from typing import TYPE_CHECKING

from data_sources.era5_land_adapter import Era5LandAdapter
from data_sources.gpm_adapter import GpmAdapter
from data_sources.merra2_adapter import Merra2Adapter
from data_sources.modis_adapter import ModisAdapter
from data_sources.nasa_power_adapter import NasaPowerAdapter
from data_sources.smap_adapter import SmapAdapter
from data_sources.srtm_adapter import SrtmAdapter
from data_sources.viirs_adapter import ViirsAdapter

if TYPE_CHECKING:
    from data_sources.base_adapter import BaseAdapter

_ADAPTERS: list[BaseAdapter] = [
    NasaPowerAdapter(),
    GpmAdapter(),
    Merra2Adapter(),
    ModisAdapter(),
    ViirsAdapter(),
    SmapAdapter(),
    Era5LandAdapter(),
    SrtmAdapter(),
]

_BY_DATASET: dict[str, BaseAdapter] = {}
for _adapter in _ADAPTERS:
    for _ds in _adapter.dataset_ids:
        _BY_DATASET[_ds] = _adapter


def get_adapter(dataset_id: str) -> BaseAdapter:
    if dataset_id not in _BY_DATASET:
        raise KeyError(
            f"No adapter for dataset {dataset_id!r}. Known: {sorted(_BY_DATASET)}"
        )
    return _BY_DATASET[dataset_id]


def list_adapter_names() -> list[str]:
    return sorted({type(a).__name__ for a in _ADAPTERS})


def list_supported_datasets() -> list[str]:
    return sorted(_BY_DATASET.keys())
