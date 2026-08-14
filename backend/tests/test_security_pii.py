"""Tests for the PII detection & masking engine."""

from app.security.models import PIIKind
from app.security.pii import detect_pii, has_sensitive_pii, mask_pii


def test_email_detection_and_masking():
    masked, findings = mask_pii("Reach me at john.doe@example.com soon.")
    assert "[EMAIL]" in masked
    assert any(f.kind == PIIKind.EMAIL for f in findings)
    assert "john.doe@example.com" not in masked


def test_phone_detection():
    findings = detect_pii("Call +91 98765 43210 now.")
    assert any(f.kind == PIIKind.PHONE for f in findings)


def test_valid_aadhaar_with_checksum():
    # 9999 9999 9999 passes the Verhoeff checksum.
    findings = detect_pii("My Aadhaar is 9999 9999 9999.")
    kinds = [f.kind for f in findings]
    assert PIIKind.AADHAAR in kinds
    assert PIIKind.PHONE not in kinds  # must not double-flag


def test_invalid_aadhaar_does_not_false_positive():
    # 2345 6789 0123 fails Verhoeff -> should not be flagged as Aadhaar.
    findings = detect_pii("Number 2345 6789 0123 on file")
    assert all(f.kind != PIIKind.AADHAAR for f in findings)


def test_pan_detection():
    findings = detect_pii("PAN number ABCTY1234D is attached.")
    assert any(f.kind == PIIKind.PAN for f in findings)


def test_credit_card_luhn_and_masking():
    masked, findings = mask_pii("Card: 4111 1111 1111 1111 expires soon.")
    assert "[CARD]" in masked
    assert any(f.kind == PIIKind.CREDIT_CARD for f in findings)


def test_credit_card_rejects_invalid_luhn():
    findings = detect_pii("Card: 4111 1111 1111 1112")  # fails Luhn
    assert all(f.kind != PIIKind.CREDIT_CARD for f in findings)


def test_ssn_detection():
    findings = detect_pii("SSN is 123-45-6789.")
    assert any(f.kind == PIIKind.SSN for f in findings)


def test_sensitive_kind_classification():
    findings = detect_pii("PAN ABCTY1234D")
    assert has_sensitive_pii(findings) is True


def test_no_false_positive_on_plain_text():
    masked, findings = mask_pii("My name is Priya and I live in Bengaluru.")
    assert masked == "My name is Priya and I live in Bengaluru."
    assert findings == []


def test_multiple_kinds_in_one_message():
    masked, findings = mask_pii("Email me at a@b.com. Card 4111 1111 1111 1111.")
    assert "[EMAIL]" in masked
    assert "[CARD]" in masked
    assert any(f.kind == PIIKind.EMAIL for f in findings)
    assert any(f.kind == PIIKind.CREDIT_CARD for f in findings)
