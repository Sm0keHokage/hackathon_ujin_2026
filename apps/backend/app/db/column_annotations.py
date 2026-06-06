import datetime
from typing import Annotated
from sqlalchemy import BigInteger, Boolean, DateTime, Integer, Text, func
from sqlalchemy.orm import mapped_column


int_pk = Annotated[int, mapped_column(Integer, primary_key=True)]
bigint_pk = Annotated[int, mapped_column(BigInteger, primary_key=True, autoincrement=True)]
text_pk = Annotated[str, mapped_column(Text, primary_key=True)]
text_nn = Annotated[str, mapped_column(Text, nullable=False)]
text_null = Annotated[str | None, mapped_column(Text)]
int_null = Annotated[int | None, mapped_column(Integer)]
bool_nn = Annotated[bool, mapped_column(Boolean, nullable=False, server_default="false")]
tz_nn = Annotated[
    datetime.datetime,
    mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False),
]
tz_null = Annotated[datetime.datetime | None, mapped_column(DateTime(timezone=True))]
