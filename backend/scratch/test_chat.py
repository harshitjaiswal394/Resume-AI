import asyncio
import httpx
import json

async def test_sse_stream():
    url = "http://localhost:8000/api/chat/stream"
    # Placeholder token and conversation ID for demonstration
    headers = {"Authorization": "Bearer YOUR_TEST_TOKEN"}
    payload = {
        "conversation_id": "00000000-0000-0000-0000-000000000000",
        "message": "Hello, this is a test message"
    }
    
    print("Connecting to SSE stream...")
    try:
        async with httpx.AsyncClient() as client:
            async with client.stream("POST", url, headers=headers, json=payload, timeout=30.0) as response:
                if response.status_code != 200:
                    print(f"Failed to connect: {response.status_code}")
                    print(await response.aread())
                    return
                    
                print("Connected! Receiving stream:")
                async for line in response.aiter_lines():
                    if line.startswith("data: "):
                        data = json.loads(line[6:])
                        if "content" in data:
                            print(data["content"], end="", flush=True)
                        elif "done" in data:
                            print("\n\nStream finished successfully.")
                        elif "error" in data:
                            print(f"\nStream error: {data['error']}")
    except Exception as e:
        print(f"Error testing stream: {e}")

if __name__ == "__main__":
    asyncio.run(test_sse_stream())
