export default function YouTubeEmbed({ url }: { url: string }) {
  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ color: "red" }}>DEBUG: {url}</div>

      <iframe
        src="https://www.youtube.com/embed/dQw4w9WgXcQ"
        style={{
          width: "100%",
          height: 300,
          border: "none",
        }}
      />
    </div>
  );
}