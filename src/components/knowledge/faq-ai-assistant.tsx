"use client";

import { useState, useTransition } from "react";
import { Bot, Loader2, Search, Sparkles, Tags } from "lucide-react";
import { toast } from "sonner";
import {
  findSimilarFaqsAction,
  generateFaqKeywordsAction,
  generateQuestionVariationsAction,
  improveFaqAnswerAction,
} from "@/lib/server/actions/faq-assistant";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Candidate { faqId: string; question: string; score: number }

export function FaqAiAssistant({ faqId, question, answer, onUseAnswer, onUseVariations, onUseKeywords, onUseRelated }: {
  faqId?: string;
  question: string;
  answer: string;
  onUseAnswer: (value: string) => void;
  onUseVariations: (values: string[]) => void;
  onUseKeywords: (values: string[]) => void;
  onUseRelated: (values: Candidate[]) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [style, setStyle] = useState<"SINGKAT" | "NORMAL" | "LENGKAP">("NORMAL");
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);

  const improve = () => startTransition(async () => {
    const result = await improveFaqAnswerAction({ answer, style });
    if (!result.ok) { toast.error(result.message); return; }
    setSuggestion(result.suggestion);
  });
  const variations = () => startTransition(async () => {
    const result = await generateQuestionVariationsAction(question);
    if (!result.ok) { toast.error(result.message); return; }
    onUseVariations(result.variations);
    toast.success(`${result.variations.length} variasi ditambahkan sebagai alias.`);
  });
  const keywords = () => startTransition(async () => {
    const result = await generateFaqKeywordsAction({ question, answer });
    if (!result.ok) { toast.error(result.message); return; }
    onUseKeywords(result.keywords);
    toast.success("Keywords AI diterapkan ke form.");
  });
  const similar = (applyRelated: boolean) => startTransition(async () => {
    const result = await findSimilarFaqsAction(question, faqId);
    if (!result.ok) { toast.error(result.message); return; }
    setCandidates(result.candidates);
    if (applyRelated) {
      onUseRelated(result.candidates);
      toast.success(`${result.candidates.length} related questions diterapkan.`);
    } else if (result.candidates.length === 0) toast.success("Tidak ditemukan FAQ yang mirip.");
  });

  return (
    <Card className="border-dashed">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm"><Bot className="size-4" /> AI FAQ Assistant</CardTitle>
        <CardDescription>AI hanya memberi saran; jawaban tidak berubah sebelum admin menyetujuinya.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={style} onValueChange={(value) => setStyle(value as typeof style)}><SelectTrigger className="w-32"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="SINGKAT">Singkat</SelectItem><SelectItem value="NORMAL">Normal</SelectItem><SelectItem value="LENGKAP">Lengkap</SelectItem></SelectContent></Select>
          <Button type="button" variant="outline" size="sm" disabled={pending || answer.trim().length < 3} onClick={improve}><Sparkles className="size-4" /> Perbaiki dengan AI</Button>
          <Button type="button" variant="outline" size="sm" disabled={pending || question.trim().length < 3} onClick={variations}><Sparkles className="size-4" /> Buat Variasi Pertanyaan</Button>
          <Button type="button" variant="outline" size="sm" disabled={pending || question.trim().length < 3 || answer.trim().length < 3} onClick={keywords}><Tags className="size-4" /> Buat Keywords</Button>
          <Button type="button" variant="outline" size="sm" disabled={pending || question.trim().length < 3} onClick={() => similar(true)}><Sparkles className="size-4" /> Buat Related Questions</Button>
          <Button type="button" variant="outline" size="sm" disabled={pending || question.trim().length < 3} onClick={() => similar(false)}><Search className="size-4" /> Cek FAQ Mirip</Button>
          {pending && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
        </div>
        {candidates.length > 0 && (
          <div className="rounded-md border bg-muted/30 p-3 text-sm">
            <p className="mb-2 font-medium">FAQ yang mungkin mirip</p>
            <div className="space-y-2">{candidates.map((item) => <div key={item.faqId} className="flex items-start justify-between gap-3"><span>{item.question}</span><Badge variant={item.score >= 0.75 ? "destructive" : "secondary"}>{(item.score * 100).toFixed(1)}%</Badge></div>)}</div>
            <p className="mt-2 text-xs text-muted-foreground">Warning saja; tidak ada FAQ yang dihapus atau digabung otomatis.</p>
          </div>
        )}
      </CardContent>
      <Dialog open={suggestion !== null} onOpenChange={(open) => !open && setSuggestion(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader><DialogTitle>Preview Perbaikan Jawaban</DialogTitle><DialogDescription>Bandingkan teks asli dan saran AI sebelum menerapkannya.</DialogDescription></DialogHeader>
          <div className="grid gap-4 md:grid-cols-2"><Preview title="Jawaban asli" value={answer} /><Preview title="Saran AI" value={suggestion ?? ""} /></div>
          <DialogFooter><Button type="button" variant="outline" onClick={() => setSuggestion(null)}>Batal</Button><Button type="button" onClick={() => { if (suggestion) onUseAnswer(suggestion); setSuggestion(null); toast.success("Saran diterapkan ke form. Simpan FAQ untuk menyimpan permanen."); }}>Gunakan Jawaban Ini</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function Preview({ title, value }: { title: string; value: string }) {
  return <div className="space-y-2"><p className="text-sm font-medium">{title}</p><div className="min-h-48 whitespace-pre-wrap rounded-md border bg-muted/20 p-3 text-sm">{value}</div></div>;
}
