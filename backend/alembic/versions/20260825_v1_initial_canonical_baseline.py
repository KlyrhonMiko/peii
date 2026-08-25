"""create canonical v1 baseline

Revision ID: 20260825_v1
Revises: 
Create Date: 2026-08-25 13:01:16.919705
"""

# Generated DDL calls intentionally mirror Alembic's canonical rendering.
# ruff: noqa: E501

from datetime import datetime
from uuid import UUID

import sqlalchemy as sa
import sqlmodel
from sqlalchemy import Text
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision = '20260825_v1'
down_revision = None
branch_labels = None
depends_on = None

SYSTEM_ACTOR_ID = UUID("00000000-0000-0000-0000-000000000001")
SEED_TIMESTAMP = datetime(2026, 8, 25)

PERMISSIONS = (
    ("00000000-0000-0000-0000-000000000201", "portal.access", "Access the PEII portal."),
    ("00000000-0000-0000-0000-000000000202", "users.read", "View users."),
    ("00000000-0000-0000-0000-000000000203", "users.invite", "Invite users."),
    ("00000000-0000-0000-0000-000000000204", "users.update", "Update user profiles."),
    ("00000000-0000-0000-0000-000000000205", "users.assign_roles", "Assign user roles."),
    ("00000000-0000-0000-0000-000000000206", "users.change_status", "Activate or deactivate users."),
    ("00000000-0000-0000-0000-000000000207", "users.revoke_sessions", "Revoke user sessions."),
    ("00000000-0000-0000-0000-000000000208", "users.delete", "Delete user records."),
    ("00000000-0000-0000-0000-000000000209", "users.restore", "Restore user records."),
    ("00000000-0000-0000-0000-000000000210", "roles.read", "View roles and permissions."),
    ("00000000-0000-0000-0000-000000000211", "roles.manage", "Manage roles and permissions."),
    ("00000000-0000-0000-0000-000000000212", "audit_logs.read", "View audit logs."),
    ("00000000-0000-0000-0000-000000000213", "ml.models.read", "View ML models."),
    ("00000000-0000-0000-0000-000000000214", "ml.sentiment.run", "Run sentiment analysis."),
    ("00000000-0000-0000-0000-000000000215", "surveys.read", "View surveys."),
    ("00000000-0000-0000-0000-000000000216", "surveys.manage", "Create, update, structure, archive, and restore surveys."),
    ("00000000-0000-0000-0000-000000000217", "survey_distributions.manage", "Create, list, rotate, and revoke survey distributions."),
    ("00000000-0000-0000-0000-000000000218", "survey_responses.read_aggregates", "View aggregated survey responses."),
    ("00000000-0000-0000-0000-000000000219", "survey_responses.read_raw", "View raw survey responses."),
    ("00000000-0000-0000-0000-000000000220", "survey_responses.export", "Export survey responses."),
    ("00000000-0000-0000-0000-000000000221", "survey_responses.erase", "Erase survey responses."),
)

ROLES = (
    ("00000000-0000-0000-0000-000000000101", "admin", "System admin role."),
    ("00000000-0000-0000-0000-000000000102", "researcher", "System researcher role."),
    ("00000000-0000-0000-0000-000000000103", "staff", "System staff role."),
)

ROLE_PERMISSION_CODES = {
    "admin": frozenset(code for _, code, _ in PERMISSIONS),
    "researcher": frozenset(
        {
            "portal.access",
            "ml.models.read",
            "ml.sentiment.run",
            "surveys.read",
            "surveys.manage",
            "survey_distributions.manage",
            "survey_responses.read_aggregates",
            "survey_responses.read_raw",
            "survey_responses.export",
        }
    ),
    "staff": frozenset(
        {"portal.access", "ml.models.read", "surveys.read", "survey_responses.read_aggregates"}
    ),
}


def _seed_rbac() -> None:
    permission_table = sa.table(
        "permissions",
        sa.column("id", sa.Uuid()),
        sa.column("created_at", sa.DateTime()),
        sa.column("updated_at", sa.DateTime()),
        sa.column("is_deleted", sa.Boolean()),
        sa.column("performed_by", sa.Uuid()),
        sa.column("code", sa.String(length=100)),
        sa.column("description", sa.String(length=255)),
    )
    op.bulk_insert(
        permission_table,
        [
            {
                "id": UUID(permission_id),
                "created_at": SEED_TIMESTAMP,
                "updated_at": SEED_TIMESTAMP,
                "is_deleted": False,
                "performed_by": SYSTEM_ACTOR_ID,
                "code": code,
                "description": description,
            }
            for permission_id, code, description in PERMISSIONS
        ],
    )

    role_table = sa.table(
        "roles",
        sa.column("id", sa.Uuid()),
        sa.column("created_at", sa.DateTime()),
        sa.column("updated_at", sa.DateTime()),
        sa.column("is_deleted", sa.Boolean()),
        sa.column("performed_by", sa.Uuid()),
        sa.column("name", sa.String(length=100)),
        sa.column("description", sa.String(length=255)),
        sa.column("is_system", sa.Boolean()),
        sa.column("is_active", sa.Boolean()),
    )
    op.bulk_insert(
        role_table,
        [
            {
                "id": UUID(role_id),
                "created_at": SEED_TIMESTAMP,
                "updated_at": SEED_TIMESTAMP,
                "is_deleted": False,
                "performed_by": SYSTEM_ACTOR_ID,
                "name": name,
                "description": description,
                "is_system": True,
                "is_active": True,
            }
            for role_id, name, description in ROLES
        ],
    )

    permission_ids = {code: UUID(permission_id) for permission_id, code, _ in PERMISSIONS}
    role_ids = {name: UUID(role_id) for role_id, name, _ in ROLES}
    role_permission_table = sa.table(
        "role_permissions",
        sa.column("id", sa.Uuid()),
        sa.column("created_at", sa.DateTime()),
        sa.column("updated_at", sa.DateTime()),
        sa.column("is_deleted", sa.Boolean()),
        sa.column("performed_by", sa.Uuid()),
        sa.column("role_id", sa.Uuid()),
        sa.column("permission_id", sa.Uuid()),
    )
    edges = [
        {
            "id": UUID(f"00000000-0000-0000-0000-{index:012d}"),
            "created_at": SEED_TIMESTAMP,
            "updated_at": SEED_TIMESTAMP,
            "is_deleted": False,
            "performed_by": SYSTEM_ACTOR_ID,
            "role_id": role_ids[role_name],
            "permission_id": permission_ids[code],
        }
        for index, (role_name, code) in enumerate(
            (
                (role_name, code)
                for role_name, codes in ROLE_PERMISSION_CODES.items()
                for code in sorted(codes)
            ),
            start=301,
        )
    ]
    op.bulk_insert(role_permission_table, edges)


def upgrade() -> None:
    # ### commands auto generated by Alembic - please adjust! ###
    op.create_table('audit_logs',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('action', sqlmodel.sql.sqltypes.AutoString(length=100), nullable=False),
    sa.Column('resource_type', sqlmodel.sql.sqltypes.AutoString(length=100), nullable=False),
    sa.Column('resource_id', sqlmodel.sql.sqltypes.AutoString(length=100), nullable=False),
    sa.Column('performed_by', sa.Uuid(), nullable=False),
    sa.Column('request_id', sqlmodel.sql.sqltypes.AutoString(length=100), nullable=True),
    sa.Column('changes', sa.JSON(), nullable=True),
    sa.Column('ip_address', sqlmodel.sql.sqltypes.AutoString(length=50), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_audit_logs_action'), 'audit_logs', ['action'], unique=False)
    op.create_index(op.f('ix_audit_logs_id'), 'audit_logs', ['id'], unique=False)
    op.create_index(op.f('ix_audit_logs_performed_by'), 'audit_logs', ['performed_by'], unique=False)
    op.create_index(op.f('ix_audit_logs_request_id'), 'audit_logs', ['request_id'], unique=False)
    op.create_index(op.f('ix_audit_logs_resource_id'), 'audit_logs', ['resource_id'], unique=False)
    op.create_index(op.f('ix_audit_logs_resource_type'), 'audit_logs', ['resource_type'], unique=False)
    op.create_table('permissions',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.Column('is_deleted', sa.Boolean(), nullable=False),
    sa.Column('deleted_at', sa.DateTime(), nullable=True),
    sa.Column('performed_by', sa.Uuid(), nullable=True),
    sa.Column('code', sqlmodel.sql.sqltypes.AutoString(length=100), nullable=False),
    sa.Column('description', sqlmodel.sql.sqltypes.AutoString(length=255), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_permissions_code'), 'permissions', ['code'], unique=True)
    op.create_index(op.f('ix_permissions_id'), 'permissions', ['id'], unique=False)
    op.create_index(op.f('ix_permissions_is_deleted'), 'permissions', ['is_deleted'], unique=False)
    op.create_index(op.f('ix_permissions_performed_by'), 'permissions', ['performed_by'], unique=False)
    op.create_table('roles',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.Column('is_deleted', sa.Boolean(), nullable=False),
    sa.Column('deleted_at', sa.DateTime(), nullable=True),
    sa.Column('performed_by', sa.Uuid(), nullable=True),
    sa.Column('name', sqlmodel.sql.sqltypes.AutoString(length=100), nullable=False),
    sa.Column('description', sqlmodel.sql.sqltypes.AutoString(length=255), nullable=True),
    sa.Column('is_system', sa.Boolean(), nullable=False),
    sa.Column('is_active', sa.Boolean(), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_roles_id'), 'roles', ['id'], unique=False)
    op.create_index(op.f('ix_roles_is_deleted'), 'roles', ['is_deleted'], unique=False)
    op.create_index(op.f('ix_roles_name'), 'roles', ['name'], unique=True)
    op.create_index(op.f('ix_roles_performed_by'), 'roles', ['performed_by'], unique=False)
    op.create_table('surveys',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.Column('is_deleted', sa.Boolean(), nullable=False),
    sa.Column('deleted_at', sa.DateTime(), nullable=True),
    sa.Column('performed_by', sa.Uuid(), nullable=True),
    sa.Column('survey_id', sqlmodel.sql.sqltypes.AutoString(length=20), nullable=False),
    sa.Column('title', sqlmodel.sql.sqltypes.AutoString(length=255), nullable=False),
    sa.Column('description', sqlmodel.sql.sqltypes.AutoString(length=3000), nullable=True),
    sa.Column('status', sqlmodel.sql.sqltypes.AutoString(length=20), nullable=False),
    sa.Column('target_cohort', sqlmodel.sql.sqltypes.AutoString(length=100), nullable=True),
    sa.Column('responses_count', sa.Integer(), nullable=False),
    sa.CheckConstraint("status IN ('Inactive', 'Active', 'Closed')", name='ck_surveys_status'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_surveys_id'), 'surveys', ['id'], unique=False)
    op.create_index(op.f('ix_surveys_is_deleted'), 'surveys', ['is_deleted'], unique=False)
    op.create_index(op.f('ix_surveys_performed_by'), 'surveys', ['performed_by'], unique=False)
    op.create_index(op.f('ix_surveys_status'), 'surveys', ['status'], unique=False)
    op.create_index(op.f('ix_surveys_survey_id'), 'surveys', ['survey_id'], unique=True)
    op.create_table('users',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.Column('is_deleted', sa.Boolean(), nullable=False),
    sa.Column('deleted_at', sa.DateTime(), nullable=True),
    sa.Column('performed_by', sa.Uuid(), nullable=True),
    sa.Column('user_id', sqlmodel.sql.sqltypes.AutoString(length=20), nullable=False),
    sa.Column('auth_user_id', sa.Uuid(), nullable=True),
    sa.Column('email', sqlmodel.sql.sqltypes.AutoString(length=255), nullable=False),
    sa.Column('username', sqlmodel.sql.sqltypes.AutoString(length=100), nullable=False),
    sa.Column('first_name', sqlmodel.sql.sqltypes.AutoString(length=100), nullable=False),
    sa.Column('last_name', sqlmodel.sql.sqltypes.AutoString(length=100), nullable=False),
    sa.Column('middle_name', sqlmodel.sql.sqltypes.AutoString(length=100), nullable=True),
    sa.Column('contact', sqlmodel.sql.sqltypes.AutoString(length=50), nullable=True),
    sa.Column('is_active', sa.Boolean(), nullable=False),
    sa.Column('invited_at', sa.DateTime(), nullable=True),
    sa.Column('onboarding_completed_at', sa.DateTime(), nullable=True),
    sa.Column('last_login_at', sa.DateTime(), nullable=True),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_users_auth_user_id'), 'users', ['auth_user_id'], unique=True)
    op.create_index(op.f('ix_users_email'), 'users', ['email'], unique=True)
    op.create_index(op.f('ix_users_id'), 'users', ['id'], unique=False)
    op.create_index(op.f('ix_users_is_deleted'), 'users', ['is_deleted'], unique=False)
    op.create_index(op.f('ix_users_performed_by'), 'users', ['performed_by'], unique=False)
    op.create_index(op.f('ix_users_user_id'), 'users', ['user_id'], unique=True)
    op.create_index(op.f('ix_users_username'), 'users', ['username'], unique=True)
    op.create_table('response_erasure_receipts',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.Column('is_deleted', sa.Boolean(), nullable=False),
    sa.Column('deleted_at', sa.DateTime(), nullable=True),
    sa.Column('performed_by', sa.Uuid(), nullable=True),
    sa.Column('survey_id', sa.Uuid(), nullable=False),
    sa.Column('idempotency_key', sa.Uuid(), nullable=False),
    sa.Column('request_hash', sqlmodel.sql.sqltypes.AutoString(length=64), nullable=False),
    sa.Column('scope', sqlmodel.sql.sqltypes.AutoString(length=20), nullable=False),
    sa.Column('requested_count', sa.Integer(), nullable=False),
    sa.Column('erased_count', sa.Integer(), nullable=False),
    sa.ForeignKeyConstraint(['survey_id'], ['surveys.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('survey_id', 'idempotency_key', name='uq_response_erasure_receipts_survey_idempotency')
    )
    op.create_index(op.f('ix_response_erasure_receipts_id'), 'response_erasure_receipts', ['id'], unique=False)
    op.create_index(op.f('ix_response_erasure_receipts_idempotency_key'), 'response_erasure_receipts', ['idempotency_key'], unique=False)
    op.create_index(op.f('ix_response_erasure_receipts_is_deleted'), 'response_erasure_receipts', ['is_deleted'], unique=False)
    op.create_index(op.f('ix_response_erasure_receipts_performed_by'), 'response_erasure_receipts', ['performed_by'], unique=False)
    op.create_index(op.f('ix_response_erasure_receipts_survey_id'), 'response_erasure_receipts', ['survey_id'], unique=False)
    op.create_table('role_permissions',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.Column('is_deleted', sa.Boolean(), nullable=False),
    sa.Column('deleted_at', sa.DateTime(), nullable=True),
    sa.Column('performed_by', sa.Uuid(), nullable=True),
    sa.Column('role_id', sa.Uuid(), nullable=False),
    sa.Column('permission_id', sa.Uuid(), nullable=False),
    sa.ForeignKeyConstraint(['permission_id'], ['permissions.id'], ),
    sa.ForeignKeyConstraint(['role_id'], ['roles.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('role_id', 'permission_id')
    )
    op.create_index(op.f('ix_role_permissions_id'), 'role_permissions', ['id'], unique=False)
    op.create_index(op.f('ix_role_permissions_is_deleted'), 'role_permissions', ['is_deleted'], unique=False)
    op.create_index(op.f('ix_role_permissions_performed_by'), 'role_permissions', ['performed_by'], unique=False)
    op.create_index(op.f('ix_role_permissions_permission_id'), 'role_permissions', ['permission_id'], unique=False)
    op.create_index(op.f('ix_role_permissions_role_id'), 'role_permissions', ['role_id'], unique=False)
    op.create_table('survey_distributions',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.Column('is_deleted', sa.Boolean(), nullable=False),
    sa.Column('deleted_at', sa.DateTime(), nullable=True),
    sa.Column('performed_by', sa.Uuid(), nullable=True),
    sa.Column('survey_id', sa.Uuid(), nullable=False),
    sa.Column('token', sqlmodel.sql.sqltypes.AutoString(length=64), nullable=False),
    sa.Column('expires_at', sa.DateTime(), nullable=False),
    sa.Column('revoked_at', sa.DateTime(), nullable=True),
    sa.ForeignKeyConstraint(['survey_id'], ['surveys.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('id', 'survey_id', name='uq_survey_distributions_id_survey')
    )
    op.create_index(op.f('ix_survey_distributions_expires_at'), 'survey_distributions', ['expires_at'], unique=False)
    op.create_index(op.f('ix_survey_distributions_id'), 'survey_distributions', ['id'], unique=False)
    op.create_index(op.f('ix_survey_distributions_is_deleted'), 'survey_distributions', ['is_deleted'], unique=False)
    op.create_index(op.f('ix_survey_distributions_performed_by'), 'survey_distributions', ['performed_by'], unique=False)
    op.create_index(op.f('ix_survey_distributions_survey_id'), 'survey_distributions', ['survey_id'], unique=False)
    op.create_index(op.f('ix_survey_distributions_token'), 'survey_distributions', ['token'], unique=True)
    op.create_table('survey_sections',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.Column('is_deleted', sa.Boolean(), nullable=False),
    sa.Column('deleted_at', sa.DateTime(), nullable=True),
    sa.Column('performed_by', sa.Uuid(), nullable=True),
    sa.Column('survey_id', sa.Uuid(), nullable=False),
    sa.Column('title', sqlmodel.sql.sqltypes.AutoString(length=255), nullable=False),
    sa.Column('description', sqlmodel.sql.sqltypes.AutoString(length=3000), nullable=True),
    sa.Column('order_index', sa.Integer(), nullable=False),
    sa.CheckConstraint('order_index >= 0', name='ck_survey_sections_order_index'),
    sa.ForeignKeyConstraint(['survey_id'], ['surveys.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('id', 'survey_id', name='uq_survey_sections_id_survey')
    )
    op.create_index(op.f('ix_survey_sections_id'), 'survey_sections', ['id'], unique=False)
    op.create_index(op.f('ix_survey_sections_is_deleted'), 'survey_sections', ['is_deleted'], unique=False)
    op.create_index(op.f('ix_survey_sections_order_index'), 'survey_sections', ['order_index'], unique=False)
    op.create_index(op.f('ix_survey_sections_performed_by'), 'survey_sections', ['performed_by'], unique=False)
    op.create_index(op.f('ix_survey_sections_survey_id'), 'survey_sections', ['survey_id'], unique=False)
    op.create_index('uq_survey_sections_active_order', 'survey_sections', ['survey_id', 'order_index'], unique=True, postgresql_where=sa.text('is_deleted = false'), sqlite_where=sa.text('is_deleted = 0'))
    op.create_table('user_roles',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.Column('is_deleted', sa.Boolean(), nullable=False),
    sa.Column('deleted_at', sa.DateTime(), nullable=True),
    sa.Column('performed_by', sa.Uuid(), nullable=True),
    sa.Column('user_id', sa.Uuid(), nullable=False),
    sa.Column('role_id', sa.Uuid(), nullable=False),
    sa.ForeignKeyConstraint(['role_id'], ['roles.id'], ),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('user_id', 'role_id')
    )
    op.create_index(op.f('ix_user_roles_id'), 'user_roles', ['id'], unique=False)
    op.create_index(op.f('ix_user_roles_is_deleted'), 'user_roles', ['is_deleted'], unique=False)
    op.create_index(op.f('ix_user_roles_performed_by'), 'user_roles', ['performed_by'], unique=False)
    op.create_index(op.f('ix_user_roles_role_id'), 'user_roles', ['role_id'], unique=False)
    op.create_index(op.f('ix_user_roles_user_id'), 'user_roles', ['user_id'], unique=False)
    op.create_table('survey_questions',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.Column('is_deleted', sa.Boolean(), nullable=False),
    sa.Column('deleted_at', sa.DateTime(), nullable=True),
    sa.Column('performed_by', sa.Uuid(), nullable=True),
    sa.Column('survey_id', sa.Uuid(), nullable=False),
    sa.Column('section_id', sa.Uuid(), nullable=False),
    sa.Column('question_text', sqlmodel.sql.sqltypes.AutoString(length=500), nullable=False),
    sa.Column('question_type', sa.String(length=20), nullable=False),
    sa.Column('options', sqlmodel.sql.sqltypes.AutoString(length=2000), nullable=True),
    sa.Column('config', sqlmodel.sql.sqltypes.AutoString(length=2000), nullable=True),
    sa.Column('order_index', sa.Integer(), nullable=False),
    sa.Column('is_required', sa.Boolean(), server_default=sa.text('(true)'), nullable=False),
    sa.CheckConstraint('order_index >= 0', name='ck_survey_questions_order_index'),
    sa.ForeignKeyConstraint(['section_id', 'survey_id'], ['survey_sections.id', 'survey_sections.survey_id'], name='fk_survey_questions_section_survey'),
    sa.ForeignKeyConstraint(['section_id'], ['survey_sections.id'], ),
    sa.ForeignKeyConstraint(['survey_id'], ['surveys.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_survey_questions_id'), 'survey_questions', ['id'], unique=False)
    op.create_index(op.f('ix_survey_questions_is_deleted'), 'survey_questions', ['is_deleted'], unique=False)
    op.create_index(op.f('ix_survey_questions_order_index'), 'survey_questions', ['order_index'], unique=False)
    op.create_index(op.f('ix_survey_questions_performed_by'), 'survey_questions', ['performed_by'], unique=False)
    op.create_index(op.f('ix_survey_questions_section_id'), 'survey_questions', ['section_id'], unique=False)
    op.create_index(op.f('ix_survey_questions_survey_id'), 'survey_questions', ['survey_id'], unique=False)
    op.create_index('uq_survey_questions_active_section_order', 'survey_questions', ['section_id', 'order_index'], unique=True, postgresql_where=sa.text('is_deleted = false'), sqlite_where=sa.text('is_deleted = 0'))
    op.create_table('survey_responses',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.Column('is_deleted', sa.Boolean(), nullable=False),
    sa.Column('deleted_at', sa.DateTime(), nullable=True),
    sa.Column('performed_by', sa.Uuid(), nullable=True),
    sa.Column('survey_id', sa.Uuid(), nullable=False),
    sa.Column('distribution_id', sa.Uuid(), nullable=True),
    sa.Column('idempotency_key', sa.Uuid(), nullable=True),
    sa.Column('idempotency_hash', sqlmodel.sql.sqltypes.AutoString(length=64), nullable=True),
    sa.Column('answers', sa.JSON().with_variant(postgresql.JSONB(astext_type=Text()), 'postgresql'), nullable=False),
    sa.ForeignKeyConstraint(['distribution_id', 'survey_id'], ['survey_distributions.id', 'survey_distributions.survey_id'], name='fk_survey_responses_distribution_survey'),
    sa.ForeignKeyConstraint(['survey_id'], ['surveys.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('distribution_id', 'idempotency_key', name='uq_survey_responses_distribution_idempotency')
    )
    op.create_index(op.f('ix_survey_responses_distribution_id'), 'survey_responses', ['distribution_id'], unique=False)
    op.create_index(op.f('ix_survey_responses_id'), 'survey_responses', ['id'], unique=False)
    op.create_index(op.f('ix_survey_responses_idempotency_key'), 'survey_responses', ['idempotency_key'], unique=False)
    op.create_index(op.f('ix_survey_responses_is_deleted'), 'survey_responses', ['is_deleted'], unique=False)
    op.create_index(op.f('ix_survey_responses_performed_by'), 'survey_responses', ['performed_by'], unique=False)
    op.create_index(op.f('ix_survey_responses_survey_id'), 'survey_responses', ['survey_id'], unique=False)
    _seed_rbac()
    # ### end Alembic commands ###


def downgrade() -> None:
    # ### commands auto generated by Alembic - please adjust! ###
    op.drop_index(op.f('ix_survey_responses_survey_id'), table_name='survey_responses')
    op.drop_index(op.f('ix_survey_responses_performed_by'), table_name='survey_responses')
    op.drop_index(op.f('ix_survey_responses_is_deleted'), table_name='survey_responses')
    op.drop_index(op.f('ix_survey_responses_idempotency_key'), table_name='survey_responses')
    op.drop_index(op.f('ix_survey_responses_id'), table_name='survey_responses')
    op.drop_index(op.f('ix_survey_responses_distribution_id'), table_name='survey_responses')
    op.drop_table('survey_responses')
    op.drop_index('uq_survey_questions_active_section_order', table_name='survey_questions', postgresql_where=sa.text('is_deleted = false'), sqlite_where=sa.text('is_deleted = 0'))
    op.drop_index(op.f('ix_survey_questions_survey_id'), table_name='survey_questions')
    op.drop_index(op.f('ix_survey_questions_section_id'), table_name='survey_questions')
    op.drop_index(op.f('ix_survey_questions_performed_by'), table_name='survey_questions')
    op.drop_index(op.f('ix_survey_questions_order_index'), table_name='survey_questions')
    op.drop_index(op.f('ix_survey_questions_is_deleted'), table_name='survey_questions')
    op.drop_index(op.f('ix_survey_questions_id'), table_name='survey_questions')
    op.drop_table('survey_questions')
    op.drop_index(op.f('ix_user_roles_user_id'), table_name='user_roles')
    op.drop_index(op.f('ix_user_roles_role_id'), table_name='user_roles')
    op.drop_index(op.f('ix_user_roles_performed_by'), table_name='user_roles')
    op.drop_index(op.f('ix_user_roles_is_deleted'), table_name='user_roles')
    op.drop_index(op.f('ix_user_roles_id'), table_name='user_roles')
    op.drop_table('user_roles')
    op.drop_index('uq_survey_sections_active_order', table_name='survey_sections', postgresql_where=sa.text('is_deleted = false'), sqlite_where=sa.text('is_deleted = 0'))
    op.drop_index(op.f('ix_survey_sections_survey_id'), table_name='survey_sections')
    op.drop_index(op.f('ix_survey_sections_performed_by'), table_name='survey_sections')
    op.drop_index(op.f('ix_survey_sections_order_index'), table_name='survey_sections')
    op.drop_index(op.f('ix_survey_sections_is_deleted'), table_name='survey_sections')
    op.drop_index(op.f('ix_survey_sections_id'), table_name='survey_sections')
    op.drop_table('survey_sections')
    op.drop_index(op.f('ix_survey_distributions_token'), table_name='survey_distributions')
    op.drop_index(op.f('ix_survey_distributions_survey_id'), table_name='survey_distributions')
    op.drop_index(op.f('ix_survey_distributions_performed_by'), table_name='survey_distributions')
    op.drop_index(op.f('ix_survey_distributions_is_deleted'), table_name='survey_distributions')
    op.drop_index(op.f('ix_survey_distributions_id'), table_name='survey_distributions')
    op.drop_index(op.f('ix_survey_distributions_expires_at'), table_name='survey_distributions')
    op.drop_table('survey_distributions')
    op.drop_index(op.f('ix_role_permissions_role_id'), table_name='role_permissions')
    op.drop_index(op.f('ix_role_permissions_permission_id'), table_name='role_permissions')
    op.drop_index(op.f('ix_role_permissions_performed_by'), table_name='role_permissions')
    op.drop_index(op.f('ix_role_permissions_is_deleted'), table_name='role_permissions')
    op.drop_index(op.f('ix_role_permissions_id'), table_name='role_permissions')
    op.drop_table('role_permissions')
    op.drop_index(op.f('ix_response_erasure_receipts_survey_id'), table_name='response_erasure_receipts')
    op.drop_index(op.f('ix_response_erasure_receipts_performed_by'), table_name='response_erasure_receipts')
    op.drop_index(op.f('ix_response_erasure_receipts_is_deleted'), table_name='response_erasure_receipts')
    op.drop_index(op.f('ix_response_erasure_receipts_idempotency_key'), table_name='response_erasure_receipts')
    op.drop_index(op.f('ix_response_erasure_receipts_id'), table_name='response_erasure_receipts')
    op.drop_table('response_erasure_receipts')
    op.drop_index(op.f('ix_users_username'), table_name='users')
    op.drop_index(op.f('ix_users_user_id'), table_name='users')
    op.drop_index(op.f('ix_users_performed_by'), table_name='users')
    op.drop_index(op.f('ix_users_is_deleted'), table_name='users')
    op.drop_index(op.f('ix_users_id'), table_name='users')
    op.drop_index(op.f('ix_users_email'), table_name='users')
    op.drop_index(op.f('ix_users_auth_user_id'), table_name='users')
    op.drop_table('users')
    op.drop_index(op.f('ix_surveys_survey_id'), table_name='surveys')
    op.drop_index(op.f('ix_surveys_status'), table_name='surveys')
    op.drop_index(op.f('ix_surveys_performed_by'), table_name='surveys')
    op.drop_index(op.f('ix_surveys_is_deleted'), table_name='surveys')
    op.drop_index(op.f('ix_surveys_id'), table_name='surveys')
    op.drop_table('surveys')
    op.drop_index(op.f('ix_roles_performed_by'), table_name='roles')
    op.drop_index(op.f('ix_roles_name'), table_name='roles')
    op.drop_index(op.f('ix_roles_is_deleted'), table_name='roles')
    op.drop_index(op.f('ix_roles_id'), table_name='roles')
    op.drop_table('roles')
    op.drop_index(op.f('ix_permissions_performed_by'), table_name='permissions')
    op.drop_index(op.f('ix_permissions_is_deleted'), table_name='permissions')
    op.drop_index(op.f('ix_permissions_id'), table_name='permissions')
    op.drop_index(op.f('ix_permissions_code'), table_name='permissions')
    op.drop_table('permissions')
    op.drop_index(op.f('ix_audit_logs_resource_type'), table_name='audit_logs')
    op.drop_index(op.f('ix_audit_logs_resource_id'), table_name='audit_logs')
    op.drop_index(op.f('ix_audit_logs_request_id'), table_name='audit_logs')
    op.drop_index(op.f('ix_audit_logs_performed_by'), table_name='audit_logs')
    op.drop_index(op.f('ix_audit_logs_id'), table_name='audit_logs')
    op.drop_index(op.f('ix_audit_logs_action'), table_name='audit_logs')
    op.drop_table('audit_logs')
    # ### end Alembic commands ###
