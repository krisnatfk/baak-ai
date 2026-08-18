import { AppSidebar } from "@/components/layout/app-sidebar";
import { requireUser } from "@/lib/guards";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";

// Seluruh segmen admin bersifat dinamis (auth + data server). Tanpa ini,
// `next build` mencoba merender layout ini (requireUser → getAuthOptions →
// getAuthSecret) saat pengumpulan page data dan gagal bila AUTH_SECRET
// belum tersedia (build stage tanpa .env).
export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();

  return (
    <SidebarProvider>
      <TooltipProvider delayDuration={0}>
        <AppSidebar roleKey={user.roleKey} name={user.name} email={user.email} />
        <SidebarInset>
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b bg-card px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbPage>BAAK AI</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </header>
        <main className="flex flex-1 flex-col gap-4 p-4 md:p-6">
          {children}
        </main>
        </SidebarInset>
      </TooltipProvider>
    </SidebarProvider>
  );
}
