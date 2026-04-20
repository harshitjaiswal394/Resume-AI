# ResuMatch Database Migration: Supabase → Cloud SQL

This guide provides a step-by-step process to migrate your production database from Supabase to a managed Google Cloud SQL (PostgreSQL) instance.

## Prerequisites
1.  **GCP Project**: A project with Cloud SQL API enabled.
2.  **Cloud SQL Instance**: A PostgreSQL 15+ instance.
3.  **Local Tools**: `psql` and `pg_dump` installed on your machine.
4.  **Connectivity**: Your local IP must be authorized in the Cloud SQL instance, or you must use the [Cloud SQL Auth Proxy](https://cloud.google.com/sql/docs/postgres/sql-proxy).

---

## Step 1: Export Data from Supabase

Run the following command to export your existing data. We will skip the `extensions` schema to avoid permission conflicts on Cloud SQL.

```bash
# Export only the 'public', 'auth', and 'storage' schemas
pg_dump -h db.fukxrsqmulucvfvowcou.supabase.co \
        -U postgres \
        -p 5432 \
        --no-owner --no-acl \
        --schema=public --schema=auth --schema=storage \
        postgres > supabase_dump.sql
```

## Step 2: Prepare Cloud SQL Instance

Use the master migration script provided in this repository to set up the necessary schemas, extensions, and tables.

```bash
# Apply the migration script
psql -h [CLOUD_SQL_IP] -U postgres -d [DATABASE_NAME] -f scripts/migrate_supabase_to_cloudsql.sql
```

> [!IMPORTANT]
> **pgvector**: If Cloud SQL throws an error about the `vector` extension, ensure you are using PostgreSQL 15+ and that you have enabled the extension in the Google Cloud Console (under the "Flags" section).

## Step 3: Import Data

Import your data dump from Step 1 into the newly prepared schema.

```bash
psql -h [CLOUD_SQL_IP] -U postgres -d [DATABASE_NAME] -f supabase_dump.sql
```

## Step 4: Update Application Configuration

Update your environment variables in Google Cloud Run (and GitHub Secrets) to point to the new database.

1.  **GCP_DATABASE_URL**: `postgresql://postgres:[PASSWORD]@[CLOUD_SQL_IP]:5432/[DB_NAME]`
2.  **DATABASE_URL**: (Same as above)

## Step 5: Verify Migration

Check if the vector search is working by running a manual query:

```sql
SELECT title, company 
FROM job_postings 
ORDER BY embedding <=> '[0.1, 0.2, ... 2048 dimensions]' 
LIMIT 5;
```

---

## Troubleshooting

### "Role 'authenticated' already exists"
If you get errors about roles already existing, you can safely ignore them as the migration script uses `IF NOT EXISTS`.

### Vector Dimension Mismatch
If you get an error like `vector dimension mismatch 1536 vs 2048`, ensure you are using the NVIDIA NIM model for all embeddings. The current script is tuned for **2048** dimensions.
