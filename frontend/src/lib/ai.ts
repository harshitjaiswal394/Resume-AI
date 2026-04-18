import { auth } from '@/lib/firebase';

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

const getBackendUrl = () => process.env.NEXT_PUBLIC_BACKEND_API_URL || 'http://localhost:8000';

async function authorizedFetch(path: string, options: RequestInit = {}) {
  const idToken = await auth.currentUser?.getIdToken();
  const headers = {
    ...options.headers,
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${idToken}`
  };
  
  const response = await fetch(`${getBackendUrl()}${path}`, {
    ...options,
    headers
  });
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `Request failed with status ${response.status}`);
  }
  
  return response.json();
}

export async function parseResume(text: string): Promise<ParsedResume> {
  return authorizedFetch('/api/resume/parse/', {
    method: 'POST',
    body: JSON.stringify({ text })
  });
}

export async function analyzeResume(resume: ParsedResume) {
  return authorizedFetch('/api/resume/analyze/', {
    method: 'POST',
    body: JSON.stringify({ resume })
  });
}

export async function generateJobMatches(resume: ParsedResume, roles: string[]) {
  return authorizedFetch('/api/resume/matches/', {
    method: 'POST',
    body: JSON.stringify({ resume, roles })
  });
}

export async function generateCoverLetter(resume: ParsedResume, jobRole: string) {
  const data = await authorizedFetch('/api/resume/cover-letter/', {
    method: 'POST',
    body: JSON.stringify({ resume, jobRole })
  });
  return data.content;
}

export async function rewriteBulletPoint(bullet: string, role: string) {
  const data = await authorizedFetch('/api/resume/optimize-experience/', {
    method: 'POST',
    body: JSON.stringify({ bullet, targetRole: role })
  });
  return data.optimized;
}
