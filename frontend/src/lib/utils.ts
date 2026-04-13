import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface JobPortalLinks {
  linkedin: string;
  naukri: string;
  indeed: string;
  instahyre: string;
  hirist: string;
  internshala: string;
}

export function generateJobLinks(role: string, skills: string[]): JobPortalLinks {
  const query = encodeURIComponent(`${role} ${skills.slice(0, 3).join(" ")}`);
  const location = "India";
  
  return {
    linkedin: `https://www.linkedin.com/jobs/search/?keywords=${query}&location=${location}`,
    naukri: `https://www.naukri.com/${role.toLowerCase().replace(/\s+/g, "-")}-jobs-in-india?k=${query}`,
    indeed: `https://in.indeed.com/jobs?q=${query}&l=${location}`,
    instahyre: `https://www.instahyre.com/search-jobs/?q=${query}`,
    hirist: `https://www.hirist.com/search/${query.replace(/%20/g, "-")}.html`,
    internshala: `https://internshala.com/internships/keywords-${query}`
  };
}

export function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}
