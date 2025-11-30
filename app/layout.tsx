import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Online File Transfer - Secure Direct Sharing",
  description: "Share files directly between devices with end-to-end encryption. No server storage, just pure peer-to-peer transfer through WebRTC.",
  keywords: ["file transfer", "p2p", "webrtc", "secure sharing", "direct transfer"],
  openGraph: {
    title: "Online File Transfer",
    description: "Secure, direct file sharing through your browser",
    type: "website",
  },
  other: {
    "google-site-verification": "mYZshk3WyxKBfUCgal7yuE_7LTnphJykPABI-3lOI24"
  }
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.className} antialiased`}>
        {children}
      </body>
    </html>
  );
}