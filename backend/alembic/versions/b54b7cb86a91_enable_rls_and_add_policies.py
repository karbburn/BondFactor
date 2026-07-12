"""enable rls and add policies

Revision ID: b54b7cb86a91
Revises: 024dc4274729
Create Date: 2026-07-12 16:48:28.631761

"""
from typing import Sequence, Union
from alembic import op

revision: str = 'b54b7cb86a91'
down_revision: Union[str, Sequence[str], None] = '024dc4274729'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # === Enable RLS on all tables ===
    for table in [
        "curve_calibrations", "key_rate_tenor_grid", "portfolios",
        "portfolio_positions", "raw_par_yield_observations",
        "reference_zero_curves", "report_generations",
        "saved_scenarios", "securities",
    ]:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")

    # === Public read-only tables (anyone can SELECT, only service-role writes) ===
    for table in ["securities", "key_rate_tenor_grid", "curve_calibrations", "reference_zero_curves"]:
        op.execute(f"""
            CREATE POLICY "{table}_public_read" ON {table}
                FOR SELECT USING (true)
        """)

    # === raw_par_yield_observations: service-role only (no anon/authenticated read) ===
    # No SELECT policy = blocked by default. Only service_role (backend) inserts via server.

    # === User-scoped tables: owner-only CRUD ===
    # portfolios
    op.execute("""
        CREATE POLICY "portfolios_owner_all" ON portfolios
            FOR ALL USING (user_id = auth.uid()::text)
            WITH CHECK (user_id = auth.uid()::text)
    """)

    # portfolio_positions: access via portfolio ownership
    op.execute("""
        CREATE POLICY "positions_owner_all" ON portfolio_positions
            FOR ALL USING (
                portfolio_id IN (
                    SELECT id FROM portfolios WHERE user_id = auth.uid()::text
                )
            ) WITH CHECK (
                portfolio_id IN (
                    SELECT id FROM portfolios WHERE user_id = auth.uid()::text
                )
            )
    """)

    # saved_scenarios
    op.execute("""
        CREATE POLICY "scenarios_owner_all" ON saved_scenarios
            FOR ALL USING (user_id = auth.uid()::text)
            WITH CHECK (user_id = auth.uid()::text)
    """)

    # report_generations
    op.execute("""
        CREATE POLICY "reports_owner_all" ON report_generations
            FOR ALL USING (user_id = auth.uid()::text)
            WITH CHECK (user_id = auth.uid()::text)
    """)


def downgrade() -> None:
    for table in [
        "curve_calibrations", "key_rate_tenor_grid", "portfolios",
        "portfolio_positions", "raw_par_yield_observations",
        "reference_zero_curves", "report_generations",
        "saved_scenarios", "securities",
    ]:
        op.execute(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY")

    # Drop policies
    op.execute('DROP POLICY IF EXISTS "portfolios_owner_all" ON portfolios')
    op.execute('DROP POLICY IF EXISTS "positions_owner_all" ON portfolio_positions')
    op.execute('DROP POLICY IF EXISTS "scenarios_owner_all" ON saved_scenarios')
    op.execute('DROP POLICY IF EXISTS "reports_owner_all" ON report_generations')
    op.execute('DROP POLICY IF EXISTS "securities_public_read" ON securities')
    op.execute('DROP POLICY IF EXISTS "key_rate_tenor_grid_public_read" ON key_rate_tenor_grid')
    op.execute('DROP POLICY IF EXISTS "curve_calibrations_public_read" ON curve_calibrations')
    op.execute('DROP POLICY IF EXISTS "reference_zero_curves_public_read" ON reference_zero_curves')
