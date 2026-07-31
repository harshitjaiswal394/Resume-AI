import json
import logging
import re
from html import unescape
from typing import Any, Iterable, Optional
from urllib.parse import parse_qs, urlencode, urlparse, urlunparse

import httpx
from bs4 import BeautifulSoup
from bs4 import MarkupResemblesLocatorWarning
import warnings

logger = logging.getLogger("resumatch-api.scraper")

warnings.filterwarnings("ignore", category=MarkupResemblesLocatorWarning)


class ScraperService:
    def __init__(self):
        self.headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/126.0.0.0 Safari/537.36"
            ),
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
            "Cache-Control": "no-cache",
            "Pragma": "no-cache",
        }

    async def fetch_job_content(self, url: str) -> Optional[str]:
        result = await self.fetch_job_content_diagnostics(url)
        return result.get("content")

    async def fetch_job_content_diagnostics(self, url: str) -> dict[str, Any]:
        normalized_url = self._normalize_url(url)
        diagnostics: dict[str, Any] = {
            "url": url,
            "normalized_url": normalized_url,
            "jina": {"attempted": True, "status_code": None, "content_length": 0, "accepted": False},
            "native": {"attempted": False, "status_code": None, "content_length": 0},
            "structured": {"length": 0, "accepted": False},
            "visible": {"length": 0, "accepted": False},
            "final_stage": None,
            "blocked_detected": False,
        }

        logger.info(f"Targeting JD URL: {normalized_url}")

        jina_result = await self._fetch_via_jina(normalized_url)
        diagnostics["jina"].update(
            {
                "status_code": jina_result["status_code"],
                "content_length": len(jina_result["content"] or ""),
                "accepted": jina_result["accepted"],
            }
        )
        if jina_result["accepted"]:
            diagnostics["final_stage"] = "jina"
            logger.info(f"JD fetch succeeded via diagnostics path: {json.dumps(diagnostics)}")
            return {"content": jina_result["content"], "diagnostics": diagnostics}

        html_result = await self._fetch_html(normalized_url)
        diagnostics["native"].update(
            {
                "attempted": True,
                "status_code": html_result["status_code"],
                "content_length": len(html_result["html"] or ""),
            }
        )
        html = html_result["html"]
        if not html:
            diagnostics["final_stage"] = "none"
            logger.warning(f"JD fetch failed before extraction: {json.dumps(diagnostics)}")
            return {"content": None, "diagnostics": diagnostics}

        structured_content = self._extract_structured_job_content(html, normalized_url)
        diagnostics["structured"]["length"] = len(structured_content or "")
        diagnostics["blocked_detected"] = diagnostics["blocked_detected"] or self._is_probably_block_page(structured_content or "", normalized_url)
        if self._looks_like_valid_job_text(structured_content):
            diagnostics["structured"]["accepted"] = True
            diagnostics["final_stage"] = "structured"
            logger.info(f"JD fetch succeeded via diagnostics path: {json.dumps(diagnostics)}")
            return {"content": structured_content, "diagnostics": diagnostics}

        visible_text = self._extract_visible_text(html)
        diagnostics["visible"]["length"] = len(visible_text or "")
        diagnostics["blocked_detected"] = diagnostics["blocked_detected"] or self._is_probably_block_page(visible_text or "", normalized_url)
        if self._looks_like_valid_job_text(visible_text):
            diagnostics["visible"]["accepted"] = True
            diagnostics["final_stage"] = "visible"
            logger.info(f"JD fetch succeeded via diagnostics path: {json.dumps(diagnostics)}")
            return {"content": visible_text, "diagnostics": diagnostics}

        diagnostics["final_stage"] = "none"
        logger.warning(f"All scraper strategies returned weak or blocked content: {json.dumps(diagnostics)}")
        return {"content": None, "diagnostics": diagnostics}

    def _normalize_url(self, raw_url: str) -> str:
        parsed = urlparse(raw_url.strip())
        fragment = parsed.fragment or ""
        query = parse_qs(parsed.query, keep_blank_values=True)
        hostname = (parsed.hostname or "").lower()

        is_linkedin_host = hostname == "linkedin.com" or hostname.endswith(".linkedin.com")
        if is_linkedin_host and query.get("currentJobId"):
            job_id = query["currentJobId"][0]
            normalized = f"{parsed.scheme or 'https'}://www.linkedin.com/jobs/view/{job_id}/"
            logger.info(f"Normalized LinkedIn collection URL to public job URL: {normalized}")
            return normalized

        if fragment.startswith("/job/"):
            job_id = fragment.split("/job/", 1)[1].strip("/")
            query.setdefault("job", [job_id])
            logger.info(f"Detected client-side job fragment route: {fragment} -> job={job_id}")

        cleaned_query = urlencode(query, doseq=True)
        normalized = urlunparse((parsed.scheme or "https", parsed.netloc, parsed.path, parsed.params, cleaned_query, ""))
        return normalized

    async def _fetch_via_jina(self, url: str) -> dict[str, Any]:
        jina_url = f"https://r.jina.ai/{url}"
        result = {"status_code": None, "content": None, "accepted": False}
        try:
            async with httpx.AsyncClient(headers=self.headers, follow_redirects=True, timeout=20.0) as client:
                logger.info(f"Primary fetch via Jina Reader: {jina_url}")
                response = await client.get(jina_url)
                text = response.text or ""
                result["status_code"] = response.status_code
                result["content"] = text
                result["accepted"] = response.status_code == 200 and self._looks_like_valid_job_text(text)
                if result["accepted"]:
                    logger.info("Jina fetch successful.")
                else:
                    logger.warning(f"Jina returned weak content (Status: {response.status_code}, Length: {len(text)})")
        except Exception as e:
            logger.error(f"Jina fetch failed: {str(e)}")
        return result

    async def _fetch_html(self, url: str) -> dict[str, Any]:
        result = {"status_code": None, "html": None}
        try:
            async with httpx.AsyncClient(headers=self.headers, follow_redirects=True, timeout=20.0) as client:
                logger.info("Falling back to native HTML fetch...")
                response = await client.get(url)
                result["status_code"] = response.status_code
                response.raise_for_status()
                result["html"] = response.text
        except Exception as e:
            logger.error(f"Native scraper failed for {url}: {str(e)}")
        return result

    def _extract_structured_job_content(self, html: str, url: str) -> str:
        soup = BeautifulSoup(html, "html.parser")
        parts: list[str] = []
        title = soup.title.get_text(" ", strip=True) if soup.title else ""
        if title:
            parts.append(title)
        meta_description = self._get_meta_content(soup, "description")
        if meta_description:
            parts.append(meta_description)
        og_description = self._get_meta_content(soup, "og:description", attr="property")
        if og_description and og_description != meta_description:
            parts.append(og_description)
        json_ld_text = self._extract_jobposting_json_ld(soup)
        if json_ld_text:
            parts.append(json_ld_text)
        script_json_text = self._extract_job_json_from_scripts(soup)
        if script_json_text:
            parts.append(script_json_text)
        body_text = self._extract_priority_sections(soup)
        if body_text:
            parts.append(body_text)
        combined = self._clean_text("\n\n".join(part for part in parts if part))
        if self._is_probably_block_page(combined, url) and len(combined) < 250:
            logger.warning("Structured extraction resolved to a blocked/login page.")
            return ""
        return combined

    def _extract_visible_text(self, html: str) -> str:
        soup = BeautifulSoup(html, "html.parser")
        for tag in soup(["script", "style", "nav", "footer", "header", "noscript", "svg"]):
            tag.decompose()
        main = soup.find("main") or soup.find("article") or soup.body or soup
        text = main.get_text(separator=" ")
        clean_text = self._clean_text(text)
        if self._is_probably_block_page(clean_text, "") and len(clean_text) < 250:
            logger.warning("Scraped text looks like a blocked/login page.")
            return ""
        return clean_text

    def _extract_priority_sections(self, soup: BeautifulSoup) -> str:
        selectors = ["[data-automation-id='jobPostingDescription']", "[data-automation-id='jobPostingHeader']", "[data-qa='job-description']", "[data-testid='job-description']", ".job-description", ".jobDescriptionText", ".jobs-description", ".section-wrapper", "main", "article"]
        parts: list[str] = []
        seen: set[str] = set()
        for selector in selectors:
            for node in soup.select(selector):
                text = self._clean_text(node.get_text(separator=" "))
                if len(text) < 80 or text in seen:
                    continue
                seen.add(text)
                parts.append(text)
        return "\n\n".join(parts[:6])

    def _extract_jobposting_json_ld(self, soup: BeautifulSoup) -> str:
        parts: list[str] = []
        for script in soup.find_all("script", attrs={"type": "application/ld+json"}):
            raw = (script.string or script.get_text() or "").strip()
            if not raw:
                continue
            try:
                payload = json.loads(raw)
            except Exception:
                continue
            for item in self._iter_json_nodes(payload):
                if not isinstance(item, dict):
                    continue
                item_type = str(item.get("@type", "")).lower()
                if "jobposting" not in item_type:
                    continue
                title = self._value_to_text(item.get("title") or "")
                description = self._value_to_text(item.get("description") or "")
                qualifications = self._value_to_text(item.get("qualifications") or "")
                responsibilities = self._value_to_text(item.get("responsibilities") or "")
                skills = self._value_to_text(item.get("skills") or "")
                hiring_org = item.get("hiringOrganization") or {}
                company = self._value_to_text(hiring_org.get("name") if isinstance(hiring_org, dict) else "")
                location = self._extract_location(item.get("jobLocation"))
                content = self._clean_text("\n".join([title, company, location, description, responsibilities, qualifications, skills]))
                if content:
                    parts.append(content)
        return "\n\n".join(parts)

    def _extract_job_json_from_scripts(self, soup: BeautifulSoup) -> str:
        interesting_keys = {"description", "jobdescription", "posteddescription", "qualifications", "responsibilities", "requirements", "title", "jobtitle", "company", "location"}
        matches: list[str] = []
        regex_parts: list[str] = []
        pattern = re.compile(r'"(description|jobDescription|postedDescription|qualifications|responsibilities|requirements)"\s*:\s*"((?:\\.|[^"\\]){120,})"', re.IGNORECASE)

        for script in soup.find_all("script"):
            raw = (script.string or script.get_text() or "").strip()
            if len(raw) < 50:
                continue
            if not any(token in raw.lower() for token in ("job", "description", "workday", "greenhouse", "lever", "recruitment")):
                continue
            snippets = re.findall(r"\{.*?\}", raw, flags=re.DOTALL)
            for snippet in snippets[:100]:
                try:
                    payload = json.loads(snippet)
                except Exception:
                    continue
                for node in self._iter_json_nodes(payload):
                    if not isinstance(node, dict):
                        continue
                    node_keys = {str(key).lower() for key in node.keys()}
                    if not node_keys.intersection(interesting_keys):
                        continue
                    candidate_parts = []
                    for key in interesting_keys:
                        value = node.get(key) or node.get(key.title())
                        text_value = self._value_to_text(value)
                        if text_value:
                            candidate_parts.append(text_value)
                    combined = self._clean_text(" ".join(candidate_parts))
                    if len(combined) >= 150:
                        matches.append(combined)
            for match in pattern.finditer(raw):
                value = match.group(2)
                try:
                    decoded = json.loads(f'"{value}"')
                except Exception:
                    decoded = value.encode("utf-8").decode("unicode_escape", errors="ignore")
                cleaned = self._value_to_text(decoded)
                if len(cleaned) >= 150:
                    regex_parts.append(cleaned)
        return "\n\n".join((matches + regex_parts)[:8])

    def _iter_json_nodes(self, payload: Any) -> Iterable[Any]:
        stack = [payload]
        while stack:
            current = stack.pop()
            yield current
            if isinstance(current, dict):
                stack.extend(current.values())
            elif isinstance(current, list):
                stack.extend(current)

    def _extract_location(self, payload: Any) -> str:
        if isinstance(payload, dict):
            address = payload.get("address")
            if isinstance(address, dict):
                return self._clean_text(" ".join(str(address.get(part, "")) for part in ("addressLocality", "addressRegion", "addressCountry")))
        if isinstance(payload, list):
            return " ".join(self._extract_location(item) for item in payload if item)
        return self._value_to_text(payload)

    def _get_meta_content(self, soup: BeautifulSoup, name: str, attr: str = "name") -> str:
        tag = soup.find("meta", attrs={attr: name})
        if not tag:
            return ""
        return self._clean_text(tag.get("content", ""))

    def _value_to_text(self, value: Any) -> str:
        if value is None:
            return ""
        if isinstance(value, str):
            return self._html_to_text(value)
        if isinstance(value, (int, float, bool)):
            return str(value)
        if isinstance(value, list):
            return self._clean_text(" ".join(self._value_to_text(item) for item in value if item is not None))
        if isinstance(value, dict):
            priority_keys = ("text", "name", "title", "value", "description", "label")
            collected = [self._value_to_text(value.get(key)) for key in priority_keys if key in value]
            if any(collected):
                return self._clean_text(" ".join(part for part in collected if part))
            return self._clean_text(" ".join(self._value_to_text(item) for item in value.values() if item is not None))
        return self._html_to_text(str(value))

    def _html_to_text(self, value: str) -> str:
        if not value:
            return ""
        value = unescape(value)
        soup = BeautifulSoup(value, "html.parser")
        return self._clean_text(soup.get_text(separator=" "))

    def _clean_text(self, text: str) -> str:
        text = text.replace("\xa0", " ")
        text = re.sub(r"\s+", " ", text)
        return text.strip()

    def _is_probably_block_page(self, text: str, url: str) -> bool:
        lowered = text.lower()
        if any(marker in lowered for marker in ("captcha", "access denied", "forbidden", "security verification", "are you a robot", "cloudflare")):
            return True
        if "linkedin.com" in url.lower() and (("sign in" in lowered) or ("join linkedin" in lowered)):
            return True
        if ("sign in" in lowered or "log in" in lowered or "login" in lowered) and len(lowered) < 250:
            return True
        return False

    def _looks_like_valid_job_text(self, text: Optional[str]) -> bool:
        if not text:
            return False
        cleaned = self._clean_text(text)
        if len(cleaned) < 180:
            return False
        if self._is_probably_block_page(cleaned, "") and len(cleaned) < 250:
            return False
        job_markers = ["responsibilities", "requirements", "qualifications", "job description", "about the role", "what you will do", "skills", "experience"]
        return sum(1 for marker in job_markers if marker in cleaned.lower()) >= 1


scraper_service = ScraperService()
