from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional
from datetime import datetime
import uuid

class ExperienceItem(BaseModel):
    title: str
    company: str
    location: Optional[str] = ""
    duration: Optional[str] = ""
    description: List[str] = []

class EducationItem(BaseModel):
    degree: str
    institution: str
    year: Optional[str] = ""
    description: Optional[str] = ""

class SkillItem(BaseModel):
    name: str
    category: Optional[str] = "Technical"

class ProjectItem(BaseModel):
    title: str
    description: str
    link: Optional[str] = ""
    tech_stack: List[str] = []

class CertificationItem(BaseModel):
    name: str
    issuer: str
    year: Optional[str] = ""

class LanguageItem(BaseModel):
    language: str
    proficiency: str # e.g. Native, Professional, Basic

class InternshipItem(BaseModel):
    role: str
    company: str
    duration: Optional[str] = ""
    description: List[str] = []

class AchievementItem(BaseModel):
    title: str
    description: str

class ResumeCreateRequest(BaseModel):
    title: str = "My Resume"
    target_role: Optional[str] = "Software Engineer"
    years_of_experience: Optional[int] = 0
    phone_number: Optional[str] = ""
    summary: Optional[str] = ""
    skills: List[str] = []
    experience: List[ExperienceItem] = []
    education: List[EducationItem] = []
    projects: List[ProjectItem] = []
    certifications: List[CertificationItem] = []
    languages: List[LanguageItem] = []
    internships: List[InternshipItem] = []
    achievements: List[AchievementItem] = []
    section_order: List[str] = ["summary", "skills", "experience", "education", "projects", "certifications", "languages", "achievements", "internships"]
    template_id: Optional[str] = "modern"
    user_id: Optional[str] = "guest"

class ResumeUpdateRequest(BaseModel):
    title: Optional[str] = None
    phone_number: Optional[str] = None
    summary: Optional[str] = None
    skills: Optional[List[str]] = None
    experience: Optional[List[ExperienceItem]] = None
    education: Optional[List[EducationItem]] = None
    projects: Optional[List[ProjectItem]] = None
    certifications: Optional[List[CertificationItem]] = None
    languages: Optional[List[LanguageItem]] = None
    internships: Optional[List[InternshipItem]] = None
    achievements: Optional[List[AchievementItem]] = None
    section_order: Optional[List[str]] = None
    template_id: Optional[str] = None
    user_id: Optional[str] = None

class OptimizeExperienceRequest(BaseModel):
    experience: ExperienceItem
    target_role: str
    years_of_experience: int
