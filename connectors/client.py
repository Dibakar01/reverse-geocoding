"""Python connector. Standard library only — no requests, no dependencies.

    from client import ReverseGeocoder
    geo = ReverseGeocoder("http://localhost:3000")
    place = geo.reverse(19.0760, 72.8777)
    print(place["city"])          # Mumbai
"""
from __future__ import annotations

import json
from functools import lru_cache
from urllib import error, parse, request


class GeocodeError(Exception):
    def __init__(self, message: str, status: int | None = None):
        super().__init__(message)
        self.status = status


class ReverseGeocoder:
    def __init__(self, base: str = "http://localhost:3000", timeout: float = 8.0):
        self.base = base.rstrip("/")
        self.timeout = timeout

    def reverse(self, lat: float, lon: float) -> dict:
        """Return {locality, district, city, state, country, displayName}."""
        if not (-90 <= lat <= 90) or not (-180 <= lon <= 180):
            raise GeocodeError("lat must be -90..90 and lon -180..180", 400)
        # Round before caching: finer than 4 dp is below what the data supports.
        return self._fetch(round(lat, 4), round(lon, 4))

    @lru_cache(maxsize=5000)
    def _fetch(self, lat: float, lon: float) -> dict:
        url = f"{self.base}/reverse?" + parse.urlencode({"lat": lat, "lon": lon})
        try:
            with request.urlopen(url, timeout=self.timeout) as res:
                return json.loads(res.read())
        except error.HTTPError as e:
            body = {}
            try:
                body = json.loads(e.read())
            except Exception:
                pass
            raise GeocodeError(body.get("error", str(e)), e.code) from e
        except error.URLError as e:
            raise GeocodeError(f"Could not reach {self.base}: {e.reason}") from e

    def health(self) -> dict:
        with request.urlopen(f"{self.base}/health", timeout=self.timeout) as res:
            return json.loads(res.read())
