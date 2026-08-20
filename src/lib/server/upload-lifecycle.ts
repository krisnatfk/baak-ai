/** Jalankan cleanup setelah commit tanpa membatalkan mutation yang sudah sukses. */
export async function runBestEffortPostCommitCleanup(
  cleanup: () => Promise<void>,
  onFailure: (error: unknown) => void,
): Promise<void> {
  try {
    await cleanup();
  } catch (error) {
    onFailure(error);
  }
}
