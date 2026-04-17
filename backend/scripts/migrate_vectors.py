import os
import json
import logging
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("migration.vectors")

def migrate():
    # Load env vars
    load_dotenv('backend/.env')
    
    SUPABASE_URL = os.getenv("DATABASE_URL") # Currently Supabase
    # We will need the GCP Cloud SQL URL as well.
    # In CI/CD this would be passed as an env var.
    GCP_DATABASE_URL = os.getenv("GCP_DATABASE_URL")
    
    if not SUPABASE_URL or not GCP_DATABASE_URL:
        logger.error("Missing SUPABASE_URL or GCP_DATABASE_URL")
        return

    src_engine = create_engine(SUPABASE_URL)
    dst_engine = create_engine(GCP_DATABASE_URL)

    table_name = "job_postings"
    
    logger.info(f"Starting migration for {table_name}...")

    try:
        with src_engine.connect() as src_conn:
            # 1. Fetch all records from Supabase
            result = src_conn.execute(text(f"SELECT * FROM {table_name}"))
            rows = [dict(row._asdict()) for row in result]
            
            if not rows:
                logger.info("No rows found to migrate.")
                return

            logger.info(f"Fetched {len(rows)} rows from Supabase.")

            with dst_engine.begin() as dst_conn:
                # 2. Clear destination table (optional - for staging re-seed)
                dst_conn.execute(text(f"TRUNCATE TABLE {table_name} RESTART IDENTITY CASCADE"))
                
                # 3. Insert into GCP
                for row in rows:
                    # Convert embedding list/string to standard PG format if needed
                    # sqlalchemy usually handles it if the driver supports pgvector
                    
                    columns = row.keys()
                    placeholders = ", ".join([f":{col}" for col in columns])
                    sql = f"INSERT INTO {table_name} ({', '.join(columns)}) VALUES ({placeholders})"
                    
                    dst_conn.execute(text(sql), row)
                
                logger.info("✅ Migration completed successfully.")

    except Exception as e:
        logger.error(f"❌ Migration failed: {e}")

if __name__ == "__main__":
    migrate()
