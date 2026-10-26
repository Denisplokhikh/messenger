"""message reply_to

Revision ID: c4f1a8d27e93
Revises: 3d5b8f1c7a92
Create Date: 2026-10-26 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c4f1a8d27e93'
down_revision: Union[str, Sequence[str], None] = '3d5b8f1c7a92'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('messages', sa.Column('reply_to_id', sa.BigInteger(), nullable=True))
    op.create_index('ix_messages_reply_to_id', 'messages', ['reply_to_id'])
    # Ответ переживает удаление оригинала: ON DELETE SET NULL, а не CASCADE.
    # Жёсткого удаления сообщений в приложении нет, но пусть база не мешает
    op.create_foreign_key(
        'fk_messages_reply_to_id_messages',
        'messages',
        'messages',
        ['reply_to_id'],
        ['id'],
        ondelete='SET NULL',
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint('fk_messages_reply_to_id_messages', 'messages', type_='foreignkey')
    op.drop_index('ix_messages_reply_to_id', table_name='messages')
    op.drop_column('messages', 'reply_to_id')
