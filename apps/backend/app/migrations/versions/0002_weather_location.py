from typing import Sequence, Union
from alembic import op
revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        INSERT INTO static_content (key, title, value) VALUES
            ('weather_location', 'Адрес для виджета погоды', 'Москва, Россия')
        ON CONFLICT (key) DO NOTHING
        """
    )

def downgrade() -> None:
    op.execute("DELETE FROM static_content WHERE key = 'weather_location'")
