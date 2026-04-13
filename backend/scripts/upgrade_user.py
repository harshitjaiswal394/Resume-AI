import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db import engine
from sqlalchemy import text

def upgrade_user():
    email = "harshitjaiswal394@gmail.com"
    with engine.begin() as conn:
        conn.execute(
            text("UPDATE users SET plan = 'pro' WHERE email = :email"),
            {"email": email}
        )
        print(f"Successfully upgraded {email} to Pro.")

if __name__ == "__main__":
    upgrade_user()
