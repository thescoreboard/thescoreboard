"""
Sport registry — maps sport_key strings to engine instances.

To add a new sport:
  1. Create app/sports/<name>/scoring.py with a class extending BaseSport
  2. Create app/sports/<name>/__init__.py
  3. Import and register it here in _REGISTRY
"""
from app.sports.table_tennis.scoring import TableTennis
from app.sports.badminton.scoring    import Badminton
from app.sports.cricket.scoring      import Cricket
from app.sports.football.scoring     import Football

_REGISTRY: dict = {
    "table_tennis": TableTennis(),
    "badminton":    Badminton(),
    "cricket":      Cricket(),
    "football":     Football(),
}

# Human-readable labels for the API / frontend
_SPORT_META = {
    "table_tennis": {"label": "Table Tennis", "icon": "🏓", "url_slug": "table-tennis"},
    "badminton":    {"label": "Badminton",    "icon": "🏸", "url_slug": "badminton"},
    "cricket":      {"label": "Cricket",      "icon": "🏏", "url_slug": "cricket"},
    "football":     {"label": "Football",     "icon": "⚽", "url_slug": "football"},
}


def get_sport_engine(sport_key: str):
    """
    Return the engine instance for a sport_key.
    Raises KeyError with a clear message if the sport is not registered.
    """
    engine = _REGISTRY.get(sport_key)
    if engine is None:
        valid = ", ".join(_REGISTRY.keys())
        raise KeyError(f"Unknown sport '{sport_key}'. Valid options: {valid}")
    return engine


def list_sports() -> list:
    """Return metadata for all registered sports — used by the event creation form."""
    return [
        {
            "sport_key":  key,
            "label":      meta["label"],
            "icon":       meta["icon"],
            "url_slug":   meta["url_slug"],
            "default_config": _REGISTRY[key].get_default_config(),
        }
        for key, meta in _SPORT_META.items()
    ]


def get_sport_meta(sport_key: str) -> dict:
    return _SPORT_META.get(sport_key, {"label": sport_key, "icon": "🏅", "url_slug": sport_key})
