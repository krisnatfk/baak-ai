# AI PMB — Integrasi n8n

n8n yang sedang berjalan **tidak diubah strukturnya**. Kita hanya menambahkan satu
node HTTP Request yang memanggil endpoint AI PMB, lalu memanfaatkan responsnya
sebagai konteks untuk AI Agent / Local LLM yang sudah ada.

## Prasyarat

- Aplikasi AI PMB berjalan (dev `localhost:3001` / Docker `http://localhost:3010`).
- `INTERNAL_API_KEY` sudah diset di `.env` aplikasi.
- (Opsional) Embedding model lokal aktif — lihat `docs/RAG.md`.

## Flow target

```text
WAHA Trigger (pesan masuk)
     ↓
HTTP Request → POST /api/rag/context
     ↓
IF found == true?
   /              \
  YES              NO
   ↓                ↓
AI Agent       AI Agent dengan instruksi
   ↓               "tidak ada knowledge resmi;
Local LLM          sarankan human/unknown"  (+ handoff)
   ↓                ↓
WAHA Send Text ←───┘
```

## Contoh konfigurasi node HTTP Request di n8n

**Method:** `POST`
**URL:** `http://localhost:3010/api/rag/context` (ganti host sesuai deploy)

**Headers:**
```json
{
  "Authorization": "Bearer ${INTERNAL_API_KEY}",
  "Content-Type": "application/json"
}
```

> Ganti `${INTERNAL_API_KEY}` dengan nilai env AI PMB (jangan hardcode di workflow bila memungkinkan; simpan sebagai n8n credential "Header Auth").

**Body (JSON):**
```json
{
  "message": "{{ $json.message }}",
  "sessionId": "{{ $json.sessionId }}",
  "sender": "{{ $json.sender }}"
}
```

Sesuaikan field dengan nama field dari node WAHA Trigger (mis. `body.message`).

## Contoh Request / Response

### Request
```json
{
  "message": "Kak cara ambil PKL gimana?",
  "sessionId": "wa-session-123",
  "sender": "6281234567890"
}
```

### Response — ditemukan
```json
{
  "success": true,
  "found": true,
  "confidence": "HIGH",
  "score": 0.91,
  "context": "Gunakan hanya informasi resmi berikut ...\n\n=== KNOWLEDGE BASE ===\n\nKategori:\nPKL\n\nPertanyaan resmi:\nBagaimana cara mendaftar PKL?\n\nInformasi:\n<jawaban resmi>\n\nSumber:\nBuku Pedoman Akademik 2026\n\n=== END KNOWLEDGE BASE ===",
  "sources": [
    { "title": "Bagaimana cara mendaftar PKL?", "source": "Buku Pedoman Akademik 2026" }
  ]
}
```

### Response — tidak ditemukan
```json
{
  "success": true,
  "found": false,
  "confidence": "LOW",
  "score": 0.31,
  "requiresHuman": true,
  "message": "Pertanyaan disimpan sebagai pertanyaan tidak terjawab."
}
```

## Alur penggabungan context ke AI Agent

n8n **IF node** setelah HTTP Request:

- `found == true` → kirim ke AI Agent dengan prompt:
  ```
  Sistem Prompt (existing) + 
  [Kontek dari AI PMB]
  {{ $json.context }}
  ```
- `found == false` → AI Agent menjawab dengan template:
  ```
  Maaf, saya belum memiliki informasi resmi tentang itu.
  Saya akan teruskan ke admin BAAK ya. 🙏
  ```
  dan (opsional) panggil `POST /api/rag/context` sudah otomatis menyimpan
  unanswered question → admin melihatnya di dashboard.

> **Penting:** Jangan masukkan seluruh FAQ ke System Prompt. Konteks diambil per-pertanyaan dari API.

## Alternatif: `POST /api/rag/search`

Jika ingin hasil mentah (list top-K) di n8n untuk diproses sendiri:

```json
{ "query": "min kalau mau PKL gimana?", "limit": 3 }
```

```json
{
  "success": true,
  "query": "min kalau mau PKL gimana?",
  "results": [
    { "id": "...", "type": "FAQ", "question": "...", "answer": "...",
      "category": "PKL", "source": "Buku Pedoman Akademik 2026", "score": 0.91 },
    { "id": "...", "type": "CHUNK", "answer": "… potongan isi dokumen …",
      "source": "Pedoman PKL 2026.pdf", "url": null, "score": 0.74 }
  ]
}
```

Hasil bertipe `CHUNK` berasal dari **dokumen** yang diunggah lewat menu
Knowledge Base → **Dokumen** (PDF / DOCX / TXT). Kedua tipe dicampur dan
diurutkan berdasarkan skor similarity; prompt konteks (dari
`/api/rag/context`) sudah menandai sumber `[Dokumen]` vs `[FAQ]` agar LLM
tahu asal informasi.

## Catatan sesi / chat memory

Kirim `sessionId` (mis. kombinasi nomor WA + tanggal) agar aplikasi mencatat
riwayat percakapan (`chat_sessions` / `chat_messages`). Ini **conversation memory**
— tidak mempengaruhi hasil RAG.
