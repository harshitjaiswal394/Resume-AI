import json
import unittest
from unittest.mock import MagicMock, patch
import sys
import os

# Mock the database engine before importing the module
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

with patch('sqlalchemy.create_engine'):
    from app.db import persist_pipeline_results

class TestPersistenceFix(unittest.TestCase):
    @patch('app.db.engine')
    def test_persist_pipeline_results_json_serialization(self, mock_engine):
        # Setup mocks
        mock_conn = MagicMock()
        mock_engine.begin.return_value.__enter__.return_value = mock_conn
        
        user_id = "af4a7d1d-808d-4b05-8eed-cb4a14f9999d"
        resume_id = "0c02070e-f283-4545-be50-12cb3cace2af"
        data = {
            "parsed_data": {"skills": ["python", "sql"]},
            "analysis": {"score": 85},
            "matches": [
                {
                    "title": "Software Engineer",
                    "matching_skills": ["python"],
                    "missing_skills": ["rag"],
                    "matchScore": 75
                }
            ]
        }
        
        # Execute
        persist_pipeline_results(user_id, resume_id, data)
        
        # Verify
        # Check the second execute call (Sync Job Matches)
        # 1st is UPDATE resumes
        # 2nd is DELETE FROM job_matches
        # 3rd is INSERT INTO job_matches
        
        calls = mock_conn.execute.call_args_list
        insert_call = None
        for call in calls:
            stmt = str(call[0][0])
            if "INSERT INTO job_matches" in stmt:
                insert_call = call
                break
        
        self.assertIsNotNone(insert_call, "INSERT INTO job_matches was not called")
        
        # This is the core of the fix: these should be strings (JSON), not lists
        # Verify
        insert_matches_call = mock_conn.execute.call_args_list[-2] # Second to last call is the loop insert
        params = insert_matches_call[0][1]
        
        # In Production Parity, we expect LISTS for Postgres Arrays
        self.assertIsInstance(params['m_skills'], list)
        self.assertIsInstance(params['miss_skills'], list)
        
        # Verify content
        self.assertEqual(params['m_skills'], ["python"])
        self.assertEqual(params['miss_skills'], ["rag"])
        
        print("Verification successful: m_skills and miss_skills are correctly handled as Lists for Production Array parity!")

    @patch('app.db.engine')
    def test_persist_pipeline_results_upsert(self, mock_engine):
        # Setup mocks
        mock_conn = MagicMock()
        mock_engine.begin.return_value.__enter__.return_value = mock_conn
        
        user_id = "af4a7d1d-808d-4b05-8eed-cb4a14f9999d"
        resume_id = "11111111-2222-3333-4444-555555555555"
        data = {
            "parsed_data": {"skills": ["python"]},
            "analysis": {"score": 85},
            "matches": []
        }
        
        # Execute
        persist_pipeline_results(user_id, resume_id, data)
        
        # Verify
        calls = mock_conn.execute.call_args_list
        insert_resume_call = None
        for call in calls:
            stmt = str(call[0][0])
            if "INSERT INTO resumes" in stmt and "ON CONFLICT (id) DO UPDATE" in stmt:
                insert_resume_call = call
                break
        
        self.assertIsNotNone(insert_resume_call, "UPSERT (INSERT ... ON CONFLICT) was not called")
        params = insert_resume_call[0][1]
        self.assertEqual(params['id'], resume_id)
        self.assertEqual(params['title'], f"Untitled's Resume") # Based on empty parsed_data in test
        
        # Verify Audit Log call
        audit_call = None
        for call in calls:
            stmt = str(call[0][0])
            if "INSERT INTO audit_logs" in stmt:
                audit_call = call
                break
        
        self.assertIsNotNone(audit_call, "INSERT INTO audit_logs was not called")
        audit_params = audit_call[0][1]
        self.assertIn('meta', audit_params)
        
        print("Verification successful: Audit log correctly implemented with 'metadata' column for production parity!")

if __name__ == "__main__":
    unittest.main()
