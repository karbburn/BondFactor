"""add on delete cascade to foreign keys

Revision ID: c1a2b3d4e5f6
Revises: b54b7cb86a91
Create Date: 2026-07-13 12:00:00.000000

"""
from typing import Sequence, Union
from alembic import op

revision: str = 'c1a2b3d4e5f6'
down_revision: Union[str, Sequence[str], None] = 'b54b7cb86a91'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Drop and recreate foreign keys with ON DELETE CASCADE
    # reference_zero_curves.calibration_id -> curve_calibrations.id
    op.drop_constraint('reference_zero_curves_calibration_id_fkey', 'reference_zero_curves', type_='foreignkey')
    op.create_foreign_key('reference_zero_curves_calibration_id_fkey', 'reference_zero_curves', 'curve_calibrations', ['calibration_id'], ['id'], ondelete='CASCADE')

    # portfolio_positions.portfolio_id -> portfolios.id
    op.drop_constraint('portfolio_positions_portfolio_id_fkey', 'portfolio_positions', type_='foreignkey')
    op.create_foreign_key('portfolio_positions_portfolio_id_fkey', 'portfolio_positions', 'portfolios', ['portfolio_id'], ['id'], ondelete='CASCADE')

    # portfolio_positions.security_id -> securities.id (RESTRICT: can't delete a security with positions)
    op.drop_constraint('portfolio_positions_security_id_fkey', 'portfolio_positions', type_='foreignkey')
    op.create_foreign_key('portfolio_positions_security_id_fkey', 'portfolio_positions', 'securities', ['security_id'], ['id'], ondelete='RESTRICT')

    # report_generations.portfolio_id -> portfolios.id
    op.drop_constraint('report_generations_portfolio_id_fkey', 'report_generations', type_='foreignkey')
    op.create_foreign_key('report_generations_portfolio_id_fkey', 'report_generations', 'portfolios', ['portfolio_id'], ['id'], ondelete='CASCADE')


def downgrade() -> None:
    # Revert to no ON DELETE action
    op.drop_constraint('reference_zero_curves_calibration_id_fkey', 'reference_zero_curves', type_='foreignkey')
    op.create_foreign_key('reference_zero_curves_calibration_id_fkey', 'reference_zero_curves', 'curve_calibrations', ['calibration_id'], ['id'])

    op.drop_constraint('portfolio_positions_portfolio_id_fkey', 'portfolio_positions', type_='foreignkey')
    op.create_foreign_key('portfolio_positions_portfolio_id_fkey', 'portfolio_positions', 'portfolios', ['portfolio_id'], ['id'])

    op.drop_constraint('portfolio_positions_security_id_fkey', 'portfolio_positions', type_='foreignkey')
    op.create_foreign_key('portfolio_positions_security_id_fkey', 'portfolio_positions', 'securities', ['security_id'], ['id'])

    op.drop_constraint('report_generations_portfolio_id_fkey', 'report_generations', type_='foreignkey')
    op.create_foreign_key('report_generations_portfolio_id_fkey', 'report_generations', 'portfolios', ['portfolio_id'], ['id'])
