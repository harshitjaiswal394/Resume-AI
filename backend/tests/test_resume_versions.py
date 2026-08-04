"""Tests for the tailored-resume DOCX generator and GitHub-style diff."""

import pytest

from app.agents.tools.docx_generator import build_tailored_docx, safe_filename
from app.agents.tools.version_diff import compute_diff


def _source_resume():
    return {
        "summary": "Backend engineer with 5 years of Python experience.",
        "skills": ["Python", "Java", "React", "SQL"],
        "experience": [
            {
                "title": "Senior Software Engineer",
                "company": "Acme Corp",
                "description": [
                    "Built payment APIs with Python.",
                    "Led a team of 4 engineers.",
                    "Deployed services on Kubernetes.",
                ],
            }
        ],
        "education": ["B.Tech Computer Science"],
    }


def _tailored_resume():
    return {
        "fullName": "Jane Doe",
        "contact": "jane@example.com",
        "summary": "Backend engineer with 5 years of Python experience, focused on microservices.",
        "skills": ["Python", "React", "SQL", "Microservices", "Docker"],
        "experience": [
            {
                "title": "Senior Software Engineer",
                "company": "Acme Corp",
                "bullets": [
                    {
                        "text": "Built payment APIs with Python and Docker.",
                        "change_reason": "keyword_match",
                        "original_bullet": "Built payment APIs with Python.",
                    },
                    {"text": "Led a team of 4 engineers.", "change_reason": None},
                    {
                        "text": "Deployed microservices on Kubernetes.",
                        "change_reason": "emphasis",
                        "original_bullet": "Deployed services on Kubernetes.",
                    },
                ],
            }
        ],
        "education": ["B.Tech Computer Science"],
    }


def test_compute_diff_summary_changed():
    diff = compute_diff(_source_resume(), _tailored_resume())
    assert diff["summary"] is not None
    assert "Backend engineer" in diff["summary"]["removed"]
    assert "microservices" in diff["summary"]["added"]


def test_compute_diff_skills_added_removed():
    diff = compute_diff(_source_resume(), _tailored_resume())
    assert "Java" in diff["skills"]["removed"]
    assert "Docker" in diff["skills"]["added"]


def test_compute_diff_bullet_changes():
    diff = compute_diff(_source_resume(), _tailored_resume())
    assert len(diff["experience"]) == 1
    changes = diff["experience"][0]["bullet_changes"]
    # Unchanged bullet should be skipped
    assert len(changes) == 2
    assert all(b["reason"] in ("keyword_match", "emphasis") for b in changes)


def test_compute_diff_identical_resume():
    src = _source_resume()
    tailored = _source_resume()
    tailored["experience"] = [
        {"title": "Senior Software Engineer", "company": "Acme Corp",
         "bullets": [{"text": b, "original_bullet": b} for b in src["experience"][0]["description"]]}
    ]
    diff = compute_diff(src, tailored)
    assert diff["summary"] is None
    assert diff["skills"]["added"] == []
    assert diff["skills"]["removed"] == []
    assert diff["experience"] == []


def test_docx_generation_returns_bytes():
    docx_bytes = build_tailored_docx(_tailored_resume())
    assert isinstance(docx_bytes, bytes)
    assert len(docx_bytes) > 1000
    # DOCX magic header
    assert docx_bytes[:2] == b"PK"


def test_safe_filename():
    assert safe_filename("Jane Doe", 3) == "Jane-Doe-v3.docx"
    assert safe_filename("A/B:C", 1) == "ABC-v1.docx"
    assert safe_filename("", 0) == "tailored-resume.docx"
