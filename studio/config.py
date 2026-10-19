"""Single source for service information. None means not yet supplied, never free."""
import os


def optional_int(name):
    raw = os.getenv(name, "").strip()
    if not raw:
        return None
    value = int(raw)
    if value <= 0:
        raise ValueError(f"{name} must be a positive integer")
    return value


def services():
    return [
        {
            "id": key,
            "name": name,
            "description": description,
            "icon": icon,
            "price_paise": optional_int(f"{key.upper()}_TEST_PRICE_PAISE"),
            "duration_minutes": optional_int(f"{key.upper()}_DURATION_MINUTES"),
            "currency": "INR",
            "tax_paise": optional_int(f"{key.upper()}_TEST_TAX_PAISE") or 0,
        }
        for key, name, description, icon in [
            ("online", "Online Live Class", "A little space for wellness, wherever you are.", "video"),
            ("studio", "Studio Class", "Make room for movement in a shared studio setting.", "home"),
            ("private", "Private Class", "Explore a more personal approach to your practice.", "user"),
        ]
    ]
