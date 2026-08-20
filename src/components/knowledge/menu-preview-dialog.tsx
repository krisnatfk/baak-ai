"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { List, Loader2 } from "lucide-react";
import { getMenuPreviewAction } from "@/lib/server/actions/knowledge";

export function MenuPreviewDialog() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [menu, setMenu] = useState<{ menu: Array<{ id: string, question: string, menuOrder: number | null }> } | null>(null);

  async function handleOpen(isOpen: boolean) {
    setOpen(isOpen);
    if (isOpen && !menu) {
      setLoading(true);
      try {
        const data = await getMenuPreviewAction();
        setMenu(data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <List className="size-4 mr-2" /> Preview Menu WA
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Preview Menu WhatsApp (Kategori PMB)</DialogTitle>
        </DialogHeader>
        
        {loading ? (
          <div className="flex items-center justify-center p-8">
            <Loader2 className="size-8 animate-spin text-muted-foreground" />
          </div>
        ) : (menu && menu.menu && menu.menu.length > 0) ? (
          <div className="space-y-4 mt-4">
            {menu.menu.map((item) => (
              <div key={item.id} className="border rounded-md p-4 bg-muted/30">
                <div className="font-semibold text-sm mb-1">
                  {item.menuOrder}. {item.question}
                </div>
                <div className="text-xs text-muted-foreground">
                  Status: ACTIVE | ID: {item.id}
                </div>
              </div>
            ))}
            <div className="text-xs text-muted-foreground mt-4 border-t pt-2">
              <span className="font-semibold">Catatan:</span> Yang akan tampil di WhatsApp hanya list pertanyaannya saja sebagai interactive menu.
            </div>
          </div>
        ) : (
          <div className="text-sm text-muted-foreground text-center p-8">
            Tidak ada FAQ PMB yang ditandai sebagai Menu Utama (status ACTIVE).
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
