export interface ParsedResume {
  name: string;
  contact: {
    email: string;
    phone: string;
    location: string;
    linkedin?: string;
  };
  summary: string;
  skills: string[];
  experience: {
    title: string;
    company: string;
    duration: string;
    description: string[];
  }[];
  education: {
    degree: string;
    institution: string;
    year: string;
  }[];
}

export async function parseResume(text: string): Promise<ParsedResume> {
  const response = await fetch('/api/resume/parse', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text })
  });
  if (!response.ok) throw new Error('Failed to parse resume');
  return response.json();
}

export async function analyzeResume(resume: ParsedResume) {
  const response = await fetch('/api/resume/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ resume })
  });
  if (!response.ok) throw new Error('Failed to analyze resume');
  return response.json();
}

export async function generateJobMatches(resume: ParsedResume, roles: string[]) {
  const response = await fetch('/api/resume/matches', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ resume, roles })
  });
  if (!response.ok) throw new Error('Failed to generate job matches');
  return response.json();
}

export async function generateCoverLetter(resume: ParsedResume, jobRole: string) {
  const response = await fetch('/api/resume/cover-letter', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ resume, jobRole })
  });
  if (!response.ok) throw new Error('Failed to generate cover letter');
  const data = await response.json();
  return data.content;
}

export async function rewriteBulletPoint(bullet: string, role: string) {
  const response = await fetch('/api/resume/rewrite', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bullet, role })
  });
  if (!response.ok) throw new Error('Failed to rewrite bullet point');
  const data = await response.json();
  return data.content;
}
