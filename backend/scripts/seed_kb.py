import asyncio
import logging
import os
import sys

# Add the parent directory to sys.path so we can import 'app'
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

from app.services.knowledge_base_seeder import job_seeder

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("manual-seeder")

async def main():
    logger.info("Starting manual Knowledge Base seeding...")
    await job_seeder.seed_domain_knowledge()
    logger.info("Manual seeding complete.")

if __name__ == "__main__":
    asyncio.run(main())
