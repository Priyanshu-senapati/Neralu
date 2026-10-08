"""Distances on the ward map."""
import math


def km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Great-circle distance in km, to 0.1 km."""
    p = math.pi / 180
    a = (math.sin((lat2 - lat1) * p / 2) ** 2 +
         math.cos(lat1 * p) * math.cos(lat2 * p) * math.sin((lng2 - lng1) * p / 2) ** 2)
    return round(12742 * math.asin(math.sqrt(a)), 1)
