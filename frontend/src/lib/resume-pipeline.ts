import { db } from "@/db";
import { resumes, jobMatches, auditLogs } from "@/db/schema";
import { 
  parseResumeWithAI, 
  analyzeResumeWithAI, 
  generateJobMatchesWithAI, 
  generateEmbedding 
} from "./ai-server";
import { generateJobLinks } from "./job-portals";
import { eq } from "drizzle-orm";

/**
 * PHASE 5 & 6: SERVER-SIDE PIPELINE (DATA PERSISTENCE)
 * Saves the results from the FastAPI backend into the local database.
 */
export async function processResumePipeline(
  userId: string, 
  resumeId: string, 
  data: {
    raw_text: string;
    parsed_data: any;
    analysis: any;
    matches: any[];
  }
) {
  const { raw_text, parsed_data, analysis, matches } = data;
  try {
    // Pipeline logic for database updates
    
    // 4. Update Resume in DB
    if (resumeId !== 'guest') {
      await db.update(resumes)
        .set({
          status: 'complete',
          parsedData: parsed_data,
          resumeScore: analysis.score || 0,
          scoreBreakdown: analysis.insights || {},
          rawText: raw_text,
          updatedAt: new Date()
        })
        .where(eq(resumes.id, resumeId));

      // 5. Save Job Matches (Optimized: Batch Insert)
      if (matches && matches.length > 0) {
        const matchesToInsert = matches.map(match => {
          const role = match.title || match.role || 'Career Match';
          const applyLinks = generateJobLinks(role, parsed_data.skills);
          
          return {
            resumeId: resumeId,
            userId: userId,
            jobTitle: role,
            company: match.company || 'Direct Opportunity',
            matchScore: match.matchScore || match.score || 0,
            matchingSkills: match.matchingSkills || [],
            missingSkills: match.missingSkills || [],
            salaryMin: typeof match.salaryEstimate === 'string' 
              ? parseInt(match.salaryEstimate.replace(/[^0-9]/g, '')) 
              : (match.salaryEstimate || 0),
            aiReasoning: match.reasoning || 'Highly compatible with your professional background.',
            applyLinks: applyLinks,
          };
        });
        
        // Clear old matches before inserting new ones (crucial for tailoring)
        await db.delete(jobMatches).where(eq(jobMatches.resumeId, resumeId));
        await db.insert(jobMatches).values(matchesToInsert);
      }

      // 6. Audit Log
      await db.insert(auditLogs).values({
        userId: userId,
        action: 'resume_analysis',
        metadata: { score: analysis.score }
      });
    }

    return {
      success: true,
      data: {
        parsedData: parsed_data,
        analysis,
        matches
      }
    };
  } catch (error: any) {
    console.error('Pipeline Error:', error);
    
    if (resumeId !== 'guest') {
      await db.update(resumes)
        .set({ status: 'failed', updated_at: new Date() })
        .where(eq(resumes.id, resumeId));
    }
    
    return {
      success: false,
      error: error.message
    };
  }
}
