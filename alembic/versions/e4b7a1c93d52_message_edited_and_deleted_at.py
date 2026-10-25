"""message edited_at and deleted_at

Revision ID: e4b7a1c93d52
Revises: ba59c964c0c1
Create Date: 2026-10-25 13:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e4b7a1c93d52'
down_revision: Union[str, Sequence[str], None] = 'ba59c964c0c1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('messages', sa.Column('edited_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('messages', sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('messages', 'deleted_at')
    op.drop_column('messages', 'edited_at')
