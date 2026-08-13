import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Model Council",
  description: "Local-first multi-model Ollama council with arbiter verdicts.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
