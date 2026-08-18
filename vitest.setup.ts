// Setup vitest: seed env var minimum agar modul server (env/db/schema) bisa
// dimuat di unit test. Nilai ini tidak dipakai oleh fungsi yang diuji;
// diperlukan karena beberapa test mengimpor modul yang membaca env saat
// module-eval. NODE_ENV sudah di-set "test" oleh vitest itu sendiri.
process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/baak_ai_test";
process.env.AUTH_SECRET ??= "unit-test-secret-unit-test-secret-1234";
process.env.INTERNAL_API_KEY ??= "unit-test-internal-key-unit-test-1234";
