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
        """
        Fetches the raw HTML content of a job posting URL.
        Uses Jina Reader API as primary (best for LLMs) and BS4 as fallback.
        """
        logger.info(f"Targeting JD URL: {url}")
        
        # 1. Try Jina Reader API (Zero-config Markdown extractor)
        jina_url = f"https://r.jina.ai/{url}"
        try:
            async with httpx.AsyncClient(headers=self.headers, follow_redirects=True, timeout=20.0) as client:
                logger.info(f"Primary fetch via Jina Reader: {jina_url}")
                response = await client.get(jina_url)
                
                if response.status_code == 200 and len(response.text) > 200:
                    # Jina returns clean markdown. 
                    # If it's too short, it likely failed or hit a landing page.
                    logger.info("Jina fetch successful.")
                    return response.text
                else:
                    logger.warning(f"Jina returned weak content (Status: {response.status_code}, Length: {len(response.text)})")
        except Exception as e:
            logger.error(f"Jina fetch failed: {str(e)}")

        # 2. Fallback to Native Scraper
        try:
            async with httpx.AsyncClient(headers=self.headers, follow_redirects=True, timeout=15.0) as client:
                logger.info("Falling back to native BS4 scraper...")
                response = await client.get(url)
                response.raise_for_status()
                
                soup = BeautifulSoup(response.text, 'html.parser')
                
                # Remove noise
                for script in soup(["script", "style", "nav", "footer", "header"]):
                    script.decompose()
                
                text = soup.get_text(separator=' ')
                lines = (line.strip() for line in text.splitlines())
                chunks = (phrase.strip() for line in lines for phrase in line.split("  "))
                clean_text = ' '.join(chunk for chunk in chunks if chunk)
                
                if len(clean_text) < 100:
                    logger.warning("Scraped text too short, likely blocked.")
                    return None
                    
                return clean_text
        except Exception as e:
            logger.error(f"Native scraper failed for {url}: {str(e)}")
            return None

scraper_service = ScraperService()
