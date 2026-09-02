import secrets
import string


def generate_business_id(prefix: str, length: int = 12) -> str:
    chars = string.ascii_letters + string.digits
    random_part = "".join(secrets.choice(chars) for _ in range(length))
    return f"{prefix}-{random_part}"
