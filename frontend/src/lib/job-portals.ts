/**
 * PHASE 8: JOB PORTAL INTEGRATION
 * Generates dynamic apply links for Indian job portals
 */
export function generateJobLinks(role: string, skills: string[]) {
  const query = encodeURIComponent(`\${role} \${skills.slice(0, 3).join(" ")}`);
  const location = "India";
  
  return {
    naukri: `https://www.naukri.com/\${role.toLowerCase().replace(/ /g, "-")}-jobs-in-\${location.toLowerCase()}?k=\${query}`,
    linkedin: `https://www.linkedin.com/jobs/search/?keywords=\${query}&location=\${location}`,
    indeed: `https://in.indeed.com/jobs?q=\${query}&l=\${location}`,
    instahyre: `https://www.instahyre.com/search-jobs/?skills=\${skills[0] || role}`,
    hirist: `https://www.hirist.com/search/\${query}`,
    internshala: `https://internshala.com/jobs/matching-your-skills/\${skills[0] || role}`
  };
}
