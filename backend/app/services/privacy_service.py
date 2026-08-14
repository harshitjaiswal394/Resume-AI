"""DPDP Act (India) compliance service.

Implements the technical obligations from the DPDP checklist:
  * granular consent recording/withdrawal (user_consents)
  * right-to-access data export (aggregated snapshot)
  * right-to-erasure scheduling (soft-flag + 30-day hard-purge window)
  * nightly retention purge across every user-scoped table
"""

import json
import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import text

from app.db import engine

logger = logging.getLogger("resumatch-api.privacy")

# Erasure grace period required by the DPDP Rules (retention only as long as
# the purpose requires; 30 days gives the account holder a reversal window).
ERASURE_GRACE_DAYS = 30

# Default privacy notice + consent contract version.
DEFAULT_NOTICE_VERSION = "v1.0"
CONSENT_TYPES = ("essential", "analytics", "marketing", "preferences")

# Every table carrying personal data keyed by user_id. The purge routine
# deletes from these in dependency-safe order (children first).
USER_SCOPED_TABLES = [
    "resume_variant_outcomes",
    "job_search_logs",
    "job_applications",
    "job_matches",
    "job_descriptions",
    "cover_letters",
    "interview_feedback",
    "interview_sessions",
    "message_feedback",
    "messages",
    "conversations",
    "user_memory",
    "semantic_memory",
    "user_notifications",
    "digest_settings",
    "job_alerts",
    "subscriptions",
    "public_resume_links",
    "referral_lookups",
    "outreach_messages",
    "application_events",
    "analytics_events",
    "audit_logs",
    "user_consents",
]

# resume_id-keyed tables (children of resumes).
RESUME_ID_TABLES = [
    "resume_embeddings",
    "resume_versions",
    "resume_variant_outcomes",
    "public_resume_links",
    "job_matches",
    "job_applications",
    "job_search_logs",
    "cover_letters",
    "interview_feedback",
]


def _row_to_dict(row):
    out = {}
    for key, value in dict(row._mapping).items():
        if hasattr(value, "hex"):
            out[key] = str(value)
        elif hasattr(value, "isoformat"):
            out[key] = value.isoformat()
        elif hasattr(value, "total_seconds"):
            out[key] = value.total_seconds()
        else:
            out[key] = value
    return out


# ── Consent ───────────────────────────────────────────────────────────────────

def record_consent(
    user_id: str,
    consent_type: str,
    status: bool,
    notice_version: str = DEFAULT_NOTICE_VERSION,
    language_code: str = "en",
    ip_address: str = None,
) -> dict:
    """Upsert one consent category and return the stored record."""
    if consent_type not in CONSENT_TYPES:
        raise ValueError(f"consent_type must be one of {CONSENT_TYPES}")

    with engine.begin() as conn:
        result = conn.execute(
            text(
                """
                INSERT INTO user_consents
                    (user_id, consent_type, status, notice_version, language_code, ip_address, updated_at)
                VALUES
                    (:uid, :ctype, :status, :version, :lang, :ip, NOW())
                ON CONFLICT (user_id, consent_type)
                DO UPDATE SET
                    status = EXCLUDED.status,
                    notice_version = EXCLUDED.notice_version,
                    language_code = EXCLUDED.language_code,
                    ip_address = EXCLUDED.ip_address,
                    updated_at = NOW()
                RETURNING consent_type, status, notice_version, language_code, ip_address, created_at, updated_at
                """
            ),
            {
                "uid": user_id,
                "ctype": consent_type,
                "status": bool(status),
                "version": notice_version or DEFAULT_NOTICE_VERSION,
                "lang": language_code or "en",
                "ip": ip_address,
            },
        )
        row = result.fetchone()
    return _row_to_dict(row)


def get_user_consents(user_id: str) -> list:
    """Current consent state per category for the user."""
    with engine.connect() as conn:
        rows = conn.execute(
            text(
                """
                SELECT consent_type, status, notice_version, language_code, created_at, updated_at
                FROM user_consents
                WHERE user_id = :uid
                ORDER BY consent_type
                """
            ),
            {"uid": user_id},
        ).fetchall()
    return [_row_to_dict(r) for r in rows]


# ── Right to access / data portability ───────────────────────────────────────

def build_data_export(user_id: str) -> dict:
    """Aggregate every stored personal-data domain for the user."""
    with engine.connect() as conn:
        profile = conn.execute(
            text(
                """
                SELECT id, email, full_name, avatar_url, plan, credits_remaining,
                       onboarding_done, created_at, updated_at, account_status,
                       deletion_requested_at, hard_delete_due_at, last_activity_at
                FROM public.users WHERE id = :uid
                """
            ),
            {"uid": user_id},
        ).fetchone()

        def _count(table: str) -> int:
            try:
                return conn.execute(
                    text(f"SELECT count(*) FROM {table} WHERE user_id = :uid"), {"uid": user_id}
                ).scalar() or 0
            except Exception:
                return 0

        resumes = conn.execute(
            text(
                """
                SELECT id, title, file_name, file_type, file_size_bytes, status,
                       created_at, updated_at, resume_score, ats_score, target_role
                FROM resumes WHERE user_id = :uid ORDER BY updated_at DESC
                """
            ),
            {"uid": user_id},
        ).fetchall()

        conversations = conn.execute(
            text("SELECT id, title, created_at, updated_at FROM conversations WHERE user_id = :uid ORDER BY updated_at DESC"),
            {"uid": user_id},
        ).fetchall()

        conv_ids = [str(r.id) for r in conversations]
        messages = []
        if conv_ids:
            messages = conn.execute(
                text("SELECT role, content, created_at FROM messages WHERE conversation_id::text = ANY(:cids) ORDER BY created_at ASC"),
                {"cids": conv_ids},
            ).fetchall()

        consents = get_user_consents(user_id)

    export = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "requested_by": user_id,
        "profile": _row_to_dict(profile) if profile else None,
        "consents": consents,
        "resumes": [_row_to_dict(r) for r in resumes],
        "conversations": [
            {"id": str(c.id), "title": c.title, "created_at": c.created_at.isoformat() if c.created_at else None}
            for c in conversations
        ],
        "messages": [_row_to_dict(m) for m in messages],
        "counts": {
            "resumes": len(resumes),
            "conversations": len(conversations),
            "messages": len(messages),
            "cover_letters": _count("cover_letters"),
            "job_applications": _count("job_applications"),
            "job_matches": _count("job_matches"),
            "user_memory": _count("user_memory"),
            "semantic_memory": _count("semantic_memory"),
            "subscriptions": _count("subscriptions"),
            "audit_events": _count("audit_logs"),
        },
    }
    return export


_CSV_FORMULA_PREFIXES = ("=", "+", "-", "@", "\t", "\r")


def _csv_safe(value):
    """Neutralize spreadsheet formula injection (CWE-1236) in exported cells.

    User-controlled strings starting with a formula trigger character are
    prefixed with a single quote so Excel/Sheets treat them as text.
    """
    if value is None:
        return ""
    text_value = str(value)
    if text_value.startswith(_CSV_FORMULA_PREFIXES):
        return "'" + text_value
    return text_value


def export_csv(user_id: str) -> str:
    """Flat CSV of profile + consents for download (UTF-8 BOM, formula-safe)."""
    import csv
    import io

    export = build_data_export(user_id)
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["section", "field", "value"])
    if export["profile"]:
        for k, v in export["profile"].items():
            writer.writerow(["profile", k, _csv_safe(v)])
    for c in export["consents"]:
        for k, v in c.items():
            writer.writerow(["consent", k, _csv_safe(v)])
    for r in export["resumes"]:
        for k, v in r.items():
            writer.writerow(["resume", k, _csv_safe(v)])
    writer.writerow(["counts", "json", _csv_safe(json.dumps(export["counts"], default=str))])
    return "\ufeff" + buf.getvalue()


# ── Right to erasure ──────────────────────────────────────────────────────────

def get_account_status(user_id: str) -> dict:
    """Lightweight account-lifecycle snapshot for the Privacy Settings UI."""
    with engine.connect() as conn:
        row = conn.execute(
            text(
                """
                SELECT account_status, deletion_requested_at, hard_delete_due_at
                FROM public.users WHERE id = :uid
                """
            ),
            {"uid": user_id},
        ).fetchone()
    if not row:
        return {"account_status": "unknown", "deletion_requested_at": None, "hard_delete_due_at": None}
    return {
        "account_status": row[0],
        "deletion_requested_at": row[1].isoformat() if row[1] else None,
        "hard_delete_due_at": row[2].isoformat() if row[2] else None,
    }


def schedule_erasure(user_id: str) -> dict:
    """Flag the account for deletion and compute the hard-purge date.

    Idempotent: re-requesting deletion does NOT reset the grace-period clock,
    otherwise a user could postpone the hard purge indefinitely (defeating the
    right to erasure). The first request date is preserved.
    """
    with engine.begin() as conn:
        row = conn.execute(
            text(
                """
                SELECT hard_delete_due_at FROM public.users
                WHERE id = :uid AND account_status = 'deletion_requested'
                """
            ),
            {"uid": user_id},
        ).fetchone()
        if row and row[0]:
            due = row[0]
            already_scheduled = True
        else:
            due = datetime.now(timezone.utc) + timedelta(days=ERASURE_GRACE_DAYS)
            already_scheduled = False
            conn.execute(
                text(
                    """
                    UPDATE public.users
                    SET account_status = 'deletion_requested',
                        deletion_requested_at = NOW(),
                        hard_delete_due_at = :due
                    WHERE id = :uid
                    """
                ),
                {"uid": user_id, "due": due},
            )
    return {
        "status": "deletion_scheduled",
        "grace_period_ends_at": due.isoformat(),
        "message": (
            "Your request has been registered. Data will be permanently purged within "
            f"{ERASURE_GRACE_DAYS} days."
        ),
        "already_scheduled": already_scheduled,
    }


def cancel_erasure(user_id: str) -> dict:
    """Allow the user to reverse a scheduled deletion within the grace period."""
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                UPDATE public.users
                SET account_status = 'active',
                    deletion_requested_at = NULL,
                    hard_delete_due_at = NULL
                WHERE id = :uid
                """
            ),
            {"uid": user_id},
        )
    return {"status": "erasure_cancelled", "message": "Account deletion request has been cancelled."}


# ── Nightly retention purge ───────────────────────────────────────────────────

def _tables_with_column(conn, column: str, candidates: list[str]) -> list[str]:
    """Return only the candidate tables that actually have ``column``."""
    if not candidates:
        return []
    rows = conn.execute(
        text(
            """
            SELECT table_name FROM information_schema.columns
            WHERE table_schema = 'public'
              AND column_name = :col
              AND table_name = ANY(:cands)
            """
        ),
        {"col": column, "cands": candidates},
    ).fetchall()
    return [r[0] for r in rows]


def prune_deletion_queue(dry_run: bool = False) -> dict:
    """Hard-delete every account whose grace period has lapsed.

    Runs inside a single transaction so a mid-way failure rolls back cleanly.
    Deletes child rows first (resume_id tables, then user_id tables), then the
    app profile, then the Supabase auth record. Table lists are reconciled
    against the live schema so a renamed/missing column never aborts the run.
    """
    now = datetime.now(timezone.utc)
    with engine.connect() as conn:
        rows = conn.execute(
            text(
                """
                SELECT id FROM public.users
                WHERE account_status = 'deletion_requested'
                  AND hard_delete_due_at IS NOT NULL
                  AND hard_delete_due_at <= :now
                """
            ),
            {"now": now},
        ).fetchall()

    user_ids = [str(r[0]) for r in rows]
    logger.info("PURGE_QUEUE | due=%d users", len(user_ids))
    if not user_ids:
        return {"status": "ok", "purged": 0, "failed": []}

    if dry_run:
        return {"status": "dry_run", "due_user_ids": user_ids}

    failed = []
    purged = 0
    with engine.begin() as conn:
        user_tables = _tables_with_column(conn, "user_id", USER_SCOPED_TABLES)
        resume_tables = _tables_with_column(conn, "resume_id", RESUME_ID_TABLES)
        for uid in user_ids:
            try:
                # 1. resume_id-keyed children (need resumes first)
                resume_ids = [
                    str(r[0])
                    for r in conn.execute(
                        text("SELECT id FROM resumes WHERE user_id = :uid"), {"uid": uid}
                    ).fetchall()
                ]
                if resume_ids:
                    for table in resume_tables:
                        conn.execute(
                            text(f"DELETE FROM {table} WHERE resume_id::text = ANY(:rids)"),
                            {"rids": resume_ids},
                        )

                # 2. resumes + direct user_id tables
                conn.execute(text("DELETE FROM resumes WHERE user_id = :uid"), {"uid": uid})
                for table in user_tables:
                    conn.execute(text(f"DELETE FROM {table} WHERE user_id = :uid"), {"uid": uid})

                # 3. app profile + Supabase auth record
                conn.execute(text("DELETE FROM public.users WHERE id = :uid"), {"uid": uid})
                conn.execute(text("DELETE FROM auth.users WHERE id = :uid"), {"uid": uid})
                purged += 1
            except Exception as exc:
                logger.exception("PURGE_FAILED | user=%s error=%s", uid, exc)
                failed.append({"user_id": uid, "error": str(exc)})

    logger.info("PURGE_DONE | purged=%d failed=%d", purged, len(failed))
    return {"status": "ok", "purged": purged, "failed": failed}
