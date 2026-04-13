import os
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def execute_vector_search(embedding: list[float], limit: int = 20):
    """
    Perform a vector similarity search using pgvector cosine distance.
    """
    with engine.connect() as conn:
        # Convert list of floats to string format compatible with pgvector: [0.1, 0.2, ...]
        embedding_str = f"[{','.join(map(str, embedding))}]"
        
        query = text("""
            SELECT id, title, company, location, description, skills, salary_range,
                   1 - (embedding <=> CAST(:embedding AS public.vector)) as similarity
            FROM job_postings
            ORDER BY similarity DESC
            LIMIT :limit
        """)
        
        result = conn.execute(query, {
            "embedding": embedding_str, 
            "limit": limit
        })
        
        # Convert Row result to list of dicts
        results = []
        for row in result:
            # Convert row to dict and handle UUID serialization
            job_dict = {}
            for key, value in row._asdict().items():
                if hasattr(value, 'hex'): # Common way to check for UUID or similar objects
                    job_dict[key] = str(value)
                else:
                    job_dict[key] = value
            results.append(job_dict)
            
        return results
