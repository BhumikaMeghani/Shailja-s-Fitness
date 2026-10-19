"""NOT a studio timetable. Relative, development-only fixtures in Asia/Kolkata."""
from datetime import datetime, timedelta, timezone

IST = timezone(timedelta(hours=5, minutes=30))
SAMPLE_TIMES = {
    "online": ("07:00", "09:30", "18:00"),
    "studio": ("08:00", "10:00", "17:30"),
    "private": ("09:00", "12:00", "18:30"),
}


def now_ist():
    return datetime.now(IST)


def sample_slots(service, day):
    now = now_ist()
    if day < now.date() or day > now.date() + timedelta(days=60) or day.weekday() == 6:
        return []
    return [
        datetime.fromisoformat(f"{day}T{time}:00+05:30").isoformat()
        for time in SAMPLE_TIMES[service]
        if datetime.fromisoformat(f"{day}T{time}:00+05:30") > now
    ]
