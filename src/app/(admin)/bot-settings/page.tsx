import { requireUser } from "@/lib/guards";
import { getBotSettings } from "@/lib/server/bot-settings";
import { BotSettingsForm } from "@/components/bot-settings/bot-settings-form";

export const dynamic = "force-dynamic";

export default async function BotSettingsPage() {
  const user = await requireUser();
  const settings = await getBotSettings();
  return (
    <BotSettingsForm
      initialValues={settings}
      canWrite={user.roleKey !== "VIEWER"}
    />
  );
}

