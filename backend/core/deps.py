from typing import Annotated

from fastapi import Depends, Query
from sqlmodel import Session

from core.database import get_session

DBSession = Annotated[Session, Depends(get_session)]
PaginationSkip = Annotated[int, Query(ge=0, default=0)]
PaginationLimit = Annotated[int, Query(ge=1, le=100, default=20)]
