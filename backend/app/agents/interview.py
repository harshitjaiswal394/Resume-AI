"""
Interview Agent — stateful multi-turn mock interviews.

Runs as a Postgres-backed job table + polling.
Voice-ready: turn-taking API designed for future STT/TTS layer.
"""

from __future__ import annotations

import json
import logging
import time
import uuid
from typing import Any, Dict, List, Optional

from sqlalchemy import text

from app.db import engine
from app.services.ai_gateway import GatewayRequest, GatewayRouter
from app.agents.model_router import model_router

logger = logging.getLogger("resumatch-ai.agents.interview")


INTERVIEW_SYSTEM_PROMPT = """You are an expert technical interviewer conducting a mock interview.

RULES:
1. Ask one question at a time.
2. After the candidate answers, provide brief feedback (1-2 sentences) then ask the next question.
3. Tailor questions to the resume and job description provided.
4. Mix behavioral (STAR method) and technical questions.
5. Keep a professional, supportive tone.
6. After 5 questions, provide a summary score and improvement areas.

RESPONSE FORMAT:
- For asking a question: just the question text.
- For feedback + next question: "FEEDBACK: [feedback]\n\nNEXT: [question]"
- For final summary: "SUMMARY:\nScore: X/10\nStrengths: ...\nAreas to improve: ..." """


class InterviewAgent:
    """Stateful multi-turn mock interview agent."""

    def __init__(self, router: GatewayRouter):
        self._router = router

    async def start_interview(
        self,
        user_id: str,
        resume_data: Dict[str, Any],
        jd_data: Optional[Dict[str, Any]] = None,
        interview_type: str = "mixed",
        num_questions: int = 5,
    ) -> Dict[str, Any]:
        """
        Start a new mock interview session.

        Returns session_id + first question.
        """
        session_id = str(uuid.uuid4())

        # Create interview session in DB (additive)
        with engine.begin() as conn:
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS interview_sessions (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    interview_type TEXT DEFAULT 'mixed',
                    num_questions INTEGER DEFAULT 5,
                    current_question INTEGER DEFAULT 0,
                    status TEXT DEFAULT 'active',
                    resume_data JSONB,
                    jd_data JSONB,
                    transcript JSONB DEFAULT '[]',
                    scores JSONB DEFAULT '{}',
                    created_at TIMESTAMPTZ DEFAULT NOW(),
                    updated_at TIMESTAMPTZ DEFAULT NOW()
                )
            """))

            conn.execute(
                text("""
                    INSERT INTO interview_sessions (id, user_id, interview_type, num_questions, resume_data, jd_data, created_at, updated_at)
                    VALUES (:id, :uid, :it, :nq, :rd, :jd, NOW(), NOW())
                """),
                {
                    "id": session_id,
                    "uid": user_id,
                    "it": interview_type,
                    "nq": num_questions,
                    "rd": json.dumps(resume_data),
                    "jd": json.dumps(jd_data) if jd_data else None,
                },
            )

        # Generate first question
        first_q = await self._generate_question(
            resume_data=resume_data,
            jd_data=jd_data,
            question_number=1,
            interview_type=interview_type,
            transcript=[],
        )

        # Store first question
        self._append_transcript(session_id, "interviewer", first_q, 1)

        logger.info("INTERVIEW_STARTED | user=%s session=%s type=%s questions=%d", user_id, session_id, interview_type, num_questions)

        return {
            "status": "success",
            "session_id": session_id,
            "question_number": 1,
            "total_questions": num_questions,
            "question": first_q,
        }

    async def answer(
        self,
        session_id: str,
        answer_text: str,
    ) -> Dict[str, Any]:
        """
        Submit an answer and get the next question (or summary).

        Returns next question, feedback, or summary.
        """
        # Load session
        session = self._load_session(session_id)
        if not session:
            return {"status": "error", "message": "Session not found"}

        if session["status"] != "active":
            return {"status": "error", "message": "Interview is not active"}

        # Store answer
        next_q_num = session["current_question"] + 1
        self._append_transcript(session_id, "candidate", answer_text, next_q_num)

        # Check if interview is complete
        if next_q_num >= session["num_questions"]:
            # Generate summary
            summary = await self._generate_summary(session)
            self._update_session_status(session_id, "completed", summary)
            return {
                "status": "success",
                "completed": True,
                "summary": summary,
            }

        # Generate next question
        transcript = self._get_transcript(session_id)
        next_q = await self._generate_question(
            resume_data=session["resume_data"],
            jd_data=session.get("jd_data"),
            question_number=next_q_num + 1,
            interview_type=session["interview_type"],
            transcript=transcript,
        )

        self._append_transcript(session_id, "interviewer", next_q, next_q_num + 1)

        return {
            "status": "success",
            "completed": False,
            "question_number": next_q_num + 1,
            "total_questions": session["num_questions"],
            "question": next_q,
        }

    async def get_status(self, session_id: str) -> Dict[str, Any]:
        """Get current interview status."""
        session = self._load_session(session_id)
        if not session:
            return {"status": "error", "message": "Session not found"}
        return {
            "status": "success",
            "session_id": session_id,
            "current_question": session["current_question"],
            "total_questions": session["num_questions"],
            "interview_status": session["status"],
            "created_at": session.get("created_at"),
        }

    # ── Internal Methods ─────────────────────────────────────────────────────

    async def _generate_question(
        self,
        resume_data: Dict[str, Any],
        jd_data: Optional[Dict[str, Any]],
        question_number: int,
        interview_type: str,
        transcript: List[Dict[str, str]],
    ) -> str:
        """Generate the next interview question."""
        route = model_router.route("interview")

        context = f"Resume: {json.dumps(resume_data, indent=2)[:3000]}"
        if jd_data:
            context += f"\n\nJob Description: {json.dumps(jd_data, indent=2)[:2000]}"
        if transcript:
            context += f"\n\nPrevious Q&A:\n" + "\n".join(
                f"{'Q' if t['role'] == 'interviewer' else 'A'}: {t['content'][:200]}"
                for t in transcript[-6:]  # Last 3 exchanges
            )

        request = GatewayRequest(
            messages=[{"role": "user", "content": f"Generate question #{question_number}.\n\n{context}"}],
            system_instruction=INTERVIEW_SYSTEM_PROMPT,
            temperature=route.temperature,
            max_tokens=route.max_tokens,
        )

        response = await self._router.execute(request)
        return response.content.strip()

    async def _generate_summary(self, session: Dict[str, Any]) -> Dict[str, Any]:
        """Generate interview summary with scores."""
        route = model_router.route("interview")
        transcript = self._get_transcript(session["id"])

        system_prompt = """You are an interview evaluator. Based on the transcript, provide:
1. Overall score (1-10)
2. Strengths
3. Areas to improve
4. Specific feedback per question

Respond with JSON:
{
  "overall_score": 7.5,
  "strengths": ["..."],
  "areas_to_improve": ["..."],
  "question_feedback": [{"question": "...", "score": 8, "feedback": "..."}]
}"""

        request = GatewayRequest(
            messages=[{"role": "user", "content": f"Interview transcript:\n\n" + json.dumps(transcript, indent=2)[:6000]}],
            system_instruction=system_prompt,
            temperature=route.temperature,
            max_tokens=route.max_tokens,
        )

        response = await self._router.execute(request)
        try:
            content = response.content
            if "```json" in content:
                content = content.split("```json")[1].split("```")[0]
            elif "```" in content:
                content = content.split("```")[1].split("```")[0]
            return json.loads(content)
        except (json.JSONDecodeError, ValueError):
            return {"overall_score": 5.0, "strengths": [], "areas_to_improve": ["Could not parse summary"]}

    def _load_session(self, session_id: str) -> Optional[Dict[str, Any]]:
        """Load interview session from DB."""
        with engine.connect() as conn:
            row = conn.execute(
                text("SELECT * FROM interview_sessions WHERE id = :id"),
                {"id": session_id},
            ).fetchone()
        if not row:
            return None
        return {
            "id": row.id,
            "user_id": row.user_id,
            "interview_type": row.interview_type,
            "num_questions": row.num_questions,
            "current_question": row.current_question,
            "status": row.status,
            "resume_data": row.resume_data,
            "jd_data": row.jd_data,
            "created_at": row.created_at.isoformat() if row.created_at else None,
        }

    def _append_transcript(self, session_id: str, role: str, content: str, question_num: int) -> None:
        """Append to interview transcript."""
        with engine.connect() as conn:
            # Get current transcript
            row = conn.execute(
                text("SELECT transcript FROM interview_sessions WHERE id = :id"),
                {"id": session_id},
            ).fetchone()
            transcript = row.transcript if row and row.transcript else []
            transcript.append({"role": role, "content": content, "question_num": question_num})

            conn.execute(
                text("UPDATE interview_sessions SET transcript = :t, current_question = :cq, updated_at = NOW() WHERE id = :id"),
                {"id": session_id, "t": json.dumps(transcript), "cq": question_num},
            )
            conn.commit()

    def _get_transcript(self, session_id: str) -> List[Dict[str, str]]:
        """Get full interview transcript."""
        with engine.connect() as conn:
            row = conn.execute(
                text("SELECT transcript FROM interview_sessions WHERE id = :id"),
                {"id": session_id},
            ).fetchone()
        return row.transcript if row and row.transcript else []

    def _update_session_status(self, session_id: str, status: str, scores: Dict[str, Any]) -> None:
        """Update session status and scores."""
        with engine.begin() as conn:
            conn.execute(
                text("UPDATE interview_sessions SET status = :s, scores = :sc, updated_at = NOW() WHERE id = :id"),
                {"id": session_id, "s": status, "sc": json.dumps(scores)},
            )


# Process-wide singleton
interview_agent: Optional[InterviewAgent] = None
