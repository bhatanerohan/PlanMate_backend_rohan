"use client";
import { Space_Grotesk, Noto_Sans } from "next/font/google";
import "./globals.css";
import { SidebarProvider } from "@/lib/SidebarContext";
import { Sidebar } from "@/components/Sidebar";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});

const notoSans = Noto_Sans({
  variable: "--font-noto-sans",
  subsets: ["latin"],
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <title>Drift - Plan Your Journey</title>
        <meta name="description" content="Your personal AI travel curator." />
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
          rel="stylesheet"
        />
      </head>
      <body
        className={`${spaceGrotesk.variable} ${notoSans.variable} antialiased bg-background-light text-text-primary`}
      >
        <SidebarProvider>
          <Sidebar />
          {children}
        </SidebarProvider>
      </body>
    </html>
  );
}
