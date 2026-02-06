import "./globals.css";

export const metadata = {
  title: "classmate",
  description: "無作為に選ばれた人たちと、同じ時間を過ごすための場所。",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
