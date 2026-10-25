"""user last seen at

Revision ID: 3d5b8f1c7a92
Revises: f2d8c6a41b07
Create Date: 2026-10-25 18:40:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '3d5b8f1c7a92'
down_revision: Union[str, Sequence[str], None] = 'f2d8c6a41b07'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('users', sa.Column('last_seen_at', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('users', 'last_seen_at')
