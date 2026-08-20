"use client";

import { useState, useTransition } from "react";
import { Loader2, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { BotSettingsInput } from "@/lib/bot-settings-schema";
import { updateBotSettings } from "@/lib/server/actions/bot-settings";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

type Values = BotSettingsInput;

export function BotSettingsForm({
  initialValues,
  canWrite,
}: {
  initialValues: Values;
  canWrite: boolean;
}) {
  const [values, setValues] = useState(initialValues);
  const [pending, startTransition] = useTransition();
  const set = <K extends keyof Values>(key: K, value: Values[K]) =>
    setValues((current) => ({ ...current, [key]: value }));

  function save() {
    startTransition(async () => {
      const result = await updateBotSettings(values);
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
    });
  }

  function addRule() {
    set("rules", [
      ...values.rules,
      { type: "GREETING", phrase: "", reply: "", isActive: true },
    ]);
  }

  function updateRule(index: number, patch: Partial<Values["rules"][number]>) {
    set(
      "rules",
      values.rules.map((rule, current) =>
        current === index ? { ...rule, ...patch } : rule,
      ),
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Pengaturan Bot PMB</h1>
          <p className="text-sm text-muted-foreground">
            Control center greeting, menu, fallback, similarity, status, dan handoff WhatsApp.
          </p>
        </div>
        <Button onClick={save} disabled={!canWrite || pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          Simpan Pengaturan
        </Button>
      </div>

      <Tabs defaultValue="identity">
        <TabsList className="h-auto flex-wrap justify-start">
          <TabsTrigger value="identity">Identitas & Welcome</TabsTrigger>
          <TabsTrigger value="rules">Greeting & Noise</TabsTrigger>
          <TabsTrigger value="menu">Menu</TabsTrigger>
          <TabsTrigger value="similarity">Similarity & Fallback</TabsTrigger>
          <TabsTrigger value="status">Status & Handoff</TabsTrigger>
        </TabsList>

        <TabsContent value="identity" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Identitas Bot</CardTitle><CardDescription>Nama yang dipakai pada respons PMB.</CardDescription></CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-3">
              <TextField label="Nama bot" value={values.botName} onChange={(v) => set("botName", v)} />
              <TextField label="Nama institusi" value={values.institutionName} onChange={(v) => set("institutionName", v)} />
              <TextField label="Sapaan pengguna" value={values.userCallName} onChange={(v) => set("userCallName", v)} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Welcome</CardTitle><CardDescription>Teks ini langsung dipakai oleh POST /api/bot/resolve.</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              <Toggle label="Aktifkan welcome" checked={values.welcomeEnabled} onChange={(v) => set("welcomeEnabled", v)} />
              <TextAreaField label="Pembuka" value={values.welcomeIntro} onChange={(v) => set("welcomeIntro", v)} rows={6} />
              <TextAreaField label="Penutup" value={values.welcomeClosing} onChange={(v) => set("welcomeClosing", v)} rows={3} />
              <div className="grid gap-3 md:grid-cols-2">
                <Toggle label="Sertakan menu" checked={values.includeMenu} onChange={(v) => set("includeMenu", v)} />
                <Toggle label="Aktifkan emoji" checked={values.emojiEnabled} onChange={(v) => set("emojiEnabled", v)} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="rules" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Smart Greeting Recognition</CardTitle><CardDescription>Rule greeting digunakan sebagai contoh utama. Smart recognition dapat mengenali variasi seperti &apos;halo kak&apos; atau &apos;assalamualaikum min&apos; secara otomatis.</CardDescription></CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <Toggle label="Aktifkan smart greeting" checked={values.smartGreetingEnabled} onChange={(v) => set("smartGreetingEnabled", v)} />
              <Toggle label="Aktifkan fuzzy greeting" checked={values.fuzzyGreetingEnabled} onChange={(v) => set("fuzzyGreetingEnabled", v)} />
              <Toggle label="Aktifkan semantic greeting" checked={values.semanticGreetingEnabled} onChange={(v) => set("semanticGreetingEnabled", v)} />
              <Toggle label="Potong greeting dari pertanyaan" checked={values.stripGreetingFromQuestion} onChange={(v) => set("stripGreetingFromQuestion", v)} />
              <DecimalField label="Greeting similarity threshold" value={values.greetingSimilarityThreshold} onChange={(v) => set("greetingSimilarityThreshold", v)} />
              <TextField label="Modifier greeting (pisahkan dengan koma)" value={values.greetingModifiers} onChange={(v) => set("greetingModifiers", v)} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex-row items-center justify-between gap-3">
              <div><CardTitle>Greeting & Noise</CardTitle><CardDescription>Exact deterministic rules; pertanyaan pendek valid tetap menjadi QUESTION.</CardDescription></div>
              <Button type="button" variant="outline" onClick={addRule} disabled={!canWrite}><Plus className="size-4" /> Tambah Rule</Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {values.rules.map((rule, index) => (
                <div key={rule.id ?? index} className="grid gap-2 rounded-md border p-3 md:grid-cols-[150px_1fr_1.5fr_auto_auto]">
                  <Select value={rule.type} onValueChange={(v) => updateRule(index, { type: v as "GREETING" | "NOISE" })}>
                    <SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="GREETING">Greeting</SelectItem><SelectItem value="NOISE">Noise</SelectItem></SelectContent>
                  </Select>
                  <Input aria-label="Phrase" placeholder="halo" value={rule.phrase} onChange={(e) => updateRule(index, { phrase: e.target.value })} />
                  <Input aria-label="Balasan khusus" placeholder="Balasan khusus (opsional)" value={rule.reply} onChange={(e) => updateRule(index, { reply: e.target.value })} />
                  <Switch aria-label="Rule aktif" checked={rule.isActive} onCheckedChange={(v) => updateRule(index, { isActive: v })} />
                  <Button type="button" variant="ghost" size="icon" aria-label="Hapus rule" onClick={() => set("rules", values.rules.filter((_, i) => i !== index))}><Trash2 className="size-4 text-destructive" /></Button>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="menu">
          <Card>
            <CardHeader><CardTitle>Menu Utama PMB</CardTitle><CardDescription>Manual memakai pin admin, popular memakai retrieval, hybrid menggabungkan keduanya.</CardDescription></CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2"><Label>Mode menu</Label><Select value={values.menuMode} onValueChange={(v) => set("menuMode", v as Values["menuMode"])}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="MANUAL">Manual</SelectItem><SelectItem value="POPULAR">Popular</SelectItem><SelectItem value="HYBRID">Hybrid</SelectItem></SelectContent></Select></div>
              <NumberField label="Batas item menu" value={values.menuLimit} min={1} max={30} onChange={(v) => set("menuLimit", v)} />
              <NumberField label="Periode popular (hari)" value={values.popularPeriodDays} min={1} max={365} onChange={(v) => set("popularPeriodDays", v)} />
              <TextField label="Item terakhir opsional" value={values.menuFinalLabel} onChange={(v) => set("menuFinalLabel", v)} placeholder="Informasi PMB lainnya" />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="similarity" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Similarity</CardTitle><CardDescription>Threshold dinamis untuk RAG dan semantic suggestions.</CardDescription></CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <Toggle label="Aktifkan similarity" checked={values.similarityEnabled} onChange={(v) => set("similarityEnabled", v)} />
              <Toggle label="Aktifkan suggestions" checked={values.similaritySuggestionEnabled} onChange={(v) => set("similaritySuggestionEnabled", v)} />
              <DecimalField label="Threshold HIGH" value={values.similarityHigh} onChange={(v) => set("similarityHigh", v)} />
              <DecimalField label="Threshold MEDIUM" value={values.similarityMedium} onChange={(v) => set("similarityMedium", v)} />
              <NumberField label="Maksimum suggestions" value={values.similarityMaxSuggestions} min={0} max={10} onChange={(v) => set("similarityMaxSuggestions", v)} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Fallback</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <TextAreaField label="Pesan tidak ditemukan" value={values.notFoundMessage} onChange={(v) => set("notFoundMessage", v)} rows={5} />
              <div className="grid gap-3 md:grid-cols-2"><Toggle label="Suggestions saat tidak ditemukan" checked={values.showSuggestionsOnNotFound} onChange={(v) => set("showSuggestionsOnNotFound", v)} /><Toggle label="Menu saat tidak ditemukan" checked={values.showMenuOnNotFound} onChange={(v) => set("showMenuOnNotFound", v)} /></div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="status" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Status & Gaya Jawaban</CardTitle></CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2"><Label>Status bot</Label><Select value={values.status} onValueChange={(v) => set("status", v as Values["status"])}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ACTIVE">Active</SelectItem><SelectItem value="MAINTENANCE">Maintenance</SelectItem><SelectItem value="LIMITED">Limited</SelectItem></SelectContent></Select></div>
              <div className="space-y-2"><Label>Gaya jawaban</Label><Select value={values.answerStyle} onValueChange={(v) => set("answerStyle", v as Values["answerStyle"])}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="SINGKAT">Singkat</SelectItem><SelectItem value="NORMAL">Normal</SelectItem><SelectItem value="LENGKAP">Lengkap</SelectItem></SelectContent></Select></div>
              <div className="md:col-span-2"><TextAreaField label="Pesan maintenance" value={values.maintenanceMessage} onChange={(v) => set("maintenanceMessage", v)} rows={4} /></div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Human Handoff</CardTitle><CardDescription>Metadata saja; tidak menjalankan agent manusia otomatis.</CardDescription></CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <Toggle label="Aktifkan human handoff" checked={values.humanHandoffEnabled} onChange={(v) => set("humanHandoffEnabled", v)} />
              <NumberField label="Setelah unanswered" value={values.humanHandoffAfterUnanswered} min={1} max={100} onChange={(v) => set("humanHandoffAfterUnanswered", v)} />
              <TextField label="Nomor admin" value={values.humanHandoffPhone} onChange={(v) => set("humanHandoffPhone", v)} />
              <TextField label="URL handoff" value={values.humanHandoffUrl} onChange={(v) => set("humanHandoffUrl", v)} />
              <div className="md:col-span-2"><TextAreaField label="Pesan handoff" value={values.humanHandoffMessage} onChange={(v) => set("humanHandoffMessage", v)} rows={4} /></div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function TextField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) { return <div className="space-y-2"><Label>{label}</Label><Input value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} /></div>; }
function TextAreaField({ label, value, onChange, rows }: { label: string; value: string; onChange: (value: string) => void; rows: number }) { return <div className="space-y-2"><Label>{label}</Label><Textarea value={value} rows={rows} onChange={(e) => onChange(e.target.value)} /></div>; }
function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) { return <div className="flex items-center justify-between rounded-md border px-3 py-2"><Label>{label}</Label><Switch checked={checked} onCheckedChange={onChange} /></div>; }
function NumberField({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void }) { return <div className="space-y-2"><Label>{label}</Label><Input type="number" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} /></div>; }
function DecimalField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) { return <div className="space-y-2"><Label>{label}</Label><Input type="number" min={0} max={1} step={0.01} value={value} onChange={(e) => onChange(Number(e.target.value))} /></div>; }
