import RoomClient from "./RoomClient";

export const dynamic = "force-dynamic";

type Props = {
  searchParams?: Promise<{
    classId?: string;
    sessionId?: string;
    session_id?: string;
    session?: string;
    autojoin?: string;
  }>;
};

export default async function RoomPage({ searchParams }: Props) {
  const sp = (await searchParams) ?? {};

  const classId = String(sp.classId ?? "").trim();
  const sessionId =
    String(sp.sessionId ?? "").trim() ||
    String(sp.session_id ?? "").trim() ||
    String(sp.session ?? "").trim();

  const remountKey = classId || sessionId || "room";

  return <RoomClient key={remountKey} />;
}