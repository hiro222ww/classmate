"use client";

export function DevMultiClient() {
  const devUsers = ["1", "2", "3"];

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gap: 12,
        height: "100vh",
        padding: 12,
        background: "#f3f4f6",
      }}
    >
      {devUsers.map((dev) => (
        <iframe
          key={dev}
          src={`/class/select?dev=${dev}`}
          style={{
            width: "100%",
            height: "100%",
            border: "1px solid #ccc",
            borderRadius: 12,
            background: "#fff",
          }}
        />
      ))}
    </div>
  );
}