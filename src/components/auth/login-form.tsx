"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { GraduationCap, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const loginSchema = z.object({
  email: z.string().email("Masukkan alamat email yang valid."),
  password: z.string().min(1, "Password wajib diisi."),
});

type LoginValues = z.infer<typeof loginSchema>;

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/dashboard";
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(values: LoginValues) {
    setError(null);
    const res = await signIn("credentials", {
      email: values.email,
      password: values.password,
      redirect: false,
    });

    if (res?.error) {
      setError("Email atau password salah. Periksa kembali kredensial Anda.");
      return;
    }
    router.replace(callbackUrl);
    router.refresh();
  }

  return (
    <div className="w-full max-w-md overflow-hidden rounded-lg border border-border bg-card shadow-elevated">
      {/* Band malam — satu-satunya "pulau gelap" (design.md hero-band) */}
      <div className="bg-night px-6 py-8 text-center">
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-white/10">
          <GraduationCap className="size-6 text-white" />
        </div>
        <h1 className="font-heading text-xl font-bold tracking-[-0.01em] text-white">
          Masuk ke PMB AI
        </h1>
        <p className="mt-1 text-sm text-white/70">
          Admin & Knowledge Management System
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 p-6" noValidate>
        {error && (
          <Alert variant="destructive">
            <AlertTitle>Gagal masuk</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="admin@pmb.test"
            {...register("email")}
            aria-invalid={!!errors.email}
          />
          {errors.email && (
            <p className="text-sm text-destructive">{errors.email.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            placeholder="••••••••"
            {...register("password")}
            aria-invalid={!!errors.password}
          />
          {errors.password && (
            <p className="text-sm text-destructive">
              {errors.password.message}
            </p>
          )}
        </div>

        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Loader2 className="size-4 animate-spin" /> Memverifikasi…
            </>
          ) : (
            "Masuk"
          )}
        </Button>
      </form>

      <div className="border-t bg-muted/50 px-6 py-4 text-center text-xs text-muted-foreground">
        Akses dibatasi untuk petugas PMB.
      </div>
    </div>
  );
}
