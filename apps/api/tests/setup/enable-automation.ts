import { AutomationSettingModel } from '../../src/modules/time-tracking/models/automation-setting.model.js';

/**
 * Vklopi OSEBNO stikalo avtomatizacije za danega uporabnika.
 *
 * Beleženje časa ima dve stikali: `SCHEDULER_ENABLED` v okolju (namestitev) in to osebno
 * stikalo (modules/time-tracking/models/automation-setting.model.ts), ki je PRIVZETO
 * IZKLOPLJENO — nihče ne dobi klikanja po delodajalčevi strani, ki ga ni izrecno vklopil.
 *
 * Test, ki preverja, da se urnik IZVEDE, mora zato stikalo vklopiti enako, kot bi ga
 * uporabnik. Test, ki preverja, da se NE izvede, ga pusti pri miru.
 */
export async function enableAutomationForUser(userId: unknown): Promise<void> {
  await AutomationSettingModel.findOneAndUpdate(
    { userId },
    { enabled: true, changedAt: new Date() },
    { upsert: true },
  );
}
