"use server";

import { processResumePipeline } from "@/lib/resume-pipeline";
import { db } from "@/db";
import { resumes } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function startResumeAnalysis(userId: string, resumeId: string, formData: FormData, idToken: string) {
  try {
    const file = formData.get('file') as File;
    const backendUrl = process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_BACKEND_API_URL || 'http://localhost:8000';
    
    const backendFormData = new FormData();
    backendFormData.append('file', file);

    // Call backend with persistence parameters
    const response = await fetch(`${backendUrl}/api/resume/process?user_id=${userId}&resume_id=${resumeId}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${idToken}`
      },
      body: backendFormData,
    });

    if (!response.ok) throw new Error('Backend processing failed');
    return await response.json();
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function completeResumeAnalysis(userId: string, resumeId: string, data: any, idToken: string) {
  try {
    const backendUrl = process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_BACKEND_API_URL || 'http://localhost:8000';
    const response = await fetch(`${backendUrl}/api/resume/save-analysis`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`
      },
      body: JSON.stringify({ userId, resumeId, data }),
    });

    if (!response.ok) throw new Error('Persistence failed');
    return await response.json();
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function tailorResume(userId: string, resumeId: string, preferences: any, parsedData: any, idToken: string) {
  try {
    const backendUrl = process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_BACKEND_API_URL || 'http://localhost:8000';
    const response = await fetch(`${backendUrl}/api/resume/tailor`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`
      },
      body: JSON.stringify({ resumeId, userId, preferences, parsedData }),
    });

    if (!response.ok) throw new Error('Tailoring failed');
    return await response.json();
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}


