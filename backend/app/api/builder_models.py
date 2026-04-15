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

class ResumeCreateRequest(BaseModel):
    title: str = "My Resume"
    target_role: Optional[str] = "Software Engineer"
    years_of_experience: Optional[int] = 0
    summary: Optional[str] = ""
    skills: List[str] = []
    experience: List[ExperienceItem] = []
    education: List[EducationItem] = []
    projects: List[ProjectItem] = []
    template_id: Optional[str] = "modern"

class ResumeUpdateRequest(BaseModel):
    title: Optional[str] = None
    summary: Optional[str] = None
    skills: Optional[List[str]] = None
    experience: Optional[List[ExperienceItem]] = None
    education: Optional[List[EducationItem]] = None
    projects: Optional[List[ProjectItem]] = None
    template_id: Optional[str] = None

class OptimizeExperienceRequest(BaseModel):
    experience: ExperienceItem
    target_role: str
    years_of_experience: int
