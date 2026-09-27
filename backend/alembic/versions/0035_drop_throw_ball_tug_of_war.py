"""Drop Throw Ball and Tug of War tables/columns — sports removed from the product.

team_members.gender is kept: it's a general-purpose field used by team
registration and gender-restricted events broadly, not specific to either
removed sport.

Revision ID: 0035_drop_throw_ball_tug_of_war
Revises: 0034_throw_ball_tug_of_war
"""

from alembic import op
import sqlalchemy as sa

revision = "0035_drop_throw_ball_tug_of_war"
down_revision = "0034_throw_ball_tug_of_war"
branch_labels = None
depends_on = None


def upgrade():
    op.drop_index("ix_tug_of_war_pullers_team_member_id", table_name="tug_of_war_pullers")
    op.drop_index("ix_tug_of_war_pullers_weighin_id", table_name="tug_of_war_pullers")
    op.drop_table("tug_of_war_pullers")

    op.drop_index("ix_tug_of_war_weighins_match_id", table_name="tug_of_war_weighins")
    op.drop_table("tug_of_war_weighins")

    op.drop_index("ix_throw_ball_lineups_team_member_id", table_name="throw_ball_lineups")
    op.drop_index("ix_throw_ball_lineups_match_id", table_name="throw_ball_lineups")
    op.drop_table("throw_ball_lineups")

    op.drop_column("matches", "weight_category")


def downgrade():
    op.add_column("matches", sa.Column("weight_category", sa.String(length=20), nullable=True))

    op.create_table(
        "throw_ball_lineups",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("match_id", sa.Integer(), sa.ForeignKey("matches.match_id", ondelete="CASCADE"), nullable=False),
        sa.Column("team_member_id", sa.Integer(), sa.ForeignKey("team_members.tm_id", ondelete="CASCADE"), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("on_court", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("court_position", sa.Integer(), nullable=True),
        sa.UniqueConstraint("match_id", "team_member_id", name="uq_tb_lineup_member"),
        sa.CheckConstraint("position IN (1, 2)", name="ck_tb_lineup_position"),
    )
    op.create_index("ix_throw_ball_lineups_match_id", "throw_ball_lineups", ["match_id"])
    op.create_index("ix_throw_ball_lineups_team_member_id", "throw_ball_lineups", ["team_member_id"])

    op.create_table(
        "tug_of_war_weighins",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("match_id", sa.Integer(), sa.ForeignKey("matches.match_id", ondelete="CASCADE"), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("total_weight_kg", sa.Float(), nullable=False),
        sa.Column("verified_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("caution_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("substitution_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_disqualified", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("disqualified_reason", sa.String(length=50), nullable=True),
        sa.UniqueConstraint("match_id", "position", name="uq_tow_weighin_position"),
        sa.CheckConstraint("position IN (1, 2)", name="ck_tow_weighin_position"),
    )
    op.create_index("ix_tug_of_war_weighins_match_id", "tug_of_war_weighins", ["match_id"])

    op.create_table(
        "tug_of_war_pullers",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("weighin_id", sa.Integer(), sa.ForeignKey("tug_of_war_weighins.id", ondelete="CASCADE"), nullable=False),
        sa.Column("team_member_id", sa.Integer(), sa.ForeignKey("team_members.tm_id", ondelete="SET NULL"), nullable=True),
        sa.Column("weight_kg", sa.Float(), nullable=False),
        sa.Column("position", sa.String(length=20), nullable=False),
        sa.Column("position_order", sa.Integer(), nullable=False),
        sa.Column("weighed_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("substituted_for_team_member_id", sa.Integer(), sa.ForeignKey("team_members.tm_id", ondelete="SET NULL"), nullable=True),
        sa.UniqueConstraint("weighin_id", "position", name="uq_tow_puller_position"),
    )
    op.create_index("ix_tug_of_war_pullers_weighin_id", "tug_of_war_pullers", ["weighin_id"])
    op.create_index("ix_tug_of_war_pullers_team_member_id", "tug_of_war_pullers", ["team_member_id"])
