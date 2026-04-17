import os
import json
import logging
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("migration.full_sync")

def migrate_table(src_conn, dst_engine, table_name, batch_size=100):
    logger.info(f"Starting migration for {table_name}...")
    
    # 1. Fetch all records from source
    result = src_conn.execute(text(f"SELECT * FROM {table_name}"))
    rows = [dict(row._asdict()) for row in result]
    
    if not rows:
        logger.info(f"No rows found in {table_name}. Skipping.")
        return

    total_rows = len(rows)
    logger.info(f"Fetched {total_rows} rows from source table {table_name}.")

    # 2. Check current status
    with dst_engine.connect() as check_conn:
        current_count = check_conn.execute(text(f"SELECT count(*) FROM {table_name}")).scalar()
        if current_count >= total_rows and total_rows > 0:
            logger.info(f"✅ Table {table_name} already appears to be synced ({current_count} rows). Skipping.")
            return
        
        # 3. Clear only if needed
        if current_count > 0:
            with dst_engine.begin() as dst_conn:
                logger.info(f"Clearing destination table {table_name} (current: {current_count})...")
                dst_conn.execute(text(f"TRUNCATE TABLE {table_name} RESTART IDENTITY CASCADE"))
        else:
            logger.info(f"Target table {table_name} is already empty. Proceeding.")

    # 4. Batch Insert into GCP
    batch_size = 25
    success_count = 0
    for i in range(0, total_rows, batch_size):
        batch = rows[i:i + batch_size]
        logger.info(f"[{table_name}] Migrating batch {i//batch_size + 1}/{(total_rows-1)//batch_size + 1} ({len(batch)} rows)...")
        
        try:
            with dst_engine.begin() as dst_conn:
                if not batch: continue
                
                columns = batch[0].keys()
                placeholders = ", ".join([f":{col}" for col in columns])
                
                # Use schema-safe table name (assuming public if no dot)
                qualified_name = f"public.{table_name}" if "." not in table_name else table_name
                sql = f"INSERT INTO {qualified_name} ({', '.join(columns)}) VALUES ({placeholders})"
                
                dst_conn.execute(text(sql), batch)
                success_count += len(batch)
        except Exception as e:
            logger.error(f"❌ BATCH FAILED for {table_name}: {str(e)}")
            # Log the first row of the failing batch for debugging
            if batch:
                logger.debug(f"Sample row: {batch[0]}")
    
    logger.info(f"✅ Table {table_name} migration complete. Success: {success_count}/{total_rows}")

def full_sync():
    # Load env vars
    load_dotenv('backend/.env')
    
    SUPABASE_URL = os.getenv("DATABASE_URL")
    GCP_DATABASE_URL = os.getenv("GCP_DATABASE_URL")
    
    if not SUPABASE_URL or not GCP_DATABASE_URL:
        logger.error("Missing DATABASE_URL or GCP_DATABASE_URL")
        return

    src_engine = create_engine(SUPABASE_URL)
    dst_engine = create_engine(GCP_DATABASE_URL)

    # Tables in dependency order (Parents before Children)
    tables = [
        "auth.users",
        "storage.objects",
        "users",
        "resumes",
        "job_descriptions",
        "job_matches",
        "cover_letters",
        "subscriptions",
        "job_postings",
        "resume_embeddings",
        "audit_logs"
    ]

    try:
        with src_engine.connect() as src_conn:
            for table in tables:
                migrate_table(src_conn, dst_engine, table)
        
        logger.info("🏁 FULL DATABASE SYNC COMPLETED SUCCESSFULLY!")

    except Exception as e:
        logger.error(f"❌ Full sync failed: {e}")

if __name__ == "__main__":
    full_sync()
