import io
from pypdf import PdfReader
from docx import Document
from typing import Dict, Any
import logging

class ResumeService:
    @staticmethod
    def extract_text(file_content: bytes, filename: str) -> str:
        """
        Extract text from PDF or DOCX file content.
        """
        try:
            if filename.endswith('.pdf'):
                return ResumeService._extract_from_pdf(file_content)
            elif filename.endswith('.docx'):
                return ResumeService._extract_from_docx(file_content)
            else:
                raise ValueError("Unsupported file format. Please upload PDF or DOCX.")
        except Exception as e:
            logging.error(f"Text extraction failed for {filename}: {str(e)}")
            raise

    @staticmethod
    def _extract_from_pdf(content: bytes) -> str:
        reader = PdfReader(io.BytesIO(content))
        text = ""
        for page in reader.pages:
            text += page.extract_text() + "\n"
        return text

    @staticmethod
    def _extract_from_docx(content: bytes) -> str:
        doc = Document(io.BytesIO(content))
        return "\n".join([para.text for para in doc.paragraphs])

resume_service = ResumeService()
