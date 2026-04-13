import os
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()
load_dotenv("../.env")

api_key = os.getenv("GEMINI_API_KEY")
print(f"API Key found: {'Yes' if api_key else 'No'}")

if api_key:
    genai.configure(api_key=api_key)
    try:
        print("Available models:")
        for m in genai.list_models():
            if 'generateContent' in m.supported_generation_methods:
                print(f"- {m.name}")
    except Exception as e:
        print(f"Error listing models: {e}")
else:
    print("Please set GEMINI_API_KEY in your .env file")
