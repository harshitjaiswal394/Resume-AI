"""Tests for the output validator and prompt versioning modules."""

from app.security.config import SecurityConfig
from app.security.models import RiskLevel
from app.security.output_validation import OutputValidator
from app.security.prompt_versioning import PromptVersionStore, checksum


def test_clean_output_is_valid():
    validator = OutputValidator(SecurityConfig(output_validation_enabled=True))
    result = validator.validate("Here is a helpful resume summary.")
    assert result.valid is True
    assert result.findings == []


def test_secret_leak_in_output_is_rejected():
    validator = OutputValidator(SecurityConfig(output_validation_enabled=True))
    result = validator.validate("My Gemini key is AIzaSyD0bNLj3dL7lr6eYQSyDfM0go2Ozwz4dbQ.")
    assert result.valid is False
    assert any(f.severity == RiskLevel.HIGH for f in result.findings)
    assert result.truncated is not None


def test_env_leak_pattern_detected():
    validator = OutputValidator(SecurityConfig(output_validation_enabled=True))
    result = validator.validate("The database url is DATABASE_URL=postgres://user:pass@host/db")
    assert result.valid is False
    assert any(f.rule_id == "out-env-leak" for f in result.findings)


def test_overlong_output_truncated():
    validator = OutputValidator(SecurityConfig(output_validation_enabled=True))
    result = validator.validate("x" * 500, max_length=100)
    assert result.valid is False
    assert len(result.truncated) == 100


def test_schema_validation_required_keys():
    validator = OutputValidator(SecurityConfig(output_validation_enabled=True))
    result = validator.validate('{"title": "Engineer"}', schema={"required": ["title", "company"]})
    # Missing required field -> MEDIUM finding (warning), output still passes.
    schema_findings = [f for f in result.findings if f.rule_id == "out-schema"]
    assert schema_findings
    assert "company" in schema_findings[0].description


def test_validator_disabled_passes_through():
    validator = OutputValidator(SecurityConfig(output_validation_enabled=False))
    result = validator.validate("AIzaSyD0bNLj3dL7lr6eYQSyDfM0go2Ozwz4dbQ")
    assert result.valid is True


def test_prompt_version_checksum_is_stable():
    assert checksum("hello world") == checksum("hello world")
    assert checksum("hello world") != checksum("hello world!")


def test_prompt_versioning_promote_and_rollback():
    store = PromptVersionStore(seed={"default": "you are a career coach"})
    v1 = store.active("default")
    assert v1.version == 1
    assert v1.active is True

    v2 = store.promote("default", "you are a resume expert")
    assert v2.version == 2
    assert store.active("default").version == 2
    assert store.active("default").active is True

    rolled = store.rollback("default", 1)
    assert rolled is not None
    assert store.active("default").version == 1


def test_prompt_version_verify_checksum():
    store = PromptVersionStore(seed={"default": "be helpful"})
    assert store.verify("default") is True
