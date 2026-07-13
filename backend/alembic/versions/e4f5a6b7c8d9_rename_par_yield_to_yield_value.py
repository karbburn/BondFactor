"""rename par_yield to yield_value in raw_par_yield_observations

Revision ID: e4f5a6b7c8d9
Revises: d3e4f5a6b7c8
Create Date: 2026-07-14 13:00:00.000000

"""
from typing import Sequence, Union
from alembic import op

revision: str = 'e4f5a6b7c8d9'
down_revision: Union[str, Sequence[str], None] = 'd3e4f5a6b7c8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column('raw_par_yield_observations', 'par_yield', new_column_name='yield_value')


def downgrade() -> None:
    op.alter_column('raw_par_yield_observations', 'yield_value', new_column_name='par_yield')
