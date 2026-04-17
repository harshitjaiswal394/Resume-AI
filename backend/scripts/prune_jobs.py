import os
import logging
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("cleanup")

def prune_oldest_jobs():
    load_dotenv('backend/.env')
    SUPABASE_URL = os.getenv("DATABASE_URL")
    
    if not SUPABASE_URL:
        logger.error("DATABASE_URL not found in environment.")
        return

    engine = create_engine(SUPABASE_URL)
    
    logger.info("--- PRUNING OLDEST 70% OF JOB POSTINGS ---")
    
    try:
        with engine.begin() as conn:
            # Postgres supports DELETE with subqueries for NOT IN
            query = text("""
                DELETE FROM job_postings 
                WHERE id NOT IN (
                    SELECT id FROM job_postings 
                    ORDER BY posted_at DESC NULLS LAST
                    LIMIT (SELECT (count(*) * 0.3)::integer FROM job_postings)
                )
            """)
            result = conn.execute(query)
            logger.info(f"✅ SUCCESS: Deleted {result.rowcount} oldest job postings from Supabase.")
            
    except Exception as e:
        logger.error(f"❌ Cleanup failed: {e}")

if __name__ == "__main__":
    prune_oldest_jobs()
