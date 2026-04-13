"use server";

import { processResumePipeline } from "@/lib/resume-pipeline";
import { db } from "@/db";
import { resumes } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function startResumeAnalysis(userId: string, resumeId: string, formData: FormData) {
  try {
    console.log(`[Resume Action] Starting analysis for User: ${userId}, Resume: ${resumeId}`);
    
    const file = formData.get('file') as File;
    if (!file) {
      console.error('[Resume Action] No file found in FormData');
      return { success: false, error: "No file provided" };
    }

    // PHASE 5 & 6: CALL FASTAPI BACKEND
    console.log('[Resume Action] Offloading to FastAPI backend for robust parsing...');
    const backendUrl = process.env.BACKEND_API_URL || 'http://localhost:8000';
    
    // Create new FormData for FastAPI
    const backendFormData = new FormData();
    backendFormData.append('file', file);

    const response = await fetch(`${backendUrl}/api/resume/process`, {
      method: 'POST',
      body: backendFormData,
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.detail || 'Backend processing failed');
    }

    const { data: backendData } = await response.json();
    console.log(`[Resume Action] Backend extracted ${backendData.raw_text.length} characters and parsed successfully.`);

    // Handle guest flow
    if (userId === 'guest' || resumeId === 'guest') {
      console.log('[Resume Action] Proceeding with guest pipeline');
      return await processResumePipeline('guest', 'guest', backendData);
    }

    // 1. Get Resume with retry logic for potential replication lag
    console.log('[Resume Action] Fetching resume record from database...');
    let resume = null;
    let attempts = 0;
    while (attempts < 3) {
      const [record] = await db.select().from(resumes).where(eq(resumes.id, resumeId));
      if (record) {
        resume = record;
        break;
      }
      console.warn(`[Resume Action] Record not found, attempt ${attempts + 1}/3. Waiting...`);
      await new Promise(resolve => setTimeout(resolve, 1000));
      attempts++;
    }
    
    if (!resume) {
      console.error('[Resume Action] Resume record not found in database after 3 attempts');
      return { success: false, error: "Resume record not found in database. Please try uploading again." };
    }

    console.log('[Resume Action] Record found. Triggering pipeline...');
    // 2. Run Pipeline (Passing extracted text to local pipeline for DB updates)
    const result = await processResumePipeline(userId, resumeId, backendData);
    console.log(`[Resume Action] Pipeline result: ${result.success ? 'Success' : 'Failure'}`);
    return result;
  } catch (error: any) {
    console.error('[Resume Action] Critical Action Error:', error);
    return { success: false, error: error.message || "An unexpected error occurred during processing" };
  }
};

/**
 * Persists the final data received from the streaming backend
 */
export async function completeResumeAnalysis(userId: string, resumeId: string, data: any) {
  try {
    console.log(`[Resume Action] Completing analysis for User: ${userId}, Resume: ${resumeId}`);
    return await processResumePipeline(userId, resumeId, data);
  } catch (error: any) {
    console.error('[Resume Action] Completion Error:', error);
    return { success: false, error: error.message };
  }
}
export async function tailorResume(userId: string, resumeId: string, preferences: any, parsedData: any) {
  try {
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_API_URL || 'http://localhost:8000';
    const response = await fetch(`${backendUrl}/api/resume/tailor`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resumeId, preferences, parsedData }),
    });

    if (!response.ok) throw new Error('Tailoring failed');
    const result = await response.json();

    if (result.success) {
      // Re-use processResumePipeline to save the tailored data
      await processResumePipeline(userId, resumeId, {
        raw_text: '', // Don't need to re-save text
        parsed_data: parsedData,
        analysis: result.data.analysis,
        matches: result.data.matches
      });
    }

    return { success: true };
  } catch (error: any) {
    console.error('Tailor Error:', error);
    return { success: false, error: error.message };
  }
}

