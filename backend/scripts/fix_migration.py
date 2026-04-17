import os
import logging
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("migration.fix")

def migrate_table(table_name):
    load_dotenv('backend/.env')
    SUPABASE_URL = os.getenv("DATABASE_URL")
    GCP_DATABASE_URL = os.getenv("GCP_DATABASE_URL")
    
    src_engine = create_engine(SUPABASE_URL)
    dst_engine = create_engine(GCP_DATABASE_URL)
    
    logger.info(f"--- FIXING MIGRATION FOR: {table_name} ---")
    
    try:
        with src_engine.connect() as src_conn:
            result = src_conn.execute(text(f"SELECT * FROM {table_name}"))
            rows = [dict(row._asdict()) for row in result]
            
        if not rows:
            logger.info(f"No rows found in {table_name}.")
            return

        total_rows = len(rows)
        batch_size = 25
        
        # Clear destination
        with dst_engine.begin() as dst_conn:
            dst_conn.execute(text(f"TRUNCATE TABLE {table_name} RESTART IDENTITY CASCADE"))
            
        # Migrate in batches
        for i in range(0, total_rows, batch_size):
            batch = rows[i:i + batch_size]
            try:
                with dst_engine.begin() as dst_conn:
                    columns = batch[0].keys()
                    placeholders = ", ".join([f":{col}" for col in columns])
                    sql = f"INSERT INTO {table_name} ({', '.join(columns)}) VALUES ({placeholders})"
                    dst_conn.execute(text(sql), batch)
                logger.info(f"  [{table_name}] Progress: {i + len(batch)}/{total_rows}")
            except Exception as e:
                logger.error(f"  ❌ Batch {i} FAILED: {e}")
                # Try inserting row-by-row for this batch to find the culprit
                for row in batch:
                    try:
                        with dst_engine.begin() as row_conn:
                            columns = row.keys()
                            placeholders = ", ".join([f":{col}" for col in columns])
                            sql = f"INSERT INTO {table_name} ({', '.join(columns)}) VALUES ({placeholders})"
                            row_conn.execute(text(sql), row)
                    except Exception as row_e:
                        logger.error(f"    CRITICAL ROW ERROR for ID {row.get('id')}: {row_e}")
                        raise e # Re-raise to stop migration for analysis
            
        logger.info(f"✅ {table_name} Migration Fixed!")

    except Exception as e:
        logger.error(f"❌ Failed to fix {table_name}: {e}")

if __name__ == "__main__":
    migrate_table("job_postings")
    migrate_table("audit_logs")
