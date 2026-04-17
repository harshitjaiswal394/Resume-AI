import os
import logging
from typing import Optional
from google.cloud import storage
from google.api_core import exceptions
from dotenv import load_dotenv

load_dotenv('backend/.env')

logger = logging.getLogger("resumatch-api.storage")

class GCPStorageService:
    def __init__(self):
        self.project_id = os.getenv("GCP_PROJECT_ID")
        self.bucket_name = os.getenv("GCP_STORAGE_BUCKET")
        self.client = storage.Client(project=self.project_id) if self.project_id else storage.Client()
        
        if not self.bucket_name:
            logger.warning("GCP_STORAGE_BUCKET not found in environment. Storage operations may fail.")

    def upload_file(self, content: bytes, destination_blob_name: str, content_type: str = "application/pdf") -> Optional[str]:
        """Uploads a file to the bucket and returns the public URL."""
        if not self.bucket_name:
            return None
            
        try:
            bucket = self.client.bucket(self.bucket_name)
            blob = bucket.blob(destination_blob_name)
            
            blob.upload_from_string(content, content_type=content_type)
            
            # Construct the public URL (standard GCS format)
            public_url = f"https://storage.googleapis.com/{self.bucket_name}/{destination_blob_name}"
            logger.info(f"Successfully uploaded {destination_blob_name} to {self.bucket_name}")
            return public_url
        except Exception as e:
            logger.error(f"Failed to upload file to GCS: {str(e)}")
            return None

    def delete_file(self, blob_name: str) -> bool:
        """Deletes a blob from the bucket."""
        if not self.bucket_name:
            return False
            
        try:
            bucket = self.client.bucket(self.bucket_name)
            blob = bucket.blob(blob_name)
            blob.delete()
            logger.info(f"Successfully deleted {blob_name} from {self.bucket_name}")
            return True
        except exceptions.NotFound:
            logger.warning(f"File {blob_name} not found in GCS for deletion.")
            return True # Consider it gone
        except Exception as e:
            logger.error(f"Failed to delete file from GCS: {str(e)}")
            return False

    def delete_user_folder(self, user_id: str) -> bool:
        """Deletes all blobs in a folder (user_id prefix)."""
        if not self.bucket_name:
            return False
            
        try:
            bucket = self.client.bucket(self.bucket_name)
            blobs = bucket.list_blobs(prefix=f"resumes/{user_id}/")
            
            for blob in blobs:
                blob.delete()
            
            logger.info(f"Successfully cleared storage for user {user_id}")
            return True
        except Exception as e:
            logger.error(f"Failed to clear user folder in GCS: {str(e)}")
            return False

# Singleton instance
storage_service = GCPStorageService()
