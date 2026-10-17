"""public uuid for users and chats

Revision ID: 5b7d2e8c4a1f
Revises: 9c1e4f2a7b3d
Create Date: 2026-10-17 21:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '5b7d2e8c4a1f'
down_revision: Union[str, Sequence[str], None] = '9c1e4f2a7b3d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # gen_random_uuid() вычисляется для каждой строки отдельно,
    # поэтому существующие пользователи и чаты сразу получают разные uuid и NOT NULL проходит
    for table in ("users", "chats"):
        op.add_column(
            table,
            sa.Column(
                "uuid", sa.Uuid(), nullable=False, server_default=sa.text("gen_random_uuid()")
            ),
        )
        op.create_index(op.f(f"ix_{table}_uuid"), table, ["uuid"], unique=True)


def downgrade() -> None:
    """Downgrade schema."""
    for table in ("chats", "users"):
        op.drop_index(op.f(f"ix_{table}_uuid"), table_name=table)
        op.drop_column(table, "uuid")
