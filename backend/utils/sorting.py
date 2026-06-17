from typing import Literal


def stable_order_by(statement, primary_column, *, sort_order: Literal["asc", "desc"], id_column):
    if sort_order == "asc":
        return statement.order_by(primary_column.asc(), id_column.asc())
    return statement.order_by(primary_column.desc(), id_column.desc())
