import urllib.parse

class JobPortalService:
    @staticmethod
    def generate_links(role: str, skills: list[str], location: str = "India") -> dict:
        """
        Generate dynamic apply links for various Indian job portals.
        """
        # Sanitize inputs to prevent slicability errors
        # Sanitize inputs to prevent slicability errors (Critical Fix for slice(None, 5, None))
        if not isinstance(skills, list):
            skills = []
        
        # Ensure all elements are strings to prevent join errors
        safe_skills = [str(s) for s in skills if s]
            
        # Limit skills to prevent overly long search queries
        query_skills = safe_skills[:3]
        portal_skills = safe_skills[:5]
        
        query = f"{role} {' '.join(query_skills)} {location}"
        encoded_query = urllib.parse.quote(query)
        role_encoded = urllib.parse.quote(role)
        
        return {
            "naukri": f"https://www.naukri.com/{role_encoded.lower().replace('%20', '-')}-jobs-in-{location.lower()}?k={encoded_query}",
            "linkedin": f"https://www.linkedin.com/jobs/search/?keywords={encoded_query}&location={location}",
            "instahyre": f"https://www.instahyre.com/search-jobs?skills={urllib.parse.quote(','.join(portal_skills))}",
            "hirist": f"https://www.hirist.com/search/{role_encoded}",
            "internshala": f"https://internshala.com/jobs/keywords-{role_encoded}",
            "indeed": f"https://in.indeed.com/jobs?q={encoded_query}&l={location}"
        }

job_portal_service = JobPortalService()
