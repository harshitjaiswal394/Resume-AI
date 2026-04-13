import { GoogleGenAI } from "@google/genai";

const genAI = new GoogleGenAI({ apiKey: process.env.NEXT_PUBLIC_GEMINI_API_KEY || process.env.GEMINI_API_KEY || "" });

// Models
const FLASH_MODEL = "gemini-1.5-flash";
const PRO_MODEL = "gemini-1.5-pro";
const EMBEDDING_MODEL = "text-embedding-004";

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

/**
 * PHASE 6: AI PIPELINE
 * Multi-model strategy:
 * Parsing -> Gemini Flash
 */
export async function parseResumeWithAI(text: string): Promise<ParsedResume> {
  const prompt = `
    You are an expert resume parser for the Indian job market.
    Extract the following information from the resume text into a clean JSON format.
    Ensure skills are normalized.
    
    Resume Text:
    ${text}
    
    JSON Schema:
    {
      "name": "string",
      "contact": {
        "email": "string",
        "phone": "string",
        "location": "string",
        "linkedin": "string (optional)"
      },
      "summary": "string",
      "skills": ["string"],
      "experience": [
        {
          "title": "string",
          "company": "string",
          "duration": "string",
          "description": ["string"]
        }
      ],
      "education": [
        {
          "degree": "string",
          "institution": "string",
          "year": "string"
        }
      ]
    }
  `;

  const result = await genAI.models.generateContent({
    model: FLASH_MODEL,
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: { responseMimeType: "application/json" }
  });
  
  return JSON.parse(result.text);
}

/**
 * PHASE 6: AI PIPELINE
 * Analysis -> Gemini Flash
 */
export async function analyzeResumeWithAI(resume: ParsedResume) {
  const prompt = `
    Analyze this resume for the Indian job market (Naukri, LinkedIn, etc.).
    Provide a score (0-100) and detailed insights.
    
    Resume Data:
    ${JSON.stringify(resume)}
    
    JSON Schema:
    {
      "score": number,
      "atsScore": number,
      "insights": {
        "strengths": ["string"],
        "weaknesses": ["string"],
        "recommendations": ["string"],
        "missingKeywords": ["string"]
      },
      "suggestedRoles": ["string"]
    }
  `;

  const result = await genAI.models.generateContent({
    model: FLASH_MODEL,
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: { responseMimeType: "application/json" }
  });

  return JSON.parse(result.text);
}

/**
 * PHASE 6: AI PIPELINE
 * Matching -> Gemini Pro (for reasoning)
 */
export async function generateJobMatchesWithAI(resume: ParsedResume, roles: string[]) {
  const prompt = `
    Act as a senior recruiter in India.
    Match this resume against these suggested roles: ${roles.join(", ")}.
    Generate 5 realistic job matches.
    
    Resume Data:
    ${JSON.stringify(resume)}
    
    JSON Schema:
    [
      {
        "role": "string",
        "company": "string",
        "matchScore": number,
        "matchingSkills": ["string"],
        "missingSkills": ["string"],
        "salaryEstimate": "string (e.g. 15-20 LPA)",
        "reasoning": "string",
        "improvementSteps": ["string"]
      }
    ]
  `;

  const result = await genAI.models.generateContent({
    model: PRO_MODEL,
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: { responseMimeType: "application/json" }
  });

  return JSON.parse(result.text);
}

/**
 * PHASE 7: EMBEDDING
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const result = await genAI.models.embedContent({
    model: EMBEDDING_MODEL,
    contents: [{ role: "user", parts: [{ text }] }]
  });
  return result.embeddings[0].values;
}

export async function generateCoverLetterWithAI(resume: ParsedResume, jobRole: string) {
  const prompt = `
    Generate a professional and persuasive cover letter for the role of ${jobRole} based on this resume.
    Tailor it for the Indian job market.
    
    Resume:
    ${JSON.stringify(resume)}
  `;

  const result = await genAI.models.generateContent({
    model: FLASH_MODEL,
    contents: [{ role: "user", parts: [{ text: prompt }] }]
  });

  return result.text;
}

export async function rewriteBulletPointWithAI(bullet: string, role: string) {
  const prompt = `
    Rewrite this resume bullet point to be more impactful, quantified, and action-oriented for a ${role} role.
    Use the STAR method (Situation, Task, Action, Result).
    
    Bullet: ${bullet}
  `;

  const result = await genAI.models.generateContent({
    model: FLASH_MODEL,
    contents: [{ role: "user", parts: [{ text: prompt }] }]
  });

  return result.text;
}
