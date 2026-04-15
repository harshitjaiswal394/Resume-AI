import httpx
import logging
from bs4 import BeautifulSoup
from typing import Optional, Dict, Any

logger = logging.getLogger("resumatch-api.scraper")

class ScraperService:
    def __init__(self):
        self.headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
        }

    async def fetch_job_content(self, url: str) -> Optional[str]:
        """Fetches the raw HTML content of a job posting URL."""
        logger.info(f"Scraping job URL: {url}")
        try:
            async with httpx.AsyncClient(headers=self.headers, follow_redirects=True, timeout=15.0) as client:
                response = await client.get(url)
                response.raise_for_status()
                
                # Parse with BeautifulSoup to get clean text
                soup = BeautifulSoup(response.text, 'html.parser')
                
                # Remove script and style elements
                for script in soup(["script", "style"]):
                    script.decompose()
                
                # Get text and clean it
                text = soup.get_text(separator=' ')
                lines = (line.strip() for line in text.splitlines())
                chunks = (phrase.strip() for line in lines for phrase in line.split("  "))
                clean_text = ' '.join(chunk for chunk in chunks if chunk)
                
                return clean_text
        except Exception as e:
            logger.error(f"Failed to scrape URL {url}: {str(e)}")
            return None

scraper_service = ScraperService()
