"use client";

import { useState, useTransition } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  createUserSchema,
  updateUserSchema,
  type CreateUserFormInput,
  type UpdateUserFormInput,
  type UserStatusValue,
} from "@/lib/users-schema";
import { createUser, updateUser } from "@/lib/server/actions/users";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { USER_STATUS_LABEL } from "@/components/knowledge/badges";

export interface RoleOption {
  id: string;
  key: string;
  name: string;
}

export interface UserRow {
  id: string;
  name: string;
  email: string;
  roleId: string;
  roleKey: string;
  roleName: string;
  status: UserStatusValue;
  lastLoginAt: string | null;
}

// ---------------------------------------------------------------------------
// Buat pengguna
// ---------------------------------------------------------------------------

interface CreateUserDialogProps {
  roles: RoleOption[];
  trigger: React.ReactNode;
}

/** Dialog tambah pengguna (SUPER_ADMIN). */
export function CreateUserDialog({ roles, trigger }: CreateUserDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateUserFormInput>({
    resolver: zodResolver(createUserSchema),
    defaultValues: { name: "", email: "", roleId: "", password: "" },
  });

  function onSubmit(values: CreateUserFormInput) {
    startTransition(async () => {
      const res = await createUser(values);
      if (res.ok) {
        toast.success(res.message);
        setOpen(false);
        router.refresh();
      } else {
        toast.error(res.message);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Tambah Pengguna</DialogTitle>
          <DialogDescription>
            Buat akun untuk tim PMB. Pengguna baru langsung aktif dan dapat
            masuk dengan password yang dibuatkan.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="user-name">Nama</Label>
            <Input
              id="user-name"
              placeholder="Contoh: Siti Aminah"
              aria-invalid={!!errors.name}
              {...register("name")}
            />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="user-email">Email</Label>
            <Input
              id="user-email"
              type="email"
              placeholder="nama@pmb.ac.id"
              autoComplete="off"
              aria-invalid={!!errors.email}
              {...register("email")}
            />
            {errors.email && (
              <p className="text-sm text-destructive">{errors.email.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="user-role">Peran</Label>
            <Controller
              control={control}
              name="roleId"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="user-role">
                    <SelectValue placeholder="Pilih peran…" />
                  </SelectTrigger>
                  <SelectContent>
                    {roles.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.roleId && (
              <p className="text-sm text-destructive">{errors.roleId.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="user-password">Password</Label>
            <Input
              id="user-password"
              type="password"
              placeholder="Minimal 8 karakter"
              autoComplete="new-password"
              aria-invalid={!!errors.password}
              {...register("password")}
            />
            {errors.password && (
              <p className="text-sm text-destructive">
                {errors.password.message}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => setOpen(false)}
            >
              Batal
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="size-4 animate-spin" />}
              Simpan Pengguna
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Edit pengguna
// ---------------------------------------------------------------------------

interface EditUserDialogProps {
  user: UserRow;
  roles: RoleOption[];
  /** Baris milik akun yang sedang masuk — peran & status dikunci. */
  isSelf: boolean;
  trigger: React.ReactNode;
}

/** Dialog edit pengguna — password dikosongkan agar tidak berubah. */
export function EditUserDialog({
  user,
  roles,
  isSelf,
  trigger,
}: EditUserDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<UpdateUserFormInput>({
    resolver: zodResolver(updateUserSchema),
    defaultValues: {
      name: user.name,
      email: user.email,
      roleId: user.roleId,
      status: user.status,
      password: "",
    },
  });

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      reset({
        name: user.name,
        email: user.email,
        roleId: user.roleId,
        status: user.status,
        password: "",
      });
    }
  }

  function onSubmit(values: UpdateUserFormInput) {
    startTransition(async () => {
      const res = await updateUser(user.id, values);
      if (res.ok) {
        toast.success(res.message);
        setOpen(false);
        router.refresh();
      } else {
        toast.error(res.message);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Pengguna</DialogTitle>
          <DialogDescription>
            Perbarui data akun. Kosongkan password untuk tetap mempertahankan
            password lama.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-user-name">Nama</Label>
            <Input
              id="edit-user-name"
              aria-invalid={!!errors.name}
              {...register("name")}
            />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-user-email">Email</Label>
            <Input
              id="edit-user-email"
              type="email"
              autoComplete="off"
              aria-invalid={!!errors.email}
              {...register("email")}
            />
            {errors.email && (
              <p className="text-sm text-destructive">{errors.email.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-user-role">Peran</Label>
            <Controller
              control={control}
              name="roleId"
              render={({ field }) => (
                <Select
                  value={field.value}
                  onValueChange={field.onChange}
                  disabled={isSelf}
                >
                  <SelectTrigger id="edit-user-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {roles.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {isSelf && (
              <p className="text-xs text-muted-foreground">
                Peran akun sendiri tidak dapat diubah.
              </p>
            )}
            {errors.roleId && (
              <p className="text-sm text-destructive">{errors.roleId.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-user-status">Status</Label>
            <Controller
              control={control}
              name="status"
              render={({ field }) => (
                <Select
                  value={field.value}
                  onValueChange={field.onChange}
                  disabled={isSelf}
                >
                  <SelectTrigger id="edit-user-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(USER_STATUS_LABEL) as UserStatusValue[]).map(
                      (k) => (
                        <SelectItem key={k} value={k}>
                          {USER_STATUS_LABEL[k]}
                        </SelectItem>
                      ),
                    )}
                  </SelectContent>
                </Select>
              )}
            />
            {isSelf && (
              <p className="text-xs text-muted-foreground">
                Status akun sendiri tidak dapat diubah.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-user-password">Password baru (opsional)</Label>
            <Input
              id="edit-user-password"
              type="password"
              placeholder="Kosongkan agar tidak berubah"
              autoComplete="new-password"
              aria-invalid={!!errors.password}
              {...register("password")}
            />
            {errors.password && (
              <p className="text-sm text-destructive">
                {errors.password.message}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => setOpen(false)}
            >
              Batal
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="size-4 animate-spin" />}
              Simpan Perubahan
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
