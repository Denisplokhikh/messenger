"""attachments unsent index

Revision ID: f2d8c6a41b07
Revises: e4b7a1c93d52
Create Date: 2026-10-25 14:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f2d8c6a41b07'
down_revision: Union[str, Sequence[str], None] = 'e4b7a1c93d52'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_index(
        'ix_attachments_unsent_created_at', 'attachments', ['created_at'],
        unique=False, postgresql_where=sa.text('message_id IS NULL'),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(
        'ix_attachments_unsent_created_at', table_name='attachments',
        postgresql_where=sa.text('message_id IS NULL'),
    )
