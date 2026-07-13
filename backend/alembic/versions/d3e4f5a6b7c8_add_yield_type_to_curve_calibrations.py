"""add yield_type to curve_calibrations

Revision ID: d3e4f5a6b7c8
Revises: c1a2b3d4e5f6
Create Date: 2026-07-14 12:00:00.000000

"""
from typing import Sequence, Union
import sqlalchemy as sa
from alembic import op

revision: str = 'd3e4f5a6b7c8'
down_revision: Union[str, Sequence[str], None] = 'c1a2b3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'curve_calibrations',
        sa.Column('yield_type', sa.String(), nullable=False, server_default='par')
    )


def downgrade() -> None:
    op.drop_column('curve_calibrations', 'yield_type')
