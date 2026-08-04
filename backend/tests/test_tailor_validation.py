"""Tests for LLM-output JSON repair and tailor no-hallucination validation."""

import pytest

from app.agents.resume_tailor import ResumeTailorAgent
from app.services.json_utils import parse_json_response, strip_code_fence

SOURCE = {
    "summary": "DevOps engineer with CI/CD and Kubernetes experience.",
    "skills": ["CI/CD & DevOps", "Containers & K8s", "Languages"],
    "experience": [
        {
            "title": "Senior DevOps Engineer",
            "company": "Persistent Systems",
            "description": [
                "Migrated 40+ CI/CD pipelines from GitLab to GitHub.",
                "Managed Docker and Kubernetes clusters.",
                "Wrote Python automation for ECR lifecycle.",
                "Provisioned infrastructure with Terraform modules.",
            ],
        }
    ],
    "education": [{"degree": "B.Tech", "institution": "Example University"}],
}


def test_parse_json_response_plain():
    assert parse_json_response('{"a": 1}') == {"a": 1}


def test_parse_json_response_fenced():
    assert parse_json_response('```json\n{"a": 1}\n```') == {"a": 1}


def test_parse_json_response_trailing_comma():
    assert parse_json_response('{"a": 1,}') == {"a": 1}


def test_parse_json_response_truncated_brackets():
    assert parse_json_response('{"a": [1, 2,') == {"a": [1, 2]}


def test_parse_json_response_unrecoverable_returns_none():
    assert parse_json_response("just prose here") is None


def test_strip_code_fence_json():
    assert strip_code_fence('prefix ```json\n{"x": 1}\n``` suffix') == '\n{"x": 1}\n'


def test_validation_accepts_verbatim_source_skills():
    tailored = {
        "skills": ["CI/CD & DevOps", "Languages", "Containers & K8s"],
        "experience": [],
    }
    result = ResumeTailorAgent._validate_no_hallucination(SOURCE, tailored)
    assert result["valid"] is True


def test_validation_accepts_skills_grounded_in_experience():
    tailored = {
        "skills": [
            "CI/CD & DevOps",
            "Languages",
            "Containers & K8s",
            "Python automation",
            "Docker, Kubernetes",
        ],
        "experience": [],
    }
    result = ResumeTailorAgent._validate_no_hallucination(SOURCE, tailored)
    assert result["valid"] is True
    assert result["invented_skills"] == []


def test_validation_flags_ungrounded_skill_and_returns_it():
    tailored = {
        "skills": ["CI/CD & DevOps", "Quantum Cryptography", "Terraform on VMs"],
        "experience": [],
    }
    result = ResumeTailorAgent._validate_no_hallucination(SOURCE, tailored)
    assert result["valid"] is False
    assert any(s.startswith("New skills added") for s in result["issues"])
    assert "Quantum Cryptography" in result["invented_skills"]
    # Terraform is grounded (in experience), so it must not be flagged.
    assert "Terraform on VMs" not in result["invented_skills"]


def test_validation_hard_fail_on_invented_company():
    tailored = {
        "skills": ["CI/CD & DevOps"],
        "experience": [{"title": "CTO", "company": "Fake Corp", "bullets": []}],
    }
    result = ResumeTailorAgent._validate_no_hallucination(SOURCE, tailored)
    assert result["valid"] is False
    assert any(s.startswith("New companies") for s in result["issues"])
