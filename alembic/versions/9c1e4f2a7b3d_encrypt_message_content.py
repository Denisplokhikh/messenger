"""encrypt message content

Revision ID: 9c1e4f2a7b3d
Revises: 2ae08e72c548
Create Date: 2026-10-17 12:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

from app.utils.security import decrypt_text, encrypt_text


# revision identifiers, used by Alembic.
revision: str = '9c1e4f2a7b3d'
down_revision: Union[str, Sequence[str], None] = '2ae08e72c548'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Шифротекст длиннее 1000 символов, поэтому VARCHAR(1000) -> TEXT
    op.alter_column('messages', 'content',
               existing_type=sa.String(length=1000),
               type_=sa.Text(),
               existing_nullable=False)

    # Шифруем сообщения, которые уже лежат в базе открытым текстом
    conn = op.get_bind()
    rows = conn.execute(sa.text("SELECT id, content FROM messages")).fetchall()
    for row in rows:
        conn.execute(
            sa.text("UPDATE messages SET content = :content WHERE id = :id"),
            {"content": encrypt_text(row.content), "id": row.id},
        )


def downgrade() -> None:
    """Downgrade schema."""
    conn = op.get_bind()
    rows = conn.execute(sa.text("SELECT id, content FROM messages")).fetchall()
    for row in rows:
        conn.execute(
            sa.text("UPDATE messages SET content = :content WHERE id = :id"),
            {"content": decrypt_text(row.content), "id": row.id},
        )

    op.alter_column('messages', 'content',
               existing_type=sa.Text(),
               type_=sa.String(length=1000),
               existing_nullable=False)
