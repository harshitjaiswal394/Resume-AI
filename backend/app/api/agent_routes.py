from fastapi import APIRouter, HTTPException

from app.services.agent_registry import agent_registry

router = APIRouter()


@router.get("/agents")
def list_agents():
    return {
        "agents": [
            {
                "name": agent.name,
                "label": agent.label,
                "description": agent.description,
                "preferred_provider": agent.preferred_provider,
                "tools": agent.tool_names,
            }
            for agent in agent_registry.list()
        ]
    }


@router.post("/agents/{name}/invoke")
def invoke_agent(name: str, payload: dict):
    try:
        agent = agent_registry.get(name)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Agent not found") from exc

    return {
        "status": "ok",
        "agent": agent.name,
        "label": agent.label,
        "preferred_provider": agent.preferred_provider,
        "tools": agent.tool_names,
        "payload": payload,
    }
