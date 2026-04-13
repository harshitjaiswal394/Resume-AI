import { NextRequest, NextResponse } from 'next/server';
import { 
  parseResumeWithAI, 
  analyzeResumeWithAI, 
  generateJobMatchesWithAI, 
  generateCoverLetterWithAI, 
  rewriteBulletPointWithAI 
} from '@/lib/ai-server';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const resolvedParams = await params;
  const path = resolvedParams.path.join('/');
  const body = await req.json();

  try {
    switch (path) {
      case 'parse':
        const parsed = await parseResumeWithAI(body.text);
        return NextResponse.json(parsed);
      case 'analyze':
        const analysis = await analyzeResumeWithAI(body.resume);
        return NextResponse.json(analysis);
      case 'matches':
        const matches = await generateJobMatchesWithAI(body.resume, body.roles);
        return NextResponse.json(matches);
      case 'cover-letter':
        const coverLetter = await generateCoverLetterWithAI(body.resume, body.jobRole);
        return NextResponse.json({ content: coverLetter });
      case 'rewrite':
        const rewritten = await rewriteBulletPointWithAI(body.bullet, body.role);
        return NextResponse.json({ content: rewritten });
      default:
        return NextResponse.json({ error: 'Not Found' }, { status: 404 });
    }
  } catch (error: any) {
    console.error(`Error in API route ${path}:`, error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
