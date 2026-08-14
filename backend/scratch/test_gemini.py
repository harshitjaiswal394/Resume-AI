import os
from dotenv import load_dotenv
import google.generativeai as genai

load_dotenv()
api_key = os.getenv("GEMINI_API_KEY") or os.getenv("NEXT_PUBLIC_GEMINI_API_KEY")
print(f"Loaded GEMINI_API_KEY: {'[FOUND]' if api_key else '[MISSING]'}")

genai.configure(api_key=api_key)
model = genai.GenerativeModel('gemini-1.5-pro-latest')
try:
    print("Attempting to generate content...")
    response = model.generate_content("Hello, write a 3-word response.")
    print("Response:")
    print(response.text)
except Exception as e:
    print(f"Error occurred: {e}")
