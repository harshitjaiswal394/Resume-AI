import { RequireAuth } from "@/components/auth/RequireAuth";

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return <RequireAuth>{children}</RequireAuth>;
}
