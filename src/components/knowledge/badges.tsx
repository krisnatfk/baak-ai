import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Status FAQ
// ---------------------------------------------------------------------------

export const KNOWLEDGE_STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draf",
  ACTIVE: "Aktif",
  INACTIVE: "Nonaktif",
  NEEDS_REVIEW: "Perlu Review",
};

const STATUS_STYLES: Record<string, string> = {
  DRAFT: "bg-secondary text-secondary-foreground",
  ACTIVE: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  INACTIVE: "bg-muted text-muted-foreground",
  NEEDS_REVIEW: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
};

export function KnowledgeStatusBadge({ status }: { status: string }) {
  return (
    <Badge className={cn("border-transparent", STATUS_STYLES[status] ?? "bg-muted text-muted-foreground")}>
      {KNOWLEDGE_STATUS_LABEL[status] ?? status}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Status embedding
// ---------------------------------------------------------------------------

export const EMBEDDING_STATUS_LABEL: Record<string, string> = {
  PENDING: "Pending",
  COMPLETED: "Ter-embed",
  FAILED: "Gagal",
};

const EMBEDDING_STYLES: Record<string, string> = {
  PENDING: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  COMPLETED: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  FAILED: "bg-destructive/10 text-destructive",
};

export function EmbeddingStatusBadge({
  status,
  error,
}: {
  status: string;
  error?: string | null;
}) {
  return (
    <Badge
      title={error ?? undefined}
      className={cn(
        "cursor-help border-transparent",
        EMBEDDING_STYLES[status] ?? "bg-muted text-muted-foreground",
      )}
    >
      {EMBEDDING_STATUS_LABEL[status] ?? status}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Label sederhana lain
// ---------------------------------------------------------------------------

export const AUDIENCE_LABEL: Record<string, string> = {
  MAHASISWA: "Mahasiswa",
  CALON_MAHASISWA: "Calon Mahasiswa",
  ALUMNI: "Alumni",
  ORANG_TUA: "Orang Tua",
  UMUM: "Umum",
};

export const SOURCE_TYPE_LABEL: Record<string, string> = {
  MANUAL: "Manual",
  URL: "URL",
  PDF: "PDF",
  DOCX: "DOCX",
  TXT: "TXT",
};

// ---------------------------------------------------------------------------
// Pertanyaan tidak terjawab
// ---------------------------------------------------------------------------

export const UNANSWERED_STATUS_LABEL: Record<string, string> = {
  NEW: "Baru",
  REVIEWED: "Ditinjau",
  ANSWERED: "Sudah Dijawab",
  ADDED_TO_KNOWLEDGE: "Masuk KB",
  IGNORED: "Diabaikan",
};

const UNANSWERED_STYLES: Record<string, string> = {
  NEW: "bg-destructive/10 text-destructive",
  REVIEWED: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  ANSWERED: "bg-sky-500/10 text-sky-700 dark:text-sky-400",
  ADDED_TO_KNOWLEDGE: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  IGNORED: "bg-muted text-muted-foreground",
};

export function UnansweredStatusBadge({ status }: { status: string }) {
  return (
    <Badge
      className={cn(
        "border-transparent",
        UNANSWERED_STYLES[status] ?? "bg-muted text-muted-foreground",
      )}
    >
      {UNANSWERED_STATUS_LABEL[status] ?? status}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Human handoff
// ---------------------------------------------------------------------------

export const HANDOFF_STATUS_LABEL: Record<string, string> = {
  OPEN: "Terbuka",
  ASSIGNED: "Ditugaskan",
  IN_PROGRESS: "Sedang Diproses",
  RESOLVED: "Terselesaikan",
  CLOSED: "Ditutup",
};

const HANDOFF_STYLES: Record<string, string> = {
  OPEN: "bg-destructive/10 text-destructive",
  ASSIGNED: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  IN_PROGRESS: "bg-sky-500/10 text-sky-700 dark:text-sky-400",
  RESOLVED: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  CLOSED: "bg-muted text-muted-foreground",
};

export function HandoffStatusBadge({ status }: { status: string }) {
  return (
    <Badge
      className={cn(
        "border-transparent",
        HANDOFF_STYLES[status] ?? "bg-muted text-muted-foreground",
      )}
    >
      {HANDOFF_STATUS_LABEL[status] ?? status}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Konfidensi RAG
// ---------------------------------------------------------------------------

export const CONFIDENCE_LABEL: Record<string, string> = {
  HIGH: "Tinggi",
  MEDIUM: "Sedang",
  LOW: "Rendah",
};

const CONFIDENCE_STYLES: Record<string, string> = {
  HIGH: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  MEDIUM: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  LOW: "bg-destructive/10 text-destructive",
};

export function ConfidenceBadge({ confidence }: { confidence: string }) {
  return (
    <Badge
      className={cn(
        "border-transparent",
        CONFIDENCE_STYLES[confidence] ?? "bg-muted text-muted-foreground",
      )}
    >
      {CONFIDENCE_LABEL[confidence] ?? confidence}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Status dokumen
// ---------------------------------------------------------------------------

export const DOCUMENT_STATUS_LABEL: Record<string, string> = {
  PENDING: "Menunggu",
  PROCESSING: "Diproses",
  COMPLETED: "Selesai",
  FAILED: "Gagal",
};

const DOCUMENT_STATUS_STYLES: Record<string, string> = {
  PENDING: "bg-muted text-muted-foreground",
  PROCESSING: "bg-sky-500/10 text-sky-700 dark:text-sky-400",
  COMPLETED: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  FAILED: "bg-destructive/10 text-destructive",
};

export function DocumentStatusBadge({
  status,
  error,
}: {
  status: string;
  error?: string | null;
}) {
  return (
    <Badge
      title={error ?? undefined}
      className={cn(
        "cursor-help border-transparent",
        DOCUMENT_STATUS_STYLES[status] ?? "bg-muted text-muted-foreground",
      )}
    >
      {DOCUMENT_STATUS_LABEL[status] ?? status}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Status pengguna
// ---------------------------------------------------------------------------

export const USER_STATUS_LABEL: Record<string, string> = {
  ACTIVE: "Aktif",
  INACTIVE: "Nonaktif",
};

const USER_STATUS_STYLES: Record<string, string> = {
  ACTIVE: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  INACTIVE: "bg-muted text-muted-foreground",
};

export function UserStatusBadge({ status }: { status: string }) {
  return (
    <Badge
      className={cn(
        "border-transparent",
        USER_STATUS_STYLES[status] ?? "bg-muted text-muted-foreground",
      )}
    >
      {USER_STATUS_LABEL[status] ?? status}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Sesi percakapan
// ---------------------------------------------------------------------------

export const CHAT_SESSION_STATUS_LABEL: Record<string, string> = {
  ACTIVE: "Aktif",
  CLOSED: "Ditutup",
  HANDOFF: "Dialihkan",
};

const CHAT_SESSION_STYLES: Record<string, string> = {
  ACTIVE: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  CLOSED: "bg-muted text-muted-foreground",
  HANDOFF: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
};

export function ChatSessionStatusBadge({ status }: { status: string }) {
  return (
    <Badge
      className={cn(
        "border-transparent",
        CHAT_SESSION_STYLES[status] ?? "bg-muted text-muted-foreground",
      )}
    >
      {CHAT_SESSION_STATUS_LABEL[status] ?? status}
    </Badge>
  );
}
