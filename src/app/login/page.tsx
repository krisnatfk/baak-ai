import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = {
  title: "Masuk",
};

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-canvas-soft to-muted/70 p-4">
      <Suspense fallback={<div className="h-96" />}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
