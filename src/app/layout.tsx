import type { Metadata } from "next";
import { Inter, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

// Inter = substitusi resmi NotionInter (lihat design.md) — dengan tracking
// negatif display yang diatur eksplisit per ukuran di komponen.
const interSans = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "BAAK AI",
    template: "%s · BAAK AI",
  },
  description:
    "Admin & Knowledge Management System untuk chatbot WhatsApp BAAK (Biro Administrasi Akademik dan Kemahasiswaan).",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="id"
      className={`${interSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
