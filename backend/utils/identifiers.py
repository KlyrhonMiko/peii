import secrets
import string


def generate_business_id(prefix: str, length: int = 6) -> str:
    chars = string.ascii_uppercase + string.digits
    random_part = "".join(secrets.choice(chars) for _ in range(length))
    return f"{prefix}-{random_part}"
